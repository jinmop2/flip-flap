// 남이 쓴 글자가 화면을 깨고 나오지 못하는가.
//
// esc() 는 textContent → innerHTML 이라 & < > 만 바꾸고 따옴표는 그대로 뒀다.
// 그런데 그 결과가 onclick="fn('...')" 처럼 속성 안 자바스크립트 문자열로도
// 들어간다 — 닉네임에 작은따옴표가 하나 있으면 그 문자열을 깨고 나올 수 있었다.
// 닉네임에는 문자 제한이 없어서 실제로 가능했다.
const fs = require('fs');
const R = __dirname + '/..';
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
const acc = fs.readFileSync(R + '/accounts.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (note ? '  ' + note : '')); } };

console.log('① 내보내는 쪽 — esc 가 따옴표까지 막는다');
{
  const m = /function esc\(s\) \{[\s\S]*?\n\}/.exec(cli);
  ok('esc 가 있다', !!m);
  const esc = new Function('s', m[0].replace(/^function esc\(s\) \{/, '').replace(/\n\}$/, ''));
  const cases = {
    "a',alert(1),'": "a&#39;,alert(1),&#39;",
    '<img src=x onerror=alert(1)>': '&lt;img src=x onerror=alert(1)&gt;',
    'a"b': 'a&quot;b',
    '한글 닉': '한글 닉',
  };
  for (const [inp, want] of Object.entries(cases))
    ok(`막는다: ${JSON.stringify(inp).slice(0, 30)}`, esc(inp) === want, `→ ${esc(inp)}`);
  ok('백슬래시도 막는다', esc('a\\b') === 'a&#92;b', esc('a\\b'));
  // 화면에 글자로 나올 때는 원래 모습 그대로여야 한다
  ok('보이는 글자는 그대로', esc("It's").includes('&#39;') && !esc("It's").includes('<'));
}

console.log('\n② 들어오는 쪽 — 닉네임에 따옴표를 못 쓴다');
{
  const m = /function nickProblem\(n\) \{[\s\S]*?\n\}/.exec(acc);
  ok('닉네임 검사가 있다', !!m);
  ok('따옴표·꺾쇠·백슬래시를 막는다', /\/\["'`<>\\\\\]\/\.test\(s\)/.test(m[0]), m[0].split('\n').find((l) => /따옴표/.test(l)) || '');
}

console.log('\n③ 속성 안에 데이터를 심는 자리는 전부 esc 를 지난다');
{
  // onclick="fn('...')" 꼴에서 esc 없이 들어가는 값이 없어야 한다.
  // idl 은 서버에서 [A-Za-z0-9_] 만 허용하지만, 규칙이 바뀔 수 있으니 여기서도 본다.
  const bad = [];
  const re = /onclick="[^"]*?'\$\{([^}]*)\}/g;
  for (const f of ['public/client.js', 'public/client4.js']) {
    const src = fs.readFileSync(R + '/' + f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const expr = m[1].trim();
      // 숫자·불린·상수는 문제 없다. 문자열 데이터만 본다.
      if (/^esc\(/.test(expr)) continue;
      if (/^(true|false|\d+)$/.test(expr)) continue;
      bad.push(f.split('/').pop() + ': ' + expr.slice(0, 40));
    }
  }
  // 물건 id·미션 id 처럼 우리가 만든 값은 남아 있어도 된다 — 남의 입력이 아니다
  const OURS = /^(it\.id|m\.id|id|p\.id|f\.idl|it\.type)$/;
  const real = bad.filter((b) => !OURS.test(b.split(': ')[1]));
  ok('남의 입력이 그냥 들어가는 자리가 없다', real.length === 0, real.slice(0, 5).join(' / '));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
