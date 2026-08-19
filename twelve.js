// TWELVE — 칩으로 사는 경매.
//
// 클래식 플립플랩과 카드는 같다(24장, 중앙덱 12장, 손패 6장씩). 다른 것은
// "무엇으로 사느냐" 다. 클래식은 손패 한 장을 배팅 카드로 내고 그 카드가
// 서로 오가지만, 여기서는 각자 20개의 칩으로 값을 부른다.
//
// 그래서 성격이 갈린다 —
//   · 클래식: 강한 카드를 내면 이기지만 그 카드를 상대에게 준다.
//   · 트웰브: 칩은 은행으로 사라진다. 이긴 쪽이 전액, 진 쪽이 절반(반내림).
//     즉 지기만 해도 칩이 녹는다. 언제 물러설지가 곧 실력이다.
//
// 한 턴의 흐름
//   1) 진행자가 중앙덱에서 한 장을 뒤집는다 (공개 카드)
//   2) 진행자가 손패에서 한 장을 더한다 (출품 카드) — 이 둘이 경매품
//   3) 진행자가 오픈 / 클로즈를 고른다
//        오픈  — 값을 보이며 번갈아 올린다. 한 명이 물러설 때까지.
//        클로즈 — 진행자가 짝수 개를 한 번만 부른다. 상대는 거기에 하나를
//                 더 얹어 사거나, 안 사거나. 안 사면 진행자가 가져간다.
//   4) 정산: 이긴 쪽은 부른 값 전부, 진 쪽은 절반(반내림)을 은행에 낸다.
//      경매품 두 장은 모두 이긴 쪽 앞에 깔린다.
//   5) 진행자를 넘기고 다음 턴.
//
// 이기는 법: 앞에 깔린 카드로 세트를 완성하면 그 자리에서 승리
//            (2짜리 2장 · 3짜리 3장 · 4짜리 4장 · 6짜리 6장).
// 칩이 0이 되면 그 경매에서 세트를 완성하지 못한 쪽이 진다.
// 덱이 떨어지면 세트에 가장 가까운 쪽이 이긴다.

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];   // 종류 → 그 종류의 장수
const START_CHIPS = 20;
const HAND = 6;
const CENTER = 12;

// ── 카드 ──────────────────────────────────────────────────────────────────
function initDeck(rnd = Math.random) {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind * 100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;   // 24장
}

// 세트 완성 여부 — 완성한 종류를 돌려준다(없으면 null)
function completedKind(acq) {
  const n = {};
  for (const c of acq) n[c.kind] = (n[c.kind] || 0) + 1;
  for (const [kind] of SPEC) if ((n[kind] || 0) >= kind) return kind;
  return null;
}
// 세트까지 남은 최소 장수 — 작을수록 가깝다
function needLeft(acq) {
  const n = {};
  for (const c of acq) n[c.kind] = (n[c.kind] || 0) + 1;
  let best = Infinity;
  for (const [kind] of SPEC) best = Math.min(best, kind - (n[kind] || 0));
  return best;
}
// 덱이 떨어졌을 때 — 세트에 가까운 쪽이 이긴다. 한 기준에서 안 갈리면 다음으로.
function byProgress(a1, a2) {
  const n1 = needLeft(a1), n2 = needLeft(a2);
  if (n1 !== n2) return n1 < n2 ? 1 : 2;
  if (a1.length !== a2.length) return a1.length > a2.length ? 1 : 2;
  return 0;
}

// ── 판 ────────────────────────────────────────────────────────────────────
function createGame(opt = {}) {
  const rnd = opt.rnd || Math.random;
  const deck = initDeck(rnd);
  return {
    mode: 'twelve',
    center: deck.slice(0, CENTER),         // 중앙덱
    hands: { 1: deck.slice(CENTER, CENTER + HAND), 2: deck.slice(CENTER + HAND, CENTER + HAND * 2) },
    acq: { 1: [], 2: [] },
    chips: { 1: START_CHIPS, 2: START_CHIPS },
    time: { 1: 300, 2: 300 },              // 체스 시계 — 클래식과 같은 각 5분
    bank: 0,                               // 은행이 거둔 칩 (합이 맞는지 보는 눈금)
    turn: 1,
    auctioneer: opt.first === 2 ? 2 : 1,
    phase: 'draw',                         // draw → offer → choose → bid/close → settled
    lot: null,                             // { center, offered, type, bets, turnToAct, closeBet }
    winner: null,
    over: false,
    last: null,                            // 지난 정산 내역 (화면용)
  };
}

