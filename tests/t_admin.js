// 관리자 페이지 — 따옴표 한 겹만 어긋나도 인라인 스크립트가 통째로 죽는다.
// 그러면 버튼이 하나도 안 먹는데 화면은 멀쩡해 보인다(실제로 임시 계정을 붙이다
// 그렇게 됐고, 파일로 옮긴 뒤에도 서버용 이스케이프가 남아 또 그랬다).
// 그래서 서버를 띄우지 않고도 "정말 파싱되는가" 를 여기서 확인한다.
//
// 화면은 이제 admin.html 한 파일이다. server.js 안 155줄짜리 템플릿 문자열이던
// 것을 뺐다 — 화면이 커질수록 서버 코드가 화면 코드에 묻힌다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const srv = fs.readFileSync(src + '/server.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 화면이 있다');
let html = '';
try { html = fs.readFileSync(src + '/admin.html', 'utf8'); } catch (_) {}
ok('admin.html 이 있다', html.length > 1000, String(html.length));
ok('라우트가 그 파일을 준다', /app\.get\('\/admin'[\s\S]{0,400}sendFile\(path\.join\(__dirname, 'admin\.html'\)\)/.test(srv));
// 주소에 키가 실리지 않는 화면이지만, 캐시·리퍼러는 그래도 막아 둔다
ok('캐시·리퍼러를 막는다', /app\.get\('\/admin'[\s\S]{0,400}Referrer-Policy[\s\S]{0,200}no-store/.test(srv));

console.log('\n② 인라인 스크립트가 파싱된다');
{
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  ok('스크립트가 있다', !!m);
  if (m) {
    let err = null;
    try { new Function(m[1]); } catch (e) { err = e.message; }
    // 여기서 걸리면 관리자 페이지의 버튼이 전부 안 먹는다 — 쿠폰 발행까지 같이 죽는다
    ok('문법 오류가 없다', err === null, err || '');
    // 손으로 이스케이프한 따옴표가 남아 있으면 또 같은 일이 난다
    ok("onclick 안에 따옴표를 다시 넣지 않는다", !/onclick="[a-zA-Z]+\('/.test(m[1]),
       (m[1].match(/onclick="[a-zA-Z]+\('[^"]*"/) || [''])[0]);
    // 필요한 함수가 다 있는지
    for (const fn of ['mk', 'load', 'tmk', 'tload', 'trot', 'trev', 'post'])
      ok(`${fn}() 가 있다`, new RegExp('function ' + fn + '\\s*\\(').test(m[1]) || new RegExp(fn + '\\s*=').test(m[1]));
  }
}

console.log('\n③ 화면과 코드가 맞물린다');
{
  // 버튼이 부르는 함수가 실제로 있어야 한다
  const calls = [...html.matchAll(/onclick="([a-zA-Z]+)\(/g)].map((x) => x[1]);
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  const missing = [...new Set(calls)].filter((fn) =>
    !new RegExp(`function ${fn}\\s*\\(`).test(m[1]) && !new RegExp(`${fn}\\s*=`).test(m[1]));
  ok('버튼이 부르는 함수가 모두 있다', missing.length === 0, missing.join(','));
  // 코드가 쓰는 id 가 화면에 있어야 한다
  const ids = [...new Set([...m[1].matchAll(/\$\('([a-zA-Z]+)'\)/g)].map((x) => x[1]))];
  const noEl = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
  ok('코드가 찾는 id 가 모두 있다', noEl.length === 0, noEl.join(','));
}

console.log('\n④ 임시 계정 칸');
{
  for (const id of ['tCount', 'tCoins', 'tMsg', 'tCodes', 'tList'])
    ok(`${id} 칸이 있다`, html.includes(`id="${id}"`));
  ok('만들기 버튼', /onclick="tmk\(\)"/.test(html));
  ok('코드는 한 번만 보인다고 적어 둔다', /다시 볼 수 없어요|다시 못 봅니다/.test(html));
  ok('재발급·끄기는 data-id 로 넘긴다', /act-rot/.test(html) && /act-rev/.test(html));
  ok('키는 본문으로만 보낸다', /body:JSON\.stringify\(\{\.\.\.body,key:key\(\)\}\)/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
