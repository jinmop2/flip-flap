// 다인전(칩으로 사는 경매) 엔진 규칙.
//
// 서버·오프라인·AI 가 다 game4.js 하나를 쓴다. 규칙이 여기서 틀리면 세 곳이
// 똑같이 틀리므로, 판을 손으로 짜 놓고 한 수씩 둬 보며 결과를 못 박는다.
// 끝에 AI 끼리 여러 판을 돌려 균형이 설계값에서 크게 안 벗어나는지도 본다.
const G = require('../game4');
const AI = require('../ai4');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// 섞지 않은 판 — rnd 가 늘 0 이면 첫 진행자는 0번이다
let uid = 1000;
const card = (kind) => ({ id: uid++, kind });
function table(n, opts = {}) {
  const g = G.createGame4(Array.from({ length: n }, (_, i) => 'P' + i), { n, rnd: () => 0 });
  for (const s of g.seats) { s.hand = [card(2), card(3), card(4), card(6)]; s.acq = []; }
  g.deck = opts.deck || [card(6), card(4), card(3), card(2), card(6), card(4)];
  return g;
}
// 한 턴을 시작해 경매품을 꺼내 놓는다 (중앙 카드는 덱 맨 위)
function open(g, center) {
  if (center) g.deck.push(center);
  G.beginRound(g);
  G.offer(g, g.auctioneer, g.seats[g.auctioneer].hand[0].id);
}

console.log('① 카드와 세트');
{
  const S4 = G.SPECS[4], S3 = G.SPECS[3];
  const sum = (s) => s.cards.reduce((a, [, c]) => a + c, 0);
  ok('4인 32장 · 칩 30', sum(S4) === 32 && S4.chips === 30);
  ok('3인 24장 · 칩 25', sum(S3) === 24 && S3.chips === 25);
  ok('중앙 덱 = 인원 × 4', (() => { const g = G.createGame4(['a', 'b', 'c', 'd'], { n: 4 }); return g.deck.length === 16 && g.seats.every((s) => s.hand.length === 4); })());
  ok('3인 덱에는 쌍둥이가 없다', !S3.cards.some(([k]) => k === 'D46'));
  const m = G.counts([card('W6'), card('D46'), card(6), card('V')]);
  ok('더블6 은 6 두 장 · 쌍둥이는 4·6 둘 다', m[6] === 4 && m[4] === 1, JSON.stringify(m));
  ok('금고는 세트에 안 든다', G.setCards([card('V'), card('V'), card(2)]) === 1);
  ok('6 넷 + 더블6 = 세트', G.checkSet([card(6), card(6), card(6), card(6), card('W6')]) === 6);
  ok('4 셋 + 쌍둥이 = 4 세트', G.checkSet([card(4), card(4), card(4), card('D46')]) === 4);
  ok('남은 장수 — 2 한 장이면 1', G.needLeft([card(2)]) === 1);
}

console.log('\n② 금고 수입은 모을수록 커진다');
{
  ok('1·3·6', G.income(0) === 0 && G.income(1) === 1 && G.income(2) === 3 && G.income(3) === 6);
  const g = table(4);
  g.seats[1].acq = [card('V'), card('V')];
  const before = g.seats.map((s) => s.chips);
  G.beginRound(g);
  ok('턴 시작에 금고 주인만 받는다', g.seats[1].chips === before[1] + 3 && g.seats[0].chips === before[0]);
  ok('받은 몫이 상태에 남는다(연출용)', g.lastIncome[1] === 3 && g.lastIncome[0] === 0);
}

console.log('\n③ 첫 경매는 오픈만');
{
  const g = table(4);
  open(g);
  ok('1턴 출품 뒤 곧장 오픈', g.phase === 'open' && g.auction.type === 'open');
  ok('진행자 왼쪽부터 부른다', g.auction.turnSeat === 1);
}

