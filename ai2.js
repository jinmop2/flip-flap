// ── 혼자 두는 상대(AI) ───────────────────────────────────────────────────
//
// 무엇을 낼지 고르는 셈만 있다. 방·소켓·계정은 안 쓴다 — rules2.js 와 같은
// 이유로, 그물이 끊겼을 때 화면이 이 AI 를 그대로 돌려야 하기 때문이다.
//
// 브라우저에서는 <script> 로 읽힌다. 감싸지 않으면 안쪽 이름이 전역으로 새어
// client.js 와 부딪힌다 — rules2 로 한 번 화면을 죽였다. 그래서 감싼다.
//
// 전문가 AI 의 몬테카를로는 expert4.js 에 따로 있다. 여기 있는 것은 그보다
// 가벼운 셈이고 쉬움·보통·어려움이 쓴다.
(function () {
'use strict';
const R = (typeof module !== 'undefined' && module.exports)
  ? require('./rules2') : (typeof window !== 'undefined' ? window.RULES2 : null);
const { SPEC, strength, is610 } = R;

function cpuTarget(acquired, hand) {
  const all = [...acquired, ...hand];
  const counts = {};
  for (const c of all) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = 6, bestRatio = -1;
  for (const [kind] of SPEC) {
    const ratio = (counts[kind] || 0) / kind;
    if (ratio > bestRatio) { bestRatio = ratio; best = kind; }
  }
  return best;
}

// 경매품 가치 0~1 (내 목표 세트에 얼마나 가까워지는가)
function prizeValue(cards, acquired, hand) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let maxVal = 0;
  for (const c of cards) {
    if (!c) continue;
    const owned = counts[c.kind] || 0;
    const needed = c.kind - owned;
    const val = needed <= 0 ? 1 : 1 / needed; // 1장 남으면 1, 멀면 낮음
    maxVal = Math.max(maxVal, val);
  }
  return Math.min(maxVal, 1);
}

function bluffRate(diff) {
  return { easy:0, normal:0, hard:0.15, expert:0.25 }[diff] ?? 0.1;
}

function cpuDecideBid(hand, prize, acquired, diff) {
  // 강한→약한 순 (strength 오름차순 = 강한 순)
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  let val = prizeValue(prize, acquired, hand);

  // easy: 대충 무작위 편향
  if (diff === 'easy') {
    return byStrong[Math.floor(Math.random() * byStrong.length)];
  }

  // 목표 세트 커밋: 경매품에 내 목표 종류가 있으면 적극적으로 노림 (어려운 세트도 끝까지)
  const target = cpuTarget(acquired, hand);
  if (prize.some(c => c && c.kind === target)) val = Math.max(val, 0.72);

  // expert 졸개의 배신: 가치 낮은 경매품엔 6-10을 덤핑해 2-1 저격 세팅
  const has610 = hand.find(is610);
  if (diff === 'expert' && has610 && val < 0.4) return has610;

  // 블러핑: 필요없는 경매품에 강수 → 상대 강카드 소모 유도
  if ((diff === 'hard' || diff === 'expert') && Math.random() < bluffRate(diff) && val < 0.5) {
    return byStrong[0]; // 페이크 강배팅
  }

  if (val >= 0.66) return byStrong[0];                       // 꼭 필요 → 최강
  if (val >= 0.4)  return byStrong[Math.min(1, byStrong.length-1)]; // 준강
  if (val >= 0.2)  return byStrong[Math.floor(byStrong.length/2)];  // 중간
  return byStrong[byStrong.length - 1];                      // 불필요 → 최약 덤핑
}

function cpuChooseType(hand, prize, acquired, diff) {
  if (diff === 'easy') return Math.random() < 0.5 ? 'open' : 'close';
  const val = prizeValue(prize, acquired, hand);
  // 가치 높으면 오픈(상대 배팅 유도), 낮으면 클로즈(정보 차단·블러핑)
  if (val >= 0.6) return Math.random() < 0.75 ? 'open' : 'close';
  return Math.random() < 0.65 ? 'close' : 'open';
}

function cpuChooseOffer(hand, acquired) {
  const target = cpuTarget(acquired, hand);
  // 목표 외 카드 중 가장 약한(strength 큰) 카드 출품
  const nonTarget = hand.filter(c => c.kind !== target);
  const pool = nonTarget.length ? nonTarget : hand;
  return [...pool].sort((a, b) => strength(b) - strength(a))[0];
}
// 튜토리얼 전용 — 사람(oppAcq)이 가장 많이 모은 종류의 카드를 우선 출품해 세트 완성을 도움
function tutorialOffer(hand, humanAcq) {
  const cnt = {};
  for (const c of humanAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
  // 사람이 이미 모으는 종류를 손에 갖고 있으면 그걸 내줌 (진행도 높은 순)
  const helpful = hand.filter(c => cnt[c.kind])
    .sort((a, b) => (cnt[b.kind] - cnt[a.kind]) || (strength(a) - strength(b)));
  if (helpful.length) return helpful[0];
  return cpuChooseOffer(hand, []);   // 도울 게 없으면 그냥 약한 카드
}

// ══ 개선 전문가 AI (상대 견제 + 실현가능 목표 + 최소 승리 배팅) ══
const TOTAL = { 2: 2, 3: 5, 4: 7, 6: 10 };
const cnt = (acq, kind) => acq.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0);
function feasibleTarget(myAcq, oppAcq) {
  let best = null, bestScore = -1;
  for (const [kind] of SPEC) {
    const myC = cnt(myAcq, kind), oppC = cnt(oppAcq, kind);
    if (TOTAL[kind] - oppC < kind) continue;   // 남은 카드로 완성 불가 → 포기
    if (myC >= kind) continue;
    const score = myC / kind + (kind <= 3 ? 0.04 : 0);
    if (score > bestScore) { bestScore = score; best = kind; }
  }
  return best ?? 6;
}
function wantValue(prize, myAcq, target) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(myAcq, c.kind);
    let cv = need <= 0 ? 1 : 1 / need;
    if (c.kind === target) cv = Math.max(cv, 0.75);
    if (need === 1) cv = Math.max(cv, 0.97);   // 이걸로 내 세트 완성
    v = Math.max(v, cv);
  }
  return v;
}
function denyValue(prize, oppAcq) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(oppAcq, c.kind);
    if (need === 1) v = Math.max(v, 0.88);     // 상대 완성 임박 → 뺏기
    else if (need === 2) v = Math.max(v, 0.45);
  }
  return v;
}
function offerX(hand, myAcq, oppAcq) {
  const target = feasibleTarget(myAcq, oppAcq);
  let pool = hand.filter(c => c.kind !== target);
  if (!pool.length) pool = hand.slice();
  const safe = pool.filter(c => c.kind - cnt(oppAcq, c.kind) !== 1);  // 상대 완성시켜줄 카드 회피
  const use = safe.length ? safe : pool;
  return [...use].sort((a, b) => strength(b) - strength(a))[0];
}
function typeX(hand, prize, myAcq, oppAcq) {
  const val = Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, oppAcq)), denyValue(prize, oppAcq));
  return val >= 0.5 ? 'open' : 'closed';
}
// visOpp: 클로즈 후공일 때 보이는 진행자 배팅카드 · deckLeft: 남은 덱
function decideBidX(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  const target = feasibleTarget(myAcq, oppAcq);
  let val = Math.max(wantValue(prize, myAcq, target), denyValue(prize, oppAcq));
  // 경매 승리 자체가 진행도(획득 2장)에 유리 → 카드 열세거나 종반이면 싸게라도 경합
  const behind = myAcq.length <= oppAcq.length;
  const late = (deckLeft ?? 12) <= 5;
  if (behind || late) val = Math.max(val, late ? 0.5 : 0.42);
  if (visOpp) {   // 상대 배팅이 보이면 최소 승리 배팅으로 강카드 절약
    if (val < 0.3) return byStrong[byStrong.length - 1];
    const winners = hand.filter(c => aBeatsB(c, visOpp)).sort((a, b) => strength(b) - strength(a));
    if (winners.length) return winners[0];
    return byStrong[byStrong.length - 1];
  }
  if (val >= 0.8)  return byStrong[0];
  if (val >= 0.55) return byStrong[Math.min(1, byStrong.length - 1)];
  if (val >= 0.3)  return byStrong[Math.floor(byStrong.length / 2)];
  return byStrong[byStrong.length - 1];
}

