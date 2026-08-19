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

// 2-1) 아직 방식을 안 골랐으면 출품 카드를 바꿀 수 있다.
// 값을 건 것도, 상대가 본 것도 없다 — 무를 수 없을 이유가 없다.
function reoffer(g, who, cardId) {
  if (g.over || g.phase !== 'choose' || who !== g.auctioneer || !g.lot) return false;
  const h = g.hands[who];
  const i = h.findIndex((c) => String(c.id) === String(cardId));
  if (i < 0) return false;
  const back = g.lot.offered;
  g.lot.offered = h.splice(i, 1)[0];
  if (back) h.push(back);
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
// 얼마를 걸었는지는 알려준다(하나를 더 얹어야 하니 알 수밖에 없다).
// 가려지는 것은 값이 아니라 출품 카드다 — 무엇을 사는지 모르고 값만 아는 것,
// 그게 클로즈다.
function closeTake(g, who) {
  if (g.over || g.phase !== 'close' || !g.lot || g.lot.turnToAct !== who) return false;
  if (who === g.auctioneer || !g.lot.closeBet) return false;
  const need = g.lot.closeBet + 1;
  if (g.chips[who] < need) return false;
  g.lot.bets[who] = need;
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
      // 살 값은 알려준다 — 하나를 더 얹어 사는 것이 규칙이니 값은 알 수밖에 없다.
      takeCost: (g.phase === 'close' && l.turnToAct === me && me !== g.auctioneer) ? l.closeBet + 1 : null,
      canTake: (g.phase === 'close' && l.turnToAct === me && me !== g.auctioneer
                && g.chips[me] >= l.closeBet + 1),
      canClose: g.phase === 'choose' && me === g.auctioneer ? canChoose(g, 'close') : null,
    } : null,
    last: g.last,
  };
}


// ── AI ────────────────────────────────────────────────────────────────────
// 이 모드는 "언제 물러설지" 가 전부다. 이긴 쪽은 전액, 진 쪽도 절반을 낸다 —
// 값어치보다 높게 부르면 이겨도 손해고, 끝까지 따라가다 지면 두 번 손해다.
//
// 그래서 AI 는 네 가지를 본다.
//   1) 이 경매품이 내 세트를 몇 걸음 당기는가 (남은 카드로 정말 채울 수 있는 줄만)
//   2) 상대의 세트를 몇 걸음 막는가
//   3) 덱이 얼마 안 남았는가 — 막바지엔 한 판이 곧 승패다
//   4) 칩을 0 까지 쓰면 지는가 — 세트를 완성하는 수가 아니면 마지막 한 칩은 남긴다
//
// 상대 손패는 절대 보지 않는다. 세는 것은 내 손패·양쪽 앞 카드·공개된 경매품뿐,
// 사람이 앉아서 셀 수 있는 것과 같다.

const TOTAL = {};
for (const [k, c] of SPEC) TOTAL[k] = c;

// 난이도 — 같은 뼈대에 다른 눈을 붙인다.
//   쉬움  : 상대를 막을 줄 모르고, 값을 헛본다. 칩도 함부로 쓴다.
//   보통  : 값은 제대로 보되 막바지 계산과 심리전은 없다.
//   전문가: 막바지 승부, 칩 관리, 클로즈로 상대 칩을 말리는 수까지 쓴다.
const LEVELS = {
  easy:   { gain: 2.6, deny: 0.2, late: 1.0, noise: 0.85, foldy: 0.34, safe: false, drain: false, count: false, scale: 7, sloppy: true },
  hard:   { gain: 3.4, deny: 1.7, late: 1.25, noise: 0.16, foldy: 0.05, safe: true,  drain: false, count: true,  scale: 10 },
  expert: { gain: 3.6, deny: 2.6, late: 1.9, noise: 0.04, foldy: 0,    safe: true,  drain: true,  count: true,  scale: 11, reason: true, minimal: true },
};
const levelOf = (name) => LEVELS[Object.prototype.hasOwnProperty.call(LEVELS, name) ? name : 'hard'];

