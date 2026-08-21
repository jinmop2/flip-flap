// ── 4인전 엔진 ────────────────────────────────────────────────────────────
// 2인용 엔진(server.js)과 완전히 분리된 독립 모듈이다.
// 클래식·아이템전이 운영 중이라 기존 엔진을 4인용으로 일반화하는 대신
// 여기서 따로 굴린다. 나중에 좌석에 실제 소켓을 채우면 PvP로도 확장된다.
//
// 룰·수량은 시뮬레이션으로 결정했다.
//   · 4인 38장 = 2종 4장 / 3종 6장 / 4종 10장 / 6종 18장
//   · 3인 30장 = 2종 3장 / 3종 5장 / 4종 8장 / 6종 14장 (38장에서 8장을 덜어낸다)
//   · 손패 6장씩, 나머지가 중앙 덱 (3인 12장 / 4인 14장)
//   · 진행자도 함께 입찰한다 (예외 없음).
//   · 배팅 카드는 "약하게 부른 사람부터 강한 카드"를 가져간다(역순 분배).

// [종류, 장수]. 세트 완성에 필요한 장수는 종류 값과 같다 (2종 2장 … 6종 6장)
//
// 장수는 "완성 난이도를 맞추는" 문제다. 2종은 2장만 모으면 이기니 적게, 6종은
// 6장이 필요하니 많이 넣는다. 그런데 단순 비례(장수 ∝ 필요장수)로는 안 맞았다.
// 적게 필요한 세트는 운 좋게 초반에 튀어 끝나는 일이 잦아서(분산이 크다),
// 비례보다 더 깎아야 균형이 맞는다.
//
// 장수는 두 번 크게 바꿨다.
//   ① 예전 40장(2:6 3:10 4:10 6:14)은 AI 가 아무 세트나 쫓을 때만 균형처럼 보였다.
//      AI 가 "가장 빨리 되는 세트" 를 노리자 3종 54% / 6종 2% 로 무너졌다.
//   ② 46장으로 늘려 맞췄더니 이번엔 카드가 너무 많아 판이 헐거워졌다.
//      클로즈를 순차 공개로 바꾸면서 판이 촘촘해져, 다시 줄일 여유가 생겼다.
// 6000판 × 3인·4인 기준 종류 편차: 3인 5.2%p / 4인 4.5%p
//
// ③ 3인은 38장이 과했다. 17장짜리 덱에서 실제로 뽑히는 건 평균 7.9장뿐 —
//    9장은 아예 안 나온 채 판이 끝났다. 카드가 많으니 한 장의 무게도 가벼워서,
//    세트를 만들려면 그 종류의 43%만 모으면 됐다(2인전은 69%).
//    30장으로 줄이니 종류 편차는 6.9p → 6.7p 로 그대로인데(8000판), 안 쓰는
//    카드가 9.1 → 3.7장으로 줄고 한 장의 무게가 43% → 55% 로 올랐다.
//    4인은 줄이면 무너진다 — 30장이면 4명이 6장씩 쥐고 덱에 6장만 남아
//    세트 완성률이 95% → 18%, 종류 편차가 4.3p → 39.8p 가 된다. 그대로 둔다.
//
// 3인 덱은 4인 덱에서 8장을 덜어낸 것이다(2종 1·3종 1·4종 2·6종 4).
// 같은 카드 한 벌로 두 인원을 모두 지원하는 게 실물로 만들 때도 유리하다.
const DECK38 = [[2, 4], [3, 6], [4, 10], [6, 18]];   // 4인 — 총 38장
const DECK30 = [[2, 3], [3, 5], [4, 8], [6, 14]];    // 3인 — 총 30장
const SPECS = { 3: DECK30, 4: DECK38 };
const HAND = { 3: 6, 4: 6 };                 // 3인 덱 12장 / 4인 덱 14장
// 판마다 인원이 다르므로 전역 상수 대신 게임 객체가 자기 구성을 들고 다닌다
const specOf = (g) => SPECS[g.n] || SPECS[4];