console.log('\n④ 오픈 경매');
{
  const g = table(4);
  open(g, card(6));
  ok('차례 아닌 사람은 못 올린다', !G.raise(g, 2, 3));
  ok('칩보다 크게는 못 부른다', !G.raise(g, 1, 99));
  ok('1번 3칩', G.raise(g, 1, 3) && g.auction.high === 1 && g.auction.turnSeat === 2);
  ok('같은 값은 못 부른다', !G.raise(g, 2, 3));
  G.pass(g, 2);
  G.raise(g, 3, 5);
  G.pass(g, 0);                  // 진행자
  ok('1번 차례로 돌아온다', g.auction.turnSeat === 1);
  const c3 = g.seats[3].chips, c1 = g.seats[1].chips;
  G.pass(g, 1);
  ok('마지막 남은 3번이 5칩에 산다', g.phase === 'settled' && g.lastResult.winner === 3 && g.lastResult.price === 5);
  ok('산 사람만 낸다', g.seats[3].chips === c3 - 5 && g.seats[1].chips === c1);
  ok('경매품 두 장이 산 사람 앞에', g.seats[3].acq.length === 2);
  G.advance(g);
  ok('진행자가 시계방향으로', g.auctioneer === 1 && g.phase === 'round' && g.turn === 2);
}
{
  const g = table(4);
  open(g);
  for (const s of [1, 2, 3, 0]) G.pass(g, s);
  ok('아무도 안 부르면 진행자가 공짜로', g.lastResult.winner === 0 && g.lastResult.price === 0 && g.lastResult.free);
}
{
  const g = table(4);
  g.seats[2].chips = 0;
  open(g);
  G.raise(g, 1, 1);
  ok('칩이 모자란 자리는 저절로 빠진다', g.auction.out.includes(2) && g.auction.turnSeat === 3);
}

console.log('\n⑤ 클로즈 경매');
const toClose = (g) => { open(g); for (const s of [1, 2, 3, 0]) G.pass(g, s); G.advance(g); G.beginRound(g); G.offer(g, g.auctioneer, g.seats[g.auctioneer].hand[0].id); };
{
  const g = table(4); toClose(g);            // 2턴 — 진행자 1번
  ok('2턴부터 방식을 고른다', g.phase === 'choose_type' && g.auctioneer === 1);
  ok('홀수 값은 안 된다', !G.chooseType(g, 1, 'close', 3));
  ok('칩보다 큰 값은 안 된다', !G.chooseType(g, 1, 'close', 40));
  ok('0 은 안 된다', !G.chooseType(g, 1, 'close', 0));
  ok('짝수 4', G.chooseType(g, 1, 'close', 4) && g.phase === 'answer' && g.auction.closeP === 4);
  ok('진행자는 답하지 않는다', !G.answer(g, 1, true));
  G.answer(g, 2, false); G.answer(g, 3, true);
  ok('다 답하기 전엔 결과가 없다', g.phase === 'answer' && !g.auction.buyers);
  ok('두 번 답할 수 없다', !G.answer(g, 3, false));
  const c3 = g.seats[3].chips;
  G.answer(g, 0, false);
  ok('한 명만 사면 P+1', g.lastResult.winner === 3 && g.lastResult.price === 5 && g.seats[3].chips === c3 - 5);
}
{
  const g = table(4); toClose(g);
  G.chooseType(g, 1, 'close', 2);
  const c1 = g.seats[1].chips;
  for (const s of [2, 3, 0]) G.answer(g, s, false);
  ok('아무도 안 사면 진행자가 P', g.lastResult.winner === 1 && g.lastResult.price === 2 && g.seats[1].chips === c1 - 2);
}
{
  const g = table(4); toClose(g);
  G.chooseType(g, 1, 'close', 4);
  G.answer(g, 3, true); G.answer(g, 0, true); G.answer(g, 2, false);
  ok('둘 이상 사면 동점 경쟁(오픈)', g.phase === 'open' && g.auction.tiebreak);
  ok('산다고 한 사람끼리만', g.auction.out.includes(2) && g.auction.out.includes(1));
  ok('진행자 왼쪽에 가까운 사람이 P+1 을 쥔다', g.auction.high === 3 && g.auction.price === 5, `${g.auction.high}/${g.auction.price}`);
  ok('다음 차례는 다른 구매자', g.auction.turnSeat === 0);
  G.pass(g, 0);
  ok('아무도 안 올리면 쥔 사람이 P+1 에', g.lastResult.winner === 3 && g.lastResult.price === 5 && g.lastResult.tiebreak);
}
{
  const g = table(4); toClose(g);
  g.seats[2].chips = 4;
  G.chooseType(g, 1, 'close', 4);
  ok('P+1 을 못 내는 사람은 저절로 "안 산다"', g.auction.answers[2] === false);
  ok('P+1 을 못 내면 산다고 못 한다', !G.answer(g, 2, true));
}

