// ── 그물 없이 두는 판 ─────────────────────────────────────────────────────
//
// 서버가 없을 때 화면이 혼자 판을 굴린다. 규칙(rules2)과 상대(ai2)는 서버가
// 쓰는 바로 그 파일이라, 온라인에서 두던 것과 판정도 상대도 같다.
//
// 여기 있는 것은 "서버가 하던 살림살이" 뿐이다 — 언제 뽑고 언제 기다리고
// 무엇을 화면에 보내는지. 규칙은 하나도 안 적는다. 규칙을 여기에 또 적으면
// 언젠가 온라인과 오프라인의 판정이 갈라진다.
//
// 코인·경험치·등급은 주지 않는다. 그건 서버만 줄 수 있다 — 화면이 주면
// 아무나 만들어 낼 수 있다. 오프라인 판은 연습이지 기록이 아니다.
(function () {
'use strict';

const R = window.RULES2, A = window.AI2;   // 없으면 클래식만 못 연다 — 다른 모드는 자기 엔진을 쓴다
const IT = window.ITEMS_M, I2 = window.ITEMS2;   // 아이템전 — 효과는 items, 셈은 items2

const AI_SEAT = 2;                          // 사람은 늘 1번, 상대가 2번
let g = null;                               // 지금 굴러가는 판
let diff = 'normal';
let onState = null;                         // 화면에 상태를 건네는 통로
let onOver = null;
let timer = null;

const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
const handOf = (seat) => (seat === 1 ? g.p1Hand : g.p2Hand);
const acqOf = (seat) => (seat === 1 ? g.p1Acquired : g.p2Acquired);

function push() { if (g && onState) onState(R.stateFor(g, 0)); }

// 판 하나를 차린다. 서버의 createGame(classic) 과 같은 모양이라야
// 화면이 온라인과 똑같이 그린다.
function newGame(itemMode) {
  const deck = R.initDeck();
  const all = R.initDeck();
  const game = {
    centerDeck: deck.slice(0, 12),
    p1Hand: deck.slice(12, 18),
    p2Hand: deck.slice(18, 24),
    p1Acquired: [], p2Acquired: [],
    turn: 1, phase: 'pick', auctioneer: 1, auction: null,
    time: { 1: 300, 2: 300 },
    pick: { cards: [all[0], all.find((c) => c.id !== all[0].id)], choices: [null, null], revealed: false },
  };
  if (itemMode) {
    // 서버의 createGame(itemMode) 과 같은 차림. 아이템 덱은 화면에 안 내보낸다 —
    // 다음에 뭐가 나올지 보이면 안 된다.
    game.itemMode = true;
    I2.mixItemCards(game.centerDeck);
    game.itemDeck = IT.newItemDeck();
    game.items = { 1: [], 2: [] };
    game.itemUsed = { 1: false, 2: false };
    game.fx = IT.freshFx();
  }
  return game;
}

function startTurn() {
  g.auction = { centerCard: null, _offeredCard: null, auctionType: null,
                p1Bid: null, p2Bid: null, p1Submitted: false, p2Submitted: false, special: false };
  g.phase = 'draw';
  if (g.itemMode) {   // 이번 경매 한정 효과·사용권은 턴마다 초기화
    g.fx = IT.freshFx();
    g.itemUsed = { 1: false, 2: false };
  }
}

// 덱에서 한 장. 아이템전이면 보너스·덤 카드가 섞여 있는데, 그 처리는
// 서버가 쓰는 바로 그 함수(items2.drawCenter)가 한다.
function drawCenter() {
  if (I2) {
    const bonus = I2.drawCenter(g);
    // 보너스로 무엇을 얻었는지는 둘 다 본다 — 공개라야 셈에 넣을 수 있다
    for (const b of (bonus || [])) say('bonus_card', { seat: b.seat, item: b.item });
    return;
  }
  const card = g.centerDeck.shift();
  if (!card) { g.auction.centerCard = null; return; }
  g.auction.centerCard = card;
  g.phase = 'offer';
}

// ── 상대가 둔다 ───────────────────────────────────────────────────────────
function aiOffer() {
  const hand = handOf(AI_SEAT);
  if (!hand.length) return null;
  const card = diff === 'easy'
    ? A.cpuChooseOffer(hand, acqOf(AI_SEAT))
    : A.offerX(hand, acqOf(AI_SEAT), acqOf(1));
  // 손패에 없는 카드를 고르면 판이 조용히 멈춘다 — 서버도 같은 보호를 둔다
  return hand.find((c) => c.id === (card && card.id)) || hand[0];
}
function aiType() {
  const prize = [g.auction.centerCard, g.auction._offeredCard].filter(Boolean);
  const t = diff === 'easy'
    ? A.cpuChooseType(handOf(AI_SEAT), prize, acqOf(AI_SEAT), diff)
    : A.typeX(handOf(AI_SEAT), prize, acqOf(AI_SEAT), acqOf(1));
  return (t === 'open') ? 'open' : 'closed';
}
function aiBid() {
  const hand = handOf(AI_SEAT);
  if (!hand.length) return null;
  const prize = [g.auction.centerCard, g.auction._offeredCard].filter(Boolean);
  // 클로즈에서 뒤에 내는 쪽은 앞사람 카드를 보고 정한다 — 서버와 같은 조건
  const visOpp = (g.auction.auctionType === 'closed' && g.auction.p1Submitted) ? g.auction.p1Bid : null;
  const card = diff === 'easy'
    ? A.cpuDecideBid(hand, prize, acqOf(AI_SEAT), diff)
    : A.decideBidX(hand, prize, acqOf(AI_SEAT), acqOf(1), visOpp, g.centerDeck.length);
  return hand.find((c) => c.id === (card && card.id)) || hand[0];
}

// 상대가 아이템을 쓸지 정한다. 무엇을 쓸지는 items2 가 고른다 — 서버와 같은 셈이다.
function aiUseItem() {
  if (!g || !g.itemMode || !I2 || g.itemUsed[AI_SEAT]) return false;
  if (Math.random() > (I2.AI_USE_RATE[diff] !== undefined ? I2.AI_USE_RATE[diff] : 0.6)) return false;
  const id = I2.pickItem(g, AI_SEAT, diff);
  if (!id) return false;
  const arg = (id === 'swap') ? I2.swapArg(g, AI_SEAT) : undefined;
  if (id === 'swap' && !arg) return false;
  const out = IT.use(g, AI_SEAT, id, arg);
  if (out.error) return false;
  // 뭘 당했는지 모르면 억울하기만 하다. 엿본 카드(reveal)는 쓴 사람 몫이라 안 준다.
  say('item_used', { byMe: false, itemId: id, name: out.name, icon: out.icon, msg: out.msg,
                     blocked: !!out.blocked, reveal: null, fx: out.fx || null, seat: AI_SEAT });
  push();
  return true;
}

// 상대 차례면 잠깐 뒤에 둔다. 곧바로 두면 사람이 무슨 일이 일어났는지 못 본다.
function aiStep() {
  if (!g || g.phase === 'game_over') return;
  const me = AI_SEAT;
  // 아이템전 — 자기 차례가 오면 먼저 아이템을 쓸지 본다. 연출을 볼 시간을 주고 이어서 둔다.
  if (g.itemMode && !g.itemUsed[me] && ['draw', 'offer', 'choose_type', 'bidding'].includes(g.phase)) {
    const myTurn = ['draw', 'offer', 'choose_type'].includes(g.phase)
      ? g.auctioneer === me
      : !(g.auction && g.auction.p2Submitted);
    if (myTurn && aiUseItem()) return later(aiStep, 1500);
  }
  if (g.phase === 'pick' && g.pick.choices[1] === null) {
    return later(() => {
      if (!g || g.phase !== 'pick') return;
      const taken = g.pick.choices[0];
      g.pick.choices[1] = (taken === 0) ? 1 : 0;
      if (g.pick.choices[0] !== null) resolvePick();
      push(); aiStep();
    }, 700);
  }
  if (g.phase === 'draw' && g.auctioneer === me) {
    return later(() => { if (!g || g.phase !== 'draw') return; drawCenter(); push(); aiStep(); }, 700);
  }
  if (g.phase === 'offer' && g.auctioneer === me) {
    return later(() => {
      if (!g || g.phase !== 'offer') return;
      const c = aiOffer(); if (!c) return endByProgress();
      handOf(me).splice(handOf(me).indexOf(c), 1);
      g.auction._offeredCard = c;
      g.phase = 'choose_type';
      push(); aiStep();
    }, 900);
  }
  if (g.phase === 'choose_type' && g.auctioneer === me) {
    return later(() => {
      if (!g || g.phase !== 'choose_type') return;
      g.auction.auctionType = aiType();
      g.phase = 'bidding';
      push(); aiStep();
    }, 800);
  }
  if (g.phase === 'bidding' && !g.auction.p2Submitted) {
    // 클로즈는 순서제 — 진행자가 먼저 낸다. 서버의 activePlayer 와 같은 판단을 쓴다.
    if (R.activePlayer(g) !== me) return;
    return later(() => {
      if (!g || g.phase !== 'bidding' || g.auction.p2Submitted) return;
      const c = aiBid(); if (!c) return endByProgress();
      handOf(me).splice(handOf(me).indexOf(c), 1);
      g.auction.p2Bid = c; g.auction.p2Submitted = true;
      push();
      if (g.auction.p1Submitted) reveal(); else aiStep();
    }, 1000);
  }
}

function resolvePick() {
  const p = g.pick;
  const c1 = p.cards[p.choices[0]], c2 = p.cards[p.choices[1]];
  g.auctioneer = R.aBeatsB(c1, c2) ? 1 : 2;
  p.revealed = true;
  g.phase = 'pick_reveal';
  later(() => { if (!g) return; startTurn(); push(); aiStep(); }, 2200);
}

// 뒤집힌 채 한 박자 쉬고 공개 — 서버가 주는 긴장을 여기서도 준다
function reveal() {
  g.phase = 'showdown'; push();
  later(() => {
    if (!g || g.phase !== 'showdown') return;
    g.phase = 'reveal'; push();
    // 재경매는 공개 시점에만 쓸 수 있다. 여기서 안 봐 주면 AI 손에 영영 남는다.
    if (g.itemMode && I2) setTimeout(() => {
      if (!g || g.phase !== 'reveal' || !I2.wantRedo(g, AI_SEAT, diff)) return;
      const out = IT.use(g, AI_SEAT, 'redo');
      if (out.error) return;
      say('item_used', { byMe: false, itemId: 'redo', name: out.name, icon: out.icon,
                         msg: out.msg, reveal: null, fx: out.fx || null, seat: AI_SEAT });
      push(); later(aiStep, 900);
    }, 800);
    later(() => { if (!g || g.phase !== 'reveal') return; settle(); }, 2400);
  }, 1000);
}

function settle() {
  // 누가 이겼는지도, 카드가 어디로 가는지도 규칙이 정한다
  const d = R.judgeAuction(g);
  const tipCard = d.tipCard;
  if (d.special) say('special', {});
  R.applyAuction(g, d);

  if (g.itemMode) {
    // 폭탄 — 낙찰받은 쪽이 손패 1장을 버린다. 폭탄을 건 사람도 예외가 아니다.
    if (g.fx && g.fx.bomb) {
      const winner = d.p1Wins ? 1 : 2;
      const wHand = winner === 1 ? g.p1Hand : g.p2Hand;
      if (wHand.length && winner === AI_SEAT) {
        const junk = I2.bombJunk(wHand, winner === 1 ? g.p1Acquired : g.p2Acquired);
        wHand.splice(wHand.indexOf(junk), 1);
        say('bomb_blew', { seat: winner, card: junk });
      } else if (wHand.length) {
        g.bombPick = winner;              // 이 사람이 고를 때까지 판이 기다린다
        say('bomb_pick', { hand: wHand });
      }
    }
    // 덤이 얹힌 경매에서만 아이템이 나온다 — 그리고 진 쪽이 가져간다.
    // 앞선 쪽에 주면 눈덩이가 된다.
    if (tipCard) {
      const loser = d.p1Wins ? 2 : 1;
      const got = IT.give(g, loser, tipCard.itemId);   // 앞면으로 보여 준 바로 그 아이템
      if (got) say('tip_card', { seat: loser, item: got });
    }
  }

  const s1 = R.checkSet(g.p1Acquired), s2 = R.checkSet(g.p2Acquired);
  if (s1 || s2) {
    g.phase = 'game_over'; push();
    return later(() => onOver && onOver({ winner: s1 ? 1 : 2, setKind: s1 || s2, myIndex: 1 }), 1500);
  }
  if (!R.canContinue(g)) return endByProgress();
  g.phase = 'settled'; push();
  later(() => {
    if (!g || g.phase !== 'settled') return;
    g.turn++; g.auctioneer = g.auctioneer === 1 ? 2 : 1;
    startTurn(); push(); aiStep();
  }, 1600);
}

function endByProgress() {
  const w = R.resolveByProgress(g.p1Acquired, g.p2Acquired);
  g.phase = 'game_over'; push();
  later(() => onOver && onOver({ winner: w === 0 ? 1 : w, byProgress: true, myIndex: 1 }), 1200);
}

// ── 사람이 누른 것 ────────────────────────────────────────────────────────
// 서버로 보내던 신호를 그대로 받는다. 화면 코드는 어디로 가는지만 달라진다.
function act(ev, data) {
  if (!g || g.phase === 'game_over') return;
  data = data || {};
  if (ev === 'pick_card') {
    if (g.phase !== 'pick' || g.pick.choices[0] !== null) return;
    const slot = Number(data.slot);
    if (slot !== 0 && slot !== 1) return;
    if (g.pick.choices[1] === slot) return;          // 상대가 이미 집은 자리
    g.pick.choices[0] = slot;
    if (g.pick.choices[1] !== null) resolvePick();
    push(); aiStep(); return;
  }
  if (ev === 'draw_card') {
    if (g.phase !== 'draw' || g.auctioneer !== 1) return;
    drawCenter(); push(); aiStep(); return;
  }
  if (ev === 'offer_card') {
    if (g.phase !== 'offer' || g.auctioneer !== 1) return;
    const c = g.p1Hand.find((x) => String(x.id) === String(data.cardId));
    if (!c) return;
    g.p1Hand.splice(g.p1Hand.indexOf(c), 1);
    g.auction._offeredCard = c;
    g.phase = 'choose_type';
    push(); aiStep(); return;
  }
  if (ev === 'choose_auction') {
    if (g.phase !== 'choose_type' || g.auctioneer !== 1) return;
    g.auction.auctionType = (data.type === 'open') ? 'open' : 'closed';
    g.phase = 'bidding';
    push(); aiStep(); return;
  }
  // ── 아이템전 ──
  if (ev === 'use_item') {
    if (!g.itemMode || !IT) return;
    // 재경매는 '진 쪽'만 쓸 수 있다 — 이긴 사람이 물려서 판을 끄면 안 된다
    if (data.itemId === 'redo' && g.phase === 'reveal' && g.auction) {
      const rev = !!(g.fx && g.fx.reverse);
      const p1W = rev ? R.strength(g.auction.p1Bid) > R.strength(g.auction.p2Bid)
                      : R.aBeatsB(g.auction.p1Bid, g.auction.p2Bid);
      if (p1W) return say('item_fail', '이긴 경매는 다시 할 수 없어요.');
    }
    const out = IT.use(g, 1, data.itemId, data.cardId);
    if (out.error) return say('item_fail', out.error);
    say('item_used', { byMe: true, itemId: data.itemId, name: out.name, icon: out.icon,
                       msg: out.msg, blocked: !!out.blocked, reveal: out.reveal || null,
                       fx: out.fx || null, seat: 1 });
    push(); aiStep(); return;
  }
  if (ev === 'bomb_discard') {
    if (!g.itemMode || g.bombPick !== 1) return;
    const i = g.p1Hand.findIndex((c) => String(c.id) === String(data.cardId));
    if (i < 0) return;
    const gone = g.p1Hand.splice(i, 1)[0];
    g.bombPick = null;
    say('bomb_blew', { seat: 1, card: gone });
    push(); return;
  }
  if (ev === 'bid_card' || ev === 'submit_bid') {
    if (g.phase !== 'bidding' || g.auction.p1Submitted) return;
    if (R.activePlayer(g) !== 1) return;             // 클로즈 순서를 지킨다
    const c = g.p1Hand.find((x) => String(x.id) === String(data.cardId));
    if (!c) return;
    // 재경매로 묶인 카드는 다시 못 낸다 — 그게 이 아이템의 전부다
    if (g.itemMode && g.fx && g.fx.banned && g.fx.banned[1] === data.cardId)
      return say('item_error', '방금 낸 카드는 다시 낼 수 없어요.');
    g.p1Hand.splice(g.p1Hand.indexOf(c), 1);
    g.auction.p1Bid = c; g.auction.p1Submitted = true;
    push();
    if (g.auction.p2Submitted) reveal(); else aiStep();
    return;
  }
}

// ══ TWELVE ════════════════════════════════════════════════════════════════
// 규칙도 상대도 twelve.js 가 전부 쥔다 — 서버가 쓰는 그 파일이다. 여기서는
// 서버의 tvPush/tvBot 이 하던 살림살이만 옮겨 적는다.
const T = window.TWELVE;
let tg = null, tvTimer = null, tvNext = null, tvClockId = null, tvDiff = 'hard';
const tvLater = (fn, ms) => { clearTimeout(tvTimer); tvTimer = setTimeout(fn, ms); };

function tvPush() {
  if (!tg) return;
  say('tv_state', T.viewFor(tg, 1));
  if (tg.over) return tvFinish();
  // 정산은 저절로 넘어간다 — 여기서 버튼을 한 번 더 누르게 하면 흐름만 끊긴다
  if (tg.phase === 'settled') {
    clearTimeout(tvNext);
    tvNext = setTimeout(() => {
      if (!tg || tg.over || tg.phase !== 'settled') return;
      T.nextTurn(tg); tvPush(); tvBot();
    }, 2600);
  }
}
// AI 자리를 둘 수 있는 만큼 둔다. 사람 차례가 오면 멈춘다.
function tvBot() {
  if (!tg || tg.over) return;
  if (!T.applyAi(tg, 2, Math.random, tvDiff)) return;   // 둔 게 없으면 아무것도 안 보낸다
  tvPush();
  const wait = (tg.phase === 'bid' || tg.phase === 'close') ? 2200 : 1500;
  if (!tg.over) tvLater(tvBot, wait);
}
function tvFinish() {
  const gg = tg;
  clearTimeout(tvTimer); clearTimeout(tvNext); clearInterval(tvClockId);
  tvClockId = null;
  say('tv_over', { win: gg.winner === 1, endBy: gg.endBy, view: T.viewFor(gg, 1) });
}
function tvStart(d) {
  if (!T) return false;
  stopAll();
  tvDiff = ['easy', 'hard', 'expert'].includes(d && d.diff) ? d.diff : 'hard';
  const label = tvDiff === 'easy' ? '쉬움' : tvDiff === 'expert' ? '전문가' : '보통';
  tg = T.createGame({ first: 1 });
  say('tv_begin', { roomId: null, me: 1, vsBot: true,
                    nicks: [me(), 'TWELVE AI'],
                    profiles: [null, { nick: 'TWELVE AI', guest: true, cpuDiff: label }] });
  offNote();
  tvPush(); tvBot();
  tvClockId = setInterval(() => {
    if (!tg || tg.over) return;
    const ap = T.activePlayer(tg);
    if (ap) {
      tg.time[ap] = Math.max(0, tg.time[ap] - 1);
      if (tg.time[ap] <= 0) { T.timeout(tg, ap); return tvPush(); }
    }
    say('tv_clock', { time: tg.time, active: ap, me: 1 });
  }, 1000);
  return true;
}
function tvAct(data) {
  if (!tg || tg.over) return true;
  let ok = false;
  switch (data.act) {
    case 'draw':     ok = T.draw(tg, 1); break;
    case 'offer':    ok = tg.phase === 'choose' ? T.reoffer(tg, 1, data.cardId) : T.offer(tg, 1, data.cardId); break;
    case 'choose':   ok = T.chooseType(tg, 1, data.type); break;
    case 'raise':    ok = T.raise(tg, 1, data.amount); break;
    case 'fold':     ok = T.fold(tg, 1); break;
    case 'closeBet': ok = T.closeBet(tg, 1, data.amount); break;
    case 'take':     ok = T.closeTake(tg, 1); break;
    case 'decline':  ok = T.closeDecline(tg, 1); break;
    case 'next':     ok = T.nextTurn(tg); break;
    default: return true;
  }
  if (!ok) { tvPush(); return true; }
  tvPush();
  // 내가 두자마자 받아치면 정신이 없다 — 값을 부르는 대목은 더 길게
  tvLater(tvBot, (tg.phase === 'bid' || tg.phase === 'close') ? 1400 : 900);
  return true;
}

// ══ 다인전 ════════════════════════════════════════════════════════════════
// 판은 game4, 상대는 ai4, 무엇을 보여줄지는 view4 — 셋 다 서버가 쓰는 파일이다.
// 서버4의 step() 이 하던 일을 그대로 옮겨 적었다. 규칙은 한 줄도 안 적는다.
const G4 = window.GAME4, A4 = window.AI4;
const V4 = window.VIEW4 ? window.VIEW4.make(null) : null;
const QT = { draw: 650, offer: 750, type: 650, bid: 480, showdown: 900, reveal: 1150, settle: 1750, next: 260 };
let qg = null, qr = null, qTimer = null, qClockId = null;

const qHuman = (g) => {
  const isHuman = (i) => !qr.seats[i].isBot;
  if (g.phase === 'draw' || g.phase === 'offer' || g.phase === 'choose_type')
    return isHuman(g.auctioneer) ? g.auctioneer : null;
  if (g.phase === 'bidding') for (let i = 0; i < qr.seats.length; i++) if (isHuman(i) && G4.canBid(g, i)) return i;
  return null;
};
function qPush() { if (qg && V4) say('g4_state', V4.stateFor(qg, 0, null, qr)); }
function qLater(ms) { clearTimeout(qTimer); qTimer = setTimeout(() => { try { qStep(); } catch (e) { console.error(e); } }, ms); }
function qShowdown() { qg.phase = 'showdown'; qPush(); qLater(qg.auction && qg.auction.closed ? Math.round(QT.showdown / 2) : QT.showdown); }

function qStep() {
  if (!qg) return;
  const g = qg;
  switch (g.phase) {
    case 'game_over':
      clearInterval(qClockId); qClockId = null;
      qPush(); return say('g4_over', V4.stateFor(g, 0, null, qr));
    case 'draw':
      if (qHuman(g) === g.auctioneer) return qPush();
      G4.draw(g); qPush(); return qLater(QT.offer);
    case 'offer': {
      if (qHuman(g) === g.auctioneer) return qPush();
      const c = A4.chooseConsign(g, g.auctioneer);
      G4.offer(g, g.auctioneer, c.id); qPush(); return qLater(QT.type);
    }
    case 'choose_type':
      if (qHuman(g) === g.auctioneer) return qPush();
      G4.chooseType(g, g.auctioneer, A4.chooseType(g, g.auctioneer));
      qPush(); return qLater(QT.bid);
    case 'bidding': {
      if (qHuman(g) !== null) return qPush();
      const pending = [];
      for (let i = 0; i < qr.seats.length; i++) if (qr.seats[i].isBot && G4.canBid(g, i)) pending.push(i);
      if (pending.length) {
        const c = A4.chooseBid(g, pending[0]);
        if (c) G4.bid(g, pending[0], c.id);
        qPush();
        if (G4.allBidsIn(g)) return qShowdown();
        return qLater(QT.bid);
      }
      if (G4.allBidsIn(g) || !G4.bidderSeats(g).length) return qShowdown();
      return qPush();
    }
    case 'showdown': g.phase = 'reveal'; qPush(); return qLater(QT.reveal);
    case 'reveal':   G4.settle(g); qPush(); return qLater(QT.settle);
    case 'settled':  G4.advance(g); qPush(); return qLater(QT.next);
    default: return qPush();
  }
}
function qStart(d) {
  if (!G4 || !A4 || !V4) return false;
  stopAll();
  const n = (Number(d && d.n) === 3) ? 3 : 4;
  const names = [me()];
  for (let i = 1; i < n; i++) names.push('AI ' + i);
  qg = G4.createGame4(names, { n });
  // 서버의 방 자리표를 흉내 낸 것. 사람은 0번 하나, 나머지는 AI 다.
  qr = { seats: names.map((_, i) => ({ sid: i === 0 ? 'me' : null, isBot: i !== 0, token: null })),
         solo: true, rp: null, waitSeat: null, waitUntil: null };
  say('g4_begin', { roomId: null, me: 0, n, solo: true,
                    seats: qr.seats.map((x, i) => ({ name: names[i], isBot: x.isBot })) });
  offNote();
  qPush(); qLater(QT.next);
  qClockId = setInterval(() => {
    if (!qg || !qg.clock || qg.phase === 'game_over') return;
    const seat = qHuman(qg);
    if (seat === null) return;
    qg.clock[seat] = Math.max(0, (qg.clock[seat] || 0) - 1);
    say('g4_clock', { clock: qg.clock, seat });
  }, 1000);
  return true;
}
function qAct(data) {
  if (!qg) return true;
  const g = qg, mySeat = 0;
  let ok = false;
  if (data.type === 'draw' && g.phase === 'draw' && g.auctioneer === mySeat) ok = G4.draw(g);
  else if (data.type === 'offer' && g.phase === 'offer' && g.auctioneer === mySeat) ok = G4.offer(g, mySeat, data.cardId);
  else if (data.type === 'auctionType' && g.phase === 'choose_type' && g.auctioneer === mySeat) ok = G4.chooseType(g, mySeat, data.val);
  else if (data.type === 'bid' && g.phase === 'bidding') ok = G4.bid(g, mySeat, data.cardId);
  if (!ok) { qPush(); return true; }
  qPush(); qLater(QT.next);
  return true;
}

// ══ 공통 ══════════════════════════════════════════════════════════════════
// 서버가 쏘던 것을 화면에 그대로 건넨다. client.js 가 socket.on 으로 달아 둔
// 바로 그 자리로 간다 — 그래서 온라인과 오프라인이 같은 화면 코드를 쓴다.
function say(ev, data) { try { window.FFDELIVER && window.FFDELIVER(ev, data); } catch (e) { console.error(e); } }
function me() { try { return (typeof getNick === 'function' && getNick()) || '나'; } catch (_) { return '나'; } }
function offNote() {
  try { typeof toast === 'function' && toast('📴 인터넷 없이 두는 판이에요. 코인·전적은 안 쌓여요.', 3400); } catch (_) {}
}
function stopAll() {
  clearTimeout(timer); g = null;
  clearTimeout(tvTimer); clearTimeout(tvNext); clearInterval(tvClockId); tvClockId = null; tg = null;
  clearTimeout(qTimer); clearInterval(qClockId); qClockId = null; qg = null; qr = null;
}

const CLASSIC = ['pick_card', 'draw_card', 'offer_card', 'choose_auction', 'submit_bid', 'bid_card',
                 'use_item', 'bomb_discard'];

window.OFFLINE = {
  ready: true,
  start(difficulty, hooks, itemMode) {
    if (!R || !A) return false;
    if (itemMode && !(IT && I2)) return false;
    stopAll();
    diff = difficulty || 'normal';
    onState = hooks && hooks.onState;
    onOver = hooks && hooks.onOver;
    g = newGame(!!itemMode);
    push();
    aiStep();
  },
  act,
  stop: stopAll,
  live() { return !!(g || tg || qg); },
  // 어떤 모드를 그물 없이 열 수 있는지 — 화면이 버튼을 그릴 때 물어본다
  can(mode) {
    if (mode === 'classic') return !!(R && A);
    if (mode === 'item') return !!(R && A && IT && I2);
    if (mode === 'twelve') return !!T;
    if (mode === 'quad') return !!(G4 && A4 && V4);
    return false;
  },
  // 서버로 가던 신호를 가로챈다. 우리가 처리했으면 true.
  handle(ev, data) {
    data = data || {};
    if (g && CLASSIC.includes(ev)) { act(ev, data); return true; }
    if (tg && ev === 'tv_act') return tvAct(data);
    if (qg && ev === 'g4_act') return qAct(data);
    if ((tg || qg || g) && (ev === 'leave_room' || ev === 'g4_leave')) { stopAll(); return true; }
    // 시작 신호는 그물이 끊겼을 때만 받는다 — 붙어 있으면 서버가 여는 게 맞다
    if (window.FFONLINE ? window.FFONLINE() : (typeof navigator !== 'undefined' && navigator.onLine)) return false;
    if (ev === 'tv_solo') return tvStart(data);
    if (ev === 'g4_start') return qStart(data);
    return false;
  },
};

})();