const other = (p) => (p === 1 ? 2 : 1);

// 지금 누가 두어야 하는가 — 시계는 이 사람의 것만 줄어든다.
// 정산 화면은 둘 다 보는 자리라 아무 시계도 안 간다.
function activePlayer(g) {
  if (!g || g.over) return null;
  if (g.phase === 'draw' || g.phase === 'offer' || g.phase === 'choose') return g.auctioneer;
  if (g.phase === 'bid' || g.phase === 'close') return g.lot ? g.lot.turnToAct : null;
  return null;
}
// 시간을 다 쓰면 진다
function timeout(g, who) {
  if (g.over) return false;
  return finish(g, other(who), 'time');
}

// 1) 중앙덱 한 장 공개
function draw(g, who) {
  if (g.over || g.phase !== 'draw' || who !== g.auctioneer) return false;
  if (!g.center.length) { endByDeck(g); return true; }
  g.lot = { center: g.center.shift(), offered: null, type: null,
            bets: { 1: 0, 2: 0 }, turnToAct: null, closeBet: 0, folded: null };
  g.phase = 'offer';
  return true;
}

// 2) 손패에서 한 장 출품 (진행자)
function offer(g, who, cardId) {
  if (g.over || g.phase !== 'offer' || who !== g.auctioneer || !g.lot) return false;
  const h = g.hands[who];
  const i = h.findIndex((c) => String(c.id) === String(cardId));
  if (i < 0) return false;
  g.lot.offered = h.splice(i, 1)[0];
  g.phase = 'choose';
  return true;
}

// 3) 경매 방식
// 클로즈는 짝수를 불러야 하므로 최소 2개가 필요하다. 칩이 1개뿐인 진행자가
// 클로즈를 고르면 부를 수 있는 값이 없어 경매가 멈춘다 — 그때는 오픈만 고른다.
function canChoose(g, type) {
  if (type === 'open') return true;
  if (type === 'close') return g.chips[g.auctioneer] >= 2;
  return false;
}
function chooseType(g, who, type) {
  if (g.over || g.phase !== 'choose' || who !== g.auctioneer || !g.lot) return false;
  if (type !== 'open' && type !== 'close') return false;
  if (!canChoose(g, type)) return false;
  g.lot.type = type;
  if (type === 'open') {
    g.phase = 'bid';
    g.lot.turnToAct = g.auctioneer;        // 진행자가 먼저 부른다
  } else {
    g.phase = 'close';
    g.lot.turnToAct = g.auctioneer;        // 진행자가 짝수 개를 부른다
  }
  return true;
}

// ── 오픈 경매 ─────────────────────────────────────────────────────────────
// 번갈아 올린다. 앞사람보다 많이 부르거나, 물러선다.
// 처음 부르는 사람은 1 이상.
function maxRaise(g, who) { return g.chips[who]; }
function minRaise(g, who) {
  const cur = g.lot.bets[other(who)] || 0;
  return Math.max(1, cur + 1);
}
function canRaise(g, who) {
  if (g.over || g.phase !== 'bid' || !g.lot || g.lot.turnToAct !== who) return false;
  return g.chips[who] >= minRaise(g, who);
}
function raise(g, who, amount) {
  if (!canRaise(g, who)) return false;
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < minRaise(g, who) || n > maxRaise(g, who)) return false;
  g.lot.bets[who] = n;
  g.lot.turnToAct = other(who);
  return true;
}
// 물러선다 — 상대가 낙찰
function fold(g, who) {
  if (g.over || g.phase !== 'bid' || !g.lot || g.lot.turnToAct !== who) return false;
  g.lot.folded = who;
  settle(g, other(who));
  return true;
}

