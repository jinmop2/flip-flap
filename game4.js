// ── 4인전 엔진 ────────────────────────────────────────────────────────────
// 2인용 엔진(server.js)과 완전히 분리된 독립 모듈이다.
// 클래식·아이템전이 운영 중이라 기존 엔진을 4인용으로 일반화하는 대신
// 여기서 따로 굴린다. 나중에 좌석에 실제 소켓을 채우면 PvP로도 확장된다.
//
// 룰·수량은 5만 판 시뮬레이션으로 결정했다 (순서 유불리 4.7%p, 종류 편중 2.7%p).
//   · 카드 37장 = 2종 6장 / 3종 9장 / 4종 9장 / 6종 13장
//   · 손패 6장씩(24장) + 중앙 덱 13장
//   · 진행자도 입찰한다. 단 첫 경매만 제외 — 선순위 진행자의 복리 이득을 끊는다.
//   · 배팅 카드는 "약하게 부른 사람부터 강한 카드"를 가져간다(역순 분배).

// 인원별 카드 구성 — 시뮬레이션으로 정한 값 (BALANCE 참고)
// [종류, 장수]. 세트 완성에 필요한 장수는 종류 값과 같다 (2종 2장 … 6종 6장)
// 2만 판 시뮬레이션으로 고른 값. 네 종류가 고르게 우승하고(종류 편중 ~2%p)
// 덱이 떨어져 흐지부지 끝나는 판이 거의 없도록(세트 완성 99%+) 맞췄다.
// 3인·4인이 같은 40장 덱을 쓴다. 손패 장수만 달리해서 균형을 맞췄다 —
// 같은 카드 세트로 두 인원을 모두 지원하는 게 실물로 만들 때도 유리하다.
const DECK40 = [[2, 6], [3, 10], [4, 10], [6, 14]];
const SPECS = { 3: DECK40, 4: DECK40 };      // 총 40장
const HAND = { 3: 7, 4: 6 };                 // 3인 덱 19장 / 4인 덱 16장
// 판마다 인원이 다르므로 전역 상수 대신 게임 객체가 자기 구성을 들고 다닌다
const specOf = (g) => SPECS[g.n] || SPECS[4];

const strength = (c) => c.kind * 100 + c.grade;     // 작을수록 강하다
const isTop = (c) => c.kind === 2 && c.grade === 1;                 // 최강 2-1
// 최약 카드는 구성마다 다르다 (6종의 마지막 등급). 구성을 안 주면 4인 기준.
const lowestGrade = (spec) => { for (const [k, n] of (spec || SPECS[4])) if (k === 6) return n; return 13; };
const isBot_ = (c, spec) => c.kind === 6 && c.grade === lowestGrade(spec);
// 졸개의 배신 — 최약이 최강을 이긴다
function beats(a, b, spec) {
  if (isBot_(a, spec) && isTop(b)) return true;
  if (isBot_(b, spec) && isTop(a)) return false;
  return strength(a) < strength(b);
}

