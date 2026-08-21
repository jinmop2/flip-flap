// 파편을 실제로 쓸 수 있는가.
//
// 교환 로직은 처음부터 서버에 있었는데 화면에 누를 데가 없어서
// 파편이 쌓이기만 하고 쓸 곳이 없었다. 그 상태로 되돌아가지 않게 못 박는다.
//   ① 값이 등급별로 다른가 (예전엔 300 고정이라 전설 말고는 죽은 선택지였다)
//   ② 서버가 목록을 내려주는가 · 값을 클라이언트 말이 아니라 서버가 정하는가
//   ③ 화면에 교환소가 실제로 배선돼 있는가
const fs = require('fs');
const src = __dirname + '/..';
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const accSrc = fs.readFileSync(src + '/accounts.js', 'utf8');

// 실제 계정 파일을 건드리지 않게 임시 디렉터리에서 돌린다 (t_gacha.js 와 같은 방식)
const dir = '/tmp/ffshard';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(src + '/accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(src + '/node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

const info = a.gachaInfo();

console.log('\n① 교환가가 등급별로 다른가');
{
  const cost = {};
  for (const r of info.rates) cost[r.tier] = r.cost;
  ok('네 등급 모두 값이 있다', ['common', 'rare', 'epic', 'legend'].every((t) => cost[t] > 0),
     JSON.stringify(cost));
  ok('등급이 오를수록 비싸다',
     cost.common < cost.rare && cost.rare < cost.epic && cost.epic < cost.legend,
     JSON.stringify(cost));
  // 예전 사고: 전 등급 300 고정이라, 중복 시 5파편 주는 일반품이
  // 100파편 주는 전설과 같은 값이었다 → 전설 외에는 아무도 안 고른다.
  ok('전 등급 같은 값이 아니다', new Set(Object.values(cost)).size === 4);

  // 값은 "그 등급 중복 보상" 에 비례해야 한다. 안 그러면 어떤 등급이
  // 다른 등급에 지배당해 선택지가 죽는다.
  const bad = info.rates.filter((r) => {
    const mult = r.cost / r.shard;
    return mult < 5 || mult > 15;      // 중복 보상의 5~15배 안
  }).map((r) => `${r.tier}=${(r.cost / r.shard).toFixed(1)}배`);
  ok('중복 보상 대비 배수가 등급끼리 비슷하다', bad.length === 0, bad.join(' '));
}

console.log('\n② 전설 교환가가 천장과 균형이 맞는가');
{
  // 전부 보유한 상태에서 1회당 기대 파편
  const perRoll = info.rates.reduce((s, r) => s + r.rate * r.shard, 0);
  const legendCost = info.rates.find((r) => r.tier === 'legend').cost;
  const rolls = legendCost / perRoll;
  // 천장이 무작위 전설 하나를 주는 횟수와 비슷해야 한다.
  //   더 싸면 아무도 뽑지 않고 교환만 하고,
  //   더 비싸면 교환이 무의미해진다 (어차피 천장이 먼저 온다).
  ok('전설 교환 ≈ 천장 횟수', Math.abs(rolls - info.pity) <= info.pity * 0.35,
     `${rolls.toFixed(0)}회 vs 천장 ${info.pity}회`);
  console.log(`     1회당 기대 파편 ${perRoll.toFixed(1)} · 전설 ${legendCost}파편 = ${rolls.toFixed(0)}회분`);
}

console.log('\n③ 교환 목록을 서버가 내려주는가');
{
  ok('pool 이 있다', Array.isArray(info.pool) && info.pool.length > 0);
  const poolIds = new Set((info.pool || []).map((p) => p.id));
  const tierIds = [];
  for (const t of ['common', 'rare', 'epic', 'legend']) tierIds.push(...a.GACHA_TIER[t]);
  ok('뽑기에 나오는 건 전부 교환도 된다',
     tierIds.every((id) => poolIds.has(id)),
     '빠진 것: ' + tierIds.filter((id) => !poolIds.has(id)).join(' '));
  ok('목록마다 값·이름·등급이 있다',
     (info.pool || []).every((p) => p.cost > 0 && p.name && p.tier && p.id));
  const byTier = {};
  for (const r of info.rates) byTier[r.tier] = r.cost;
  // 뽑기에서 나오는 것은 등급값을, 파편 전용은 저마다의 값을 쓴다
  ok('뽑기 상품의 값이 등급표와 같다',
     (info.pool || []).filter((p) => !p.only).every((p) => p.cost === byTier[p.tier]));
}

console.log('\n③-b 파편으로만 살 수 있는 줄');
{
  const only = (info.pool || []).filter((p) => p.only);
  ok('파편 전용품이 있다', only.length > 0, String(only.length) + '종');
  ok('전용품은 tier 가 only', only.every((p) => p.tier === 'only'));
  ok('전용품마다 값이 있다', only.every((p) => p.cost > 0));

  // 뽑기에서 나오면 "전용" 이 아니다
  const inGacha = [];
  for (const t of ['common', 'rare', 'epic', 'legend']) inGacha.push(...a.GACHA_TIER[t]);
  const leaked = only.filter((p) => inGacha.includes(p.id));
  ok('뽑기 풀에는 안 들어 있다', leaked.length === 0, leaked.map((p) => p.id).join(' '));

  // 코인으로 사지면 "파편으로만" 이 아니다
  const t = a.signup('onlyman', 'pw1234', '전용시험').token;
  const u = a.byToken(t);
  u.coins = 1e9; u.items = {}; u.shards = 0;
  const bought = only.filter((p) => !a.buyItem(t, p.id).error);
  ok('코인으로는 못 산다', bought.length === 0, bought.map((p) => p.id).join(' '));

  // 파편으로는 살 수 있어야 한다.
  // 스포이드는 "지금 색" 을 담는 물건이라 색이 없으면 못 산다 — 하나 칠해 둔다.
  u.nickColor = 'blue';
  const one = only[0];
  u.shards = one.cost;
  const r = a.exchangeShard(t, one.id);
  ok('파편으로는 살 수 있다', !!(r && r.ok), r && r.error);
  ok('제 값이 나간다', a.byToken(t).shards === 0);
  ok('실제로 보유하게 된다', !!a.byToken(t).items[one.id]);

  // 상점 화면에서 "🪙 0" 으로 뜨면 공짜처럼 보이고, 눌러도 거절당한다.
  // 실제로 그렇게 떴었다. 값은 상점 목록에 실려 나가야 화면이 구분할 수 있다.
  const listed = a.shopList().filter((x) => x.shard > 0);
  ok('상점 목록에 파편 값이 실려 나간다', listed.length === only.length,
     `${listed.length} / ${only.length}`);
  ok('코인 값은 0 이다', listed.every((x) => !x.price));
  ok('화면이 파편 값으로 바꿔 적는다', /it\.shard > 0.*파편/s.test(cli));
  ok('구매 버튼도 교환소로 보낸다', /it\.shard > 0[\s\S]{0,220}gachaTab\('exch'\)/.test(cli));
  ok('파편 값 색이 따로 있다', /\.pr\.shard\s*\{/.test(html));
}

console.log('\n④ 교환이 실제로 동작하는가');
{
  const t = a.signup('shardman', 'pw1234', '파편러').token;
  const me = a.byToken(t);
  me.items = {}; me.shards = 0;

  // 전설 하나를 목표로 잡는다
  const target = a.GACHA_TIER.legend[0];
  const legendCost = info.rates.find((x) => x.tier === 'legend').cost;
  const commonTarget = a.GACHA_TIER.common[0];
  const commonCost = info.rates.find((x) => x.tier === 'common').cost;

  ok('파편 0 이면 거부', !!a.exchangeShard(t, target).error);

  // 일반품 값만큼만 준다 → 일반은 되고 전설은 안 돼야 한다
  me.shards = commonCost;
  ok('일반 값만큼 있으면 전설은 거부', !!a.exchangeShard(t, target).error);
  const c1 = a.exchangeShard(t, commonTarget);
  ok('일반은 교환된다', !!(c1 && c1.ok), JSON.stringify(c1));
  ok('일반 값만 빠져나간다', me.shards === 0,
     '남은 ' + me.shards);
  ok('실제로 보유하게 된다', !!me.items[commonTarget]);
  ok('이미 가진 건 거부', !!a.exchangeShard(t, commonTarget).error);

  // 전설
  me.shards = legendCost;
  const c2 = a.exchangeShard(t, target);
  ok('전설도 교환된다', !!(c2 && c2.ok));
  ok('전설 값이 빠져나간다', me.shards === 0);
  ok('응답이 낸 값을 알려준다', c2.cost === legendCost, String(c2 && c2.cost));

  // 값을 클라이언트가 못 정한다 — 인자로 받지 않는 게 유일한 방어다
  ok('exchangeShard 는 값을 인자로 받지 않는다', a.exchangeShard.length === 2,
     '인자 ' + a.exchangeShard.length + '개');

  console.log('\n⑤ 나쁜 입력');
  ok('없는 아이템 거부', !!a.exchangeShard(t, 'nope_nope').error);
  ok('뽑기 밖 상품 거부', !!a.exchangeShard(t, 'nick_change').error);
  ok('__proto__ 거부', !!a.exchangeShard(t, '__proto__').error);
  ok('constructor 거부', !!a.exchangeShard(t, 'constructor').error);
  ok('hasOwnProperty 거부', !!a.exchangeShard(t, 'hasOwnProperty').error);
  ok('없는 토큰 거부', !!a.exchangeShard('없는토큰', commonTarget).error);
  ok('오염 안 됨', ({}).polluted === undefined);
}

console.log('\n⑤-b 파편 명패 효과 (파편 획득 +10%)');
{
  const t = a.signup('plateman', 'pw1234', '명패시험').token;
  const u = a.byToken(t);
  ok('파편 명패에 효과가 붙어 있다', (a.bonusOf({ plate: 'np_shard' }).shard || 0) > 0);
  ok('다른 명패엔 안 붙는다', !(a.bonusOf({ plate: 'np_gold' }).shard || 0));
  ok('명패가 없어도 터지지 않는다', (a.bonusOf({}).shard || 0) === 0);

  // 실제로 중복 파편이 더 붙는지.
  // 합계를 비교하면 등급이 무작위라 편차에 묻힌다 — 실제로 40회씩 돌렸을 때
  // 645 vs 661 이 나와서, 10% 가 붙었는지 우연인지 구분이 안 됐다.
  // 그래서 뽑기가 돌려준 등급별 값을 하나하나 기대치와 맞춰 본다.
  const rollAllDup = (plate, n) => {
    u.items = {}; u.shards = 0; u.coins = 1e9; u.plate = plate;
    // 풀 전체를 미리 보유시키면 다음 뽑기는 반드시 중복이다
    for (const tier of ['common', 'rare', 'epic', 'legend'])
      for (const id of a.GACHA_TIER[tier]) u.items[id] = true;
    return a.rollGacha(t, n).results;
  };
  const baseOf = {};
  for (const r of info.rates) baseOf[r.tier] = r.shard;

  const plainRes = rollAllDup(null, 10);
  ok('명패가 없으면 기본값 그대로',
     plainRes.every((g) => g.dup && g.shard === baseOf[g.tier]),
     plainRes.map((g) => `${g.tier}:${g.shard}`).join(' '));

  const rate = a.bonusOf({ plate: 'np_shard' }).shard;
  const boostRes = rollAllDup('np_shard', 10);
  const want = (tier) => baseOf[tier] + Math.round(baseOf[tier] * rate);
  ok('파편 명패를 차면 등급마다 정확히 더 받는다',
     boostRes.every((g) => g.dup && g.shard === want(g.tier)),
     boostRes.map((g) => `${g.tier}:${g.shard}(기대 ${want(g.tier)})`).join(' '));
  ok('실제로 늘어난 값이다', boostRes.every((g) => g.shard > baseOf[g.tier]),
     '올림 때문에 0이 되면 효과가 없는 것과 같다');
  console.log(`     +${Math.round(rate * 100)}% — ` +
    ['common', 'rare', 'epic', 'legend'].map((x) => `${x} ${baseOf[x]}→${want(x)}`).join(' · '));

  // RP 에는 절대 안 붙어야 한다 (랭킹이 RP 순서라 제로섬)
  const src = accSrc.slice(accSrc.indexOf('const PLATE_FX'), accSrc.indexOf('const PLATE_FX') + 900);
  ok('명패 효과에 rp 가 없다', !/\brp:/.test(src));
}

console.log('\n⑥ 화면에 교환소가 배선돼 있는가');
{
  ok('교환소 탭 버튼', html.includes('id="gcTabExch"'));
  ok('파편 전용 칸 CSS', /\.gc-buy\.t-only\s*\{/.test(html));
  ok('전용품을 따로 묶어 보여준다', /파편으로만 얻는 것/.test(cli));
  ok('교환소 화면', html.includes('id="gcPaneExch"'));
  ok('상품이 들어갈 자리', html.includes('id="gcShop"'));
  ok('탭 전환 함수', /function gachaTab/.test(cli));
  ok('목록 그리는 함수', /function renderExchange/.test(cli));
  ok('교환 함수', /function doExchange/.test(cli));
  ok('상품을 누르면 교환이 불린다', /onclick="doExchange\(/.test(cli));
  ok('교환 API 를 부른다', cli.includes("'/api/gacha/exchange'"));
  ok('열 때 뽑기 탭부터', /gachaTab\('roll'\)/.test(cli));

  // 목록을 그리려면 내 보유 목록이 필요하다. profileOf 가 items 를 안 주면
  // 전부 "안 가진 것" 으로 보이고, 산 뒤에도 표시가 안 바뀐다.
  ok('내 보유 목록이 프로필에 실려 온다', /items:\s*u\.items/.test(accSrc));
  ok('교환 후 목록을 다시 그린다', /renderExchange\(\);/.test(cli));

  // 새 클래스는 CSS 가 있어야 한다 (없으면 SVG 가 300×150 으로 뜬다 — 전에 밟았다)
  for (const c of ['gc-tab', 'gc-buy', 'gc-pane', 'gc-sect'])
    ok(`.${c} CSS`, new RegExp('\\.' + c + '[\\s.,{:]').test(html));
  ok('.gc-buy 안 아이콘 크기 지정', /\.gc-buy \.gi-ico\s*\{[^}]*height/.test(html));

  // askConfirm 은 프로미스가 아니라 콜백을 받는다. await 로 쓰면 늘 통과해 버린다.
  const dx = cli.slice(cli.indexOf('function doExchange'), cli.indexOf('function doExchange') + 1200);
  ok('askConfirm 을 콜백 방식으로 쓴다', !/await\s+askConfirm/.test(dx));
  ok('askConfirm 에 객체를 넘긴다', /askConfirm\(\{/.test(dx));
}

console.log('\n⑧ 염색 스포이드 — 지금 색을 담아 두었다 한 번 되돌린다');
{
  const t = a.signup('pipetteman', 'pw1234', '스포이드시험').token;
  const u = a.byToken(t);
  u.shards = 10000; u.items = {}; u.coins = 1e9;

  ok('담을 색이 없으면 못 산다', !!a.exchangeShard(t, 'dye_pipette').error);
  const before = u.shards;
  u.nickColor = 'cyan';
  const buy = a.exchangeShard(t, 'dye_pipette');
  ok('색이 있으면 살 수 있다', !!(buy && buy.ok), buy && buy.error);
  ok('산 순간의 색을 담는다', u.dyeSaved === 'cyan', String(u.dyeSaved));
  ok('파편이 나갔다', u.shards === before - 350, String(before - u.shards));
  ok('못 사면 파편도 안 나간다', (() => {
    const t2 = a.signup('pipette2', 'pw1234', '스포이드둘').token;
    const u2 = a.byToken(t2); u2.shards = 500; u2.nickColor = null;
    a.exchangeShard(t2, 'dye_pipette');
    return u2.shards === 500;
  })());

  // 염색약을 새로 발라 색이 바뀐 뒤에 되돌린다
  u.nickColor = 'red';
  ok('되돌리면 담아 둔 색', (() => { const r = a.usePipette(t); return r.ok && u.nickColor === 'cyan'; })(), String(u.nickColor));
  ok('한 개를 쓴다', !u.items.dye_pipette, JSON.stringify(u.items));
  ok('없으면 못 쓴다', !!a.usePipette(t).error);
  // 담긴 색은 남는다 — 같은 색을 또 담으려고 다시 살 필요는 없게
  ok('담긴 색은 남는다', u.dyeSaved === 'cyan');

  // 여러 개 쟁여 둘 수 있다 (소모품이라 "이미 보유" 로 막으면 안 된다)
  u.nickColor = 'gold';
  a.exchangeShard(t, 'dye_pipette');
  a.exchangeShard(t, 'dye_pipette');
  ok('여러 개 살 수 있다', u.items.dye_pipette === 2, String(u.items.dye_pipette));
  ok('마지막에 산 색으로 갈린다', u.dyeSaved === 'gold', String(u.dyeSaved));
  ok('같은 색이면 안 쓴다', !!a.usePipette(t).error);

  // 화면에도 담긴 색·개수가 내려가야 버튼을 그린다
  const p = a.profileOf(u);
  ok('프로필에 담긴 색이 실린다', p.dyeSaved === 'gold' && p.pipettes === 2);
}

console.log('\n⑨ 무지개 — 명패 위에서도 보이는가');
{
  const fs2 = require('fs'), path2 = require('path');
  const htm = fs2.readFileSync(path2.join(__dirname, '..', 'public/index.html'), 'utf8');
  // 글자에 그라디언트를 오려 붙이면 명패(.np-*)도 background 를 써서 뒤에 오는
  // 쪽이 이긴다 — 글자는 투명한 채 그라디언트만 사라져 이름이 통째로 안 보였다.
  ok('글자를 오려 붙이지 않는다', !/\.nc-rainbow \{[^}]*background-clip/.test(htm));
  ok('색을 갈아 끼운다', /\.nc-rainbow \{ animation:ncRainbow/.test(htm)
     && /@keyframes ncRainbow \{[\s\S]{0,200}color:#ff6b6b/.test(htm));
  ok('투명 글자가 남아 있지 않다', !/\.nc-rainbow[^}]*text-fill-color:transparent/.test(htm));
  ok('모션을 줄이면 한 색으로', /@media \(prefers-reduced-motion:reduce\) \{\s*\n\s*\.nc-rainbow \{ animation:none/.test(htm));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
