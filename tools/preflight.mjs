// 스토어에 올리기 직전, 사람이 기억으로 확인하던 것들을 대신 본다.
//
// 여기서 걸리는 것들은 전부 "빌드는 되는데 나중에 터지는" 종류다 —
// 서명 없는 AAB, 시험용 광고가 켜진 채 나간 판, 낡은 스크린샷,
// 사실과 다른 처리방침. 스토어는 이런 걸 며칠 뒤에야 말해 준다.
//
//   node tools/preflight.mjs          한 번 훑는다
//   node tools/preflight.mjs --net    바깥 주소가 살아 있는지도 본다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);
const read = f => { try { return fs.readFileSync(p(f), 'utf8'); } catch { return null; } };
const has = f => fs.existsSync(p(f));

let stop = 0, warn = 0;
const B = '\x1b[1m', R = '\x1b[31m', Y = '\x1b[33m', G = '\x1b[32m', D = '\x1b[2m', X = '\x1b[0m';
// 막는 것 / 알아만 두는 것 / 지나간 것
const bad  = (n, why) => { stop++; console.log(`  ${R}✗${X} ${n}\n      ${why}`); };
const hmm  = (n, why) => { warn++; console.log(`  ${Y}!${X} ${n}\n      ${D}${why}${X}`); };
const good = n => console.log(`  ${G}✓${X} ${n}`);
const head = t => console.log(`\n${B}${t}${X}`);

// ── 1. 서명 ────────────────────────────────────────────────
head('1. 서명');
{
  const g = read('android/app/build.gradle') || '';
  if (has('android/keystore.properties')) {
    const ks = read('android/keystore.properties');
    const m = /storeFile\s*=\s*(.+)/.exec(ks);
    const f = m && path.resolve(p('android/app'), m[1].trim());
    if (!m) bad('keystore.properties 에 storeFile 이 없다', 'keystore.properties.example 을 보고 채운다');
    else if (!fs.existsSync(f)) bad('열쇠 파일이 그 자리에 없다', f);
    else if (!/storePassword\s*=\s*\S/.test(ks) || /여기에/.test(ks)) bad('비밀번호가 아직 예시 그대로다', 'android/keystore.properties');
    else good('열쇠와 비밀번호가 제자리에 있다');
  } else {
    bad('android/keystore.properties 가 없다',
        'cp android/keystore.properties.example android/keystore.properties  → 값을 채운다.\n' +
        '      열쇠는 TWA 때 쓰던 그것이어야 한다. 새로 만들면 스토어가 거절한다.');
  }
  // cap sync 가 build.gradle 을 덮어쓴다 — 서명 얼개가 살아 있는지 매번 본다
  /canSign/.test(g) && /GradleException/.test(g)
    ? good('열쇠가 없으면 release 가 멈추게 돼 있다')
    : bad('build.gradle 의 서명 얼개가 사라졌다', 'cap sync 가 덮어썼다. git diff android/app/build.gradle');
  const vc = /versionCode\s+(\d+)/.exec(g);
  if (!vc) bad('versionCode 를 못 찾겠다', 'android/app/build.gradle');
  else if (+vc[1] <= 4) bad(`versionCode 가 ${vc[1]} 이다`, 'TWA 가 4 까지 썼다. 스토어는 더 큰 번호만 받는다');
  else good(`versionCode ${vc[1]} · versionName ${(/versionName "([^"]+)"/.exec(g) || [, '?'])[1]}`);
}

// ── 2. 광고 ────────────────────────────────────────────────
head('2. 광고');
{
  const n = read('public/native.js') || '';
  const t = /var TESTING\s*=\s*(true|false)/.exec(n);
  if (!t) bad('native.js 에서 TESTING 을 못 찾겠다', 'public/native.js');
  else if (t[1] === 'true') bad('아직 시험용 광고다 (TESTING = true)',
      '먼저 애드몹에 이 기기를 시험 기기로 등록해 광고가 뜨는 걸 눈으로 본 뒤,\n' +
      '      public/native.js 의 TESTING 을 false 로 바꾸고, 그다음 Render 에 AD_MODE=ad 를 넣는다.\n' +
      '      순서를 바꾸면 내 광고를 내가 눌러 계정이 정지될 수 있다.');
  else good('실제 광고로 나간다 (TESTING = false)');

  const man = read('android/app/src/main/AndroidManifest.xml') || '';
  const appId = /ads\.APPLICATION_ID"\s*\n?\s*android:value="([^"]+)"/.exec(man);
  if (!appId) bad('매니페스트에 애드몹 앱 ID 가 없다', '이 줄이 없으면 앱이 켜지자마자 죽는다');
  else if (!/^ca-app-pub-\d+~\d+$/.test(appId[1])) bad('애드몹 앱 ID 모양이 이상하다', appId[1]);
  else good(`애드몹 앱 ID ${appId[1]}`);

  const unit = /reward:\s*'(ca-app-pub-[^']+)'/.exec(n);
  if (unit && appId && unit[1].split('/')[0].replace('~', '/') !== appId[1].split('~')[0])
    hmm('앱 ID 와 광고 단위의 발행자 번호가 다르다', `${appId[1]} vs ${unit[1]}`);
}

