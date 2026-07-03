const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// ── 카드 모델 ──────────────────────────────────────────────
// card = { kind: 2|3|4|6, grade: n, id: kind*100+grade }
// 세트 조건 = kind (2짜리 2장, 3짜리 3장, 4짜리 4장, 6짜리 6장)
// A색 24장 = [2×2, 3×5, 4×7, 6×10]  (kind × count = 12)

const SPEC = [[2,2],[3,5],[4,7],[6,10]];

function initDeck() {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++)
      cards.push({ kind, grade: g, id: kind*100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards; // 24장
}

// 배팅 강도: 값이 작을수록 강함 (종류 우선, 그 다음 등급)
function strength(c) { return c.kind * 100 + c.grade; }

const is610 = c => c.kind === 6 && c.grade === 10;
const is21  = c => c.kind === 2 && c.grade === 1;

// a가 b를 이기면 true. 졸개의 배신: 6-10이 2-1을 이긴다.
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}

function checkSet(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  for (const [kind] of SPEC)
    if ((counts[kind] || 0) >= kind) return kind;
  return null;
}
// 세트 진행도 [최고 근접비율, 총 획득수] — 덱 소진 시 판정용
function progress(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = 0, bestKind = null;
  for (const [kind] of SPEC) {
    const r = (counts[kind] || 0) / kind;
    if (r > best) { best = r; bestKind = kind; }
  }
  return { ratio: best, total: acquired.length, kind: bestKind };
}
// 반환: 1(P1승) | 2(P2승) | 0(무승부)
function resolveByProgress(acq1, acq2) {
  const a = progress(acq1), b = progress(acq2);
  if (a.ratio !== b.ratio) return a.ratio > b.ratio ? 1 : 2;
  if (a.total !== b.total) return a.total > b.total ? 1 : 2;
  return 0;
}

// ── 게임 상태 ──────────────────────────────────────────────

function startTurn(game) {
  // 카드는 아직 안 뽑음 — 진행자가 덱을 클릭(draw)해야 공개
  game.auction = {
    centerCard: null, _offeredCard: null, auctionType: null,
    p1Bid: null, p2Bid: null, p1Submitted: false, p2Submitted: false,
    special: false,
  };
  game.phase = 'draw';
}

function createGame() {
  const deck = initDeck();
  const game = {
    centerDeck: deck.slice(0, 12),
    p1Hand: deck.slice(12, 18),
    p2Hand: deck.slice(18, 24),
    p1Acquired: [], p2Acquired: [],
    turn: 1, phase: 'draw', auctioneer: 1, auction: null,
    time: { 1: 420, 2: 420 },   // 체스 시계: 각 7분(초)
  };
  startTurn(game);
  return game;
}

// 현재 시간이 흐르는(행동해야 하는) 플레이어. 없으면 0
function activePlayer(g) {
  switch (g.phase) {
    case 'draw': case 'offer': case 'choose_type':
      return g.auctioneer;
    case 'bidding': {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      return aucBid ? (g.auctioneer === 1 ? 2 : 1) : g.auctioneer;  // 진행자 먼저
    }
    default: return 0;  // reveal, game_over
  }
}

// 덱에서 중앙 카드 뽑기 (draw → offer)
function drawCenter(game) {
  game.auction.centerCard = game.centerDeck.shift();
  game.phase = 'offer';
}

// ── CPU AI ──────────────────────────────────────────────────
// difficulty: easy | normal | hard | expert

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

