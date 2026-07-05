const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const accounts = require('./accounts');

app.set('trust proxy', 1);
app.use(express.json({ limit: '4kb' }));
// 보안 헤더 (프레임 정책은 프리뷰 호환 위해 생략)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.get('/health', (req, res) => res.json({ ok: true, rooms: Object.keys(rooms).length, uptime: Math.round(process.uptime()) }));
app.use(express.static(path.join(__dirname, 'public')));

// 간단 rate limit (IP당 분당 N회) — 무차별 대입 방지
const rlMap = new Map();
function rateLimit(max) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0];
    const now = Date.now();
    let e = rlMap.get(ip);
    if (!e || now - e.ts > 60000) { e = { count: 0, ts: now }; rlMap.set(ip, e); }
    if (++e.count > max) return res.status(429).json({ error: '요청이 너무 많아요. 잠시 후 다시 시도하세요.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, e] of rlMap) if (now - e.ts > 120000) rlMap.delete(k); }, 120000);

// ── 인증 API ───────────────────────────────────────────────
app.post('/api/signup', rateLimit(20), (req, res) => { const { id, password, nick } = req.body || {}; res.json(accounts.signup(id, password, nick)); });
app.post('/api/login',  rateLimit(30), (req, res) => { const { id, password } = req.body || {}; res.json(accounts.login(id, password)); });
app.post('/api/me',     rateLimit(90), (req, res) => { const { token } = req.body || {}; res.json(accounts.meByToken(token)); });
app.get('/api/leaderboard', rateLimit(60), (req, res) => res.json({ ok: true, players: accounts.topPlayers(20) }));

// ── 카카오 간편로그인 (REST 키는 환경변수 KAKAO_REST_KEY) ──
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';   // 콘솔 [카카오 로그인>고급]의 Client Secret
function baseURL(req) { return `${req.protocol}://${req.get('host')}`; }
app.get('/api/kakao-enabled', (req, res) => res.json({ enabled: !!KAKAO_REST_KEY }));
app.get('/auth/kakao', rateLimit(30), (req, res) => {
  if (!KAKAO_REST_KEY) return res.redirect('/#kerr=' + encodeURIComponent('카카오 로그인이 아직 설정되지 않았어요'));
  const redirect = encodeURIComponent(baseURL(req) + '/auth/kakao/callback');
  res.redirect(`https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_KEY}&redirect_uri=${redirect}&response_type=code`);
});
app.get('/auth/kakao/callback', rateLimit(30), async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code || !KAKAO_REST_KEY) return res.redirect('/#kerr=' + encodeURIComponent('카카오 인증이 취소됐어요'));
    // 인가 코드 → 액세스 토큰
    const tr = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: KAKAO_REST_KEY, redirect_uri: baseURL(req) + '/auth/kakao/callback', code, ...(KAKAO_CLIENT_SECRET ? { client_secret: KAKAO_CLIENT_SECRET } : {}) }),
    });
    const tok = await tr.json();
    if (!tok.access_token) { console.error('카카오 토큰 실패:', JSON.stringify(tok)); return res.redirect('/#kerr=' + encodeURIComponent('카카오 인증에 실패했어요')); }
    // 회원번호·닉네임 조회
    const ur = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const ku = await ur.json();
    if (!ku.id) { console.error('카카오 유저 조회 실패:', JSON.stringify(ku)); return res.redirect('/#kerr=' + encodeURIComponent('카카오 정보를 가져오지 못했어요')); }
    const nick = (ku.kakao_account && ku.kakao_account.profile && ku.kakao_account.profile.nickname) || (ku.properties && ku.properties.nickname) || '플레이어';
    const out = accounts.kakaoLogin(ku.id, nick);
    // 토큰은 URL 프래그먼트로 전달 (서버 로그·리퍼러에 안 남음) — 클라가 저장 후 지움
    res.redirect('/#ktoken=' + out.token);
  } catch (e) { console.error('카카오 콜백 오류:', e.message); res.redirect('/#kerr=' + encodeURIComponent('카카오 로그인 중 오류가 났어요')); }
});

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
  // 선공 뽑기용 카드 2장 (덱과 별개 컨셉 카드)
  const all = initDeck();
  const pickCards = [all[0], all.find(c => c.id !== all[0].id)];
  const game = {
    centerDeck: deck.slice(0, 12),
    p1Hand: deck.slice(12, 18),
    p2Hand: deck.slice(18, 24),
    p1Acquired: [], p2Acquired: [],
    turn: 1, phase: 'pick', auctioneer: 1, auction: null,
    time: { 1: 420, 2: 420 },   // 체스 시계: 각 7분(초)
    pick: { cards: pickCards, choices: [null, null], revealed: false },  // 선공 결정
  };
  return game;
}