// ── 3. 적어 둔 말이 사실인가 ─────────────────────────────────
head('3. 적어 둔 말이 사실인가');
{
  const pv = read('privacy.html') || '', tm = read('terms.html') || '';
  has('public/privacy.html')
    ? bad('처리방침 사본이 public/ 에 또 있다',
          '두 벌이 되면 한쪽만 고쳐진다. 지우고 server.js 의 301 로 보낸다')
    : good('처리방침은 한 벌뿐이다');
  /광고 네트워크[·・\s]*분석 도구를 쓰지 않/.test(pv)
    ? bad('처리방침이 아직 "광고를 쓰지 않는다" 고 말한다', '애드몹을 켜는 순간 거짓이 되고, 그건 정책 위반이다')
    : good('처리방침에 그 문장이 없다');
  /애드몹|AdMob/.test(pv) ? good('처리방침에 애드몹이 적혀 있다')
                          : bad('처리방침에 애드몹이 없다', '광고 SDK 는 제3자 제공으로 적어야 한다');
  /광고 ID/.test(pv) ? good('처리방침에 광고 ID 수집이 적혀 있다')
                     : bad('처리방침에 광고 ID 가 없다', '데이터 안전 양식과 어긋난다');
  /<h2>\d+\. 광고<\/h2>/.test(tm) ? good('약관에 광고 조항이 있다')
                                  : bad('약관에 광고 조항이 없다', 'terms.html');
  const li = read('store-assets/제출용/등록정보.md') || '';
  /분석 도구를 쓰지 않/.test(li) ? bad('등록정보가 "분석 도구를 쓰지 않는다" 고 말한다', 'store-assets/제출용/등록정보.md')
                                : good('등록정보에 그 문장이 없다');
  /계정 삭제 URL \| \S*delete-account/.test(li)
    ? good('계정 삭제 URL 이 삭제 안내를 가리킨다')
    : bad('계정 삭제 URL 이 삭제 안내가 아니다', '처리방침을 적어 두면 심사에서 되돌아온다');
}

// ── 4. 미니게임 ────────────────────────────────────────────
head('4. 미니게임 (섯다식 배팅)');
{
  const s = read('server.js') || '', ans = read('store-assets/제출용/심사답안.md') || '';
  const on = /MINI_ON = process\.env\.MINI_ON === '1'/.test(s);
  const inList = /PICKABLE_MODES = \[[^\]]*MINI_ON \? \['mini'\]/.test(s);
  if (!on || !inList) bad('서버가 미니게임을 잠그고 있지 않다', '화면에서만 가리면 소켓으로 그대로 들어온다');
  else good('서버가 잠갔다 (MINI_ON=1 이면 되살아난다)');
  if (process.env.MINI_ON === '1') hmm('지금 셸에 MINI_ON=1 이 켜져 있다', 'Render 환경에도 들어가 있지 않은지 본다');
  // 되살리면 IARC 답이 같이 바뀌어야 한다
  /모의 도박[^\n]*아니요/.test(ans) ? good('심사답안: 모의 도박 아니요 (잠긴 것과 맞다)')
                                   : hmm('심사답안의 모의 도박 답을 확인한다', 'store-assets/제출용/심사답안.md');
}

// ── 5. 앱에 넣을 화면 ───────────────────────────────────────
head('5. 앱에 넣을 화면');
{
  const newest = dir => {
    let t = 0;
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else t = Math.max(t, fs.statSync(f).mtimeMs);
    } };
    try { walk(p(dir)); } catch { return 0; }
    return t;
  };
  if (!has('app-www')) bad('app-www 가 없다', 'node tools/build-app.mjs');
  else {
    const src = Math.max(newest('public'), ...['rules2.js', 'ai2.js', 'twelve.js', 'game4.js', 'ai4.js', 'items.js', 'view4.js', 'items2.js'].map(f => (has(f) ? fs.statSync(p(f)).mtimeMs : 0)));
    src > newest('app-www')
      ? bad('app-www 가 public/ 보다 낡았다', 'node tools/build-app.mjs && npx cap sync android')
      : good('app-www 가 최신이다');
  }
  const asset = 'android/app/src/main/assets/public/index.html';
  if (!has(asset)) bad('안드로이드에 화면이 안 들어갔다', 'npx cap sync android');
  else fs.statSync(p(asset)).mtimeMs < newest('app-www')
    ? bad('안드로이드 쪽이 app-www 보다 낡았다', 'npx cap sync android')
    : good('안드로이드에 최신 화면이 들어가 있다');
}

