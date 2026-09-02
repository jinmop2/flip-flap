// 보너스 — 지금은 무료, 나중에 광고.
//
// 코인을 새로 찍어내는 통로라 방어가 촘촘해야 한다. 여기가 새면
// 다른 방어(상점 락·초대 IP·서버 계산)가 다 무의미해진다.
//
//   · 금액도 횟수도 서버가 정한다. 화면은 표를 받아 돌려줄 뿐이다.
//   · 표는 일회용이고, 남의 표는 안 통하고, 시간이 지나면 상한다.
//   · 한도는 표를 낼 때가 아니라 줄 때 다시 본다 — 표를 여러 장 받아 두는 것 방지.
//   · 광고 모드에서는 최소 시간을 안 채우면 거절한다(안 본 것이다).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const acc = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 서버가 금액과 횟수를 쥔다');
{
  ok('금액표가 서버에 있다', /const BONUS = AD_MODE/.test(acc));
  ok('화면이 금액을 못 보낸다',
     !/bonusClaim\(token, ticket, (amount|coins)/.test(acc)
     && /bonusClaim\(token, ticket\)/.test(acc));
  ok('라우트도 표만 받는다', /const \{ token, ticket \} = req\.body \|\| \{\}; res\.json\(accounts\.bonusClaim\(token, ticket\)\)/.test(srv));
  ok('광고 여부는 환경변수', /process\.env\.AD_MODE === 'ad'/.test(acc));
}

console.log('② 표가 새지 않는다');
{
  ok('표는 무작위로 만든다', /crypto\.randomBytes\(18\)\.toString\('hex'\)/.test(acc));
  ok('한 번 쓰면 지운다', /bonusTickets\.delete\(ticket\);\s*\/\/ 한 장은 한 번만/.test(acc));
  ok('남의 표는 안 통한다', /if \(e\.idl !== idl\) return \{ error/.test(acc));
  ok('시간이 지나면 상한다', /now - e\.at > BONUS_TICKET_TTL/.test(acc));
  ok('날이 바뀌면 못 쓴다', /e\.day !== kstDayIndex\(\)/.test(acc));
  ok('표가 쌓이지 않게 걷는다', /bonusTickets\.size > 2000/.test(acc));
  ok('한도는 줄 때 다시 본다', /\/\/ 한도는 표를 낼 때가 아니라 줄 때 다시 본다/.test(acc));
  ok('재진입 락이 있다', /const bonusLocks = new Set\(\)/.test(acc) && /bonusLocks\.add\(idl\)/.test(acc)
     && /finally \{ bonusLocks\.delete\(idl\); \}/.test(acc));
  ok('광고 모드는 최소 시간을 본다', /if \(BONUS\.minSec && now - e\.at < BONUS\.minSec \* 1000\)/.test(acc));
}

console.log('③ 화면은 표를 나르기만 한다');
{
  ok('상태를 물어 본다', /apiPost\('\/api\/bonus', \{ token: authToken\(\) \}\)/.test(cli));
  ok('표를 받아 돌려준다', /apiPost\('\/api\/bonus-start'/.test(cli) && /apiPost\('\/api\/bonus-claim'/.test(cli));
  ok('금액은 서버가 준 값을 쓴다', /got\.amount/.test(cli) && !/bonus-claim'[\s\S]{0,120}coins:/.test(cli));
  ok('잔액은 서버 프로필로 갈아 끼운다', /myAccount = got\.profile; renderAccount\(\);/.test(cli));
  ok('연타를 막는다', /if \(_bonusBusy\) return;/.test(cli));
  ok('남은 몫이 없으면 버튼을 감춘다', /if \(!r \|\| r\.error \|\| !r\.left\) \{ b\.style\.display = 'none'; return; \}/.test(cli));
  // 광고를 끼울 자리가 코드에 남아 있어야 나중에 헷갈리지 않는다
  ok('광고를 끼울 자리가 적혀 있다', /광고 모드면 여기서 광고를 보여 주고/.test(cli));
}

console.log('④ 진짜로 돌려 본다');
(async () => {
  const PORT = 39498;
  const dir = '/tmp/ffbonus';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), FF_DATA_FILE: dir + '/a.json' },
  });
  const URL = 'http://localhost:' + PORT;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = async (p, b) => (await fetch(URL + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })).json();

  try {
    for (let i = 0; i < 80; i++) { try { await fetch(URL + '/health'); break; } catch (_) { await nap(300); } }
    const a = await post('/api/signup', { id: 'bonus1', password: 'pw1234', nick: '보너스' });
    ok('시험 계정', !!a.token, a.error);
    const t = a.token;
    const before = (await post('/api/me', { token: t })).profile.coins;

    const st0 = await post('/api/bonus', { token: t });
    ok('상태가 나온다', st0.ok && st0.perDay > 0 && st0.left === st0.perDay, JSON.stringify(st0));

    // 하루 몫을 다 받는다
    let paid = 0;
    for (let i = 0; i < st0.perDay; i++) {
      const s = await post('/api/bonus-start', { token: t });
      if (s.error) break;
      const g = await post('/api/bonus-claim', { token: t, ticket: s.ticket });
      if (g.ok) paid += g.amount;
    }
    ok('하루 몫만큼 받는다', paid === st0.perDay * st0.coins, paid + ' vs ' + (st0.perDay * st0.coins));
    const after = (await post('/api/me', { token: t })).profile.coins;
    ok('코인이 그만큼 늘었다', after - before === paid, (after - before) + ' vs ' + paid);

    // 한도를 넘으면 표부터 안 나온다
    const over = await post('/api/bonus-start', { token: t });
    ok('한도를 넘으면 표가 안 나온다', !!over.error, JSON.stringify(over));

    // 표 하나로 두 번은 안 된다
    const b2 = await post('/api/signup', { id: 'bonus2', password: 'pw1234', nick: '둘째' });
    ok('둘째 계정이 만들어진다', !!b2.token, b2.error);
    const s2 = await post('/api/bonus-start', { token: b2.token });
    const g1 = await post('/api/bonus-claim', { token: b2.token, ticket: s2.ticket });
    const g2 = await post('/api/bonus-claim', { token: b2.token, ticket: s2.ticket });
    ok('표 하나는 한 번만', g1.ok && !!g2.error, JSON.stringify(g2));

    // 남의 표로는 못 받는다
    const b3 = await post('/api/signup', { id: 'bonus3', password: 'pw1234', nick: '셋째' });
    ok('셋째 계정이 만들어진다', !!b3.token, b3.error);
    const s3 = await post('/api/bonus-start', { token: b3.token });
    const steal = await post('/api/bonus-claim', { token: b2.token, ticket: s3.ticket });
    ok('남의 표는 안 통한다', !!steal.error, JSON.stringify(steal));

    // 지어낸 표
    const fake = await post('/api/bonus-claim', { token: b3.token, ticket: 'f'.repeat(36) });
    ok('지어낸 표도 안 통한다', !!fake.error);

    // 로그인 안 하면 아무것도 안 된다
    const anon = await post('/api/bonus-start', { token: 'nope' });
    ok('로그인해야 받는다', !!anon.error);
  } catch (e) {
    ok('돌려 보기', false, e.message);
  } finally {
    sv.kill();
  }

  console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
  process.exit(fail ? 1 : 0);
})();
