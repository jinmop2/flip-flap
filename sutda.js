// ── 미니게임 족보 (섯다식 2장 승부) ──────────────────────────────────────
//
// 판정만 다루는 순수 모듈이다. 배팅·소켓·코인은 바깥이 맡고, 여기서는
// "이 두 장이 저 두 장을 이기는가" 만 계산한다. 족보가 틀리면 게임이 통째로
// 틀어지는데, 서버를 안 띄우고 276가지 조합을 전부 확인할 수 있어야 잡힌다.
//
// 덱은 본 게임과 같은 24장을 쓴다 — 카드를 새로 그릴 필요가 없고,
// 플레이어가 이미 아는 카드라 족보를 새로 외우지 않아도 된다.
//   2 그룹 2장 · 3 그룹 5장 · 4 그룹 7장 · 6 그룹 10장
//
// 카드는 { kind, grade } — kind 가 앞자리, grade 가 뒷자리. 둘 다 작을수록 강하다.

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];

function makeDeck() {
  const out = [];
  for (const [kind, n] of SPEC)
    for (let grade = 1; grade <= n; grade++) out.push({ kind, grade, id: kind * 100 + grade });
  return out;
}

// 카드 하나의 세기 — 앞자리 먼저, 같으면 뒷자리. 작을수록 강하다.
const cardValue = (c) => c.kind * 100 + c.grade;

// ── 스나이퍼 ──
// "앞자리 합 10" 은 본래 최하위권인데, 뒷자리 합까지 10이면 최상위를 잡는다.
//   · 거울쌍 10 (4-4 + 6-6) — 0티어(합4)와 1티어(합5)를 잡는다
//   · 일반 10-10 (나머지 6종)  — 1티어(합5)만 잡는다. 0티어에게는 진다.
// 저격 대상이 아닌 패(합 6~9)를 만나면 그냥 '합 10' 으로 취급되어 진다.
const SNIPER_NONE = 0, SNIPER_NORMAL = 1, SNIPER_MIRROR = 2;

function sniperOf(a, b) {
  if (a.kind + b.kind !== 10) return SNIPER_NONE;
  if (a.grade + b.grade !== 10) return SNIPER_NONE;
  // 거울쌍 — 4-4 와 6-6
  const pair = [a, b].sort((x, y) => x.kind - y.kind);
  if (pair[0].kind === 4 && pair[0].grade === 4 && pair[1].kind === 6 && pair[1].grade === 6)
    return SNIPER_MIRROR;
  return SNIPER_NORMAL;
}

// 티어 — 화면에 이름을 띄우고, 저격 대상을 판단하는 데 쓴다.
// 앞자리로 가능한 합은 4·5·6·7·8·9·10·12 뿐이다(11은 나오지 않는다).
const TIER_OF_SUM = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 12: 7 };
const TIER_NAME = ['지배자', '최고급', '중간계', '중간계', '중간계', '중간계', '최하위', '꼴찌'];

function evaluate(hand) {
  const [a, b] = hand;
  const frontSum = a.kind + b.kind;
  const backSum = a.grade + b.grade;
  const sniper = sniperOf(a, b);
  const tier = TIER_OF_SUM[frontSum];
  return {
    frontSum, backSum, sniper, tier,
    minValue: Math.min(cardValue(a), cardValue(b)),   // 제3원칙 — 더 작은 패를 쥔 쪽
    name: sniper === SNIPER_MIRROR ? '거울쌍 10'
        : sniper === SNIPER_NORMAL ? '10-10 스나이퍼'
        : `${TIER_NAME[tier]} (합 ${frontSum})`,
  };
}

// 저격이 통하는가 — 스나이퍼가 상대를 잡아먹는 경우만 true
function snipes(me, opp) {
  if (me.sniper === SNIPER_NONE) return false;
  if (opp.sniper !== SNIPER_NONE) return false;      // 스나이퍼끼리는 저격이 아니다
  if (me.sniper === SNIPER_MIRROR) return opp.tier === 0 || opp.tier === 1;
  return opp.tier === 1;                             // 일반 10-10 은 1티어만
}