// ── 6. 아이콘과 스크린샷 ────────────────────────────────────
head('6. 아이콘과 스크린샷');
{
  const ic = p('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png');
  if (!fs.existsSync(ic)) bad('런처 아이콘이 없다', 'node tools/icons.mjs');
  else fs.statSync(ic).size < 3000
    ? bad('런처 아이콘이 Capacitor 기본 그림 같다', 'node tools/icons.mjs')
    : good('런처 아이콘이 우리 것이다');

  const shots = ['1-경매', '2-출품', '3-아이템', '4-트웰브', '5-모드', '6-로비'];
  const miss = shots.filter(s => !has(`store-assets/제출용/${s}.png`));
  if (miss.length) bad(`스크린샷 ${miss.length}장이 없다`, miss.join(', '));
  else {
    good('스크린샷 6장이 다 있다');
    // 모드 목록이 바뀌었는데 사진이 그대로면 심사관이 없는 화면을 본다
    const shot = fs.statSync(p('store-assets/제출용/5-모드.png')).mtimeMs;
    const ui = fs.statSync(p('public/index.html')).mtimeMs;
    if (shot < ui) hmm('화면을 고친 뒤로 스크린샷을 다시 안 찍었다',
      `5-모드.png 는 미니게임이 있던 시절 것일 수 있다 — node tools/shots.mjs <이름>`);
  }
}

// ── 7. 나가면 안 될 것 ─────────────────────────────────────
head('7. 나가면 안 될 것');
{
  const ig = read('.gitignore') || '';
  for (const [what, pat] of [['키스토어', /\*\.keystore/], ['비밀번호 파일', /android\/keystore\.properties/],
                             ['파이어베이스 설정', /android\/app\/google-services\.json/], ['AAB', /\*\.aab/]])
    pat.test(ig) ? good(`커밋 안 된다 — ${what}`) : bad(`.gitignore 에 없다 — ${what}`, '.gitignore');
  for (const f of ['android/keystore.properties', 'android/app/google-services.json'])
    if (has(f)) {
      const r = (await import('node:child_process')).execSync(`git -C "${ROOT}" ls-files --error-unmatch "${f}" 2>/dev/null || true`).toString();
      if (r.trim()) bad(`${f} 가 이미 커밋돼 있다`, 'git rm --cached 로 빼고 열쇠를 새로 만든다');
    }
}

// ── 8. 환경변수 (Render) ────────────────────────────────────
head('8. Render 에 넣을 것');
{
  const s = read('server.js') + read('accounts.js') + (read('fcm.js') || '');
  const need = [...new Set((s.match(/process\.env\.[A-Z_0-9]+/g) || []).map(m => m.slice(12)))]
    .filter(k => !['NODE_ENV', 'PORT', 'MINI_ON', 'AD_MODE'].includes(k));
  console.log(`  ${D}코드가 찾는 값 — 콘솔에서 하나씩 대조한다${X}`);
  console.log('      ' + need.sort().join(', '));
  has('android/app/google-services.json')
    ? good('google-services.json 이 있다 (앱 알림 켜짐)')
    : hmm('google-services.json 이 없다', '앱 알림(FCM)이 조용히 꺼진 채로 나간다. 필요 없으면 넘어간다');
}

// ── 9. 바깥 주소 ───────────────────────────────────────────
if (process.argv.includes('--net')) {
  head('9. 바깥 주소');
  const urls = ['https://flip-flap.onrender.com/privacy', 'https://flip-flap.onrender.com/terms',
                'https://flip-flap.onrender.com/rates', 'https://flip-flap.onrender.com/delete-account.html',
                'https://flip-flap.onrender.com/privacy.html'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: 'manual' });
      r.status < 400 ? good(`${r.status} ${u}`) : bad(`${r.status} ${u}`, '스토어에 적는 주소는 살아 있어야 한다');
    } catch (e) { bad(`못 갔다 ${u}`, e.message); }
  }
}

console.log(`\n${B}${stop ? `${R}막는 것 ${stop}개` : `${G}막는 것 없음`}${X}${warn ? ` · ${Y}볼 것 ${warn}개${X}` : ''}`);
if (!stop) console.log(`${D}이제 android/ 에서  ./gradlew bundleRelease${X}`);
process.exit(stop ? 1 : 0);
