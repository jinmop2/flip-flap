// ── 4인전 서버 (솔로 = AI 3명 / 빠른대전 = 사람 매칭, 부족분은 AI) ─────────
// 기존 2인 엔진과 완전히 분리되어 있다. 소켓 이벤트도 g4_* 로 따로 쓰기 때문에
// 클래식·아이템전 경로에는 전혀 영향을 주지 않는다.
// v1은 보상·전적 없음 — 4인전 기록이 클래식 전적에 섞이면 안 되기 때문이다.
//
// 진행 방식: 방마다 "예약된 타이머는 항상 최대 1개"인 단일 상태머신으로 돈다.
// 단계마다 타이머를 따로 걸면 사람 입력과 봇 타이머가 겹쳐 체인이 두 갈래로
// 갈라지고 간헐적으로 판이 멈춘다. 스케줄러를 하나로 합쳐 경합을 없앴다.

const G = require('./game4');
const AI = require('./ai4');
const accounts = require('./accounts');

const MAX_ROOMS4 = 300;
const BOT_NICKS = ['경매왕 덕배', '큰손 미스박', '눈치백단 재훈', '허세왕 태식', '침착한 소연',
                   '도박사 병철', '노림수 은지', '구두쇠 만수', '한방 규현', '카운팅 지민'];

const T = { draw: 650, offer: 750, type: 650, bid: 480, reveal: 2300, settle: 1600, next: 260 };
const STUCK_MS = 12000;     // 사람을 기다리는 게 아닌데 이만큼 멈춰 있으면 복구한다
const ORPHAN_MS = 120000;   // 솔로 — 접속이 끊긴 뒤 이만큼 지나면 방을 정리
const SEAT_GRACE = 20000;   // 멀티 — 이만큼 안 돌아오면 그 자리는 AI가 대신한다
const FILL_MS = 25000;      // 이 시간 안에 4명이 안 모이면 남는 자리를 AI로 채운다

// 온라인 멀티 RP — 사람들끼리의 상대 순위로만 나눈다. 합이 0이라 총량이 늘지 않는다.
// AI 자리는 계산에서 빠지므로 "AI 대전으로는 RP를 올릴 수 없다".
const RP4 = { 2: [20, -20], 3: [22, 0, -22], 4: [24, 8, -8, -24] };
// 실제로 플레이했는지 판단하는 최소 기준. 핵심 신호는 턴 수다 —
// 5턴을 넘기려면 경매를 다섯 번 치러야 하므로 즉시 포기로는 도달할 수 없다.
// 2인전(60초)보다 시간 기준을 낮춘 건, 4인전 RP가 사람들 사이 제로섬이라
// 판을 아무리 돌려도 총량이 늘지 않기 때문이다.
const RP_MIN_TURNS = 5, RP_MIN_SEC = 20;

