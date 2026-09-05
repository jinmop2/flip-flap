// 다인전은 넷이 판을 둘러앉는다 — 나는 아래, 나머지는 좌·상·우.
//
// 자리 하나가 한 덩어리다: 판 가장자리에 시계와 명패가 앉고, 그 앞(판 안쪽)에
// 딴 카드와 이번에 낸 카드가 놓인다. 예전엔 겹이 셋(자리 상자·딴 카드·낸 카드)
// 이라 저마다 자리를 재서 맞춰야 했고, 경매대가 조금만 움직여도 어긋났다.
// 그리고 자리가 사람이 아니라 '글자 담는 상자' 로 보였다.
const fs = require('fs');
const R = __dirname + '/..';
const html = fs.readFileSync(R + '/public/index.html', 'utf8');
const c4 = fs.readFileSync(R + '/public/client4.js', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (note ? '  ' + note : '')); } };

console.log('① 자리가 판 둘레에 흩어진다');
ok('자리 칸이 판 위에 얹힌 겹이다', /#q-opps \{ position:absolute; inset:0;/.test(html));
ok('한 사람이 한 덩어리다', /<div id="q-opps"><\/div>/.test(html)
   && !/id="q-oppacq"/.test(html) && !/id="q-oppbids"/.test(html));
ok('좌·상·우 자리가 있다', /\.q-seat\.at-t \{ left:50%;/.test(html)
   && /\.q-seat\.at-l \{ left:0;/.test(html) && /\.q-seat\.at-r \{ left:100%;/.test(html));
ok('셋이면 왼쪽과 맞은편에 앉는다',
   /SEAT_AT = \{ 2: \['at-l', 'at-t'\], 3: \['at-l', 'at-t', 'at-r'\] \}/.test(c4));
// 한쪽에만 사람이 앉으면 판이 그쪽으로 기울어, 경매대가 한가운데에서 밀려 보인다
ok('빈 변은 앉은 쪽을 되비쳐 잡는다',
   /right0 != null \? 2 \* matMid - right0/.test(cli)
   && /left0 != null \? 2 \* matMid - left0/.test(cli));
ok('자리 클래스를 붙여 준다', /d\.className = 'q-seat ' \+ where/.test(c4));

console.log('\n② 옆자리는 90도 돌아앉는다');
// 가로로 눕혀 두면 그 변에 앉은 게 아니라 화면 구석에 붙어 있는 것으로 보였다.
ok('왼쪽은 반시계로 돈다', /\.q-seat\.at-l \{[^}]*transform:rotate\(-90deg\)/.test(html));
ok('오른쪽은 시계로 돈다', /\.q-seat\.at-r \{[^}]*transform:rotate\(90deg\)/.test(html));
// 가운데를 축으로 돌리면 폭이 내용에 따라 변해 절반이 화면 밖으로 나간다.
// 모서리를 축으로 잡아야 "가장자리에 붙어 안쪽으로 깊이만큼" 이 성립한다.
ok('도는 축은 모서리다', (html.match(/transform-origin:0 0; transform:rotate\((-)?90deg\)/g) || []).length === 2);
// 폭은 자리마다 고정이다 — 옆자리는 그 폭이 화면 세로로 눕는다
ok('자리 폭은 고정이다', /\.q-seat \{[\s\S]{0,160}width:var\(--q-seat-w/.test(html));
// 명패는 가장자리, 낸 카드는 판 안쪽 — DOM 순서가 곧 깊이 순서다
ok('명패가 먼저, 앞자리가 나중', /d\.appendChild\(bar\); d\.appendChild\(front\);/.test(c4));

console.log('\n③ 명패는 내 프로필과 같은 차림이다');
// 평평한 반투명 상자일 때는 사람이 앉은 자리가 아니라 글자 담는 상자로 보였다
ok('같은 판(.game-pcard)을 쓴다', /plate\.className = 'game-pcard q-splate'/.test(c4));
ok('시계도 같이 붙는다', /tm\.className = 'timer pc-timer q-stime'/.test(c4)
   && /s\.clock\[i\]/.test(c4));
// .game-pcard 는 아래에서 position:absolute 로 잡혀 있다. 같은 굵기로 맞서면
// 뒤에 쓴 쪽이 이겨 명패가 흐름에서 빠지고, 자리 크기에 안 잡혀 화면 밖으로 나간다.
ok('명패를 흐름 안에 눌러 둔다', /\.q-seat \.q-splate \{ position:static;/.test(html)
   && /\.q-seat \.q-stime \{ position:static;/.test(html));
// 좁으면 "3:0 / 0" 으로 접혀 숫자가 아니라 고장난 글자처럼 보였다
ok('시계는 두 줄이 안 된다', /\.q-seat \.q-stime \{[^}]*white-space:nowrap/.test(html));
ok('옛 상자 규칙이 없다', !/\.q-opp\b/.test(html) && !/q-oname/.test(html) && !/q-ometa/.test(html));

console.log('\n④ 낸 카드는 그 사람 앞에 놓인다');
ok('낸 카드가 자리 안에 들어 있다', /front\.appendChild\(acq\); front\.appendChild\(bid\)/.test(c4));
ok('겹을 따로 두지 않는다', !/q-oppbids/.test(c4) && !/q-oppacq/.test(c4));
// 자리를 숫자로 박아 두던 시절의 변수 — 이제 덩어리가 스스로 자리를 잡는다
ok('옛 세로 자리 변수가 없다', !/--q-side-acq/.test(cli) && !/--q-side-bid/.test(cli)
   && !/--q-side-acq/.test(html) && !/--q-side-bid/.test(html));
ok('옆자리 눈높이는 경매대에서 뽑는다', /--q-side-y/.test(cli) && /--q-side-y/.test(html));

console.log('\n⑤ 옆자리와 경매대가 가로로 안 겹친다');
{
  // 375px 폭에 자리 둘과 경매대가 다 들어가야 한다. 실제로 두 번 파고들었다:
  //  · '낙찰' 글자가 낸 카드 아래에 쌓여 칸이 50 → 68px (깊이 103, 13px 침범)
  //  · 3인전 딴 카드 더미 높이가 74px 로 박혀 있었다 (18px 침범)
  const W = 375;
  const mat = 11 * 2 + 46 * 3 + 9 * 2 + 5;      // padding + 카드 셋 + 간격 + 덱 여백
  const side = (W - mat) / 2;
  const depth = 30 + 4 + (48 + 8);              // 명패 + 사이 + 낸 카드(테·여백 포함)
  ok('옆자리가 경매대를 안 밀친다', depth <= side, `깊이 ${depth} vs 여유 ${Math.round(side)}`);
  ok('경매대를 같이 줄였다', /body\.quad4 #q-mat \{ gap:9px; padding:11px 13px; \}/.test(html)
     && /body\.quad4 #q-mat \.card[^{]*\{ width:46px; height:64px; \}/.test(html));
  ok('옆자리 낸 카드는 한 치수 작다',
     /\.q-seat\.at-l \.q-bslot \.card, \.q-seat\.at-r \.q-bslot \.card \{ width:34px; height:48px;/.test(html));
  // 낙찰 글자를 카드 아래에 쌓으면 그만큼이 그대로 침범 깊이가 된다
  // 내 칸은 아래에 자리가 있으니 그대로 둔다 — 거기까지 띄우면 글자가
  // 칸 밖으로 나가 딴 카드 줄을 밟는다
  ok('상대 낙찰 글자는 카드 위에 얹는다', /\.q-seat \.q-blabel \{[^}]*position:absolute/.test(html)
     && /^\s*\.q-blabel \{ font-size:[^}]*\}$/m.test(html));
  // 딴 카드 더미에 높이를 못 박으면 그 값이 곧 판을 파고드는 깊이가 된다
  ok('딴 카드 더미 높이를 안 박는다', /\.q-oacq \{[^}]*height:auto;/.test(html)
     && !/body\.q-n3 \.q-oacq \{ height:/.test(html)
     && !/body\.quad4 \.q-oacq \{ height:/.test(html));
  // 세로가 짧다고 경매대를 옆으로 넓히면 옆자리가 들어갈 가로 여유가 사라진다
  ok('짧은 기기에서도 경매대를 안 넓힌다',
     /body\.quad4 #q-mat \{ padding:8px 12px; gap:8px; \}/.test(html));
}

console.log('\n⑥ 아래는 2인전과 같은 배치');
ok('내 자리는 손패 위 흐름에 있다', /#q-mebar \{ align-self:center;/.test(html)
   && /<div id="q-myacq"><\/div>[\s\S]{0,300}<div id="q-mebar">[\s\S]{0,300}<div id="q-myhand">/.test(html));
ok('확정은 손패 다음이다', /<div id="q-myhand"><\/div>\s*(<!--[\s\S]*?-->\s*)?<div id="q-actions">/.test(html));
ok('확정을 띄우지 않는다', !/#q-actions \{ position:absolute/.test(html));
ok('이모트는 왼쪽 아래', /#q-emoteSlot \{ position:absolute; left:14px; bottom:/.test(html));
ok('이모트를 데려오고 돌려준다', /q4MoveEmote\('q-emoteSlot'\)/.test(c4) && /q4MoveEmote\('game'\)/.test(c4));

console.log('\n⑦ 판은 네 사람을 품는다');
// 변은 '사람'(명패)을 지난다. 자리 상자를 재면 그 안에 명패와 카드가 같이
// 들어 있어 변이 둘 사이를 지나가고, 그 사람의 딴 카드·낸 카드가 판 밖에 놓인다.
ok('좌·우 변은 옆 사람 명패 한가운데', /mid\(q\('\.q-seat\.at-l \.q-splate'\), 'x'\)/.test(cli)
   && /mid\(q\('\.q-seat\.at-r \.q-splate'\), 'x'\)/.test(cli));
ok('윗변은 위쪽 사람 명패 한가운데', /mid\(q\('\.q-seat\.at-t \.q-splate'\), 'y'\)/.test(cli));
ok('아랫변은 내 자리', /mid\(document\.getElementById\('q-mebar'\), 'y'\)/.test(cli));
// 안내 문구가 딴 카드와 같은 높이면 긴 문구의 꼬리가 카드에 가린다
ok('안내 문구는 경매대 위에 있다',
   html.indexOf('<div id="q-status"></div>') < html.indexOf('<div id="q-mat">'));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