// 선공 뽑기 완료 → 강한 카드 뽑은 사람이 선공
function resolvePick(game) {
  const p = game.pick;
  const c1 = p.cards[p.choices[0]], c2 = p.cards[p.choices[1]];
  game.auctioneer = aBeatsB(c1, c2) ? 1 : 2;
  p.revealed = true;
  game.phase = 'pick_reveal';
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
    default: return 0;  // pick, reveal, game_over
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

// ══ 개선 전문가 AI (상대 견제 + 실현가능 목표 + 최소 승리 배팅) ══
const TOTAL = { 2: 2, 3: 5, 4: 7, 6: 10 };
const cnt = (acq, kind) => acq.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0);
function feasibleTarget(myAcq, oppAcq) {
  let best = null, bestScore = -1;
  for (const [kind] of SPEC) {
    const myC = cnt(myAcq, kind), oppC = cnt(oppAcq, kind);
    if (TOTAL[kind] - oppC < kind) continue;   // 남은 카드로 완성 불가 → 포기
    if (myC >= kind) continue;
    const score = myC / kind + (kind <= 3 ? 0.04 : 0);
    if (score > bestScore) { bestScore = score; best = kind; }
  }
  return best ?? 6;
}
function wantValue(prize, myAcq, target) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(myAcq, c.kind);
    let cv = need <= 0 ? 1 : 1 / need;
    if (c.kind === target) cv = Math.max(cv, 0.75);
    if (need === 1) cv = Math.max(cv, 0.97);   // 이걸로 내 세트 완성
    v = Math.max(v, cv);
  }
  return v;
}
function denyValue(prize, oppAcq) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(oppAcq, c.kind);
    if (need === 1) v = Math.max(v, 0.88);     // 상대 완성 임박 → 뺏기
    else if (need === 2) v = Math.max(v, 0.45);
  }
  return v;
}
function offerX(hand, myAcq, oppAcq) {
  const target = feasibleTarget(myAcq, oppAcq);
  let pool = hand.filter(c => c.kind !== target);
  if (!pool.length) pool = hand.slice();
  const safe = pool.filter(c => c.kind - cnt(oppAcq, c.kind) !== 1);  // 상대 완성시켜줄 카드 회피
  const use = safe.length ? safe : pool;
  return [...use].sort((a, b) => strength(b) - strength(a))[0];
}
function typeX(hand, prize, myAcq, oppAcq) {
  const val = Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, oppAcq)), denyValue(prize, oppAcq));
  return val >= 0.5 ? 'open' : 'closed';
}
// visOpp: 클로즈 후공일 때 보이는 진행자 배팅카드 · deckLeft: 남은 덱
function decideBidX(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  const target = feasibleTarget(myAcq, oppAcq);
  let val = Math.max(wantValue(prize, myAcq, target), denyValue(prize, oppAcq));
  // 경매 승리 자체가 진행도(획득 2장)에 유리 → 카드 열세거나 종반이면 싸게라도 경합
  const behind = myAcq.length <= oppAcq.length;
  const late = (deckLeft ?? 12) <= 5;
  if (behind || late) val = Math.max(val, late ? 0.5 : 0.42);
  if (visOpp) {   // 상대 배팅이 보이면 최소 승리 배팅으로 강카드 절약
    if (val < 0.3) return byStrong[byStrong.length - 1];
    const winners = hand.filter(c => aBeatsB(c, visOpp)).sort((a, b) => strength(b) - strength(a));
    if (winners.length) return winners[0];
    return byStrong[byStrong.length - 1];
  }
  if (val >= 0.8)  return byStrong[0];
  if (val >= 0.55) return byStrong[Math.min(1, byStrong.length - 1)];
  if (val >= 0.3)  return byStrong[Math.floor(byStrong.length / 2)];
  return byStrong[byStrong.length - 1];
}

