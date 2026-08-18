// 토너먼트 대진표 — 여기가 틀리면 대회 전체가 틀어진다.
//
// 대진만 다루는 순수 모듈이라 서버를 안 띄우고 확인할 수 있다.
// 특히 보는 것: 8명이 안 차도 시작되는가, 진 사람이 다시 안 올라오는가,
// 중간에 나가도 남은 사람들이 계속 진행되는가, 등수·상금이 맞는가.
const T = require('../tournament.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// 시드 난수 — 같은 대진을 다시 만들 수 있어야 실패를 재현한다
function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const people = (n) => Array.from({ length: n }, (_, i) => ({ key: 'p' + i, nick: '사람' + i, isBot: false, token: 't' + i }));

console.log('① 자리 채우기');
{
  const t = T.createBracket(people(8), rngOf(1));
  ok('여덟 자리', t.seats.length === 8);
  ok('AI 가 안 섞인다', t.seats.every((s) => !s.isBot));
  ok('8강 네 경기', t.rounds[0].length === 4);
  ok('모두 한 번씩만 나온다',
     new Set(t.rounds[0].flatMap((m) => [m.a, m.b])).size === 8);

  // 30초에 안 차면 AI 로 메운다 — 사람이 하나여도 시작한다
  const solo = T.createBracket(people(1), rngOf(2));
  ok('한 명이어도 여덟 자리', solo.seats.length === 8);
  ok('나머지는 AI', solo.seats.filter((s) => s.isBot).length === 7);
  ok('사람은 그대로 있다', solo.seats.filter((s) => !s.isBot).length === 1);

  const five = T.createBracket(people(5), rngOf(3));
  ok('다섯이면 AI 셋', five.seats.filter((s) => s.isBot).length === 3);
  ok('AI 열쇠가 겹치지 않는다',
     new Set(five.seats.map((s) => s.key)).size === 8);
}

console.log('\n② 한 대회를 끝까지');
{
  const t = T.createBracket(people(8), rngOf(7));
  // 8강 — 언제나 a 가 이긴다고 두면 대진을 따라가기 쉽다
  const r8 = T.curRound(t).map((m) => m.a);
  for (let i = 0; i < 4; i++) T.reportWin(t, i, T.curRound(t)[i].a);
  ok('4강으로 넘어간다', t.round === 1, String(t.round));
  ok('4강은 두 경기', T.curRound(t).length === 2);
  ok('8강 승자만 올라온다',
     T.curRound(t).flatMap((m) => [m.a, m.b]).sort().join() === r8.slice().sort().join());

  const r4 = T.curRound(t).map((m) => m.a);
  T.reportWin(t, 0, T.curRound(t)[0].a);
  ok('한 경기만 끝나면 안 넘어간다', t.round === 1);
  T.reportWin(t, 1, T.curRound(t)[1].a);
  ok('결승으로 간다', t.round === 2 && T.curRound(t).length === 1);
  ok('4강 승자 둘이 결승', [T.curRound(t)[0].a, T.curRound(t)[0].b].sort().join() === r4.slice().sort().join());

  const fin = T.curRound(t)[0];
  const g1 = T.reportWin(t, 0, fin.a);
  ok('결승 한 판으로는 안 끝난다', g1.seriesGame === true && t.over === false, JSON.stringify(g1));
  const r = T.reportWin(t, 0, fin.a);
  ok('두 판을 이기면 끝난다', t.over === true && r.finished === true);
  ok('우승자가 나온다', r.champion === fin.a, String(r.champion));
}

console.log('\n③ 등수와 상금');
{
  const t = T.createBracket(people(8), rngOf(11));
  const drop8 = [], drop4 = [];
  for (let i = 0; i < 4; i++) { const m = T.curRound(t)[i]; drop8.push(m.b); T.reportWin(t, i, m.a); }
  for (let i = 0; i < 2; i++) { const m = T.curRound(t)[i]; drop4.push(m.b); T.reportWin(t, i, m.a); }
  const fin = T.curRound(t)[0];
  T.reportWin(t, 0, fin.a); T.reportWin(t, 0, fin.a);   // 결승은 2선승

  ok('우승 1위', t.rank[fin.a] === 1);
  ok('준우승 2위', t.rank[fin.b] === 2);
  ok('4강 탈락은 3위', drop4.every((s) => t.rank[s] === 3), JSON.stringify(drop4.map((s) => t.rank[s])));
  ok('8강 탈락은 5위', drop8.every((s) => t.rank[s] === 5));

  ok('우승 상금 1000', T.prizeFor(1) === 1000);
  ok('준우승 상금 200', T.prizeFor(2) === 200);
  ok('3위부터는 없다', T.prizeFor(3) === 0 && T.prizeFor(5) === 0);
  ok('참가비 200', T.ENTRY_FEE === 200);
  ok('30분 주기', T.PERIOD_MS === 30 * 60 * 1000);
}

console.log('\n④ 같은 경기를 두 번 적지 않는다');
{
  // 여기가 새면 상금이 두 번 나가거나 대진이 꼬인다
  const t = T.createBracket(people(8), rngOf(13));
  const m = T.curRound(t)[0];
  ok('첫 보고는 받는다', T.reportWin(t, 0, m.a).ok === true);
  const again = T.reportWin(t, 0, m.b);
  ok('두 번째는 거절', again.ok === false && again.reason === 'done', JSON.stringify(again));
  ok('승자가 안 바뀐다', T.curRound(t)[0].winner === m.a);
  ok('그 경기에 없는 사람은 거절', T.reportWin(t, 1, m.a).ok === false);
  ok('없는 경기도 거절', T.reportWin(t, 99, m.a).ok === false);
}

console.log('\n⑤ 중간에 나가면');
{
  const t = T.createBracket(people(8), rngOf(17));
  const m0 = T.curRound(t)[0];
  const quitter = m0.a, other = m0.b;
  const moves = T.forfeit(t, quitter);
  ok('그 경기는 상대 승리', T.curRound(t)[0].winner === other, String(T.curRound(t)[0].winner));
  ok('부전승이 기록된다', moves.length >= 1 && moves[0].winner === other, JSON.stringify(moves));
  ok('나간 사람은 8강 탈락', t.rank[quitter] === 5);
  ok('남은 경기는 그대로', T.pendingMatches(t).length === 3);

  // 남은 경기를 마저 진행하면 대회가 정상적으로 끝나야 한다
  for (const pm of T.pendingMatches(t)) T.reportWin(t, pm.index, pm.a);
  ok('4강으로 넘어간다', t.round === 1);
  for (const pm of T.pendingMatches(t)) T.reportWin(t, pm.index, pm.a);
  ok('결승까지 간다', t.round === 2);
  const f = T.curRound(t)[0];
  T.reportWin(t, 0, f.a); T.reportWin(t, 0, f.a);
  ok('끝난다', t.over === true);
}

console.log('\n⑥ 결승 직전에 나가면');
{
  const t = T.createBracket(people(8), rngOf(23));
  for (let i = 0; i < 4; i++) T.reportWin(t, i, T.curRound(t)[i].a);
  const m = T.curRound(t)[0];
  T.forfeit(t, m.a);
  ok('4강 부전승', T.curRound(t)[0].winner === m.b, String(T.curRound(t)[0].winner));
  ok('나간 사람은 4강 탈락(3위)', t.rank[m.a] === 3);
  ok('대회는 계속된다', t.over === false);
}

console.log('\n⑦ 화면에 내려보낼 모양');
{
  const t = T.createBracket(people(8), rngOf(29));
  const v = T.view(t, 0);
  ok('내 자리를 표시한다', v.seats[0].me === true && v.seats[1].me === false);
  ok('라운드 이름', v.roundName === '8강', v.roundName);
  ok('대진이 실려 온다', v.rounds.length === 1 && v.rounds[0].matches.length === 4);
  ok('아직 등수는 없다', v.myRank === null);
  T.forfeit(t, 0);
  ok('탈락하면 등수가 뜬다', T.view(t, 0).myRank === 5);
}

console.log('\n⑧′ 결승은 3판 2선승');
{
  ok('8강·4강은 단판', T.BEST_OF[0] === 1 && T.BEST_OF[1] === 1);
  ok('결승은 3판', T.BEST_OF[2] === 3);
  ok('2승이 필요하다', T.winsNeeded(3) === 2 && T.winsNeeded(1) === 1);

  const t = T.createBracket(people(8), rngOf(31));
  for (let i = 0; i < 4; i++) T.reportWin(t, i, T.curRound(t)[i].a);
  for (let i = 0; i < 2; i++) T.reportWin(t, i, T.curRound(t)[i].a);
  const m = T.curRound(t)[0];
  ok('결승 경기에 판수가 붙어 있다', m.bestOf === 3, String(m.bestOf));

  // 한 판씩 주고받아도 끝나면 안 된다
  const r1 = T.reportWin(t, 0, m.a);
  ok('1승은 시리즈 진행', r1.seriesGame === true && t.over === false);
  const r2 = T.reportWin(t, 0, m.b);
  ok('1:1 도 진행', r2.seriesGame === true && t.over === false, JSON.stringify(r2));
  ok('점수가 쌓인다', r2.score[m.a] === 1 && r2.score[m.b] === 1, JSON.stringify(r2.score));
  const r3 = T.reportWin(t, 0, m.b);
  ok('2승이면 끝', t.over === true && r3.champion === m.b, String(r3.champion));
  ok('진 쪽이 준우승', t.rank[m.a] === 2);

  // 결승에서 나가면 남은 판을 기다리지 않고 바로 끝난다
  const t2 = T.createBracket(people(8), rngOf(37));
  for (let i = 0; i < 4; i++) T.reportWin(t2, i, T.curRound(t2)[i].a);
  for (let i = 0; i < 2; i++) T.reportWin(t2, i, T.curRound(t2)[i].a);
  const f = T.curRound(t2)[0];
  T.reportWin(t2, 0, f.a);            // 1승 해 둔 상태에서
  T.forfeit(t2, f.a);                 // 이기고 있던 쪽이 나가면
  ok('나가면 바로 끝난다', t2.over === true, String(t2.over));
  ok('상대가 우승', t2.rank[f.b] === 1, JSON.stringify(t2.rank));
  ok('나간 쪽이 준우승', t2.rank[f.a] === 2);
}

console.log('\n⑧″ 30분마다 열린다');
{
  const half = 30 * 60 * 1000;
  // 정각 12:00 이면 다음은 12:30
  const noon = Date.UTC(2026, 0, 1, 12, 0, 0);
  ok('정각이면 30분 뒤', T.nextStartAt(noon) === noon + half,
     new Date(T.nextStartAt(noon)).toISOString());
  ok('12:01 이면 12:30', T.nextStartAt(noon + 60000) === noon + half);
  ok('12:29 이면 12:30', T.nextStartAt(noon + 29 * 60000) === noon + half);
  ok('12:31 이면 13:00', T.nextStartAt(noon + 31 * 60000) === noon + 2 * half);
  ok('언제 불러도 앞으로 간다', T.nextStartAt(noon) > noon);
}

console.log('\n⑧ 참가비와 상금 (돈이 오가는 길)');
{
  const fs = require('fs');
  const dir = '/tmp/fftour';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir + '/data', { recursive: true });
  fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
  try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
  const cwd = process.cwd();
  process.chdir(dir);
  delete process.env.DATABASE_URL;
  const a = require(dir + '/accounts.js');

  const tk = a.signup('tourman', 'pw1234', '대회왕').token;
  const me = () => a.byToken(tk);
  const start = me().coins;

  const r1 = a.tourEnter(tk, T.ENTRY_FEE);
  ok('참가비가 빠진다', r1.ok && me().coins === start - 200, `${start} → ${me().coins}`);
  a.tourRefund(tk, T.ENTRY_FEE);
  ok('환불되면 돌아온다', me().coins === start, String(me().coins));

  // 코인이 모자라면 못 들어간다 — 여기가 새면 공짜로 참가한다
  me().coins = 100;
  ok('코인이 모자라면 거절', !!a.tourEnter(tk, T.ENTRY_FEE).error);
  ok('거절되면 안 깎인다', me().coins === 100, String(me().coins));

  // 상금은 한 대회에서 한 번만
  me().coins = 0;
  const p1 = a.tourPrize(tk, 'T-1', 1, T.prizeFor(1));
  ok('우승 상금이 들어온다', p1.ok && me().coins === 1000, String(me().coins));
  const dup = a.tourPrize(tk, 'T-1', 1, T.prizeFor(1));
  ok('같은 대회 두 번째는 거절', !!dup.error, JSON.stringify(dup));
  ok('두 번 안 들어온다', me().coins === 1000, String(me().coins));
  ok('다른 대회는 받는다', a.tourPrize(tk, 'T-2', 2, T.prizeFor(2)).ok && me().coins === 1200,
     String(me().coins));
  ok('우승 횟수가 쌓인다', me().stats.tourWins === 1, String(me().stats.tourWins));
  ok('준우승은 우승으로 안 센다', me().stats.tourWins === 1);
  ok('참가 횟수도 센다', me().stats.tourPlays === 2, String(me().stats.tourPlays));
  ok('우승 칭호가 풀린다', !!me().titles.t_tour1);

  process.chdir(cwd);
}