// 내가 셀 수 있는 카드만으로 "아직 안 나온 장수" 를 센다.
// (= 상대 손패 + 남은 중앙덱. 어느 쪽인지는 모르지만 총량은 알 수 있다)
function unseenCounts(g, me, extra) {
  const left = {};
  for (const [k, c] of SPEC) left[k] = c;
  const take = (arr) => { for (const c of arr) if (c) left[c.kind]--; };
  take(g.hands[me]); take(g.acq[1]); take(g.acq[2]); take(extra || []);
  return left;
}

// 세트까지 남은 장수 — 남은 카드로 정말 채울 수 있는 줄만 센다.
// 2짜리는 세상에 두 장뿐이라, 한 장이 상대 앞에 깔리면 그 줄은 이미 죽은 줄이다.
function setDist(acq, left) {
  const n = {};
  for (const c of acq) n[c.kind] = (n[c.kind] || 0) + 1;
  let best = Infinity;
  for (const [k] of SPEC) {
    const need = k - (n[k] || 0);
    if (need <= 0) return 0;
    if (left && (left[k] || 0) < need) continue;   // 못 채우는 줄은 안 센다
    if (need < best) best = need;
  }
  return best === Infinity ? 99 : best;
}

// 지금 내가 볼 자격이 있는 경매품. 클로즈에서 사는 쪽은 출품 카드를 못 본다 —
// AI 라고 몰래 보면 그건 규칙이 아니라 속임수다.
function lotCardsFor(g, me) {
  const l = g.lot; if (!l) return [];
  const blind = l.type === 'close' && me !== g.auctioneer;
  return blind ? [l.center].filter(Boolean) : [l.center, l.offered].filter(Boolean);
}

// 이 경매품이 나에게 몇 칩짜리인가.
// { worth, mustWin, mustDeny } — mustWin 은 먹으면 이기는 수, mustDeny 는 뺏기면 지는 수.
function apprise(g, me, P) {
  const you = other(me);
  const cards = lotCardsFor(g, me);
  const left = P.count ? unseenCounts(g, me, cards) : null;
  const myNow = setDist(g.acq[me], left);
  const myAfter = setDist(g.acq[me].concat(cards), left);
  const opNow = setDist(g.acq[you], left);
  const opAfter = setDist(g.acq[you].concat(cards), left);
  if (myAfter === 0) return { worth: Infinity, mustWin: true, mustDeny: false, opAfter, opNow };
  if (opAfter === 0) return { worth: Infinity, mustWin: false, mustDeny: true, opAfter, opNow };

  const gain = Math.max(0, myNow - myAfter);
  const deny = Math.max(0, opNow - opAfter);
  let v = gain * P.gain + deny * P.deny;
  // 덱이 얼마 안 남으면 한 판의 무게가 커진다. 그리고 마지막엔 세트가 아니라
  // "누가 더 가까운가" 로 갈리므로, 뒤지고 있으면 더 매달려야 한다.
  const lots = Math.max(1, g.center.length);
  if (lots <= 3) {
    v *= P.late;
    if (myNow > opNow) v *= 1.35;          // 지고 있다 — 여기서 안 붙으면 진다
    else if (myNow < opNow) v *= 0.8;      // 앞서 있다 — 칩을 아끼는 편이 낫다
  }
  v *= Math.max(2, g.chips[me]) / P.scale;
  return { worth: Math.max(1, v), mustWin: false, mustDeny: false, opAfter, opNow };
}

// ── 전문가의 눈 — 값을 어림하는 대신 판을 견주어 본다 ────────────────────
// "이 물건이 몇 칩짜리냐" 는 결국 감이다. 대신 전문가는 두 갈래를 실제로
// 놓아 보고 견준다 — 이 값에 사서 남는 판과, 물러서고 상대에게 준 판.
// 그러면 승부수·저지·칩 관리·막바지 계산이 따로 놀지 않고 한 셈에서 나온다.
const WIN = 1e6;
let STEP = 1.5;        // 세트까지 한 걸음 ≈ 칩 1.5개어치 (자가대전으로 맞춘 값)
let CHIPW = 1.0;       // 칩 하나의 무게
let PART = 9;          // 아직 한 걸음이 안 된 진행분의 무게
// 저울 눈금 조정 — 자가대전으로 맞춰 보기 위한 문 (게임 중에는 안 쓴다)
function setTune(t) { if (t.STEP != null) STEP = t.STEP; if (t.CHIPW != null) CHIPW = t.CHIPW; if (t.PART != null) PART = t.PART; }

