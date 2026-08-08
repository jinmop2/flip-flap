// ico() 로 그림을 넣는 자리마다 크기 규칙이 있는지 검사한다.
//
// 왜 필요한가: ico(이모지, '클래스') 는 <span class="클래스">…SVG…</span> 를 만든다.
// 이때 CSS 에 크기를 안 적으면 SVG 가 기본 크기(300×150)로 펼쳐져 화면이 망가진다.
// 눈으로만 확인하면 잘 안 보이는 자리(대화상자·튜토리얼 등)에서 뒤늦게 발견된다.
// 실제로 튜토리얼 모자가 이 이유로 화면 절반을 덮었다.
const fs = require('fs');
const root = __dirname + '/..';
const css = fs.readFileSync(root + '/public/index.html', 'utf8');
const js = fs.readFileSync(root + '/public/client.js', 'utf8')
         + fs.readFileSync(root + '/public/client4.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

// ico(…, '클래스') 로 쓰인 클래스 + 인자를 안 주면 붙는 기본 클래스
const classes = new Set([...js.matchAll(/ico\(\s*'[^']+'\s*,\s*'([^']+)'\s*\)/g)].map((m) => m[1]));
classes.add('g-ico');        // ico() 기본값
classes.add('rank-art');     // rankIco() 가 붙이는 클래스

console.log('\n① ico() 가 쓰는 클래스마다 SVG 크기 규칙이 있는가');
for (const c of [...classes].sort()) {
  const esc = c.replace(/-/g, '\\-');
  // .클래스 … svg … { … width … } 형태를 찾는다
  const re = new RegExp('\\.' + esc + '[^{,]*svg[^{]*\\{[^}]*width', 'g');
  ok(`.${c}`, re.test(css), '크기 규칙 없음 → SVG 가 기본 크기로 터진다');
}

console.log('\n② 확인 대화상자 아이콘도 그림으로 나가는가');
{
  ok('cfIcon 이 iconArt 를 거친다', /cfIcon[\s\S]{0,220}iconArt/.test(js));
  ok('.cf-art 크기 규칙 있음', /\.cf-icon\.cf-art\s+svg[^{]*\{[^}]*width/.test(css));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
