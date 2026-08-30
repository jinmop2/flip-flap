// FLIP FLAP 전문가 AI v4 — v3 위에 얹는다.
//
// v3 는 배팅만 몬테카를로로 읽고, 출품은 손으로 쓴 점수표로 골랐다.
// 그런데 출품 카드는 경매품의 절반이다. 진행자가 무엇을 얹느냐가 그 판의
// 값을 절반 정하는데, 그걸 읽지 않고 "약한 것 중 상대에게 덜 위험한 것" 으로
// 골랐다. 거울 대전에서 선공(진행자)이 후공에게 5%p 지고 있던 것과 맞물린다 —
// 진행자만 하는 일이 출품이고, 그게 유일하게 안 읽는 수였다.
//
// v4 가 바꾸는 것은 그 하나다: 출품도 상대 손을 표본으로 뽑아 읽는다.
// 나머지(배팅·방식·카운팅)는 v3 를 그대로 쓴다 — 한 번에 하나만 바꿔야
// 늘었는지 줄었는지 알 수 있다.
const X3 = require('./expert3.js');

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];
const TOTAL = { 2: 2, 3: 5, 4: 7, 6: 10 };
const strength = c => c.kind * 100 + c.grade;
const is610 = c => c.kind === 6 && c.grade === 10;
const is21 = c => c.kind === 2 && c.grade === 1;
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}
const ALL = (() => {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind * 100 + g });
  return cards;
})();
const cnt = (acq, kind) => acq.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0);
const checkSet = acq => { const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1; for (const [k] of SPEC) if ((c[k] || 0) >= k) return k; return null; };
const prog = acq => { const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1; let b = 0; for (const [k] of SPEC) b = Math.max(b, (c[k] || 0) / k); return [b, acq.length]; };

// 판이 끝났을 때의 점수. v3 의 롤아웃과 같은 눈금을 쓴다.
function endScore(myAcq, oppAcq) {
  if (checkSet(myAcq)) return 1;
  if (checkSet(oppAcq)) return 0;
  const a = prog(myAcq), b = prog(oppAcq);
  if (a[0] !== b[0]) return a[0] > b[0] ? 0.85 : 0.05;
  if (a[1] !== b[1]) return a[1] > b[1] ? 0.85 : 0.05;
  return 0.4;
}

// 상대 손 표본. v3 의 메모리(내가 배팅으로 넘긴 카드)를 그대로 존중한다.
function unknownPool(view, mem) {
  const gone = new Set();
  for (const c of view.hand) gone.add(c.id);
  for (const c of view.myAcq) gone.add(c.id);
  for (const c of view.oppAcq) gone.add(c.id);
  for (const id of mem.knownOpp) gone.add(id);
  if (view.center) gone.add(view.center.id);
  return ALL.filter(c => !gone.has(c.id));
}
function sampleOppHand(pool, mem, need) {
  const known = [];
  for (const id of mem.knownOpp) { const c = ALL.find(x => x.id === id); if (c) known.push(c); }
  let k = Math.max(0, need - known.length);
  k = Math.min(k, pool.length);
  const idx = [...pool.keys()];
  const picked = [];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
    picked.push(pool[idx[i]]);
  }
  return known.concat(picked);
}

// 표본 한 벌에서 두 사람이 어떻게 부를지. 진행자(나)는 상대를 못 보고,
// 후공(상대)은 오픈이면 못 보고 클로즈면 내 배팅을 본다 — 실제 규칙 그대로다.
function bidLike(hand, prize, myAcq, oppAcq, visOpp) {
  const s = [...hand].sort((a, b) => strength(a) - strength(b));   // 강→약
  const t = X3.feasibleTarget(myAcq, oppAcq);
  const val = Math.max(X3.wantValue(prize, myAcq, t), X3.denyValue(prize, oppAcq));
  if (visOpp) {
    if (val < 0.3) return s[s.length - 1];
    const w = hand.filter(c => aBeatsB(c, visOpp)).sort((a, b) => strength(b) - strength(a));
    return w.length ? w[0] : s[s.length - 1];
  }
  if (val >= 0.8) return s[0];
  if (val >= 0.55) return s[Math.min(1, s.length - 1)];
  if (val >= 0.3) return s[Math.floor(s.length / 2)];
  return s[s.length - 1];
}