// AI가 행동할 차례인지 확인하고 실행
function maybeCpuAct(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.cpuIndex === undefined) return;
  const g = room.game, ci = room.cpuIndex;

  if (g.phase === 'draw' && g.auctioneer === ci + 1) {
    delay(() => { if (g.phase !== 'draw') return; drawCenter(g); broadcast(roomId); maybeCpuAct(roomId); }, 600, 500);
  }
  else if (g.phase === 'offer' && g.auctioneer === ci + 1) {
    delay(() => {
      if (g.phase !== 'offer') return;
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      const card = room.difficulty === 'expert' ? offerX(hand, acq, opp) : cpuChooseOffer(hand, acq);
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
      if (g.phase !== 'choose_type') return;
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      const prize = [g.auction.centerCard, g.auction._offeredCard];
      const type = room.difficulty === 'expert'
        ? typeX(hand, prize, acq, opp)
        : cpuChooseType(hand, prize, acq, room.difficulty);
      g.auction.auctionType = type === 'close' ? 'closed' : type;   // 'open'|'closed'
      g.phase = 'bidding';
      broadcast(roomId);
      maybeCpuAct(roomId);
    }, 500, 700);
  }
  else if (g.phase === 'bidding') {
    const submitted = ci === 0 ? g.auction.p1Submitted : g.auction.p2Submitted;
    if (submitted) return;
    // 진행자 먼저 배팅: CPU가 비진행자면 진행자(사람) 제출 후에만 배팅
    const isAuctioneer = g.auctioneer === ci + 1;
    if (!isAuctioneer) {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (!aucBid) return;
    }
    delay(() => {
      if (g.phase !== 'bidding') return;
      const already = ci === 0 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (already) return;                 // 이미 배팅함(중복 방지)
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      const prize = [g.auction.centerCard, g.auction._offeredCard];
      let bid;
      if (room.difficulty === 'expert') {
        // 클로즈 후공이면 진행자 배팅 카드가 보임 → 최소 승리 배팅
        const visOpp = (!isAuctioneer && g.auction.auctionType === 'closed')
          ? (g.auctioneer === 1 ? g.auction.p1Bid : g.auction.p2Bid) : null;
        bid = decideBidX(hand, prize, acq, opp, visOpp, g.centerDeck.length);
      } else {
        bid = cpuDecideBid(hand, prize, acq, room.difficulty);
      }
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
  // 선공 뽑기 정보 (공개 전엔 카드 내용 숨김)
  let pick = null;
  if (game.pick && (game.phase === 'pick' || game.phase === 'pick_reveal')) {
    pick = {
      myChoice:  game.pick.choices[pi],
      oppChoice: game.pick.choices[1 - pi],
      cards: game.pick.revealed ? game.pick.cards : [null, null],
    };
  }
  return {
    phase: game.phase, turn: game.turn, auctioneer: game.auctioneer,
    centerDeckSize: game.centerDeck.length,
    myHand: isP1 ? game.p1Hand : game.p2Hand,
    oppHandLen: isP1 ? game.p2Hand.length : game.p1Hand.length,
    myAcq:  isP1 ? game.p1Acquired : game.p2Acquired,
    oppAcq: isP1 ? game.p2Acquired : game.p1Acquired,
    auction, pick, myIndex: pi + 1,
    time: game.time, active: activePlayer(game),
  };
}

function broadcast(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('state_update', stateFor(room.game, i)); });
}

