// 안드로이드 뒤로가기 — 앱이 통째로 꺼지지 않는가.
//
// 이 게임은 창을 history 에 쌓지 않는다(모달을 pushState 로 열지 않는다).
// 그래서 웹뷰에는 돌아갈 자리가 없고, 손대지 않으면 Capacitor 가 앱을 닫는다
// — 판 도중에도 그렇다. 폰에는 ESC 키가 없으니 창을 닫는 길도 × 하나뿐이었다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const nat = fs.readFileSync(src + '/public/native.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('① 닫는 일이 한 곳에 모였다');
ok('맨 위 것을 닫는 함수가 있다', /window\.closeTopLayer = function \(\)/.test(cli));
ok('닫았는지 알려 준다', /if \(!close\) return false;[\s\S]{0,40}return true;/.test(cli));
ok('ESC 도 그것을 쓴다', /if \(e\.key !== 'Escape'\) return;\s*\n\s*if \(window\.closeTopLayer\(\)\) e\.preventDefault\(\);/.test(cli));
// ESC 안에만 있던 시절로 돌아가면 폰에서 창을 닫을 길이 다시 사라진다
ok('ESC 안에 목록이 다시 들어가지 않았다',
   !/keydown[\s\S]{0,200}for \(const \[id, fn\] of ESC_TARGETS\)/.test(cli));

console.log('\n② 뒤로가기가 그 길을 탄다');
ok('뒤로가기를 듣는다', /App\.addListener\('backButton'/.test(nat));
ok('창이 열려 있으면 그것부터', /if \(window\.closeTopLayer && window\.closeTopLayer\(\)\) return;/.test(nat));
// 판 도중에 뒤로가기 한 번으로 나가면 같이 두던 사람들에게도 손해다
ok('판 안에서는 안 끈다', /classList\.contains\('ingame'\)[\s\S]{0,260}return;/.test(nat));
ok('로비에서 두 번 눌러야 끝난다', /now - exitArmed < 2000[\s\S]{0,40}App\.exitApp\(\)/.test(nat));
ok('한 번 눌렀을 때 알려 준다', /한 번 더 누르면 종료/.test(nat));
ok('웹에서는 아무것도 안 건다', /if \(native && App\) \{/.test(nat));

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