// ── 클로즈 경매 ───────────────────────────────────────────────────────────
// 진행자가 짝수 개를 한 번만 부른다. 상대는 하나를 더 얹어 사거나, 안 산다.
function canCloseBet(g, who, n) {
  if (g.over || g.phase !== 'close' || !g.lot || g.lot.turnToAct !== who) return false;
  if (who !== g.auctioneer) return false;
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 2 && v % 2 === 0 && v <= g.chips[who];
}
function closeBet(g, who, n) {
  if (!canCloseBet(g, who, n)) return false;
  const v = Math.floor(Number(n));
  g.lot.closeBet = v;
  g.lot.bets[who] = v;
  g.lot.turnToAct = other(who);
  return true;
}
// 상대가 산다 — 부른 값 + 1.
// 얼마인지는 끝까지 모른 채 결정한다. 그게 이 경매의 전부다.
// 그래서 가진 칩보다 비쌀 수도 있다 — 그때는 가진 것을 전부 낸다(정산에서 깎인다).
function closeTake(g, who) {
  if (g.over || g.phase !== 'close' || !g.lot || g.lot.turnToAct !== who) return false;
  if (who === g.auctioneer || !g.lot.closeBet) return false;
  if (g.chips[who] <= 0) return false;
  g.lot.bets[who] = g.lot.closeBet + 1;
  settle(g, who);
  return true;
}
// 안 산다 — 진행자가 가져간다
function closeDecline(g, who) {
  if (g.over || g.phase !== 'close' || !g.lot || g.lot.turnToAct !== who) return false;
  if (who === g.auctioneer || !g.lot.closeBet) return false;
  g.lot.folded = who;
  settle(g, g.auctioneer);
  return true;
}

// ── 정산 ──────────────────────────────────────────────────────────────────
// 이긴 쪽은 부른 값 전부, 진 쪽은 절반(반내림). 경매품 두 장은 이긴 쪽에게.
function settle(g, winner) {
  const loser = other(winner);
  const wBet = g.lot.bets[winner] || 0;
  const lBet = g.lot.bets[loser] || 0;
  const wPay = Math.min(wBet, g.chips[winner]);
  const lPay = Math.min(Math.floor(lBet / 2), g.chips[loser]);
  g.chips[winner] -= wPay;
  g.chips[loser] -= lPay;
  g.bank += wPay + lPay;

  const prize = [g.lot.center, g.lot.offered].filter(Boolean);
  g.acq[winner].push(...prize);
  g.last = { winner, prize, wBet, lBet, wPay, lPay, type: g.lot.type, folded: g.lot.folded };
  g.lot = null;
  g.phase = 'settled';

  // 세트를 완성했으면 그 자리에서 끝
  const done = completedKind(g.acq[winner]);
  if (done) return finish(g, winner, 'set');

  // 칩이 0 이 된 쪽은 진다 — 이번 경매에서 세트를 못 냈으므로
  for (const p of [1, 2]) {
    if (g.chips[p] <= 0 && !completedKind(g.acq[p])) return finish(g, other(p), 'chips');
  }
  return true;
}

// 다음 턴 — 진행자를 넘긴다
function nextTurn(g) {
  if (g.over || g.phase !== 'settled') return false;
  if (!g.center.length || !g.hands[g.auctioneer].length) { endByDeck(g); return true; }
  g.auctioneer = other(g.auctioneer);
  if (!g.hands[g.auctioneer].length) { endByDeck(g); return true; }
  g.turn++;
  g.phase = 'draw';
  return true;
}

function endByDeck(g) {
  const w = byProgress(g.acq[1], g.acq[2]);
  return finish(g, w, 'deck');
}
function finish(g, winner, why) {
  g.over = true;
  g.winner = winner || 0;
  g.endBy = why;
  g.phase = 'over';
  return true;
}

// ── 화면에 내보낼 상태 ────────────────────────────────────────────────────
// 내 손패만 담는다. 남의 손패는 어떤 경우에도 안 나간다.
// 클로즈에서 진행자가 부른 값은 결과가 날 때까지 상대에게 안 보인다 —
// 값을 보고 사는 게 아니라, 안 보고 하나 더 얹는 것이 이 경매의 전부다.
function viewFor(g, me) {
  const you = other(me);
  const l = g.lot;
  const reveal = !l || g.phase === 'settled' || g.over;
  return {
    mode: 'twelve', me, turn: g.turn, phase: g.phase, auctioneer: g.auctioneer,
    over: g.over, winner: g.winner, endBy: g.endBy || null,
    time: g.time, active: activePlayer(g),
    centerLeft: g.center.length,
    myHand: g.hands[me], oppHandLen: g.hands[you].length,
    myAcq: g.acq[me], oppAcq: g.acq[you],
    chips: { me: g.chips[me], opp: g.chips[you] },
    lot: l ? {
      center: l.center,
      // 클로즈는 출품 카드를 결과 전까지 가린다(클래식과 같은 결)
      offered: (l.type === 'close' && !reveal && me !== g.auctioneer) ? null : l.offered,
      hasOffer: !!l.offered,
      type: l.type,
      turnToAct: l.turnToAct,
      myBet: l.bets[me] || 0,
      // 오픈은 서로 값이 보인다. 클로즈는 진행자가 부른 값을 안 보여준다.
      oppBet: l.type === 'open' ? (l.bets[you] || 0) : null,
      closeBetKnown: l.type === 'close' && me === g.auctioneer ? l.closeBet : null,
      minRaise: (g.phase === 'bid' && l.turnToAct === me) ? minRaise(g, me) : null,
      // 살지 말지 고를 수는 있어도, 얼마인지는 안 알려준다.
      // 값을 알려주면 "부른 값 + 1" 에서 부른 값이 그대로 드러난다.
      canTake: (g.phase === 'close' && l.turnToAct === me && me !== g.auctioneer && g.chips[me] > 0),
      canClose: g.phase === 'choose' && me === g.auctioneer ? canChoose(g, 'close') : null,
    } : null,
    last: g.last,
  };
}