// AI가 행동할 차례인지 확인하고 실행
function maybeCpuAct(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.cpuIndex === undefined) return;
  const g = room.game, ci = room.cpuIndex;

  if (g.phase === 'draw' && g.auctioneer === ci + 1) {
    delay(() => { drawCenter(g); broadcast(roomId); maybeCpuAct(roomId); }, 600, 500);
  }
  else if (g.phase === 'offer' && g.auctioneer === ci + 1) {
    delay(() => {
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const card = cpuChooseOffer(hand, acq);
      const idx = hand.findIndex(c => c.id === card.id);
      if (idx === -1) return;
      g.auction._offeredCard = hand.splice(idx, 1)[0];
      g.phase = 'choose_type';
      broadcast(roomId);
      maybeCpuAct(roomId);
    }, 700, 800);
  }
  else if (g.phase === 'choose_type' && g.auctioneer === ci + 1) {
    delay(() => {
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const type = cpuChooseType(hand, [g.auction.centerCard, g.auction._offeredCard], acq, room.difficulty);
      g.auction.auctionType = type === 'close' ? 'closed' : 'open';
      g.phase = 'bidding';
      broadcast(roomId);
      maybeCpuAct(roomId);
    }, 500, 700);
  }
  else if (g.phase === 'bidding') {
    const submitted = ci === 0 ? g.auction.p1Submitted : g.auction.p2Submitted;
    if (submitted) return;
    // 진행자 먼저 배팅: CPU가 비진행자면 진행자(사람) 제출 후에만 배팅
    if (g.auctioneer !== ci + 1) {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (!aucBid) return;
    }
    delay(() => {
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const bid = cpuDecideBid(hand, [g.auction.centerCard, g.auction._offeredCard], acq, room.difficulty);
      const idx = hand.findIndex(c => c.id === bid.id);
      if (idx === -1) return;
      const card = hand.splice(idx, 1)[0];
      if (ci === 0) { g.auction.p1Bid = card; g.auction.p1Submitted = true; }
      else           { g.auction.p2Bid = card; g.auction.p2Submitted = true; }
      resolveBidding(roomId);
    }, 600, 900);
  }
}

function delay(fn, base, rand) {
  setTimeout(fn, base + Math.random() * rand);
}

// ── 방 관리 ────────────────────────────────────────────────

const rooms = {};
const makeRoomId = () => Math.random().toString(36).slice(2, 7).toUpperCase();

function stateFor(game, pi) {
  const isP1 = pi === 0;
  const isAuctioneer = (pi + 1) === game.auctioneer;
  const a = game.auction;
  let auction = null;
  if (a) {
    const oppBidCard  = isP1 ? a.p2Bid : a.p1Bid;
    const oppSubmitted = isP1 ? a.p2Submitted : a.p1Submitted;
    // 오픈=비공개배팅(공개 안됨, reveal에서만) / 클로즈=공개배팅(제출 즉시 공개)
    const showOpp = game.phase === 'reveal' || (a.auctionType === 'closed' && oppSubmitted);
    // 출품카드 공개: 오픈이거나, reveal이거나, 방식 선택 중(choose_type)엔 진행자 본인만
    const showOffered = a.auctionType === 'open' || game.phase === 'reveal'
                      || (game.phase === 'choose_type' && isAuctioneer);
    auction = {
      centerCard: a.centerCard,
      offeredCard: showOffered ? a._offeredCard : null,
      auctionType: a.auctionType,
      myBid:           isP1 ? a.p1Bid : a.p2Bid,
      oppBidSubmitted: oppSubmitted,
      oppBid: showOpp ? oppBidCard : null,
    };
  }
  return {
    phase: game.phase, turn: game.turn, auctioneer: game.auctioneer,
    centerDeckSize: game.centerDeck.length,
    myHand: isP1 ? game.p1Hand : game.p2Hand,
    oppHandLen: isP1 ? game.p2Hand.length : game.p1Hand.length,
    myAcq:  isP1 ? game.p1Acquired : game.p2Acquired,
    oppAcq: isP1 ? game.p2Acquired : game.p1Acquired,
    auction, myIndex: pi + 1,
    time: game.time, active: activePlayer(game),
  };
}

function broadcast(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('state_update', stateFor(room.game, i)); });
}

// ── 체스 시계 ──────────────────────────────────────────────
function startClock(roomId) {
  const room = rooms[roomId];
  if (!room || room.clock) return;
  room.clock = setInterval(() => {
    const g = room.game;
    if (!g || g.phase === 'game_over') return;
    const ap = activePlayer(g);
    if (ap) {
      g.time[ap] = Math.max(0, g.time[ap] - 1);
      if (g.time[ap] === 60)
        room.players.forEach(sid => { if (sid) io.to(sid).emit('time_warning', { player: ap }); });
      if (g.time[ap] <= 0) {
        g.phase = 'game_over';
        const winner = ap === 1 ? 2 : 1;
        room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, timeout: true, myIndex: i + 1 }); });
        endClock(room);
        return;
      }
    }
    room.players.forEach(sid => { if (sid) io.to(sid).emit('clock', { t1: g.time[1], t2: g.time[2], active: ap }); });
  }, 1000);
}
function endClock(room) {
  if (room?.clock) { clearInterval(room.clock); room.clock = null; }
}

// ── 소켓 ───────────────────────────────────────────────────