// A 가 B 를 이기면 1, 지면 -1, 완전히 같으면 0.
// 완전히 같은 패는 덱에 카드가 한 장씩뿐이라 나올 수 없지만, 판정은 열어 둔다.
function compare(handA, handB) {
  const A = evaluate(handA), B = evaluate(handB);
  // ① 저격이 먼저다 — 서열을 뒤집는 규칙이라 합 비교보다 앞선다
  if (snipes(A, B)) return 1;
  if (snipes(B, A)) return -1;
  // ② 앞자리 합이 작은 쪽
  if (A.frontSum !== B.frontSum) return A.frontSum < B.frontSum ? 1 : -1;
  // ③ 뒷자리 합이 작은 쪽
  if (A.backSum !== B.backSum) return A.backSum < B.backSum ? 1 : -1;
  // ④ 더 작은 카드를 쥔 쪽
  if (A.minValue !== B.minValue) return A.minValue < B.minValue ? 1 : -1;
  return 0;
}

// 섞기 — 시드를 주면 같은 패를 다시 돌릴 수 있다(테스트·재현용)
function shuffle(arr, rand) {
  const a = arr.slice();
  const r = rand || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 두 사람에게 2장씩
function deal(rand) {
  const d = shuffle(makeDeck(), rand);
  return { hands: [[d[0], d[1]], [d[2], d[3]]], rest: d.slice(4) };
}

// ── 배팅 ──────────────────────────────────────────────────────────────────
//
// 2~4인. 섯다 방식 그대로다.
//
//   1) 모두 기본 단위(삥)만큼 걸고 한 장씩 받는다. 선부터 배팅.
//   2) 한 명 빼고 모두 콜하거나 죽으면 라운드가 닫힌다.
//   3) 한 명만 남으면 그대로 승리(기권승), 둘 이상 남으면 한 장 더 받고 두 번째 배팅.
//   4) 두 번째 배팅이 닫히면 패를 열고 족보로 가른다.
//   5) 선은 이긴 사람이 잡는다.
//
// 두 장 모두 끝까지 비공개다. 읽을 것은 상대가 얼마를 언제 거느냐뿐이다.
//
// 상태기계라 서버를 안 띄우고 한 판을 통째로 돌릴 수 있다. 돈이 오가는 곳이라
// 화면 없이 수천 판을 돌려 봐야 새는 곳이 보인다.
const ANTE = 10;                 // 기본 단위 = 판에 들어갈 때 각자 내는 돈(삥 한 번)
const BET_UNIT = ANTE;           // 삥 배팅액 (예전 이름 — 밖에서 쓰던 것을 살려 둔다)
const BUY_IN = 200;              // 자리에 앉을 때 들고 오는 돈. 올인이 뜻을 가지려면 밑천이 있어야 한다.
const MAX_SEATS = 4;
const MIN_SEATS = 2;

// 각 행동이 "얼마를 더 내는가". 못 하는 행동이면 null.
// 하프·쿼터는 콜을 하고 난 뒤의 판돈을 기준으로 잡는다 — 콜 값을 빼고 계산하면
// 앞사람이 크게 지를수록 되받아치는 값이 상대적으로 작아져 후행이 유리해진다.
function raiseAmounts(st, seat) {
  const my = st.roundBet[seat];
  const max = Math.max(...st.alive.map((a, i) => (a ? st.roundBet[i] : 0)));
  const toCall = max - my;
  const potAfterCall = st.pot + toCall;
  return {
    call: toCall,
    ping: ANTE,                                   // 삥 — 기본 단위
    half: toCall + Math.floor(potAfterCall / 2),
    quarter: toCall + Math.floor(potAfterCall / 4),
    ttadang: max * 2 - my,                        // 따당 — 앞사람이 건 돈의 두 배
    allin: st.stack[seat],
  };
}

// 올인이 아니어도 밑천보다 많이 걸 수는 없고, 남들이 받을 수 없는 액수도 걸 수 없다.
// 사이드팟을 만들지 않기로 했으니(3~4인에서 판을 셋으로 쪼개면 화면이 못 따라온다)
// 레이즈는 "가장 가난한 상대가 받을 수 있는 만큼" 에서 끊는다.
function capFor(st, seat) {
  let cap = st.stack[seat];
  for (let i = 0; i < st.n; i++) {
    if (i === seat || !st.alive[i]) continue;
    const can = st.roundBet[i] + st.stack[i] - st.roundBet[seat];
    if (can < cap) cap = can;
  }
  return Math.max(0, cap);
}

// 지금 이 사람이 할 수 있는 행동. 순서는 화면에 놓는 순서와 같다.
function actionsFor(st, seat) {
  const me = seat === undefined ? st.turn : seat;
  if (st.over || st.turn === null || me !== st.turn || !st.alive[me]) return [];
  const A = raiseAmounts(st, me);
  const cap = capFor(st, me);
  const out = [];
  const opening = A.call === 0 && !st.opened;      // 이번 라운드에 아직 아무도 안 걸었다

  // 콜/체크한 사람은 그 라운드에서 다시 못 올린다 — 콜·다이만 남는다
  if (!st.locked[me]) {
    // 삥은 규칙대로 선만 — 판을 여는 값이다.
    // 체크는 걸린 돈이 없을 때 누구나. 규칙은 선만이지만, 그러면 선이 체크한 뒤
    // 뒷사람은 걸거나 죽어야 해서 아무것도 아닌 판이 억지로 커진다.
    if (A.call === 0) out.push('check');
    if (opening && me === st.first && cap >= A.ping && st.stack[me] > A.ping) out.push('ping');
    if (!opening || me !== st.first) {
      if (A.call > 0 && A.ttadang <= cap && A.ttadang > A.call) out.push('ttadang');
    }
    if (A.quarter <= cap && A.quarter > A.call) out.push('quarter');
    if (A.half <= cap && A.half > A.call) out.push('half');
    if (st.stack[me] > A.call) out.push('allin');
  }
  if (A.call > 0) out.push('call');
  out.push('die');
  return out;
}

// 한 판 시작. seats 는 자리 수(2~4), first 는 선(없으면 무작위).
function start(opt = {}) {
  const r = opt.rand || Math.random;
  const n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, opt.seats || 2));
  const stacks = opt.stacks ? opt.stacks.slice(0, n) : new Array(n).fill(BUY_IN);
  const d = shuffle(makeDeck(), r);
  const st = {
    n,
    deck: d,
    hands: [], stack: [], alive: [], roundBet: [], put: [], locked: [],
    acted: [],
    pot: 0, round: 1, opened: false,
    first: (opt.first === undefined || opt.first === null) ? Math.floor(r() * n) : opt.first % n,
    turn: null, over: false, winner: null, reason: null, log: [],
  };
  for (let i = 0; i < n; i++) {
    st.hands.push([d[i]]);                         // 1장씩 — 두 번째 장은 라운드가 끝나고
    st.stack.push(stacks[i] === undefined ? BUY_IN : stacks[i]);
    st.alive.push(true); st.locked.push(false); st.acted.push(false);
    st.roundBet.push(0); st.put.push(0);
  }
  // 기본 단위를 모두 건다 (판에 들어가는 값)
  for (let i = 0; i < n; i++) {
    const a = Math.min(ANTE, st.stack[i]);
    st.stack[i] -= a; st.roundBet[i] += a; st.put[i] += a; st.pot += a;
  }
  st.turn = st.first;
  return st;
}

