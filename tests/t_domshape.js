// 화면 뼈대 — 판(#game·#game4·#mini)이 팝업 안으로 들어가면 통째로 안 보인다.
//
// 실제로 그렇게 됐다. 팝업에서 버튼 몇 개를 잘라내면서 닫는 태그를 하나 더 지웠고,
// 그 팝업이 뒤에 오는 것들을 전부 삼켜 #game 이 display:flex 인데 0×0 이 됐다.
// 눈으로는 "게임이 안 열린다" 로만 보여서 원인을 찾는 데 한참 걸린다.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// <div> 열고 닫히는 깊이를 훑어 각 id 가 몇 겹 안에 있는지 잰다
function depths(src) {
  const out = {};
  let depth = 0;
  const re = /<div\b([^>]*)>|<\/div>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0] === '</div>') { depth--; continue; }
    const attrs = m[1] || '';
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (id) out[id] = depth;
    // 자기 닫힘 div 는 HTML 에 없다
    depth++;
  }
  out.__final = depth;
  return out;
}

console.log('① 태그 수가 맞는다');
{
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  ok('div 열림·닫힘이 같다', open === close, `${open} vs ${close}`);
}

console.log('\n② 판은 맨 바깥에 있다');
const d = depths(html);
{
  ok('깊이 계산이 끝에서 0으로 닫힌다', d.__final === 0, String(d.__final));
  for (const id of ['game', 'game4', 'mini', 'lobby', 'title']) {
    ok(`#${id} 가 맨 바깥`, d[id] === 0, `깊이 ${d[id]}`);
  }
}

console.log('\n③ 팝업도 맨 바깥에 있다');
{
  // 팝업이 다른 팝업 안에 들어가면 배경 클릭·ESC 가 엉킨다
  const modals = ['lbModal', 'shopModal', 'quadModal', 'gachaModal', 'createModal', 'codeModal',
    'rulesModal', 'rules4Modal', 'rulesItemModal', 'rulesMiniModal', 'miniModal', 'tourModal'];
  const nested = modals.filter((id) => d[id] !== undefined && d[id] !== 0);
  ok('팝업이 서로 겹쳐 들어가지 않았다', nested.length === 0,
     nested.map((id) => `${id}=${d[id]}`).join(','));
  const missing = modals.filter((id) => d[id] === undefined);
  ok('팝업이 다 있다', missing.length === 0, missing.join(','));
}

console.log('\n④ 판 위에 뜬 칸이 손패 탭을 삼키지 않는다');
{
  // #mebar(프로필·이모트)는 오른쪽 아래에 떠 있어 손패 끝을 덮는다.
  // 칸 자체가 탭을 먹으면 그 자리의 카드가 안 눌린다 — 실제로 아이템전에서 그랬다.
  ok('떠 있는 칸은 탭을 통과시킨다',
     /#mebar, #itemBar, #oppbar \{ pointer-events:none; \}/.test(html));
  ok('그 안의 누를 것들만 받는다',
     /#mebar > \*, #itemBar > \*, #oppbar > \*/.test(html)
     && /#mebar \.emote-wrap, #mebar \.game-pcard, #itemBar \.ib-slot \{ pointer-events:auto; \}/.test(html));
}

console.log('\n⑤ 랭킹은 화면을 통째로 쓴다');
{
  // 창의 여백(로비에서는 메뉴바 자리)을 지켜야 하므로 100dvh 가 아니라 100%
  ok('전체화면 상자', /\.lb-box\.rank-box \{[\s\S]{0,200}height:100%/.test(html));
  ok('목록만 스크롤한다', /\.lb-box\.rank-box #lbList \{[\s\S]{0,120}overflow-y:auto/.test(html));
  // 자손이 아니라 직계여야 한다 — 자손이면 줄 안의 칭호 칸까지 늘어난다
  ok('넓은 화면에서는 가운데로', /min-width:700px[\s\S]{0,400}rank-box > \.lb-title/.test(html));
  ok('줄 안의 칭호는 안 늘어난다', /\.lb-row \.lb-title \{[^}]*flex-grow:0/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
