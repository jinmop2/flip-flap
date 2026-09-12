// 다인전 방이 들고 있는 IP.
//
// 같은 곳에서 온 사람들끼리 이겨 주고 져 주며 RP 를 모으는 걸 막아야 한다.
// 그러려면 "같은 곳인가" 만 알면 되는데, 예전에는 좌석에 IP 원본을 그대로
// 담아 뒀다. 견주는 데 필요 없는 것을 들고 있는 것은 그냥 개인정보 보관이다.
// 처리방침에도 "접속 IP는 원문 대신 되돌릴 수 없는 해시로만 남깁니다" 라고
// 적어 두었으니, 코드가 그 말과 같아야 한다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(src, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

const s4 = R('server4.js');

console.log('① 좌석에 원본을 안 담는다');
{
  ok('자리에 앉을 때 지문으로 바꾼다', /p\.seats\[i\] = \{[^}]*ip: ipTag\(socket\.clientIp\)/.test(s4));
  ok('판을 짤 때도 그렇다', /ip: ipTag\(sk && sk\.clientIp\)/.test(s4));
  // clientIp 원본이 좌석으로 새어 들어가는 길이 남아 있으면 안 된다
  ok('원본을 그대로 넣는 자리가 없다', !/ip: [^,\n]*clientIp \|\| null/.test(s4));
}

console.log('\n② 지문은 견주기에 쓸 수 있어야 한다');
{
  process.env.FF_DATA_FILE = path.join(require('node:os').tmpdir(), 'ff_seatip_' + Date.now() + '.json');
  const a = require(path.join(src, 'accounts.js'));
  ok('내보내고 있다', typeof a.ipTag === 'function');
  const x = a.ipTag('203.0.113.7'), y = a.ipTag('203.0.113.7'), z = a.ipTag('198.51.100.9');
  ok('같은 곳은 같은 지문', !!x && x === y, `${x} / ${y}`);
  ok('다른 곳은 다른 지문', x !== z, `${x} / ${z}`);
  ok('원문이 안 보인다', !!x && !x.includes('203') && !x.includes('113'), x);
  ok('알 수 없는 곳은 지문도 없다', a.ipTag('') === null && a.ipTag('x') === null);
}

console.log('\n③ 파밍 막이가 그대로다');
{
  ok('사람 자리끼리 견준다', /const ips = humans\.map\(\(i\) => r\.seats\[i\]\.ip\)\.filter\(Boolean\)/.test(s4));
  ok('겹치면 RP 를 안 준다', /if \(new Set\(ips\)\.size !== ips\.length\) \{[^}]*return; \}/.test(s4));
  // 로그인한 자리만 센다 — AI 와 붙어서는 RP 가 안 오른다
  ok('AI 대전으로는 RP 가 없다', /if \(humans\.length < 2\)/.test(s4));
}

console.log('\n④ 처리방침이 그렇게 적혀 있다');
ok('원문 대신 해시라고 적었다', /접속 IP는 <b>원문 대신 되돌릴 수 없는 해시<\/b>로만 남깁니다/.test(R('privacy.html')));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
