// ── 아이템전에서 서버와 화면이 같이 쓰는 것 ───────────────────────────────
//
// 아이템 효과 자체는 items.js 가, 승패는 rules2.js 가 쥔다. 여기 있는 것은
// 그 사이의 셈이다 — 덱에 아이템 카드를 어떻게 섞는지, 중앙 카드를 뒤집을 때
// 보너스와 덤을 어떻게 처리하는지, 상대가 어떤 아이템을 언제 쓰는지.
//
// 서버가 쓰던 것을 그대로 옮겼다. 그물 없이 두는 판도 같은 파일을 읽어야
// 온라인과 아이템 판정이 갈라지지 않는다.
// __ff_wrapped — 서버와 브라우저가 같은 파일을 읽는다. 감싸지 않으면
// top-level const 가 브라우저 전역으로 새어 client.js 와 부딪힌다.
(function () {
'use strict';
const __ff_m = (typeof module !== 'undefined' && module.exports) ? module : { exports: {} };
const __req = (typeof require === 'function');
const items = __req ? require('./items') : window.ITEMS_M;
const R2 = __req ? require('./rules2') : window.RULES2;
const ai2 = __req ? require('./ai2') : window.AI2;
const { strength } = R2;
const { cpuTarget, feasibleTarget, wantValue, denyValue } = ai2;

function mixItemCards(deck) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const kinds = shuffle(['bonus', 'tip', 'bonus', 'tip']);   // 어느 창에 뭐가 올지는 무작위
  const WIN = 2;                                             // 보통 카드 두 장이 창 하나
  const out = [];
  for (let w = 0; w < kinds.length; w++) {
    const seg = deck.slice(w * WIN, (w + 1) * WIN);
    if (!seg.length) break;
    seg.splice(Math.floor(Math.random() * (seg.length + 1)), 0,
               { item: kinds[w], id: 'it_' + kinds[w][0] + w });
    out.push(...seg);
  }
  out.push(...deck.slice(kinds.length * WIN));   // 남은 보통 카드는 그대로 뒤에
  deck.length = 0;
  deck.push(...out);
}

// 덱에서 중앙 카드 뽑기 (draw → offer)
// 중앙 카드 뒤집기.
// 아이템전에서는 덱에 표시된 카드가 섞여 있다.
//   🎁 보너스 — 뒤집은 진행자가 그 자리에서 아이템 하나. 경매품이 아니라
//                다음 장을 다시 뽑아 경매를 이어간다.
//   🏷 덤    — 경매품에 그대로 얹힌다. 그 경매에서 진 쪽이 아이템 하나.
// 아이템 획득 경로를 이 둘로 좁혔다 — 예전엔 경매에 질 때마다 나와
// 판당 5.6개씩 쌓였고, 그만큼 아이템 한 개가 시시했다.
function drawCenter(game) {
  const bonus = [];
  let guard = 0;
  while (game.centerDeck.length && guard++ < 12) {
    const card = game.centerDeck.shift();
    if (!card.item) {                       // 보통 카드 — 이게 중앙 카드다
      game.auction.centerCard = card;
      game.phase = 'offer';
      return bonus;
    }
    // 🎁 보너스 — 뒤집은 진행자가 그 자리에서 하나.
    // 진행자는 턴마다 번갈아 맡으므로 공짜라도 한쪽으로 기울지 않는다.
    if (card.item === 'bonus') {
      const it = items.pick(game);
      const got = items.give(game, game.auctioneer, it.id);
      if (got) bonus.push({ seat: game.auctioneer, item: got });
      // 무엇이었는지 카드 앞면으로 남겨 둔다 — 뒷면만 보이면 뭘 줬는지 알 수 없다
      game.auction.bonusCard = { kind: 'bonus', itemId: it.id, name: it.name, tier: it.tier, of: game.auctioneer };
      continue;                             // 한 장 더 뽑아 경매를 연다
    }
    // 🏷 덤 — 경매품에 앞면으로 얹힌다. 무엇이 걸렸는지 둘 다 보고,
    // 정산 때 진 쪽이 그 아이템을 가져간다.
    {
      // 등급도 앞뒤도 안 따진다 — 열세 가지를 한 벌로 섞어 놓고 위에서 뽑는다.
      const it = items.pick(game);
      game.auction.tipCard = { kind: 'tip', itemId: it.id, name: it.name, tier: it.tier };
    }
    // 여기서 하나 더 뽑으므로 경매품이 세 장이 된다
  }
  game.auction.centerCard = null;           // 아이템 카드만 남기고 덱이 말랐다
  return bonus;
}

// ── AI 아이템 사용 ─────────────────────────────────────────
// 상황에 맞는 아이템만 고르고, 난이도가 낮을수록 덜 쓴다(캐주얼 모드라 과하면 짜증).
const AI_USE_RATE = { easy: 0.35, normal: 0.55, hard: 0.7, expert: 1 };

function pickItem(g, me, difficulty) {
  const held = (g.items[me] || []).filter(id => !items.canUse(g, me, id));
  if (!held.length) return null;
  const opp = me === 1 ? 2 : 1;
  const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
  const opAcq = opp === 1 ? g.p1Acquired : g.p2Acquired;
  const behind = items.isBehind(g, me);

  // 전문가는 "지금 이 판에서 이 아이템이 무엇을 바꾸는가" 를 본다.
  // 예전 표는 상황을 거의 안 봤다 — 리치인 상대에게 도둑고양이를 아끼고,
  // 이길 판에 역전을 걸어 스스로 지는 일이 있었다.
  const expert = difficulty === 'expert';
  // 세트까지 몇 걸음인가 (작을수록 가깝다)
  const distOf = (acq) => {
    const cnt = {};
    for (const c of acq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
    let best = 99;
    for (const k of [2, 3, 4, 6]) best = Math.min(best, k - (cnt[k] || 0));
    return best;
  };
  const myDist = distOf(myAcq), opDist = distOf(opAcq);
  const prize = g.auction ? [g.auction.centerCard, g.auction._offeredCard].filter(Boolean) : [];
  const myHand = me === 1 ? g.p1Hand : g.p2Hand;
  // 이번 경매를 이길 만한가 — 뒤집힘까지 셈에 넣는다
  const rev = !!(g.fx && g.fx.reverse);
  const myBest = myHand.length
    ? [...myHand].sort((a, b) => (rev ? strength(b) - strength(a) : strength(a) - strength(b)))[0] : null;
  const wantPrize = prize.length ? Math.max(
    wantValue(prize, myAcq, feasibleTarget(myAcq, opAcq)), denyValue(prize, opAcq)) : 0.4;

  // 상황 점수 — 높은 것 하나를 고른다
  const score = id => {
    switch (id) {
      case 'tyrant':     return g.auctioneer !== me ? 9 : -1;          // 진행권은 언제나 이득
      // 도둑고양이 — 상대가 리치일 때가 최고. 그 한 장이 승부다.
      case 'steal':      return opAcq.length < 1 ? -1
                              : expert ? (opDist <= 1 ? 12 : behind ? 10 : opAcq.length >= 2 ? 6 : 3)
                              : (opAcq.length >= 2 ? (behind ? 10 : 5) : -1);
      // 복사기 — 내가 리치일 때 그 자리에서 세트가 된다
      case 'copy':       return myAcq.length < 1 ? -1
                              : expert ? (myDist <= 1 ? 12 : myAcq.length >= 2 ? 8 : 4)
                              : (myAcq.length >= 2 ? 8 : -1);
      // 고르기 — 덱 위 3장에서 내가 원하는 것을 집어 온다. 리치일수록 값어치가 크다.
      case 'pick3':      return g.centerDeck.length < 2 ? -1
                              : expert ? (myDist <= 1 ? 11 : wantPrize < 0.3 ? 7 : 4)
                              : (behind ? 6 : 3);
      // 부적 — 이번 턴에만 산다. 상대가 전설을 들고 있으면 값어치가 크다.
      case 'ward':       return (g.items[opp] || []).some(x => ['steal', 'tyrant', 'copy', 'pick3', 'smoke'].includes(x)) ? 7 : 3;
      // 역전 — 내 손패가 약할 때만. 강한 손패로 걸면 스스로 진다.
      case 'flip':       if (!expert) return 5;
                         if (!myBest || g.phase === 'draw') return 2;
                         return strength(myBest) >= 500 ? 8 : strength(myBest) >= 300 ? 4 : -1;
      case 'smoke':      return g.phase !== 'draw' ? (expert && wantPrize >= 0.55 ? 8 : 5) : -1;
      // 폭탄 — 내가 원하지 않는 판일수록 좋다. 이 경매를 상대가 먹으면 손해를 보게 만든다.
      // 내가 이길 판에 걸면 내가 버려야 하니, 원하는 판에는 안 건다.
      case 'bomb':       if (g.phase === 'draw' || !prize.length) return -1;
                         return expert ? (wantPrize < 0.35 ? 9 : wantPrize < 0.55 ? 4 : -1)
                                       : (wantPrize < 0.5 ? 6 : 1);
      // 교환권 — 서로 딴 것이 있어야 뜻이 있다. 상대가 앞서 있을수록 값어치가 크다.
      case 'trade':      return (!myAcq.length || !opAcq.length) ? -1
                              : expert ? (opDist <= myDist ? 8 : 4) : 5;
      case 'magnify':    return expert ? (g.phase === 'bidding' ? 5 : 2) : 3;
      case 'swap':       return g.centerDeck.length ? 2 : -1;
      // 눈금자 — 상대가 이 판을 얼마나 원하는지 알면 얼마를 지를지가 정해진다
      case 'scan':       return prize.length ? 2 : -1;
      default:           return 0;
    }
  };
  const best = held.map(id => ({ id, s: score(id) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0];
  return best ? best.id : null;
}

// 폭탄에 맞은 AI 가 무엇을 버리는가 — 세트에 안 쓸 카드부터
function bombJunk(hand, acq) {
  if (!hand.length) return null;
  const t = cpuTarget(acq, hand);
  return [...hand].sort((x, y) =>
    (x.kind === t ? 1 : 0) - (y.kind === t ? 1 : 0) || strength(y) - strength(x))[0];
}

// 손바꿈을 쓸 때 무엇을 내놓을까 — 세트에 안 쓰는 카드
function swapArg(g, me) {
  const hand = me === 1 ? g.p1Hand : g.p2Hand;
  const acq = me === 1 ? g.p1Acquired : g.p2Acquired;
  const kinds = new Set(acq.map((c) => c.kind));
  return (hand.find((c) => !kinds.has(c.kind)) || hand[0] || {}).id;
}

// 진 경매를 다시 할까. 아무 판에나 쓰면 정작 승부처에서 손에 없다.
function wantRedo(g, me, difficulty) {
  if (!g.itemMode || g.phase !== 'reveal' || !g.auction) return false;
  if (g.itemUsed[me] || !(g.items[me] || []).includes('redo')) return false;
  const p1W = g.fx && g.fx.reverse
    ? strength(g.auction.p1Bid) > strength(g.auction.p2Bid)
    : R2.aBeatsB(g.auction.p1Bid, g.auction.p2Bid);
  if ((p1W ? 1 : 2) === me) return false;            // 이긴 경매는 다시 하지 않는다
  if (difficulty === 'expert') {
    const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
    const opAcq = me === 1 ? g.p2Acquired : g.p1Acquired;
    const prize = [g.auction.centerCard, g.auction._offeredCard].filter(Boolean);
    const want = prize.length
      ? Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, opAcq)), denyValue(prize, opAcq)) : 0;
    if (want < 0.35 && g.centerDeck.length > 4) return false;
    return true;
  }
  return Math.random() <= 0.75;
}

__ff_m.exports = { mixItemCards, drawCenter, pickItem, bombJunk, swapArg, wantRedo, AI_USE_RATE };
if (typeof window !== 'undefined') window.ITEMS2 = __ff_m.exports;
})();
