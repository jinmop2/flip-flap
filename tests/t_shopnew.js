// 새로 추가한 상점 상품 — 구매·장착·중복구매 방지가 되는지
const fs = require('fs');
const dir = '/tmp/ffshop';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };

const NEW = ['back_crystal', 'np_crystal', 'tbl_crystal', 'face_crystal',
             'back_obsidian', 'back_hanji', 'emote_taunt'];
const SLOT = { cardback: 'cardBack', plate: 'plate', table: 'table', cardface: 'cardFace' };

const t = a.signup('shopper', 'pw1234', '상점왕').token;
const me = () => a.byToken(t);
me().coins = 999999;

console.log('\n① 카탈로그에 있는가');
for (const id of NEW) {
  const it = (a.shopList ? a.shopList() : []).find((x) => x.id === id);
  ok(id + ' 목록에 있음', !!it);
}

console.log('\n② 구매');
for (const id of NEW) {
  const r = a.buyItem(t, id);
  ok(id + ' 구매 성공', r && !r.error);
}

console.log('\n③ 중복 구매는 막힌다');
for (const id of NEW) {
  const r = a.buyItem(t, id);
  ok(id + ' 재구매 거부', !!(r && r.error));
}

console.log('\n④ 장착 — 슬롯에 제대로 들어가는가');
const list = a.shopList ? a.shopList() : [];
for (const id of NEW) {
  const it = list.find((x) => x.id === id);
  if (!it || !SLOT[it.type]) continue;
  const r = a.equipItem(t, id);
  ok(id + ' 장착 (' + SLOT[it.type] + ')', !r.error && me()[SLOT[it.type]] === id);
}

console.log('\n⑤ 이모트 팩은 슬롯이 아니라 보유로 남는다');
ok('emote_taunt 보유', !!me().items.emote_taunt);

console.log('\n⑥ 없는 상품·프로토타입 오염 방어');
ok('없는 상품 거부', !!a.buyItem(t, 'back_nonexistent').error);
ok('__proto__ 거부', !!a.buyItem(t, '__proto__').error);
ok('constructor 거부', !!a.buyItem(t, 'constructor').error);

console.log('\n⑦ 돈이 모자라면 못 산다');
const t2 = a.signup('poorman', 'pw1234', '무일푼').token;
a.byToken(t2).coins = 10;
ok('잔액 부족 거부', !!a.buyItem(t2, 'back_crystal').error);
ok('잔액 안 깎임', a.byToken(t2).coins === 10);

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
