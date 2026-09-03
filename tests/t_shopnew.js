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
  ok('스크롤 막대를 판 색으로', /scrollbar-color:rgba\(131,150,180,\.45\) transparent/.test(h)
     && /::-webkit-scrollbar-thumb[\s\S]{0,200}background:rgba\(131,150,180,\.45\)/.test(h));
  ok('교환소에도 걸린다', /\.gc-stage, \.lb-box, \.lb-list, \.gc-pane/.test(h));
}

// 물감(닉네임 염색)은 이름이 나오는 자리마다 따라가야 한다.
// 로비 프로필과 판 안 프로필에만 붙어 있어서, 정작 남이 내 이름을 보는
// 자리(대기실 좌석·방 목록·친구·클랜·채팅)에서는 맹물이었다.
{
  const fs3 = require('fs'), path3 = require('path');
  const cli = fs3.readFileSync(path3.join(__dirname, '..', 'public/client.js'), 'utf8');
  const c4 = fs3.readFileSync(path3.join(__dirname, '..', 'public/client4.js'), 'utf8');
  const srv = fs3.readFileSync(path3.join(__dirname, '..', 'server.js'), 'utf8');
  const acc = fs3.readFileSync(path3.join(__dirname, '..', 'accounts.js'), 'utf8');

  ok('대기실 좌석', /ws-nick\$\{ncClass\(s2\.profile && s2\.profile\.nickColor\)\}/.test(cli));
  ok('방 목록의 방장', /hostColor: \(r\.profiles && r\.profiles\[0\] && r\.profiles\[0\]\.nickColor\)/.test(srv)
     && /ncClass\(r\.hostColor\)/.test(cli));
  ok('친구 목록', /soc-nick">\$\{clan\}<span class="\$\{ncClass\(f\.nickColor\)/.test(cli));
  ok('클랜 멤버·신청자', /ncClass\(m\.nickColor\)/.test(cli));
  ok('인게임 채팅 친구 목록', /gc-frow[^`]*ncClass\(f\.nickColor\)/.test(cli));
  // 클랜 채팅도 1:1 도 gcPaint 한 곳에서 그린다. 받은 메시지를 손으로 이어
  // 붙이던 자리는 없앴다 — 그러면 날짜 구분선과 묶음이 어긋난다.
  ok('클랜 채팅 쓴 사람', /gc-who\$\{ncClass\(m\.nickColor\)\}/.test(cli)
     && /nickColor: msg\.nickColor/.test(cli));
  ok('채팅 기록에 물감이 실린다', /nickColor: \(w && w\.nickColor\) \|\| null/.test(acc));
  ok('다인전 초대 목록', /q-invnm\$\{typeof ncClass === 'function' \? ncClass\(f\.nickColor\)/.test(c4));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
