// 명패 효과·세트 보너스 — 실제로 보상이 그만큼 더 들어오는가.
// 돈이 걸린 계산이라 눈으로 보지 말고 수치로 확인한다.
const fs = require('fs');
const dir = '/tmp/ffplate';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

let seq = 0;
// 명패를 끼운 계정을 만들어 전문가 AI 를 한 판 이긴다 (보상이 고정이라 비교하기 좋다)
function playOnce(plate, extra = {}) {
  const id = 'plate' + (seq++) + 'x';
  const sr = a.signup(id, 'pw1234', id);
  if (!sr || !sr.token) throw new Error('가입 실패: ' + JSON.stringify(sr));
  const t = sr.token;
  const u = a.byToken(t);
  u.coins = 0; u.xp = 0;
  u.items = u.items || {};
  if (plate) { u.items[plate] = true; u.plate = plate; }
  Object.assign(u, extra);
  const r = a.recordResult(t, 'win', { vsBot: true, difficulty: 'expert', turns: 12, playtimeSec: 90 });
  return { r: r.rewards, u: a.byToken(t) };
}

console.log('\n① 기준 — 명패 없음');
const base = playOnce(null);
console.log(`    코인 ${base.r.coins} · 경험치 ${base.r.xp}`);
ok('보상이 들어옴', base.r.coins > 0 && base.r.xp > 0);
ok('명패 몫 없음', !base.r.plateCoin && !base.r.plateXp);

console.log('\n② 황금 명패 — 코인 +8%');
const gold = playOnce('np_gold');
const expGold = Math.round(base.r.coins * 0.08);
ok(`코인 +${expGold} (${base.r.coins} → ${gold.r.coins})`, gold.r.plateCoin === expGold,
   `기대 ${expGold} / 실제 ${gold.r.plateCoin}`);
ok('경험치는 그대로', gold.r.xp === base.r.xp);

console.log('\n③ 흑요석 명패 — 코인 +15% (황금보다 세다)');
const obs = playOnce('np_obsidian');
ok('흑요석 > 황금', obs.r.plateCoin > gold.r.plateCoin, `흑요석 ${obs.r.plateCoin} / 황금 ${gold.r.plateCoin}`);

console.log('\n④ 경험치 명패');
for (const [plate, rate] of [['np_hanji', 0.05], ['np_neon', 0.08], ['np_crystal', 0.12]]) {
  const g = playOnce(plate);
  const exp = Math.round(base.r.xp * rate);
  ok(`${plate} 경험치 +${exp}`, g.r.plateXp === exp, `기대 ${exp} / 실제 ${g.r.plateXp}`);
  ok(`${plate} 코인은 그대로`, !g.r.plateCoin);
}

console.log('\n⑤ 루비 명패 — 연승 보너스 1.5배');
{
  const plain = playOnce(null, { winStreak: 4 });
  const ruby = playOnce('np_ruby', { winStreak: 4 });
  ok('연승 보너스가 늘어남', ruby.r.streak > plain.r.streak, `일반 ${plain.r.streak} / 루비 ${ruby.r.streak}`);
  ok('1.5배', ruby.r.streak === plain.r.streak + Math.round(plain.r.streak * 0.5));
}

console.log('\n⑥ 세트 완성 보너스 — 네 가지를 다 맞춰 껴야 붙는다');
{
  const partial = playOnce('np_crystal', { cardBack: 'back_crystal', table: 'tbl_crystal' });  // 앞면 빠짐
  ok('3종만으로는 안 붙음', !partial.r.setName, `setName=${partial.r.setName}`);
  const full = playOnce('np_crystal', { cardBack: 'back_crystal', table: 'tbl_crystal', cardFace: 'face_crystal' });
  ok('4종 다 끼면 붙음', full.r.setName === '크리스탈', `setName=${full.r.setName}`);
  ok('세트가 명패보다 코인이 많음', full.r.plateCoin > partial.r.plateCoin
     || (full.r.plateXp > partial.r.plateXp));
  const mixed = playOnce('np_crystal', { cardBack: 'back_obsidian', table: 'tbl_crystal', cardFace: 'face_crystal' });
  ok('테마가 섞이면 안 붙음', !mixed.r.setName);
}

console.log('\n⑦ RP 는 절대 건드리지 않는다 (랭킹이 곧 RP 라서)');
{
  const src = fs.readFileSync(dir + '/accounts.js', 'utf8');
  const m = src.match(/const PLATE_FX = \{([\s\S]*?)\n\};/);
  ok('명패 효과에 rp 항목 없음', m && !/\brp\s*:/.test(m[1]));
  const m2 = src.match(/const SET_BONUS = \{([^}]*)\}/);
  ok('세트 보너스에 rp 항목 없음', m2 && !/\brp\s*:/.test(m2[1]));
}

console.log('\n⑧ 어뷰징으로 막힌 판에는 안 붙는다');
{
  const id = 'blocked1';
  const t = a.signup(id, 'pw1234', id).token;
  const u = a.byToken(t);
  u.items = u.items || {}; u.items.np_obsidian = true; u.plate = 'np_obsidian'; u.coins = 0;
  // 너무 짧은 판 → 보상 차단.
  // AI전 승리는 빨리 이겨도 실력으로 인정하므로(quickBotWin), 멀티로 재야 한다.
  const r = a.recordResult(t, 'win', { vsBot: false, turns: 1, playtimeSec: 2 });
  ok('보상 자체가 0', r.rewards.coins === 0);
  ok('명패 몫도 0', !r.rewards.plateCoin && !r.rewards.plateXp);
}

console.log('\n⑨ 이상한 명패 값에도 안 터진다');
{
  const id = 'weird1';
  const t = a.signup(id, 'pw1234', id).token;
  const u = a.byToken(t);
  u.plate = '__proto__';
  const r = a.recordResult(t, 'win', { vsBot: true, difficulty: 'expert', turns: 12, playtimeSec: 90 });
  ok('__proto__ 명패로도 정상 처리', r && r.rewards.coins > 0 && !r.rewards.plateCoin);
  u.plate = 'constructor';
  const r2 = a.recordResult(t, 'win', { vsBot: true, difficulty: 'expert', turns: 12, playtimeSec: 90 });
  ok('constructor 명패로도 정상 처리', r2 && !r2.rewards.plateCoin);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