console.log('\n⑥ 끝');
{
  const g = table(4);
  g.seats[1].acq = [card(2)];
  open(g, card(2));                // 경매품: 중앙 2 + 출품 2(0번 손패 첫 장)
  G.raise(g, 1, 1); for (const s of [2, 3, 0]) G.pass(g, s);
  ok('세트가 되면 그 자리에서 이긴다', g.over && g.over.winner === 1 && g.over.reason === 'set' && g.over.order[0] === 1);
  G.advance(g);
  ok('끝난 판은 더 안 넘어간다', g.phase === 'game_over');
}
{
  const g = table(3, { deck: [] });
  g.seats[0].acq = [card(6), card(6)];
  g.seats[1].acq = [card(3), card(3)];            // 한 장 남음
  g.seats[2].acq = [card(4), card(4), card(4)];   // 한 장 남음, 더 많이 채움(3/4 > 2/3)
  G.beginRound(g);
  ok('덱이 떨어지면 순위를 매긴다', g.phase === 'game_over' && g.over.reason === 'deck');
  ok('남은 장수 → 채운 비율 순', g.over.order.join(',') === '2,1,0', g.over.order.join(','));
}
{
  const g = table(3, { deck: [] });
  g.seats[0].acq = [card(2)]; g.seats[1].acq = [card(2)]; g.seats[2].acq = [card(2)];
  g.seats[1].chips = 40;
  G.beginRound(g);
  ok('다 같으면 칩이 많은 사람', g.over.order[0] === 1);
}

console.log('\n⑦ AI 끼리 — 판이 끝나고 한쪽으로 안 쏠린다');
{
  const N = 600;
  for (const n of [3, 4]) {
    const wins = Array(n).fill(0); let bad = 0, sets = 0, turns = 0;
    for (let k = 0; k < N; k++) {
      const g = G.createGame4(Array.from({ length: n }, (_, i) => 'b' + i), { n });
      const st = AI.pickStyles(n); g.seats.forEach((s, i) => { s.style = st[i]; });
      let guard = 0;
      while (g.phase !== 'game_over' && guard++ < 500) {
        if (g.phase === 'round') G.beginRound(g);
        else if (g.phase === 'offer') G.offer(g, g.auctioneer, AI.chooseConsign(g, g.auctioneer).id);
        else if (g.phase === 'choose_type') { const t = AI.chooseType(g, g.auctioneer); G.chooseType(g, g.auctioneer, t.type, t.price); }
        else if (g.phase === 'open') { const s = g.auction.turnSeat, m = AI.openMove(g, s); m.type === 'raise' ? G.raise(g, s, m.to) : G.pass(g, s); }
        else if (g.phase === 'answer') { for (const s of G.rivals(g)) if (G.canAnswer(g, s)) G.answer(g, s, AI.chooseAnswer(g, s)); }
        else if (g.phase === 'settled') G.advance(g);
      }
      if (g.phase !== 'game_over' || g.seats.some((s) => s.chips < 0)) { bad++; continue; }
      wins[(g.over.winner - g.first + n) % n]++;      // 첫 진행자로부터 몇 번째 자리인가
      if (g.over.reason === 'set') sets++;
      turns += g.turn;
    }
    const pct = wins.map((w) => w / N * 100);
    const spread = Math.max(...pct) - Math.min(...pct);
    ok(`${n}인 ${N}판 모두 끝난다`, bad === 0, bad);
    ok(`${n}인 자리 편차 12%p 안`, spread < 12, pct.map((x) => x.toFixed(1)).join(' / '));
    ok(`${n}인 대부분 세트로 끝난다`, sets / N > (n === 4 ? 0.9 : 0.75), (sets / N * 100).toFixed(1) + '%');
    ok(`${n}인 평균 7~12턴`, turns / N > 7 && turns / N < 12, (turns / N).toFixed(1));
  }
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
