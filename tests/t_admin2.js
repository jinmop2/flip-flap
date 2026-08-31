// 운영(관리자) — 권한이 새지 않는가, 조치가 실제로 먹는가, 남는가.
//
// 관리자 기능은 두 가지가 동시에 참이어야 한다.
//   ① 키 없이는 아무것도 안 된다. 하나라도 새면 나머지 방어가 다 무의미하다.
//   ② 조치가 실제로 먹어야 한다. 정지했는데 계속 놀 수 있으면 없는 기능이다.
// 그리고 되돌릴 수 있어야 하고, 누가 무엇을 했는지 남아야 한다.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const acc = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 모든 운영 통로가 키를 본다');
{
  // /api/admin/* 을 전부 뽑아 adminOk 가 있는지 하나씩 본다.
  const blocks = srv.split(/app\.post\('\/api\/admin\//).slice(1);
  const bad = [];
  for (const b of blocks) {
    const name = (b.match(/^([\w-]+)/) || [])[1] || '?';
    const body = b.slice(0, 400);
    if (!/adminOk\(req, res\)/.test(body)) bad.push(name);
  }
  ok('운영 통로 ' + blocks.length + '개가 전부 키를 본다', bad.length === 0, '안 보는 것: ' + bad.join(' '));
  ok('키는 본문으로만 받는다', /!keyEq\(req\.body\.key, KEY\)/.test(srv) && !/req\.query\.key[\s\S]{0,80}ADMIN_KEY/.test(srv));
  ok('키 비교는 상수 시간', /crypto\.timingSafeEqual/.test(srv));
  // 관리자 화면은 키를 주소에 싣지 않는다 (히스토리·리퍼러·로그에 남는다)
  ok('화면이 키를 주소에 안 싣는다', !/\?key=/.test(page) && /body:JSON\.stringify\(\{\.\.\.body,key:key\(\)\}\)/.test(page));
  ok('화면에 캐시·리퍼러를 막는다', /app\.get\('\/admin'[\s\S]{0,400}Referrer-Policy[\s\S]{0,200}no-store/.test(srv));
}

console.log('② 내보내면 안 되는 것은 안 내보낸다');
{
  // 관리자 화면이라도 비번 해시·소금·토큰이 오갈 이유가 없다
  const block = acc.match(/function adminUser\(idl\)[\s\S]*?\n\}/)[0];
  for (const k of ['hash', 'salt', 'token', 'tempHash', 'tempSalt'])
    ok('adminUser 가 ' + k + ' 를 안 준다', !new RegExp('\\b' + k + '\\b').test(block));
  // IP 는 원본이 아니라 지문만
  ok('IP 는 지문만 준다', /ipt: u\.ipt \|\| null/.test(block));
}

console.log('③ 조치가 되돌려지고 남는다');
{
  ok('정지에 기간이 있다', /u\.ban = \{ at: Date\.now\(\), until: d \? Date\.now\(\) \+ d \* 86400000 : 0/.test(acc));
  ok('기간이 지나면 저절로 풀린다', /if \(u\.ban\.until && Date\.now\(\) > u\.ban\.until\) return null;/.test(acc));
  ok('푸는 길이 있다', /function adminUnban/.test(acc) && /function adminUnmute/.test(acc));
  ok('되돌릴 수 없는 것(계정 삭제)은 운영 통로에 없다', !/\/api\/admin\/delete/.test(srv));
  ok('무엇을 했는지 남긴다', /function adminLog\(action, target, detail\)/.test(acc));
  for (const a of ['ban', 'unban', 'mute', 'unmute', 'coins', 'notice', 'notice_all'])
    ok("'" + a + "' 이 기록에 남는다", new RegExp("adminLog\\('" + a + "'").test(acc));
  ok('기록이 무한히 쌓이지 않는다', /ADMIN_LOG_KEEP/.test(acc));
}

console.log('④ 정지가 실제로 먹는다 (서버를 띄워 확인)');
(async () => {
  const PORT = 39481;
  const dir = '/tmp/ffadmin';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const KEY = require('crypto').randomBytes(24).toString('hex');
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json', ADMIN_KEY: KEY },
  });
  const URL = 'http://localhost:' + PORT;
  const post = async (p, b) => {
    const r = await fetch(URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return r.json();
  };
  const adm = (p, b) => post(p, { ...b, key: KEY });
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    for (let i = 0; i < 80; i++) { try { await fetch(URL + '/health'); break; } catch (_) { await nap(300); } }

    const a = await post('/api/signup', { id: 'admtest1', password: 'pw1234', nick: '운영시험' });
    ok('시험 계정을 만들었다', !!a.token, a.error);

    // 키 없이는 아무것도 안 된다
    const noKey = await post('/api/admin/users', { q: 'adm' });
    ok('키 없이는 못 본다', !!noKey.error && !noKey.list);
    const wrongKey = await post('/api/admin/users', { q: 'adm', key: 'x'.repeat(48) });
    ok('틀린 키로도 못 본다', !!wrongKey.error);

    const found = await adm('/api/admin/users', { q: 'admtest' });
    ok('찾힌다', (found.list || []).some((u) => u.id === 'admtest1'));

    const before = await adm('/api/admin/user', { idl: 'admtest1' });
    ok('코인이 보인다', before.profile && typeof before.profile.coins === 'number');

    const c = await adm('/api/admin/coins', { idl: 'admtest1', delta: 300, memo: '시험' });
    ok('코인을 조정한다', c.ok && c.coins === before.profile.coins + 300, JSON.stringify(c));

    await adm('/api/admin/notice', { idl: 'admtest1', text: '시험 쪽지' });
    const inbox = await post('/api/notices', { token: a.token });
    ok('본인이 쪽지를 받는다', (inbox.list || []).some((x) => x.text === '시험 쪽지'));
    await post('/api/notices-read', { token: a.token });
    const inbox2 = await post('/api/notices', { token: a.token });
    ok('읽으면 다시 안 뜬다', (inbox2.list || []).length === 0);

    const b = await adm('/api/admin/ban', { idl: 'admtest1', days: 1, reason: '시험' });
    ok('정지된다', b.ok);
    const login = await post('/api/login', { id: 'admtest1', password: 'pw1234' });
    ok('정지 중에는 못 들어온다', !!login.error && /제한/.test(login.error), JSON.stringify(login).slice(0, 90));
    ok('왜 막혔는지 알려 준다', /시험/.test(login.error || ''));
    // 정지하면 쓰던 토큰도 끊긴다 — 켜 둔 창에서 계속 놀지 못하게
    const me = await post('/api/me', { token: a.token });
    ok('쓰던 토큰도 끊긴다', !me.ok);

    const ub = await adm('/api/admin/unban', { idl: 'admtest1' });
    ok('풀린다', ub.ok);
    const login2 = await post('/api/login', { id: 'admtest1', password: 'pw1234' });
    ok('풀면 다시 들어온다', !!login2.ok, JSON.stringify(login2).slice(0, 80));

    // 재갈 — 판은 두게 두고 말만 막는다
    await adm('/api/admin/mute', { idl: 'admtest1', days: 1, reason: '도배' });
    const detail = await adm('/api/admin/user', { idl: 'admtest1' });
    ok('재갈이 걸린다', !!(detail.admin && detail.admin.mute));
    ok('재갈은 정지가 아니다', !(detail.admin && detail.admin.ban));

    const ov = await adm('/api/admin/overview', {});
    ok('한눈 요약이 나온다', ov.ok && typeof ov.users === 'number' && !!ov.live && Array.isArray(ov.days));
    ok('접속·방 수가 들어 있다', typeof ov.live.online === 'number' && typeof ov.live.rooms === 'number');

    const log = await adm('/api/admin/log', {});
    const acts = (log.list || []).map((x) => x.action);
    ok('한 일이 전부 남았다', ['mute', 'unban', 'ban', 'notice', 'coins'].every((x) => acts.includes(x)), acts.join(' '));

    const html = await (await fetch(URL + '/admin')).text();
    ok('운영 화면이 뜬다', /FLIP FLAP 운영/.test(html) && /대시보드/.test(html));
  } catch (e) {
    ok('서버를 띄워 확인', false, e.message);
  } finally {
    sv.kill();
  }

  console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
  process.exit(fail ? 1 : 0);
})();
