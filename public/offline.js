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

const R = window.RULES2, A = window.AI2;
if (!R || !A) return;                       // 규칙이나 상대가 없으면 아예 나서지 않는다

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
function newGame() {
  const deck = R.initDeck();
  const all = R.initDeck();
  return {
    centerDeck: deck.slice(0, 12),
    p1Hand: deck.slice(12, 18),
    p2Hand: deck.slice(18, 24),
    p1Acquired: [], p2Acquired: [],
    turn: 1, phase: 'pick', auctioneer: 1, auction: null,
    time: { 1: 300, 2: 300 },
    pick: { cards: [all[0], all.find((c) => c.id !== all[0].id)], choices: [null, null], revealed: false },
  };
}

function startTurn() {
  g.auction = { centerCard: null, _offeredCard: null, auctionType: null,
                p1Bid: null, p2Bid: null, p1Submitted: false, p2Submitted: false, special: false };
  g.phase = 'draw';
}

// 덱에서 한 장. 오프라인은 클래식만 굴리므로 아이템 카드는 없다.
function drawCenter() {
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

// 상대 차례면 잠깐 뒤에 둔다. 곧바로 두면 사람이 무슨 일이 일어났는지 못 본다.
function aiStep() {
  if (!g || g.phase === 'game_over') return;
  const me = AI_SEAT;
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
    later(() => { if (!g || g.phase !== 'reveal') return; settle(); }, 2400);
  }, 1000);
}

function settle() {
  // 누가 이겼는지도, 카드가 어디로 가는지도 규칙이 정한다
  const d = R.judgeAuction(g);
  R.applyAuction(g, d);

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
  if (ev === 'bid_card' || ev === 'submit_bid') {
    if (g.phase !== 'bidding' || g.auction.p1Submitted) return;
    if (R.activePlayer(g) !== 1) return;             // 클로즈 순서를 지킨다
    const c = g.p1Hand.find((x) => String(x.id) === String(data.cardId));
    if (!c) return;
    g.p1Hand.splice(g.p1Hand.indexOf(c), 1);
    g.auction.p1Bid = c; g.auction.p1Submitted = true;
    push();
    if (g.auction.p2Submitted) reveal(); else aiStep();
    return;
  }
}

window.OFFLINE = {
  ready: true,
  start(difficulty, hooks) {
    diff = difficulty || 'normal';
    onState = hooks && hooks.onState;
    onOver = hooks && hooks.onOver;
    g = newGame();
    push();
    aiStep();
  },
  act,
  stop() { clearTimeout(timer); g = null; },
  live() { return !!g; },
};

})();
