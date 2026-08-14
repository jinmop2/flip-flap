// 관리자 페이지 — 화면 전체가 server.js 안 템플릿 문자열 한 덩어리라,
// 따옴표 한 겹만 어긋나도 인라인 스크립트가 통째로 죽는다. 그러면 버튼이
// 하나도 안 먹는데 화면은 멀쩡해 보인다(실제로 임시 계정을 붙이다 그렇게 됐다).
// 그래서 서버를 띄우지 않고도 "정말 파싱되는가" 를 여기서 확인한다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const srv = fs.readFileSync(src + '/server.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// /admin 라우트가 만들어 내는 HTML 을 실제로 뽑아 본다.
// express 없이, 그 안의 템플릿 문자열만 평가한다.
function adminHtml() {
  const at = srv.indexOf("app.get('/admin'");
  const start = srv.indexOf('res.type(\'html\').send(`', at);
  const from = start + 'res.type(\'html\').send(`'.length;
  // 백틱이 닫히는 지점 — 이스케이프된 백틱은 없다(있다면 여기서 걸린다)
  const end = srv.indexOf('`);', from);
  const tpl = srv.slice(from, end);
  // ${...} 안은 서버 값이라 여기서는 자리만 채운다
  const fake = { accounts: { TITLES: { t: { icon: '★', name: '칭호' } } } };
  // eslint-disable-next-line no-new-func
  return new Function('accounts', 'Object', 'return `' + tpl + '`;')(fake.accounts, Object);
}

console.log('① 화면이 만들어진다');
let html = '';
try { html = adminHtml(); ok('템플릿이 평가된다', html.length > 1000, String(html.length)); }
catch (e) { ok('템플릿이 평가된다', false, e.message); }

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