const alivePlayers = (st) => st.alive.reduce((n, a) => n + (a ? 1 : 0), 0);

// 다음 차례 — 죽은 사람과 밑천이 바닥난 사람은 건너뛴다
function nextSeat(st, from) {
  for (let k = 1; k <= st.n; k++) {
    const i = (from + k) % st.n;
    if (st.alive[i]) return i;
  }
  return from;
}

// 라운드가 닫혔는가 — 살아 있는 모두가 한 번씩 행동했고 낸 돈이 같으면.
// 올인으로 더 낼 수 없는 사람은 액수가 달라도 닫힌 것으로 본다.
function roundClosed(st) {
  const max = Math.max(...st.alive.map((a, i) => (a ? st.roundBet[i] : 0)));
  for (let i = 0; i < st.n; i++) {
    if (!st.alive[i]) continue;
    if (!st.acted[i]) return false;
    if (st.roundBet[i] < max && st.stack[i] > 0) return false;
  }
  return true;
}

// 두 번째 장을 돌리고 라운드를 연다
function openRound2(st) {
  st.round = 2; st.opened = false;
  for (let i = 0; i < st.n; i++) {
    st.locked[i] = false; st.acted[i] = false; st.roundBet[i] = 0;
    if (st.alive[i]) st.hands[i].push(st.deck[st.n + i]);
  }
  st.turn = st.alive[st.first] ? st.first : nextSeat(st, st.first);
}

