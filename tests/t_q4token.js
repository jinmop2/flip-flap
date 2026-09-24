// 새 다인전(칩으로 사는 경매)을 실제 서버에서 끝까지 둬 본다.
//
// 엔진 규칙은 t_q4rules.js 가 따로 본다. 여기서 보는 것은 "서버를 거쳐서도"
// 판이 끝까지 가는가, 그리고 각 자리에 나가는 상태가 선을 지키는가다.
//   · 솔로 4인 — 사람 1 + AI 3
//   · 멀티 3인 — 사람 셋이 한 방에서
// 사람 자리는 거칠게 둔다 — 오픈과 클로즈를 둘 다 거치게 일부러 섞는다.
const io = require('socket.io-client');
const { liveServer } = require('./live');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 상태가 올 때마다 선을 지키는지 보고, 내 차례면 한 수 둔다
function player(url, i, leaks) {
  const s = io(url, { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': '10.9.4.' + i } });
  const p = { s, st: null, over: null, begun: false, acted: 0, errors: [], closes: 0, answers: 0 };
  s.on('g4_begin', () => { p.begun = true; });
  s.on('g4_error', (m) => p.errors.push(m));
  s.on('g4_over', (x) => { p.over = x; });
  s.on('g4_state', (x) => {
    p.st = x;
    const raw = JSON.stringify(x);
    if (/aiW/.test(raw)) leaks.push('AI 한도가 새어 나왔다');
    if (x.seats.some((q) => q.hand)) leaks.push('남의 손패가 나갔다');
    if (x.phase === 'answer' && x.auction && x.auction.buyers) leaks.push('클로즈 답이 다 모이기 전에 보였다');
    if (x.myHand.length > 4) leaks.push('손패가 4장을 넘었다');
    act(p, x);
  });
  return p;
}
function act(p, x) {
  const me = x.me, a = x.auction;
  if (me === null || x.over) return;
  const send = (d) => { p.acted++; setTimeout(() => p.s.emit('g4_act', d), 30); };
  if (x.phase === 'offer' && x.auctioneer === me && x.myHand.length) return send({ type: 'offer', cardId: x.myHand[0].id });
  if (x.phase === 'choose_type' && x.auctioneer === me) {
    // 클로즈도 거치게 — 칩이 있으면 둘에 한 번은 클로즈 2
    if (x.canClose && (x.turn % 2 === 0)) { p.closes++; return send({ type: 'auctionType', val: 'close', price: 2 }); }
    return send({ type: 'auctionType', val: 'open' });
  }
  if (x.phase === 'open' && a && a.turnSeat === me) {
    return (a.price < 3 && x.seats[me].chips > a.price) ? send({ type: 'raise', to: a.price + 1 }) : send({ type: 'pass' });
  }
  if (x.phase === 'answer' && a && a.myAnswer === null && me !== x.auctioneer && !a.answered.includes(me)) {
    p.answers++;
    return send({ type: 'answer', buy: x.seats[me].chips >= a.closeP + 1 && Math.random() < 0.5 });
  }
}
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; }

(async () => {
  const { url, logPath } = await liveServer(39532);

  console.log('① 솔로 4인 — 사람 1 + AI 3');
  {
    const leaks = [], p = player(url, 1, leaks);
    await wait(400);
    p.s.emit('g4_start', { nick: '솔로', n: 4 });
    const done = await until(() => p.over, 150000);
    ok('판이 끝까지 간다', done, done ? '' : `단계 ${p.st && p.st.phase} (서버 기록: ${logPath})`);
    ok('4인 판이다', p.st && p.st.n === 4 && p.st.seats.length === 4);
    ok('사람도 두었다', p.acted > 0);
    ok('선을 넘는 상태가 없다', leaks.length === 0, [...new Set(leaks)].join(' · '));
    ok('g4_error 없음', !p.errors.length, p.errors.join(','));
    if (p.over) {
      const o = p.over.over;
      ok('승자와 순위가 있다', o && o.order && o.order.length === 4 && o.order[0] === o.winner);
      ok('끝난 까닭이 세트나 덱이다', o && (o.reason === 'set' || o.reason === 'deck'));
      ok('칩이 음수인 사람이 없다', p.over.seats.every((q) => q.chips >= 0));
    }
    p.s.close();
  }

  console.log('\n② 멀티 3인 — 사람 셋');
  {
    const leaks = [], P = [2, 3, 4].map((i) => player(url, i, leaks));
    await wait(400);
    for (const p of P) { p.s.emit('g4_quick', { nick: 'M' + p.s.id.slice(0, 3) }); await wait(250); }
    await wait(600);
    P[0].s.emit('g4_startnow');
    const begun = await until(() => P.every((p) => p.begun), 8000);
    ok('셋이 한 방에서 시작한다', begun && P[0].st && P[0].st.n === 3 && P[0].st.seats.every((q) => !q.isBot));
    const done = await until(() => P.every((p) => p.over), 150000);
    ok('판이 끝까지 간다', done, done ? '' : `단계 ${P[0].st && P[0].st.phase} (서버 기록: ${logPath})`);
    ok('셋 다 같은 승자를 본다', done && new Set(P.map((p) => p.over.over.winner)).size === 1);
    ok('각자 자기 자리로 본다', P.every((p, k) => p.st && p.st.me !== null) && new Set(P.map((p) => p.st.me)).size === 3);
    ok('클로즈를 거쳤다', P.reduce((t, p) => t + p.closes, 0) > 0);
    ok('클로즈에 사람이 몰래 답했다', P.reduce((t, p) => t + p.answers, 0) > 0);
    ok('선을 넘는 상태가 없다', leaks.length === 0, [...new Set(leaks)].join(' · '));
    ok('g4_error 없음', P.every((p) => !p.errors.length), P.map((p) => p.errors.join(',')).join(' | '));
    P.forEach((p) => p.s.close());
  }

  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
