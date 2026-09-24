// ── 다인전 AI — 칩으로 사는 경매 ─────────────────────────────────────────
//
// tools/token4.mjs 에서 균형을 잴 때 쓴 판단을 그대로 옮겼다. 여기가 다르면
// 시뮬레이션이 잰 균형(종류·자리 편차)이 실제 판에서는 안 나온다.
//
// 값은 칩 단위로 매긴다.
//   STEP  세트까지 한 걸음의 값. CLOSE 로 끝에 가까울수록 한 걸음이 비싸진다.
//   PART  다른 종류에서의 진척.  INC  금고가 남은 턴 동안 벌어 줄 칩 중 얼마를 쳐주나.
//   BLOCK 남이 가져가면 곤란한 만큼.  RESERVE  세트가 아니면 남겨 두는 칩.
//   OFFER 출품할 때 남에게 좋은 카드를 얼마나 피하나.  NOISE  사람처럼 흔들리는 폭.
//
// 자리마다 성격을 따로 뽑는다(pickStyles). 한 가지 AI 로 맞춰 보니 한 점에 서지
// 않고 돌았다 — 다들 세게 막으면 안 막는 쪽이 이기고, 다들 안 막으면 막는 쪽이 이긴다.
//
// __ff_wrapped — 서버와 브라우저가 같은 파일을 읽는다.
(function () {
'use strict';
const __ff_m = (typeof module !== 'undefined' && module.exports) ? module : { exports: {} };
const G = (typeof require === 'function' ? require('./game4') : window.GAME4);

const AI0 = { STEP: 1.6, CLOSE: 1.4, PART: 9, INC: 0.7, BLOCK: 0.2, RESERVE: 0, OFFER: 0.8, NOISE: 0.9, WIN: 200 };

function pickStyles(n, rnd) {
  const r = rnd || Math.random;
  const pick = (lo, hi) => lo + (hi - lo) * r();
  const incK = n === 3 ? 1.5 : 1;          // 3인은 사람들이 금고를 1.5배쯤 쳐줄 때가 균형점이었다
  return Array.from({ length: 4 }, () => ({ ...AI0,
    STEP: pick(1.1, 2.2), PART: pick(6, 12), INC: pick(0.49, 0.97) * incK,
    BLOCK: pick(0.14, 0.28), RESERVE: r() < 0.5 ? 0 : 1 }));
}
const styleOf = (g, seat) => (g.seats[seat] && g.seats[seat].style) || AI0;

// 판 전체에 있는 세트 몫 (종류별). 인원마다 한 번만 센다.
const TOT = {};
function totals(g) {
  if (TOT[g.n]) return TOT[g.n];
  const t = { 2: 0, 3: 0, 4: 0, 6: 0 };
  for (const [kind, cnt] of G.specOf(g).cards) { const a = G.addOf(kind); for (const k in a) t[k] += a[k] * cnt; }
  return (TOT[g.n] = t);
}

// 한 사람의 형편. add: 가상으로 더 받는 몫(종류별)
function look(g, seat, add) {
  const tot = totals(g), taken = { 2: 0, 3: 0, 4: 0, 6: 0 };
  for (const s of g.seats) { const m = G.counts(s.acq); for (const k in m) taken[k] += m[k]; }
  const mine = G.counts(g.seats[seat].acq);
  let need = 99, part = 0, done = 0;
  for (const k of G.KINDS) {
    const r = G.NEED[k], have = mine[k] + (add[k] || 0);
    if (have >= r) done = done || k;
    const left = tot[k] - taken[k] - (add[k] || 0);            // 아직 아무도 안 가진 몫
    if (have + left < r) continue;                               // 이 종류로는 더 못 만든다
    need = Math.min(need, r - have);
    part += (Math.min(have, r) / r) ** 2;
  }
  return { need, part, done };
}

function lotParts(lot) {
  const add = {}; let v = 0;
  for (const c of lot) {
    if (!c) continue;
    if (c.kind === 'V') v++;
    const a = G.addOf(c.kind); for (const k in a) add[k] = (add[k] || 0) + a[k];
  }
  return { add, v };
}

// seat 가 이 경매품을 가지면 얼마나 좋은가 (칩 단위)
function gain(g, seat, lot, A) {
  const { add, v } = lotParts(lot);
  const b = look(g, seat, {}), a = look(g, seat, add);
  let val;
  if (a.done) val = A.WIN;
  else val = A.STEP * (b.need - a.need) * (1 + A.CLOSE / Math.max(1, a.need)) + A.PART * (a.part - b.part);
  // 금고 — 이미 가진 수에 따라 한 개의 값이 커진다(1 · 3 · 6)
  const cur = G.vaultsOf(g.seats[seat].acq);
  const perRound = G.income(cur + v) - G.income(cur);
  return val + A.INC * perRound * g.deck.length;
}

// 얼마까지 부를 생각인가 — 내 몫 + 남이 가져가면 곤란한 만큼
function worth(g, seat, lot, A) {
  let deny = 0;
  for (let o = 0; o < g.n; o++) if (o !== seat) deny = Math.max(deny, gain(g, o, lot, A));
  const mine = gain(g, seat, lot, A), chips = g.seats[seat].chips;
  if (mine >= A.WIN) return chips;                 // 이걸로 이긴다
  if (deny >= A.WIN) return chips;                 // 이걸 놓치면 진다
  return Math.min(mine + A.BLOCK * deny, chips - A.RESERVE);
}

// 이번 경매품에 이 자리가 부를 한도. 한 경매 동안은 같은 값을 쓴다 —
// 매번 새로 흔들면 올렸다 내렸다 하는 사람처럼 보인다.
function limitOf(g, seat) {
  const a = g.auction;
  if (!a.aiW) Object.defineProperty(a, 'aiW', { value: {}, enumerable: false });   // 밖으로 안 나가게
  if (a.aiW[seat] === undefined) {
    const A = styleOf(g, seat);
    let w = worth(g, seat, [a.center, a.offered], A) + (Math.random() - 0.5) * 2 * A.NOISE;
    a.aiW[seat] = Math.max(0, Math.min(w, g.seats[seat].chips));
  }
  return a.aiW[seat];
}

// 출품 — 나한테 좋고 남에게 덜 좋은 카드
function chooseConsign(g, seat) {
  const a = g.auction, A = styleOf(g, seat), hand = g.seats[seat].hand;
  let best = hand[0], bestS = -Infinity;
  for (const c of hand) {
    const lot = [a.center, c]; let opp = 0;
    for (let o = 0; o < g.n; o++) if (o !== seat) opp = Math.max(opp, gain(g, o, lot, A));
    const s = gain(g, seat, lot, A) - A.OFFER * opp;
    if (s > bestS) { bestS = s; best = c; }
  }
  return best;
}

// 오픈 / 클로즈. 클로즈면 값까지 정한다.
// 내가 제일 원하면: 남들이 못 따라올 짝수를 불러 가져간다.
// 남이 더 원하면: 그 사람 한도 바로 밑을 불러 비싸게 사게 만든다.
function chooseType(g, seat) {
  if (g.turn === 1 || !G.canClose(g)) return { type: 'open' };
  const a = g.auction, A = styleOf(g, seat), lot = [a.center, a.offered];
  const mine = limitOf(g, seat);
  let top = 0, topOther = 0;
  for (const i of G.rivals(g)) {
    const e = worth(g, i, lot, A);                 // 진행자가 짐작하는 남의 값
    topOther = Math.max(topOther, e);
    top = Math.max(top, Math.min(e, g.seats[i].chips - 1));
  }
  if (!(mine < topOther || Math.random() < 0.5)) return { type: 'open' };
  const chips = g.seats[seat].chips;
  let P;
  if (mine >= top + 1) { P = Math.max(2, Math.ceil(top / 2) * 2); if (P > mine || P > chips) return { type: 'open' }; }
  else { P = Math.floor((top - 1) / 2) * 2; if (P < 2 || P > chips) return { type: 'open' }; }
  return { type: 'close', price: P };
}

// 오픈에서 내 차례 — 한도 안이면 하나 더, 아니면 빠진다
function openMove(g, seat) {
  const a = g.auction, w = limitOf(g, seat);
  if (w >= a.price + 1 && g.seats[seat].chips >= a.price + 1) return { type: 'raise', to: a.price + 1 };
  return { type: 'pass' };
}

// 클로즈에서 — P+1 에 살까
function chooseAnswer(g, seat) {
  const a = g.auction;
  return g.seats[seat].chips >= a.closeP + 1 && limitOf(g, seat) >= a.closeP + 1;
}

__ff_m.exports = { AI0, pickStyles, chooseConsign, chooseType, openMove, chooseAnswer, gain, worth, look };
if (typeof window !== 'undefined') window.AI4 = __ff_m.exports;
})();
