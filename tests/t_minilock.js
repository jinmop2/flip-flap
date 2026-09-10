// 미니게임이 정말 잠겨 있는가.
//
// 섯다식 배팅이라 사행성 모사로 분류될 수 있어 입구를 막아 둔 모드다. 그런데
// 화면의 단추만 주석 처리하면 소켓으로 직접 부르는 길이 남는다 — 그 상태로
// 심사 서류에 "도박 요소 없음" 이라고 적으면 사실과 다른 답이 된다.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const io = require(root + '/node_modules/socket.io-client');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('① 화면에 입구가 없다');
{
  const htm = fs.readFileSync(root + '/public/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  ok('솔로 패널에 없다', !/soloPick\('mini'\)/.test(htm));
  ok('빠른 입장에 없다', !/quickJoin\('mini'\)/.test(htm));
  ok('부르는 단추가 없다', !/miniGo\(/.test(htm));
}

console.log('\n② 서버가 한 곳에서 정한다');
{
  const srv = fs.readFileSync(root + '/server.js', 'utf8');
  ok('고를 수 있는 모드를 한 곳에서 정한다', /const PICKABLE_MODES = \['classic', 'item', 'quad', 'twelve'/.test(srv));
  ok('기본은 잠김', /const MINI_ON = process\.env\.MINI_ON === '1'/.test(srv));
  // 목록을 손으로 적어 둔 자리가 남아 있으면 거기로 새어 나간다
  ok('손으로 적은 목록이 안 남았다',
     !/\['item', 'classic', 'quad', 'twelve', 'mini', 'random'\]/.test(srv)
     && !/\['classic', 'item', 'quad', 'twelve', 'mini'\]/.test(srv));
  ok('랭크·대회에도 안 들어간다',
     /RANKED_MODES = \['classic', 'item', 'twelve'\]/.test(srv)
     && /STOUR_MODES = \['classic', 'item', 'twelve'\]/.test(srv));
}

(async () => {
  console.log('\n③ 소켓으로 직접 불러도 안 열린다');
  const PORT = 39540;
  const dir = '/tmp/ffmini';
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const sv = spawn('node', ['server.js'], { cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json' } });
  await nap(1800);
  try {
    const s = io('http://localhost:' + PORT, { transports: ['websocket'], forceNew: true,
      extraHeaders: { 'X-Forwarded-For': '10.11.1.1' } });
    const seen = [];
    s.onAny((n, p) => seen.push([n, p]));
    await new Promise((r) => s.on('connect', r));
    s.emit('quick_join', { mode: 'mini', pid: 'p1', nick: '나' });
    await nap(1200);
    const err = seen.find(([n]) => n === 'error');
    ok('빠른 입장이 거절된다', !!err, JSON.stringify(seen.map(([n]) => n)));
    ok('알 수 없는 모드라고 답한다', err && /알 수 없는 모드/.test(String(err[1])), err ? String(err[1]) : '');
    const joined = seen.some(([n]) => n === 'room_joined' || n === 'game_start' || n === 'mini_state');
    ok('방이 안 열렸다', !joined, JSON.stringify(seen.map(([n]) => n)));
    s.close();
  } finally {
    sv.kill();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