// ── 체스 시계 (전역 틱 1개로 모든 방 처리 — 방마다 타이머 안 만듦) ──
function startClock(roomId) { const r = rooms[roomId]; if (r) r.clockOn = true; }
function endClock(room) { if (room) room.clockOn = false; }
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.clockOn) continue;
    const g = room.game;
    if (!g || g.phase === 'game_over') continue;
    const ap = activePlayer(g);
    if (ap) {
      g.time[ap] = Math.max(0, g.time[ap] - 1);
      if (g.time[ap] === 60)
        room.players.forEach(sid => { if (sid) io.to(sid).emit('time_warning', { player: ap }); });
      if (g.time[ap] <= 0) {
        g.phase = 'game_over';
        const winner = ap === 1 ? 2 : 1;
        finishStats(room, winner);
        room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, timeout: true, myIndex: i + 1 }); });
        endClock(room);
        continue;
      }
    }
    room.players.forEach(sid => { if (sid) io.to(sid).emit('clock', { t1: g.time[1], t2: g.time[2], active: ap }); });
  }
}, 1000);

// ── 공개 방 목록 ────────────────────────────────────────────
function openRoomList() {
  const list = [];
  for (const [id, r] of Object.entries(rooms)) {
    if (!r.vsBot && !r.game && r.players[0] && !r.players[1])
      list.push({ id, name: r.name || '이름 없는 방', host: (r.nicks && r.nicks[0]) || '???', secret: !!r.secret });
  }
  return list.slice(-30).reverse();
}
// 로비 목록 브로드캐스트 — 빈번한 변경을 400ms로 묶어 폭증 방지
let roomsBcTimer = null;
function broadcastRooms() {
  if (roomsBcTimer) return;
  roomsBcTimer = setTimeout(() => { roomsBcTimer = null; io.to('lobby').emit('rooms', openRoomList()); }, 400);
}
const cleanNick = n => (String(n || '').trim().slice(0, 12)) || '게스트';
const MAX_ROOMS = 800;               // 서버 전체 방 상한
const MAX_CONN_PER_IP = 8;           // IP당 소켓 연결 상한
const connByIp = new Map();
let matchQueue = [];                  // 빠른 대전 대기열

// ── 소켓 ───────────────────────────────────────────────────

