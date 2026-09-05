// 화면 — 눈으로 봐야 보이는 것들 중, 코드에서 못 박을 수 있는 것만 모은다.
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };
const htm = fs.readFileSync(R + '/public/index.html', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');

console.log('\n① 프로필 바 — 오른쪽 단추 줄 자리를 비워 둔다');
// 톱니와 보너스는 .pb-acts 에 세로로 쌓여 절대 배치로 빠져 있다. 오른쪽 끝에
// 오는 것들이 저마다 그만큼 비워 두지 않으면 그 위에 깔린다. 로그인 버튼이
// 그랬다 — 버튼 오른쪽 28px 을 누르면 로그인이 아니라 설정이 열렸다.
ok('단추 줄은 오른쪽 끝 절대 배치',
   /\.pb-acts \{[\s\S]{0,160}position:absolute;[\s\S]{0,60}right:10px;/.test(htm));
// 세로로 쌓으므로 비워야 할 폭은 단추 한 칸 그대로다
ok('단추는 세로로 쌓는다', /\.pb-acts \{[\s\S]{0,420}flex-direction:column;/.test(htm));
const gap = (htm.match(/#setBtn \{[\s\S]{0,200}?width:(\d+)px/) || [])[1];
ok('코인·RP 가 톱니 자리를 비운다', /\.pb-right \{ margin-right:38px; \}/.test(htm));
ok('로그인 버튼도 같이 비운다', /\.pb-login \{ margin-left:auto; margin-right:38px;/.test(htm));
ok(`비운 폭(38px)이 톱니 폭(${gap}px)+여백보다 크다`, 38 >= Number(gap), `톱니 ${gap}px`);

console.log('\n② 아이템 카드 — 긴 이름이 좁은 카드에서 무너지지 않는다');
// 가로 모드에선 카드가 31px 까지 좁아진다. '도둑고양이' 는 한 줄에 못 들어가
// 두 줄로 접히는데, 기본 줄 간격이면 글자가 카드 밖으로 밀려 나온 것처럼 보였다.
ok('줄 간격을 좁혀 둔다', /\.card\.item-card \.ic-name \{[\s\S]{0,220}line-height:1\.05;/.test(htm));
ok('카드 폭을 넘지 않게 잡는다', /\.card\.item-card \.ic-name \{[\s\S]{0,240}width:100%;[\s\S]{0,80}overflow-wrap:anywhere;/.test(htm));
ok('아주 좁아지는 자리에선 딱지를 접는다',
   /body\.land \.card\.item-card \.ic-tag,\s*\n\s*\.pile-group \.card\.item-card \.ic-tag \{ display:none; \}/.test(htm));

console.log('\n③ 명암비 — 설명서 보조 글씨');
// 설명서 배경(#080204) 위에서 #6a5a70 은 3.2:1 로 12px 기준(4.5:1)에 못 미쳤다.
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (fg, bg) => { const a = lum(...hex(fg)), b = lum(...hex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const gcol = (htm.match(/\.r-comp-g\{ color:(#[0-9a-f]{6});/) || [])[1];
ok('설명서 보조 글씨 색을 읽었다', !!gcol, gcol);
ok(`보조 글씨가 4.5:1 을 넘는다 (${gcol} → ${ratio(gcol, '#080204').toFixed(2)}:1)`,
   ratio(gcol, '#080204') >= 4.5);

console.log('\n④ 진동 — 사람이 손대기 전에는 부르지 않는다');
// 손대기 전 진동은 브라우저가 막고 콘솔에 오류를 남긴다(try/catch 로 못 잡는다).
// 진짜 오류가 그 소음에 묻힌다.
ok('첫 손짓을 기다린다', /let userTouched = false;/.test(cli)
   && /window\.addEventListener\(ev, \(\) => \{ userTouched = true; \}, \{ once: true, capture: true \}\)/.test(cli));
ok('손대기 전엔 그냥 돌아간다', /if \(vibeOff \|\| !userTouched\) return;/.test(cli));
ok('진동 종류도 상속 키를 안 탄다', /hasOwnProperty\.call\(VIBE, kind\)/.test(cli));

console.log('\n⑤ 회전 — 가로에서는 테이블을 접는다');
ok('가로면 테이블을 감춘다', /body\.land #game-table, body\.land #tv-table, body\.land #quad-table \{ display:none; \}/.test(htm));
ok('회전 뒤 다시 잰다', /function scheduleRelayout/.test(cli)
   && /orientationchange/.test(cli));

console.log('\n⑥ 2인전 가운데 — 덱·턴·경매품이 한 줄에 선다');
// 덱 층은 .card 라서 제 크기를 들고 온다. 칸(#deckStack)은 그보다 작아서
// 층이 칸 밖으로 삐져나왔고, 칸을 기준으로 잡은 것들(턴 표시·덱 장수)이
// 전부 실제 덱과 어긋났다 — 장수는 덱 위에 12px 겹쳐 있었다.
ok('덱 층을 칸 크기에 맞춘다',
   /#deckStack \.deck-layer \{[\s\S]{0,160}width:100%; height:100%;/.test(htm));
// 한쪽으로만 밀면 덱의 눈에 보이는 가운데가 칸 가운데에서 밀려난다
ok('쌓인 티는 가운데를 축으로 벌린다',
   /const mid = \(layers - 1\) \/ 2;/.test(cli)
   && /const k = i - mid;/.test(cli)
   && /translate\(\$\{\(k \* 2\)\.toFixed\(1\)\}px, \$\{\(-k \* 2\)\.toFixed\(1\)\}px\)/.test(cli));
// 턴 표시는 덱과 같은 축·같은 폭이어야 한다. 따로 적어 두면 화면 폭마다 어긋난다.
const axis = (w) => {
  const m = htm.match(new RegExp(`@media \\(max-width:${w}px\\)([\\s\\S]*?)\\n    \\}`));
  if (!m) return null;
  const d = m[1].match(/#deckStack \{ left:(\d+)px; width:(\d+)px/);
  const t = m[1].match(/#turnInfo \{ left:(\d+)px; width:(\d+)px/);
  return d && t ? { deck: [d[1], d[2]], turn: [t[1], t[2]] } : null;
};
for (const w of [400]) {
  const a = axis(w);
  ok(`${w}px 이하에서 턴과 덱이 같은 축`, a && a.deck[0] === a.turn[0] && a.deck[1] === a.turn[1],
     a ? JSON.stringify(a) : '못 찾음');
}
ok('덱 장수가 덱에 안 닿게 띄운다', /#deckStack \.deck-count \{ font-size:\.55rem; bottom:-19px; \}/.test(htm));

// 트웰브에는 tvAlignRow 가 있는데 2인전에는 짝이 없어, 덱·레일이 경매품보다
// 몇 픽셀 위에 떠 있었다(안내 문구가 아래에서 칸을 밀어 올린다).
ok('2인전에도 줄 맞추는 함수가 있다', /function gAlignRow\(\)/.test(cli));
ok('테이블을 깔기 전에 줄을 맞춘다',
   /gAlignRow\(\);   \/\/ 줄을 맞춘 뒤라야/.test(cli));
// 카드가 없을 때 맞추면 엉뚱한 값이 박히고 카드가 나온 뒤에도 남는다
ok('카드가 없으면 건드리지 않는다',
   /const slot = document\.querySelector\('#auctionItems \.a-slot'\);\s*\n\s*if \(!slot\) return;/.test(cli));
// 카드는 딜·비행 중 transform 으로 움직인다 — 그때 재면 어긋난 값이 잡힌다
ok('움직이지 않는 칸을 잰다',
   /const lbl = slot\.querySelector\('\.a-label'\);/.test(cli)
   && /const cy = s\.top \+ lh \+ \(s\.height - lh\) \/ 2;/.test(cli));
ok('가로 모드에서는 밀어 둔 자리를 푼다',
   /function gAlignRow\(\)[\s\S]{0,400}for \(const el of \[deck, rail, turn\]\) if \(el\) el\.style\.marginTop = '';\s*\n\s*return;/.test(cli));

console.log('\n⑨ 탭을 넘길 때 넘어가는 중이라고 보여 준다');
{
  // 여태 막이 새까맣기만 해서 잠깐 화면이 꺼진 것처럼 보였다
  // 기다리는 표시는 로고가 한다 — 이름이 곧 그 동작이다.
  // (돌아가는 고리를 따로 두었더니 로고와 따로 놀아 둘 다 눈에 안 들어왔다.)
  ok('막에 로고가 있다', /<div id="fadeVeil">[\s\S]{0,200}fv-logo/.test(htm)
     && /<b>FLIP<\/b><i>FLAP<\/i>/.test(htm)
     && !/fv-ring/.test(htm));
  // FLIP 이 위로 넘어간 뒤 FLAP 이 아래로 넘어간다 — 겹치면 둘이 동시에 돌아
  // 무슨 글자인지 안 읽힌다
  ok('FLIP 다음에 FLAP 이 넘어간다',
     /@keyframes fvFlipUp \{[\s\S]{0,140}44%\s*\{ transform:rotateX\(-360deg\)/.test(htm)
     && /@keyframes fvFlapDown \{\s*0%, 8%  \{ transform:rotate\(180deg\) rotateX\(0deg\)/.test(htm));
  // 반 바퀴를 기다리게 두었더니, 짧게 스치는 화면 전환(0.32초)에서는 FLIP 만
  // 돌다 끝나 FLAP 이 한 번도 안 넘어갔다 — 한 박자만 늦게 따라 붙는다
  ok('FLAP 도 곧바로 따라 넘어간다', /0%, 8%  \{ transform:rotate\(180deg\)/.test(htm)
     && /52%\s*\{ transform:rotate\(180deg\) rotateX\(360deg\)/.test(htm));
  // 늘 돌려 두면 안 보이는 채로 판이 도는 내내 폰을 깨워 둔다
  ok('막이 켜졌을 때만 넘어간다', /#fadeVeil\.on \.fv-logo b \{ animation:fvFlipUp/.test(htm)
     && !/^\s*\.fv-logo b, \.fv-logo i \{[^}]*animation:/m.test(htm));
  // transform 은 통째로 덮이는 값이라, FLAP 의 180도를 키프레임에도 적어야 한다
  ok('FLAP 은 뒤집힌 채로 넘어간다', (htm.match(/rotate\(180deg\) rotateX\(/g) || []).length >= 2);
  // 빨리 홱 도니 급해 보였다 — 한 바퀴를 늘리고 도는 구간도 넓혔다
  ok('여유롭게 넘어간다', /animation:fvFlipUp 2\.6s/.test(htm) && /animation:fvFlapDown 2\.6s/.test(htm));
  // 글자를 오려 내는 칠이라, 칠할 바탕은 요소 상자만큼이다. line-height 가
  // 글자보다 작아 상자를 벗어난 부분은 칠이 안 들어가 잘려 보였다(FLAP 의 P).
  ok('로고 글자가 안 잘린다',
     /\.logo h1, \.logo \.flap \{\n\s*padding:9px 6px; margin:-9px -6px;/.test(htm)
     && /\.fv-logo b, \.fv-logo i \{\n\s*display:block; padding:6px 5px; margin:-6px -5px;/.test(htm));
  // 깜빡이는 것은 로고를 감싼 불빛이지 글자가 아니다 — 글자를 깜빡이게
  // 했더니 이름이 안 읽히는 순간이 생겼다. 주기는 길게(16초).
  ok('로고를 감싼 불빛이 이따금 깜빡인다',
     /#lobby \.logo h1::before, #lobby \.logo \.flap::before \{[\s\S]{0,900}animation:logoGlow 20s/.test(htm)
     && /@keyframes logoGlow \{[\s\S]{0,220}92\.5%\s*\{ opacity:\.1; \}/.test(htm)
     && !/logoFlicker/.test(htm));
  // 타원 한 덩어리로 깔면 로고 뒤에 동그란 얼룩이 앉은 꼴이다 — 빛은 글자꼴을 따라간다
  ok('불빛이 글자꼴을 따라간다', /#lobby \.logo h1::before   \{ content:'FLIP'; \}/.test(htm)
     && /#lobby \.logo \.flap::before \{ content:'FLAP'; \}/.test(htm)
     && /text-shadow:0 0 15px rgba\(170,205,255,\.42\)/.test(htm)
     && !/border-radius:50%; pointer-events:none; z-index:-1;/.test(htm));
  // left 만 주면 가운데 맞춤을 못 물려받아 로고 옆에 유령 글자가 하나 더 선다
  ok('빛이 글자와 정확히 겹친다', /left:6px; right:6px; top:9px; text-align:center;/.test(htm));
}

console.log('\n⑪ 랭킹은 올라온다');
{
  // 열었을 때 다 떠 있으면 등수가 그냥 목록으로만 읽힌다 — 3등부터 차례로 선다
  ok('3등 → 2등 → 1등 차례로', /#lbBox\.lb-in \.pod-3 \{ animation-delay:0s; \}/.test(htm)
     && /#lbBox\.lb-in \.pod-2 \{ animation-delay:\.14s; \}/.test(htm)
     && /#lbBox\.lb-in \.pod-1 \{ animation-delay:\.3s; \}/.test(htm));
  ok('나머지 줄도 차례로', /#lbBox\.lb-in \.lb-row[\s\S]{0,180}var\(--i, 0\) \* 26ms/.test(htm)
     && /row\.style\.setProperty\('--i', String\(i\)\)/.test(cli));
  // 켜 두면 새로 받아 다시 그릴 때마다 또 올라와 목록이 들썩인다
  ok('열 때만 올라온다', /box\.classList\.add\('lb-in'\)/.test(cli)
     && /box\.classList\.remove\('lb-in'\), 2200\)/.test(cli));
  // 눈에 안 잡힐 만큼 짧으면 화면이 한 번 깜빡인 것으로만 보인다
  ok('고리가 보일 만큼은 머문다', /const VEIL_MIN = 320;/.test(cli)
     && /Math\.max\(0, VEIL_MIN - \(Date\.now\(\) - t0\)\)/.test(cli));
  ok('로고는 로비 로고와 같은 백금색', /\.fv-logo b, \.fv-logo i \{[\s\S]{0,400}-webkit-text-fill-color:transparent/.test(htm));
  // 서서히 짙어지게 두면 그 사이 옛 화면이 비치고, 화면을 갈아 끼우는 순간(85ms)이
  // 아직 반투명한 막 너머로 드러난다 — "탭을 넘기면 로비가 잠깐씩 보인다".
  ok('막은 즉시 덮고 걷을 때만 서서히',
     /#fadeVeil\.on \{ opacity:1; pointer-events:auto; transition:none; \}/.test(htm)
     && /#fadeVeil \{[\s\S]{0,160}transition:opacity \.16s linear;/.test(htm));
  // 나가는 길에도 덮는다 — 안 덮으면 흰 화면이 한 번 지나간다
  ok('나갈 때도 덮는다', /function fastReload\(\) \{[\s\S]{0,200}veilHold\(\);/.test(cli)
     && /function veilHold\(\)/.test(cli));
}

console.log('\n⑩ 이모트 목록');
{
  // 팩을 사면 이모트가 차단 단추 뒤에 붙는다(refreshEmotes 가 append 한다).
  // 적어 놓은 차례와 상관없이 늘 맨 아래여야 한다.
  ok('차단 단추는 늘 맨 아래', /#emotePicker \.emote-mute \{\n\s*order:99;/.test(htm));
  ok('팩 이모트는 뒤에 붙는다', /picker\.appendChild\(b\);/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
