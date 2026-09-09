// 앱 알림(FCM) — 웹푸시가 못 가는 자리를 대신 가는가.
//
// 앱에는 서비스워커를 안 깐다. 웹푸시는 그 위에서만 도는 것이라 앱에서는
// 길이 아예 없었다. 파이어베이스로 따로 보내되, 화면에서는 스위치 하나로
// 보여야 하고, 설정이 없을 때는 켤 수 있는 척하면 안 된다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const src = path.join(__dirname, '..');
const srv = fs.readFileSync(src + '/server.js', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const nat = fs.readFileSync(src + '/public/native.js', 'utf8');
const acc = fs.readFileSync(src + '/accounts.js', 'utf8');
const gradle = fs.readFileSync(src + '/android/app/build.gradle', 'utf8');
const ignore = fs.readFileSync(src + '/.gitignore', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('① 설정이 없으면 조용히 꺼져 있다');
{
  delete require.cache[require.resolve(src + '/fcm.js')];
  const f = require(src + '/fcm.js');
  ok('열쇠가 없으면 안 켜진다', f.ON === false);
  ok('열쇠는 환경변수로만 받는다',
     /process\.env\.FCM_SERVICE_ACCOUNT/.test(fs.readFileSync(src + '/fcm.js', 'utf8'))
     && !fs.existsSync(src + '/service-account.json'));
  // 설정 파일이 없어도 안드로이드 빌드가 되어야 한다 — 없는 채로 플러그인을
  // 적용하면 빌드가 통째로 실패한다
  // 이 블록은 Capacitor 가 관리한다(cap sync 가 자기 것으로 덮어쓴다). 모양이
  // 바뀌어도 뜻은 하나다 — 설정 파일이 있을 때만 플러그인을 적용한다.
  ok('google-services.json 이 있을 때만 켠다',
     gradle.includes("google-services.json") && gradle.includes("apply plugin: 'com.google.gms.google-services'")
     && /try \{[\s\S]{0,200}apply plugin: 'com\.google\.gms\.google-services'[\s\S]{0,80}\} catch/.test(gradle));
  // cap sync 가 이 파일을 손대므로, 서명 설정이 쓸려 나가지 않았는지 매번 본다
  ok('cap sync 뒤에도 서명 설정이 남아 있다', /canSign/.test(gradle) && /keystore\.properties/.test(gradle));
  ok('cap sync 뒤에도 판 번호가 남아 있다', /versionCode 5/.test(gradle));
  ok('그 파일은 커밋 안 된다', /android\/app\/google-services\.json/.test(ignore));
}

console.log('\n② 서버가 두 길로 보낸다');
ok('웹과 앱을 같이 쏜다', /if \(PUSH_ON\) \{[\s\S]{0,700}if \(fcm\.ON\) \{/.test(srv));
// 앱에는 서비스워커가 없어 화면이 문구를 못 그린다 — 서버가 만들어 보내야 한다
ok('앱 몫 문구는 서버가 만든다', /function pushWords\(payload\)/.test(srv));
ok('죽은 기기 토큰은 그 자리에서 지운다', /else if \(r === 'gone'\) accounts\.fcmForget\(idl, t\)/.test(srv));
ok('켜고 끄는 길이 있다', /\/api\/fcm-on/.test(srv) && /\/api\/fcm-off/.test(srv));
ok('설정이 없으면 켜기를 거절한다', /if \(!fcm\.ON\) return res\.json\(\{ error: '지금은 알림을 켤 수 없어요\.' \}\)/.test(srv));
ok('부팅 때 꺼졌다고 알려 준다', /앱 알림 꺼짐 — FCM_SERVICE_ACCOUNT/.test(srv));

console.log('\n③ 기기 토큰을 함부로 안 받는다');
ok('길이와 모양을 본다', acc.includes('t.length < 20 || t.length > 400 ||') && acc.includes('.test(t)) return { error: \'기기 정보가 올바르지 않아요.\' }'));
ok('기기 다섯 대까지', /while \(u\.fcm\.length > PUSH_MAX\) u\.fcm\.shift\(\)/.test(acc));
ok('남의 계정 것은 못 지운다', /function fcmDrop\(token, fcmToken\) \{\s*\n\s*const u = byToken\(token\);/.test(acc));

console.log('\n④ 화면은 스위치 하나로 보인다');
ok('앱이면 파이어베이스 쪽을 본다', /const nativePush = \(\) => !!\(window\.FF_NATIVE && window\.FF && FF\.push\)/.test(cli));
ok('둘 중 하나면 켤 수 있다', /const pushCan = \(\) => nativePush\(\) \|\| webPushCan\(\)/.test(cli));
// 서버에 열쇠가 없으면 켜 봐야 아무 데도 안 간다 — 스위치를 아예 안 보인다
ok('서버가 안 열었으면 스위치를 숨긴다', /if \(!\(await fcmReady\(\)\)\) return \{ can: false \}/.test(cli));
ok('앱에서는 앱 길로 켜고 끈다', /if \(st\.native\) \{[\s\S]{0,600}\/api\/fcm-on/.test(cli));

console.log('\n⑤ 토큰이 안 와도 멈추지 않는다');
// 등록이 끝나야 토큰이 온다. 안 오면 스위치가 아무 반응 없이 멈춘 것처럼 보인다.
ok('기다리다 접는다', /Promise\.race\(\[\s*\n\s*tokenWait,[\s\S]{0,140}8000\)/.test(nat));
ok('등록 실패도 받아 준다', /addListener\('registrationError'/.test(nat));
ok('웹에서는 아예 없다', /window\.FF\.push = native && Push \?/.test(nat));

console.log('\n⑥ 서명 만드는 법이 맞는가');
{
  // fcm.js 가 서비스 계정으로 JWT 를 서명한다. 그 서명이 실제로 검증되는지 본다.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: 'a@b.com', scope: 'x', aud: 'y', iat: 1, exp: 2 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey);
  ok('RS256 서명이 검증된다', crypto.verify('RSA-SHA256', Buffer.from(head + '.' + body), publicKey, sig));
  const f = fs.readFileSync(src + '/fcm.js', 'utf8');
  ok('같은 방식으로 서명한다', /crypto\.sign\('RSA-SHA256', Buffer\.from\(head \+ '\.' \+ body\), KEY\.private_key\)/.test(f));
  // 환경변수 칸에 여러 줄을 못 넣는 곳이 많다
  ok('\\n 을 글자로 적어도 받아 준다', f.includes("key.replace(") && f.includes("환경변수 칸에 여러 줄을 못 넣는"));
  ok('토큰을 만료 전까지 다시 쓴다', /cached\.exp - 60 > now/.test(f));
}

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
