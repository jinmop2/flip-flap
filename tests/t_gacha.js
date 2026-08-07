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

console.log('\n① 확률표가 화면에 내려간다 (법적으로 표시 의무)');
{
  const info = a.gachaInfo();
  ok('확률표 있음', !!info && Array.isArray(info.rates) && info.rates.length === 4);
  const sum = info.rates.reduce((s, r) => s + r.rate, 0);
  ok('확률 합이 100%', Math.abs(sum - 1) < 1e-9, '합 ' + sum);
  ok('등급마다 상품이 있다', info.rates.every((r) => r.count > 0),
     info.rates.map((r) => r.tier + ':' + r.count).join(' '));
  ok('천장·교환 수치도 내려간다', info.pity > 0 && info.exchange > 0);
  console.log('    ' + info.rates.map((r) => `${r.tier} ${(r.rate * 100).toFixed(0)}% (${r.count}종, 중복 ${r.shard}파편)`).join(' · '));
}

console.log('\n② 코인이 실제로 빠지고 물건이 들어온다');
{
  const t = rich(5000);
  const before = a.byToken(t).coins;
  const r = a.rollGacha(t, 1);
  ok('뽑기 성공', r.ok && r.results.length === 1);
  ok('코인 300 차감', a.byToken(t).coins === before - 300, `${before} → ${a.byToken(t).coins}`);
  const r10 = a.rollGacha(t, 10);
  ok('10연 10개', r10.ok && r10.results.length === 10);
  ok('10연은 2700 (할인)', a.byToken(t).coins === before - 300 - 2700);
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
  const info = a.gachaInfo();
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
  u.shards = 300;
  const target = 'back_obsidian';
  const r = a.exchangeShard(t, target);
  ok('교환 성공', r.ok && !!a.byToken(t).items[target], r.error);
  ok('파편 300 차감', a.byToken(t).shards === 0);
  ok('이미 가진 건 못 바꾼다', !!a.exchangeShard(t, target).error);
  u.shards = 299;
  ok('파편 모자라면 거부', !!a.exchangeShard(t, 'np_obsidian').error);
  ok('모자랄 때 파편 안 깎임', a.byToken(t).shards === 299);
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
  ok('이상한 횟수는 1회로', r.ok && r.results.length === 1 && a.byToken(t2).coins === before - 300);
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