// 남은 경매 수 — 중앙덱이 마르거나 진행자 손패가 비면 거기서 끝난다
function lotsLeft(g) { return Math.max(0, g.center.length); }

// 줄마다 얼마나 모였는가 — 가장 가까운 줄 말고도 조금씩은 값이 있다.
// 이걸 안 세면 "지금 당장 한 걸음 못 당기는 카드" 는 전부 공짜로 넘겨 주게 된다.
function partial(acq, left) {
  const n = {};
  for (const c of acq) n[c.kind] = (n[c.kind] || 0) + 1;
  let sum = 0;
  for (const [k] of SPEC) {
    const cnt = n[k] || 0;
    if (cnt >= k) return 1;
    if (left && (left[k] || 0) < k - cnt) continue;   // 죽은 줄은 안 센다
    sum += (cnt / k) * (cnt / k);
  }
  return sum;
}

// 이 판이 나에게 얼마나 좋은가. 칩 단위로 잰다.
function positionScore(myAcq, opAcq, myChips, opChips, left, lots) {
  const md = setDist(myAcq, left), od = setDist(opAcq, left);
  if (md === 0) return WIN;
  if (od === 0) return -WIN;
  // 칩이 0 이 되면 그 자리에서 진다 — 세트를 못 낸 채로는 한 칩이 목숨이다
  if (myChips <= 0) return -WIN;
  if (opChips <= 0) return WIN;
  // 덱이 마르면 세트가 아니라 "누가 더 가까운가" 로 갈린다
  if (lots <= 0) {
    if (md !== od) return md < od ? WIN : -WIN;
    return (myAcq.length - opAcq.length) * STEP;
  }
  return (od - md) * STEP
       + (partial(myAcq, left) - partial(opAcq, left)) * PART
       + (myChips - opChips) * CHIPW;
}

// 이 값에 사면 남는 판 / 물러서면 남는 판 — 둘을 견주어 상한을 찾는다
function reasonedCeiling(g, me, cap) {
  const you = other(me);
  const cards = lotCardsFor(g, me);
  const left = unseenCounts(g, me, cards);
  const lots = lotsLeft(g);
  const myBet = g.lot.bets[me] || 0, opBet = g.lot.bets[you] || 0;
  // 물러서면: 이미 부른 값의 절반을 내고, 물건은 상대에게 간다
  const foldScore = positionScore(
    g.acq[me], g.acq[you].concat(cards),
    g.chips[me] - Math.floor(myBet / 2), g.chips[you] - Math.min(opBet, g.chips[you]),
    left, lots);
  let best = 0;
  for (let n = 1; n <= cap; n++) {
    const winScore = positionScore(
      g.acq[me].concat(cards), g.acq[you],
      g.chips[me] - n, g.chips[you] - Math.floor(opBet / 2),
      left, lots);
    if (winScore >= foldScore) best = n;
  }
  return best;
}

// 상대는 이 물건에 얼마까지 낼까 — 공개된 것(상대 앞 카드·칩)만으로 같은 셈을
// 해 본다. 상대 손패는 안 보므로 어림이지만, 오픈 경매에서 어느 쪽이 이길지를
// 가늠하는 데는 이만한 게 없다.
function oppCeiling(g, you) {
  const cap = Math.max(1, g.chips[you] - 1);
  return reasonedCeiling(g, you, cap);
}

// 판 하나를 놓아 보고 점수만 돌려주는 셈틀 (전문가 전용)
function scoreIf(g, me, iGet, myPay, opPay, cards, left, lots) {
  const you = other(me);
  return positionScore(
    iGet ? g.acq[me].concat(cards) : g.acq[me],
    iGet ? g.acq[you] : g.acq[you].concat(cards),
    g.chips[me] - myPay, g.chips[you] - opPay, left, lots);
}

