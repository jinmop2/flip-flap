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

console.log('\n③ 앱에서만 죽던 나머지');
{
  const man = fs.readFileSync(src + '/android/app/src/main/AndroidManifest.xml', 'utf8');
  const htm = fs.readFileSync(src + '/public/index.html', 'utf8');
  // 웹 매니페스트와 TWA 는 portrait 인데 앱만 안 잠겨 있었다 — 돌리면 만든 적 없는 화면이 나온다
  ok('세로로 잠근다', /android:screenOrientation="portrait"/.test(man));
  // 앱에는 서비스워커가 없어 웹푸시가 못 돈다. 그 길과 파이어베이스 길을
  // 갈라 두어야, 앱에서 없는 길로 켜려다 스위치가 멈추지 않는다.
  ok('웹푸시 길과 앱 길이 갈려 있다',
     /const webPushCan = \(\) => !!\(!window\.FF_NATIVE/.test(cli)
     && /const nativePush = \(\) => !!\(window\.FF_NATIVE && window\.FF && FF\.push\)/.test(cli));
  // ready 는 등록된 워커가 없으면 거절이 아니라 영영 안 온다 — 스위치가 조용히 죽는다
  ok('서비스워커 기다리기에 시간을 끊었다', /const swReady = \(ms = 3000\) => Promise\.race\(\[/.test(cli));
  ok('기다리는 자리마다 그것을 쓴다', !/await navigator\.serviceWorker\.ready/.test(cli));
  // 이미 앱인데 "앱으로 추가" 가 떴다 — 눌러도 아무 일이 없다
  ok('앱에서는 설치 버튼을 숨긴다', /const isStandalone = \(\) => !!window\.FF_NATIVE/.test(cli));
  // 바깥 문서·링크는 웹뷰가 덮으면 돌아올 길이 없다
  ok('바깥 링크도 시스템 브라우저로', /open\.kakao\.com[^"]*" target="_blank" rel="noopener" onclick="return openDoc\(/.test(htm));
  ok('약관·처리방침도 그렇다', (htm.match(/onclick="return openDoc\('\/(terms|privacy|rates)'\)"/g) || []).length >= 5);
}

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
