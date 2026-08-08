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
  ok('목록의 값이 등급표와 같다',
     (info.pool || []).every((p) => p.cost === byTier[p.tier]));
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

console.log('\n⑥ 화면에 교환소가 배선돼 있는가');
{
  ok('교환소 탭 버튼', html.includes('id="gcTabExch"'));
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

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
