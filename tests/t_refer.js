// 초대 보상 파밍 방어 — 한 기기에서 계정을 찍어 코인을 모을 수 없어야 한다.
//
// 왜 이 시험이 있는가:
//   코인은 계정 사이를 못 넘어간다. 그래서 "여러 계정으로 번 코인을 한 계정에
//   모으는" 통로는 친구 초대 하나뿐이었다. 상한이 50회뿐이던 시절에는
//   한 기기에서 계정 50개를 만들어 자기 코드를 넣으면 5,000코인이 그대로 꽂혔다.
//   상점 최고가가 1,800이니 몇 분 만에 전설 세 개를 공짜로 가져가는 셈이다.
//
// 지켜야 할 반대편:
//   같은 집에서 형제가 들어오는 건 진짜 초대다. 그래서 "차단" 이 아니라
//   "같은 곳에서 온 초대는 첫 한 명만 인정" 이고, 초대받은 쪽 100코인은 늘 준다.
const fs = require('fs');
const dir = '/tmp/ffrefer';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
const coins = (tok) => { const u = a.byToken(tok); return u ? u.coins : null; };

console.log('① 한 기기에서 계정을 찍어 초대 보상을 모을 수 없다');
{
  const IP = '203.0.113.7';
  const boss = a.signup('farmer', 'pw1234', '농부', IP);
  const start = coins(boss.token);
  let credited = 0, blockedAt = -1;
  for (let i = 0; i < 30; i++) {
    const m = a.signup('mule' + i, 'pw1234', '허수아비' + i, IP);
    if (m.error) { blockedAt = i; break; }
    const r = a.applyReferral(m.token, 'farmer', IP);
    if (r.error) { blockedAt = i; break; }
    credited++;
  }
  const gain = coins(boss.token) - start;
  ok('같은 IP 초대는 한 번만 인정된다', a.byToken(boss.token).refCount === 1,
     '인정 ' + a.byToken(boss.token).refCount + '회');
  ok('초대자가 챙긴 코인이 100 을 넘지 않는다', gain <= 100, '실제 +' + gain);
  ok('가입 자체도 하루 상한에서 막힌다', blockedAt >= 0 && blockedAt <= 6, '막힌 지점 ' + blockedAt);
}

console.log('② 진짜 친구 초대는 그대로 받는다');
{
  const host = a.signup('host', 'pw1234', '주인', '198.51.100.1');
  const start = coins(host.token);
  for (let i = 0; i < 5; i++) {
    const g = a.signup('pal' + i, 'pw1234', '친구' + i, '198.51.100.' + (10 + i));
    a.applyReferral(g.token, 'host', '198.51.100.' + (10 + i));
  }
  ok('서로 다른 곳에서 온 5명은 5번 다 인정된다', a.byToken(host.token).refCount === 5);
  ok('초대자가 500 을 다 받는다', coins(host.token) - start === 500, '+' + (coins(host.token) - start));
}

console.log('③ 초대받은 쪽은 늘 100 을 받는다 (같은 집 형제가 손해 보면 안 된다)');
{
  const p = a.signup('parent', 'pw1234', '부모', '192.0.2.50');
  const kid1 = a.signup('kid1', 'pw1234', '첫째', '192.0.2.50');
  const kid2 = a.signup('kid2', 'pw1234', '둘째', '192.0.2.50');
  const before1 = coins(kid1.token), before2 = coins(kid2.token);
  a.applyReferral(kid1.token, 'parent', '192.0.2.50');
  a.applyReferral(kid2.token, 'parent', '192.0.2.50');
  ok('첫째도 100 을 받는다', coins(kid1.token) - before1 === 100);
  ok('둘째도 100 을 받는다', coins(kid2.token) - before2 === 100);
  ok('초대자는 첫째 몫만 받는다', a.byToken(p.token).refCount === 1);
}

console.log('④ 원래 규칙은 그대로 살아 있다');
{
  const x = a.signup('solo', 'pw1234', '혼자', '198.51.100.90');
  ok('자기 코드는 못 넣는다', !!a.applyReferral(x.token, 'solo', '198.51.100.90').error);
  ok('없는 코드는 막힌다', !!a.applyReferral(x.token, '없는사람', '198.51.100.90').error);
  const y = a.signup('twice', 'pw1234', '두번', '198.51.100.91');
  a.applyReferral(y.token, 'host', '198.51.100.91');
  ok('두 번째 초대 등록은 막힌다', !!a.applyReferral(y.token, 'solo', '198.51.100.91').error);
  ok('로그인 안 하면 막힌다', !!a.applyReferral('없는토큰', 'host', '1.2.3.4').error);
}

console.log('⑤ IP 는 원본으로 저장되지 않는다');
{
  const z = a.signup('privacy', 'pw1234', '사생활', '203.0.113.199');
  const u = a.byToken(z.token);
  const blob = JSON.stringify(u);
  ok('계정 어디에도 IP 원본이 없다', !blob.includes('203.0.113.199'), blob.slice(0, 120));
  ok('대신 지문이 남는다', typeof u.ipt === 'string' && u.ipt.length === 16);
  ok('IP 를 모르면 아무것도 막지 않는다', !!a.signup('noip', 'pw1234', '무IP').ok);
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
