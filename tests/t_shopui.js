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

console.log('① 파편 수량은 파편상점 버튼이 인다');
{
  ok('파편 칸이 있다', /id="shopShards"/.test(htm));
  ok('그 칸이 파편상점 버튼 안에 있다', /class="shop-entry se-shard"[\s\S]{0,240}id="shopShards"/.test(htm));
  ok('코인은 지갑에 남는다', /class="shop-wallet"><span class="sw-coin" id="shopCoins"/.test(htm));
  ok('둘을 한 곳에서 갱신한다', /function shopWallet\(\)/.test(cli));
  // 같은 숫자를 지갑과 버튼 두 군데 두면 어느 쪽을 봐야 하는지 알 수 없다
  ok('파편은 지갑에 또 안 적는다', !/sw-shard/.test(htm));
  ok('상점을 열면 갱신된다', /function renderShop\(\) \{\s*\n\s*shopWallet\(\);/.test(cli));
  const n = (cli.match(/shopWallet\(\)/g) || []).length;
  ok('쿠폰을 쓴 뒤에도 갱신된다', n >= 3, n + '곳');
}

console.log('② 입구는 작은 버튼 둘 (뽑기는 상품 칸으로 내려갔다)');
{
  ok('입구 줄이 있다', /class="shop-entries"/.test(htm));
  for (const [cls, fn] of [['se-shard', 'openShardShop'], ['se-cpn', 'openCoupon']])
    ok(cls + ' 버튼이 ' + fn + ' 로 간다', new RegExp('class="shop-entry ' + cls + '" onclick="' + fn + '\\(\\)"').test(htm));
  ok('둘이 한 줄을 나눠 쓴다', /\.shop-entries \{ display:flex;/.test(htm) && /\.shop-entry \{[\s\S]{0,80}flex:1;/.test(htm));
  ok('뽑기는 입구 버튼이 아니다', !/class="shop-entry se-gacha"/.test(htm));
  ok('뽑기는 상품 칸으로 그린다', /if \(it\.gacha\) \{/.test(cli) && /tile\.onclick = \(\) => openGacha\(\);/.test(cli));
  ok('꾸미기·기타 묶음에 붙는다', /if \(g\.types\.includes\('ticket'\)\) ordered\.push\(\{ gacha: true \}\);/.test(cli));
}

console.log('②-2 묶음 안은 희귀도 순');
{
  ok('희귀도 → 값 순으로 정렬한다',
     /shopTier\(a\) - shopTier\(b\) \|\| shopPrice\(a\) - shopPrice\(b\)/.test(cli));
  // 파편 전용품은 코인 값이 0 이라 그냥 비교하면 공짜처럼 맨 앞에 온다
  ok('파편도 값으로 환산해 견준다', /function shopPrice\(it\) \{ return it\.shard > 0 \? it\.shard \* 2\.2/.test(cli));
}

console.log('②-3 뽑기 창에는 교환소가 없다');
{
  ok('교환소 탭을 걷었다', !/id="gcTabExch"/.test(htm) && !/id="gcPaneExch"/.test(htm));
  ok('파편상점이 자기 창을 가진다', /id="shardModal"/.test(htm));
  ok('그 창에 목록과 지갑이 있다', /id="shardModal"[\s\S]{0,600}id="gcShop"/.test(htm)
     && /id="sdShards"/.test(htm));
  ok('ESC 로도 닫힌다', /\['shardModal',\s*\(\) => closeShardShop\(\)\]/.test(cli));
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
  ok('통로가 있다', /window\.openShardShop = async function/.test(cli));
  ok('상점을 닫고 자기 창을 편다',
     /openShardShop = async function[\s\S]{0,400}closeShop\(\)[\s\S]{0,200}shardModal'\)\.classList\.add\('show'\)/.test(cli));
  ok('목록을 그린다', /openShardShop = async function[\s\S]{0,600}renderExchange\(\);/.test(cli));
}

console.log('⑤ 새로 들인 20종이 표에 빠짐없이 올랐다');
{
  const acc = fs.readFileSync(path.join(__dirname, '..', 'accounts.js'), 'utf8');
  const art = fs.readFileSync(path.join(__dirname, '..', 'public/art.js'), 'utf8');
  const NEW = ['back_storm', 'np_storm', 'tbl_storm', 'face_storm',
               'back_origami', 'face_origami', 'stamp_crane',
               'back_jelly', 'tbl_jelly', 'ava_gummy',
               'back_pixel', 'face_pixel', 'np_pixel', 'ava_pixcat',
               'tbl_firework', 'np_firework', 'place_stamp', 'place_ripple',
               'ava_haetae', 'back_haetae'];
  const notInShop = NEW.filter((id) => !new RegExp('^\\s{2}' + id + ':', 'm').test(acc));
  ok('스무 종이 상점 카탈로그에 있다', notInShop.length === 0, notInShop.join(' '));
  // 같은 열쇠를 두 번 적으면 뒤엣것이 이겨 값이 조용히 바뀐다 (실제로 벼락·불꽃놀이가 그랬다)
  // SHOP 블록 안에서만 본다 — 파일 전체를 훑으면 PLATE_FX 같은 다른 표의
  // 같은 열쇠까지 중복으로 잡힌다.
  const shopBody = acc.match(/const SHOP = \{([\s\S]*?)\n\};/)[1];
  const ids = [...shopBody.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  ok('같은 상품을 두 번 적지 않았다', dup.length === 0, dup.join(' '));
  const noArt = NEW.filter((id) => id.startsWith('ava_')).filter((id) => !art.includes(id + ':'));
  ok('새 아바타는 그림이 있다', noArt.length === 0, noArt.join(' '));
}

console.log('⑥ 아이템은 꾹 누르면 설명이 뜬다');
{
  // 폰에는 마우스를 얹는다는 게 없어서 title 속성은 아무 소용이 없다.
  // 내 아이템 칸도, 경매판에 얹힌 덤·보너스 카드도 같은 장치를 쓴다.
  ok('누르는 장치가 있다', /function bindLongPress\(el, show\)/.test(cli));
  ok('보여 줄 것을 밖에서 정할 수 있다', /const tell = show \|\| \(\(\) => explainItem\(el\.dataset\.item\)\);/.test(cli));
  ok('내 아이템 칸에 걸려 있다', /slots\.querySelectorAll\('\.ib-slot\[data-item\]'\)\.forEach\(bindLongPress\);/.test(cli));
  // 판에 덤이 떴는데 그게 뭔지 모르면, 이겨야 할지 져야 할지도 못 정한다
  ok('경매판 아이템 카드에도 걸려 있다', /bindLongPress\(el, \(\) => explainLotItem\(card, kind\)\);/.test(cli));
  ok('판 위 설명은 누가 갖는지를 말한다', /function explainLotItem\(card, kind\)/.test(cli)
     && /진 쪽<\/b>이 가져요/.test(cli) && /뒤집은 사람이 그 자리에서 가져요/.test(cli));
  ok('누르는 중인 게 보인다', /\.item-card\.lp-hold/.test(htm) && /\.ib-slot\.lp-hold/.test(htm));
  // 설명을 보려다 물건을 써 버리면 안 된다
  ok('설명 뒤 따라오는 click 은 삼킨다', /if \(fired\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); fired = false; \}/.test(cli));
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
