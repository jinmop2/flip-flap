// 뽑기 — 확률·중복 파편·천장·교환·방어
// 재화가 걸린 무작위 로직이라 눈으로 보지 말고 대량으로 돌려 수치로 확인한다.
const fs = require('fs');
const dir = '/tmp/ffgacha';
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
const rich = (coins = 10000000) => {
  const id = 'gacha' + (seq++) + 'x';
  const t = a.signup(id, 'pw1234', id).token;
  const u = a.byToken(t);
  u.coins = coins; u.items = {}; u.shards = 0;
  return t;
};

const info = a.gachaInfo();

console.log('\n① 확률표가 화면에 내려간다 (법적으로 표시 의무)');
{
  ok('확률표 있음', !!info && Array.isArray(info.rates) && info.rates.length === 4);
  const sum = info.rates.reduce((s, r) => s + r.rate, 0);
  ok('확률 합이 100%', Math.abs(sum - 1) < 1e-9, '합 ' + sum);
  ok('등급마다 상품이 있다', info.rates.every((r) => r.count > 0),
     info.rates.map((r) => r.tier + ':' + r.count).join(' '));
  ok('천장·교환 수치도 내려간다', info.pity > 0 && info.rates.every((r) => r.cost > 0));
  console.log('    ' + info.rates.map((r) => `${r.tier} ${(r.rate * 100).toFixed(0)}% (${r.count}종, 중복 ${r.shard}파편)`).join(' · '));
}

console.log('\n② 코인이 실제로 빠지고 물건이 들어온다');
{
  // 값이 오를 수 있으므로 넉넉히 쥐어 준다 — 잔액이 모자라 실패하면
  // '뽑기가 깨졌다' 가 아니라 '테스트가 값에 매여 있다' 는 뜻이다
  const t = rich(info.cost + info.cost10 + 1000);
  const before = a.byToken(t).coins;
  const r = a.rollGacha(t, 1);
  ok('뽑기 성공', r.ok && r.results.length === 1);
  // 값은 바뀔 수 있으므로 숫자를 박지 않고 서버가 알려준 값과 맞는지 본다
  ok('1회 값만큼 차감', a.byToken(t).coins === before - info.cost, `${before} → ${a.byToken(t).coins}`);
  const r10 = a.rollGacha(t, 10);
  ok('10연 10개', r10.ok && r10.results.length === 10);
  ok('10연 값만큼 차감', a.byToken(t).coins === before - info.cost - info.cost10);
  ok('10연이 1회 열 번보다 싸다', info.cost10 < info.cost * 10,
     `${info.cost10} vs ${info.cost * 10}`);
}

console.log('\n②-b 뽑기 값이 상점과 균형이 맞는가');
{
  // 뽑기 상품은 전부 상점에서도 살 수 있다. 그래서 1회 값이
  // "1회에 기대되는 상점 가치" 보다 많이 싸면 상점이 통째로 죽는다 —
  // 뭘 사든 손해라서 뽑기만 돌리는 게 늘 정답이 된다.
  // 예전에 1회 300 · 기대가치 566 이라 1.9배 남는 장사였다.
  const src = require('fs').readFileSync(dir + '/accounts.js', 'utf8');
  const priceOf = (id) => {
    const m = src.match(new RegExp('\\n  ' + id + '\\s*:\\s*\\{[^\\n]*?price:\\s*(\\d+)'));
    return m ? +m[1] : null;
  };
  let ev = 0, missing = [];
  for (const row of info.rates) {
    const ps = a.GACHA_TIER[row.tier].map(priceOf);
    missing.push(...a.GACHA_TIER[row.tier].filter((id, i) => ps[i] == null));
    const got = ps.filter((x) => x != null);
    ev += row.rate * (got.reduce((s, x) => s + x, 0) / got.length);
  }
  ok('모든 뽑기 상품에 상점가가 있다', missing.length === 0, missing.join(' '));
  const ratio = ev / info.cost;
  console.log(`     1회 ${info.cost}코인 · 기대 상점가치 ${Math.round(ev)}코인 → ${ratio.toFixed(2)}배`);
  ok('뽑기가 상점을 죽일 만큼 싸지 않다', ratio <= 1.35, `${ratio.toFixed(2)}배`);
  // 반대로 너무 비싸도 아무도 안 돌린다 (원하는 걸 못 고르는 값을 얹어 준 것)
  ok('그렇다고 상점보다 손해도 아니다', ratio >= 0.95, `${ratio.toFixed(2)}배`);
}

console.log('\n③ 돈이 모자라면 아무 일도 안 일어난다');
{
  const t = rich(100);
  const before = a.byToken(t).coins;
  const r = a.rollGacha(t, 1);
  ok('거부됨', !!r.error);
  ok('코인 그대로', a.byToken(t).coins === before);
  ok('아이템도 안 들어옴', Object.keys(a.byToken(t).items).length === 0);
}

