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

// 염색약을 이어서 살 때 연출이 끊기지 않는가
{
  const fs2 = require('fs'), path2 = require('path');
  const c = fs2.readFileSync(path2.join(__dirname, '..', 'public/client.js'), 'utf8');
  const h = fs2.readFileSync(path2.join(__dirname, '..', 'public/index.html'), 'utf8');
  // 창은 하나뿐이라, 앞 판의 타이머가 살아 있으면 다음 판을 도중에 닫아 버린다
  ok('앞 연출의 타이머를 걷어낸다', /function dyeStop\(\)[\s\S]{0,120}clearInterval\(dyeSpin\)[\s\S]{0,60}clearTimeout\(dyeHide\)/.test(c));
  ok('새로 시작할 때 먼저 걷어낸다', /function dyeRoll\(result\) \{\s*\n\s*dyeStop\(\);/.test(c));
  ok('닫기 타이머도 손잡이로 잡아 둔다', /dyeHide = setTimeout/.test(c));
  ok('눌러서 건너뛸 수 있다', /ov\.onclick = \(\) => \{ dyeStop\(\);/.test(c));
  // 어두운 판 위의 기본 스크롤 막대가 하얀 네모처럼 보였다
  ok('스크롤 막대를 판 색으로', /scrollbar-color:rgba\(185,141,52,\.45\) transparent/.test(h)
     && /::-webkit-scrollbar-thumb[\s\S]{0,200}background:rgba\(185,141,52,\.45\)/.test(h));
  ok('교환소에도 걸린다', /\.gc-stage, \.lb-box, \.lb-list, \.gc-pane/.test(h));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
