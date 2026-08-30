// 솔로 토너먼트가 중간에 끊기지 않아야 한다.
//
// 무슨 일이 있었나:
//   대회를 socket.id 로 잡고 끊길 때 지웠다. 그런데 판이 끝나고 '로비로' 를
//   누르면 화면이 새로고침되고(fastReload), 새로고침하면 소켓이 새로 붙는다 —
//   그 순간 대회가 통째로 사라졌다. 트웰브는 나가는 길이 새로고침뿐이라
//   대회에서 트웰브가 걸리면 무조건 거기서 끊겼다.
//   게다가 상금은 우승·준우승에만 있어서, 끊기면 세 판을 이겨 놓고도 빈손이었다.
//
// 그래서 셋을 건다: 대회는 사람에 붙는다 · 돌아오면 되찾는다 · 이긴 라운드는 그 자리에서 준다.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const io = require('socket.io-client');
const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
const acc = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 대회는 소켓이 아니라 사람에 붙는다');
{
  ok('열쇠가 토큰·기기id 다', /const stourOwner = \(socket\) => socket\.token \|\| socket\.pid \|\| socket\.id;/.test(srv));
  ok('끊긴다고 지우지 않는다', !/socket\.on\('disconnect'[\s\S]{0,200}sTours\.delete/.test(srv));
  ok('되찾는 통로가 있다', /socket\.on\('stour_resume'/.test(srv));
  ok('오래된 것은 걷어 간다', /now - \(t\.at \|\| 0\) > STOUR_KEEP_MS/.test(srv));
  ok('대회 시작 때 기기id 를 받는다', /socket\.on\('stour_start', \(\{ diff, nick, pid \}/.test(srv));
  // 자리 열쇠도 사람이어야 한다 — 소켓으로 잡으면 되찾아도 내 자리를 못 찾는다
  ok('대진표 자리도 사람으로 잡는다', /entrants = \[\{ key: own,/.test(srv));
}

console.log('② 이긴 라운드는 그 자리에서 준다');
{
  ok('라운드 보상이 있다', /out0\.roundPrize = step;/.test(srv));
  ok('상금표의 15% 다', /STOUR_PRIZE\[t\.diff\] \|\| 0\) \* 0\.15/.test(srv));
  ok('같은 라운드를 두 번 못 받는다', /t\.id \+ ':r' \+ mark\.round/.test(srv));
  ok('졌으면 안 준다', /if \(iWon && !t\.b\.over\)/.test(srv));
  // 한 대회에서 세 번 부르므로 참가 횟수를 올리면 칭호가 어긋난다
  ok('참가 횟수는 안 올린다', /function tourPrize\(token, tourId, rank, amount, noStat\)/.test(acc)
     && /accounts\.tourPrize\(t\.token, t\.id \+ ':r' \+ mark\.round, 0, step, true\)/.test(srv));
}

console.log('③ 화면도 대회를 놓지 않는다');
{
  ok('하던 대회를 적어 둔다', /localStorage\.setItem\('ff_stour', '1'\)/.test(cli));
  ok('접속하면 되찾는다', /socket\.emit\('stour_resume', \{ pid: PID \}\)/.test(cli));
  ok('대진표로 돌아가는 길이 있다', /window\.stourBackToBracket = function/.test(cli));
  ok('그 길은 새로고침을 안 한다', !/stourBackToBracket = function[\s\S]{0,600}fastReload/.test(cli));
  ok('결과창은 대진표 버튼만 남긴다', /function stourOnlyBackBtn\(goBtns\)/.test(cli));
  ok('2인전 결과창에 걸려 있다', /if \(isStourMatch && goBtns\) \{/.test(cli));
  ok('트웰브 결과창에도 걸려 있다', /if \(isStourMatch && btns\) stourOnlyBackBtn\(btns\);/.test(cli));
  ok('대회를 접으면 표시도 지운다', /stourGiveUp = function[\s\S]{0,300}removeItem\('ff_stour'\)/.test(cli));
}

console.log('④ 진짜로 끊고 다시 붙어 본다');
(async () => {
  const PORT = 39461;
  const dir = '/tmp/ffstour';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json' },
  });
  const URL = 'http://localhost:' + PORT;
  const nap = (ms) => new Promise(r => setTimeout(r, ms));
  const connect = () => new Promise((res, rej) => {
    const sk = io(URL, { transports: ['websocket'], forceNew: true });
    const t = setTimeout(() => rej(new Error('연결 실패')), 15000);
    sk.on('connect', () => { clearTimeout(t); res(sk); });
  });
  const once = (sk, ev, ms = 10000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('타임아웃: ' + ev)), ms);
    sk.once(ev, (d) => { clearTimeout(t); res(d); });
  });

  try {
    for (let i = 0; i < 60; i++) { try { await connect().then(s => s.close()); break; } catch (_) { await nap(300); } }
    const PID = 'pid-' + Math.random().toString(36).slice(2, 9);

    let sk = await connect();
    sk.emit('stour_start', { diff: 'hard', nick: '시험', pid: PID });
    const first = await once(sk, 'stour_state');
    ok('대회가 열린다', !!first && Array.isArray(first.seats) && first.seats.length === 8,
       first && first.seats ? first.seats.length + '자리' : '(없음)');

    // ★ 새로고침 흉내 — 예전엔 여기서 대회가 사라졌다
    sk.close();
    await nap(400);
    sk = await connect();
    sk.emit('stour_resume', { pid: PID });
    const back = await once(sk, 'stour_state', 8000).catch(() => null);
    ok('끊었다 다시 붙어도 대회가 그대로 있다', !!back && back.seats && back.seats.length === 8);
    ok('내 자리도 그대로다', !!back && back.me === first.me, back ? back.me + ' vs ' + first.me : '');
    ok('난이도·상금도 그대로다', !!back && back.diff === 'hard' && back.prize === first.prize);

    // 남남의 기기id 로는 남의 대회가 안 보인다
    const sk2 = await connect();
    sk2.emit('stour_resume', { pid: 'pid-남의것' });
    const none = await Promise.race([
      once(sk2, 'stour_none', 5000).then(() => 'none'),
      once(sk2, 'stour_state', 5000).then(() => 'state'),
    ]).catch(() => 'timeout');
    ok('남의 대회는 안 보인다', none === 'none', none);
    sk2.close();

    // 접었으면 되찾히지 않아야 한다
    sk.emit('stour_quit');
    await nap(300);
    sk.emit('stour_resume', { pid: PID });
    const after = await Promise.race([
      once(sk, 'stour_none', 5000).then(() => 'none'),
      once(sk, 'stour_state', 5000).then(() => 'state'),
    ]).catch(() => 'timeout');
    ok('접은 대회는 안 돌아온다', after === 'none', after);
    sk.close();
  } catch (e) {
    ok('끊고 다시 붙기', false, e.message);
  } finally {
    sv.kill();
  }

  console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
  process.exit(fail ? 1 : 0);
})();
