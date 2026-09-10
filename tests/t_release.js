// 출시 직전에 늘 확인하던 것들 — 사람 기억 대신 여기 적어 둔다.
//
// 이 파일이 잡는 것은 전부 "빌드는 되는데 나중에 터지는" 종류다.
// 서명 없이 나가는 AAB, 낡은 처리방침 사본, 사실과 다른 등록정보.
// 스토어는 이런 걸 며칠 뒤에야 말해 준다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const R = f => { try { return fs.readFileSync(path.join(src, f), 'utf8'); } catch { return ''; } };
const E = f => fs.existsSync(path.join(src, f));

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

const gradle = R('android/app/build.gradle');
const priv = R('privacy.html'), terms = R('terms.html');
const listing = R('store-assets/제출용/등록정보.md');
const srv = R('server.js');

console.log('① 서명 없이는 release 가 안 나간다');
{
  // 그냥 두면 그래들은 "성공" 이라 말하며 서명 없는 13MB AAB 를 뱉는다.
  // 그걸 올리면 스토어가 알아듣기 힘든 말로 되돌려 보낸다.
  ok('열쇠가 없으면 멈춘다', /if \(!canSign && gradle\.startParameter\.taskNames/.test(gradle)
     && /throw new GradleException/.test(gradle));
  ok('막는 건 release 뿐이다 (debug 는 그냥 된다)',
     /\(bundle\|assemble\|install\)Release/.test(gradle));
  // cap sync 가 이 파일을 통째로 덮어쓴다 — 얼개가 살아 있는지 매번 본다
  ok('cap sync 뒤에도 서명 설정이 남아 있다', /canSign/.test(gradle) && /keystore\.properties/.test(gradle));
  ok('멈추는 말이 무엇을 하라고 알려 준다',
     /keystore\.properties\.example/.test(gradle) && /assembleDebug/.test(gradle));
  ok('열쇠와 비밀번호는 저장소 밖에 있다',
     !E('android/keystore.properties') || /android\/keystore\.properties/.test(R('.gitignore')));
}

console.log('\n② 처리방침은 한 벌뿐이다');
{
  // 예전엔 public/ 에 사본이 또 있었다. /privacy 만 고치고 /privacy.html 은
  // 7월 것 그대로였는데, 계정 삭제 안내가 하필 그쪽을 가리키고 있었다 —
  // 심사관이 따라가면 "광고 목적으로 이용하지 않습니다" 를 읽게 된다.
  ok('사본이 public/ 에 없다', !E('public/privacy.html'));
  ok('.html 로 와도 진짜로 보낸다', /app\.get\(route \+ '\.html'.*redirect\(301, route\)/.test(srv));
  ok('계정 삭제 안내가 진짜 처리방침을 가리킨다',
     !/href="\/privacy\.html"/.test(R('public/delete-account.html')));
}

console.log('\n③ 적어 둔 말이 사실이다');
{
  ok('처리방침이 광고를 안 쓴다고 하지 않는다', !/광고 네트워크[·・\s]*분석 도구를 쓰지 않/.test(priv));
  ok('처리방침에 애드몹이 있다', /애드몹|AdMob/.test(priv));
  ok('처리방침에 광고 ID 가 있다', /광고 ID/.test(priv));
  ok('약관에 광고 조항이 있다', /<h2>\d+\. 광고<\/h2>/.test(terms));
  // 보상은 서버가 구글 확인을 받고 나서 준다 — 약관도 그렇게 말해야 한다
  ok('약관이 보상 시점을 바로 적는다', /구글이 서버에 확인해 준 뒤/.test(terms));
  ok('약관 조항 번호가 안 겹친다', (() => {
    const ns = [...terms.matchAll(/<h2>(\d+)\./g)].map(m => +m[1]);
    return ns.length > 0 && ns.every((n, i) => n === i + 1);
  })());
  ok('등록정보가 분석 도구를 안 쓴다고 하지 않는다', !/분석 도구를 쓰지 않/.test(listing));
  ok('등록정보의 AI 단계가 화면과 같다',
     /세 단계/.test(listing) && !/다섯 단계/.test(listing));
  ok('계정 삭제 URL 이 삭제 안내다', /계정 삭제 URL \| \S*delete-account/.test(listing));
}

console.log('\n④ 앱 얼개');
{
  const man = R('android/app/src/main/AndroidManifest.xml');
  // 이 줄이 없으면 구글 SDK 가 앱을 켜자마자 죽인다
  ok('애드몹 앱 ID 가 매니페스트에 있다', /ca-app-pub-\d+~\d+/.test(man));
  ok('로그인 되돌아오는 길이 있다', /android:scheme="com\.mongdung\.flipflap"/.test(man));
  const vc = +(/versionCode\s+(\d+)/.exec(gradle) || [, 0])[1];
  ok('판 번호가 TWA 시절보다 크다', vc > 4, `지금 ${vc}`);
  const vars = R('android/variables.gradle');
  ok('targetSdk 가 스토어 기준을 넘는다', +(/targetSdkVersion = (\d+)/.exec(vars) || [, 0])[1] >= 35);
}

console.log('\n⑤ 점검 도구가 스스로 돈다');
{
  ok('preflight 가 있다', E('tools/preflight.mjs'));
  const pf = R('tools/preflight.mjs');
  ok('막는 것이 있으면 1 로 끝난다', /process\.exit\(stop \? 1 : 0\)/.test(pf));
  ok('시험용 광고를 막는 것으로 센다', /TESTING = true/.test(pf) && /아직 시험용 광고다/.test(pf));
}

console.log(`\n통과: ${pass}  실패: ${fail}`);
process.exit(fail ? 1 : 0);
