// 시즌과 백업 — 만들어만 두고 아무도 안 부르던 것들.
// 시즌이 안 바뀌면 랭킹이 첫 시즌으로 굳고, 백업이 없으면 코인·전적이
// 한 번 날아갔을 때 되돌릴 방법이 없다.
const fs = require('fs');
const path = require('path');
const os = require('os');

// 시험용 데이터 파일로 갈아 끼운다 — 진짜 계정을 건드리지 않는다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffseason-'));
process.env.FF_DATA_FILE = path.join(tmp, 'accounts.json');
const A = require('../accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 시즌은 달로 센다 (한국 시간)');
{
  ok('달이 키다', /^\d{4}-\d{2}$/.test(A.seasonKey()), A.seasonKey());
  // 한국 시간 기준 — UTC 로 15시(=KST 자정)를 넘기면 다음 날, 달이 바뀌면 다음 달
  const utcEndOfMonth = new Date(Date.UTC(2026, 6, 31, 15, 30));   // KST 2026-08-01 00:30
  ok('KST 로 달이 넘어가면 다음 시즌', A.seasonKey(utcEndOfMonth) === '2026-08', A.seasonKey(utcEndOfMonth));
  const utcBefore = new Date(Date.UTC(2026, 6, 31, 14, 30));       // KST 2026-07-31 23:30
  ok('넘어가기 전에는 그대로', A.seasonKey(utcBefore) === '2026-07', A.seasonKey(utcBefore));
  ok('시즌 번호가 1 부터 센다', A.seasonNo('2025-08') === 1, String(A.seasonNo('2025-08')));
  ok('한 달에 하나씩 늘어난다', A.seasonNo('2025-10') === 3, String(A.seasonNo('2025-10')));
}

console.log('\n② 처음 볼 때는 리셋하지 않는다');
{
  const first = A.checkSeason();
  ok('첫 기록이라고 알린다', first && first.first === true);
  ok('아무도 안 내려갔다', first && first.moved === 0);
  ok('두 번째부터는 조용하다', A.checkSeason() === null);
}

console.log('\n③ 백업');
{
  const snap = A.snapshot();
  ok('통째로 뜬다', !!snap.users && !!snap.clans && !!snap.coupons);
  ok('언제 떴는지 남는다', typeof snap.at === 'string' && snap.at.length > 10);
  ok('몇 개인지 세어 둔다', snap.counts && typeof snap.counts.users === 'number');
}

console.log('\n④ 서버에 물려 있는가');
{
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // 자정에 딱 맞추면 그 시각에 서버가 안 떠 있을 때 영영 안 돈다 —
  // 뜰 때 한 번 + 주기적으로가 맞다
  ok('뜰 때 한 번 확인한다', /setTimeout\(\(\) => \{ seasonTick\(\); backupTick\(\); \}, 20000\)/.test(srv));
  ok('한 시간마다 다시 본다', /setInterval\(seasonTick, HOUR\)/.test(srv));
  ok('하루 한 번 백업', /setInterval\(backupTick, 24 \* HOUR\)/.test(srv));
  ok('관리자가 아무 때나 뜰 수 있다', /\/api\/admin\/backup-now/.test(srv));
  ok('바깥 보관용으로 내려받는다', /\/api\/admin\/backup-dump/.test(srv));
  // 관리자 '행동' 통로는 본문으로만 키를 받는다 (쿼리로 받으면 히스토리·로그에 남는다).
  // /stats·/reports 는 사람이 브라우저로 여는 읽기 전용 화면이라 쿼리를 쓰되,
  // 리퍼러·캐시로 키가 새 나가지 않게 헤더를 막아 둔다.
  ok('관리자 행동 통로는 본문 키만', /function adminOk\(req, res\)[\s\S]{0,240}req\.body\.key !== KEY/.test(srv)
     && !/adminOk[\s\S]{0,200}req\.query/.test(srv));
  ok('키가 실린 화면은 리퍼러를 막는다', /Referrer-Policy', 'no-referrer'/.test(srv));
  ok('랭킹에 시즌이 실린다', /season: accounts\.seasonState\(\)/.test(srv));

  const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');
  const htm = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  ok('화면에도 시즌이 보인다', /id="lbSeason"/.test(htm) && /시즌 \$\{r\.season\.no\}/.test(cli));
}

console.log('\n⑤ 무거운 소켓 이벤트에는 따로 간격이 있다');
{
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('간격표가 있다', /const SOCKET_GAP = \{/.test(srv));
  const tbl = srv.slice(srv.indexOf('const SOCKET_GAP = {'), srv.indexOf('io.on(\'connection\''));
  for (const ev of ['create_room', 'quick_join', 'quick_match', 'tv_solo', 'mini_quick'])
    ok(`${ev} 는 연타가 안 된다`, new RegExp(ev + ': \\d{3,}').test(tbl));
  ok('판 안의 수는 넉넉하다', /tv_act: 150/.test(tbl) && /submit_bid: 200/.test(tbl));
  ok('넘친 것은 조용히 버린다', /if \(now - \(socket\._gaps\[ev\] \|\| 0\) < gap\) return;/.test(srv));
  ok('큰 그물도 그대로', /if \(\+\+socket\._rl\.c > 30\) return;/.test(srv));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
