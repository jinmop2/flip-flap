// 아이템전 — 캐주얼 이벤트 모드용 아이템 12종
//
// 설계 원칙
//  · 획득은 "경매 패자 위로금" — 지는 쪽에 아이템이 쌓여 자동으로 밸런싱된다.
//  · 전설 티어는 세트 진행이 뒤진 쪽에게만 나온다 (앞선 쪽이 더 강해지는 눈덩이 차단).
//  · 모든 효과는 서버에서만 계산한다. 클라이언트는 "무엇을 썼는지"만 보낸다.
//
// apply(ctx) 규약
//  ctx = { g, me, opp, arg, helpers }   me/opp 는 1 또는 2
//  성공 → { ok: true, msg, fx? }   실패 → { error }

const SPEC_NEED = { 2: 2, 3: 3, 4: 4, 6: 6 };

// 배팅 전(=승부에 개입 가능한) 페이즈
const PRE_BID = ['draw', 'offer', 'choose_type', 'bidding'];

const ITEMS = {
  // ── 일반 ─────────────────────────────────────────────
  magnify: {
    name: '돋보기', icon: '🔍', tier: 'common',
    desc: '상대 손패 2장을 훔쳐본다',
    phases: PRE_BID,
    apply({ g, me, opp }) {
      const hand = opp === 1 ? g.p1Hand : g.p2Hand;
      if (!hand.length) return { error: '상대 손패가 비어 있어요.' };
      const picked = shuffle(hand.slice()).slice(0, 2);
      g.fx.peek[me] = picked.map(c => ({ ...c }));   // 스냅샷 (이후 손패가 바뀌어도 그대로)
      return { ok: true, msg: `상대 손패 ${picked.length}장을 엿봤다!` };
    },
  },
  hourglass: {
    name: '모래시계', icon: '⏳', tier: 'common',
    desc: '상대의 남은 시간을 30초 깎는다',
    phases: PRE_BID,
    apply({ g, opp }) {
      const before = g.time[opp];
      g.time[opp] = Math.max(10, before - 30);
      return { ok: true, msg: `상대 시간 -${before - g.time[opp]}초!` };
    },
  },
  swap: {
    name: '손바꿈', icon: '🔀', tier: 'common',
    desc: '내 손패 1장을 덱의 카드와 바꾼다',
    phases: PRE_BID,
    needsCard: true,
    apply({ g, me, arg }) {
      if (!g.centerDeck.length) return { error: '덱에 카드가 없어요.' };
      const hand = me === 1 ? g.p1Hand : g.p2Hand;
      const i = hand.findIndex(c => c.id === arg);
      if (i < 0) return { error: '내 손패의 카드가 아니에요.' };
      const out = hand[i];
      hand[i] = g.centerDeck.shift();
      g.centerDeck.push(out);            // 버린 카드는 덱 맨 아래로
      return { ok: true, msg: '손패를 덱의 카드와 바꿨다!', reveal: { got: hand[i] } };
    },
  },

  // ── 희귀 ─────────────────────────────────────────────
  smoke: {
    name: '연막탄', icon: '💨', tier: 'rare',
    desc: '이번 경매품을 상대에게만 가린다',
    phases: ['offer', 'choose_type', 'bidding'],
    apply({ g, opp }) {
      if (!g.auction) return { error: '지금은 쓸 수 없어요.' };
      g.fx.smokeAgainst = opp;
      return { ok: true, msg: '상대의 시야를 가렸다!' };
    },
  },
  flip: {
    name: '뒤집개', icon: '🔄', tier: 'rare',
    desc: '이번 경매만 약한 카드가 이긴다',
    phases: PRE_BID,
    apply({ g }) {
      if (g.fx.reverse) return { error: '이미 뒤집혀 있어요.' };
      g.fx.reverse = true;
      return { ok: true, msg: '이번 경매는 약한 카드가 이긴다!' };
    },
  },
  pickpocket: {
    name: '소매치기', icon: '🪝', tier: 'rare',
    desc: '상대 손패 1장을 뺏고 내 카드 1장을 넘긴다',
    phases: PRE_BID,
    apply({ g, me, opp }) {
      const myHand = me === 1 ? g.p1Hand : g.p2Hand;
      const opHand = opp === 1 ? g.p1Hand : g.p2Hand;
      if (!opHand.length || !myHand.length) return { error: '손패가 부족해요.' };
      const oi = Math.floor(Math.random() * opHand.length);
      const mi = Math.floor(Math.random() * myHand.length);
      const got = opHand.splice(oi, 1)[0];
      const gave = myHand.splice(mi, 1)[0];
      myHand.push(got); opHand.push(gave);
      return { ok: true, msg: '상대 카드를 슬쩍했다!', reveal: { got, gave } };
    },
  },
  discount: {
    name: '에누리', icon: '💰', tier: 'rare',
    desc: '이번 경매를 이겨도 배팅 카드를 뺏기지 않는다',
    phases: PRE_BID,
    apply({ g, me }) {
      g.fx.noSwap[me] = true;
      return { ok: true, msg: '배팅 카드를 지킨다!' };
    },
  },
  redo: {
    name: '재경매', icon: '📢', tier: 'rare',
    desc: '진 경매를 무효로 하고 다시 배팅한다',
    phases: ['reveal'],          // 결과가 보인 뒤, 진 사람만
    loserOnly: true,
    apply({ g, me }) {
      const a = g.auction;
      if (!a || !a.p1Bid || !a.p2Bid) return { error: '지금은 쓸 수 없어요.' };
      // 배팅 카드를 각자 손으로 돌려주고 배팅 단계로 되돌린다 (경매품·방식은 유지)
      (g.p1Hand).push(a.p1Bid); (g.p2Hand).push(a.p2Bid);
      a.p1Bid = null; a.p2Bid = null; a.p1Submitted = false; a.p2Submitted = false;
      g.fx.reverse = false;      // 이번 경매에 걸려 있던 승부 효과는 초기화
      g.phase = 'bidding';
      return { ok: true, msg: '경매를 다시 한다!', rebid: true };
    },
  },

  // ── 전설 ─────────────────────────────────────────────
  steal: {
    name: '도둑고양이', icon: '🐈', tier: 'legend',
    desc: '상대가 낙찰받은 카드 1장을 훔친다',
    phases: PRE_BID,
    apply({ g, me, opp }) {
      const opAcq = opp === 1 ? g.p1Acquired : g.p2Acquired;
      const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
      if (!opAcq.length) return { error: '상대가 가져간 카드가 없어요.' };
      // 세트 완성 직전(리치)인 종류는 건드리지 않는다 — 캐주얼 모드에서 과한 분노 방지
      const cnt = {};
      for (const c of opAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
      const safe = opAcq.filter(c => cnt[c.kind] < (SPEC_NEED[c.kind] || 99) - 1);
      const pool = safe.length ? safe : opAcq;      // 전부 리치면 아이템이 낭비되지 않게 허용
      const target = pool[Math.floor(Math.random() * pool.length)];
      opAcq.splice(opAcq.indexOf(target), 1);
      myAcq.push(target);
      return { ok: true, msg: '상대의 전리품을 훔쳤다!', reveal: { got: target } };
    },
  },
  copy: {
    name: '복사기', icon: '🖨️', tier: 'legend',
    desc: '내가 낙찰받은 카드 1장을 복제한다',
    phases: PRE_BID,
    apply({ g, me }) {
      const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
      if (!myAcq.length) return { error: '아직 가져간 카드가 없어요.' };
      // 세트에 가장 가까운 종류를 복제해 준다 (가장 도움이 되는 선택)
      let best = myAcq[0], bestScore = -1;
      const cnt = {};
      for (const c of myAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
      for (const c of myAcq) {
        const need = SPEC_NEED[c.kind] || 99;
        const score = cnt[c.kind] / need;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      const dup = { ...best, id: 'copy_' + best.id + '_' + myAcq.length, copied: true };
      myAcq.push(dup);
      return { ok: true, msg: `${best.kind}번 카드를 복제했다!`, reveal: { got: dup } };
    },
  },
  tyrant: {
    name: '폭군', icon: '👑', tier: 'legend',
    desc: '이번 턴 진행자 권한을 뺏는다',
    phases: ['draw'],            // 중앙 카드를 뽑기 전에만
    apply({ g, me }) {
      if (g.auctioneer === me) return { error: '이미 내가 진행자예요.' };
      g.auctioneer = me;
      return { ok: true, msg: '진행자 자리를 빼앗았다!' };
    },
  },
  dice: {
    name: '운명의 주사위', icon: '🎲', tier: 'legend',
    desc: '경매품 2장을 덱에서 새로 뽑아 바꾼다',
    phases: ['choose_type', 'bidding'],
    apply({ g }) {
      const a = g.auction;
      if (!a || !a.centerCard || !a._offeredCard) return { error: '아직 경매품이 없어요.' };
      if (g.centerDeck.length < 2) return { error: '덱에 카드가 부족해요.' };
      const old = [a.centerCard, a._offeredCard];
      a.centerCard = g.centerDeck.shift();
      a._offeredCard = g.centerDeck.shift();
      g.centerDeck.push(...old);   // 기존 경매품은 덱 맨 아래로
      return { ok: true, msg: '경매품이 통째로 바뀌었다!', reveal: { prize: [a.centerCard, a._offeredCard] } };
    },
  },
};

// ── 드롭 ───────────────────────────────────────────────
const BY_TIER = { common: [], rare: [], legend: [] };
for (const [id, it] of Object.entries(ITEMS)) BY_TIER[it.tier].push(id);

const MAX_HOLD = 3;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 경매 패자에게 줄 아이템 1개 추첨.
// behind=true(세트 진행이 뒤진 쪽)일 때만 전설이 나온다.
function rollItem(behind) {
  const r = Math.random();
  let tier = r < 0.60 ? 'common' : r < 0.92 ? 'rare' : 'legend';
  if (tier === 'legend' && !behind) tier = 'rare';
  const pool = BY_TIER[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

// 이번 경매에만 걸리는 효과들 — 매 턴 초기화
function freshFx() {
  return { reverse: false, smokeAgainst: 0, noSwap: { 1: false, 2: false }, peek: { 1: null, 2: null } };
}

// 사용 가능 여부 검사 (서버에서만 호출)
function canUse(g, me, itemId) {
  if (!Object.prototype.hasOwnProperty.call(ITEMS, itemId)) return '없는 아이템이에요.';
  const held = g.items && g.items[me];
  if (!held || !held.includes(itemId)) return '가지고 있지 않은 아이템이에요.';
  if (g.itemUsed && g.itemUsed[me]) return '이번 턴엔 이미 아이템을 썼어요.';
  const it = ITEMS[itemId];
  if (!it.phases.includes(g.phase)) return '지금은 쓸 수 없는 아이템이에요.';
  // 배팅을 이미 낸 뒤에는 승부에 개입할 수 없다 (뒷북 방지)
  if (g.phase === 'bidding' && g.auction) {
    const submitted = me === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
    if (submitted) return '배팅을 낸 뒤에는 쓸 수 없어요.';
  }
  return null;
}

function use(g, me, itemId, arg) {
  const bad = canUse(g, me, itemId);
  if (bad) return { error: bad };
  const opp = me === 1 ? 2 : 1;
  const out = ITEMS[itemId].apply({ g, me, opp, arg });
  if (out.error) return out;
  // 소모 + 턴당 1회 제한
  const held = g.items[me];
  held.splice(held.indexOf(itemId), 1);
  g.itemUsed[me] = true;
  return { ...out, itemId, name: ITEMS[itemId].name, icon: ITEMS[itemId].icon };
}

function grant(g, who) {
  g.items[who] ||= [];
  if (g.items[who].length >= MAX_HOLD) return null;   // 가득 차면 획득하지 않음
  const behind = isBehind(g, who);
  const id = rollItem(behind);
  g.items[who].push(id);
  return { id, name: ITEMS[id].name, icon: ITEMS[id].icon, tier: ITEMS[id].tier, desc: ITEMS[id].desc };
}

// 세트 진행도가 상대보다 뒤처져 있는가 (전설 드롭 조건)
function isBehind(g, who) {
  const rate = acq => {
    const cnt = {};
    for (const c of acq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
    let best = 0;
    for (const k of Object.keys(cnt)) best = Math.max(best, cnt[k] / SPEC_NEED[k]);
    return best;
  };
  const mine = rate(who === 1 ? g.p1Acquired : g.p2Acquired);
  const theirs = rate(who === 1 ? g.p2Acquired : g.p1Acquired);
  return mine < theirs;
}

// 클라이언트에 내려줄 카탈로그 (효과 함수 제외)
const CATALOG = Object.fromEntries(Object.entries(ITEMS).map(([id, it]) =>
  [id, { name: it.name, icon: it.icon, tier: it.tier, desc: it.desc, phases: it.phases, needsCard: !!it.needsCard, loserOnly: !!it.loserOnly }]));

module.exports = { ITEMS, CATALOG, MAX_HOLD, use, canUse, grant, freshFx, rollItem, isBehind };