const strength = (c) => c.kind * 100 + c.grade;     // 작을수록 강하다
const isTop = (c) => c.kind === 2 && c.grade === 1;                 // 최강 2-1
// 최약 카드는 구성마다 다르다 (6종의 마지막 등급). 구성을 안 주면 4인 기준.
const lowestGrade = (spec) => { for (const [k, n] of (spec || SPECS[4])) if (k === 6) return n; return 18; };
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
  // 체스 시계 — 자리마다 3분. 2인전(5분)보다 짧게 잡은 건 사람이 여럿이라
  // 한 사람이 오래 끌면 나머지가 그만큼 더 기다리기 때문이다.
  const clock = {};
  for (let i = 0; i < n; i++) clock[i] = 180;
  return {
    n, spec, seats, clock,
    deck: deck.slice(n * hand),
    turn: 1,
    auctioneer: Math.floor(Math.random() * n),      // 첫 진행자는 무작위
    phase: 'draw',
    auction: null,
    over: null,
    lastResult: null,     // 직전 경매 결과 (연출용)
  };
}

// 이번 경매에 입찰할 좌석들. 진행자도 함께 입찰한다.
// 예전에는 첫 경매만 진행자를 뺐다 — 첫 진행자가 진행 횟수를 평균 0.5회 더 가져가
// 유리해지는 걸 상쇄하려던 장치였는데, "지금은 낼 수 없다"가 게임 흐름을 끊어서 없앴다.
// 대신 첫 진행자를 매판 무작위로 뽑아 자리 유불리로 굳지 않게 한다.
function bidderSeats(g) {
  const out = [];
  for (let i = 0; i < g.n; i++) {
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
  //         동시에 내므로 서로를 읽을 수 없다 — 대신 물건이 뭔지는 안다.
  // 클로즈: 경매품을 감추는 대신, 진행자부터 시계방향으로 한 명씩 공개하며 낸다.
  //         뒤에 내는 사람은 앞사람들 카드를 다 보고 정한다.
  //         앞사람은 세게 질러 뒤를 물러나게 하는 수(허세)가 생긴다.
  //         동시 입찰에서는 "한 명을 읽어도 나머지에게 뺏길" 확률 때문에
  //         심리전이 성립하지 않아서(인원 m 일 때 읽기의 가치가 2/m), 순차로 바꿨다.
  g.auction.closed = (type === 'close');
  if (type === 'close') {
    // 진행자부터 시계방향. 손패가 없어 못 내는 사람은 건너뛴다.
    const bidders = bidderSeats(g);
    const seq = [];
    for (let k = 0; k < g.n; k++) {
      const cand = (g.auctioneer + k) % g.n;
      if (bidders.includes(cand)) seq.push(cand);
    }
    g.auction.seq = seq;
    g.auction.first = seq.length ? seq[0] : null;
  } else {
    g.auction.seq = null;
    g.auction.first = null;
  }
  g.phase = 'bidding';
  return true;
}

// 클로즈에서 지금 낼 차례인 좌석 (오픈이면 null — 아무나 먼저 내도 된다)
function turnToBid(g) {
  const a = g.auction;
  if (!a || !a.seq) return null;
  for (const s of a.seq) if (!a.bids[s]) return s;
  return null;
}

// 지금 이 좌석이 낼 수 있는가.
// 클로즈는 순서제 — 진행자부터 한 명씩, 앞사람이 내야 다음 사람 차례가 온다.
function canBid(g, seat) {
  const a = g.auction;
  if (!a || g.phase !== 'bidding') return false;
  if (!bidderSeats(g).includes(seat) || a.bids[seat]) return false;
  if (a.seq) return turnToBid(g) === seat;
  return true;
}

// 클로즈에서 지금까지 공개된 배팅들 — 뒤에 내는 사람이 보고 판단하는 정보.
// 순서대로 낸 것만 담기므로, 아직 안 낸 사람 것은 들어 있지 않다.
function openedBids(g) {
  const a = g.auction;
  if (!a || !a.seq) return [];
  const out = [];
  for (const s of a.seq) {
    if (!a.bids[s]) break;              // 아직 안 낸 사람부터는 볼 수 없다
    out.push({ seat: s, card: a.bids[s] });
  }
  return out;
}
// 지금까지 공개된 것 중 가장 강한 배팅 (없으면 null)
function openedBid(g) {
  const list = openedBids(g);
  if (!list.length) return null;
  let best = list[0];
  for (const e of list) if (strength(e.card) < strength(best.card)) best = e;
  return best;
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

module.exports = { SPECS, HAND, specOf, createGame4, draw, offer, chooseType, bid, canBid, openedBid, openedBids, turnToBid,
                   settle, advance, bidderSeats, allBidsIn, checkSet, needLeft,
                   progress, rankSeats, beats, strength, isTop, isBot_, initDeck4 };
