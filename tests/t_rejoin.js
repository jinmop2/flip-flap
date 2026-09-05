// 끊겼다 다시 붙기.
//
// 제보: "멀티플레이에서 자꾸 연결이 끊기고, 끊기면 재접속이 안 돼."
//
// 서버는 60초 유예를 갖고 있다 — 끊긴 자리를 비워 두고, 그 안에 돌아오면
// 시계를 다시 돌린다. 그런데 돌아오는 길(rejoin)이 pid 로 자리를 찾는다.
// 방을 만들 때 pid 를 안 넣어 두면 유예가 아무 소용이 없다 — 60초를 줘도
// 돌아올 방법이 없다.
const io = require('/Users/jinmo9/참치/my-game/node_modules/socket.io-client');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  ' + x : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (ip) => io('http://localhost:3000', { transports: ['websocket'], forceNew: true,
  reconnection: false, extraHeaders: { 'X-Forwarded-For': ip } });

function player(i, pid) {
  const p = { pid, s: mk('10.9.4.' + i), st: null, room: null, started: false,
              oppGone: null, oppBack: false, graceLeft: null, failed: null };
  p.s.on('game_start', (d) => { p.started = true; p.room = d.roomId; p.graceLeft = d.graceLeft; });
  p.s.on('state_update', (st) => { p.st = st; });
  p.s.on('opp_disconnected', (d) => { p.oppGone = d; });
  p.s.on('opp_reconnected', () => { p.oppBack = true; });
  p.s.on('rejoin_failed', (d) => { p.failed = (d && d.why) || 'unknown'; });
  return p;
}