io.on('connection', (socket) => {
  // IP당 연결 수 제한 (DoS 방지)
  const ip = (socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'x').split(',')[0].trim();
  const n = (connByIp.get(ip) || 0) + 1; connByIp.set(ip, n);
  if (n > MAX_CONN_PER_IP) { socket.emit('error', '연결이 너무 많아요.'); socket.disconnect(true); return; }

  // 소켓 이벤트 rate limit (초당 30건 초과 시 드롭 — 스팸/브루트포스 방지)
  socket.use((packet, next) => {
    const now = Date.now();
    if (!socket._rl || now - socket._rl.ts > 1000) socket._rl = { ts: now, c: 0 };
    if (++socket._rl.c > 30) return;   // 초과분은 조용히 드롭
    next();
  });

  socket.join('lobby');

  function leaveOldRoom() {
    const old = socket.roomId && rooms[socket.roomId];
    if (old) { endClock(old); delete rooms[socket.roomId]; socket.roomId = null; broadcastRooms(); }
  }

  // 로그인 토큰 연결 (계정 프로필)
  socket.on('auth', ({ token } = {}) => {
    const u = token && accounts.byToken(token);
    if (u) { socket.token = token; socket.emit('auth_ok', { profile: accounts.profileOf(u) }); }
    else { socket.token = null; }
  });
  // 이 소켓 플레이어의 프로필 (로그인=계정, 아니면 게스트)
  function myProfile(nick) {
    if (socket.token) { const u = accounts.byToken(socket.token); if (u) return accounts.profileOf(u); }
    return { nick: cleanNick(nick), guest: true };
  }

  socket.on('enter_lobby', () => { socket.join('lobby'); socket.emit('rooms', openRoomList()); });

  socket.on('create_room', ({ vsBot = false, difficulty = 'hard', pid, name, nick, secret, password } = {}) => {
    if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('error', '서버가 혼잡해요. 잠시 후 시도하세요.');
    leaveOldRoom();
    socket.leave('lobby');
    const roomId = makeRoomId();
    const prof = myProfile(nick);
    rooms[roomId] = {
      players: [socket.id, null], pids: [pid || null, null], nicks: [prof.nick, null],
      profiles: [prof, null], tokens: [socket.token || null, null],
      name: String(name || '').trim().slice(0, 20), game: null, vsBot, difficulty,
      secret: !vsBot && !!secret, password: String(password || '').slice(0, 12),
    };
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    if (vsBot) {
      rooms[roomId].cpuIndex = 1;
      rooms[roomId].nicks[1] = 'AI';
      rooms[roomId].profiles[1] = { nick: 'AI', guest: true, bot: true };
      rooms[roomId].game = createGame();
      socket.emit('game_start', { vsBot: true, difficulty, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles });
      broadcast(roomId);
      startClock(roomId);
      setTimeout(() => maybeCpuAct(roomId), 600);
    } else {
      socket.emit('room_created', { roomId, name: rooms[roomId].name });
      broadcastRooms();
    }
  });

  socket.on('join_room', ({ roomId, pid, nick, password }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '방을 찾을 수 없어요.');
    if (room.game || room.players.filter(Boolean).length >= 2) return socket.emit('error', '이미 시작했거나 꽉 찬 방이에요.');
    if (room.secret) {
      if ((room.pwFails || 0) >= 10) return socket.emit('error', '비밀번호 시도 초과. 방이 잠겼어요.');
      if (String(password || '') !== room.password) { room.pwFails = (room.pwFails || 0) + 1; return socket.emit('need_password', { roomId, wrong: password != null }); }
    }
    const prof = myProfile(nick);
    room.players[1] = socket.id; room.pids[1] = pid || null; room.nicks[1] = prof.nick;
    room.profiles[1] = prof; room.tokens[1] = socket.token || null;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 1; socket.pid = pid;
    room.game = createGame();
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks, profiles: room.profiles });
    broadcast(roomId);
    startClock(roomId);
    broadcastRooms();
  });

  // 새로고침/끊김 후 재접속
  socket.on('rejoin', ({ roomId, pid } = {}) => {
    const room = rooms[roomId];
    if (!room || !room.game || room.game.phase === 'game_over') return socket.emit('rejoin_failed');
    const slot = room.pids.indexOf(pid);
    if (slot === -1) return socket.emit('rejoin_failed');
    room.players[slot] = socket.id;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = slot; socket.pid = pid;
    if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }  // 유예 정지(남은 시간 유지)
    if (!room.clockOn) startClock(roomId);               // 멈췄던 시계 재개
    socket.emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId, nicks: room.nicks, profiles: room.profiles });
    broadcast(roomId);
    const other = room.players[1 - slot];               // 재접속 알림은 상대에게만
    if (other) io.to(other).emit('opp_reconnected');
    setTimeout(() => maybeCpuAct(roomId), 300);
  });

  // 빠른 대전 (자동 매칭)
  socket.on('quick_match', ({ pid, nick } = {}) => {
    if (socket.roomId && rooms[socket.roomId]) return;
    matchQueue = matchQueue.filter(q => q.sid !== socket.id);
    let opp = null;
    while (matchQueue.length) { const c = matchQueue.shift(); if (c.sid !== socket.id && io.sockets.sockets.get(c.sid)) { opp = c; break; } }
    const me = { sid: socket.id, pid, nick, token: socket.token };
    if (opp) startMatch(opp, me);
    else { matchQueue.push(me); socket.emit('queued'); }
  });
  socket.on('cancel_match', () => { matchQueue = matchQueue.filter(q => q.sid !== socket.id); socket.emit('unqueued'); });

  // 선공 뽑기: 중앙 카드 2장 중 하나 선택
  socket.on('pick_card', ({ slot } = {}) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'pick' || !g.pick) return;
    if (slot !== 0 && slot !== 1) return;
    const pi = socket.playerIndex;
    if (g.pick.choices[pi] !== null) return;                       // 이미 골랐음
    if (g.pick.choices[1 - pi] === slot) return;                   // 상대가 고른 카드
    g.pick.choices[pi] = slot;
    // AI 상대면 남은 카드 자동 선택
    if (room.cpuIndex !== undefined && g.pick.choices[room.cpuIndex] === null) {
      g.pick.choices[room.cpuIndex] = 1 - slot;
    }
    if (g.pick.choices[0] !== null && g.pick.choices[1] !== null) {
      resolvePick(g);
      broadcast(socket.roomId);
      // 2.2초 공개 후 게임 시작
      setTimeout(() => {
        if (!rooms[socket.roomId] || g.phase !== 'pick_reveal') return;
        startTurn(g);
        broadcast(socket.roomId);
        setTimeout(() => maybeCpuAct(socket.roomId), 400);
      }, 2200);
    } else {
      broadcast(socket.roomId);
    }
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

  // 이모트 전달 (입력 제한)
  socket.on('emote', ({ emoji } = {}) => {
    const room = rooms[socket.roomId]; if (!room) return;
    const e = String(emoji || '').slice(0, 8); if (!e) return;
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('emote', { emoji: e }); });
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

  // 게임 나가기 — 진행 중이면 나간 사람 몰수패 (상대에게만 몰수승 전송)
  socket.on('leave_room', () => {
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
    endClock(room);
    const slot = room.players.indexOf(socket.id);
    const g = room.game;
    if (g && g.phase !== 'game_over' && !room.vsBot && slot !== -1) {
      const winner = slot === 0 ? 2 : 1;
      g.phase = 'game_over';
      finishStats(room, winner);
      room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
    } else {
      room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('opponent_left'); });
    }
    delete rooms[roomId];
    socket.roomId = null;
    socket.join('lobby'); broadcastRooms();
  });

  socket.on('disconnect', () => {
    const c = (connByIp.get(ip) || 1) - 1;   // IP 연결 카운트 감소
    if (c <= 0) connByIp.delete(ip); else connByIp.set(ip, c);
    matchQueue = matchQueue.filter(q => q.sid !== socket.id);  // 매칭 대기열에서 제거
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    const slot = room.players.indexOf(socket.id);
    if (slot === -1) return;   // 이미 교체된 옛 소켓 → 무시 (양쪽 오알림 방지)
    room.players[slot] = null;
    // 게임 종료 상태거나 둘 다 끊김 → 즉시 정리
    if (!room.game || room.game.phase === 'game_over' || (!room.players[0] && !room.players[1])) {
      if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
      endClock(room); delete rooms[roomId]; broadcastRooms(); return;
    }
    // 튕김 횟수 누적 — 3회 이상이면 즉시 몰수패
    room.dcCount = room.dcCount || [0, 0];
    room.dcCount[slot]++;
    if (room.dcCount[slot] >= 3) return forfeitPlayer(roomId, slot);
    // 유예 카운트다운 (누적 60초 — 재접속하면 정지, 또 끊기면 남은 시간부터)
    endClock(room);
    room.graceLeft = room.graceLeft || [60, 60];
    const opp = () => room.players[1 - slot];
    if (opp()) io.to(opp()).emit('opp_disconnected', { left: room.graceLeft[slot], strikes: room.dcCount[slot] });
    if (room.graceTimer) clearInterval(room.graceTimer);
    room.graceTimer = setInterval(() => {
      if (!rooms[roomId]) { clearInterval(room.graceTimer); return; }
      room.graceLeft[slot]--;
      if (opp()) io.to(opp()).emit('grace_tick', { left: room.graceLeft[slot] });
      if (room.graceLeft[slot] <= 0) forfeitPlayer(roomId, slot);
    }, 1000);
  });
});

