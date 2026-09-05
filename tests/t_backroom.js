// 판이 끝난 뒤 방으로 돌아가 다시 하기.
//
// 예전엔 끝나고 갈 데가 둘뿐이었다.
//   '한 판 더' — 같은 모드로 즉시 (둘 다 눌러야 함)
//   '로비로'   — 새로고침. 방을 통째로 버린다.
// 같은 사람들과 다른 모드로 한 판 더 하려면 방을 다시 만들고 코드를 다시 나눠야 했다.
// 이제 방이 살아 있는 채 대기실로 돌아간다 — 거기서 모드를 고르고 시작한다.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const io = require('socket.io-client');
const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 서버가 방을 되살린다');
{
  ok('통로가 있다', /socket\.on\('back_to_room'/.test(srv));
  // 대기실이 없는 방(랭크·빠른대전)에는 돌아갈 곳이 없다
  ok('대기실 있는 방만', /if \(!room\.hostStart\) return;/.test(srv));
  // 도중에 나가는 길이 아니다 — 판이 끝나야 한다
  ok('판이 끝나야 움직인다', /const done = \(!room\.game && !room\.tv\)/.test(srv)
     && /room\.game\.phase === 'game_over'/.test(srv) && /room\.tv && room\.tv\.over/.test(srv));
  ok('판 흔적을 걷는다', /room\.game = null; room\.tv = null; room\.tvDone = false;/.test(srv));
  ok('시계도 멈춘다', /back_to_room[\s\S]{0,900}endClock\(room\)/.test(srv));
  ok('트웰브 타이머도 끈다', /back_to_room[\s\S]{0,900}clearTimeout\(room\.tvNext\); clearTimeout\(room\.tvThink\);/.test(srv));
  // 한 사람이 눌러도 둘 다 돌아간다 — 서로 기다리다 멈추면 안 된다
  ok('모두에게 대기실을 다시 보낸다', /back_to_room[\s\S]{0,1100}pushRoomLobby\(roomId\)/.test(srv));
  ok('방이 없으면 알려 준다', /if \(!room\) return socket\.emit\('opponent_left'\);/.test(srv));
  ok('연타 간격이 있다', /back_to_room: 600/.test(srv));
}

console.log('② 화면이 새로고침 없이 잇는다');
{
  ok('방 출신인지 기억한다', /let fromRoom = false;/.test(cli));
  ok('대기실에 들어가면 표시한다', /socket\.on\('room_lobby', \(r\) => \{\s*\n\s*fromRoom = true;/.test(cli));
  ok('방을 떠나면 지운다', /function leaveWaitUI\(\) \{\s*\n\s*fromRoom = false;/.test(cli));
  // 새로고침하면 소켓이 바뀌어 방에서 튕긴다 — 화면만 걷어야 한다
  ok('판 화면을 걷는 길이 있다', /function leaveGameScreen\(\)/.test(cli));
  ok('그 길은 새로고침을 안 한다', !/function leaveGameScreen\(\)[\s\S]{0,700}fastReload/.test(cli));
  ok('대기실로 돌아오면 판을 걷는다',
     /if \(document\.body\.classList\.contains\('ingame'\)\) leaveGameScreen\(\);/.test(cli));
  ok('결과창에 방으로가 붙는다', /function roomBackBtn\(goBtns, on\)/.test(cli));
  // AI 판·대회 판에는 안 붙는다 (돌아갈 방이 없거나 다른 흐름이다)
  ok('사람과 붙은 방 판에만 붙는다',
     /roomBackBtn\(goBtns, fromRoom && !isVsBot && !isStourMatch && !isTourMatch\)/.test(cli));
  ok('트웰브 결과창에도 붙는다', /roomBackBtn\(btns, fromRoom && !tvBot\)/.test(cli));
  // '한 판 더' 는 남긴다 — 같은 모드로 바로 하는 빠른 길이다
  ok("'한 판 더' 를 없애지 않았다", /id="rematchBtn"/.test(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')));
  {
    // 상대가 먼저 눌렀다는 것을 글줄로만 알리면, 눈이 버튼이 아니라 문장에
    // 가 있어야 한다. 눌러야 할 그 자리에 붙인다.
    const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
    ok('버튼 자체에 표시가 붙는다', /한 판 더!<i class="rb-badge" id="rematchBadge">상대 준비!<\/i>/.test(htm)
       && /#rematchBtn\.wanted \.rb-badge \{ display:block;/.test(htm));
    // box-shadow 를 무한히 애니메이션하면 매 프레임 다시 그린다 — 고리는 transform 으로
    ok('버튼도 같이 숨쉰다', /#rematchBtn\.wanted::after \{[\s\S]{0,180}animation:rbRing/.test(htm)
       && /@keyframes rbRing \{ from \{ transform:scale\(1\)/.test(htm));
    ok('상대가 누르면 켠다', /socket\.on\('rematch_wanted'[\s\S]{0,200}rematchMark\(true\)/.test(cli));
    ok('새 판이 열리면 끈다', (cli.match(/rematchMark\(false\)/g) || []).length >= 2);
    // 결과창을 안 보고 있을 수도 있다
    ok('소리로도 알린다', /rematchMark\(true\);[\s\S]{0,160}sfx\('ping'\)/.test(cli));
    // 세 나라 말로 다 나와야 한다
    for (const f of ['public/i18n.js', 'public/lang-ja.js', 'public/lang-zh.js'])
      ok(f.replace('public/', '') + ' 에 배지 문구', /'상대 준비!':/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  }
}

console.log('③ 진짜로 방 → 판 → 방 → 다른 모드');
(async () => {
  const PORT = 39495;
  const dir = '/tmp/ffback';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json' },
  });
  const URL = 'http://localhost:' + PORT;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));

  // 이벤트를 흘리지 않게 모아 둔다 — await 사이에 지나가면 영영 못 잡는다
  function client(ip) {
    const s = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': ip } });
    const box = {};
    s.onAny((n, p) => { (box[n] = box[n] || []).push(p === undefined ? {} : p); });
    s.take = (ev, ms = 15000) => new Promise((res, rej) => {
      const t0 = Date.now();
      const tick = () => {
        if (box[ev] && box[ev].length) return res(box[ev].shift());
        if (Date.now() - t0 > ms) return rej(new Error('타임아웃: ' + ev));
        setTimeout(tick, 60);
      };
      tick();
    });
    return new Promise((r) => s.on('connect', () => r(s)));
  }
  // 상태가 올 때만 두면 '진행자가 먼저' 규칙에 한 번 걸리고 멈춘다 — 주기적으로 다시 시도한다
  function autoPlay(s) {
    let last = null;
    const act = (v) => {
      if (!v || v.phase === 'game_over') return;
      const h = v.myHand || [];
      const weak = [...h].sort((a, b) => (b.kind * 100 + b.grade) - (a.kind * 100 + a.grade));
      try {
        if (v.phase === 'pick') { if (v.pick && v.pick.myChoice == null) s.emit('pick_card', { slot: v.myIndex === 1 ? 0 : 1 }); }
        else if (v.phase === 'draw' && v.auctioneer === v.myIndex) s.emit('draw_card');
        else if (v.phase === 'offer' && v.auctioneer === v.myIndex && weak[0]) s.emit('offer_card', { cardId: weak[0].id });
        else if (v.phase === 'choose_type' && v.auctioneer === v.myIndex) s.emit('choose_auction', { type: 'open' });
        else if (v.phase === 'bidding' && !(v.auction || {}).myBid && weak[0]) s.emit('submit_bid', { cardId: weak[0].id });
        else if (v.bombPick && weak[0]) s.emit('bomb_discard', { cardId: weak[0].id });
      } catch (_) {}
    };
    s.on('state_update', (v) => { last = v; act(v); });
    const t = setInterval(() => { if (last) act(last); }, 400);
    if (t.unref) t.unref();
  }

  let A, B;
  try {
    for (let i = 0; i < 80; i++) { try { await fetch(URL + '/health'); break; } catch (_) { await nap(300); } }
    A = await client('203.0.113.1'); B = await client('198.51.100.1');
    autoPlay(A); autoPlay(B);

    A.emit('create_room', { pid: 'pidA', nick: '방장', name: '시험방' });
    const made = await A.take('room_created');
    await A.take('room_lobby');
    B.emit('join_room', { roomId: made.roomId, pid: 'pidB', nick: '손님' });
    await B.take('room_lobby');
    const lob = await A.take('room_lobby');
    ok('둘이 대기실에 앉는다', lob.ready === true);

    A.emit('room_start', { mode: 'classic' });
    await A.take('game_start');
    const over = await A.take('game_over', 150000);
    ok('판이 끝난다', over.winner === 1 || over.winner === 2, JSON.stringify(over).slice(0, 60));
    await nap(700);

    A.emit('back_to_room');
    const backA = await A.take('room_lobby', 8000);
    const backB = await B.take('room_lobby', 8000).catch(() => null);
    ok('방으로 돌아간다', !!backA && backA.host === true);
    ok('한 사람만 눌러도 둘 다 돌아간다', !!backB);
    ok('자리가 그대로다', (backA.seats || []).filter(Boolean).length === 2,
       (backA.seats || []).filter(Boolean).map((x) => x.nick).join(','));
    ok('바로 시작할 수 있다', backA.ready === true);

    A.emit('room_start', { mode: 'twelve' });
    const tv = await A.take('tv_state', 12000).catch(() => null);
    ok('다른 모드로 다시 시작된다', !!tv && tv.mode === 'twelve');

    // 판 도중에는 되돌리지 않는다
    A.emit('back_to_room');
    await nap(900);
    const sneaky = await A.take('room_lobby', 1500).catch(() => null);
    ok('판 도중에는 무시한다', !sneaky);
  } catch (e) {
    ok('방 → 판 → 방 흐름', false, e.message);
  } finally {
    try { A && A.close(); B && B.close(); } catch (_) {}
    sv.kill();
  }

  console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
  process.exit(fail ? 1 : 0);
})();
