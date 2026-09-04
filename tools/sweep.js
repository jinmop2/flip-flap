// 저울추 쓸기 — 한 번에 하나씩 돌려 가며 v4 상대 승률을 잰다.
//
// 왜 이렇게 재야 하는가: 한 판의 승패는 카드 운이 절반이라, 2000판으로는
// 1~2%p 차이가 우연에 묻힌다. 그래서 판수를 늘리고, 대신 코어를 나눠 쓴다.
// 자리(선공/후공)도 반씩 바꿔 앉힌다 — 이 게임은 자리가 공평하지 않다.
//
// 상대는 여럿이어야 한다. 한 상대만 놓고 고르면 그 상대만 잡는 수가 뽑힌다 —
// 실제로 한 번 당했다. v4 만 보고 고른 값이 v4 에게는 +4%p 였는데 약한 AI
// 상대로는 5%p 씩 밀렸다. 사람은 v4 가 아니라 그 약한 쪽에 가깝다.
// OPP 로 상대를 쉼표로 나열한다 (기본: expertx4,expertx3,hard).
//
// 실행: node tools/sweep.js <판수> <FF_W_TEMPO=0.1,0.2 ...>
const { execFile } = require('child_process');
const os = require('os');

const N = parseInt(process.argv[2] || '8000', 10);
const specs = process.argv.slice(3).map(s => {
  const [k, vs] = s.split('=');
  return { key: k, vals: vs.split(',').map(Number) };
});
const BASE = { FF_MIDDEPTH: '0' };
// expertold = 손잡이를 안 읽는 옛 전문가. 여기 있는 상대는 모두 FF_* 를
// 안 읽어야 한다 — 도전자와 같이 움직이면 차이가 사라진다.
const OPPS = (process.env.OPP || 'expertold,expertx3,hard').split(',');

const jobs = [];
for (const sp of specs)
  for (const v of sp.vals)
    for (const opp of OPPS)
      for (const seat of [0, 1])
        jobs.push({ key: sp.key, val: v, opp, seat, env: { ...BASE, [sp.key]: String(v) } });

const half = Math.round(N / 2);
function runOne(j) {
  return new Promise((res) => {
    const args = ['sim.js', String(half), j.seat ? j.opp : 'expertx4', j.seat ? 'expertx4' : j.opp];
    execFile('node', args, { env: { ...process.env, ...j.env }, maxBuffer: 1 << 24, encoding: 'utf8' },
      (e, out) => {
        const p1 = +(String(out).match(/선공\(P1\) 승: (\d+)/) || [])[1];
        const p2 = +(String(out).match(/후공\(P2\) 승: (\d+)/) || [])[1];
        const dr = +(String(out).match(/무승부:\s+(\d+)/) || [])[1];
        res({ ...j, win: j.seat ? p2 : p1, draw: dr });
      });
  });
}

(async () => {
  const LANES = Math.max(2, Math.min(8, os.cpus().length));
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (i < jobs.length) { const j = jobs[i++]; out.push(await runOne(j)); }
  }));
  const agg = new Map();
  for (const r of out) {
    const k = r.key + '=' + r.val;
    const a = agg.get(k) || { per: new Map() };
    const p = a.per.get(r.opp) || { win: 0, draw: 0, n: 0 };
    p.win += r.win; p.draw += r.draw; p.n += half;
    a.per.set(r.opp, p); agg.set(k, a);
  }
  const pc = x => (x * 100).toFixed(1) + '%';
  // 고르는 눈금은 상대별 승률의 평균이다. 한 상대에게 크게 이기고 다른 상대에게
  // 밀리는 값이 뽑히지 않게, 가장 못한 상대의 성적도 같이 적는다.
  const rows = [...agg].map(([k, a]) => {
    const each = OPPS.map(o => { const p = a.per.get(o); return { o, sc: (p.win + p.draw / 2) / p.n, n: p.n }; });
    const avg = each.reduce((s, e) => s + e.sc, 0) / each.length;
    const worst = Math.min(...each.map(e => e.sc));
    const n = each.reduce((s, e) => s + e.n, 0);
    const se = Math.sqrt(0.25 / n);
    return { k, avg, worst, each, lo: avg - 1.96 * se };
  }).sort((x, y) => y.avg - x.avg);
  console.log(`\n═══ 상대별 승률 (상대당 ${half * 2}판) ═══`);
  for (const r of rows)
    console.log(`  ${r.k.padEnd(20)} 평균 ${pc(r.avg)} · 최저 ${pc(r.worst)}   ` +
      r.each.map(e => `${e.o} ${pc(e.sc)}`).join(' · '));
  console.log();
})();
