// AI 맞대결 저울 — 자리를 바꿔 두 번 재고 합친다.
//
// 왜 이렇게 재야 하는가:
//   이 게임은 자리가 공평하지 않다. 같은 모델끼리 붙여도 후공이 5%p 앞선다
//   (진행자는 출품 카드를 손에서 내줘야 하고, 후공은 클로즈에서 그 배팅을 본다).
//   그래서 한쪽 자리에서만 재면 자리 이점을 실력으로 착각한다.
//   A를 선공/후공 양쪽에 앉혀 같은 수만큼 돌리고 평균을 낸다.
//
// 실행: node bench.js <판수> <A> <B>
//   node bench.js 6000 expertx4 expertx3
const { execFileSync } = require('child_process');

function run(n, d1, d2) {
  const out = execFileSync('node', ['sim.js', String(n), d1, d2], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const p1 = +(out.match(/선공\(P1\) 승: (\d+)/) || [])[1];
  const p2 = +(out.match(/후공\(P2\) 승: (\d+)/) || [])[1];
  const dr = +(out.match(/무승부:\s+(\d+)/) || [])[1];
  return { p1, p2, dr, n };
}

const N = parseInt(process.argv[2] || '6000', 10);
const A = process.argv[3] || 'expertx4';
const B = process.argv[4] || 'expertx3';

const half = Math.round(N / 2);
const g1 = run(half, A, B);      // A 선공
const g2 = run(half, B, A);      // A 후공

const aWins = g1.p1 + g2.p2;
const bWins = g1.p2 + g2.p1;
const draws = g1.dr + g2.dr;
const total = half * 2;
// 무승부는 반 점. 실력 비교에는 이게 눈금이 곧다.
const score = (aWins + draws / 2) / total;
// 95% 구간 (이항). 판수가 적으면 차이가 우연일 수 있다 — 그걸 눈에 보이게 둔다.
const se = Math.sqrt(score * (1 - score) / total);
const lo = score - 1.96 * se, hi = score + 1.96 * se;

const pc = x => (x * 100).toFixed(1) + '%';
console.log(`\n═══ ${A}  vs  ${B} ═══   (자리 바꿔 ${half}판씩, 총 ${total}판)`);
console.log(`  ${A} 선공일 때 : ${pc(g1.p1 / half)}`);
console.log(`  ${A} 후공일 때 : ${pc(g2.p2 / half)}`);
console.log(`  ─────────────────────────────`);
console.log(`  ${A} 종합      : ${pc(score)}   (95% 구간 ${pc(lo)} ~ ${pc(hi)})`);
console.log(`  ${B} 종합      : ${pc(1 - score)}`);
const edge = (score - 0.5) * 100;
const sig = lo > 0.5 ? '더 세다' : hi < 0.5 ? '더 약하다' : '차이 없음 (구간이 50%를 지난다)';
console.log(`  판정          : ${A} 가 ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%p — ${sig}\n`);