io.on('connection', (socket) => {

  function leaveOldRoom() {
    const old = socket.roomId && rooms[socket.roomId];
    if (old) { endClock(old); delete rooms[socket.roomId]; socket.roomId = null; }
  }

  socket.on('create_room', ({ vsBot = false, difficulty = 'hard', pid } = {}) => {
    leaveOldRoom();
    const roomId = makeRoomId();
    rooms[roomId] = { players: [socket.id, null], pids: [pid || null, null], game: null, vsBot, difficulty };
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    if (vsBot) {
      rooms[roomId].cpuIndex = 1;
      rooms[roomId].game = createGame();
      socket.emit('game_start', { vsBot: true, difficulty, roomId });
      broadcast(roomId);
      startClock(roomId);
      setTimeout(() => maybeCpuAct(roomId), 600);
    } else {
      socket.emit('room_created', { roomId });
    }
  });

  socket.on('join_room', ({ roomId, pid }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '방을 찾을 수 없어요.');
    if (room.players.filter(Boolean).length >= 2) return socket.emit('error', '방이 꽉 찼어요.');
    room.players[1] = socket.id; room.pids[1] = pid || null;
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 1; socket.pid = pid;
    room.game = createGame();
    io.to(roomId).emit('game_start', { vsBot: false, roomId });
    broadcast(roomId);
    startClock(roomId);
  });

  // 새로고침/끊김 후 재접속
  socket.on('rejoin', ({ roomId, pid } = {}) => {
    const room = rooms[roomId];
    if (!room || !room.game || room.game.phase === 'game_over') return socket.emit('rejoin_failed');
    const slot = room.pids.indexOf(pid);
    if (slot === -1) return socket.emit('rejoin_failed');
    room.players[slot] = socket.id;
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = slot; socket.pid = pid;
    if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
    if (!room.clock) startClock(roomId);                 // 멈췄던 시계 재개
    socket.emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId });
    broadcast(roomId);
    room.players.forEach(s => { if (s) io.to(s).emit('opp_reconnected'); });
    setTimeout(() => maybeCpuAct(roomId), 300);
  });

  socket.on('draw_card', () => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'draw' || g.auctioneer !== socket.playerIndex + 1) return;
    drawCenter(g);
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  socket.on('offer_card', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    // 방식 선택 전(offer/choose_type)이면 언제든 출품카드 교체 가능
    if (g.phase !== 'offer' && g.phase !== 'choose_type') return;
    if (g.auctioneer !== socket.playerIndex + 1) return;
    const hand = socket.playerIndex === 0 ? g.p1Hand : g.p2Hand;
    const idx = hand.findIndex(c => c.id === cardId); if (idx === -1) return;
    const newCard = hand.splice(idx, 1)[0];
    if (g.auction._offeredCard) hand.push(g.auction._offeredCard);  // 기존 출품카드 손패로 복귀
    g.auction._offeredCard = newCard;
    g.phase = 'choose_type';
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  socket.on('choose_auction', ({ type }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'choose_type' || g.auctioneer !== socket.playerIndex + 1) return;
    if (type !== 'open' && type !== 'closed') return;
    g.auction.auctionType = type;
    g.phase = 'bidding';
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  socket.on('submit_bid', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game; if (g.phase !== 'bidding') return;
    const isP1 = socket.playerIndex === 0;
    const me = socket.playerIndex + 1;
    // 경매 진행자가 먼저 배팅 — 비진행자는 진행자 제출 후에만 가능
    if (me !== g.auctioneer) {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (!aucBid) return;
    }
    const hand = isP1 ? g.p1Hand : g.p2Hand;
    const idx = hand.findIndex(c => c.id === cardId); if (idx === -1) return;
    if (isP1 && g.auction.p1Submitted) return;
    if (!isP1 && g.auction.p2Submitted) return;
    const card = hand.splice(idx, 1)[0];
    if (isP1) { g.auction.p1Bid = card; g.auction.p1Submitted = true; }
    else       { g.auction.p2Bid = card; g.auction.p2Submitted = true; }
    resolveBidding(socket.roomId);
  });

  // 이모트 전달
  socket.on('emote', ({ emoji } = {}) => {
    const room = rooms[socket.roomId]; if (!room) return;
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('emote', { emoji }); });
  });

  // 재대결 (같은 방에서 새 게임)
  socket.on('rematch', () => {
    const room = rooms[socket.roomId];
    if (!room) return socket.emit('opponent_left');
    if (room.vsBot) return restartGame(socket.roomId);
    room.rematch = room.rematch || [false, false];
    room.rematch[socket.playerIndex] = true;
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('rematch_wanted'); });
    if (room.rematch[0] && room.rematch[1]) restartGame(socket.roomId);
  });

  // 게임 나가기
  socket.on('leave_room', () => {
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    if (room.graceTimer) clearTimeout(room.graceTimer);
    endClock(room);
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('opponent_left'); });
    delete rooms[roomId];
    socket.roomId = null;
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    const slot = room.players.indexOf(socket.id);
    if (slot !== -1) room.players[slot] = null;
    // 게임 종료 상태면 즉시 정리
    if (!room.game || room.game.phase === 'game_over') { endClock(room); delete rooms[roomId]; return; }
    // 진행 중이면 시계 멈추고 유예시간 부여 (재접속 대기)
    endClock(room);
    room.players.forEach(s => { if (s) io.to(s).emit('opp_disconnected'); });
    if (room.graceTimer) clearTimeout(room.graceTimer);
    room.graceTimer = setTimeout(() => {
      room.players.forEach(s => { if (s) io.to(s).emit('opponent_left'); });
      endClock(room); delete rooms[roomId];
    }, 60000);  // 60초 안에 재접속하면 이어서
  });
});

