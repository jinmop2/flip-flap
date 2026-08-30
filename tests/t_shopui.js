// 상점 머리 — 지갑·입구 버튼·쿠폰 창.
//
// 왜 이렇게 두었나:
//   쿠폰 입력칸이 상점 맨 위에서 늘 한 줄을 먹고 있었다. 쿠폰은 어쩌다 한 번
//   쓰는 것이라, 폰에서 물건 칸을 그만큼 밀어내면서까지 펼쳐 둘 이유가 없다.
//   파편상점(교환소)은 반대로 들어가는 길이 아예 없어, 파편 전용품을 눌러 봐야
//   "교환소에서 사세요" 를 알 수 있었다.
//   그리고 파편이 얼마 있는지는 상점 어디에도 안 나왔다 — 파편으로만 살 수 있는
//   물건이 있는데 잔고가 안 보이면 왜 못 사는지 알 길이 없다.
const fs = require('fs');
const path = require('path');
const htm = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 지갑에 파편이 보인다');
{
  ok('상점 지갑에 파편 칸이 있다', /id="shopShards"/.test(htm));
  ok('코인 칸도 그대로다', /id="shopCoins"/.test(htm));
  ok('둘을 한 곳에서 갱신한다', /function shopWallet\(\)/.test(cli));
  ok('파편은 계정 값을 그대로 쓴다', /shopShards'\);[\s\S]{0,200}myAccount && myAccount\.shards/.test(cli));
  // 상점을 열 때도, 물건을 살 때도 갱신돼야 한다
  ok('상점을 열면 갱신된다', /function renderShop\(\) \{\s*\n\s*shopWallet\(\);/.test(cli));
  const n = (cli.match(/shopWallet\(\)/g) || []).length;
  ok('쿠폰을 쓴 뒤에도 갱신된다', n >= 3, n + '곳');
}

console.log('② 입구는 작은 버튼 셋');
{
  ok('입구 줄이 있다', /class="shop-entries"/.test(htm));
  for (const [cls, fn] of [['se-gacha', 'openGacha'], ['se-shard', 'openShardShop'], ['se-cpn', 'openCoupon']])
    ok(cls + ' 버튼이 ' + fn + ' 로 간다', new RegExp('class="shop-entry ' + cls + '" onclick="' + fn + '\\(\\)"').test(htm));
  ok('셋이 한 줄을 나눠 쓴다', /\.shop-entries \{ display:flex;/.test(htm) && /\.shop-entry \{[\s\S]{0,80}flex:1;/.test(htm));
  // 예전의 큰 뽑기 버튼은 없앴다 (같은 일을 하는 통로가 둘이면 헷갈린다)
  ok('예전 큰 뽑기 버튼은 없앴다', !/gacha-entry" onclick="openGacha/.test(htm));
}

console.log('③ 쿠폰은 작은 창에서');
{
  ok('쿠폰 창이 따로 있다', /id="cpnModal"/.test(htm));
  ok('입력칸이 그 창 안에 있다', /id="cpnModal"[\s\S]{0,700}id="cpnInput"/.test(htm));
  // 상점 본문에는 더 이상 없어야 한다
  const shopStart = htm.indexOf('id="shopModal"');
  const shopEnd = htm.indexOf('id="cpnModal"');
  ok('상점 본문에는 입력칸이 없다', shopStart >= 0 && htm.slice(shopStart, shopEnd).indexOf('id="cpnInput"') < 0);
  ok('여닫는 함수가 있다', /window\.openCoupon = function/.test(cli) && /window\.closeCoupon = function/.test(cli));
  ok('ESC 로도 닫힌다', /\['cpnModal',\s*\(\) => closeCoupon\(\)\]/.test(cli));
  ok('폰 자판 때문에 한 박자 두고 focus', /setTimeout\(\(\) => \{ const i = document\.getElementById\('cpnInput'\); if \(i\) i\.focus\(\); \}, 120\)/.test(cli));
  ok('쓰고 나면 창을 접는다', /setTimeout\(\(\) => closeCoupon\(\), 1800\)/.test(cli));
}

console.log('④ 파편상점으로 바로 간다');
{
  ok('통로가 있다', /window\.openShardShop = function/.test(cli));
  ok('상점을 닫고 교환소 탭을 편다', /openShardShop = function[\s\S]{0,300}closeShop\(\)[\s\S]{0,200}gachaTab\('exch'\)/.test(cli));
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
