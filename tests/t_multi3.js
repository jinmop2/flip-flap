// 멀티 3인전 — 사람 여럿일 때 칩 경매가 제대로 도는가.
// 오픈은 "내 차례가 와야 부를 수 있다" 라서, 서버가 차례를 잘못 잡으면
// 아무도 못 두고 판이 멈춘다. 클로즈는 몰래 답하므로 남의 답이 새면 안 된다.
const io = require('/Users/jinmo9/참치/my-game/node_modules/socket.io-client');
const { liveServer } = require('./live');
let URL;                       // 아래에서 자기 서버를 띄우고 채운다
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (ip) => io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': ip } });

function join(i, base) {
  const p = { i, s: mk(base + i), st: null, seat: null, begun: false, errors: [], states: 0 };
  p.s.on('connect', () => p.s.emit('g4_quick', { nick: 'H' + i }));
  p.s.on('g4_begin', (d) => { p.seat = d.me; p.begun = true; });
  p.s.on('g4_room', (d) => { p.room = d; });
  p.s.on('g4_state', (s) => { p.st = s; p.states++; });
  p.s.on('g4_error', (m) => p.errors.push(m));
  return p;
}

// 사람 셋이 자동으로 플레이 — 제 차례면 둔다. 클로즈를 자주 열고,
// 둘이 같이 사겠다고 해 동점 경쟁도 나오게 한다.
function autoplay(p) {
  const s = p.st;
  if (!s || p.seat === null || s.over) return false;
  const a = s.auction, me = s.seats[p.seat];
  const send = (d) => { p.s.emit('g4_act', d); return true; };
  if (s.phase === 'offer' && s.auctioneer === p.seat && s.myHand.length) return send({ type: 'offer', cardId: s.myHand[0].id });
  if (s.phase === 'choose_type' && s.auctioneer === p.seat)
    return send(s.canClose ? { type: 'auctionType', val: 'close', price: 2 } : { type: 'auctionType', val: 'open' });
  if (s.phase === 'answer' && a && s.auctioneer !== p.seat && a.myAnswer === null)
    return send({ type: 'answer', buy: me.chips >= a.closeP + 1 });
  if (s.phase === 'open' && a && a.turnSeat === p.seat)
    return send(a.price < 4 && me.chips > a.price ? { type: 'raise', to: a.price + 1 } : { type: 'pass' });
  return false;
}

(async () => {
  URL = (await liveServer(39522)).url;
  console.log('\n① 사람 셋이 모여 3인전을 시작한다');
  const P = [1, 2, 3].map((i) => join(i, '10.7.1.'));
  await wait(2500);
  // 시작 전에는 대기방 정보(g4_room)만 온다 — 게임 상태(g4_state)는 아직 없다
  ok('세 명 같은 방', P.every((p) => p.room) && new Set(P.map((p) => p.room.roomId)).size === 1);
  P[0].s.emit('g4_startnow');
  await wait(2500);
  ok('시작됨', P.every((p) => p.begun));
  ok('3인전 · 전원 사람', P[0].st && P[0].st.n === 3 && P[0].st.seats.every((x) => !x.isBot));

  console.log('\n② 오픈 차례 · 클로즈 몰래 답하기가 맞는가');
  // 서버는 한 사람이 안 두면 TURN_MS(25초) 뒤에 AI 가 대신 둔다. 그보다 먼저
  // "멈췄다" 고 단정하면, 소켓 하나가 잠깐 늦은 것도 실패로 잡힌다 —
  // 기계가 바쁠 때만 빨개지는 시금석이 되어 아무도 안 믿게 된다.
  // 서버가 손쓸 시간을 준 뒤에도 그대로면, 그때가 진짜 멈춘 것이다.
  const STALL = Math.ceil(30000 / 150);            // 30초 (서버 25초 + 여유)
  let sawClose = false, sawTie = false, turnOk = true, leakOk = true, stalls = 0;
  let lastSig = '', same = 0;
  for (let step = 0; step < 900; step++) {
    const s = P[0].st;
    if (s && s.over) break;
    const a = (s && s.auction) || {};
    const sig = s ? [s.turn, s.phase, a.price, a.turnSeat, (a.out || []).length, (a.answered || []).length].join('|') : '';
    if (sig === lastSig) same++; else { same = 0; lastSig = sig; }
    if (same > STALL) { stalls++; break; }

    if (s && s.phase === 'open' && s.auction) {
      if (a.tiebreak) sawTie = true;
      // 차례는 늘 아직 안 빠졌고 값을 쥐지 않은 사람에게 간다
      if (a.turnSeat === a.high || a.out.includes(a.turnSeat)) {
        turnOk = false; console.log('    차례 어긋남: turn ' + a.turnSeat + ' high ' + a.high + ' out ' + a.out);
      }
    }
    if (s && s.phase === 'answer' && s.auction) {
      sawClose = true;
      // 다 답하기 전엔 누가 샀는지 아무에게도 안 보인다 — 내 답만 나에게
      for (const p of P) {
        const st = p.st; if (!st || st.phase !== 'answer' || !st.auction) continue;
        if (st.auction.buyers || /"answers"/.test(JSON.stringify(st))) { leakOk = false; console.log('    남의 답이 보임: seat' + p.seat); }
      }
    }
    for (const p of P) autoplay(p);
    await wait(150);
  }
  ok('클로즈 경매가 실제로 나왔다', sawClose);
  if (sawTie) console.log('    (동점 경쟁도 나왔다)');
  ok('오픈 차례가 항상 맞다', turnOk);
  ok('남의 클로즈 답은 안 보인다', leakOk);
  ok('멈추지 않았다', stalls === 0);
  ok('g4_error 없음', P.every((p) => !p.errors.length), P.map((p) => p.errors.join(',')).join(' | '));

  console.log('\n③ 순서 중간에 한 명이 나가도 판이 이어지는가');
  {
    const s = P[0].st;
    ok('게임이 끝났거나 진행 중', !!s);
    P[1].s.close();                       // 두 번째 사람 이탈
    await wait(2500);
    let moved = false;
    const before = P[0].st ? P[0].st.turn + P[0].st.phase : '';
    for (let i = 0; i < 60; i++) {
      for (const p of [P[0], P[2]]) autoplay(p);
      await wait(200);
      const now = P[0].st ? P[0].st.turn + P[0].st.phase : '';
      if (now !== before) { moved = true; break; }
    }
    ok('한 명이 나가도 진행된다', moved || (P[0].st && P[0].st.over));
  }

  P.forEach((p) => { try { p.s.close(); } catch (_) {} });
  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