function initDeck4(spec) {
  const cards = [];
  for (const [kind, count] of spec)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind * 100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function counts(acq) { const m = {}; for (const c of acq) m[c.kind] = (m[c.kind] || 0) + 1; return m; }
function checkSet(acq, spec) {
  const m = counts(acq);
  for (const [kind] of (spec || SPECS[4])) if ((m[kind] || 0) >= kind) return kind;
  return null;
}
// 세트 완성까지 남은 최소 장수 — 작을수록 리치에 가깝다
function needLeft(acq, spec) {
  const m = counts(acq); let best = Infinity;
  for (const [kind] of (spec || SPECS[4])) best = Math.min(best, kind - (m[kind] || 0));
  return best;
}
function progress(acq, spec) {
  const m = counts(acq); let best = 0, kind = null;
  for (const [k] of (spec || SPECS[4])) { const r = (m[k] || 0) / k; if (r > best) { best = r; kind = k; } }
  return { ratio: best, total: acq.length, kind };
}
const strengthSum = (acq) => acq.reduce((s, c) => s + strength(c), 0);

// 덱이 떨어졌을 때 순위 — 세트에 가장 가까운 사람이 이긴다
function rankSeats(seats, spec) {
  return seats.map((s, i) => ({ i, s })).sort((a, b) => {
    const n = needLeft(a.s.acq, spec) - needLeft(b.s.acq, spec); if (n) return n;
    const pa = progress(a.s.acq, spec), pb = progress(b.s.acq, spec);
    if (pa.ratio !== pb.ratio) return pb.ratio - pa.ratio;
    if (pa.total !== pb.total) return pb.total - pa.total;
    return strengthSum(a.s.acq) - strengthSum(b.s.acq);
  }).map((x) => x.i);
}

// ── 게임 생성 ──────────────────────────────────────────────────────────────
function createGame4(names, opts = {}) {
  const n = opts.n || names.length || 4;            // 3인 또는 4인
  const spec = opts.spec || SPECS[n] || SPECS[4];
  const hand = opts.hand || HAND[n] || 6;
  const deck = initDeck4(spec);
  const seats = [];
  for (let i = 0; i < n; i++)
    seats.push({ name: names[i], isBot: i !== 0, hand: deck.slice(i * hand, (i + 1) * hand), acq: [] });
  return {
    n, spec, seats,
    deck: deck.slice(n * hand),
    turn: 1,
    auctioneer: Math.floor(Math.random() * n),      // 첫 진행자는 무작위
    phase: 'draw',
    auction: null,
    firstAuction: true,
    over: null,
    lastResult: null,     // 직전 경매 결과 (연출용)
  };
}

// 이번 경매에 입찰할 좌석들 — 첫 경매만 진행자 제외
function bidderSeats(g) {
  const out = [];
  for (let i = 0; i < g.n; i++) {
    if (g.firstAuction && i === g.auctioneer) continue;
    if (g.seats[i].hand.length === 0) continue;    // 손패가 없으면 입찰 불가
    out.push(i);
  }
  return out;
}

// ── 진행 ───────────────────────────────────────────────────────────────────
function draw(g) {
  if (g.phase !== 'draw' || !g.deck.length) return false;
  const center = g.deck.pop();
  g.auction = { center, offered: null, type: null, bids: {}, order: null, closed: false, first: null };
  g.phase = 'offer';
  return true;
}

function offer(g, seat, cardId) {
  if (g.phase !== 'offer' || seat !== g.auctioneer) return false;
  const h = g.seats[seat].hand;
  const idx = h.findIndex((c) => String(c.id) === String(cardId));
  if (idx < 0) return false;
  g.auction.offered = h.splice(idx, 1)[0];
  g.phase = 'choose_type';
  return true;
}

function chooseType(g, seat, type) {
  if (g.phase !== 'choose_type' || seat !== g.auctioneer) return false;
  if (type !== 'open' && type !== 'close') return false;
  g.auction.type = type;
  // 오픈  : 경매품을 보여주고, 배팅은 모두 뒤집어 낸 뒤 한 번에 공개한다.
  // 클로즈: 경매품을 감추는 대신, 진행자가 먼저 공개로 배팅한다.
  //         나머지는 그 카드를 보고 동시에(서로는 모른 채) 낸 뒤 함께 공개한다.
  g.auction.closed = (type === 'close');
  g.auction.first = (type === 'close' && bidderSeats(g).includes(g.auctioneer))
    ? g.auctioneer : null;      // 첫 경매엔 진행자가 입찰하지 않으므로 선공개도 없다
  g.phase = 'bidding';
  return true;
}

// 지금 이 좌석이 낼 수 있는가 (클로즈는 진행자가 먼저 내야 나머지가 낼 수 있다)
function canBid(g, seat) {
  const a = g.auction;
  if (!a || g.phase !== 'bidding') return false;
  if (!bidderSeats(g).includes(seat) || a.bids[seat]) return false;
  if (a.first !== null && a.first !== undefined && !a.bids[a.first] && seat !== a.first) return false;
  return true;
}

// 진행자가 선공개로 낸 카드 — 클로즈에서 나머지가 보고 판단하는 정보
function openedBid(g) {
  const a = g.auction;
  if (!a || a.first === null || a.first === undefined) return null;
  return a.bids[a.first] ? { seat: a.first, card: a.bids[a.first] } : null;
}

function bid(g, seat, cardId) {
  if (!canBid(g, seat)) return false;
  const h = g.seats[seat].hand;
  const idx = h.findIndex((c) => String(c.id) === String(cardId));
  if (idx < 0) return false;
  g.auction.bids[seat] = h.splice(idx, 1)[0];
  return true;
}

const allBidsIn = (g) => bidderSeats(g).every((s) => g.auction.bids[s]) &&
                          Object.keys(g.auction.bids).length > 0;

// 낙찰 + 역순 분배
function settle(g) {
  const a = g.auction;
  const entries = Object.entries(a.bids).map(([s, card]) => ({ seat: Number(s), card }));
  const prize = [a.center, a.offered];

  if (!entries.length) {                       // 유찰 — 진행자가 회수한다
    g.seats[g.auctioneer].acq.push(...prize);
    g.lastResult = { winner: g.auctioneer, prize, payouts: [], unsold: true, betrayed: false };
  } else {
    // 졸개의 배신은 순환 관계(613>201, 201>409, 409>613)라 정렬 기준으로 쓰면 안 된다.
    // 줄세우기는 순수 세기로만 하고, 배신은 낙찰자만 뒤집는다.
    const sorted = [...entries].sort((x, y) => strength(x.card) - strength(y.card));   // 강 → 약
    let winner = sorted[0];
    let betrayed = false;
    if (isTop(sorted[0].card)) {
      const b = sorted.find((e) => isBot_(e.card, g.spec));
      if (b) { winner = b; betrayed = true; }
    }
    g.seats[winner.seat].acq.push(...prize);

    // 약하게 부른 사람부터 강한 카드를 가져간다 = 완전 역순
    const n = sorted.length;
    const recv = sorted.map((_, i) => sorted[n - 1 - i].card);   // sorted[i] 가 받을 카드

    // 배신이 나오면 최강·최약 카드는 각자에게 되돌아간다.
    // 안 그러면 배신자가 경매품 2장을 먹으면서 최강 카드까지 받는 이중 보상이 되어,
    // 0.9% 확률로만 터지는데 터지면 73%로 이기는 로또가 된다.
    if (betrayed) {
      const top = 0, bot = sorted.findIndex((e) => isBot_(e.card, g.spec));
      if (bot > 0) { recv[top] = sorted[top].card; recv[bot] = sorted[bot].card; }
    }

    const payouts = [];
    for (let i = 0; i < n; i++) {
      const to = sorted[i].seat, got = recv[i];
      g.seats[to].hand.push(got);
      payouts.push({ seat: to, card: got, gave: sorted[i].card });
    }
    g.lastResult = { winner: winner.seat, prize, payouts, unsold: false, betrayed,
                     bids: entries.map((e) => ({ seat: e.seat, card: e.card })) };
  }
  a.order = g.lastResult.payouts;
  g.phase = 'settled';

  // 승리 판정
  const done = [];
  for (let i = 0; i < g.n; i++) if (checkSet(g.seats[i].acq, g.spec)) done.push(i);
  if (done.length) {
    // 여럿이 동시에 완성하면 이번 경매 낙찰자를 우선한다
    const w = done.includes(g.lastResult.winner) ? g.lastResult.winner : done[0];
    // 승자 뒤의 등수도 매겨준다. 안 그러면 결과창에서 좌석 번호순으로 나열돼
    // "1장 남은 사람이 4등"처럼 엉뚱하게 보인다.
    const order = [w, ...rankSeats(g.seats, g.spec).filter((i) => i !== w)];
    g.over = { winner: w, reason: 'set', kind: checkSet(g.seats[w].acq, g.spec), order };
  }
  return g.lastResult;
}

// 다음 턴으로. 더 진행할 수 없으면 게임을 끝낸다.
function advance(g) {
  if (g.over) { g.phase = 'game_over'; return; }
  g.firstAuction = false;
  g.turn++;
  // 진행자는 시계방향. 손패가 없으면 출품할 수 없으니 다음 사람에게 넘긴다.
  let next = null;
  for (let k = 1; k <= g.n; k++) {
    const cand = (g.auctioneer + k) % g.n;
    if (g.seats[cand].hand.length > 0) { next = cand; break; }
  }
  if (next === null || !g.deck.length) {
    const order = rankSeats(g.seats, g.spec);
    g.over = { winner: order[0], reason: !g.deck.length ? 'deck' : 'nohand', order };
    g.phase = 'game_over';
    return;
  }
  g.auctioneer = next;
  g.auction = null;
  g.phase = 'draw';
}

module.exports = { SPECS, HAND, specOf, createGame4, draw, offer, chooseType, bid, canBid, openedBid,
                   settle, advance, bidderSeats, allBidsIn, checkSet, needLeft,
                   progress, rankSeats, beats, strength, isTop, isBot_, initDeck4 };
