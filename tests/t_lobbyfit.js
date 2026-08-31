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

console.log('\n③ 케이스를 flex 컨테이너로 쓰지 않는다');
{
  // <button> 을 flex 로 쓰면 사파리에서 자식이 세로로 안 늘어난다. 크로미움에서는
  // 멀쩡해서 못 보고 지나쳤고, 아이폰에서 펠트가 카드 위쪽 절반만 채웠다.
  // 첫 .mode-card 는 낮은 화면용 덮어쓰기다 — 본 규칙(비율을 정하는 쪽)을 본다
  const card = /\.mode-card \{([^}]*aspect-ratio:1 \/ 1\.28[^}]*)\}/.exec(html);
  ok('케이스는 block 이다', card && /display:block/.test(card[1]), card ? card[1].trim().slice(0, 60) : '규칙 없음');
  ok('케이스에 flex 를 안 준다', card && !/display:flex/.test(card[1]));
  const felt = /\.mc-felt \{([^}]*)\}/.exec(html);
  // 펠트가 스스로 채운다 — flex:1 은 부모가 flex 여야 듣는다
  ok('펠트가 스스로 높이를 채운다', felt && /height:100%/.test(felt[1]) && /width:100%/.test(felt[1]),
     felt ? felt[1].trim().slice(0, 60) : '규칙 없음');
  ok('펠트는 flex:1 에 기대지 않는다', felt && !/flex:1/.test(felt[1]));
}

console.log('\n④ 칸 안쪽 셈이 맞는가 (여백·그림·글씨 합)');
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

console.log('\n⑤ 좁은 기기에서 가로로 안 넘친다');
{
  // 폴드 커버 화면(280px)·큰 글씨·분할 화면에서 로비가 가로로 넘쳐 잘렸다. 원인 둘 —
  //  ㉠ grid-template-columns:1fr 1fr 은 minmax(auto,1fr) 이라 칸이 내용의 최소폭 밑으로
  //     안 줄어든다. minmax(0,1fr) 이어야 한다.
  //  ㉡ 높이 620~700px 구간의 .mode-card 규칙이 기본 규칙보다 파일 앞에 있어
  //     aspect-ratio:auto 가 도로 덮였다. height 만 살아남아 비율이 높이에서 폭을
  //     끌어내(176÷1.28=137.5px) 칸이 그 밑으로 안 줄었다.
  ok('모드 칸이 0까지 줄어들 수 있다', /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/.test(html));
  ok('칸 안의 것도 줄어든다', /\.mode-grid > \* \{ min-width:0; \}/.test(html));
  const base = html.indexOf('.mode-card {');
  const mid = html.indexOf('@media (max-height:700px) and (min-height:621px)');
  ok('높이 규칙이 기본 규칙 뒤에 있다', base > 0 && mid > base, 'base=' + base + ' mid=' + mid);
}

console.log('\n⑥ 넓은 화면에서 창이 끝까지 늘어나지 않는다');
{
  // 솔로·멀티 창은 화면을 덮는 판이라, 1fr 두 개는 1440px 화면에서 700px 짜리
  // 버튼 두 개가 된다 — PC 에서 균형이 깨져 보이던 것.
  ok('칸 폭을 묶는다', /grid-template-columns:repeat\(2, minmax\(0, 320px\)\)/.test(html));
  ok('가운데로 모은다', /justify-content:center; gap:0 26px;/.test(html));
  ok('제목도 같이 묶인다', /grid-column:1\/-1; max-width:666px/.test(html));
  ok('한 줄로 담는 폭에서도 가운데', /@media \(min-width:480px\) and \(max-width:619px\)/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
