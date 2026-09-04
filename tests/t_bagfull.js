// 가방이 꽉 찼을 때 — 아이템은 최대 3개다.
//
// 여태 넷째 아이템은 소리 없이 사라졌다. 덤은 "일부러 져서 가져오는" 물건이라
// 더 나빴다: 경매를 내주고 기다렸는데 아무 일도 안 일어난 것처럼 보였다.
// 못 받았으면 못 받았다고 말해야 한다.
const fs = require('fs');
const path = require('path');
const IT = require('../items.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('① 가방은 셋까지');
{
  const g = { items: { 1: [], 2: [] } };
  ok('상한이 3 이다', IT.MAX_HOLD === 3, String(IT.MAX_HOLD));
  ok('빈 가방은 안 찼다', IT.bagFull(g, 1) === false);
  const ids = Object.keys(IT.CATALOG).slice(0, 4);
  for (let i = 0; i < 3; i++) IT.give(g, 1, ids[i]);
  ok('셋을 넣으면 찼다', IT.bagFull(g, 1) === true, JSON.stringify(g.items[1]));
  ok('넷째는 안 들어간다', IT.give(g, 1, ids[3]) === null);
  ok('그래도 셋 그대로다', g.items[1].length === 3, String(g.items[1].length));
  ok('상대 가방은 그대로 비어 있다', IT.bagFull(g, 2) === false);
}

console.log('\n② 못 받았으면 말한다');
{
  const srv = read('server.js');
  ok('덤을 못 받으면 알린다', /bagFull\(g, loser\)[\s\S]{0,300}emit\('tip_lost'/.test(srv));
  ok('보너스를 못 받으면 알린다', /b\.lost[\s\S]{0,200}emit\('bonus_lost'/.test(srv));
  // 양쪽 다 봐야 한다 — 상대 아이템이 몇 개인지가 이 판의 공개 정보다
  ok('덤 소실은 둘 다 본다', /emit\('tip_lost'[\s\S]{0,80}\}\);\n\s*\}/.test(srv)
     && /room\.players\.forEach[\s\S]{0,200}tip_lost/.test(srv));
  ok('보너스 소실도 둘 다 본다', /room\.players\.forEach[\s\S]{0,200}bonus_lost/.test(srv));

  const i2 = read('items2.js');
  ok('보너스는 찼는지 먼저 본다', /bagFull\(game, game\.auctioneer\)/.test(i2));
  ok('못 준 것을 lost 로 넘긴다', /lost: true/.test(i2));

  const cli = read('public/client.js');
  ok('화면이 덤 소실을 받는다', /socket\.on\('tip_lost'/.test(cli));
  ok('화면이 보너스 소실을 받는다', /socket\.on\('bonus_lost'/.test(cli));
  ok('왜 못 받았는지 말한다', /가방이 꽉 차/.test(cli));

  // 그물 없이 두는 판도 같은 말을 해야 한다 — 온라인과 갈라지면 규칙이 둘이 된다
  const off = read('public/offline.js');
  ok('오프라인도 덤 소실을 알린다', /say\('tip_lost'/.test(off));
  ok('오프라인도 보너스 소실을 알린다', /say\('bonus_lost'/.test(off));
  ok('오프라인도 먼저 찼는지 본다', /IT\.bagFull\(g, loser\)/.test(off));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
