// 로비 화면이 설계대로 짜여 있는지 (정적 검사).
// 브라우저 없이도 "요소가 빠졌는지 · 태그가 안 닫혔는지 · 예전 스타일이
// 새 스타일을 덮는지" 는 잡을 수 있다. 로비를 갈아엎으면서 이 셋을 다 밟았다.
const fs = require('fs');
const root = __dirname + '/..';
const html = fs.readFileSync(root + '/public/index.html', 'utf8');
const cli = fs.readFileSync(root + '/public/client.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 태그가 제대로 닫혀 있는가');
{
  let t = 0;
  html.split('\n').forEach((l) => {
    t += (l.match(/<div\b/g) || []).length - (l.match(/<\/div>/g) || []).length;
  });
  ok('문서 전체 div 균형', t === 0, '차이 ' + t);

  const lines = html.split('\n');
  const start = lines.findIndex((l) => l.includes('<div id="lobby">'));
  let d = 0, closedAt = -1;
  for (let i = start; i < lines.length; i++) {
    d += (lines[i].match(/<div\b/g) || []).length - (lines[i].match(/<\/div>/g) || []).length;
    if (d === 0) { closedAt = i; break; }
  }
  ok('#lobby 가 닫힌다', closedAt > start);
  // 탭바·대기카드는 #lobby 안에 있어야 한다 (게임 시작 시 로비를 통째로 숨기므로)
  const navAt = lines.findIndex((l) => l.includes('<nav id="navBar">'));
  const waitAt = lines.findIndex((l) => l.includes('<div id="waitCard">'));
  ok('탭바가 #lobby 안', navAt > start && navAt < closedAt, `nav ${navAt} / close ${closedAt}`);
  ok('대기카드가 #lobby 안', waitAt > start && waitAt < closedAt);
}

console.log('\n② 프로필 바 요소');
for (const id of ['pbFace', 'pbLv', 'pbNick', 'pbStats', 'pbCoins', 'pbRp', 'pbCoinIco', 'pbDot', 'pbXpFill'])
  ok('#' + id, html.includes('id="' + id + '"'));
ok('renderAccount 가 채운다', /getElementById\('pbNick'\)/.test(cli));

console.log('\n③ 모드 카드 네 개');
for (const cls of ['mode-card solo', 'mode-card multi', 'mode-card item', 'mode-card quad'])
  ok(cls, html.includes('class="' + cls + '"'));
ok('셰브론 네 개', (html.match(/class="mc-go"/g) || []).length === 4);

console.log('\n④ 예전 스타일이 새 스타일을 덮지 않는가');
{
  // 같은 선택자가 두 번 정의되면 뒤엣것이 이긴다.
  // 새 로비 스타일은 앞쪽에 있으므로, 뒤에 같은 이름이 또 있으면 디자인이 안 먹는다.
  // 다만 미디어쿼리 안(들여쓰기 6칸)의 반응형 재정의는 정상이므로 세지 않는다.
  const topLevel = (sel) => html.split('\n').filter((l) => l.startsWith('    ' + sel)).length;
  const dup = [];
  for (const sel of ['#profileBar {', '.mode-card {', '.mode-grid {', '#navBar {',
                     '.nav-item {', '.lobby-misc {', '.misc-link {', '#lobby {']) {
    const n = topLevel(sel);
    if (n > 1) dup.push(sel + '×' + n);
  }
  ok('중복 정의 없음', dup.length === 0, dup.join(' '));
}

console.log('\n⑤ 설정·탭바 연결');
ok('로비 설정 화면', html.includes('id="setModal"'));
ok('openSettings 정의', /function openSettings/.test(cli));
ok('설정 버튼이 부른다', /onclick="openSettings\(\)"/.test(html));
ok('탭 5개', (html.match(/data-nav="/g) || []).length === 5);

console.log('\n⑥ CSS 괄호 균형');
{
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const o = (css.match(/\{/g) || []).length, c = (css.match(/\}/g) || []).length;
  ok('중괄호 균형', o === c, `{ ${o} / } ${c}`);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
