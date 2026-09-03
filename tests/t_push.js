// 알림 — 앱을 안 보고 있을 때 도전장을 알린다.
//
// 새 통로라 방어를 먼저 본다. 구독 정보는 화면이 보내는 값이고, 알림 본문에는
// 사람이 쓴 닉네임이 들어간다 — 둘 다 그대로 믿으면 안 된다.
//
//   · 키(VAPID)가 없으면 통째로 꺼진 채로 돈다 — 없다고 서버가 죽으면 안 된다.
//   · 구독은 https 여야 하고 열쇠 두 개가 다 있어야 한다.
//   · 기기 수에 상한이 있다 — 없으면 한 계정이 무한히 쌓는다.
//   · 서비스워커는 서버가 보낸 글자를 잘라 쓰고, 여는 주소는 우리 것만 쓴다.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const acc = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
const sw  = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  ' + x : ''))); };

console.log('① 키가 없어도 서버는 돈다');
{
  ok('키는 환경변수에서만', /process\.env\.VAPID_PUBLIC/.test(srv) && /process\.env\.VAPID_PRIVATE/.test(srv));
  ok('저장소에 키가 없다', !/BM[A-Za-z0-9_-]{80,}/.test(srv) && !/BM[A-Za-z0-9_-]{80,}/.test(cli));
  ok('키가 없으면 꺼진다', /const PUSH_ON = !!\(VAPID_PUB && VAPID_KEY\)/.test(srv));
  ok('꺼진 채로도 경로는 답한다', /app\.get\('\/api\/push-key'/.test(srv));
}

console.log('\n② 구독 정보를 안 믿는다');
{
  ok('https 만 받는다', /startsWith\('https:\/\/'\)/.test(acc));
  ok('열쇠 두 개를 확인한다', /keys\.p256dh !== 'string' \|\| typeof sub\.keys\.auth !== 'string'/.test(acc));
  ok('필요한 것만 골라 담는다', /const clean = \{ endpoint: sub\.endpoint\.slice/.test(acc));
  ok('길이를 자른다', /\.slice\(0, 500\)/.test(acc) && /\.slice\(0, 200\)/.test(acc));
  ok('기기 수에 상한이 있다', /const PUSH_MAX = \d+/.test(acc) && /while \(u\.push\.length > PUSH_MAX\) u\.push\.shift\(\)/.test(acc));
  ok('로그인해야 한다', /pushSave\(token, sub\) \{[\s\S]{0,120}로그인이 필요해요/.test(acc));
}

console.log('\n③ 죽은 구독은 지운다');
{
  ok('410·404 면 잊는다', /code === 410 \|\| code === 404/.test(srv) && /pushForget/.test(srv));
  ok('보내다 죽어도 서버는 안 죽는다', /pushTo\(idl, \{ kind: 'challenge'[\s\S]{0,120}\.catch\(\(\) => \{\}\)/.test(srv));
}

console.log('\n④ 서비스워커도 보낸 값을 안 믿는다');
{
  ok('글자를 자른다', /const cut = \(s, n\) =>/.test(sw) && /cut\(d\.from, 20\)/.test(sw));
  ok('방 번호 모양을 본다', /\/\^\[A-Za-z0-9_-\]\{1,24\}\$\/\.test\(d\.roomId\)/.test(sw));
  ok('우리 주소로만 연다', /url\.origin !== self\.location\.origin\) return/.test(sw));
  ok('무슨 말인지 모르면 안 띄운다', /if \(!body\) return;/.test(sw));
  ok('누르면 여는 자리가 있다', /addEventListener\('notificationclick'/.test(sw));
}

console.log('\n⑤ 화면 — 켤 수 없는 자리에서는 안 보여 준다');
{
  ok('권한은 사람이 누른 자리에서 묻는다', /window\.togglePush = async function[\s\S]{0,900}Notification\.requestPermission\(\)/.test(cli));
  ok('아이폰은 홈 화면에 추가해야 한다', /isIOS\(\) && !standalone\(\)/.test(cli) && /needHome: true/.test(cli));
  ok('왜 못 켜는지 알려 준다', /id="spPushNote"/.test(htm) && /홈 화면에 추가<\/b>한 뒤에 켤 수 있어요/.test(htm));
  ok('못 쓰는 기기에서는 줄을 감춘다', /row\.style\.display = st\.can \? '' : 'none'/.test(cli));
}

console.log('\n⑥ 진짜로 돌려 본다');
(async () => {
  const PORT = 3199;
  const tmp = path.join(require('os').tmpdir(), 'ff-push-' + Date.now() + '.json');
  const keys = require(path.join(root, 'node_modules/web-push')).generateVAPIDKeys();
  const srvp = spawn('node', ['server.js'], { cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: tmp,
           VAPID_PUBLIC: keys.publicKey, VAPID_PRIVATE: keys.privateKey } });
  const base = 'http://127.0.0.1:' + PORT;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b) }).then((r) => r.json());
  for (let i = 0; i < 100; i++) {
    try { await fetch(base + '/health'); break; } catch (_) { await new Promise((r) => setTimeout(r, 120)); }
  }
  try {
    const key = await fetch(base + '/api/push-key').then((r) => r.json());
    ok('키를 내려 준다', key.key === keys.publicKey);

    const me = await post('/api/signup', { id: 'pt' + Date.now(), password: 'testpw1234', nick: '알림' + (Date.now() % 1000) });
    ok('계정이 만들어진다', !!me.token, me.error);
    const T = me.token;
    const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/aaa', keys: { p256dh: 'BK', auth: 't' } };

    ok('빈 구독은 거절', !!(await post('/api/push-on', { token: T, sub: {} })).error);
    ok('http 주소는 거절', !!(await post('/api/push-on', { token: T, sub: { ...good, endpoint: 'http://x.example/a' } })).error);
    ok('열쇠 없으면 거절', !!(await post('/api/push-on', { token: T, sub: { endpoint: good.endpoint } })).error);
    ok('로그인 없이는 거절', !!(await post('/api/push-on', { sub: good })).error);

    const on = await post('/api/push-on', { token: T, sub: good });
    ok('제대로 된 것은 받는다', on.ok === true && on.count === 1, JSON.stringify(on));

    // 같은 기기를 다시 켜도 두 개가 되면 안 된다
    const again = await post('/api/push-on', { token: T, sub: good });
    ok('같은 기기는 하나로', again.count === 1, String(again.count));

    let last = null;
    for (let i = 0; i < 8; i++) {
      last = await post('/api/push-on', { token: T,
        sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/d' + i, keys: good.keys } });
    }
    ok('기기 수가 상한을 안 넘는다', last.count === 5, String(last.count));

    const off = await post('/api/push-off', { token: T, endpoint: 'https://fcm.googleapis.com/fcm/send/d7' });
    ok('끄면 줄어든다', off.count === 4, String(off.count));
  } finally {
    srvp.kill();
    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  console.log('');
  if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
  console.log(`✓ 전부 통과 (${pass}/${pass})`);
})();
