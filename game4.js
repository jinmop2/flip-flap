// ── 다인전 엔진 — 칩으로 사는 3·4인 경매 ─────────────────────────────────
//
// 카드를 손패로 사던 예전 다인전을 갈아 끼웠다. 이제 값은 칩으로 부른다.
// 구성과 규칙은 tools/token4.mjs 에서 수만 판을 돌려 정했다(근거는 그 파일 머리).
//
// 카드에는 숫자(등급)가 없다. 종류만 있다.
//   2·3·4·6  세트 카드 — 그 숫자만큼 모으면 이긴다 (2종 2장 … 6종 6장)
//   W6       더블6 — 6종 두 장으로 친다
//   D46      쌍둥이 — 4종에도 6종에도 한 장씩 동시에 친다
//   V        금고 — 세트에는 안 들고, 매 턴 칩을 번다. 모을수록 가파르다(1개 1 · 2개 3 · 3개 6)
//
// 한 번의 경매
//   1) 턴 시작 — 금고 주인이 칩을 받고, 중앙 덱에서 한 장이 뒤집힌다
//   2) 진행자가 손패에서 한 장을 더한다 — 두 장이 경매품
//   3) 진행자가 오픈 / 클로즈를 고른다 (첫 경매는 오픈으로만)
//      오픈  — 진행자 왼쪽부터 돌아가며 올리거나 빠진다. 마지막 한 명이 산다.
//              아무도 안 부르면 진행자가 그냥 가져간다.
//      클로즈 — 진행자가 짝수 값 P 를 부른다. 나머지가 몰래 "P+1 에 산다/안 산다".
//              한 명이면 그 사람이 P+1 에, 아무도 없으면 진행자가 P 에 가져간다.
//              여럿이면 그 사람들끼리 P+1 부터 다시 올린다(아무도 안 올리면 왼쪽 사람).
//   4) 낙찰자만 칩을 낸다. 칩은 은행으로 사라진다.
//   5) 세트를 채우면 그 자리에서 이긴다. 아니면 진행자가 왼쪽으로 넘어간다.
// 덱이 떨어지면 세트에 가장 가까운 사람이 이긴다.
//
// 손패 4장 · 중앙 덱 = 인원 × 4 — 경매마다 한 장씩 나가 둘이 같은 때 떨어진다.
// 3인 덱은 4인 덱에서 8장을 뺀 것이다. 카드 한 벌로 두 인원을 다 한다.
//
// __ff_wrapped — 서버와 브라우저가 같은 파일을 읽는다. 감싸지 않으면
// top-level const 가 브라우저 전역으로 새어 client.js 와 부딪힌다.
(function () {
'use strict';
const __ff_m = (typeof module !== 'undefined' && module.exports) ? module : { exports: {} };

const SPECS = {
  4: { cards: [[2, 3], [3, 6], [4, 8], [6, 9], ['W6', 2], ['D46', 1], ['V', 3]], chips: 30 },   // 32장
  3: { cards: [[2, 2], [3, 4], [4, 6], [6, 8], ['W6', 1], ['V', 3]], chips: 25 },               // 24장
};
const HAND = 4;
const KINDS = [2, 3, 4, 6];
const NEED = { 2: 2, 3: 3, 4: 4, 6: 6 };
const CLOCK = 180;                         // 자리마다 3분 — 사람이 여럿이라 2인전(5분)보다 짧게
const specOf = (g) => SPECS[g.n] || SPECS[4];

// 카드 한 장이 세트마다 몇 장으로 치나
function addOf(kind) {
  if (kind === 'W6') return { 6: 2 };
  if (kind === 'D46') return { 4: 1, 6: 1 };
  if (kind === 'V') return {};
  return { [kind]: 1 };
}
function counts(acq) {
  const m = { 2: 0, 3: 0, 4: 0, 6: 0 };
  for (const c of acq) { const a = addOf(c.kind); for (const k in a) m[k] += a[k]; }
  return m;
}
const vaultsOf = (acq) => acq.reduce((n, c) => n + (c.kind === 'V' ? 1 : 0), 0);
const income = (v) => v * (v + 1) / 2;     // 금고 1개 1칩 · 2개 3칩 · 3개 6칩
const setCards = (acq) => acq.reduce((n, c) => n + (c.kind === 'V' ? 0 : 1), 0);

function checkSet(acq) {
  const m = counts(acq);
  for (const k of KINDS) if (m[k] >= NEED[k]) return k;
  return null;
}
// 세트까지 남은 최소 장수 — 0 이면 완성
function needLeft(acq) {
  const m = counts(acq); let best = Infinity;
  for (const k of KINDS) best = Math.min(best, Math.max(0, NEED[k] - m[k]));
  return best;
}
function bestRatio(acq) {
  const m = counts(acq); let best = 0;
  for (const k of KINDS) best = Math.max(best, Math.min(1, m[k] / NEED[k]));
  return best;
}
// 순위 — 세트에 가까운 사람 → 가장 많이 모은 세트의 비율 → 세트 카드 장수 → 칩.
// first 를 주면 그 자리를 맨 앞에 둔다(세트를 완성한 사람).
function rankSeats(g, first) {
  const key = (i) => { const s = g.seats[i]; return { need: needLeft(s.acq), ratio: bestRatio(s.acq), cards: setCards(s.acq), chips: s.chips }; };
  const idx = g.seats.map((_, i) => i);
  idx.sort((x, y) => {
    if (x === first) return -1; if (y === first) return 1;
    const a = key(x), b = key(y);
    return (a.need - b.need) || (b.ratio - a.ratio) || (b.cards - a.cards) || (b.chips - a.chips);
  });
  return idx;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ── 게임 생성 ──────────────────────────────────────────────────────────────
function createGame4(names, opts = {}) {
  const n = opts.n || names.length || 4;
  const spec = SPECS[n] || SPECS[4];
  const rnd = opts.rnd || Math.random;
  const deck = []; let id = 1;
  for (const [kind, count] of spec.cards) for (let i = 0; i < count; i++) deck.push({ id: id++, kind });
  shuffle(deck, rnd);
  const seats = [];
  for (let i = 0; i < n; i++)
    seats.push({ name: names[i], isBot: i !== 0, hand: deck.slice(i * HAND, (i + 1) * HAND), acq: [], chips: spec.chips });
  const clock = {};
  for (let i = 0; i < n; i++) clock[i] = CLOCK;
  const first = Math.floor(rnd() * n);      // 첫 진행자는 무작위
  return {
    n, seats, clock, deck: deck.slice(n * HAND),
    turn: 1, auctioneer: first, first,
    phase: 'round', auction: null, over: null, lastResult: null, lastIncome: null,
  };
}

// 진행자 왼쪽부터 한 바퀴. 진행자는 맨 끝이다.
function orderFrom(g) { const o = []; for (let k = 1; k <= g.n; k++) o.push((g.auctioneer + k) % g.n); return o; }
const rivals = (g) => orderFrom(g).filter((i) => i !== g.auctioneer);

// ── 턴 시작: 금고 수입 → 중앙 카드 공개 ─────────────────────────────────────
function beginRound(g) {
  if (g.phase !== 'round') return false;
  if (!g.deck.length || !g.seats[g.auctioneer].hand.length) { endByDeck(g); return true; }
  g.lastIncome = g.seats.map((s) => income(vaultsOf(s.acq)));
  g.seats.forEach((s, i) => { s.chips += g.lastIncome[i]; });
  g.auction = { center: g.deck.pop(), offered: null, type: null, price: 0, high: null, bids: {},
                out: [], order: null, turnSeat: null, closeP: null, answers: {}, buyers: null, tiebreak: false };
  g.phase = 'offer';
  return true;
}

function offer(g, seat, cardId) {
  if (g.phase !== 'offer' || seat !== g.auctioneer) return false;
  const h = g.seats[seat].hand;
  const idx = h.findIndex((c) => String(c.id) === String(cardId));
  if (idx < 0) return false;
  g.auction.offered = h.splice(idx, 1)[0];
  // 첫 경매는 오픈으로만 — 모두 빈손일 때 클로즈로 두면 먼저 물어보는 쪽이
  // 거저 앞서 나갔다(시뮬레이션에서 첫 진행자 왼쪽이 30% 까지 이겼다)
  if (g.turn === 1) startOpen(g); else g.phase = 'choose_type';
  return true;
}

const canClose = (g) => g.seats[g.auctioneer].chips >= 2;
function chooseType(g, seat, type, price) {
  if (g.phase !== 'choose_type' || seat !== g.auctioneer) return false;
  if (type === 'open') { startOpen(g); return true; }
  if (type !== 'close') return false;
  const P = Number(price);
  if (!Number.isInteger(P) || P < 2 || P % 2 !== 0 || P > g.seats[seat].chips) return false;
  const a = g.auction;
  a.type = 'close'; a.closeP = P; a.answers = {};
  // 살 칩이 없는 사람은 묻지 않는다
  for (const i of rivals(g)) if (g.seats[i].chips < P + 1) a.answers[i] = false;
  g.phase = 'answer';
  if (allAnswered(g)) resolveClose(g);
  return true;
}

// ── 오픈: 돌아가며 올리거나 빠진다 ──────────────────────────────────────────
// opts: among(이 사람들만), price(시작 값), high(시작 값을 쥔 사람), tiebreak
function startOpen(g, opts = {}) {
  const a = g.auction;
  if (!opts.tiebreak) a.type = 'open';
  a.tiebreak = !!opts.tiebreak;
  a.order = orderFrom(g);
  a.price = opts.price || 0;
  a.high = (opts.high === undefined) ? null : opts.high;
  a.bids = a.high !== null ? { [a.high]: a.price } : {};
  a.out = a.order.filter((i) => (opts.among && !opts.among.includes(i)));
  // 다음 차례는 turnSeat "다음" 부터 찾는다 — 처음엔 진행자(맨 끝)나 값을 쥔 사람 뒤부터
  a.turnSeat = a.high !== null ? a.high : a.order[a.order.length - 1];
  g.phase = 'open';
  nextTurn(g);
}
function nextTurn(g) {
  const a = g.auction;
  for (;;) {
    const alive = a.order.filter((i) => !a.out.includes(i));
    if (a.high !== null && alive.length <= 1) return sell(g, a.high, a.price);
    if (a.high === null && alive.length === 0) return sell(g, g.auctioneer, 0);    // 아무도 안 불렀다
    const start = a.order.indexOf(a.turnSeat);
    let next = null;
    for (let k = 1; k <= a.order.length; k++) {
      const i = a.order[(start + k) % a.order.length];
      if (a.out.includes(i) || i === a.high) continue;
      next = i; break;
    }
    if (next === null) return a.high !== null ? sell(g, a.high, a.price) : sell(g, g.auctioneer, 0);
    a.turnSeat = next;
    if (g.seats[next].chips < a.price + 1) { a.out.push(next); continue; }      // 더 부를 칩이 없으면 저절로 빠진다
    return;
  }
}
const canAct = (g, seat) => g.phase === 'open' && g.auction && g.auction.turnSeat === seat;
function raise(g, seat, to) {
  if (!canAct(g, seat)) return false;
  const a = g.auction, v = Number(to);
  if (!Number.isInteger(v) || v <= a.price || v > g.seats[seat].chips) return false;
  a.price = v; a.high = seat; a.bids[seat] = v;
  nextTurn(g);
  return true;
}
function pass(g, seat) {
  if (!canAct(g, seat)) return false;
  g.auction.out.push(seat);
  nextTurn(g);
  return true;
}

// ── 클로즈: 몰래 답한다 ─────────────────────────────────────────────────────
const allAnswered = (g) => rivals(g).every((i) => g.auction.answers[i] !== undefined);
const canAnswer = (g, seat) => g.phase === 'answer' && seat !== g.auctioneer
  && g.auction && g.auction.answers[seat] === undefined;
function answer(g, seat, buy) {
  if (!canAnswer(g, seat)) return false;
  const a = g.auction;
  if (buy && g.seats[seat].chips < a.closeP + 1) return false;
  a.answers[seat] = !!buy;
  if (allAnswered(g)) resolveClose(g);
  return true;
}
function resolveClose(g) {
  const a = g.auction, P = a.closeP;
  const buyers = rivals(g).filter((i) => a.answers[i]);
  a.buyers = buyers;
  if (!buyers.length) return sell(g, g.auctioneer, P);          // 아무도 안 샀다 — 진행자가 부른 값에 가져간다
  if (buyers.length === 1) return sell(g, buyers[0], P + 1);
  // 여럿이 사겠다 — 그 사람들끼리 P+1 부터 다시 올린다. 아무도 안 올리면 왼쪽 사람.
  startOpen(g, { among: buyers, price: P + 1, high: buyers[0], tiebreak: true });
}

// ── 낙찰 ────────────────────────────────────────────────────────────────────
function sell(g, winner, price) {
  const a = g.auction, w = g.seats[winner];
  const paid = Math.min(price, w.chips);
  w.chips -= paid;                                              // 은행으로 사라진다
  const prize = [a.center, a.offered];
  w.acq.push(...prize);
  a.winner = winner; a.paid = paid;
  g.lastResult = { winner, prize, price: paid, type: a.type, tiebreak: a.tiebreak,
                   free: paid === 0 && winner === g.auctioneer };
  g.phase = 'settled';
  const k = checkSet(w.acq);
  if (k) g.over = { winner, reason: 'set', kind: k, order: rankSeats(g, winner) };
}

function endByDeck(g) {
  const order = rankSeats(g);
  g.over = { winner: order[0], reason: 'deck', order };
  g.phase = 'game_over';
}

function advance(g) {
  if (g.over) { g.phase = 'game_over'; return; }
  g.turn++;
  g.auctioneer = (g.auctioneer + 1) % g.n;
  g.auction = null;
  if (!g.deck.length || !g.seats[g.auctioneer].hand.length) return endByDeck(g);
  g.phase = 'round';
}

__ff_m.exports = {
  SPECS, HAND, KINDS, NEED, CLOCK, specOf, addOf, counts, vaultsOf, income, setCards,
  checkSet, needLeft, bestRatio, rankSeats, createGame4, orderFrom, rivals,
  beginRound, offer, canClose, chooseType, startOpen, canAct, raise, pass,
  canAnswer, answer, allAnswered, advance,
};

if (typeof window !== 'undefined') window.GAME4 = __ff_m.exports;
})();