// 이 판에서 더 낼 수 있는 상한.
// 칩을 0 까지 쓰면, 그 경매에서 세트를 못 냈을 때 그대로 진다. 그래서
// "먹으면 이기는 수" 가 아닌 한 마지막 한 칩은 남긴다 — 이 한 줄이 승률을 가른다.
function capFor(g, me, P, a) {
  const chips = g.chips[me];
  if (a.mustWin) return chips;
  return P.safe ? Math.max(1, chips - 1) : chips;
}
function ceilingFor(g, me, P, a, rnd) {
  a = a || apprise(g, me, P);
  const cap = capFor(g, me, P, a);
  if (P.reason && g.lot) return Math.max(0, Math.min(cap, reasonedCeiling(g, me, cap)));
  if (a.worth === Infinity) return cap;
  let w = a.worth;
  if (P.noise && rnd) w *= 1 + (rnd() * 2 - 1) * P.noise;   // 쉬움은 값을 헛본다
  return Math.max(1, Math.min(cap, Math.round(w)));
}

// AI 가 지금 할 일 하나. 서버가 이걸 받아 그대로 둔다.
// { act:'draw' } | { act:'offer', cardId } | { act:'choose', type }
// | { act:'raise', amount } | { act:'fold' } | { act:'closeBet', amount }
// | { act:'take' } | { act:'decline' } | { act:'next' }
function aiAct(g, me, rnd = Math.random, level = 'hard') {
  const P = levelOf(level);
  if (g.over) return null;
  const A = g.auctioneer;
  // 정산은 AI 가 넘기지 않는다 — 넘기는 건 서버(사람이 볼 시간)의 몫이다.
  if (g.phase === 'settled') return null;
  if (g.phase === 'draw') return me === A ? { act: 'draw' } : null;

  if (g.phase === 'offer') {
    if (me !== A) return null;
    const you = other(me);
    const hand = g.hands[me];
    const left = P.count ? unseenCounts(g, me, [g.lot && g.lot.center]) : null;
    const myNow = setDist(g.acq[me], left), opNow = setDist(g.acq[you], left);
    let best = hand[0], bestScore = Infinity;
    for (const c of hand) {
      const mineLoss = myNow - setDist(g.acq[me].concat([c]), left);      // 나에게 쓸모
      const oppHelp = opNow - setDist(g.acq[you].concat([c]), left);      // 상대에게 쓸모
      // 상대 세트를 끝내 주는 카드는 아예 내놓지 않는다 — 경매에서 지면 그대로 패배다.
      const fatal = P.count && setDist(g.acq[you].concat([c, g.lot && g.lot.center].filter(Boolean)), left) === 0;
      let score = mineLoss * 2 + oppHelp * 3 + (fatal ? 100 : 0);
      if (P.sloppy) score = mineLoss * 2 + rnd() * 3;   // 쉬움은 상대 사정을 잘 안 본다
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return { act: 'offer', cardId: best.id };
  }

  if (g.phase === 'choose') {
    if (me !== A) return null;
    const a = apprise(g, me, P);
    // 뺏기면 지는 물건은 절대 클로즈로 안 낸다. 상대는 값을 모른 채 사 버릴 수
    // 있고, 그러면 그 자리에서 판이 끝난다. 열어 놓고 끝까지 붙는 게 낫다.
    if (a.mustDeny) return { act: 'choose', type: 'open' };
    if (!canChoose(g, 'close')) return { act: 'choose', type: 'open' };
    const wantClose = (a.mustWin || a.worth >= 4) && rnd() < 0.72;
    return { act: 'choose', type: wantClose ? 'close' : 'open' };
  }

  if (g.phase === 'bid') {
    if (g.lot.turnToAct !== me) return null;
    const a = apprise(g, me, P);
    const cap = ceilingFor(g, me, P, a, rnd);
    const lo = minRaise(g, me);
    if (!canRaise(g, me) || lo > cap || cap <= 0) return { act: 'fold' };
    if (P.foldy && !a.mustWin && !a.mustDeny && rnd() < P.foldy) return { act: 'fold' };
    // 상한 안에서는 조금씩 올린다. 한 번에 상한까지 지르면 읽히기도 쉽고,
    // 상대가 물러설 자리도 안 준다.
    if (P.minimal) return { act: 'raise', amount: lo };   // 값을 올려 주는 건 결국 내 지갑이다
    const step = 1 + Math.floor(rnd() * 2);
    return { act: 'raise', amount: Math.min(cap, lo + (rnd() < 0.55 ? 0 : step)) };
  }

  if (g.phase === 'close') {
    if (g.lot.turnToAct !== me) return null;
    const a = apprise(g, me, P);
    if (me === A) {
      const cap = capFor(g, me, P, a);
      if (P.reason) {
        // 방식을 고를 때 이미 가장 좋은 액수를 찾아 두었다 — 같은 셈을 다시 한다.
        const you = other(me);
        const cards = [g.lot.center, g.lot.offered].filter(Boolean);
        const left = unseenCounts(g, me, cards), lots = lotsLeft(g);
        // 상대는 값을 보고 고른다. 상대 상한보다 비싸게 부르면 안 사고,
        // 그러면 내가 그 값을 전액 문다. 그 갈림까지 셈에 넣어 고른다.
        const opCeil = oppCeiling(g, you);
        let best = -Infinity, bet = 2;
        for (let b = 2; b <= Math.min(cap, g.chips[you] - 1, g.chips[me]); b += 2) {
          const takes = (b + 1) <= opCeil;
          const sc = takes
            ? scoreIf(g, me, false, Math.floor(b / 2), Math.min(b + 1, g.chips[you]), cards, left, lots)
            : scoreIf(g, me, true, b, 0, cards, left, lots);
          if (sc > best) { best = sc; bet = b; }
        }
        return { act: 'closeBet', amount: Math.max(2, bet) };
      }
      // 상대는 값을 모른 채 고른다. 그러니 값의 크기는 "내가 얼마에 가져오느냐"
      // 가 아니라 "상대가 사면 얼마나 뜯기느냐" 를 정한다.
      //   · 상대가 탐낼 물건이면 크게 불러 둔다 — 사 가면 그만큼 칩이 마른다.
      //   · 상대가 안 볼 물건이면 최소로 불러 싸게 가져온다.
      const opWants = (a.opNow - a.opAfter) >= 1 || a.opAfter <= 1;
      let v = 2;
      if (P.drain && opWants) v = Math.max(2, Math.min(cap, Math.round(g.chips[other(me)] * 0.45)));
      else if (!P.drain) v = Math.max(2, Math.min(cap, Math.round(ceilingFor(g, me, P, a, rnd))));
      if (v % 2) v -= 1;
      if (v < 2) v = 2;
      if (v > g.chips[me]) v = g.chips[me] - (g.chips[me] % 2);
      return { act: 'closeBet', amount: Math.max(2, v) };
    }
    // 사는 쪽 — 낼 값은 안다. 모르는 것은 출품 카드다.
    // 그래서 "보이는 공개 카드 + 안 보이는 한 장" 의 값어치와 낼 값을 견준다.
    const cost = g.lot.closeBet + 1;
    if (g.chips[me] < cost) return { act: 'decline' };
    if (a.mustWin || a.mustDeny) return { act: 'take' };
    const cap = ceilingFor(g, me, P, a, rnd);
    return cap >= cost ? { act: 'take' } : { act: 'decline' };
  }
  return null;
}

// AI 의 한 수를 실제로 둔다 (서버가 쓰는 입구)
function applyAi(g, me, rnd = Math.random, level = 'hard') {
  const a = aiAct(g, me, rnd, level);
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
  createGame, draw, offer, reoffer, chooseType,
  canChoose, canRaise, minRaise, maxRaise, raise, fold,
  canCloseBet, closeBet, closeTake, closeDecline,
  settle, nextTurn, viewFor,
  completedKind, needLeft, byProgress, initDeck, activePlayer, timeout,
  LEVELS, setDist, unseenCounts, apprise, positionScore, reasonedCeiling, setTune,
  aiAct, applyAi,
};
