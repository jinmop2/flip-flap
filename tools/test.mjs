// 시금석 한 바퀴.
//
//   npm test                 전부
//   npm test -- q4 rejoin    이름에 그 글자가 든 것만
//   npm test -- --slow       오래 걸린 순서로 보여 준다
//
// 왜 따로 만들었나: 시금석은 저마다 "✓ / ✗ / 결과: n 통과, m 실패" 로만
// 말하고 끝난다. 한 바퀴 돌리려면 셸 반복문을 매번 손으로 써야 했고,
// 그러다 보면 실패한 파일 이름만 보고 무엇이 실패했는지는 안 보게 된다.
//
// 살아 있는 서버·소켓이 걸린 것들은 한 줄로 세운다. 같이 돌리면 서로의
// 박자를 밀어내 "바쁠 때만 빨개지는" 시금석이 된다 — 그건 없느니만 못하다.
// 나머지는 글을 읽거나 셈만 하는 것들이라 같이 돌려도 서로를 안 건드린다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'tests');
const args = process.argv.slice(2);
const showSlow = args.includes('--slow');
const picks = args.filter((a) => !a.startsWith('-'));

const B = '\x1b[1m', R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[2m', X = '\x1b[0m';

let files = fs.readdirSync(DIR).filter((f) => /^t_.*\.js$/.test(f)).sort();
if (picks.length) files = files.filter((f) => picks.some((p) => f.includes(p)));
if (!files.length) { console.log('그런 이름의 시금석이 없다.'); process.exit(1); }

const run = (f) => new Promise((done) => {
  const t0 = Date.now();
  const p = spawn('node', [path.join(DIR, f)], { cwd: ROOT });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => done({ f, out, code, ms: Date.now() - t0 }));
});

// 시간이 걸리는 쪽(소켓·서버)과 그렇지 않은 쪽을 가른다
const isLive = (f) => /liveServer|socket\.io-client|child_process/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
const live = files.filter(isLive);
const quiet = files.filter((f) => !isLive(f));

const score = (r) => {
  r.bad = (r.out.match(/✗/g) || []).length;
  // 통과 수는 파일마다 적는 말이 조금씩 다르다 — 둘 다 받는다
  const m = /(?:결과:|통과:)\s*(\d+)/.exec(r.out) || /\((\d+)\/\d+\)/.exec(r.out);
  r.good = m ? +m[1] : (r.out.match(/✓/g) || []).length;
  return r;
};
const line = (r) => {
  const secs = (r.ms / 1000).toFixed(1);
  console.log(`  ${D}${r.f.replace(/^t_|\.js$/g, '').padEnd(12)}${X} ` + (r.bad || r.code
    ? `${R}✗ ${r.bad || '죽음'}${X} ${D}${secs}초${X}`
    : `${G}✓${X} ${D}${r.good} · ${secs}초${X}`));
};

const results = [];
const t0 = Date.now();

if (quiet.length) {
  console.log(`${D}같이 돌린다 (${quiet.length}개)${X}`);
  const LANES = Math.max(2, Math.min(4, (await import('node:os')).cpus().length - 1));
  const queue = [...quiet];
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (queue.length) {
      const r = score(await run(queue.shift()));
      results.push(r); line(r);
    }
  }));
}
if (live.length) {
  console.log(`${D}한 줄로 세운다 — 서버·소켓이 걸렸다 (${live.length}개)${X}`);
  for (const f of live) { const r = score(await run(f)); results.push(r); line(r); }
}

const failed = results.filter((r) => r.bad || r.code);
if (failed.length) {
  console.log(`\n${B}${R}실패한 곳${X}`);
  for (const r of failed) {
    // 시금석은 실패하면 1 로 끝나기로 돼 있다 — 그건 말할 것이 못 된다.
    // ✗ 한 줄 없이 죽은 것만 따로 알린다.
    const crashed = r.code && !r.bad;
    console.log(`\n${B}${r.f}${X}${crashed ? ` ${R}(✗ 없이 코드 ${r.code} 로 죽었다)${X}` : ''}`);
    // ✗ 줄과 그 바로 위 제목만 보여 준다 — 전부 쏟으면 안 읽게 된다
    const lines = r.out.split('\n');
    let head = '';
    for (const [i, ln] of lines.entries()) {
      if (/^[①-⑳\d]/.test(ln.trim()) || /^\S.*—/.test(ln)) head = ln.trim();
      if (ln.includes('✗')) { if (head) { console.log(`  ${D}${head}${X}`); head = ''; } console.log('  ' + ln.trim()); }
    }
    if (crashed) console.log('  ' + lines.slice(-12).join('\n  '));
  }
}

if (showSlow) {
  console.log(`\n${B}오래 걸린 것${X}`);
  for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 8))
    console.log(`  ${(r.ms / 1000).toFixed(1).padStart(6)}초  ${r.f}`);
}

const totalBad = failed.length;
const mins = ((Date.now() - t0) / 1000 / 60).toFixed(1);
console.log(`\n${B}${totalBad ? `${R}${totalBad}개 파일이 빨갛다` : `${G}${results.length}개 파일 전부 통과`}${X} ${D}· ${mins}분${X}`);
process.exit(totalBad ? 1 : 0);
