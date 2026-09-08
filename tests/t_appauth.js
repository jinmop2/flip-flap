// 앱에서 소셜 로그인이 돌아올 수 있는가.
// 웹뷰에서 그냥 이동시키면 구글이 막고(disallowed_useragent), 통과해도 앱
// 껍데기를 벗어나 토큰을 못 받는다. 그 길이 제대로 나 있는지 본다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const srv = fs.readFileSync(src + '/server.js', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const nat = fs.readFileSync(src + '/public/native.js', 'utf8');
const htm = fs.readFileSync(src + '/public/index.html', 'utf8');
const man = fs.readFileSync(src + '/android/app/src/main/AndroidManifest.xml', 'utf8');
const gradle = fs.readFileSync(src + '/android/app/build.gradle', 'utf8');
const ignore = fs.readFileSync(src + '/.gitignore', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

console.log('① 앱에서 시작했다는 표시가 왕복하는가');
ok('구글은 state 에 싣는다', /p\.set\('state', 'app'\)/.test(srv));
ok('카카오도 state 에 싣는다', /state=app/.test(srv));
ok('콜백이 그 표시를 본다', /String\(req\.query\.state \|\| ''\) === 'app'/.test(srv));
ok('앱이면 앱 주소로 돌려보낸다', /\$\{APP_SCHEME\}:\/\/auth\$\{hash\}/.test(srv));
ok('웹은 예전 그대로', /: `\/\$\{hash\}`/.test(srv));
// 돌아가는 자리를 하나라도 빠뜨리면 그 경로만 앱에서 죽는다
{
  const from = srv.indexOf("app.get('/auth/google'");
  const seg = srv.slice(from, srv.indexOf("app.post('/api/admin", from) > 0 ? srv.indexOf("app.post('/api/admin", from) : from + 6000);
  const bare = seg.match(/res\.redirect\('\/#/g) || [];
  ok('되돌아가는 자리가 하나도 안 남았다', bare.length === 0, bare.length + '곳 남음');
  ok('토큰도 오류도 같은 길로', (seg.match(/authBack\(req,/g) || []).length >= 10);
}

console.log('\n② 앱이 브라우저를 열고 받는가');
ok('시스템 브라우저로 연다', /Browser\.open\(\{ url: \(window\.FF_BASE \|\| ''\) \+ '\/auth\/' \+ provider \+ '\?app=1' \}\)/.test(nat));
ok('돌아온 주소를 듣는다', /App\.addListener\('appUrlOpen'/.test(nat));
ok('받으면 브라우저를 닫는다', /Browser\.close\(\)/.test(nat));
ok('웹에서는 아무것도 안 한다', /if \(!native \|\| !Browser\) return false;/.test(nat));

console.log('\n③ 화면이 한 곳을 거치는가');
ok('버튼이 socialLogin 을 부른다',
   /onclick="socialLogin\('google'\)"/.test(htm) && /onclick="socialLogin\('kakao'\)"/.test(htm));
ok('예전처럼 바로 이동하는 버튼이 없다', !/location\.href='\/auth\//.test(htm));
ok('앱이 맡으면 웹 이동은 안 한다', /if \(window\.FF && FF\.login && FF\.login\(provider\)\) return;/.test(cli));
ok('돌아온 토큰을 읽는 자리가 따로 있다', /window\.FF\.onAuthReturn = readAuthHash/.test(cli));
ok('읽고 나서 소켓에 다시 알린다', /readAuthHash[\s\S]{0,700}socket\.emit\('auth'/.test(cli));

console.log('\n④ 안드로이드가 그 주소를 잡는가');
ok('걸림쇠가 있다', /android:scheme="com\.mongdung\.flipflap" android:host="auth"/.test(man));
ok('브라우저에서 열 수 있게 표시', /android\.intent\.category\.BROWSABLE/.test(man));
ok('AdMob 앱 ID 가 있다', /com\.google\.android\.gms\.ads\.APPLICATION_ID/.test(man));

console.log('\n⑤ 서명 — 비밀번호가 저장소에 없는가');
ok('열쇠 설정을 밖에서 읽는다', /keystore\.properties/.test(gradle));
ok('환경변수로도 준다', /System\.getenv\('FF_KEYSTORE_PASSWORD'\)/.test(gradle));
ok('값이 없으면 서명 설정을 안 만든다', /if \(canSign\)/.test(gradle));
ok('비밀번호 파일은 커밋 안 된다', /android\/keystore\.properties/.test(ignore));
ok('저장소에 비밀번호가 없다', !fs.existsSync(src + '/android/keystore.properties'));
ok('판 번호가 TWA(4)보다 크다', /versionCode 5/.test(gradle));

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