console.log('\n⑨ 서버가 붙여 놓은 길');
{
  const fs = require('fs');
  const srv = fs.readFileSync(__dirname + '/../server.js', 'utf8');
  const cli = fs.readFileSync(__dirname + '/../public/client.js', 'utf8');

  ok('참가는 서버가 받는다', /socket\.on\('tour_join'/.test(srv));
  ok('참가비는 서버가 뺀다', /accounts\.tourEnter\(socket\.token, TOUR\.ENTRY_FEE\)/.test(srv));
  ok('30분마다 대기실을 연다', /function tourEnsureLobby/.test(srv)
     && /startAt: TOUR\.nextStartAt\(\)/.test(srv));
  ok('서버가 뜨면 접수를 연다', /tourEnsureLobby\(\);\s*\/\/ 서버가 뜨면/.test(srv));
  ok('끝나면 다음 회차를 연다', /tourEnsureLobby\(\);\s*\/\/ 다음 회차/.test(srv));
  ok('참가자가 없으면 다음 회차로', /if \(!entrants\.length\) \{ tourEnsureLobby\(\); return; \}/.test(srv));
  ok('다 차면 바로 시작', /entrants\.length >= TOUR\.SIZE/.test(srv));
  ok('시작 직전에는 안 받는다', /startAt - Date\.now\(\) < 3000/.test(srv));
  // 3판 2선승 — 승부가 안 났으면 그 경기의 다음 판을 다시 연다
  ok('시리즈 다음 판을 연다', /if \(r\.seriesGame\)/.test(srv)
     && /tourMakeMatch\(index, m\.a, m\.b\)/.test(srv));
  ok('방 기록을 비워야 다시 만든다', /delete tour\.rooms\[roundKey\(b\.round, index\)\]/.test(srv));
  ok('대회 경기는 RP 미반영', /noRank: !room\.ranked \|\| !!room\.itemMode \|\| !!room\.noRank/.test(srv));
  // 모든 종료 경로가 finishStats 를 지난다 — 거기 한 곳에서만 보고한다
  ok('끝난 판을 대진표에 적는다', /if \(room\.tour && tour && room\.tour\.id === tour\.id\)/.test(srv));
  ok('나가면 그 자리는 진다', /tourForfeitSeat\(seat\)/.test(srv));
  ok('대기 중 나가면 환불', /tourLeaveLobby\(socket, true\)/.test(srv));

  // 새로고침하면 소켓이 바뀌어 대진표가 가리키던 자리를 잃는다
  ok('대회 중에는 새로고침하지 않는다', /window\.tourBackToBracket = function/.test(cli));
  ok('판 중에는 대진표를 안 덮는다', /if \(tourInGame\(\)\) \{ tourPending = v/.test(cli));
  ok('대회 시작하면 창을 접는다', /if \(d && d\.tour\) document\.getElementById\('tourModal'\)\.classList\.remove\('show'\)/.test(cli));
  ok('결승 점수를 보여준다', /m\.bestOf > 1/.test(cli));
  ok('남은 시간을 분·초로', /function tourLeftText/.test(cli));
  ok('다음 개최 시각을 적는다', /function tourClock/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
