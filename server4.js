// ── 4인전 서버 (AI 3명) ───────────────────────────────────────────────────
// 기존 2인 엔진과 완전히 분리되어 있다. 소켓 이벤트 이름도 g4_* 로 따로 쓰기 때문에
// 클래식·아이템전 경로에는 전혀 영향을 주지 않는다.
// v1은 보상·전적 없음 — 4인전 기록이 클래식 전적에 섞이면 안 되기 때문이다.
//
// 진행 방식: 방마다 "예약된 타이머는 항상 최대 1개"인 단일 상태머신으로 돈다.
// 처음엔 단계마다 타이머를 따로 걸었는데, 사람 입력과 봇 타이머가 겹치면 체인이
// 두 갈래로 갈라져 간헐적으로 판이 멈췄다. 스케줄러를 하나로 합쳐 경합을 없앴다.

const G = require('./game4');
const AI = require('./ai4');

const MAX_ROOMS4 = 300;
const BOT_NICKS = ['경매왕 덕배', '큰손 미스박', '눈치백단 재훈', '허세왕 태식', '침착한 소연',
                   '도박사 병철', '노림수 은지', '구두쇠 만수', '한방 규현', '카운팅 지민'];

// 연출 속도 (ms)
const T = { draw: 650, offer: 750, type: 650, bid: 480, reveal: 2300, settle: 1600, next: 260 };
const STUCK_MS = 12000;      // 사람을 기다리는 게 아닌데 이만큼 멈춰 있으면 복구한다
const ORPHAN_MS = 120000;    // 접속이 끊긴 뒤 이만큼 지나면 방을 정리한다

