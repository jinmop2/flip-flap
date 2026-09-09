// 다인전 "한 판 더" 를 실제로 돌려 본다.
// 규칙 문자열만 보는 시험(t_q4again)과 달리, 여기서는 서버를 띄우고 사람 둘이
// 판을 끝까지 둔 뒤 둘 다 눌러서 정말 같이 새 판이 열리는지를 본다.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const io = require(root + '/node_modules/socket.io-client');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const PORT = 39511;
  const dir = '/tmp/ffq4re';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json' },
  });
  const URL = 'http://localhost:' + PORT;
  await nap(1800);

  const mk = (ip, nick) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': ip } });
    const p = { s, nick, st: null, done: false, begins: [], wanted: [], errors: [] };
    s.on('connect', () => s.emit('g4_quick', { nick }));
    s.on('g4_begin', (d) => { p.begins.push(d); p.done = false; });
    s.on('g4_state', (x) => { p.st = x; });
    s.on('g4_over', (x) => { p.st = x; p.done = true; });   // 판이 정말 끝난 신호
    s.on('g4_rematch_wanted', (d) => p.wanted.push(d));
    s.on('g4_error', (m) => p.errors.push(m));
    return p;
  };

  // 낼 수 있으면 낸다 — 판을 끝까지 굴리기만 하면 된다
  const step = (p) => {
    const s = p.st; if (!s || s.over) return;
    const me = p.begins.length ? p.begins[p.begins.length - 1].me : null;
    if (me === null) return;
    const a = s.auction;
    if (s.phase === 'draw' && s.auctioneer === me) return p.s.emit('g4_act', { type: 'draw' });
    if (s.phase === 'offer' && s.auctioneer === me && s.myHand.length)
      return p.s.emit('g4_act', { type: 'offer', cardId: s.myHand[0].id });
    if (s.phase === 'choose_type' && s.auctioneer === me)
      return p.s.emit('g4_act', { type: 'auctionType', val: 'open' });
    if (s.phase === 'bidding' && a && s.myHand.length) {
      if (s.seats[me].bidded || !s.bidders.includes(me)) return;
      if (a.closed && a.turnToBid !== me) return;
      return p.s.emit('g4_act', { type: 'bid', cardId: s.myHand[0].id });
    }
  };

  try {
    console.log('① 사람 둘이 붙어 판을 끝낸다');
    const P = [mk('10.9.1.1', 'A'), mk('10.9.1.2', 'B')];
    await nap(2200);
    P[0].s.emit('g4_startnow');
    await nap(1800);
    ok('둘 다 시작했다', P.every((p) => p.begins.length === 1), P.map((p) => p.begins.length).join(','));
    const room1 = P[0].begins[0] && P[0].begins[0].roomId;
    ok('멀티로 시작했다', P[0].begins[0] && P[0].begins[0].solo === false, JSON.stringify(P[0].begins[0] && P[0].begins[0].solo));

    // 3인 판은 12~18턴이라 서버의 연출 간격까지 더하면 1분을 넘길 때가 있다.
    // 덜 끝난 채로 재대결을 누르면 서버가 (옳게) 거절하므로, 끝날 때까지 기다린다.
    for (let i = 0; i < 1800 && !P.every((p) => p.done); i++) { P.forEach(step); await nap(80); }
    ok('판이 끝났다', P.every((p) => p.done),
       P[0].st ? 'phase=' + P[0].st.phase + ' turn=' + P[0].st.turn : '상태 없음');
    if (!P.every((p) => p.done)) { console.log('  (판이 안 끝나 아래는 건너뜀)'); throw new Error('판 미완'); }

    console.log('\n② 한 사람만 누르면 아직 안 시작한다');
    P[0].s.emit('g4_rematch');
    await nap(900);
    ok('상대에게 알려 준다', P[1].wanted.length === 1, JSON.stringify(P[1].wanted));
    ok('몇 명 눌렀는지 같이 온다', P[1].wanted[0] && P[1].wanted[0].ready === 1 && P[1].wanted[0].of === 2,
       JSON.stringify(P[1].wanted[0]));
    ok('아직 새 판은 없다', P.every((p) => p.begins.length === 1), P.map((p) => p.begins.length).join(','));
    // 누른 사람에게는 자기 알림이 안 와야 한다
    ok('자기한테는 안 온다', P[0].wanted.length === 0, JSON.stringify(P[0].wanted));

    console.log('\n③ 둘 다 누르면 같이 새 판');
    P[1].s.emit('g4_rematch');
    await nap(2000);
    ok('둘 다 새 판을 받았다', P.every((p) => p.begins.length === 2), P.map((p) => p.begins.length).join(','));
    const b0 = P[0].begins[1], b1 = P[1].begins[1];
    ok('같은 방이다', b0 && b1 && b0.roomId === b1.roomId, b0 && b1 ? b0.roomId + ' / ' + b1.roomId : '없음');
    ok('아까 그 방은 아니다', b0 && b0.roomId !== room1);
    ok('여전히 멀티다 — 솔로로 새지 않았다', b0 && b0.solo === false, JSON.stringify(b0 && b0.solo));
    ok('자리 수가 같다', b0 && b0.n === P[0].begins[0].n, b0 ? b0.n + ' vs ' + P[0].begins[0].n : '');
    // 여기가 이 시험의 핵심이다 — 예전에는 이 자리에 AI 만 앉았다
    const humans = b0 ? b0.seats.filter((x) => !x.isBot).length : 0;
    ok('사람 둘이 그대로 앉아 있다', humans === 2, '사람 ' + humans + '명');
    ok('g4_error 없음', P.every((p) => !p.errors.length), P.map((p) => p.errors.join(',')).join(' | '));

    P.forEach((p) => p.s.close());
  } catch (e) {
    if (e && e.message !== '판 미완') { console.log('  ✗ 시험 중 오류: ' + e.message); fail++; }
  } finally {
    sv.kill();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