// ── AI ────────────────────────────────────────────────────────────────────
// 이 모드는 "언제 물러설지" 가 전부다. 이긴 쪽은 전액, 진 쪽도 절반을 낸다 —
// 그래서 값어치보다 높게 부르면 이겨도 손해고, 끝까지 따라가다 지면 두 번 손해다.
// 그래서 AI 는 먼저 이 경매품이 나에게 몇 칩짜리인지를 셈하고, 그 선을 넘지 않는다.

// 경매품이 나에게 얼마나 값진가 — 칩 단위로 환산한다.
// 세트를 완성시키거나 상대의 완성을 막는 수는 값을 매기지 않는다(무조건 간다).
function lotWorth(g, me) {
  const you = me === 1 ? 2 : 1;
  const cards = [g.lot.center, g.lot.offered].filter(Boolean);
  const myAfter = needLeft(g.acq[me].concat(cards));
  const opAfter = needLeft(g.acq[you].concat(cards));
  if (myAfter === 0) return Infinity;        // 이걸 먹으면 내가 이긴다
  if (opAfter === 0) return Infinity;        // 뺏기면 상대가 이긴다 — 막아야 한다
  const gain = needLeft(g.acq[me]) - myAfter;    // 내가 몇 걸음 다가가나
  const deny = needLeft(g.acq[you]) - opAfter;   // 상대를 몇 걸음 막나
  // 남은 칩이 적을수록 한 칩이 무겁다. 그래서 값도 가진 칩에 비례해 잡는다.
  const scale = Math.max(2, g.chips[me]) / 10;
  return Math.max(1, Math.round((gain * 3.2 + deny * 1.8) * scale));
}

// 이 판에서 내가 더 낼 수 있는 상한
function ceilingFor(g, me) {
  const w = lotWorth(g, me);
  if (w === Infinity) return g.chips[me];        // 승부수 — 다 건다
  return Math.max(1, Math.min(g.chips[me], w));
}

