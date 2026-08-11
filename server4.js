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

// reveal 은 "배팅 카드가 뒤집히는 시간". 뒤집기(0.85s) + 카드별 지연(최대 0.17s) 이
// 끝나는 즉시 결과가 오도록 맞춘다. 예전엔 2300ms 라 뒤집기가 끝나고도 1.3초 넘게
// 아무 일이 없다가 뜬금없이 WIN 이 떴다.
const T = { draw: 650, offer: 750, type: 650, bid: 480, reveal: 1150, settle: 1750, next: 260 };
const STUCK_MS = 12000;     // 사람을 기다리는 게 아닌데 이만큼 멈춰 있으면 복구한다
// 사람 차례에도 제한이 필요하다. 예전엔 없어서, 멀티에서 한 명이 가만히 있으면
// 나머지가 무한정 기다렸다("카드가 안 내진다"의 정체). 2인전은 60초 시계가 있는데
// 다인전만 빠져 있었다. 여럿이 기다리므로 2인전보다 짧게 잡는다.
const TURN_MS = 25000;
// 한 번 시간을 넘긴 사람은 자리를 비웠을 가능성이 크다. 그런데도 매 수마다
// 25초씩 기다리면 한 턴에 75초가 걸려 남은 사람들이 못 견딘다.
// 연속으로 넘기면 대기를 확 줄이고, 그 사람이 다시 두면 원래대로 돌린다.
const TURN_MS_AFK = 6000;
const AFK_AFTER = 2;        // 연속 이만큼 넘기면 자리비움으로 본다
const ORPHAN_MS = 120000;   // 솔로 — 접속이 끊긴 뒤 이만큼 지나면 방을 정리
const SEAT_GRACE = 20000;   // 멀티 — 이만큼 안 돌아오면 그 자리는 AI가 대신한다

// 대기 인원에 따라 몇 인용으로 시작할지. 3명이 모이면 AI를 끼우지 않고 셋이 한다.
//   4명 이상 → 4인 / 3명 → 3인(전원 사람) / 2명 → 3인(사람2+AI1) / 1명 → 4인(사람1+AI3)
function seatsFor(humanCount) {
  if (humanCount >= 4) return 4;
  if (humanCount === 3) return 3;
  if (humanCount === 2) return 3;
  return 4;
}

// 온라인 멀티 RP — 사람들끼리의 상대 순위로만 나눈다. 합이 0이라 총량이 늘지 않는다.
// AI 자리는 계산에서 빠지므로 "AI 대전으로는 RP를 올릴 수 없다".
const RP4 = { 2: [20, -20], 3: [22, 0, -22], 4: [24, 8, -8, -24] };
// 실제로 플레이했는지 판단하는 최소 기준. 핵심 신호는 턴 수다 —
// 5턴을 넘기려면 경매를 다섯 번 치러야 하므로 즉시 포기로는 도달할 수 없다.
// 2인전(60초)보다 시간 기준을 낮춘 건, 4인전 RP가 사람들 사이 제로섬이라
// 판을 아무리 돌려도 총량이 늘지 않기 때문이다.
const RP_MIN_TURNS = 5, RP_MIN_SEC = 20;