// 승부 — 저격은 서열을 뒤집는 규칙이라 3~4인에서는 A>B>C>A 가 생길 수 있다.
// (졸개의 배신과 같은 성질이다.) 그래서 "몇 명을 이겼나" 로 먼저 세고,
// 같으면 기본 서열(앞자리 합 → 뒷자리 합 → 더 강한 카드)로 가른다.
// 정렬 함수로 쓰면 안 된다 — 순환이 있으면 정렬 결과가 뒤죽박죽이 된다.
function resolve(st) {
  const seats = [];
  for (let i = 0; i < st.n; i++) if (st.alive[i]) seats.push(i);
  if (seats.length === 1) return seats[0];
  let best = seats[0], bestWins = -1;
  for (const i of seats) {
    let wins = 0;
    for (const j of seats) if (i !== j && compare(st.hands[i], st.hands[j]) > 0) wins++;
    if (wins > bestWins) { best = i; bestWins = wins; continue; }
    if (wins === bestWins) {
      const A = evaluate(st.hands[i]), B = evaluate(st.hands[best]);
      if (A.frontSum !== B.frontSum) { if (A.frontSum < B.frontSum) best = i; }
      else if (A.backSum !== B.backSum) { if (A.backSum < B.backSum) best = i; }
      else if (A.minValue < B.minValue) best = i;
    }
  }
  return best;
}

function finish(st, winner, reason) {
  st.over = true; st.winner = winner; st.reason = reason; st.turn = null;
  st.stack[winner] += st.pot;
  st.first = winner;                 // 선은 이긴 사람이 잡는다
  return { ok: true, over: true };
}

// 한 수. 반환: { ok, error }
function act(st, seat, action) {
  if (st.over) return { ok: false, error: '이미 끝난 판이에요.' };
  if (seat !== st.turn) return { ok: false, error: '아직 차례가 아니에요.' };
  if (!actionsFor(st, seat).includes(action)) return { ok: false, error: '지금 할 수 없는 행동이에요.' };

  const A = raiseAmounts(st, seat);
  const cap = capFor(st, seat);

  if (action === 'die') {
    st.alive[seat] = false;
    st.log.push({ seat, action, round: st.round });
    if (alivePlayers(st) === 1) {
      const last = st.alive.indexOf(true);
      return finish(st, last, 'fold');           // 기권승 — 패는 안 깐다
    }
  } else {
    let add = 0;
    if (action === 'call') add = Math.min(A.call, st.stack[seat]);
    else if (action === 'check') add = 0;
    else if (action === 'ping') add = A.ping;
    else if (action === 'half') add = A.half;
    else if (action === 'quarter') add = A.quarter;
    else if (action === 'ttadang') add = A.ttadang;
    else if (action === 'allin') add = Math.min(st.stack[seat], Math.max(cap, A.call));
    add = Math.min(add, st.stack[seat]);

    const raising = add > A.call;
    st.stack[seat] -= add; st.roundBet[seat] += add; st.put[seat] += add; st.pot += add;
    if (raising) {
      st.opened = true;
      // 누가 올리면 이미 콜한 사람도 다시 답해야 한다 — 다만 올릴 수는 없다
      for (let i = 0; i < st.n; i++) if (i !== seat && st.alive[i]) st.acted[i] = false;
    } else {
      st.locked[seat] = true;                    // 콜·체크한 사람은 이 라운드에 다시 못 올린다
    }
    if (action === 'allin') st.locked[seat] = true;
    st.acted[seat] = true;
    st.log.push({ seat, action, add, pot: st.pot, round: st.round });
  }

  if (!roundClosed(st)) { st.turn = nextSeat(st, seat); return { ok: true }; }

  if (st.round === 1) { openRound2(st); return { ok: true, round: 2 }; }
  return finish(st, resolve(st), 'showdown');
}

// 화면·AI 에 내려보낼 형태. 남의 패는 공개로 끝났을 때만 실린다 —
// 죽은 사람 패는 끝까지 안 깐다. 다음 판에 읽히고, 실제 섯다에서도 안 깐다.
function viewFor(st, me) {
  const showAll = st.over && st.reason === 'showdown';
  const seats = [];
  for (let i = 0; i < st.n; i++) {
    const open = i === me || (showAll && st.alive[i]);
    seats.push({
      seat: i,
      alive: st.alive[i], stack: st.stack[i], roundBet: st.roundBet[i], put: st.put[i],
      first: i === st.first, turn: i === st.turn,
      cards: open ? st.hands[i].slice() : null,
      count: st.hands[i].length,
      // 첫 라운드는 한 장뿐이라 족보가 없다 — 두 장이 되었을 때만 매긴다
      eval: open && st.hands[i].length === 2 ? evaluate(st.hands[i]) : null,
    });
  }
  const A = raiseAmounts(st, me);
  return {
    me, n: st.n, pot: st.pot, round: st.round, turn: st.turn,
    over: st.over, winner: st.winner, reason: st.reason, seats,
    actions: st.turn === me ? actionsFor(st, me) : [],
    amounts: { call: A.call, ping: A.ping, half: A.half, quarter: A.quarter,
               ttadang: A.ttadang, allin: Math.min(st.stack[me], Math.max(capFor(st, me), A.call)) },
    toCall: A.call,
    myEval: st.hands[me].length === 2 ? evaluate(st.hands[me]) : null,
  };
}