(async () => {
  console.log('① 둘이 붙어 판을 시작한다');
  // 방을 직접 만든다 — 빠른 매칭은 모드를 무작위로 뽑아서(트웰브가 걸리면
  // 신호가 다르다) 시험이 들쭉날쭉해진다. 재접속 길은 어느 쪽이든 같다.
  const A = player(1, 'pid-aaa-' + Date.now());
  const B = player(2, 'pid-bbb-' + Date.now());
  A.s.on('room_created', (d) => { A.made = d && (d.roomId || d.id); });
  A.s.on('room_lobby', (d) => { if (d && d.roomId) A.made = d.roomId; });
  await wait(900);
  A.s.emit('create_room', { vsBot: false, pid: A.pid, nick: '갑' + (Date.now() % 900) });
  await wait(1500);
  const made = A.made || A.room;
  ok('방이 만들어졌다', !!made, String(made));
  B.s.emit('join_room', { roomId: made, pid: B.pid, nick: '을' + (Date.now() % 900) });
  await wait(1500);
  A.s.emit('room_start', { mode: 'classic' });
  await wait(3500);
  ok('둘 다 판에 들어갔다', A.started && B.started, `A=${A.started} B=${B.started}`);
  ok('같은 방이다', A.room && A.room === B.room, `${A.room} / ${B.room}`);
  const roomId = A.room;

  console.log('\n② 한 명이 끊긴다 — 방은 남고 상대에게 알린다');
  A.s.disconnect();
  await wait(1800);
  ok('상대가 끊김을 안다', !!B.oppGone, JSON.stringify(B.oppGone));
  ok('60초 유예를 알려 준다', B.oppGone && B.oppGone.left === 60, B.oppGone && String(B.oppGone.left));

  console.log('\n③ 같은 pid 로 돌아오면 판을 이어서 한다');
  const A2 = player(3, A.pid);            // 같은 사람, 새 소켓
  await wait(900);
  A2.s.emit('rejoin', { roomId, pid: A.pid });
  await wait(2000);
  ok('돌아갈 수 있다', A2.started && !A2.failed, A2.failed || '못 돌아감');
  ok('판 상태를 다시 받는다', !!A2.st && Array.isArray(A2.st.myHand), A2.st ? 'ok' : '상태 없음');
  ok('남은 유예를 알려 준다', typeof A2.graceLeft === 'number', String(A2.graceLeft));
  ok('상대에게도 알린다', B.oppBack === true);

  console.log('\n④ 남의 방에는 못 들어간다');
  const C = player(4, 'pid-ccc-' + Date.now());
  await wait(900);
  C.s.emit('rejoin', { roomId, pid: 'pid-ccc-없는사람' });
  await wait(1200);
  ok('모르는 pid 는 거절', C.failed === 'notmine', String(C.failed));

  console.log('\n⑤ 없는 방');
  const D = player(5, 'pid-ddd');
  await wait(900);
  D.s.emit('rejoin', { roomId: 'ZZZZZZ', pid: 'pid-ddd' });
  await wait(1200);
  ok('없는 방은 거절', D.failed === 'gone', String(D.failed));

  for (const p of [A2, B, C, D]) { try { p.s.disconnect(); } catch (_) {} }

  console.log('\n⑥ 다인전도 같은 시간을 준다');
  {
    const fs = require('fs'), path = require('path');
    const s4 = fs.readFileSync(path.join(__dirname, '..', 'server4.js'), 'utf8');
    // 손잡이가 둘이다. AI 는 빨리 대신 두고(판이 안 멈추게), 자리는 오래 지킨다.
    const g = s4.match(/const SEAT_GRACE = (\d+);/);
    const rc = s4.match(/const SEAT_RECLAIM = (\d+);/);
    ok('AI 는 20초 뒤에 대신 둔다', g && Number(g[1]) === 20000, g ? g[1] : '못 찾음');
    ok('자리는 60초까지 임자 것', rc && Number(rc[1]) === 60000, rc ? rc[1] : '못 찾음');
    ok('돌아올 길이 있다', /safe\(socket, 'g4_resume'/.test(s4));
    // AI 가 잡고 있어도 시간 안이면 밀어내고 되찾는다
    ok('AI 를 밀어낼 수 있다', /s\.isBot = false; s\.aiSince = null;/.test(s4));
    // 스스로 나간 자리와 시간이 다 지난 자리는 못 돌아온다
    ok('스스로 나간 자리는 안 돌려준다',
       /if \(s\.isBot && \(s\.left \|\| !s\.orphanAt \|\| Date\.now\(\) - s\.orphanAt > SEAT_RECLAIM\)\)/.test(s4));

    const c4 = fs.readFileSync(path.join(__dirname, '..', 'public/client4.js'), 'utf8');
    // 기억에만 두면 새로고침 한 번에 돌아갈 방을 잊는다
    ok('방·자리를 남겨 둔다', /localStorage\.setItem\('ff_q4'/.test(c4));
    ok('앱을 껐다 켜도 되찾는다', /JSON\.parse\(localStorage\.getItem\('ff_q4'\)[\s\S]{0,200}g4_resume/.test(c4));
    ok('끝나면 지운다', /localStorage\.removeItem\('ff_q4'\)/.test(c4));

    const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');
    // 예전엔 2인전에서만 끊김 창이 떴다 — 다인전은 눌러 볼 것조차 없었다
    ok('끊김 창이 다인전에서도 뜬다', /function inLiveGame\(\)/.test(cli)
       && /ff_q4[\s\S]{0,120}return true/.test(cli));
    ok('다시 연결 단추가 있다', /id="dcBtn"[^>]*onclick="tryReconnect\(\)"/.test(
       fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8')));
    ok('그 단추가 다인전 자리도 되찾는다', /g4_resume', \{ roomId: q4\.room/.test(cli));
  }

  console.log('\n⑥-2 눌렀으면 무슨 일이 났는지 화면에 적힌다');
  {
    // 제보: "재접속 버튼을 눌러도 아무 효과가 없어."
    // 눌러도 아무 말이 없으면, 붙는 중인지 못 붙은 것인지 사람은 알 길이 없다.
    // 아래 셋이 각각 '아무 효과 없음' 으로 보이던 진짜 까닭이다.
    const fs2 = require('fs'), path2 = require('path');
    const cli = fs2.readFileSync(path2.join(__dirname, '..', 'public/client.js'), 'utf8');
    const c4 = fs2.readFileSync(path2.join(__dirname, '..', 'public/client4.js'), 'utf8');

    // ① 오프라인으로 켠 판은 가짜 소켓이라 connect() 가 빈 함수다.
    //    아무리 눌러도 될 리가 없었다 — 진짜 소켓은 다시 읽어야 생긴다.
    ok('가짜 소켓이면 다시 읽는다', /typeof io !== 'function'\)[\s\S]{0,400}location\.reload\(\)/.test(cli));
    ok('그물이 없으면 그렇다고 적는다', /아직 인터넷이 없어요/.test(cli));

    // ② 매니저가 재시도를 포기한 뒤면 connect() 만으로는 안 깨어난다
    ok('포기한 매니저를 다시 켠다', /socket\.io\.reconnection === 'function'\) socket\.io\.reconnection\(true\)/.test(cli));

    // ③ 눌렀는데 안 붙으면 안 붙는다고 적는다
    ok('못 붙으면 말해 준다', /서버에 못 닿았어요/.test(cli)
       && /if \(!socket\.connected\)/.test(cli));
    ok('돌아갈 판이 없으면 말해 준다', /돌아갈 판이 없어요/.test(cli));
    // 이미 붙어 있는데 판만 안 열린 경우 — 여기서도 잠자코 있으면 안 된다
    ok('붙어 있을 때 눌러도 말해 준다', /else if \(dcAskResume\(\)\) \{[\s\S]{0,220}dcJoining\(\);/.test(cli));

    // 붙은 뒤 — 세던 시간은 뜻이 없다. 판을 여는 중이라고 바꾼다.
    ok('붙으면 여는 중으로 바뀐다', /socket\.on\('connect'[\s\S]{0,300}dcJoining\(\)/.test(cli)
       && /function dcJoining\(\)/.test(cli));
    // 그런데도 안 오면, 안 온다고 말해야 한다 — 잠자코 있으면 고장으로 읽힌다
    ok('판이 안 오면 안 온다고 한다', /판을 못 찾았어요/.test(cli));

    // 판이 돌아왔는데 덮개가 남아 있으면, 이어진 판이 가려져 '효과 없음' 으로 보인다.
    // 예전엔 2인전 판이 열릴 때만 걷었다.
    ok('어느 모드든 판이 오면 걷는다', /window\.dcArrived = dcHide;/.test(cli)
       && /socket\.on\('tv_state'[\s\S]{0,120}dcArrived\(\)/.test(cli)
       && /socket\.on\('g4_state'[\s\S]{0,300}dcArrived\(\)/.test(c4));

    // 판으로 돌아가는 길과 로비로 가는 길이 같은 순간에 갈리면 어느 쪽도 안 열린다
    ok('다인전 자리가 있으면 로비를 안 청한다',
       /else if \(!hasQuadSeat\(\)\) socket\.emit\('enter_lobby'\)/.test(cli)
       && /function hasQuadSeat\(\)/.test(cli));
  }

  console.log('\n⑦ 대회에서도 돌아올 수 있다');
  {
    const fs = require('fs'), path = require('path');
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    // pids 가 [null, null] 이면 rejoin 이 자리를 못 찾아 60초를 줘도 못 돌아온다
    ok('대회 방에도 pid 를 적는다', !/name: '토너먼트[\s\S]{0,400}pids: \[null, null\]/.test(srv)
       && /pids: \[s0 && s0\.pid \? s0\.pid : null/.test(srv));
  }

  console.log('\n⑧ 다인전에서 진짜로 끊었다 돌아온다');
  {
    const q = (i) => {
      const p = { s: mk('10.9.7.' + i), begun: false, seat: null, st: null, gone: false };
      p.s.on('g4_begin', (d) => { p.begun = true; p.seat = d.me; p.room = d.roomId; });
      p.s.on('g4_state', (st) => { p.st = st; });
      p.s.on('g4_gone', () => { p.gone = true; });
      return p;
    };
    const P = [1, 2, 3].map(q);
    await wait(900);
    P.forEach((p, i) => p.s.emit('g4_quick', { nick: '다' + i + (Date.now() % 90) }));
    await wait(2500);
    P[0].s.emit('g4_startnow');
    await wait(2500);
    ok('셋이 판을 시작한다', P.every((p) => p.begun), P.map((p) => p.begun).join());
    const room = P[1].room, seat = P[1].seat;

    // 한 명이 끊긴다
    P[1].s.disconnect();
    await wait(3000);
    ok('남은 사람은 계속한다', !!P[0].st && !P[0].st.over);

    // 20초가 지나면 AI 가 대신 둔다 — 남은 사람이 멈춰 기다리면 안 되니까.
    // 그래도 자리는 60초까지 임자의 것이다.
    await wait(26000);
    ok('AI 가 대신 두고 있다', !!P[0].st && P[0].st.seats && P[0].st.seats[seat]
       && P[0].st.seats[seat].isBot === true,
       P[0].st && P[0].st.seats ? JSON.stringify(P[0].st.seats[seat]).slice(0, 60) : '상태 없음');
    ok('판은 계속 돌고 있다', !!P[0].st && !P[0].st.over);

    const back = q(9);
    await wait(900);
    back.s.emit('g4_resume', { roomId: room, seat });
    await wait(2500);
    ok('AI 를 밀어내고 자리를 되찾는다', !back.gone, back.gone ? '못 돌아감' : 'ok');
    ok('돌아와 판 상태를 받는다', !!back.st, back.st ? 'ok' : '상태 없음');
    ok('자리가 다시 사람 것이 된다',
       !!back.st && back.st.seats && back.st.seats[seat] && back.st.seats[seat].isBot === false,
       back.st && back.st.seats ? JSON.stringify(back.st.seats[seat]).slice(0, 60) : '상태 없음');

    for (const p of [...P, back]) { try { p.s.disconnect(); } catch (_) {} }
  }

  console.log('');
  if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
  console.log(`✓ 전부 통과 (${pass}/${pass})`);
  process.exit(0);
})();
