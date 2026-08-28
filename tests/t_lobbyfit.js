// 로비가 화면 높이마다 잘리지 않는가.
// "솔로플레이/멀티플레이 버튼이 반만 보인다" 는 제보에서 나온 검사다 —
// 칸 높이만 눌러 놓고 안에 든 것을 안 줄여서, 펠트(107px)보다 내용(110px)이
// 커져 "AI와 대전" 이 잘렸다. 그리고 620~720 사이에는 아예 규칙이 없어
// 212px 짜리 칸이 그대로 버티다 화면을 넘겼다.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (note ? '  ' + note : '')); }
};

// 어느 분기 안의 규칙인지 잘라 본다
const block = (cond) => {
  const i = html.indexOf('@media ' + cond + ' {');
  if (i < 0) return '';
  let depth = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(i, k);
  }
  return '';
};

console.log('① 낮은 화면에서 칸을 줄이면 안에 든 것도 같이 줄인다');
{
  const b = block('(max-height:620px)');
  ok('620 이하 분기가 있다', !!b);
  ok('칸 높이를 정한다', /\.mode-card \{ aspect-ratio:auto; height:132px; \}/.test(b));
  // 높이만 줄이고 내용을 안 줄이면 아래 글씨가 잘린다 — 넷이 함께 있어야 한다
  ok('그림도 줄인다', /\.mc-emblem \{ width:40px; height:40px; \}/.test(b));
  ok('간격도 좁힌다', /\.mc-felt \{ gap:3px; \}/.test(b));
  ok('글씨도 줄인다', /\.mc-title \{ font-size:\.98rem; \}/.test(b) && /\.mc-sub \{ font-size:\.62rem; \}/.test(b));
}

console.log('\n② 620 과 720 사이가 비어 있지 않다');
{
  const b = block('(max-height:700px) and (min-height:621px)');
  ok('중간 단이 있다', !!b, '이게 없으면 그 구간에서 212px 칸이 화면을 넘긴다');
  ok('중간 높이를 정한다', /\.mode-card \{ aspect-ratio:auto; height:176px; \}/.test(b));
  ok('중간 그림 크기도 정한다', /\.mc-emblem \{ width:50px; height:50px; \}/.test(b));
}

console.log('\n③ 칸 안쪽 셈이 맞는가 (여백·그림·글씨 합)');
{
  // 칸 높이 - 케이스 padding(7*2) = 펠트. 그 안에 그림+제목+설명+간격 둘이 들어가야 한다.
  const fits = (card, emblem, gap, title, sub) => {
    const felt = card - 14;
    const need = emblem + title + sub + gap * 2;
    return { felt, need, ok: need <= felt };
  };
  // 제목·설명의 실제 높이는 글꼴에 달렸지만, 브라우저에서 잰 값으로 못 박는다
  const short = fits(132, 40, 3, 22, 13);
  ok('낮은 화면에서 안 잘린다', short.ok, `펠트 ${short.felt} / 내용 ${short.need}`);
  const mid = fits(176, 50, 7, 24, 14);
  ok('중간 화면에서 안 잘린다', mid.ok, `펠트 ${mid.felt} / 내용 ${mid.need}`);
  const tall = fits(212, 58, 7, 24, 14);
  ok('큰 화면에서 안 잘린다', tall.ok, `펠트 ${tall.felt} / 내용 ${tall.need}`);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