// ── AI ────────────────────────────────────────────────────────────────────
//
// 보이는 카드가 없으니 AI 가 읽을 정보는 자기 패와 남들이 건 돈뿐이다.
// 자기 패 세기로 성향을 정하되 약한 패로도 가끔 지른다 — 늘 정직하면
// "AI 가 걸면 세다" 를 한 판 만에 들킨다.
//
// 첫 라운드는 카드가 한 장뿐이라 족보가 없다. 앞자리 하나로만 가늠한다.
// 0 이 가장 세고 1 이 가장 약하다.
function handStrength(cards) {
  if (!cards || !cards.length) return 1;
  if (cards.length === 1) return (cards[0].kind - 2) / 4;      // 2 → 0, 6 → 1
  const ev = evaluate(cards);
  if (ev.sniper === SNIPER_MIRROR) return 0.06;
  if (ev.sniper === SNIPER_NORMAL) return 0.34;
  return ev.tier / 7;
}
const strengthOf = (ev) => (ev.sniper === SNIPER_MIRROR ? 0.5
  : ev.sniper === SNIPER_NORMAL ? 2.5 : ev.tier);            // 예전 이름 — 티어 눈금 그대로

function aiAction(view, rand) {
  const acts = view.actions || [];
  if (!acts.length) return null;
  const r = rand || Math.random;
  const my = view.seats[view.me];
  const s = handStrength(my && my.cards);
  const pick = (...names) => names.find((n) => acts.includes(n));

  // 밑천에 견줘 너무 큰 값은 애초에 안 지른다 — 한 판에 다 털리면 다음 판이 없다
  const affordable = (n) => (view.amounts[n] || 0) <= Math.max(view.amounts.call, my.stack * 0.6);
  const raise = () => {
    // 아주 센 패는 가끔 다 민다 — 올인이 한 번도 안 나오면 밑천이 장식이 된다
    if (s <= 0.1 && acts.includes('allin') && r() < 0.12) return 'allin';
    const cands = ['ttadang', 'half', 'quarter'].filter((n) => acts.includes(n) && affordable(n));
    if (!cands.length) return null;
    return s < 0.12 && r() < 0.35 ? cands[0] : cands[cands.length - 1];
  };

  if (view.toCall > 0) {
    if (s <= 0.2 && r() < 0.55) { const x = raise(); if (x) return x; }
    if (s <= 0.5) return pick('call', 'check') || 'die';
    if (s <= 0.7) return r() < 0.5 ? (pick('call') || 'die') : 'die';
    // 꼴찌권 — 싸게 받을 수 있으면 한 번쯤 따라가 본다
    if (view.toCall <= ANTE && r() < 0.3) return pick('call') || 'die';
    return pick('die') || 'check';
  }
  // 걸린 돈이 없다
  if (s <= 0.25) { const x = raise() || pick('ping'); if (x) return x; }
  if (s <= 0.5 && r() < 0.4) { const x = pick('ping') || raise(); if (x) return x; }
  if (r() < 0.15) { const x = pick('ping') || raise(); if (x) return x; }   // 허풍
  return pick('check', 'ping') || 'die';
}

module.exports = {
  ANTE, BET_UNIT, BUY_IN, MAX_SEATS, MIN_SEATS,
  start, act, actionsFor, viewFor, roundClosed, raiseAmounts, capFor, resolve,
  aiAction, handStrength, strengthOf,
  SPEC, TIER_NAME, TIER_OF_SUM,
  SNIPER_NONE, SNIPER_NORMAL, SNIPER_MIRROR,
  makeDeck, cardValue, sniperOf, evaluate, snipes, compare, deal, _shuffle: shuffle,
};