// AI 가 지금 할 일 하나. 서버가 이걸 받아 그대로 둔다.
// { act:'draw' } | { act:'offer', cardId } | { act:'choose', type }
// | { act:'raise', amount } | { act:'fold' } | { act:'closeBet', amount }
// | { act:'take' } | { act:'decline' } | { act:'next' }
function aiAct(g, me, rnd = Math.random) {
  if (g.over) return null;
  const A = g.auctioneer;
  // 정산은 AI 가 넘기지 않는다. 넘겨 버리면 누가 무엇을 가져갔는지 볼 새도 없이
  // 다음 턴이 시작된다 — "확확 바뀐다" 의 정체가 이것이었다. 넘기는 건 사람 몫.
  if (g.phase === 'settled') return null;
  if (g.phase === 'draw') return me === A ? { act: 'draw' } : null;

  if (g.phase === 'offer') {
    if (me !== A) return null;
    // 내 세트에 가장 덜 쓸모없는 카드를 내놓는다. 상대 세트를 채워 줄 카드는 피한다.
    const you = me === 1 ? 2 : 1;
    const hand = g.hands[me];
    let best = hand[0], bestScore = Infinity;
    for (const c of hand) {
      const mineLoss = needLeft(g.acq[me]) - needLeft(g.acq[me].concat([c]));   // 나에게 쓸모
      const oppHelp = needLeft(g.acq[you]) - needLeft(g.acq[you].concat([c]));  // 상대에게 쓸모
      const score = mineLoss * 2 + oppHelp * 3;   // 낮을수록 내놓기 좋다
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return { act: 'offer', cardId: best.id };
  }

  if (g.phase === 'choose') {
    if (me !== A) return null;
    const worth = lotWorth(g, me);
    // 꼭 갖고 싶으면 클로즈로 조용히 가져간다(출품 카드도 가려진다).
    // 별로면 오픈으로 열어 두고, 상대가 비싸게 부르면 물러선다.
    const wantClose = canChoose(g, 'close') && (worth === Infinity || worth >= 4) && rnd() < 0.72;
    return { act: 'choose', type: wantClose ? 'close' : 'open' };
  }

  if (g.phase === 'bid') {
    if (g.lot.turnToAct !== me) return null;
    const cap = ceilingFor(g, me);
    const lo = minRaise(g, me);
    if (lo > cap || !canRaise(g, me)) return { act: 'fold' };
    // 상한 안에서는 조금씩 올린다. 한 번에 상한까지 지르면 읽히기도 쉽고,
    // 상대가 물러설 자리도 안 준다.
    const step = 1 + Math.floor(rnd() * 2);
    return { act: 'raise', amount: Math.min(cap, lo + (rnd() < 0.55 ? 0 : step)) };
  }

  if (g.phase === 'close') {
    if (g.lot.turnToAct !== me) return null;
    if (me === A) {
      // 값어치만큼 부르되 짝수로. 너무 크게 부르면 상대가 안 사도 내가 전액 낸다.
      const cap = ceilingFor(g, me);
      let v = Math.max(2, Math.min(cap, g.chips[me]));
      if (v % 2) v -= 1;
      if (v < 2) v = 2;
      if (v > g.chips[me]) v = g.chips[me] - (g.chips[me] % 2);
      return { act: 'closeBet', amount: Math.max(2, v) };
    }
    // 사는 쪽 — 얼마인지 모른다. 그래서 "이 물건이 나에게 값진가" 와
    // "진행자가 대충 얼마쯤 걸었겠는가" 만으로 고른다.
    // 진행자는 자기 상한 언저리를 부르므로, 상대의 남은 칩에서 어림잡는다.
    const cap = ceilingFor(g, me);
    if (cap === g.chips[me] && lotWorth(g, me) === Infinity) return { act: 'take' };  // 승부수
    const guess = Math.max(3, Math.min(g.chips[A], Math.round(g.chips[A] * 0.35)));
    if (cap >= guess && g.chips[me] > guess) return { act: 'take' };
    return { act: 'decline' };
  }
  return null;
}

// AI 의 한 수를 실제로 둔다 (서버가 쓰는 입구)
function applyAi(g, me, rnd = Math.random) {
  const a = aiAct(g, me, rnd);
  if (!a) return null;
  switch (a.act) {
    case 'draw':     draw(g, me); break;
    case 'offer':    offer(g, me, a.cardId); break;
    case 'choose':   chooseType(g, me, a.type); break;
    case 'raise':    if (!raise(g, me, a.amount)) fold(g, me); break;
    case 'fold':     fold(g, me); break;
    case 'closeBet': if (!closeBet(g, me, a.amount)) chooseFallback(g, me); break;
    case 'take':     closeTake(g, me); break;
    case 'decline':  closeDecline(g, me); break;
    case 'next':     nextTurn(g); break;
    default: return null;
  }
  return a;
}
// 클로즈를 부르지 못하는 상황(있어선 안 되지만)에 판이 멈추지 않게 한다
function chooseFallback(g, me) {
  for (let v = 2; v <= g.chips[me]; v += 2) if (closeBet(g, me, v)) return;
  // 그래도 안 되면 상대에게 넘긴다 — 멈추는 것보다 낫다
  if (g.lot) { g.lot.closeBet = 0; closeDecline(g, me === 1 ? 2 : 1); }
}

module.exports = {
  SPEC, START_CHIPS, HAND, CENTER,
  createGame, draw, offer, chooseType,
  canChoose, canRaise, minRaise, maxRaise, raise, fold,
  canCloseBet, closeBet, closeTake, closeDecline,
  settle, nextTurn, viewFor,
  completedKind, needLeft, byProgress, initDeck, activePlayer, timeout,
  aiAct, applyAi, lotWorth,
};