console.log('\n④ 실제 등급 분포가 표시한 확률과 맞는가 (2만 회)');
{
  const t = rich(1e9);
  const cnt = { common: 0, rare: 0, epic: 0, legend: 0 };
  const N = 20000;
  for (let i = 0; i < N / 10; i++) {
    const r = a.rollGacha(t, 10);
    for (const g of r.results) cnt[g.tier]++;
  }
  for (const row of info.rates) {
    const got = cnt[row.tier] / N;
    // 화면에 적는 값은 천장까지 반영한 실제 확률이어야 한다.
    // 기본 확률만 적으면 전설이 2% 라고 써 놓고 실제로는 3% 가 나온다 — 표시 위반.
    ok(`${row.tier} 실측 ${(got * 100).toFixed(2)}% ↔ 표시 ${(row.rate * 100).toFixed(2)}%`,
       Math.abs(got - row.rate) < 0.015,
       `차이 ${((got - row.rate) * 100).toFixed(2)}%p`);
  }
}

console.log('\n⑤ 중복은 파편으로 바뀐다');
{
  const t = rich(1e9);
  let dup = 0, shard = 0;
  for (let i = 0; i < 60; i++) {
    const r = a.rollGacha(t, 10);
    for (const g of r.results) if (g.dup) { dup++; shard += g.shard; }
  }
  ok('중복이 실제로 나온다', dup > 0, `${dup}건`);
  ok('중복마다 파편이 붙는다', shard > 0);
  ok('파편 잔액과 지급 합계가 같다', a.byToken(t).shards === shard,
     `잔액 ${a.byToken(t).shards} / 합계 ${shard}`);
  const u = a.byToken(t);
  ok('중복이어도 보유 개수는 안 늘어난다', Object.values(u.items).every((v) => v === true));
}

console.log('\n⑥ 천장 — 50회 안에 전설이 반드시');
{
  let worst = 0;
  for (let trial = 0; trial < 40; trial++) {
    const t = rich(1e9);
    let since = 0;
    for (let i = 0; i < 200; i++) {
      const r = a.rollGacha(t, 1);
      since++;
      if (r.results[0].tier === 'legend') { worst = Math.max(worst, since); since = 0; }
    }
    worst = Math.max(worst, since === 0 ? 0 : 0);
  }
  ok('전설 간격이 50회를 넘지 않는다', worst <= 50, '최대 ' + worst + '회');
  console.log('    관측된 최대 간격: ' + worst + '회');
}

console.log('\n⑦ 파편으로 원하는 것을 확정 교환');
{
  const t = rich(1e9);
  const u = a.byToken(t);
  // 교환가는 등급마다 다르다. 값은 서버가 쥐고 있으므로 여기서도 서버에서 읽는다.
  const costOf = (tier) => a.gachaInfo().rates.find((r) => r.tier === tier).cost;
  const target = 'back_obsidian';                 // 전설
  const legendCost = costOf('legend');
  u.shards = legendCost;
  const r = a.exchangeShard(t, target);
  ok('교환 성공', r.ok && !!a.byToken(t).items[target], r.error);
  ok('등급에 맞는 값이 차감된다', a.byToken(t).shards === 0);
  ok('응답이 낸 값을 알려준다', r.cost === legendCost);
  ok('이미 가진 건 못 바꾼다', !!a.exchangeShard(t, target).error);
  u.shards = legendCost - 1;
  ok('파편 모자라면 거부', !!a.exchangeShard(t, 'np_obsidian').error);
  ok('모자랄 때 파편 안 깎임', a.byToken(t).shards === legendCost - 1);
  // 전설 값으로 일반품을 사면 안 된다 — 등급별로 실제로 다른 값이 나가는지
  u.shards = costOf('common');
  ok('일반은 싼값에 바뀐다', !!a.exchangeShard(t, 'np_wood').ok);
  ok('일반 값만 나간다', a.byToken(t).shards === 0);
}

console.log('\n⑧ 방어');
{
  const t = rich(1e9);
  ok('없는 아이템 교환 거부', !!a.exchangeShard(t, 'nope_nope').error);
  ok('__proto__ 거부', !!a.exchangeShard(t, '__proto__').error);
  ok('constructor 거부', !!a.exchangeShard(t, 'constructor').error);
  ok('뽑기 풀에 없는 것(닉네임 변경권) 교환 거부', !!a.exchangeShard(t, 'nick_change').error);
  ok('로그인 없이 뽑기 거부', !!a.rollGacha('없는토큰', 1).error);
  ok('로그인 없이 교환 거부', !!a.exchangeShard('없는토큰', 'np_wood').error);
  // 이상한 횟수는 1회로 취급 (10 이외에는 전부 1)
  const t2 = rich(5000);
  const before = a.byToken(t2).coins;
  const r = a.rollGacha(t2, 999);
  ok('이상한 횟수는 1회로', r.ok && r.results.length === 1 && a.byToken(t2).coins === before - info.cost);
}

console.log('\n⑨ 뽑기로 나온 것은 전부 실제 상품이다');
{
  const t = rich(1e9);
  const list = a.shopList();
  const ids = new Set(list.map((x) => x.id));
  let bad = null;
  for (let i = 0; i < 100; i++) {
    const r = a.rollGacha(t, 10);
    for (const g of r.results) if (!ids.has(g.id)) bad = g.id;
  }
  ok('카탈로그에 없는 게 안 나온다', !bad, '문제: ' + bad);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