// 같은 방 새 게임 시작
function restartGame(roomId) {
  const room = rooms[roomId]; if (!room) return;
  room.game = createGame();
  room.rematch = [false, false];
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId }); });
  broadcast(roomId);
  startClock(roomId);
  if (room.cpuIndex !== undefined) setTimeout(() => maybeCpuAct(roomId), 600);
}

function resolveBidding(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  if (g.auction.p1Submitted && g.auction.p2Submitted) {
    g.phase = 'reveal';
    broadcast(roomId);
    setTimeout(() => settle(roomId), 2200);
  } else {
    broadcast(roomId);
    setTimeout(() => maybeCpuAct(roomId), 200);
  }
}

function settle(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  const p1Bid = g.auction.p1Bid, p2Bid = g.auction.p2Bid;
  const items = [g.auction.centerCard, g.auction._offeredCard];

  const p1Wins = aBeatsB(p1Bid, p2Bid);

  // 졸개의 배신 발동 감지
  const special = (is610(p1Bid) && is21(p2Bid)) || (is610(p2Bid) && is21(p1Bid));
  if (special) {
    room.players.forEach(sid => { if (sid) io.to(sid).emit('special', {}); });
  }

  if (p1Wins) g.p1Acquired.push(...items); else g.p2Acquired.push(...items);
  // 배팅 카드 교환
  g.p2Hand.push(p1Bid); g.p1Hand.push(p2Bid);
  g.auction = null;

  // AI가 경매를 이기면 가끔 이모트로 도발
  if (room.cpuIndex !== undefined) {
    const cpuWon = (room.cpuIndex === 0) ? p1Wins : !p1Wins;
    const human = room.players[room.cpuIndex === 0 ? 1 : 0];
    if (human && ((special) || (cpuWon && Math.random() < 0.28))) {
      const set = special ? ['😎', '🔥', '⚔'] : ['😆', '👍', '😏', '🔥'];
      io.to(human).emit('emote', { emoji: set[Math.floor(Math.random() * set.length)] });
    }
  }

  const p1Set = checkSet(g.p1Acquired), p2Set = checkSet(g.p2Acquired);
  if (p1Set || p2Set) {
    g.phase = 'game_over';
    const winner = p1Set ? 1 : 2;
    endClock(room);
    // 완성된 세트가 보드에 먼저 보이도록 상태 갱신 → 잠깐 뒤 결과창
    broadcast(roomId);
    setTimeout(() => {
      if (!rooms[roomId]) return;
      room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, setKind: p1Set || p2Set, myIndex: i + 1 }); });
    }, 1700);
    return;
  }
  // 더 뽑을 카드가 없거나 양쪽 손패 소진 → 세트 근접도로 판정 (무승부 최소화)
  if (g.centerDeck.length === 0 || (g.p1Hand.length === 0 && g.p2Hand.length === 0)) {
    g.phase = 'game_over';
    endClock(room);
    const winner = resolveByProgress(g.p1Acquired, g.p2Acquired);
    const setKind = winner ? progress(winner === 1 ? g.p1Acquired : g.p2Acquired).kind : null;
    room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, setKind, byProgress: true, myIndex: i + 1 }); });
    return;
  }
  g.turn++;
  g.auctioneer = g.auctioneer === 1 ? 2 : 1;
  startTurn(g);
  broadcast(roomId);
  setTimeout(() => maybeCpuAct(roomId), 400);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`http://localhost:${PORT}`));
