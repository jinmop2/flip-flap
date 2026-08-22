// 아이템전 — 캐주얼 이벤트 모드용 아이템 13종
//
// 설계 원칙
//  · 획득은 "경매 패자 위로금" — 지는 쪽에 아이템이 쌓여 자동으로 밸런싱된다.
//  · 전설 티어는 세트 진행이 뒤진 쪽에게만 나온다 (앞선 쪽이 더 강해지는 눈덩이 차단).
//  · 모든 효과는 서버에서만 계산한다. 클라이언트는 "무엇을 썼는지"만 보낸다.
//
// ── 한 번 갈아엎었다 ──────────────────────────────────────────────────
// 아이템 하나만 매 턴 쥐어 주고 8000판씩 돌려 승률을 쟀다(50% = 있으나 마나).
// 절반이 판에 닿지도 않고 있었다.
//   모래시계 +0.9%p · 소매치기 −1.2%p · 에누리 −0.4%p · 재경매 −0.3%p
//   운명의 주사위 +0.5%p · 뒤집개 +0.3%p
// 반대로 몇은 판을 혼자 정했다.
//   도둑고양이 +42.9%p · 복사기 +27.8%p · 연막탄 +20.7%p
// 그래서
//   · 모래시계는 뺐다 — g.time 을 깎는데 그 값은 시계 말고 아무도 안 읽는다.
//     AI 전에서는 시간 압박 자체가 없어 아무 일도 일어나지 않았다.
//   · 소매치기(뺏고 하나 주기 = 순 교환)는 교환권으로 바꿨다.
//   · 에누리(배팅 카드 회수)는 뺐다 — 손패는 교환으로 어차피 유지된다.
//   · 운명의 주사위(새로 뽑기)는 고르기로 바꿨다 — 무작위는 평균이 그대로다.
//   · 재경매는 "상대는 방금 낸 카드를 못 쓴다" 를 붙였다. 없으면 또 진다.
//   · 도둑고양이는 뺏어 오지 않고 덱으로 돌려보낸다.
//   · 연막탄은 전설로 올렸다.
//   · 폭탄·눈금자를 새로 넣었다. 폭탄은 이 카탈로그에서 유일하게
//     "이기면 손해" 를 만드는 물건이다.
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
  scan: {
    name: '눈금자', icon: '📏', tier: 'common',
    desc: '이번 경매품이 상대에게 얼마나 쓸모 있는지 본다',
    phases: PRE_BID,
    apply({ g, me, opp }) {
      if (!g.auction || !g.auction.centerCard) return { error: '아직 경매품이 없어요.' };
      const opAcq = opp === 1 ? g.p1Acquired : g.p2Acquired;
      const cnt = {};
      for (const c of opAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
      const prize = [g.auction.centerCard, g.auction._offeredCard].filter(Boolean);
      let best = 0;
      for (const c of prize) {
        const need = (SPEC_NEED[c.kind] || 99) - (cnt[c.kind] || 0);
        best = Math.max(best, need <= 0 ? 1 : 1 / need);
      }
      const lv = best >= 0.5 ? 2 : best >= 0.34 ? 1 : 0;
      g.fx.scan[me] = lv;
      return { ok: true, msg: ['상대에겐 별 쓸모가 없다', '상대에게 쓸 만하다', '상대가 간절히 원한다'][lv] };
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
      // 카드 id는 숫자지만 전송 경로에 따라 문자열로 올 수 있다. 타입에 관대하게 비교한다.
      const i = hand.findIndex(c => String(c.id) === String(arg));
      if (i < 0) return { error: '내 손패의 카드가 아니에요.' };
      const out = hand[i];
      hand[i] = g.centerDeck.shift();
      g.centerDeck.push(out);            // 버린 카드는 덱 맨 아래로
      return { ok: true, msg: '손패를 덱의 카드와 바꿨다!', reveal: { got: hand[i] } };
    },
  },

  // ── 희귀 ─────────────────────────────────────────────
  smoke: {
    name: '연막탄', icon: '💨', tier: 'legend',
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
  trade: {
    name: '교환권', icon: '🔁', tier: 'rare',
    desc: '내가 딴 카드 1장과 상대가 딴 카드 1장을 맞바꾼다',
    phases: PRE_BID,
    apply({ g, me, opp }) {
      const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
      const opAcq = opp === 1 ? g.p1Acquired : g.p2Acquired;
      if (!myAcq.length || !opAcq.length) return { error: '서로 딴 카드가 있어야 해요.' };
      // 나는 안 쓰는 종류를 주고, 내가 모으는 종류를 받아 온다.
      // 상대의 리치는 건드리지 않는다 — 도둑고양이보다 순한 물건이다.
      const mine = {}, theirs = {};
      for (const c of myAcq) mine[c.kind] = (mine[c.kind] || 0) + 1;
      for (const c of opAcq) theirs[c.kind] = (theirs[c.kind] || 0) + 1;
      let want = myAcq[0].kind, wr = -1;
      for (const k of Object.keys(mine)) { const r = mine[k] / (SPEC_NEED[k] || 99); if (r > wr) { wr = r; want = Number(k); } }
      const give = [...myAcq].sort((x, y) => (x.kind === want ? 1 : 0) - (y.kind === want ? 1 : 0))[0];
      const safe = opAcq.filter(c => theirs[c.kind] < (SPEC_NEED[c.kind] || 99) - 1);
      const pool = (safe.length ? safe : opAcq);
      const take = [...pool].sort((x, y) => (y.kind === want ? 1 : 0) - (x.kind === want ? 1 : 0))[0];
      myAcq.splice(myAcq.indexOf(give), 1); opAcq.splice(opAcq.indexOf(take), 1);
      myAcq.push(take); opAcq.push(give);
      return { ok: true, msg: '전리품을 맞바꿨다!', reveal: { got: take, gave: give } };
    },
  },
  bomb: {
    name: '폭탄', icon: '💣', tier: 'rare',
    desc: '경매품에 폭탄을 얹는다 — 낙찰받은 쪽이 손패 1장을 버린다',
    phases: ['offer', 'choose_type', 'bidding'],
    apply({ g, me }) {
      if (!g.auction) return { error: '아직 경매가 안 열렸어요.' };
      if (g.fx.bomb) return { error: '이미 폭탄이 얹혀 있어요.' };
      // 나도 이 경매를 이기면 버려야 한다 — 그래서 '이겨도 되나' 를 묻는 물건이다
      g.fx.bomb = me;
      return { ok: true, msg: '경매품에 폭탄을 얹었다 — 먹는 쪽이 손해!' };
    },
  },
  ward: {
    name: '부적', icon: '🧿', tier: 'rare',
    desc: '상대의 다음 아이템 1개를 이번 턴 동안 막는다',
    phases: PRE_BID,
    apply({ g, me }) {
      g.fx.ward[me] = true;
      return { ok: true, msg: '부적을 걸었다 — 상대의 다음 아이템을 막는다!' };
    },
  },
  redo: {
    // 봉인을 붙이고 나니 rare 치고 너무 셌다(+17.6%p — 다른 rare 는 +0.3~3.9%p).
    // 전설로 올린다. 전설은 뒤진 쪽에만 나오므로 고무줄로도 맞다.
    name: '재경매', icon: '📢', tier: 'legend',
    desc: '진 경매를 무효로 하고 다시 배팅한다',
    phases: ['reveal'],          // 결과가 보인 뒤, 진 사람만
    loserOnly: true,
    apply({ g, me }) {
      const a = g.auction;
      if (!a || !a.p1Bid || !a.p2Bid) return { error: '지금은 쓸 수 없어요.' };
      // 배팅 카드를 각자 손으로 돌려주고 배팅 단계로 되돌린다 (경매품·방식은 유지)
      const opp = me === 1 ? 2 : 1;
      // 손으로 돌려주기 전에 읽어 둔다 — 아래에서 null 로 지우기 때문이다
      const opBid = opp === 1 ? a.p1Bid : a.p2Bid;
      const myBid = me === 1 ? a.p1Bid : a.p2Bid;
      (g.p1Hand).push(a.p1Bid); (g.p2Hand).push(a.p2Bid);
      a.p1Bid = null; a.p2Bid = null; a.p1Submitted = false; a.p2Submitted = false;
      // 방금 낸 카드는 양쪽 다 다시 못 쓴다.
      // 봉인이 없으면 똑같은 결과가 나와 "다시 해도 또 진다" 였다(승률 0.3%p 도 안 움직임).
      // 상대만 묶으면 이번엔 반대로 너무 셌다(+31%p) — 무르는 쪽도 제 카드를 태워야
      // "지금 무를 값어치가 있나" 라는 저울질이 생긴다.
      g.fx.banned[opp] = opBid ? opBid.id : null;
      g.fx.banned[me] = myBid ? myBid.id : null;
      g.fx.reverse = false;      // 이번 경매에 걸려 있던 승부 효과는 초기화
      g.phase = 'bidding';
      return { ok: true, msg: '경매를 다시 한다 — 방금 낸 카드는 둘 다 못 쓴다!', rebid: true };
    },
  },

  // ── 전설 ─────────────────────────────────────────────
  steal: {
    name: '도둑고양이', icon: '🐈', tier: 'legend',
    desc: '상대가 낙찰받은 카드 1장을 덱으로 되돌린다',
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
      // 내 것으로 가져오면 한 번에 두 칸(상대 -1, 나 +1)이 움직여 너무 세다.
      // 재 보니 이 아이템 하나로 승률이 +42.9%p — 판을 혼자 정하는 수준이었다.
      // 덱 아래로 돌려보내는 것만으로도 상대의 세트는 충분히 무너진다.
      g.centerDeck.push(target);
      return { ok: true, msg: '상대의 전리품을 덱으로 돌려보냈다!', reveal: { got: target } };
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
      // 진행자는 출품 1장 + 배팅 1장이 필요하다. 2장 미만이면 뺏는 순간 낼 카드가 없어 판이 멈춘다.
      const myHand = me === 1 ? g.p1Hand : g.p2Hand;
      if (myHand.length < 2) return { error: '손패가 2장 이상이어야 진행자를 뺏을 수 있어요.' };
      g.auctioneer = me;
      return { ok: true, msg: '진행자 자리를 빼앗았다!' };
    },
  },
  pick3: {
    name: '고르기', icon: '🎴', tier: 'legend',
    desc: '덱 맨 위 3장을 보고 그중 하나를 이번 중앙 카드로 고른다',
    phases: ['choose_type', 'bidding'],
    apply({ g, me }) {
      const a = g.auction;
      if (!a || !a.centerCard) return { error: '아직 경매품이 없어요.' };
      if (g.centerDeck.length < 2) return { error: '덱에 카드가 부족해요.' };
      // 예전 '운명의 주사위' 는 새로 뽑기만 해서 평균이 그대로였다 — 재 보니 +0.5%p.
      // 골라 오게 하면 확실한 이득이 된다(+4.7%p).
      const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
      const cnt = {};
      for (const c of myAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
      const top = g.centerDeck.slice(0, 3);
      let want = top[0], bestScore = -1;
      for (const c of top) {
        const need = (SPEC_NEED[c.kind] || 99) - (cnt[c.kind] || 0);
        const score = need <= 0 ? 0 : 1 / need;
        if (score > bestScore) { bestScore = score; want = c; }
      }
      g.centerDeck.splice(g.centerDeck.indexOf(want), 1);
      g.centerDeck.push(a.centerCard);      // 원래 중앙 카드는 덱 맨 아래로
      a.centerCard = want;
      return { ok: true, msg: '덱을 훑어 원하는 카드를 골랐다!', reveal: { prize: [a.centerCard, a._offeredCard] } };
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
  // ward 도 여기에 둔다 = 이번 턴에만 살아 있다. 턴이 넘어가면 같이 지워진다.
  return { reverse: false, smokeAgainst: 0, noSwap: { 1: false, 2: false },
           peek: { 1: null, 2: null }, ward: { 1: false, 2: false },
           bomb: 0,                        // 경매품에 얹힌 폭탄 — 낙찰자가 1장 버린다
           banned: { 1: null, 2: null },   // 재경매로 다시 못 쓰게 된 카드
           scan: { 1: null, 2: null } };   // 눈금자로 읽은 '상대에게 얼마나 쓸모 있나'
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
  // 부적은 이번 턴에만 산다. 막을 것이 없는데 쓰면 그냥 버리는 셈이라 미리 막는다 —
  // 안 그러면 "썼는데 아무 일도 없었다" 가 되고, 그건 버그처럼 보인다.
  if (itemId === 'ward') {
    const opp = me === 1 ? 2 : 1;
    if (g.fx && g.fx.ward && g.fx.ward[me]) return '이미 부적을 걸어 두었어요.';
    if (g.itemUsed && g.itemUsed[opp]) return '상대가 이번 턴에 이미 아이템을 썼어요. 다음 턴에 거세요.';
    if (!(g.items && g.items[opp] && g.items[opp].length)) return '상대가 가진 아이템이 없어요.';
  }
  return null;
}

// 조사 고르기 — "돋보기이(가)" 처럼 적으면 읽다가 걸린다.
// 한글 마지막 글자에 받침이 있으면 앞쪽, 없으면 뒤쪽.
function josa(word, withJong, without) {
  const c = String(word || '').trim().slice(-1).charCodeAt(0);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return without;
  return (c - 0xac00) % 28 ? withJong : without;
}

function use(g, me, itemId, arg) {
  const bad = canUse(g, me, itemId);
  if (bad) return { error: bad };
  const opp = me === 1 ? 2 : 1;

  // 상대가 걸어 둔 부적 — 규칙에 맞는 사용이었을 때만 삼킨다(위에서 검사가 끝난 뒤다).
  // 부적으로 부적을 막지는 않는다. 그러면 먼저 건 쪽이 늘 이기는 선점 싸움이 된다.
  if (itemId !== 'ward' && g.fx && g.fx.ward && g.fx.ward[opp]) {
    g.fx.ward[opp] = false;                        // 부적은 한 번 쓰고 사라진다
    const held = g.items[me];
    held.splice(held.indexOf(itemId), 1);          // 막힌 아이템도 사라진다
    g.itemUsed[me] = true;
    const nm = ITEMS[itemId].name;
    return { ok: true, blocked: true, itemId, name: nm, icon: ITEMS[itemId].icon,
             msg: `부적에 막혔다! ${nm}${josa(nm, '이', '가')} 사라졌다` };
  }

  const out = ITEMS[itemId].apply({ g, me, opp, arg });
  if (out.error) return out;
  // 소모 + 턴당 1회 제한
  const held = g.items[me];
  held.splice(held.indexOf(itemId), 1);
  g.itemUsed[me] = true;
  return { ...out, itemId, name: ITEMS[itemId].name, icon: ITEMS[itemId].icon };
}

// tier 를 주면 그 등급에서만 뽑는다 — 보너스 카드(공짜)는 일반만 준다.
// 공짜로 전설이 나오면 그 한 장이 판을 정한다.
function grant(g, who, tier) {
  g.items[who] ||= [];
  if (g.items[who].length >= MAX_HOLD) return null;   // 가득 차면 획득하지 않음
  const behind = isBehind(g, who);
  const pool = tier && BY_TIER[tier] && BY_TIER[tier].length ? BY_TIER[tier] : null;
  const id = pool ? pool[Math.floor(Math.random() * pool.length)] : rollItem(behind);
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
