// 이모트가 상대에게 실제로 건너가는가.
//
// 다인전에는 중계가 아예 없었다 — server.js 의 처리기는 2인전 방(socket.roomId)
// 만 보므로, 다인전에서는 보낸 사람만 자기 것을 보고 아무에게도 가지 않았다.
// 화면에는 자기 이모트가 뜨니 "보내진 것처럼" 보였고, 그래서 "적용이 안 된다" 로
// 읽혔다. 여기서는 정말 건너가는지만 본다.
const io = require('socket.io-client');
const fs = require('fs'), path = require('path');
const URL = 'http://127.0.0.1:3000';
let n = 0, bad = 0;
const ok = (m, c, x) => { n++; if (c) console.log('  ✓ ' + m); else { bad++; console.log('  ✗ ' + m + (x !== undefined ? ' — ' + x : '')); } };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (sk, ev, ms = 6000) => new Promise((res) => {
  const t = setTimeout(() => { sk.off(ev, h); res(null); }, ms);
  const h = (d) => { clearTimeout(t); sk.off(ev, h); res(d || {}); };
  sk.on(ev, h);
});

(async () => {
  console.log('① 다인전에서 이모트가 건너간다');
  const A = io(URL, { transports: ['websocket'] });
  const B = io(URL, { transports: ['websocket'] });
  await Promise.all([wait(A, 'connect'), wait(B, 'connect')]);

  A.emit('g4_quick', { nick: '가' });
  await nap(400);
  B.emit('g4_quick', { nick: '나' });
  await nap(600);
  // 듣기부터 걸어 둔다. 보낸 뒤에 걸면 먼저 도착한 쪽을 놓친다.
  const pA = wait(A, 'g4_begin', 8000), pB = wait(B, 'g4_begin', 8000);
  A.emit('g4_startnow');
  const [begunA, begunB] = await Promise.all([pA, pB]);
  ok('둘 다 판에 들어갔다', !!begunA && !!begunB, `A=${!!begunA} B=${!!begunB}`);

  const got = wait(B, 'emote', 4000);
  A.emit('emote', { emoji: '🎉' });
  const e = await got;
  ok('상대에게 도착한다', !!e && e.emoji === '🎉', e ? JSON.stringify(e) : '안 옴');
  ok('누가 보냈는지 같이 온다', !!e && typeof e.seat === 'number', e ? String(e.seat) : '-');

  // 3초 쿨타임 — 도배 방지
  const got2 = wait(B, 'emote', 1200);
  A.emit('emote', { emoji: '👑' });
  ok('3초 안에 또 보내면 안 간다', (await got2) === null);

  // 보낸 사람에게는 되돌아오지 않는다(화면이 이미 자기 것을 띄웠다)
  const back = wait(A, 'emote', 1200);
  B.emit('emote', { emoji: '🐶' });
  ok('보낸 사람에게 되돌아오지 않는다', (await wait(B, 'emote', 800)) === null);
  ok('다른 사람에게는 간다', (await back) !== null);

  A.close(); B.close();

  console.log('\n② 코드가 제자리에 있다');
  const s4 = fs.readFileSync(path.join(__dirname, '..', 'server4.js'), 'utf8');
  const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');
  ok('다인전에 중계가 있다', /safe\(socket, 'emote'/.test(s4));
  ok('다인전 자리가 아니면 손대지 않는다', /const r = rooms4\[socket\.g4room\];\s*\n\s*if \(!r \|\| r\.dead\) return;/.test(s4));
  ok('쿨타임 자리는 2인전과 같다', /socket\.lastEmote/.test(s4));
  // 프로필이 바뀌는 자리가 스무 곳 넘는다 — 한 곳이 빠뜨리면 산 이모트가 안 보인다
  ok('이모트 칸은 열 때마다 다시 그린다',
     /if \(show\) \{ try \{ refreshEmotes\(\); \} catch \(_\) \{\} \}/.test(cli));
  ok('프로필이 바뀌어도 다시 그린다', /try \{ refreshEmotes\(\); \} catch \(_\) \{\}\n\}/.test(cli));

  console.log('\n' + (bad ? 'FAIL ' + bad + '/' + n : 'OK ' + n + '개'));
  process.exit(bad ? 1 : 0);
})();
