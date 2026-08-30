// 전문가 AI v4 — 실전에 붙어 있는가, 그리고 v3 보다 센가.
//
// 왜 이 시험이 있는가:
//   AI 는 조용히 약해진다. 값 하나를 잘못 만져도 게임은 그대로 돌아가고,
//   시험도 다 통과하고, 판만 시시해진다. 그래서 "붙어 있는가" 와
//   "재 보면 더 센가" 를 같이 박아 둔다.
//
// 재는 방법:
//   이 게임은 자리가 공평하지 않다(진행자는 출품 카드를 손에서 내줘야 한다).
//   그래서 자리를 바꿔 두 번 돌리고 합친다 — 한쪽만 재면 자리 이점을 실력으로 안다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 실전이 새 모델을 쓰고 있다');
{
  ok('서버가 expert4 를 부른다', /require\('\.\/expert4'\)/.test(srv));
  ok('옛 모델을 직접 부르지 않는다', !/require\('\.\/expert3'\)/.test(srv));
  const X4 = require(path.join(root, 'expert4.js'));
  for (const k of ['createMem', 'noteSettle', 'bid', 'offer', 'type'])
    ok('겉모양에 ' + k + ' 가 있다', typeof X4[k] === 'function');
  // 서버가 해설·평가에 쓰는 것들
  for (const k of ['feasibleTarget', 'wantValue', 'denyValue'])
    ok('서버가 쓰는 ' + k + ' 를 내보낸다', typeof X4[k] === 'function');
}

console.log('② 🏷 덤을 보고 둔다 (아이템전)');
{
  const X4 = require(path.join(root, 'expert4.js'));
  ok('서버가 덤을 AI 에게 넘긴다', /tip: g\.auction\.tipCard \|\| null/.test(srv));
  const mk = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });
  const base = {
    hand: [mk(2,1), mk(3,2), mk(4,4), mk(6,3), mk(6,9), mk(6,10)],
    myAcq: [mk(4,1), mk(4,2)], oppAcq: [mk(3,1)],
    center: mk(4,5), offered: mk(6,1),
    visOpp: null, auctionType: 'open', isAuctioneer: true, deckLeft: 8, oppHandLen: 5,
  };
  const many = (tip) => { const t = {}; for (let i = 0; i < 60; i++) { const b = X4.bid({ ...base, tip }, X4.createMem()); t[b.id] = (t[b.id] || 0) + 1; } return t; };
  const weakest = 610;                                  // 6-10 = 가장 약한 카드
  const noTip = many(null), legend = many({ tier: 'legend' });
  ok('덤이 없으면 경매를 다툰다', (noTip[weakest] || 0) < 30, JSON.stringify(noTip));
  // 전설 덤은 진 쪽이 가져간다 — 값이 카드보다 크면 일부러 져야 이득이다
  ok('전설 덤이면 일부러 져서 아이템을 챙긴다', (legend[weakest] || 0) > 40, JSON.stringify(legend));

  // 다만 세트가 걸린 자리에서는 아이템을 포기해야 한다
  const block = { ...base, myAcq: [mk(4,1)], oppAcq: [mk(3,1), mk(3,2)], center: mk(3,5),
                  hand: [mk(2,1), mk(3,4), mk(4,4), mk(6,3), mk(6,9), mk(6,10)] };
  let dumped = 0;
  for (let i = 0; i < 40; i++) if (X4.bid({ ...block, tip: { tier: 'legend' } }, X4.createMem()).id === weakest) dumped++;
  ok('넘기면 상대가 이기는 판은 아이템을 포기하고 막는다', dumped === 0, dumped + '/40 회 던짐');
}

console.log('③ v3 보다 세다 (자리 바꿔 8000판)');
{
  // 문턱을 어디에 둘지는 재 보고 정했다.
  //   같은 조건으로 3000판씩 다섯 번 → 51.7 · 50.9 · 50.7 · 52.5 · 52.4
  //   판수를 키운 것들 → 12000판 52.9 · 16000판 51.9 · 6000판 53.6
  //   전부 합치면(55,000판) 52.2% [51.8 ~ 52.6]
  // 즉 진짜 실력차는 +2%p 안팎인데, 3000판으로는 50.7 까지 내려간다.
  // 그래서 판수를 8000 으로 올리고 문턱은 50.5% 로 둔다 — 진짜로 약해졌을 때만
  // 걸리고, 재는 김에 우연히 걸리지는 않게.
  const out = execFileSync('node', [path.join(root, 'bench.js'), '8000', 'expertx4', 'expertx3'],
    { encoding: 'utf8', cwd: root, maxBuffer: 1 << 24 });
  const m = out.match(/expertx4 종합\s+:\s+([\d.]+)%/);
  const score = m ? +m[1] : 0;
  console.log('     ' + (out.match(/판정.*/) || [''])[0].trim());
  ok('종합 승률이 50.5% 를 넘는다', score >= 50.5, score + '%');
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