function attach4(io) {
  const rooms4 = {};
  const DBG = !!process.env.G4_DEBUG;
  const dbg = (...a) => { if (DBG) console.log('[g4]', ...a); };
  let queue4 = [];          // 빠른대전 대기열 [{ sid, nick, at }]

  // ── 상태 ─────────────────────────────────────────────────────────────────
  // me 좌석 시점으로만 만든다. 남의 손패는 어떤 경우에도 내보내지 않는다.
  function stateFor(g, me, rp) {
    const a = g.auction;
    const reveal = g.phase === 'reveal' || g.phase === 'settled' || g.phase === 'game_over';
    const opened = G.openedBid(g);
    const openOffer = a && (a.type === 'open' || g.auctioneer === me || reveal);
    return {
      me, turn: g.turn, phase: g.phase, auctioneer: g.auctioneer, deckLeft: g.deck.length,
      firstAuction: g.firstAuction, bidders: G.bidderSeats(g), myHand: g.seats[me].hand,
      seats: g.seats.map((s, i) => ({
        name: s.name, isBot: s.isBot, handLen: s.hand.length, acq: s.acq,
        need: G.needLeft(s.acq), bidded: !!(a && a.bids[i]),
      })),
      auction: a ? {
        center: a.center,
        offered: openOffer ? a.offered : null,
        type: a.type,
        // 오픈은 전원 뒤집어 냈다가 한 번에 공개.
        // 클로즈는 진행자가 낸 카드만 먼저 공개되고, 나머지는 공개 시점까지 감춘다.
        bids: reveal ? { ...a.bids } : (opened ? { [opened.seat]: opened.card } : {}),
        closed: !!a.closed,
        first: (a.first === undefined ? null : a.first),
        firstDone: !!opened,
      } : null,
      result: (g.phase === 'settled' || g.phase === 'game_over') ? g.lastResult : null,
      over: g.over, rp: rp || null,
    };
  }

  function push(roomId) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    for (let i = 0; i < 4; i++) {
      const sid = r.seats[i].sid;
      if (sid) io.to(sid).emit('g4_state', stateFor(r.game, i, r.rp));
    }
  }

  function destroy(roomId, why) {
    const r = rooms4[roomId]; if (!r) return;
    dbg('방 삭제', roomId, why || '');
    r.dead = true;
    if (r.next) clearTimeout(r.next);
    for (const s of r.seats) if (s.sid) {
      const sk = io.sockets.sockets.get(s.sid);
      if (sk) { sk.g4room = null; sk.g4seat = null; }
    }
    delete rooms4[roomId];
  }

  // 지금 입력을 기다려야 하는 사람 좌석 (없으면 null)
  function humanToAct(g, r) {
    const isHuman = (i) => !r.seats[i].isBot && r.seats[i].sid;
    if (g.phase === 'draw' || g.phase === 'offer' || g.phase === 'choose_type')
      return isHuman(g.auctioneer) ? g.auctioneer : null;
    if (g.phase === 'bidding') {
      for (let i = 0; i < 4; i++) if (isHuman(i) && G.canBid(g, i)) return i;
    }
    return null;
  }

  // 방마다 예약 타이머는 항상 최대 1개 — 이 모듈의 핵심 불변식
  function schedule(roomId, ms) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    if (r.next) clearTimeout(r.next);
    r.next = setTimeout(() => {
      r.next = null;
      if (r.dead) return;
      try { step(roomId); } catch (e) { console.error('[g4] step 예외:', e); }
    }, ms);
  }

  function step(roomId) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    const g = r.game;
    r.lastStep = Date.now();
    dbg('step', g.phase, 'turn=' + g.turn, 'auc=' + g.auctioneer);

    switch (g.phase) {
      case 'game_over':
        awardRp(roomId);
        push(roomId);
        for (let i = 0; i < 4; i++) if (r.seats[i].sid) io.to(r.seats[i].sid).emit('g4_over', stateFor(g, i, r.rp));
        return;

      case 'draw':
        if (humanToAct(g, r) === g.auctioneer) return push(roomId);
        G.draw(g); push(roomId);
        return schedule(roomId, T.offer);

      case 'offer': {
        if (humanToAct(g, r) === g.auctioneer) return push(roomId);
        const c = AI.chooseConsign(g, g.auctioneer);
        G.offer(g, g.auctioneer, c.id); push(roomId);
        return schedule(roomId, T.type);
      }

      case 'choose_type':
        if (humanToAct(g, r) === g.auctioneer) return push(roomId);
        G.chooseType(g, g.auctioneer, AI.chooseType(g, g.auctioneer));
        push(roomId);
        return schedule(roomId, T.bid);

      case 'bidding': {
        // 클로즈면 진행자가 먼저 내야 나머지가 낼 수 있다 — canBid 가 강제한다.
        // 사람이 낼 수 있는 상태면 기다리고, 아니면 봇을 하나씩 굴린다.
        if (humanToAct(g, r) !== null) return push(roomId);
        const pending = [];
        for (let i = 0; i < 4; i++) if (r.seats[i].isBot && G.canBid(g, i)) pending.push(i);
        if (pending.length) {
          const s = pending[0];
          const c = AI.chooseBid(g, s);
          if (c) G.bid(g, s, c.id);
          push(roomId);
          if (G.allBidsIn(g)) { g.phase = 'reveal'; push(roomId); return schedule(roomId, T.reveal); }
          return schedule(roomId, T.bid);
        }
        if (G.allBidsIn(g) || !G.bidderSeats(g).length) {
          g.phase = 'reveal'; push(roomId); return schedule(roomId, T.reveal);
        }
        return push(roomId);
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

  // ── RP 정산 ──────────────────────────────────────────────────────────────
  // 온라인 멀티에서 로그인한 사람이 2명 이상일 때만 반영한다.
  function awardRp(roomId) {
    const r = rooms4[roomId]; if (!r || r.solo || r.rp) return;
    const g = r.game; if (!g.over) return;

    const humans = [];
    for (let i = 0; i < 4; i++) if (r.seats[i].token) humans.push(i);   // 로그인한 사람 자리만
    if (humans.length < 2) { dbg('RP 미반영 — 사람 ' + humans.length + '명'); return; }   // AI 대전으로는 RP 없음

    const ips = humans.map((i) => r.seats[i].ip).filter(Boolean);
    if (new Set(ips).size !== ips.length) { dbg('RP 미반영 — 같은 IP'); return; }   // 파밍 방지

    const secs = Math.floor((Date.now() - r.startedAt) / 1000);
    if (g.turn < RP_MIN_TURNS || secs < RP_MIN_SEC) {                  // 너무 짧은 판은 무효
      dbg('RP 미반영 — 짧은 판', 'turn=' + g.turn, secs + '초');
      return;
    }

    // 최종 순위에서 사람만 추린다. 도중에 나간 사람은 맨 뒤로 — 지고 있을 때 나가서
    // 페널티를 피하는 걸 막아야 한다.
    const order = (g.over.order && g.over.order.length) ? g.over.order
                : [g.over.winner, ...[0, 1, 2, 3].filter((i) => i !== g.over.winner)];
    const stayed = order.filter((i) => humans.includes(i) && !r.seats[i].left);
    const left = humans.filter((i) => r.seats[i].left);
    const ranked = [...stayed, ...left];

    const table = RP4[ranked.length];
    if (!table) return;
    const out = {};
    ranked.forEach((seat, k) => {
      const res = accounts.applyRp4(r.seats[seat].token, table[k]);
      if (res) out[seat] = { delta: res.delta, rp: res.after, place: k + 1 };
      if (res && r.seats[seat].sid) io.to(r.seats[seat].sid).emit('profile', { profile: res.profile });
    });
    r.rp = out;
    dbg('RP 정산', roomId, JSON.stringify(out));
  }

  // ── 대기열 ───────────────────────────────────────────────────────────────
  const queueInfo = () => {
    const n = queue4.length;
    for (const q of queue4) io.to(q.sid).emit('g4_queue', { n, need: 4, fillIn: Math.max(0, FILL_MS - (Date.now() - queue4[0].at)) });
  };
  function dequeue(sid) {
    const before = queue4.length;
    queue4 = queue4.filter((q) => q.sid !== sid);
    if (queue4.length !== before && queue4.length) queueInfo();
  }
  function tryMatch(force) {
    if (queue4.length >= 4) { startRoom(queue4.splice(0, 4), false); return; }
    if (force && queue4.length) { startRoom(queue4.splice(0, queue4.length), false); }
  }
  setInterval(() => {
    if (!queue4.length) return;
    if (Date.now() - queue4[0].at >= FILL_MS) tryMatch(true);   // 안 모이면 AI 로 채워 시작
    else queueInfo();
  }, 1000).unref?.();

  // ── 방 생성 ──────────────────────────────────────────────────────────────
  // humans: [{ sid, nick }] — 부족한 자리는 AI 가 채운다
  function startRoom(humans, solo) {
    if (Object.keys(rooms4).length >= MAX_ROOMS4) {
      for (const h of humans) io.to(h.sid).emit('g4_error', '서버가 혼잡해요. 잠시 후 다시 시도해주세요.');
      return;
    }
    const bots = [...BOT_NICKS].sort(() => Math.random() - 0.5);
    const seats = [];
    // 멀티는 자리를 섞고, 솔로는 사람을 0번에 고정한다.
    // (첫 진행자는 createGame4 가 무작위로 정하므로 솔로에서 섞을 이유가 없다)
    const order = solo ? [0, 1, 2, 3] : [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    let hi = 0, bi = 0;
    for (let i = 0; i < 4; i++) seats.push(null);
    for (const idx of order) {
      if (hi < humans.length) {
        const sk = io.sockets.sockets.get(humans[hi].sid);
        seats[idx] = { sid: humans[hi].sid, nick: humans[hi].nick, isBot: false, orphanAt: null,
                       token: (sk && sk.token) || null, ip: (sk && sk.clientIp) || null, left: false };
        hi++;
      }
      else { seats[idx] = { sid: null, nick: bots[bi++], isBot: true, orphanAt: null, token: null, ip: null, left: false }; }
    }
    const g = G.createGame4(seats.map((s) => s.nick));
    const styles = AI.pickStyles();
    g.seats.forEach((s, i) => { s.style = styles[i]; s.isBot = seats[i].isBot; });

    const roomId = 'G4' + Math.random().toString(36).slice(2, 8).toUpperCase();
    rooms4[roomId] = { game: g, seats, next: null, lastStep: Date.now(), dead: false, solo: !!solo,
                       startedAt: Date.now(), rp: null };
    for (let i = 0; i < 4; i++) {
      const sid = seats[i].sid; if (!sid) continue;
      const sk = io.sockets.sockets.get(sid);
      if (sk) { sk.g4room = roomId; sk.g4seat = i; }
      io.to(sid).emit('g4_begin', {
        roomId, me: i, solo: !!solo,
        seats: seats.map((s) => ({ name: s.nick, isBot: s.isBot })),
      });
    }
    push(roomId);
    schedule(roomId, 700);
    dbg('방 시작', roomId, solo ? '솔로' : '멀티', '사람 ' + humans.length + '명');
  }

  // ── 워치독 ───────────────────────────────────────────────────────────────
  const wd = setInterval(() => {
    const now = Date.now();
    for (const [roomId, r] of Object.entries(rooms4)) {
      if (r.dead) continue;
      // 자리를 비운 사람 처리
      let changed = false;
      for (let i = 0; i < 4; i++) {
        const s = r.seats[i];
        if (!s.orphanAt) continue;
        if (r.solo) {                                   // 솔로는 판을 잠시 보관했다가 정리
          if (now - s.orphanAt > ORPHAN_MS) { destroy(roomId, '유예 만료'); break; }
        } else if (now - s.orphanAt > SEAT_GRACE) {     // 멀티는 남은 사람을 위해 AI가 대신
          s.isBot = true; s.sid = null; s.orphanAt = null; s.left = true;
          r.game.seats[i].isBot = true;
          changed = true;
          dbg('자리를 AI가 대신', roomId, i);
        }
      }
      if (!rooms4[roomId] || r.dead) continue;
      if (changed) { push(roomId); schedule(roomId, 300); continue; }
      // 사람이 전부 나간 멀티 방은 정리
      if (!r.solo && !r.seats.some((s) => s.sid)) { destroy(roomId, '사람 없음'); continue; }
      if (r.solo && r.seats.some((x) => !x.isBot && x.orphanAt)) continue;   // 솔로 자리비움 = 진행 정지
      if (r.next) continue;
      if (r.game.phase === 'game_over') continue;
      if (humanToAct(r.game, r) !== null) continue;
      if (now - (r.lastStep || 0) < STUCK_MS) continue;
      console.warn('[g4] 진행이 멈춰 복구합니다 room=' + roomId + ' phase=' + r.game.phase);
      schedule(roomId, 60);
    }
  }, 3000);
  if (wd.unref) wd.unref();

  // ── 소켓 ─────────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const nickOf = (d) => String((d && d.nick) || '플레이어').slice(0, 12) || '플레이어';

    socket.on('g4_start', (data = {}) => {          // 솔로 (AI 3명)
      if (socket.g4room) destroy(socket.g4room, '재시작');
      dequeue(socket.id);
      startRoom([{ sid: socket.id, nick: nickOf(data) }], true);
    });

    socket.on('g4_quick', (data = {}) => {          // 빠른대전 대기열
      if (socket.g4room) destroy(socket.g4room, '빠른대전 진입');
      dequeue(socket.id);
      queue4.push({ sid: socket.id, nick: nickOf(data), at: Date.now() });
      queueInfo();
      tryMatch(false);
    });

    socket.on('g4_cancel', () => { dequeue(socket.id); socket.emit('g4_cancelled'); });

    socket.on('g4_act', (data = {}) => {
      const roomId = socket.g4room, r = rooms4[roomId];
      if (!r || r.dead) return;
      const me = socket.g4seat;
      if (me === null || me === undefined || r.seats[me].sid !== socket.id) return;
      const g = r.game;
      let ok = false;
      if (data.type === 'draw' && g.phase === 'draw' && g.auctioneer === me) ok = G.draw(g);
      else if (data.type === 'offer' && g.phase === 'offer' && g.auctioneer === me) ok = G.offer(g, me, data.cardId);
      else if (data.type === 'auctionType' && g.phase === 'choose_type' && g.auctioneer === me) ok = G.chooseType(g, me, data.val);
      else if (data.type === 'bid' && g.phase === 'bidding') ok = G.bid(g, me, data.cardId);
      if (!ok) return push(roomId);
      r.lastStep = Date.now();
      push(roomId);
      schedule(roomId, T.next);
    });

    socket.on('g4_resume', (data = {}) => {
      const roomId = String(data.roomId || '');
      const r = rooms4[roomId];
      if (!r || r.dead) return socket.emit('g4_gone');
      const seat = Number(data.seat);
      const s = r.seats[seat];
      if (!s || s.isBot) return socket.emit('g4_gone');   // 이미 AI가 대신하고 있으면 못 돌아온다
      s.sid = socket.id; s.orphanAt = null;
      socket.g4room = roomId; socket.g4seat = seat;
      dbg('이어하기', roomId, 'seat=' + seat);
      push(roomId);
      if (humanToAct(r.game, r) === null && r.game.phase !== 'game_over') schedule(roomId, 400);
    });

    socket.on('g4_leave', () => {
      dequeue(socket.id);
      const r = rooms4[socket.g4room];
      if (r && !r.dead) {
        if (r.solo) destroy(socket.g4room, 'leave');
        else {
          const i = socket.g4seat;
          if (i !== null && i !== undefined && r.seats[i]) {
            r.seats[i].isBot = true; r.seats[i].sid = null; r.seats[i].orphanAt = null; r.seats[i].left = true;
            r.game.seats[i].isBot = true;
            push(socket.g4room); schedule(socket.g4room, 300);
          }
        }
      }
      socket.g4room = null; socket.g4seat = null;
    });

    socket.on('disconnect', () => {
      dequeue(socket.id);
      const r = rooms4[socket.g4room];
      if (!r || r.dead) return;
      const i = socket.g4seat;
      if (i === null || i === undefined || !r.seats[i]) return;
      // 잠깐 끊긴 것만으로 자리를 뺏지 않는다. 유예 뒤 워치독이 처리한다.
      r.seats[i].orphanAt = Date.now();
      r.seats[i].sid = null;
      if (r.solo && r.next) { clearTimeout(r.next); r.next = null; }   // 솔로는 진행 정지
      dbg('자리 비움', socket.g4room, 'seat=' + i);
    });
  });

  return { count: () => Object.keys(rooms4).length, queued: () => queue4.length };
}

module.exports = { attach4 };
