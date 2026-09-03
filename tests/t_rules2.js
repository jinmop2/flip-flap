// 2인전 규칙 — 서버를 안 띄우고 셈만 확인한다.
//
// 이 셈은 서버와 브라우저 양쪽에서 돈다(오프라인 솔로). 한쪽만 고치면
// 온라인과 오프라인의 판정이 갈라지므로, 규칙은 한 파일에만 있어야 한다.
const path = require('path');
const fs = require('fs');
const R = require(path.join(__dirname, '..', 'rules2.js'));

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  ' + x : ''))); };
const C = (kind, grade) => ({ kind, grade, id: kind * 100 + grade });

console.log('① 규칙만 들어 있다');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'rules2.js'), 'utf8');
  for (const bad of ['require(', 'io.to', 'socket', 'rooms[', 'accounts.', 'setTimeout', 'broadcast'])
    ok(`살림살이가 안 섞였다 — ${bad}`, !src.includes(bad));
  ok('서버가 이 파일을 쓴다', /require\('\.\/rules2'\)/.test(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')));
  // 브라우저에서는 <script> 로 읽힌다. 감싸지 않으면 안쪽 이름이 전역으로 새어
  // client.js 의 같은 이름과 부딪혀 화면이 통째로 죽는다 — 실제로 한 번 죽였다.
  ok('감싸서 이름이 안 샌다', /^\(function \(\) \{\n'use strict';/m.test(src) && /\n\}\)\(\);\s*$/.test(src));
  ok('내놓는 것은 RULES2 하나', /window\.RULES2 = RULES2;/.test(src));
  {
    // 실제로 브라우저처럼 읽어 본다 — 전역에 이름이 새는지
    const vm = require('vm');
    const win = {};
    const ctx = vm.createContext({ window: win, globalThis: undefined });
    vm.runInContext(src, ctx);
    const leaked = Object.keys(ctx).filter((k) => !['window', 'globalThis'].includes(k));
    ok('전역에 새는 이름이 없다', leaked.length === 0, leaked.join(','));
    ok('창에는 RULES2 만 붙는다', Object.keys(win).join() === 'RULES2', Object.keys(win).join());
  }
}

console.log('\n② 덱');
{
  const d = R.initDeck();
  ok('24장', d.length === 24, String(d.length));
  const cnt = {};
  for (const c of d) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
  ok('2가 2장·3이 5장·4가 7장·6이 10장',
     cnt[2] === 2 && cnt[3] === 5 && cnt[4] === 7 && cnt[6] === 10, JSON.stringify(cnt));
  ok('아이디가 안 겹친다', new Set(d.map((c) => c.id)).size === 24);
  // 섞이는지 — 같은 순서가 두 번 나오면 안 섞인 것이다
  const a = R.initDeck().map((c) => c.id).join(), b = R.initDeck().map((c) => c.id).join();
  ok('섞인다', a !== b);
}

console.log('\n③ 강함과 배신');
{
  ok('작을수록 강하다', R.strength(C(2, 1)) < R.strength(C(6, 10)));
  ok('종류가 먼저', R.strength(C(2, 9)) < R.strength(C(3, 1)));
  ok('2-1이 6-1을 이긴다', R.aBeatsB(C(2, 1), C(6, 1)));
  // 졸개의 배신 — 이 게임의 하나뿐인 예외다
  ok('6-10이 2-1을 이긴다', R.aBeatsB(C(6, 10), C(2, 1)));
  ok('2-1은 6-10에게 진다', !R.aBeatsB(C(2, 1), C(6, 10)));
  ok('6-9는 2-1을 못 이긴다', !R.aBeatsB(C(6, 9), C(2, 1)));
  ok('6-10도 2-2는 못 이긴다', !R.aBeatsB(C(6, 10), C(2, 2)));
}

console.log('\n④ 세트');
{
  ok('2는 두 장이면 완성', R.checkSet([C(2, 1), C(2, 2)]) === 2);
  ok('한 장으로는 안 된다', R.checkSet([C(2, 1)]) === null);
  ok('6은 열 장 아니라 여섯 장',
     R.checkSet(Array.from({ length: 6 }, (_, i) => C(6, i + 1))) === 6);
  ok('다섯 장으로는 6이 안 된다',
     R.checkSet(Array.from({ length: 5 }, (_, i) => C(6, i + 1))) === null);
  ok('섞여 있어도 찾는다', R.checkSet([C(6, 1), C(3, 1), C(3, 2), C(3, 3), C(3, 4), C(3, 5)]) === 3);
}

console.log('\n⑤ 덱이 떨어졌을 때 — 무승부가 거의 안 나와야 한다');
{
  // ① 완성까지 남은 장수
  ok('남은 장수가 적은 쪽', R.resolveByProgress([C(2, 1)], [C(6, 1), C(6, 2)]) === 1);
  // ② 진행률
  ok('남은 장수가 같으면 진행률',
     R.resolveByProgress([C(4, 1), C(4, 2), C(4, 3), C(4, 4), C(4, 5), C(4, 6)],
                         [C(6, 1), C(6, 2), C(6, 3), C(6, 4), C(6, 5), C(6, 6), C(6, 7), C(6, 8), C(6, 9)]) === 2);
  // ④ 모은 카드가 더 강한 쪽
  ok('그래도 같으면 더 강한 쪽', R.resolveByProgress([C(3, 1)], [C(3, 5)]) === 1);
  ok('둘 다 빈손이면 무승부', R.resolveByProgress([], []) === 0);
  // 규칙의 목표는 "무승부가 안 나는 것" 이 아니라 "사실상 안 나는 것" 이다.
  // 모은 장수도 강함 합계도 완전히 같은 판은 실제로 있을 수 있다
  // (3-1+3-5 와 3-2+3-4 는 합이 같다). 그건 무승부가 맞다.
  let draws = 0;
  const N = 4000;
  for (let t = 0; t < N; t++) {
    const d = R.initDeck();
    const a = d.slice(0, 1 + (t % 6)), b = d.slice(8, 9 + ((t * 3) % 6));
    if (R.resolveByProgress(a, b) === 0) draws++;
  }
  ok(`무작위 ${N}판에서 무승부가 1% 미만`, draws / N < 0.01, draws + '판');
}

console.log('\n⑥ 누구 차례인가');
{
  const g = (phase, auctioneer, sub = {}) => ({ phase, auctioneer, auction: { p1Submitted: false, p2Submitted: false, ...sub } });
  ok('뽑기·출품·방식은 진행자', R.activePlayer(g('draw', 1)) === 1 && R.activePlayer(g('offer', 2)) === 2
     && R.activePlayer(g('choose_type', 1)) === 1);
  // 클로즈에서 진행자가 나중에 낸다 — 출품 손실과 후공 정보이득이 상쇄된다
  ok('배팅은 진행자가 먼저', R.activePlayer(g('bidding', 1)) === 1);
  ok('진행자가 냈으면 상대 차례', R.activePlayer(g('bidding', 1, { p1Submitted: true })) === 2);
  ok('공개 중엔 아무도 아니다', R.activePlayer(g('reveal', 1)) === 0);
}

console.log('\n⑦ 보여 줄 몫만 추린다 — 감추는 것도 규칙이다');
{
  const A = C(2, 1), B = C(6, 3), CEN = C(4, 2), OFF = C(3, 1);
  const base = () => ({
    phase: 'bidding', turn: 3, auctioneer: 1, centerDeck: [1, 2, 3],
    p1Hand: [A], p2Hand: [B], p1Acquired: [CEN], p2Acquired: [],
    time: {}, pick: null,
    auction: { centerCard: CEN, _offeredCard: OFF, tipCard: null, bonusCard: null,
               auctionType: 'open', p1Bid: A, p2Bid: B, p1Submitted: true, p2Submitted: true },
  });
  const v1 = R.stateFor(base(), 0);
  ok('내 손패만 준다', v1.myHand.length === 1 && v1.myHand[0].kind === 2);
  ok('상대 손패는 장수만', v1.oppHandLen === 1 && v1.oppHand === undefined);
  // 오픈 경매 = 배팅이 비공개. 공개 단계 전에는 상대 카드를 주면 안 된다
  ok('오픈에서 상대 배팅을 안 준다', v1.auction.oppBid === null);
  ok('낸 사실은 알려 준다', v1.auction.oppBidSubmitted === true);
  const g2 = base(); g2.phase = 'reveal';
  ok('공개 단계에서는 준다', R.stateFor(g2, 0).auction.oppBid.kind === 6);
  // 클로즈 = 낸 즉시 공개
  const g3 = base(); g3.auction.auctionType = 'closed';
  ok('클로즈는 내는 즉시 보인다', R.stateFor(g3, 0).auction.oppBid.kind === 6);
  // 덱은 장수만
  ok('덱은 장수만', R.stateFor(base(), 0).centerDeckSize === 3 && R.stateFor(base(), 0).centerDeck === undefined);
  ok('자리 번호가 맞다', R.stateFor(base(), 0).myIndex === 1 && R.stateFor(base(), 1).myIndex === 2);
  // 2번 자리에서 보면 내 것과 상대 것이 뒤바뀌어야 한다
  const v2 = R.stateFor(base(), 1);
  ok('반대 자리도 제 몫만', v2.myHand[0].kind === 6 && v2.myAcq.length === 0 && v2.oppAcq.length === 1);
}

console.log('\n⑧ 경매 정산 — 누가 이기고 카드가 어디로 가나');
{
  const game = (p1, p2, opts = {}) => ({
    auctioneer: 1, centerDeck: [1, 2, 3, 4],
    p1Hand: [C(3, 1), C(3, 2)], p2Hand: [C(4, 1), C(4, 2)],
    p1Acquired: [], p2Acquired: [],
    auction: { centerCard: C(6, 1), _offeredCard: C(6, 2), tipCard: null,
               p1Bid: p1, p2Bid: p2 },
    ...opts,
  });

  ok('강한 쪽이 이긴다', R.judgeAuction(game(C(2, 2), C(6, 1))).p1Wins === true);
  ok('약한 쪽은 진다', R.judgeAuction(game(C(6, 1), C(2, 2))).p1Wins === false);
  // 졸개의 배신
  const bet = R.judgeAuction(game(C(6, 10), C(2, 1)));
  ok('배신이 통한다', bet.p1Wins === true && bet.special === true);
  ok('보통 판은 배신이 아니다', R.judgeAuction(game(C(2, 2), C(6, 1))).special === false);
  // 뒤집개 — 반전 중에는 약한 쪽이 이기고, 배신도 안 통한다
  const rev = R.judgeAuction(game(C(6, 10), C(2, 1),
    { itemMode: true, fx: { reverse: true, noSwap: {} } }));
  ok('반전이면 약한 쪽이 이긴다', rev.p1Wins === true && rev.reversed === true);
  ok('반전 중엔 배신 연출이 없다', rev.special === false);
  const rev2 = R.judgeAuction(game(C(2, 1), C(6, 10),
    { itemMode: true, fx: { reverse: true, noSwap: {} } }));
  ok('반전이면 강한 쪽이 진다', rev2.p1Wins === false);

  // 카드가 어디로 가나
  {
    const g = game(C(3, 1), C(4, 1));
    g.p1Hand = [C(3, 2)]; g.p2Hand = [C(4, 2)];
    const d = R.judgeAuction(g);
    R.applyAuction(g, d);
    ok('이긴 쪽이 두 장을 가져간다', g.p1Acquired.length === 2 && g.p2Acquired.length === 0);
    // 낸 카드는 서로 바뀐다 — 이게 이 게임의 심장이다
    ok('낸 카드는 상대에게 간다',
       g.p2Hand.some((c) => c.kind === 3 && c.grade === 1)
       && g.p1Hand.some((c) => c.kind === 4 && c.grade === 1), JSON.stringify([g.p1Hand, g.p2Hand]));
    ok('경매가 닫힌다', g.auction === null);
  }
  // 에누리 — 교환이 무효면 각자 자기 카드를 회수한다.
  // 한쪽만 회수시키면 상대 손패가 말라붙어 판이 멈춘다.
  {
    const g = game(C(3, 1), C(4, 1), { itemMode: true, fx: { reverse: false, noSwap: { 1: true } } });
    g.p1Hand = []; g.p2Hand = [];
    R.applyAuction(g, R.judgeAuction(g));
    ok('에누리면 각자 회수 — 양쪽 다',
       g.p1Hand.length === 1 && g.p2Hand.length === 1
       && g.p1Hand[0].kind === 3 && g.p2Hand[0].kind === 4);
  }

  // 다음 턴을 둘 수 있나
  {
    // 진행자가 1이면 다음 진행자는 2 — 2가 두 장(출품+배팅)이어야 한다
    const base = () => ({ auctioneer: 1, centerDeck: [1], p1Hand: [C(3,1)], p2Hand: [C(4,1), C(4,2)] });
    ok('덱과 손패가 있으면 계속', R.canContinue(base()) === true);
    const noDeck = base(); noDeck.centerDeck = [];
    ok('덱이 비면 멈춘다', R.canContinue(noDeck) === false);
    // 다음 진행자는 2번. 2번이 두 장이어야 출품+배팅이 된다.
    const thin = base(); thin.p2Hand = [C(4, 1)];
    ok('다음 진행자가 두 장 없으면 멈춘다', R.canContinue(thin) === false);
    ok('상대는 한 장이면 된다', R.canContinue(base()) === true);
    const none = base(); none.p1Hand = [];
    ok('상대가 빈손이면 멈춘다', R.canContinue(none) === false);
  }
}

console.log('');
if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
console.log(`✓ 전부 통과 (${pass}/${pass})`);
