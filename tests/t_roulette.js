// 랭크 룰렛이 도는 결 · 매칭 창이 걷히는 시점.
//
// 두 번 지적받은 자리라 눈금으로 박아 둔다.
//   1차: 곡선이 앞쪽 25%에 81%를 가 버려 "돌 때는 느리고 정할 때만 확 튀는" 것처럼 보였다.
//   2차: 표준 ease-out 으로 바꿨더니 이번엔 거의 등속이라 늦어지는 게 안 보였다.
// 룰렛은 "처음이 가장 빠르고 끝까지 계속 늦어진다" 가 전부다 — 그걸 숫자로 확인한다.
const fs = require('fs');
const path = require('path');
const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// CSS cubic-bezier 를 그대로 푼다 (브라우저와 같은 방식: x 로 t 를 찾고 y 를 낸다)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const fy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    let t = x;
    for (let i = 0; i < 30; i++) {
      const e = fx(t) - x, d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(e) < 1e-9 || !d) break;
      t -= e / d;
    }
    return fy(t);
  };
}

console.log('① 룰렛은 처음이 가장 빠르고 끝까지 늦어진다');
{
  const m = cli.match(/transform \$\{dur\}ms cubic-bezier\(([-\d., ]+)\)/);
  ok('곡선을 읽을 수 있다', !!m, m ? '' : '(cubic-bezier 를 못 찾음)');
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s));
    const f = bezier(p[0], p[1], p[2], p[3]);
    const SLOTS = 18;   // RK_LOOPS(6) × RANK_ORDER(3)
    const seg = [];
    for (let i = 1; i <= 10; i++) seg.push((f(i / 10) - f((i - 1) / 10)) * SLOTS);
    const r1 = seg.map((x) => x.toFixed(1)).join(' ');

    let mono = true;
    for (let i = 1; i < seg.length; i++) if (seg[i] > seg[i - 1] + 1e-6) mono = false;
    ok('한 번도 다시 빨라지지 않는다', mono, r1);

    // 늦어지는 게 눈에 보이려면 처음이 끝의 몇 배는 되어야 한다.
    // 표준 ease-out(0,0,.58,1)은 2.9→0.3 으로 10배 언저리지만 앞쪽이 밋밋했다 —
    // 그래서 "첫 구간이 최소 4칸" 을 같이 건다.
    ok('첫 구간이 4칸 이상 지나간다', seg[0] >= 4, seg[0].toFixed(1) + '칸');
    ok('첫 구간이 마지막의 8배 이상', seg[0] / seg[9] >= 8, (seg[0] / seg[9]).toFixed(1) + '배');

    // 반대쪽 실패 — 앞에 다 몰아 버리면 뒤가 멈춘 것처럼 보인다.
    ok('첫 구간이 절반을 넘기지는 않는다', seg[0] <= SLOTS / 2, seg[0].toFixed(1) + '칸');
    ok('마지막 구간도 칸이 넘어간다', seg[9] >= 0.25, seg[9].toFixed(2) + '칸');
    ok('중간에 멈춘 것처럼 보이는 구간이 없다', seg.every((s) => s >= 0.25), r1);
  }
}

console.log('② 딸깍은 칸이 실제로 넘어가는 순간에 울린다');
{
  const m = cli.match(/const RK_TICKS = \[([\d, ]+)\]/);
  ok('시각표가 있다', !!m);
  if (m) {
    const ticks = m[1].split(',').map((s) => parseInt(s, 10));
    let widening = true;
    for (let i = 2; i < ticks.length; i++)
      if ((ticks[i] - ticks[i - 1]) < (ticks[i - 1] - ticks[i - 2]) - 1) widening = false;
    ok('간격이 좁아지지 않는다 (눈과 귀가 같이 늦어진다)', widening,
       ticks.map((t, i) => (i ? t - ticks[i - 1] : t)).join(' '));
    // 45ms(초당 22번)가 아래끝이다. 이보다 촘촘하면 딸깍이 아니라 한 덩어리 소음으로
    // 들린다. 반대로 60ms 로 잡으면 첫 딸깍이 462ms 로 밀려, 가장 빠른 구간이
    // 통째로 무음이 된다 — 빠르다는 느낌을 소리가 안 받쳐 준다.
    ok('소리로 알아들을 만큼은 떨어져 있다',
       ticks.every((t, i) => i === 0 || t - ticks[i - 1] >= 45));
    ok('빠른 구간에도 소리가 있다', ticks[0] <= 300, '첫 딸깍 ' + ticks[0] + 'ms');
    const dur = parseInt((cli.match(/const dur = (\d+);/) || [])[1], 10);
    ok('마지막 딸깍이 멈추는 순간과 맞는다', ticks[ticks.length - 1] === dur, ticks[ticks.length - 1] + ' vs ' + dur);
  }
}

console.log('③ 정해지면 매칭 창은 걷는다');
{
  ok('걷는 함수가 있다', /function matchDone\(label\)/.test(cli));
  ok('창·룰렛·초읽기를 같이 정리한다',
     /matchDone[\s\S]{0,400}matchModal[\s\S]{0,200}remove\('show'\)/.test(cli)
     && /matchDone[\s\S]{0,400}rkHide\(\); matchCountdownStop\(\);/.test(cli));
  ok('뽑힌 모드는 토스트로 남는다', /function matchDone[\s\S]{0,400}toast\(/.test(cli));
  ok('랭크·방 두 경로 모두 이걸 쓴다',
     (cli.match(/rankRoulette\(mode, \(\) => matchDone\(label\)\)/g) || []).length === 2);

  // 창이 걷히는 시각이 판이 열리는 시각을 넘으면, 판 위에 '찾는 중' 이 떠 있게 된다
  const dur = parseInt((cli.match(/const dur = (\d+);/) || [])[1], 10);
  const beat = parseInt((cli.match(/setTimeout\(done, (\d+)\);/) || [])[1], 10);
  const spin = parseInt((srv.match(/const RANK_SPIN_MS = (\d+);/) || [])[1], 10);
  ok('창이 걷힌 뒤에 판이 열린다', dur + 40 + beat <= spin,
     '창 ' + (dur + 40 + beat) + 'ms · 판 ' + spin + 'ms');
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