// hooks: { notifyIdl, sidOfIdl } — 계정→소켓 표는 server.js 가 쥐고 있어서 받아 쓴다
function attach4(io, hooks = {}) {
  const rooms4 = {};
  const DBG = !!process.env.G4_DEBUG;
  const dbg = (...a) => { if (DBG) console.log('[g4]', ...a); };
  const pendings = {};      // 시작 전 대기방 — 사람들이 앉아서 기다리는 곳

  // ── 상태 ─────────────────────────────────────────────────────────────────
  // me 좌석 시점으로만 만든다. 남의 손패는 어떤 경우에도 내보내지 않는다.
  function stateFor(g, me, rp, room) {
    const a = g.auction;
    const reveal = g.phase === 'reveal' || g.phase === 'settled' || g.phase === 'game_over';
    const openedList = G.openedBids(g);
    const openOffer = a && (a.type === 'open' || g.auctioneer === me || reveal);
    return {
      me, n: g.n, spec: g.spec, turn: g.turn, phase: g.phase, auctioneer: g.auctioneer, deckLeft: g.deck.length,
      bidders: G.bidderSeats(g), myHand: g.seats[me].hand,
      seats: g.seats.map((s, i) => ({
        name: s.name, isBot: s.isBot, handLen: s.hand.length, acq: s.acq,
        // 이름을 눌렀을 때 보여줄 정보. 손패 같은 건 절대 안 실린다 —
        // 여기 넣는 건 상대에게 그대로 보이는 값이다.
        //
        // 토큰은 게임 자리(g.seats)가 아니라 방 자리(room.seats)에 있다.
        // g.seats 에서 찾다가 늘 null 이 나와 상대가 "게스트" 로만 보였다.
        profile: (!s.isBot && room && room.seats[i] && room.seats[i].token)
          ? publicCard(room.seats[i].token) : null,
        need: G.needLeft(s.acq), bidded: !!(a && a.bids[i]),
      })),
      auction: a ? {
        center: a.center,
        offered: openOffer ? a.offered : null,
        // 클로즈에서 남의 출품은 가려야 하지만, "아직 안 냈다" 와 "냈는데 안 보인다" 는
        // 다르다. 화면이 빈 자리와 뒷면을 구분해 그릴 수 있게 존재 여부만 따로 준다.
        hasOffer: !!a.offered,
        type: a.type,
        // 오픈은 전원 뒤집어 냈다가 한 번에 공개.
        // 클로즈는 순서대로 한 명씩 공개 — 이미 낸 사람 것만 보인다.
        bids: reveal ? { ...a.bids }
                     : Object.fromEntries(openedList.map((e) => [e.seat, e.card])),
        closed: !!a.closed,
        seq: a.seq || null,
        turnToBid: G.turnToBid(g),
      } : null,
      // 지금 누구를 몇 초 기다리는지 — 화면에 남은 시간을 보여주려고
      clock: g.clock || null,
      waitSeat: (room && room.waitSeat !== undefined) ? room.waitSeat : null,
      waitLeft: (room && room.waitUntil) ? Math.max(0, Math.round((room.waitUntil - Date.now()) / 1000)) : null,
      result: (g.phase === 'settled' || g.phase === 'game_over') ? g.lastResult : null,
      over: g.over, rp: rp || null,
    };
  }

  // 남에게 보여도 되는 값만. profileOf 를 통째로 넘기면 코인·아이템·토큰 같은
  // 남이 알 필요 없는 것까지 나간다.
  function publicCard(token) {
    try {
      const u = accounts.byToken(token); if (!u) return null;
      const p = accounts.profileOf(u); if (!p) return null;
      return { nick: p.nick, level: p.level, rank: p.rank, rankIcon: p.rankIcon,
               rankColor: p.rankColor, rp: p.rp, wins: p.wins, losses: p.losses,
               winRate: p.winRate, nickColor: p.nickColor, plate: p.plate,
               titleInfo: p.titleInfo, avatar: p.avatar };
    } catch (_) { return null; }
  }

  function push(roomId) {
    const r = rooms4[roomId]; if (!r || r.dead) return;
    for (let i = 0; i < r.seats.length; i++) {
      const sid = r.seats[i].sid;
      if (sid) io.to(sid).emit('g4_state', stateFor(r.game, i, r.rp, r));
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
  // 사람 차례가 시작·유지·해제될 때 마감 시각을 관리한다.
  // 같은 사람이 계속 같은 차례면 마감을 유지하고, 차례가 바뀌면 새로 잰다.
  function markWait(r, seat) {
    if (seat === null) { r.waitSeat = null; r.waitUntil = 0; return; }
    if (r.waitSeat !== seat) {
      r.waitSeat = seat;
      r.afk = r.afk || {};
      const ms = (r.afk[seat] || 0) >= AFK_AFTER ? TURN_MS_AFK : TURN_MS;
      r.waitUntil = Date.now() + ms;
    }
  }

  function humanToAct(g, r) {
    const isHuman = (i) => !r.seats[i].isBot && r.seats[i].sid;
    if (g.phase === 'draw' || g.phase === 'offer' || g.phase === 'choose_type')
      return isHuman(g.auctioneer) ? g.auctioneer : null;
    if (g.phase === 'bidding') {
      for (let i = 0; i < r.seats.length; i++) if (isHuman(i) && G.canBid(g, i)) return i;
    }
    return null;
  }

  // 시간이 다 된 사람 대신 한 수 둔다. AI 와 같은 판단을 쓰므로 엉뚱한 수가 나오진 않는다.
  function autoPlayFor(g, seat) {
    if (g.phase === 'draw' && g.auctioneer === seat) return G.draw(g);
    if (g.phase === 'offer' && g.auctioneer === seat) {
      const c = AI.chooseConsign(g, seat);
      return c ? G.offer(g, seat, c.id) : false;
    }
    if (g.phase === 'choose_type' && g.auctioneer === seat) {
      return G.chooseType(g, seat, AI.chooseType(g, seat));
    }
    if (g.phase === 'bidding' && G.canBid(g, seat)) {
      const c = AI.chooseBid(g, seat);
      return c ? G.bid(g, seat, c.id) : false;
    }
    return false;
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
    markWait(r, humanToAct(g, r));
    dbg('step', g.phase, 'turn=' + g.turn, 'auc=' + g.auctioneer);

    switch (g.phase) {
      case 'game_over':
        awardRp(roomId);
        push(roomId);
        for (let i = 0; i < r.seats.length; i++) if (r.seats[i].sid) io.to(r.seats[i].sid).emit('g4_over', stateFor(g, i, r.rp, r));
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
        // 클로즈는 순서제 — 진행자부터 한 명씩. 순서는 canBid 가 강제한다.
        // 사람이 낼 수 있는 상태면 기다리고, 아니면 봇을 하나씩 굴린다.
        if (humanToAct(g, r) !== null) return push(roomId);
        const pending = [];
        for (let i = 0; i < r.seats.length; i++) if (r.seats[i].isBot && G.canBid(g, i)) pending.push(i);
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
    for (let i = 0; i < r.seats.length; i++) if (r.seats[i].token) humans.push(i);   // 로그인한 사람 자리만
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
                : [g.over.winner, ...r.seats.map((_, i) => i).filter((i) => i !== g.over.winner)];
    const stayed = order.filter((i) => humans.includes(i) && !r.seats[i].left);
    const left = humans.filter((i) => r.seats[i].left);
    const ranked = [...stayed, ...left];

    const table = RP4[ranked.length];
    if (!table) return;
    const out = {};
    ranked.forEach((seat, k) => {
      // 순위(1~4)를 넘겨 급수/단 규칙으로 계산하게 한다.
      // 사람이 2~3명이면 RP4 표의 앞쪽만 쓰므로 순위도 그 범위 안이다.
      const res = accounts.applyRp4(r.seats[seat].token, table[k], k + 1);
      if (res) out[seat] = { delta: res.delta, rp: res.after, place: k + 1,
                             promo: res.promo || null, rankChange: res.rankChange || null };
      if (res && r.seats[seat].sid) io.to(r.seats[seat].sid).emit('profile', { profile: res.profile });
    });
    r.rp = out;
    dbg('RP 정산', roomId, JSON.stringify(out));
  }

  // ── 대기방 ───────────────────────────────────────────────────────────────
  // 대기열이 아니라 "방"이다. 들어오면 바로 게임 화면에 앉아서, 자리가 차는 걸
  // 보면서 기다린다. 시작은 방 안에서 누른다 — 그때 인원이 몇 인전인지를 정한다.
  function pendingView(p, me) {
    const filled = p.seats.filter(Boolean).length;
    return {
      roomId: p.id, me, waiting: true,
      count: filled, seats: p.seats.map((s) => (s ? { name: s.nick } : null)),
      willBe: seatsFor(filled),          // 지금 시작하면 몇 인전인지
    };
  }
  function pushPending(p) {
    for (let i = 0; i < 4; i++) {
      const s = p.seats[i]; if (!s) continue;
      io.to(s.sid).emit('g4_room', pendingView(p, i));
    }
  }
  function leavePending(sid) {
    for (const [pid, p] of Object.entries(pendings)) {
      const i = p.seats.findIndex((s) => s && s.sid === sid);
      if (i < 0) continue;
      p.seats[i] = null;
      if (!p.seats.some(Boolean)) delete pendings[pid];
      else pushPending(p);
      return;
    }
  }
  // want 를 주면 그 방으로 (초대 수락). 없으면 자리 남은 아무 방.
  function joinPending(socket, nick, want) {
    leavePending(socket.id);
    let p = (want && want.seats.some((s) => !s)) ? want : null;
    if (!p) p = Object.values(pendings).find((x) => x.seats.some((s) => !s));
    if (!p) { p = { id: 'W' + Math.random().toString(36).slice(2, 7).toUpperCase(), seats: [null, null, null, null] }; pendings[p.id] = p; }
    const i = p.seats.findIndex((s) => !s);
    p.seats[i] = { sid: socket.id, nick, token: socket.token || null, ip: socket.clientIp || null };
    socket.g4pending = p.id;
    pushPending(p);
    if (p.seats.filter(Boolean).length >= 4) beginPending(p);   // 다 차면 바로 시작
  }
  function beginPending(p) {
    const humans = p.seats.filter(Boolean).map((s) => ({ sid: s.sid, nick: s.nick }));
    delete pendings[p.id];
    for (const s of p.seats) if (s) { const sk = io.sockets.sockets.get(s.sid); if (sk) sk.g4pending = null; }
    if (humans.length) startRoom(humans, false, seatsFor(humans.length));
  }

  // ── 방 생성 ──────────────────────────────────────────────────────────────
  // humans: [{ sid, nick }] — 부족한 자리는 AI 가 채운다
  function startRoom(humans, solo, nSeats) {
    if (Object.keys(rooms4).length >= MAX_ROOMS4) {
      for (const h of humans) io.to(h.sid).emit('g4_error', '서버가 혼잡해요. 잠시 후 다시 시도해주세요.');
      return;
    }
    const n = nSeats || (solo ? 4 : seatsFor(humans.length));
    const bots = [...BOT_NICKS].sort(() => Math.random() - 0.5);
    const seats = [];
    // 멀티는 자리를 섞고, 솔로는 사람을 0번에 고정한다.
    // (첫 진행자는 createGame4 가 무작위로 정하므로 솔로에서 섞을 이유가 없다)
    const idx = Array.from({ length: n }, (_, i) => i);
    const order = solo ? idx : idx.slice().sort(() => Math.random() - 0.5);
    let hi = 0, bi = 0;
    for (let i = 0; i < n; i++) seats.push(null);
    for (const idx of order) {
      if (hi < humans.length) {
        const sk = io.sockets.sockets.get(humans[hi].sid);
        seats[idx] = { sid: humans[hi].sid, nick: humans[hi].nick, isBot: false, orphanAt: null,
                       token: (sk && sk.token) || null, ip: (sk && sk.clientIp) || null, left: false };
        hi++;
      }
      else { seats[idx] = { sid: null, nick: bots[bi++], isBot: true, orphanAt: null, token: null, ip: null, left: false }; }
    }
    const g = G.createGame4(seats.map((s) => s.nick), { n });
    const styles = AI.pickStyles();
    g.seats.forEach((s, i) => { s.style = styles[i]; s.isBot = seats[i].isBot; });

    const roomId = 'G4' + Math.random().toString(36).slice(2, 8).toUpperCase();
    rooms4[roomId] = { game: g, seats, next: null, lastStep: Date.now(), dead: false, solo: !!solo,
                       startedAt: Date.now(), rp: null };
    for (let i = 0; i < n; i++) {
      const sid = seats[i].sid; if (!sid) continue;
      const sk = io.sockets.sockets.get(sid);
      if (sk) { sk.g4room = roomId; sk.g4seat = i; }
      io.to(sid).emit('g4_begin', {
        roomId, me: i, n, solo: !!solo,
        seats: seats.map((s) => ({ name: s.nick, isBot: s.isBot })),
      });
    }
    push(roomId);
    schedule(roomId, 700);
    dbg('방 시작', roomId, n + '인', solo ? '솔로' : '멀티', '사람 ' + humans.length + '명');
  }

  // ── 워치독 ───────────────────────────────────────────────────────────────
  // ── 체스 시계 ────────────────────────────────────────────────────────────
  // 자리마다 3분. 지금 입력을 기다리는 사람 것만 줄어든다 — AI 는 즉시 두므로
  // 실제로는 사람만 쓴다. 감시 루프(3초)와 달리 1초마다 돌아야 초 단위로 보인다.
  //
  // 다 쓰면 그 자리를 AI 가 넘겨받는다. 2인전은 시간패지만 다인전에서 한 사람
  // 때문에 판을 끝내면 나머지가 억울하다 — 이미 있는 자리비움 처리와 같은 결.
  const clk = setInterval(() => {
    for (const [roomId, r] of Object.entries(rooms4)) {
      if (r.dead) continue;
      const g = r.game;
      if (!g || !g.clock || g.phase === 'game_over') continue;
      const seat = humanToAct(g, r);
      if (seat === null) continue;
      g.clock[seat] = Math.max(0, (g.clock[seat] || 0) - 1);
      // 매초 상태를 통째로 보내면 무겁다. 시계만 따로 가볍게 보낸다.
      for (const sk of r.seats) if (sk.sid) io.to(sk.sid).emit('g4_clock', { clock: g.clock, seat });
      if (g.clock[seat] > 0) continue;
      // 시간 소진 — AI 가 대신한다
      const sk = r.seats[seat];
      if (sk && !sk.isBot) {
        dbg('시간 소진 — AI 인계', roomId, 'seat=' + seat);
        if (sk.sid) io.to(sk.sid).emit('g4_timeout');
        sk.isBot = true; sk.sid = null; sk.left = true;
        push(roomId);
        schedule(roomId, 300);
      }
    }
  }, 1000);

  const wd = setInterval(() => {
    const now = Date.now();
    for (const [roomId, r] of Object.entries(rooms4)) {
      if (r.dead) continue;
      // 자리를 비운 사람 처리
      let changed = false;
      for (let i = 0; i < r.seats.length; i++) {
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
      const waiting = humanToAct(r.game, r);
      if (waiting !== null) {
        // 사람을 기다리는 중 — 다만 무한정은 아니다.
        markWait(r, waiting);
        if (now < (r.waitUntil || 0)) continue;
        r.afk = r.afk || {};
        r.afk[waiting] = (r.afk[waiting] || 0) + 1;
        console.warn('[g4] 시간 초과 — AI 가 대신 둡니다 room=' + roomId + ' seat=' + waiting
                     + ' phase=' + r.game.phase + ' (연속 ' + r.afk[waiting] + '회)');
        try {
          autoPlayFor(r.game, waiting);
        } catch (e) {
          console.error('[g4] 대리 진행 실패:', e);
        }
        markWait(r, null);
        r.lastStep = now;
        push(roomId);
        schedule(roomId, T.next);
        continue;
      }
      if (now - (r.lastStep || 0) < STUCK_MS) continue;
      console.warn('[g4] 진행이 멈춰 복구합니다 room=' + roomId + ' phase=' + r.game.phase);
      schedule(roomId, 60);
    }
  }, 3000);
  if (wd.unref) wd.unref();
  if (clk.unref) clk.unref();   // 시계도 같이 — 안 하면 프로세스가 안 끝난다

  // ── 소켓 ─────────────────────────────────────────────────────────────────
  // 핸들러가 예외로 죽으면 사용자에게는 "아무 반응 없음"으로만 보여 원인을 못 찾는다.
  // 감싸서 로그를 남기고 클라이언트에도 알린다.
  const safe = (socket, name, fn) => socket.on(name, (...a) => {
    try { fn(...a); }
    catch (e) {
      console.error('[g4] ' + name + ' 처리 중 오류:', e);
      try { socket.emit('g4_error', '문제가 생겼어요. 잠시 후 다시 시도해주세요.'); } catch (_) {}
    }
  });

  io.on('connection', (socket) => {
    const nickOf = (d) => String((d && d.nick) || '플레이어').slice(0, 12) || '플레이어';

    safe(socket, 'g4_start', (data = {}) => {          // 솔로 — 3인전(AI 2명) 또는 4인전(AI 3명)
      if (socket.g4room) destroy(socket.g4room, '재시작');
      leavePending(socket.id); socket.g4pending = null;
      // 자리 수는 클라이언트가 보내지만 3·4 외에는 받지 않는다
      const n = Number(data.n) === 3 ? 3 : 4;
      startRoom([{ sid: socket.id, nick: nickOf(data) }], true, n);
    });

    safe(socket, 'g4_quick', (data = {}) => {          // 대기방 입장 (인게임 화면에서 대기)
      if (socket.g4room) destroy(socket.g4room, '빠른대전 진입');
      joinPending(socket, nickOf(data));
    });

    safe(socket, 'g4_cancel', () => { leavePending(socket.id); socket.g4pending = null; socket.emit('g4_cancelled'); });

    // ── 대기방 친구 초대 ─────────────────────────────────────────────────
    // 빈자리의 + 를 눌러 친구를 부른다. 상대가 접속 중이어야 하고,
    // 초대를 받은 쪽이 눌러야 들어온다 — 남의 화면을 마음대로 못 끌어온다.
    safe(socket, 'g4_invite', (data = {}) => {
      const p = pendings[socket.g4pending];
      if (!p) return socket.emit('g4_invite_res', { error: '대기방에 있어야 초대할 수 있어요.' });
      if (!p.seats.some((x) => x && x.sid === socket.id)) return;
      if (p.seats.filter(Boolean).length >= 4) return socket.emit('g4_invite_res', { error: '자리가 다 찼어요.' });
      if (!socket.token) return socket.emit('g4_invite_res', { error: '로그인해야 초대할 수 있어요.' });

      const me = accounts.byToken(socket.token);
      if (!me) return socket.emit('g4_invite_res', { error: '로그인이 필요해요.' });
      // 친구인지는 서버가 확인한다 — 클라이언트가 보낸 상대를 그대로 믿으면
      // 아무에게나 초대를 날릴 수 있다.
      const target = String(data.idl || '');
      // friendIdlsOf 는 사용자 객체가 아니라 idl(소문자 아이디)을 받는다
      const friends = accounts.friendIdlsOf(String(me.id || '').toLowerCase());
      if (!friends.includes(target)) return socket.emit('g4_invite_res', { error: '친구만 초대할 수 있어요.' });

      const sid = hooks.sidOfIdl && hooks.sidOfIdl(target);
      if (!sid) return socket.emit('g4_invite_res', { error: '지금 접속 중이 아니에요.' });
      // 이미 판에 들어가 있으면 불러도 소용없다 — 미리 알려 준다
      const tsk = io.sockets.sockets.get(sid);
      if (tsk && (tsk.roomId || tsk.g4room)) {
        return socket.emit('g4_invite_res', { error: '지금 게임 중이에요.' });
      }
      io.to(sid).emit('g4_invited', {
        roomId: p.id,
        from: accounts.profileOf(me) ? accounts.profileOf(me).nick : '친구',
      });
      socket.emit('g4_invite_res', { ok: true });
    });

    // 초대를 받은 쪽이 수락 — 그 대기방으로 들어간다
    safe(socket, 'g4_accept', (data = {}) => {
      const p = pendings[String(data.roomId || '')];
      if (!p) return socket.emit('g4_invite_res', { error: '이미 끝난 방이에요.' });
      if (p.seats.filter(Boolean).length >= 4) return socket.emit('g4_invite_res', { error: '자리가 다 찼어요.' });
      if (socket.g4room) destroy(socket.g4room, '초대 수락');
      leavePending(socket.id);
      joinPending(socket, nickOf(data), p);
    });

    // 대기방에서 "시작" — 지금 앉아 있는 인원으로 몇 인전인지 정해진다.
    safe(socket, 'g4_startnow', () => {
      const p = pendings[socket.g4pending];
      if (!p || !p.seats.some((s) => s && s.sid === socket.id)) return;   // 방에 있는 사람만
      beginPending(p);
    });

    safe(socket, 'g4_act', (data = {}) => {
      const roomId = socket.g4room, r = rooms4[roomId];
      if (!r || r.dead) return;
      const me = socket.g4seat;
      if (me === null || me === undefined || !r.seats[me]) return;
      // 소켓이 끊겼다 붙으면 id 가 바뀐다. 자리에 적힌 옛 id 와 다르다고 입력을
      // 통째로 버리면, 그 사람은 아무것도 못 내고 시간만 흘러 AI 가 대신 둔다
      // ("카드가 안 내진다"의 정체). 자리 임자인지는 서버가 직접 심어 둔
      // socket.g4room/g4seat 로만 판단하므로, 다시 이어 붙여 준다.
      const seat = r.seats[me];
      if (seat.sid !== socket.id) {
        if (seat.isBot) return;                 // 이미 AI 가 넘겨받은 자리는 못 돌려준다
        seat.sid = socket.id; seat.orphanAt = null;
        dbg('자리 다시 연결', roomId, 'seat=' + me);
      }
      const g = r.game;
      let ok = false;
      if (data.type === 'draw' && g.phase === 'draw' && g.auctioneer === me) ok = G.draw(g);
      else if (data.type === 'offer' && g.phase === 'offer' && g.auctioneer === me) ok = G.offer(g, me, data.cardId);
      else if (data.type === 'auctionType' && g.phase === 'choose_type' && g.auctioneer === me) ok = G.chooseType(g, me, data.val);
      else if (data.type === 'bid' && g.phase === 'bidding') ok = G.bid(g, me, data.cardId);
      if (!ok) return push(roomId);
      r.lastStep = Date.now();
      markWait(r, null);          // 냈으니 이 사람 기다림은 끝
      if (r.afk) r.afk[me] = 0;   // 돌아왔으니 자리비움 해제
      push(roomId);
      schedule(roomId, T.next);
    });

    safe(socket, 'g4_resume', (data = {}) => {
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

    safe(socket, 'g4_leave', () => {
      leavePending(socket.id); socket.g4pending = null;
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
      leavePending(socket.id);
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

  return { count: () => Object.keys(rooms4).length, waiting: () => Object.keys(pendings).length };
}

module.exports = { attach4 };
