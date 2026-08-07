// 다인전 밸런스 시뮬레이터
//   node tools/sim4.js [판수] [인원]
// 덱 구성·룰을 바꿔가며 돌려보고, 무엇이 어떻게 달라지는지 수치로 본다.
const G = require('../game4');
const AI = require('../ai4');

// 시드 고정 난수 — 구성끼리 비교할 때 같은 패가 나와야 공정하다.
// 순차 시드는 서로 상관이 생기므로 해싱하고, 초반 값은 버린다(예전에 이걸로 편향이 났다).
function rng(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let a = h >>> 0;
  const f = () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 20; i++) f();
  return f;
}

function playOne(n, seed, opts = {}) {
  const rand = rng(seed);
  const orig = Math.random;
  Math.random = rand;
  try {
    const names = Array.from({ length: n }, (_, i) => 'P' + i);
    const g = G.createGame4(names, { n, spec: opts.spec, hand: opts.hand });
    const firstAuc = g.auctioneer;                // 첫 진행자 — 유불리를 재기 위해 기억
    if (opts.firstBids) g.firstAuction = false;   // 첫 경매 제외 룰을 끈다
    // 보정안: 첫 진행자는 손패를 한 장 적게 받는다 (그 장은 덱으로)
    if (opts.aucHandicap) {
      const h = g.seats[firstAuc].hand;
      if (h.length > 1) g.deck.push(h.pop());
    }
    let betrays = 0;

    // 서버가 하는 것과 같이 좌석마다 성향을 배정한다
    if (AI.pickStyles) { const st = AI.pickStyles(); g.seats.forEach((s2, i) => { s2.style = st[i % st.length]; }); }

    let guard = 0;
    while (!g.over && guard++ < 400) {
      switch (g.phase) {
        case 'draw': G.draw(g); break;
        case 'offer': {
          const c = AI.chooseConsign(g, g.auctioneer);
          if (!c) { g.phase = 'choose_type'; break; }
          G.offer(g, g.auctioneer, c.id); break;
        }
        case 'choose_type': {
          G.chooseType(g, g.auctioneer, AI.chooseType(g, g.auctioneer));
          // 시험안: 진행자는 오픈에서도 먼저 공개로 낸다 (통제권의 대가)
          if (opts.aucAlwaysFirst && G.bidderSeats(g).includes(g.auctioneer)) g.auction.first = g.auctioneer;
          break;
        }
        case 'bidding': {
          let acted = false;
          for (let s = 0; s < g.n; s++) {
            if (!G.canBid(g, s)) continue;
            const c = AI.chooseBid(g, s);
            if (c) { G.bid(g, s, c.id); acted = true; }
            else { g.auction.bids[s] = null; delete g.auction.bids[s]; acted = true; }
            break;   // 한 번에 한 명씩 (클로즈 선공개 순서를 지키려면 필요)
          }
          if (!acted) { g.phase = 'reveal'; }
          break;
        }
        case 'reveal': { const r = G.settle(g); if (r && r.betrayed) betrays++; break; }
        case 'settled': G.advance(g); break;
        default: guard = 1e9;
      }
    }
    if (!g.over) {
      // 덱 소진 — 세트에 가장 가까운 사람이 이긴다
      const order = G.rankSeats(g.seats, g.spec);
      g.over = { winner: order[0], reason: 'deck', order };
    }
    return {
      winner: g.over.winner, reason: g.over.reason, kind: g.over.kind || null,
      turns: g.turn, firstAuctioneer: firstAuc, betrays,
      acqCounts: g.seats.map((s) => s.acq.length),
    };
  } finally { Math.random = orig; }
}

function run(n, games, opts = {}, label = '') {
  const wins = Array(n).fill(0);
  const byKind = {}; const byReason = {};
  let turns = 0, deckOut = 0, firstAucWins = 0, betrays = 0;
  for (let i = 0; i < games; i++) {
    const r = playOne(n, (opts.seedBase || 'A') + ':' + i, opts);
    wins[r.winner]++;
    turns += r.turns;
    byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    if (r.reason === 'deck') deckOut++;
    if (r.kind) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    if (r.winner === r.firstAuctioneer) firstAucWins++;
    betrays += r.betrays;
  }
  const pct = (x) => (x / games * 100);
  const seatSpread = Math.max(...wins.map(pct)) - Math.min(...wins.map(pct));
  const kinds = Object.keys(byKind).sort((a, b) => a - b);
  const kindPct = kinds.map((k) => byKind[k] / games * 100);
  const kindSpread = kindPct.length ? Math.max(...kindPct) - Math.min(...kindPct) : 0;
  return {
    label, n, games,
    자리별승률: wins.map((w) => +pct(w).toFixed(1)),
    자리편차: +seatSpread.toFixed(1),
    종류별우승: Object.fromEntries(kinds.map((k, i) => [k + '종', +kindPct[i].toFixed(1)])),
    종류편차: +kindSpread.toFixed(1),
    덱소진률: +pct(deckOut).toFixed(1),
    평균턴: +(turns / games).toFixed(1),
    // 첫 진행자가 이길 확률. 공평하면 1/n 이어야 한다.
    첫진행자승률: +pct(firstAucWins).toFixed(1),
    첫진행자이득: +(pct(firstAucWins) - 100 / n).toFixed(1),
    판당배신: +(betrays / games).toFixed(2),
  };
}

module.exports = { playOne, run, rng };

if (require.main === module) {
  const games = Number(process.argv[2]) || 3000;
  const n = Number(process.argv[3]) || 3;
  console.log(JSON.stringify(run(n, games, {}, '현재'), null, 2));
}
