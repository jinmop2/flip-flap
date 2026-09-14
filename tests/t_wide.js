// 넓은 화면(PC 웹)에서 창이 한쪽으로 쏠리지 않는가.
//
// 폰에서는 상자가 화면 너비라 가운데고 뭐고 없다. 넓어지면서 max-width 가
// 걸리는 순간부터 "어디에 두느냐" 가 생기는데, 그 값을 안 정해 두면
// 왼쪽에 붙는다. 폰으로만 보면 끝까지 모른다.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

// 한 규칙의 본문만 잘라 본다
const ruleBody = (selector) => {
  const i = html.indexOf(selector);
  if (i < 0) return '';
  const a = html.indexOf('{', i), b = html.indexOf('}', a);
  return a < 0 || b < 0 ? '' : html.slice(a + 1, b);
};

console.log('① 탭으로 오가는 창들 (미션·친구·클랜·뽑기)');
{
  // 이 창들은 .lb-modal 의 justify-content:center 를 덮어쓴다. 예전에는
  // stretch 로 덮었는데, flex 에서 stretch 는 왼쪽 붙이기로 동작한다 —
  // max-width 가 걸린 640·720px 상자가 넓은 화면에서 왼쪽에 붙어 버렸다.
  const body = ruleBody('#missionModal, #friendsModal, #clanModal, #gachaModal');
  ok('그런 규칙이 있다', !!body);
  ok('좌우는 가운데다', /justify-content:\s*center/.test(body), body.trim().slice(0, 80));
  ok('왼쪽 붙이기로 돌아가지 않았다', !/justify-content:\s*(stretch|flex-start|start|left)/.test(body));
  // 위아래로 늘리는 것은 일부러다 — 탭 화면은 높이를 다 쓴다
  ok('위아래로는 늘린다', /align-items:\s*stretch/.test(body));
}

console.log('\n② 그 창들의 상자에 폭 상한이 있다');
{
  // 상한이 없으면 1920 에서 한 줄이 화면 끝까지 늘어져 읽기 어렵다
  const tab = ruleBody('.lb-box.tab-box { max-width:640px');
  ok('넓어지면 640px 로 묶는다', /max-width:\s*640px/.test(html) && /@media \(min-width:700px\)/.test(html));
  ok('좁은 화면에서는 상한이 없다', /\.lb-box\.tab-box \{[^}]*max-width:\s*none/.test(html));
}

console.log('\n③ 랭킹 — 시상대까지 같이 모은다');
{
  // 제목과 목록만 적어 뒀더니 시즌 줄과 시상대(1·2·3위)가 빠져, 목록은
  // 가운데인데 시상대만 화면 끝까지 늘어나 양옆이 잘렸다.
  const body = ruleBody('.lb-box.rank-box > *');
  ok('직계 자식을 모두 모은다', !!body, '.lb-box.rank-box > * 규칙이 없다');
  ok('폭을 묶는다', /max-width:\s*620px/.test(body));
  ok('가운데로 민다', /margin-left:\s*auto/.test(body) && /margin-right:\s*auto/.test(body));
  // 자손 선택자로 하면 줄 안의 칭호 칸까지 620px 이 되어 닉네임·전적·RP 가
  // 화면 밖으로 밀려난다 — 예전에 그렇게 깨진 적이 있다
  ok('자손이 아니라 자식이다', /\.lb-box\.rank-box > \*/.test(html) && !/\.lb-box\.rank-box \.lb-title\s*\{/.test(html));
}

console.log('\n④ 솔로·멀티는 화면을 통째로 쓴다 (일부러)');
{
  const body = ruleBody('#soloModal .lb-box, #multiModal .lb-box');
  ok('상자에는 상한이 없다', /max-width:\s*none/.test(body));
  // 대신 안에 든 것들을 가운데로 세운다 — 예전에 여섯 모드가 왼쪽 절반에만
  // 몰려 보이던 것이 이 자리였다
  ok('안에 든 것을 가운데로 세운다',
     /#soloModal \.lb-box > \*, #multiModal \.lb-box > \* \{[^}]*margin-inline:\s*auto/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
