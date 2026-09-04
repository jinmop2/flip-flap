// 다인전은 넷이 판을 둘러앉는다 — 나는 아래, 나머지는 좌·상·우.
// 예전엔 셋이 위에 한 줄로 서 있어 "마주 앉은" 것도 "둘러앉은" 것도 아니었고,
// 확정 버튼은 손패와 획득 사이에 끼어 고를 카드와 누를 버튼이 붙어 있었다.
const fs = require('fs');
const R = __dirname + '/..';
const html = fs.readFileSync(R + '/public/index.html', 'utf8');
const c4 = fs.readFileSync(R + '/public/client4.js', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (note ? '  ' + note : '')); } };

console.log('① 자리가 판 둘레에 흩어진다');
ok('자리 칸이 판 위에 얹힌 겹이다',
   /#q-opps, #q-oppbids, #q-oppacq \{ position:absolute; inset:0;/.test(html));
ok('좌·상·우 자리가 있다',
   /\.q-opp\.at-t \{ left:50%;/.test(html) && /\.q-opp\.at-l \{ left:4px;/.test(html)
   && /\.q-opp\.at-r \{ right:4px;/.test(html));
ok('낸 카드도 그 사람 쪽에 붙는다',
   /\.q-bslot\.at-l \{ left:56px;/.test(html) && /\.q-bslot\.at-r \{ right:56px;/.test(html));
ok('셋이면 왼쪽과 맞은편에 앉는다',
   /SEAT_AT = \{ 2: \['at-l', 'at-t'\], 3: \['at-l', 'at-t', 'at-r'\] \}/.test(c4));
// 한쪽에만 사람이 앉으면 판이 그쪽으로 기울어, 경매대가 한가운데에서 밀려 보인다
ok('빈 변은 앉은 쪽을 되비쳐 잡는다',
   /right0 != null \? 2 \* matMid - right0/.test(cli)
   && /left0 != null \? 2 \* matMid - left0/.test(cli));
ok('자리 클래스를 붙여 준다', /d\.className = 'q-opp ' \+ seatAt\(/.test(c4)
   && /slot\.className = 'q-bslot ' \+ seatAt\(/.test(c4));

console.log('\n② 옛 가로줄 배치의 잔재가 없다');
// 이 규칙들이 남아 있으면 배치가 통째로 무너진다. 실제로 세 번 무너졌다:
//  · .q-opp { position:relative } 가 뒤에 있어 absolute 를 덮었다
//  · #q-opps 를 relative 로 되돌리는 줄이 있었다
//  · #q-oppbids 에 height 가 남아 % 기준이 66px 이 되어 카드가 꼭대기로 갔다
ok('자리를 relative 로 되돌리지 않는다', !/\.q-opp \{ position:relative; \}/.test(html));
ok('자리 칸을 relative 로 되돌리지 않는다',
   !/#q-opps, #q-oppbids, #q-table, #q-me \{ position:relative/.test(html));
ok('낸 카드 칸에 높이를 못 박지 않는다', !/#q-oppbids \{ height:/.test(html)
   && !/body\.quad4 #q-oppbids \{ height:/.test(html));
ok('가로줄 시절 밀어내기가 없다', !/#q-opps \{ margin-top:/.test(html)
   && !/#q-opps \.q-opp:first-child \{ transform:/.test(html));

console.log('\n③ 아래는 2인전과 같은 배치');
ok('내 자리는 손패 위 흐름에 있다', /#q-mebar \{ align-self:center;/.test(html)
   && /<div id="q-myacq"><\/div>[\s\S]{0,300}<div id="q-mebar">[\s\S]{0,300}<div id="q-myhand">/.test(html));
// 사이에 주석이 들어가도 순서는 순서다 — 보는 것은 '손패 다음' 이다.
ok('확정은 손패 다음이다', /<div id="q-myhand"><\/div>\s*(<!--[\s\S]*?-->\s*)?<div id="q-actions">/.test(html));
ok('확정을 띄우지 않는다', !/#q-actions \{ position:absolute/.test(html));
ok('이모트는 왼쪽 아래', /#q-emoteSlot \{ position:absolute; left:14px; bottom:/.test(html));
ok('이모트를 데려오고 돌려준다', /q4MoveEmote\('q-emoteSlot'\)/.test(c4) && /q4MoveEmote\('game'\)/.test(c4));

console.log('\n④ 판은 네 사람을 품는다');
// 사람이 레일에 걸터앉으므로 판의 네 변은 네 사람의 한가운데를 지난다
ok('좌·우 변은 옆 사람 한가운데', /mid\(q\('\.q-opp\.at-l'\), 'x'\)/.test(cli)
   && /mid\(q\('\.q-opp\.at-r'\), 'x'\)/.test(cli));
ok('윗변은 위쪽 사람 한가운데', /mid\(q\('\.q-opp\.at-t'\), 'y'\)/.test(cli));
ok('아랫변은 내 자리', /mid\(document\.getElementById\('q-mebar'\), 'y'\)/.test(cli));

console.log('\n⑤ 좌·우 자리와 경매대가 가로로 안 겹친다');
{
  // 390px 폭에 자리 둘과 경매대가 다 들어가야 한다.
  // 자리는 22% 이되 92px 를 넘지 않는다 — 390 화면에서는 86px 이 쓰인다.
  const W = 390, pad = 4;
  const seat = Math.min(92, Math.round(W * 0.22));
  const mat = 13 * 2 + 50 * 3 + 9 * 2 + 5;   // padding + 카드 셋 + 간격 + 덱 여백
  ok('셋이 한 줄에 들어간다', seat * 2 + pad * 2 + mat <= W, `자리 ${seat}×2 + 경매대 ${mat} = ${seat * 2 + pad * 2 + mat}`);
  ok('경매대를 같이 줄였다', /body\.quad4 #q-mat \{ gap:9px; padding:11px 13px; \}/.test(html)
     && /body\.quad4 #q-mat \.card[^{]*\{ width:50px; height:70px; \}/.test(html));
}


console.log('\n⑤ 딴 카드와 낸 카드는 판 위에 놓인다');
{
  // 예전엔 자리 상자 안에 딴 카드가 같이 들어 있어, 이름·등급·카드 셋이 뒤엉켜
  // 셋 다 안 읽혔다. 내 것이 판 위에 깔리는 것과 같은 자리로 꺼냈다.
  ok('딴 카드용 겹이 따로 있다', /<div id="q-oppacq"><\/div>/.test(html)
     && /#q-opps, #q-oppbids, #q-oppacq \{ position:absolute; inset:0;/.test(html));
  ok('자리 상자에는 이름과 등급만 남는다',
     /d\.appendChild\(nm\); d\.appendChild\(meta\);\s*\n\s*opps\.appendChild\(d\);/.test(c4)
     && /acqLayer\.appendChild\(acq\);/.test(c4));
  ok('딴 카드에도 자리 표시가 붙는다', /acq\.className = 'q-oacq ' \+ seatAt\(/.test(c4));
  // 자리를 숫자로 박아 두면 경매대가 조금만 움직여도 카드가 그 위로 파고든다
  ok('세로 자리는 경매대를 재서 넣는다',
     /--q-side-acq/.test(cli) && /--q-side-bid/.test(cli)
     && /mat\.bottom - h\.top \+ gap/.test(cli));
  ok('CSS 는 그 값을 받아 쓴다', /top:var\(--q-side-acq/.test(html) && /top:var\(--q-side-bid/.test(html));
  // 안내 문구가 딴 카드와 같은 높이면 긴 문구의 꼬리가 카드에 가린다
  ok('안내 문구는 경매대 위에 있다',
     html.indexOf('<div id="q-status"></div>') < html.indexOf('<div id="q-mat">'));
  // 명패는 이름을 감싸는 테 — 내 프로필과 같은 모양이라야 판에서도 읽힌다
  ok('이름은 명패에 감싸인다', /\.q-oname > span:not\(\.q-obadge\):not\(\.q-human\)/.test(html));
  ok('등급 줄은 이름과 나뉜다', /\.q-opp \.q-ometa \{ border-top:/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
