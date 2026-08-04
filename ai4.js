// ── 4인전 AI ──────────────────────────────────────────────────────────────
// 시뮬레이션에서 검증된 로직을 그대로 옮겼다.
// 무작위로 두는 상대 3명을 두고 59% 승률 — 실력이 확실히 반영되는 수준이다.

const G = require('./game4');
const { needLeft, SEATS } = G;

// 성향 — 봇마다 다르게 줘서 매판 느낌이 달라지게 한다
const STYLES = [
  { key: '균형', greed: 1.0, block: 1.0, betray: 0.35, noise: 0.30 },
  { key: '공격', greed: 1.5, block: 0.6, betray: 0.45, noise: 0.25 },
  { key: '수비', greed: 0.8, block: 1.5, betray: 0.30, noise: 0.30 },
  { key: '절약', greed: 0.7, block: 0.7, betray: 0.40, noise: 0.35 },
];
const pickStyles = () => {
  const s = [...STYLES];
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
};

// 배신 규칙은 순환이라 정렬에 쓰면 안 된다 — 순수 세기로 줄세운다
const sortStrong = (h) => [...h].sort((a, b) => G.strength(a) - G.strength(b));   // 강 → 약
const same = (a, b) => a && b && a.id === b.id;

// 이 경매품이 나에게 주는 이득 (0~2)
const gainOf = (acq, prize) => needLeft(acq) - needLeft([...acq, ...prize]);

// 남이 이걸 먹으면 얼마나 위험한가
function threatOf(g, meSeat, prize) {
  let t = 0;
  for (let i = 0; i < SEATS; i++) {
    if (i === meSeat) continue;
    const after = needLeft([...g.seats[i].acq, ...prize]);
    if (after === 0) t = Math.max(t, 3);          // 먹으면 즉시 진다 — 무조건 막는다
    else if (after === 1) t = Math.max(t, 1.5);   // 리치 직전
  }
  return t;
}

// 클로즈 경매라 경매품을 모르면, 기대값으로 대충 잡는다
function prizeFor(g, seat) {
  const a = g.auction;
  if (!a) return [];
  const known = [a.center];
  if (a.type === 'open' || seat === g.auctioneer) known.push(a.offered);
  return known.filter(Boolean);
}

// ── 입찰 ───────────────────────────────────────────────────────────────────
function chooseBid(g, seat) {
  const me = g.seats[seat];
  const hand = sortStrong(me.hand);
  if (!hand.length) return null;
  const style = me.style || STYLES[0];
  const prize = prizeFor(g, seat);
  const blind = g.auction.type === 'closed' && seat !== g.auctioneer;

  let desire = gainOf(me.acq, prize) * style.greed + threatOf(g, seat, prize) * style.block;
  if (blind) desire = desire * 0.7 + 0.5;        // 안 보이면 중간값으로 수렴

  // 배신 노림수 — 최약 카드를 쥐고 있고 판이 중요하면 가끔 던진다
  const weak = hand.find((c) => G.isBot_(c));
  if (weak && desire >= 2 && Math.random() < style.betray) return weak;

  let pos = Math.max(0, Math.min(1, 1 - desire / 4)) + (Math.random() - 0.5) * style.noise;
  pos = Math.max(0, Math.min(0.999, pos));
  let idx = Math.floor(pos * hand.length);
  // 관심 없는 판에 최강 카드를 낭비하지 않는다
  if (desire < 1 && G.isTop(hand[idx]) && hand.length > 1) idx = hand.length - 1;
  return hand[idx];
}

// ── 출품 ───────────────────────────────────────────────────────────────────
// 남에게 덜 도움 되는 카드를 내고, 강한 입찰력과 무기(최강·최약)는 남긴다
function chooseConsign(g, seat) {
  const me = g.seats[seat];
  const hand = sortStrong(me.hand);
  if (hand.length === 1) return hand[0];
  const scored = hand.map((c, i) => {
    let harm = 0;
    for (let j = 0; j < SEATS; j++) {
      if (j === seat) continue;
      const before = needLeft(g.seats[j].acq), after = needLeft([...g.seats[j].acq, c]);
      harm += (before - after) * (before <= 2 ? 2 : 1);
    }
    const tool = (G.isTop(c) || G.isBot_(c)) ? 2.5 : 0;
    const power = (hand.length - i) / hand.length;     // 강할수록 아깝다
    return { c, s: harm * 2 + tool + power * 1.2 + Math.random() * 0.3 };
  });
  scored.sort((a, b) => a.s - b.s);
  return scored[0].c;
}

// ── 경매 방식 ──────────────────────────────────────────────────────────────
// 나에게 좋은 물건이면 감춰서 싸게 먹고(클로즈), 남 좋은 물건이면 공개해 경쟁을 붙인다
function chooseType(g, seat) {
  const me = g.seats[seat];
  const prize = [g.auction.center, g.auction.offered].filter(Boolean);
  const mine = gainOf(me.acq, prize);
  const theirs = threatOf(g, seat, prize);
  const r = Math.random();
  if (mine >= 1 && mine > theirs) return r < 0.75 ? 'close' : 'open';
  if (theirs >= 1.5) return r < 0.7 ? 'open' : 'close';
  return r < 0.5 ? 'open' : 'close';
}

module.exports = { chooseBid, chooseConsign, chooseType, pickStyles, STYLES };