// ── 출품 결정 (v4): 얹어 보고, 그 경매를 끝까지 굴려 본다 ──────────────
//
// 후보마다 "내가 이걸 얹으면 이 판이 어떻게 끝나는가" 를 표본으로 센다.
// 값은 세 가지가 겹친다:
//   · 이 판을 내가 가져갈 확률과, 가져갔을 때의 진행도
//   · 상대가 가져갔을 때 상대가 얼마나 가까워지는가
//   · 얹은 카드가 내 손에서 빠지는 손해 (내 목표 종류면 아프다)
// 셋을 따로 저울질하지 않고, 판이 끝난 자리의 점수 하나로 합친다.
function offerV4(view, mem) {
  const hand = view.hand;
  if (hand.length <= 1) return hand[0];
  const pool = unknownPool(view, mem);
  const oppLen = view.oppHandLen || 0;
  // 손패가 클수록 후보가 많다 — 표본을 나눠 쓰되 판당 비용을 일정하게 둔다.
  const SAMPLES = Math.max(18, Math.round(150 / hand.length));

  const scores = new Map(hand.map(c => [c.id, 0]));
  for (let s = 0; s < SAMPLES; s++) {
    const oppHand = sampleOppHand(pool, mem, oppLen);
    if (!oppHand.length) break;
    for (const off of hand) {
      const myHand = hand.filter(c => c.id !== off.id);
      if (!myHand.length) { scores.set(off.id, scores.get(off.id) + 0.4); continue; }
      const prize = [view.center, off].filter(Boolean);
      // 나는 상대를 못 본다. 상대는 오픈이면 못 보고, 클로즈면 내 배팅을 본다.
      const myBid = bidLike(myHand, prize, view.myAcq, view.oppAcq, null);
      const seen = view.plannedType === 'closed' ? myBid : null;
      const oppBid = bidLike(oppHand, prize, view.oppAcq, view.myAcq, seen);
      if (!oppBid) continue;
      const myAcq = view.myAcq.slice(), oppAcq = view.oppAcq.slice();
      if (aBeatsB(myBid, oppBid)) myAcq.push(...prize); else oppAcq.push(...prize);
      // 배팅 카드는 서로 바뀐다 — 얹은 카드만 세면 안 된다
      scores.set(off.id, scores.get(off.id) + endScore(myAcq, oppAcq));
    }
  }
  const scored = hand.map(c => ({ c, s: scores.get(c.id) })).sort((a, b) => b.s - a.s);
  // 비슷한 후보끼리는 섞는다 — 같은 판에서 늘 같은 카드를 얹으면 읽힌다
  return pickNear(scored, 0.05);
}

function pickNear(scored, tol) {
  if (scored.length <= 1) return scored[0] && scored[0].c;
  const top = scored[0].s;
  const span = Math.max(Math.abs(top), 1e-6);
  const near = scored.filter(x => (top - x.s) / span <= tol);
  if (near.length === 1) return near[0].c;
  const w = near.map(x => Math.pow(1 - (top - x.s) / (span * tol + 1e-9), 2) + 0.15);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < near.length; i++) { r -= w[i]; if (r <= 0) return near[i].c; }
  return near[0].c;
}

// 배팅은 v3 의 몸통을 그대로 쓰되, 표본 수와 종반 완전탐색 폭을 넓혀 넘긴다.
//
// 값은 4000판씩 쓸어 골랐다 (v3 상대 종합 승률):
//   종반5·표본96  50.4%   종반5·표본160  51.7%
//   종반7·표본96  51.1%   종반7·표본160  52.7%  ← 고른 값
//   종반9·표본96  52.2%   종반9·표본160  51.4%
// 9까지 넓히면 더 나아지지 않는다 — 그 구간은 표본 추정만으로도 충분히 맞고,
// 넓힌 만큼 한 표본이 비싸져 표본 수가 아쉬워진다.
//
// 값은 재 보고 정한 것이라 환경변수로 다시 쓸어 볼 수 있게 열어 둔다.
const SAMPLES = process.env.FF_SAMPLES ? +process.env.FF_SAMPLES : 160;
const EG_DEPTH = process.env.FF_EGDEPTH ? +process.env.FF_EGDEPTH : 7;
function bidV4(view, mem) {
  return X3.bidV3({ ...view, samples: SAMPLES, endgameDepth: EG_DEPTH }, mem);
}

// 겉모양은 v3 와 똑같이 맞춘다 — 부르는 쪽은 require 한 줄만 갈아 끼우면 된다.
module.exports = {
  createMem: X3.createMem, noteSettle: X3.noteSettle,
  bid: bidV4, offer: offerV4, type: X3.typeV3,
  // 서버가 관전 해설·평가에 쓰는 것들은 v3 것을 그대로 쓴다
  feasibleTarget: X3.feasibleTarget, wantValue: X3.wantValue,
  denyValue: X3.denyValue, power: X3.power,
  tipValue: X3.tipValue, adjustForTip: X3.adjustForTip,
  // 실험용 별칭
  bidV4, offerV4, typeV4: X3.typeV3,
};