// 뒤집힌 판(아이템 '역전')에서는 약한 카드가 이긴다.
// 이걸 안 보고 두면 AI 는 갖고 싶을 때마다 강한 카드를 내고 그대로 진다 —
// 아이템전 전문가가 실제로 이렇게 지고 있었다. 승부가 뒤집혔으면 고르는
// 방향도 뒤집는다.
function decideBidReverse(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const target = feasibleTarget(myAcq, oppAcq);
  let val = Math.max(wantValue(prize, myAcq, target), denyValue(prize, oppAcq));
  const behind = myAcq.length <= oppAcq.length;
  const late = (deckLeft ?? 12) <= 5;
  if (behind || late) val = Math.max(val, late ? 0.5 : 0.42);
  // 뒤집힌 판에서 "이기는 카드" 는 약한 카드 = strength 가 큰 카드
  const byWeak = [...hand].sort((a, b) => strength(b) - strength(a));
  if (visOpp) {
    const winners = hand.filter(c => strength(c) > strength(visOpp))
                        .sort((a, b) => strength(a) - strength(b));   // 이기는 것 중 가장 강한 것 = 가장 덜 아까운 것
    if (val >= 0.3 && winners.length) return winners[0];
    // 포기할 판이면 뒤집힘에서 지는 카드(=강한 카드)를 흘려보내고 약한 카드를 아낀다
    return byWeak[byWeak.length - 1];
  }
  if (val >= 0.8) return byWeak[0];
  if (val >= 0.55) return byWeak[Math.min(1, byWeak.length - 1)];
  if (val >= 0.3) return byWeak[Math.floor(byWeak.length / 2)];
  return byWeak[byWeak.length - 1];
}

const AI2 = {
  cpuTarget, prizeValue, bluffRate, cpuDecideBid, cpuChooseType, cpuChooseOffer, tutorialOffer,
  feasibleTarget, wantValue, denyValue, offerX, typeX, decideBidX, decideBidReverse,
};
if (typeof module !== 'undefined' && module.exports) module.exports = AI2;
if (typeof window !== 'undefined') window.AI2 = AI2;

})();
