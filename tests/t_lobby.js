// 로비 화면이 목업 좌표대로 짜여 있는지 (정적 검사).
//
// 로비를 목업대로 갈아엎으며 밟은 것들을 못 박는다. 눈으로 안 보이는 종류다.
//  ① 태그 균형 — #lobby 를 닫는 태그를 잃었고, 급히 닫었더니 탭바가 로비 밖으로 나갔다.
//  ② 예전 CSS 가 뒤에 남아 새 스타일을 통째로 덮고 있었다 (같은 특이도면 뒤엣것이 이긴다).
//     처음엔 '.mode-card {' 같은 단독 선택자만 봐서 '.mode-card.solo {' 를 놓쳤다.
//     그래서 지금은 "로비 선택자로 시작하는 모든 규칙" 을 센다.
//  ③ 918×1632 좌표계 — 목업 좌표를 var(--u) 로 옮겨 적었다. 값이 밀리면 잡아야 한다.
const fs = require('fs');
const root = __dirname + '/..';
const html = fs.readFileSync(root + '/public/index.html', 'utf8');
const cli = fs.readFileSync(root + '/public/client.js', 'utf8');
const lines = html.split('\n');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 태그가 제대로 닫혀 있는가');
{
  let t = 0;
  lines.forEach((l) => { t += (l.match(/<div\b/g) || []).length - (l.match(/<\/div>/g) || []).length; });
  ok('문서 전체 div 균형', t === 0, '차이 ' + t);

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

console.log('\n④ 918×1632 좌표계');
{
  ok('--u 를 :root 에 둔다', /:root \{ --u: min\(calc\(100vw \/ 918\), calc\(100svh \/ 1632\)\)/.test(css),
     '.logo 는 로그인 화면도 쓴다 — 로비에만 두면 거기서 var 가 깨진다');
  ok('무대 크기 918×1632', /width:calc\(918 \* var\(--u\)\);\s*height:calc\(1632 \* var\(--u\)\)/.test(css));
  // 목업이 지정한 y 좌표. 밀리면 잡는다.
  const at = (sel, prop, val) => {
    const i = css.indexOf(sel);
    const body = i < 0 ? '' : css.slice(i, i + 700);
    return new RegExp(prop + ':calc\\(' + val + ' \\* var\\(--u\\)\\)').test(body);
  };
  ok('프로필 y28',      at('#profileBar {', 'top', 28));
  ok('배우기 y578',     at('.learn-row {', 'top', 578));
  ok('모드격자 y675',   at('.mode-grid {', 'top', 675));
  ok('1행 330 / 2행 265', /grid-template-rows:calc\(330 \* var\(--u\)\) calc\(265 \* var\(--u\)\)/.test(css));
  ok('부가 y1335',      at('.lobby-misc {', 'top', 1335));
  ok('탭바 y1462 w860', at('#navBar {', 'top', 1462) && at('#navBar {', 'width', 860));
  // 로그인 로고는 --u 에 얽히면 안 된다
  const bigI = css.indexOf('.logo.big h1');
  ok('로그인 로고는 --u 와 무관', !/var\(--u\)/.test(css.slice(bigI, bigI + 500)));
}

console.log('\n⑤ 예전 스타일이 새 스타일을 덮지 않는가');
{
  // 같은 선택자를 두 번 정의하면 뒤엣것이 이긴다. 새 로비 블록은 앞쪽에 있으므로
  // 뒤에 같은 이름이 또 있으면 새로 쓴 게 하나도 안 먹는다 — 실제로 그랬다.
  // '.mode-card {' 만 보면 '.mode-card.solo {' 를 놓치므로, 선택자로 "시작하는" 규칙을 전부 센다.
  // 미디어쿼리 안(들여쓰기 6칸 이상)의 반응형 재정의는 정상이므로 세지 않는다.
  const bases = ['#lobby', '#profileBar', '#navBar', '.pb-', '.mode-card', '.mode-grid', '.mc-',
                 '.gold-pill', '.learn-row', '.lobby-misc', '.misc-', '.nav-item', '.logo', '.lb-bg', '.bg-'];
  const counts = {};
  for (const l of lines) {
    const m = l.match(/^    ([.#][A-Za-z0-9_.#>:\-\[\]="' ,]*)\{/);
    if (!m) continue;
    const sel = m[1].trim();
    if (!bases.some((b) => sel.startsWith(b))) continue;
    counts[sel] = (counts[sel] || 0) + 1;
  }
  const dup = Object.entries(counts).filter(([, n]) => n > 1).map(([s, n]) => s + '×' + n);
  ok('중복 정의 없음', dup.length === 0, dup.join(' '));

  // 예전 블록에만 있던 흔적들. 되살아나면 새 디자인이 덮인다.
  for (const ghost of ['aspect-ratio:1', '.mode-card.mini', '.lobby-btns { width:290px',
                       'lobby-btns > .lobby-misc { margin-top'])
    ok('예전 흔적 없음: ' + ghost, !css.includes(ghost));
}

console.log('\n⑥ 설정·탭바 연결');
ok('로비 설정 화면', html.includes('id="setModal"'));
ok('openSettings 정의', /function openSettings/.test(cli));
ok('설정 버튼이 부른다', /onclick="openSettings\(\)"/.test(html));
ok('탭 5개', (html.match(/data-nav="/g) || []).length === 5);

console.log('\n⑦ FLAP');
{
  const m = html.match(/<div class="flap">([^<]*)<\/div>/g) || [];
  ok('FLAP 철자 (전부)', m.length > 0 && m.every((x) => />FLAP</.test(x)), m.join(' '));
  ok('단어 전체를 회전 (글자별 아님)', /\.logo \.flap \{ transform:rotate\(180deg\)/.test(css));
  ok('scaleY 안 씀', !/\.flap[^}]*scaleY/.test(css));
}

console.log('\n⑧ CSS 괄호 균형');
{
  const o = (css.match(/\{/g) || []).length, c = (css.match(/\}/g) || []).length;
  ok('중괄호 균형', o === c, `{ ${o} / } ${c}`);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
