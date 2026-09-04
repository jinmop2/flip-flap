// 인벤토리·상점 분류 — 같은 물건이 두 화면에서 같은 칸에 앉는지.
//
// 왜 보는가: 분류표(SHOP_GROUPS)가 한 벌뿐이어야 한다. 예전엔 상점만 묶고
// 인벤토리는 카탈로그 순서 그대로라, 카드백과 명패가 뒤섞여 뭘 가졌는지
// 안 읽혔다. 게다가 분류표가 낡아 아바타·승리 연출·도장·놓기 연출 넉 줄이
// 통째로 "그 밖에" 로 떨어져 있었다 — 새 종류를 넣고 표를 깜빡한 것이다.
const fs = require('fs');
const src = __dirname + '/..';
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const acc = fs.readFileSync(src + '/accounts.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('① 분류표는 한 벌');
{
  ok('SHOP_GROUPS 가 한 번만 정의된다', (cli.match(/const SHOP_GROUPS\s*=/g) || []).length === 1);
  ok('상점이 쓴다', /for \(const g of SHOP_GROUPS\)/.test(cli));
  ok('인벤토리도 같은 걸 쓴다',
     /renderMyInv[\s\S]{0,2200}?for \(const g of SHOP_GROUPS\)/.test(cli));
}

console.log('\n② 상점의 모든 종류가 분류된다');
{
  // 카탈로그에 실제로 있는 type 을 긁어, 분류표가 다 덮는지 본다.
  // 하드코딩한 목록끼리 비교하면 둘 다 같이 낡는다 — 원본에서 뽑는다.
  const types = new Set();
  const re = /type:\s*'([a-z_]+)'/g;
  let m; while ((m = re.exec(acc))) types.add(m[1]);
  ok('카탈로그에서 종류를 찾았다', types.size >= 8, `찾은 수 ${types.size}`);

  const gm = cli.match(/const SHOP_GROUPS = \[[\s\S]*?\n\];/);
  ok('분류표를 읽었다', !!gm);
  const covered = new Set();
  if (gm) { const r2 = /'([a-z_]+)'/g; let x; while ((x = r2.exec(gm[0]))) covered.add(x[1]); }

  // 상점에 안 나오는 내부 전용 종류는 빼고 본다
  const internal = new Set(['battle']);
  const missing = [...types].filter((t) => !covered.has(t) && !internal.has(t));
  ok('빠진 종류가 없다', missing.length === 0, missing.join(','));

  // 넉 줄이 뭉쳐 있던 그 종류들 — 다시 빠지지 않게 못을 박는다
  for (const t of ['avatar', 'victory', 'stamp', 'place'])
    ok(`${t} 이 제 칸을 가진다`, covered.has(t));
}

console.log('\n③ 인벤토리 화면');
{
  ok('머리글을 찍는다', /class="mi-cat"/.test(cli));
  ok('개수도 같이 적는다', /<span class="n">\$\{n\}<\/span>/.test(cli));
  // 격자 안의 머리글이라 한 줄을 통째로 차지해야 뒤 칸이 옆에 끼어들지 않는다
  ok('한 줄을 통째로 쓴다', /\.mi-cat \{[^}]*grid-column:1\/-1/.test(html));
  // .mi-head 는 이미 내 정보 윗줄이 쓰고 있었다 — 그 이름을 쓰면 상자 배경이 따라온다
  ok('내 정보 윗줄과 이름이 겹치지 않는다',
     !/class="mi-head"/.test(cli.slice(cli.indexOf('function renderMyInv'), cli.indexOf('function invEquip'))));
  ok('분류 안 된 것도 사라지지 않는다', /head\('그 밖에', rest\.length\)/.test(cli));
  ok('염색은 꾸미기 칸에 붙는다', /g\.types\.includes\('dye'\)/.test(cli));
  ok('빈 인벤토리 문구가 남아 있다', /아직 아이템이 없어요/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