// slot 플레이어 몰수패 처리 (상대 승리 + 전적 반영 + 방 정리)
function forfeitPlayer(roomId, slot) {
  const room = rooms[roomId]; if (!room) return;
  if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
  endClock(room);
  const winner = slot === 0 ? 2 : 1;
  if (room.game) room.game.phase = 'game_over';
  finishStats(room, winner);
  room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
  delete rooms[roomId]; broadcastRooms();
}

// 같은 방 새 게임 시작
function restartGame(roomId) {
  const room = rooms[roomId]; if (!room) return;
  room.game = createGame();
  room.rematch = [false, false];
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId, nicks: room.nicks, profiles: room.profiles }); });
  broadcast(roomId);
  startClock(roomId);
  if (room.cpuIndex !== undefined) setTimeout(() => maybeCpuAct(roomId), 600);
}

// 빠른 대전 매칭된 두 소켓으로 방 생성·시작
function startMatch(a, b) {
  const sa = io.sockets.sockets.get(a.sid), sb = io.sockets.sockets.get(b.sid);
  if (!sa || !sb) { if (sa) matchQueue.push(a); if (sb) matchQueue.push(b); return; }
  if (Object.keys(rooms).length >= MAX_ROOMS) { sa.emit('error', '서버가 혼잡해요.'); sb.emit('error', '서버가 혼잡해요.'); return; }
  const profOf = e => { const u = e.token && accounts.byToken(e.token); return u ? accounts.profileOf(u) : { nick: cleanNick(e.nick), guest: true }; };
  const pA = profOf(a), pB = profOf(b);
  const roomId = makeRoomId();
  rooms[roomId] = {
    players: [a.sid, b.sid], pids: [a.pid || null, b.pid || null], nicks: [pA.nick, pB.nick],
    profiles: [pA, pB], tokens: [a.token || null, b.token || null],
    name: '빠른 대전', game: null, vsBot: false, difficulty: 'hard', secret: false, password: '',
  };
  sa.leave('lobby'); sa.join(roomId); sa.roomId = roomId; sa.playerIndex = 0; sa.pid = a.pid;
  sb.leave('lobby'); sb.join(roomId); sb.roomId = roomId; sb.playerIndex = 1; sb.pid = b.pid;
  rooms[roomId].game = createGame();
  io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles });
  broadcast(roomId);
  startClock(roomId);
}

function resolveBidding(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  if (g.phase !== 'bidding' || !g.auction) return;   // 이미 처리됨(이중 정산 방지)
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
      finishStats(room, winner);
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
    finishStats(room, winner);
    room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, setKind, byProgress: true, myIndex: i + 1 }); });
    return;
  }
  g.turn++;
  g.auctioneer = g.auctioneer === 1 ? 2 : 1;
  startTurn(g);
  broadcast(roomId);
  setTimeout(() => maybeCpuAct(roomId), 400);
}

// 로그인 유저의 전적/랭크/레벨 반영 + 갱신된 프로필 전송
function finishStats(room, winner) {
  if (!room.tokens) return;
  room.tokens.forEach((tok, i) => {
    if (!tok) return;
    const result = winner === 0 ? 'draw' : (winner === i + 1 ? 'win' : 'loss');
    const prof = accounts.recordResult(tok, result);
    if (prof && room.players[i]) io.to(room.players[i]).emit('profile', { profile: prof, result });
  });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`http://localhost:${PORT}`));