function attach4(io) {
  const rooms4 = {};   // roomId -> { sid, game, next, lastStep, dead }
  const DBG = !!process.env.G4_DEBUG;
  const dbg = (...a) => { if (DBG) console.log('[g4]', new Date().toISOString().slice(11,23), ...a); };

  // 좌석 0(사람) 시점의 상태만 내보낸다. 남의 손패는 절대 보내지 않는다.
  function stateFor(g) {
    const a = g.auction;
    const reveal = g.phase === 'reveal' || g.phase === 'settled' || g.phase === 'game_over';
    const openOffer = a && (a.type === 'open' || g.auctioneer === 0 || reveal);
    return {
      turn: g.turn, phase: g.phase, auctioneer: g.auctioneer, deckLeft: g.deck.length,
      firstAuction: g.firstAuction, bidders: G.bidderSeats(g), myHand: g.seats[0].hand,
      seats: g.seats.map((s, i) => ({
        name: s.name, isBot: s.isBot, handLen: s.hand.length, acq: s.acq,
        need: G.needLeft(s.acq), bidded: !!(a && a.bids[i]),
      })),
      auction: a ? {
        center: a.center,
        offered: openOffer ? a.offered : null,
        type: a.type,
        bids: reveal ? { ...a.bids } : {},   // 입찰 카드는 공개 시점 전엔 내보내지 않는다
      } : null,
      result: (g.phase === 'settled' || g.phase === 'game_over') ? g.lastResult : null,
      over: g.over,
    };
  }

  function push(roomId) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    io.to(r.sid).emit('g4_state', stateFor(r.game));
  }

  function destroy(roomId, why) {
    const r = rooms4[roomId]; if (!r) return;
    dbg('★방 삭제', roomId, '사유=' + (why || '?'), 'phase=' + r.game.phase, 'turn=' + r.game.turn);
    r.dead = true;
    if (r.next) clearTimeout(r.next);
    delete rooms4[roomId];
  }

  // 지금 사람의 입력을 기다리는 중인가 — 이때는 타이머를 걸지 않는다
  function waitingOnHuman(g) {
    if (g.phase === 'draw' || g.phase === 'offer' || g.phase === 'choose_type')
      return g.auctioneer === 0;
    if (g.phase === 'bidding')
      return G.bidderSeats(g).includes(0) && !g.auction.bids[0];
    return false;
  }

  // 방마다 예약 타이머는 항상 최대 1개 — 이게 이 모듈의 핵심 불변식이다
  function schedule(roomId, ms) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    if (r.next) clearTimeout(r.next);
    r.next = setTimeout(() => {
      r.next = null;
      if (r.dead) return;
      try { step(roomId); }
      catch (e) { console.error('[g4] step 예외:', e); }
    }, ms);
  }

  // 상태를 한 칸 진행시킨다. 다음 할 일이 있으면 스스로 다음 타이머를 건다.
  function step(roomId) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    const g = r.game;
    r.lastStep = Date.now();
    dbg('step', g.phase, 'turn=' + g.turn, 'auc=' + g.auctioneer);

    switch (g.phase) {
      case 'game_over':
        push(roomId);
        io.to(r.sid).emit('g4_over', stateFor(g));
        return;

      case 'draw':
        if (g.auctioneer === 0) return push(roomId);       // 사람이 덱을 눌러야 한다
        G.draw(g); push(roomId);
        return schedule(roomId, T.offer);

      case 'offer': {
        if (g.auctioneer === 0) return push(roomId);
        const c = AI.chooseConsign(g, g.auctioneer);
        G.offer(g, g.auctioneer, c.id); push(roomId);
        return schedule(roomId, T.type);
      }

      case 'choose_type':
        if (g.auctioneer === 0) return push(roomId);
        G.chooseType(g, g.auctioneer, AI.chooseType(g, g.auctioneer));
        push(roomId);
        return schedule(roomId, T.bid);

      case 'bidding': {
        // 봇을 한 명씩 순차로 입찰시킨다 (사람 카드를 보고 정하는 게 아니라 연출용 간격일 뿐)
        const pending = G.bidderSeats(g).filter((s) => s !== 0 && !g.auction.bids[s]);
        if (pending.length) {
          const s = pending[0];
          const c = AI.chooseBid(g, s);
          if (c) G.bid(g, s, c.id);
          push(roomId);
          if (G.allBidsIn(g)) { g.phase = 'reveal'; push(roomId); return schedule(roomId, T.reveal); }
          return schedule(roomId, T.bid);
        }
        if (G.allBidsIn(g) || !G.bidderSeats(g).length) {   // 전원 입찰 완료 또는 아무도 못 냄(유찰)
          g.phase = 'reveal'; push(roomId); return schedule(roomId, T.reveal);
        }
        return push(roomId);      // 사람 입찰 대기
      }

      case 'reveal':
        G.settle(g); push(roomId);
        return schedule(roomId, T.settle);

      case 'settled':
        G.advance(g); push(roomId);
        return schedule(roomId, T.next);

      default:
        return push(roomId);
    }
  }

  // 워치독 — 사람을 기다리는 게 아닌데 멈춰 있으면 다시 굴린다.
  // 상태머신을 하나로 합쳐 경합은 없앴지만 안전망은 남겨둔다.
  const wd = setInterval(() => {
    const now = Date.now();
    for (const [roomId, r] of Object.entries(rooms4)) {
      if (r.orphanAt) {                                // 자리 비움 — 유예 뒤 정리
        if (now - r.orphanAt > ORPHAN_MS) destroy(roomId, '유예 만료');
        continue;
      }
      if (r.dead || r.next) continue;                  // 다음 동작이 예약돼 있으면 정상
      if (r.game.phase === 'game_over') continue;
      if (waitingOnHuman(r.game)) continue;            // 사람 입력 대기는 정상
      if (now - (r.lastStep || 0) < STUCK_MS) continue;
      console.warn('[g4] 진행이 멈춰 복구합니다 room=' + roomId + ' phase=' + r.game.phase);
      schedule(roomId, 60);
    }
  }, 4000);
  if (wd.unref) wd.unref();

  // ── 소켓 ─────────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    socket.on('g4_start', (data = {}) => {
      if (socket.g4room) destroy(socket.g4room, '재시작');
      if (Object.keys(rooms4).length >= MAX_ROOMS4)
        return socket.emit('g4_error', '서버가 혼잡해요. 잠시 후 다시 시도해주세요.');
      const nick = String(data.nick || '나').slice(0, 12) || '나';
      const bots = [...BOT_NICKS].sort(() => Math.random() - 0.5).slice(0, 3);
      const g = G.createGame4([nick, ...bots]);
      const styles = AI.pickStyles();
      g.seats.forEach((s, i) => { s.style = styles[i]; });

      const roomId = 'G4' + Math.random().toString(36).slice(2, 8).toUpperCase();
      rooms4[roomId] = { sid: socket.id, game: g, next: null, lastStep: Date.now(), dead: false };
      socket.g4room = roomId;
      socket.emit('g4_begin', { roomId, seats: g.seats.map((s) => ({ name: s.name, isBot: s.isBot })) });
      push(roomId);
      schedule(roomId, 700);
    });

    socket.on('g4_act', (data = {}) => {
      const roomId = socket.g4room;
      const r = rooms4[roomId];
      if (!r || r.dead) return dbg('⚠ g4_act 무시: 방 없음 room=' + roomId + ' type=' + data.type);
      const g = r.game;
      let ok = false;
      if (data.type === 'draw' && g.phase === 'draw' && g.auctioneer === 0) ok = G.draw(g);
      else if (data.type === 'offer' && g.phase === 'offer') ok = G.offer(g, 0, data.cardId);
      else if (data.type === 'auctionType' && g.phase === 'choose_type') ok = G.chooseType(g, 0, data.val);
      else if (data.type === 'bid' && g.phase === 'bidding') ok = G.bid(g, 0, data.cardId);
      if (!ok) return push(roomId);       // 잘못된 입력이면 현재 상태만 되돌려 보낸다
      r.lastStep = Date.now();
      push(roomId);
      schedule(roomId, T.next);           // 이후 진행은 항상 단일 스케줄러가 맡는다
    });

    socket.on('g4_leave', () => { if (socket.g4room) { destroy(socket.g4room, 'leave'); socket.g4room = null; } });
    // 잠깐 끊긴 것만으로 판을 없애면 모바일에서 화면만 잠가도 게임이 날아간다.
    // 자리를 비운 것으로 보고 진행을 멈춘 뒤, 유예 시간이 지나야 정리한다.
    socket.on('disconnect', (reason) => {
      const r = rooms4[socket.g4room];
      if (!r || r.dead) return;
      r.orphanAt = Date.now();
      if (r.next) { clearTimeout(r.next); r.next = null; }
      dbg('자리 비움 — 진행 정지', socket.g4room, reason);
    });

    // 재접속해서 이어하기
    socket.on('g4_resume', (data = {}) => {
      const roomId = String(data.roomId || '');
      const r = rooms4[roomId];
      if (!r || r.dead) return socket.emit('g4_gone');
      r.sid = socket.id; r.orphanAt = null;
      socket.g4room = roomId;
      dbg('이어하기', roomId, 'phase=' + r.game.phase);
      push(roomId);
      if (!waitingOnHuman(r.game) && r.game.phase !== 'game_over') schedule(roomId, 400);
    });
  });

  return { count: () => Object.keys(rooms4).length };
}

module.exports = { attach4 };
