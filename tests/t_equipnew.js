// 새 슬롯 4종(아바타·낙찰도장·놓는이펙트·승리연출) 구매→장착→해제가 되는가.
//
// 꾸미기를 새로 만들 때는 서버 SLOT·클라 EQUIP_SLOT·프로필 내보내기 세 곳이
// 다 맞아야 장착이 된다. 한 군데만 빠져도 "사 놓고 못 끼우는" 상태가 되는데,
// 실제로 껴 보기 전까지는 모른다. tests/t_skinsync.js 가 표의 짝을 보고,
// 이 파일이 실제 동작을 본다.
const fs = require('fs');
const dir = '/tmp/ffequip';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

const t = a.signup('equipper', 'pw1234', '장착왕').token;
a.byToken(t).coins = 999999;

const CASES = [
  ['ava_rookie',   'avatar',  'avatar'],
  ['ava_king',     'avatar',  'avatar'],
  ['stamp_seal',   'stamp',   'winStamp'],
  ['stamp_crown',  'stamp',   'winStamp'],
  ['place_spark',  'place',   'placeFx'],
  ['place_ember',  'place',   'placeFx'],
  ['vfx_confetti', 'victory', 'victoryFx'],
  ['vfx_firework', 'victory', 'victoryFx'],
];

console.log('\n① 구매');
for (const [id] of CASES) ok(id, !a.buyItem(t, id).error);

console.log('\n② 장착 — 서버 슬롯에 값이 들어가는가');
for (const [id, , field] of CASES) {
  const r = a.equipItem(t, id);
  ok(`${id} → ${field}`, !r.error && a.byToken(t)[field] === id, r.error || `실제 ${a.byToken(t)[field]}`);
}

console.log('\n③ 프로필로 내보내지는가 (화면·남에게 보이려면 필요)');
{
  const p = a.byToken(t) && a.profileOf(a.byToken(t));
  for (const f of ['avatar', 'winStamp', 'victoryFx', 'placeFx'])
    ok(`프로필에 ${f}`, p[f] !== undefined, `값 ${p[f]}`);
}

console.log('\n④ 장착 해제');
for (const [, kind, field] of [['','avatar','avatar'], ['','stamp','winStamp'], ['','place','placeFx'], ['','victory','victoryFx']]) {
  const r = a.equipItem(t, null, kind);
  ok(`${kind} 해제`, !r.error && !a.byToken(t)[field], r.error || `남아있음 ${a.byToken(t)[field]}`);
}

console.log('\n⑤ 안 가진 걸 끼우려 하면 거부');
{
  const t2 = a.signup('nothave', 'pw1234', '무소유').token;
  ok('보유하지 않은 아바타 거부', !!a.equipItem(t2, 'ava_king').error);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
