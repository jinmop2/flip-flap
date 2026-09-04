// 다인전 AI 맞대결 — 한 자리에만 도전자를 앉히고 나머지는 현행 AI 로 채운다.
//
// 2인전과 달리 여기는 여러 명이 붙는다. 그래서 "이겼다/졌다" 가 아니라
// "n 명 중 몇 번을 우승했는가" 로 잰다. 공평하면 1/n 이 나온다 — 도전자가
// 그보다 높으면 그만큼 센 것이다.
//
// 자리는 돌린다. 이 게임은 첫 진행자 자리가 유불리를 갖고, 한 자리에만
// 앉혀 재면 실력이 아니라 자리를 재게 된다. 같은 시드로 도전자를 0번부터
// n-1번 자리까지 옮겨 앉히고 전부 더한다.
//
// 실행: node tools/duel4.js [판수] [인원] [도전자설정]
//   예: node tools/duel4.js 4000 4 noise=0
//   설정은 STYLES 의 값을 도전자 자리에만 덮어쓴다 (noise·greed·block·betray).
const path = require('path');
const G = require(path.join(__dirname, '..', 'game4'));
const AI = require(path.join(__dirname, '..', 'ai4'));
const { rng } = require(path.join(__dirname, 'sim4.js'));

// 도전자 자리의 성향만 바꿔 끼운다. 나머지 자리는 서버가 하는 그대로 둔다.
function playOne(n, seed, challengerSeat, override) {
  const rand = rng(seed);
  const orig = Math.random;
  Math.random = rand;
  try {
    const names = Array.from({ length: n }, (_, i) => 'P' + i);
    const g = G.createGame4(names, { n });
    const st = AI.pickStyles();
    g.seats.forEach((s, i) => { s.style = { ...st[i % st.length] }; });
    // 도전자만 덮어쓴다. 같은 시드에서 다른 자리는 그대로여야 비교가 된다.
    Object.assign(g.seats[challengerSeat].style, override);
    let guard = 0;
    while (!g.over && guard++ < 400) {
      switch (g.phase) {
        case 'draw': G.draw(g); break;
        case 'offer': {
          const c = AI.chooseConsign(g, g.auctioneer);
          if (!c) { g.phase = 'choose_type'; break; }
          G.offer(g, g.auctioneer, c.id); break;
        }
        case 'choose_type': G.chooseType(g, g.auctioneer, AI.chooseType(g, g.auctioneer)); break;
        case 'bidding': {
          let acted = false;
          for (let s = 0; s < g.n; s++) {
            if (!G.canBid(g, s)) continue;
            const c = AI.chooseBid(g, s);
            if (c) G.bid(g, s, c.id); else { delete g.auction.bids[s]; }
            acted = true; break;
          }
          if (!acted) g.phase = 'reveal';
          break;
        }
        case 'reveal': G.settle(g); break;
        case 'settled': G.advance(g); break;
        default: guard = 1e9;
      }
    }
    if (!g.over) {
      const order = G.rankSeats(g.seats, g.spec);
      g.over = { winner: order[0], reason: 'deck' };
    }
    return { won: g.over.winner === challengerSeat, turns: g.turn };
  } finally { Math.random = orig; }
}

function duel4(n, games, override) {
  let won = 0, played = 0, turns = 0;
  const rounds = Math.max(1, Math.ceil(games / n));
  for (let i = 0; i < rounds; i++)
    for (let seat = 0; seat < n; seat++) {
      const r = playOne(n, 'D:' + i, seat, override);      // 같은 시드로 자리만 옮긴다
      played++; turns += r.turns; if (r.won) won++;
    }
  const rate = won / played;
  const se = Math.sqrt(rate * (1 - rate) / played);
  return { rate, lo: rate - 1.96 * se, hi: rate + 1.96 * se, played, turns: turns / played };
}

module.exports = { duel4, playOne };

if (require.main === module) {
  const games = Number(process.argv[2]) || 4000;
  const n = Number(process.argv[3]) || 4;
  const over = {};
  for (const a of process.argv.slice(4)) {
    const [k, v] = a.split('='); if (k && v !== undefined) over[k] = Number(v);
  }
  const base = 100 / n;
  const r = duel4(n, games, over);
  const pc = (x) => (x * 100).toFixed(1) + '%';
  console.log(`\n${n}인전 · ${r.played}판 · 평균 ${r.turns.toFixed(1)}턴`);
  console.log(`  도전자 설정 : ${Object.keys(over).length ? JSON.stringify(over) : '(현행 그대로)'}`);
  console.log(`  우승률      : ${pc(r.rate)}   [${pc(r.lo)} ~ ${pc(r.hi)}]`);
  console.log(`  공평선      : ${base.toFixed(1)}%  →  ${(r.rate * 100 - base >= 0 ? '+' : '')}${(r.rate * 100 - base).toFixed(1)}%p\n`);
}
