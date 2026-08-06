// 솔로(AI) 3인전·4인전 — 자리 수가 요청대로 잡히는지, 이상한 값은 막는지
const io = require('/Users/jinmo9/참치/my-game/node_modules/socket.io-client');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function solo(n, ip) {
  return new Promise((res) => {
    const s = io('http://localhost:3000', { transports: ['websocket'], forceNew: true,
                                            extraHeaders: { 'X-Forwarded-For': ip } });
    let beg = null, st = null;
    s.on('connect', () => s.emit('g4_start', n === undefined ? { nick: 'S' } : { nick: 'S', n }));
    s.on('g4_begin', (d) => { beg = d; });
    s.on('g4_state', (d) => { st = d; });
    setTimeout(() => { s.close(); res({ beg, st }); }, 2600);
  });
}

(async () => {
  console.log('\n① 3인전 요청 → AI 2명과 셋이서');
  {
    const { beg, st } = await solo(3, '10.9.1.1');
    ok('시작됨', !!beg);
    ok('자리 3개', beg && beg.n === 3 && beg.seats.length === 3);
    ok('사람 1 · AI 2', beg && beg.seats.filter((x) => !x.isBot).length === 1
                          && beg.seats.filter((x) => x.isBot).length === 2);
    ok('손패 7장', st && st.myHand && st.myHand.length === 7);
    ok('내 자리는 0번', beg && beg.me === 0);
  }

  console.log('\n② 4인전 요청 → AI 3명과 넷이서');
  {
    const { beg, st } = await solo(4, '10.9.2.1');
    ok('자리 4개', beg && beg.n === 4 && beg.seats.length === 4);
    ok('사람 1 · AI 3', beg && beg.seats.filter((x) => x.isBot).length === 3);
    ok('손패 6장', st && st.myHand && st.myHand.length === 6);
  }

  console.log('\n③ 안 보내면 예전처럼 4인전');
  {
    const { beg } = await solo(undefined, '10.9.3.1');
    ok('4인전', beg && beg.n === 4);
  }

  console.log('\n④ 엉뚱한 값은 4인전으로 (자리 수를 클라이언트가 정하게 두지 않는다)');
  for (const bad of [2, 5, 99, 0, -1, '3인', null, { n: 3 }]) {
    const { beg } = await solo(bad, '10.9.4.1');
    ok('n=' + JSON.stringify(bad) + ' → 4인전', beg && beg.n === 4);
    await wait(120);
  }
  // 문자열 '3' 은 Number('3')===3 이라 3인전이 된다 — 의도한 동작
  {
    const { beg } = await solo('3', '10.9.5.1');
    ok("n='3' (문자열) → 3인전", beg && beg.n === 3);
  }

  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
