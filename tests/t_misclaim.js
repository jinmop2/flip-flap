// 일일 미션 — 자동 지급에서 "수령 눌러서 받기" 로 바꾼 것.
//
// 왜 보는가: 돈이 오가는 길이라 실수하면 공짜 코인이 된다.
//   · 목표를 채우기만 해서는 코인이 늘면 안 된다
//   · 수령은 딱 한 번만 (연타·동시 요청 포함)
//   · 아직 못 채운 것, 오늘 목록에 없는 것, 없는 id 는 거절
const fs = require('fs');
const dir = '/tmp/ffmis';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

const t = a.signup('misman', 'pw1234', '미션왕').token;
const me = () => a.byToken(t);
const listOf = () => a.missionList(t).list;
const find = (id) => listOf().find((x) => x.id === id);

// 오늘 배정된 미션 중 하나를 골라 그 목표까지 채운다.
// 미션 세트는 날짜 시드로 정해지므로 특정 id 를 박아 두면 하루 지나 깨진다.
const today = listOf().filter((m) => m.id !== 'm_cycle');
console.log('① 채워도 코인은 그대로');
{
  ok('오늘 미션이 배정됐다', today.length === 3, `${today.length}개`);
  const m = today[0];
  const before = me().coins;
  // 진행은 recordResult 를 거치지 않고 내부 상태를 직접 채운다 —
  // 어떤 이벤트가 배정됐는지에 상관없이 "다 채운 상태" 만 만들면 된다.
  me().missions.prog[m.id] = m.goal;
  const after = find(m.id);
  ok('진행도가 다 찼다', after.prog === after.goal);
  ok('done 으로 표시된다', after.done === true);
  ok('아직 수령 전이다', after.claimed === false);
  ok('코인은 안 늘었다', me().coins === before, `${before} → ${me().coins}`);
}

console.log('\n② 수령해야 들어온다');
{
  const m = today[0];
  const before = me().coins;
  const r = a.claimMission(t, m.id);
  ok('수령 성공', r.ok === true, r.error);
  ok('금액은 서버가 정한다', r.amount === m.reward, `${r.amount} vs ${m.reward}`);
  ok('코인이 늘었다', me().coins === before + m.reward, `${before} → ${me().coins}`);
  ok('claimed 로 바뀐다', find(m.id).claimed === true);
}

console.log('\n③ 두 번은 못 받는다');
{
  const m = today[0];
  const before = me().coins;
  const r = a.claimMission(t, m.id);
  ok('두 번째는 거절', !!r.error, JSON.stringify(r));
  ok('코인 그대로', me().coins === before, `${before} → ${me().coins}`);
}

console.log('\n④ 못 채운 것 · 남의 미션 · 없는 id');
{
  const m = today[1];
  const before = me().coins;
  ok('덜 채웠으면 거절', !!a.claimMission(t, m.id).error);

  // 오늘 배정되지 않은 미션을 다 채운 척해도 안 된다
  const notToday = ['m_play3', 'm_play5', 'm_win1', 'm_win3', 'm_multi1', 'm_expert1', 'm_streak2', 'm_betray']
    .find((id) => !today.some((x) => x.id === id));
  me().missions.prog[notToday] = 99;
  ok('오늘 목록에 없으면 거절', !!a.claimMission(t, notToday).error, notToday);

  ok('없는 id 는 거절', !!a.claimMission(t, 'm_nope').error);
  ok('__proto__ 도 거절', !!a.claimMission(t, '__proto__').error);
  ok('빈 값도 거절', !!a.claimMission(t, '').error);
  ok('로그인 안 됐으면 거절', !!a.claimMission('없는토큰', m.id).error);
  ok('코인은 하나도 안 늘었다', me().coins === before, `${before} → ${me().coins}`);
}

console.log('\n⑤ 싸이클링도 같은 규칙');
{
  const u = me();
  // 2·3·4·6 으로 각각 한 번씩 우승 — 실제 경로(recordResult)로 넣는다.
  // 턴·시간이 짧으면 어뷰징 필터에 걸려 아예 안 세므로 넉넉히 준다.
  const winWith = (k) => a.recordResult(t, 'win',
    { vsBot: false, turns: 10, playtimeSec: 60, setKind: k });
  const kinds = a.CYCLE_KINDS;
  for (const k of kinds.slice(0, -1)) winWith(k);

  // 마지막 한 판이 싸이클링을 완성시킨다. 판 자체도 코인을 주므로
  // "안 늘었다" 로는 못 잰다 — 판이 준 만큼만 늘었는지를 본다.
  const before = u.coins;
  const out = winWith(kinds[kinds.length - 1]);
  const c = find('m_cycle');
  ok('네 종류를 다 채웠다', c.prog === 4 && c.done === true);
  ok('아직 수령 전', c.claimed === false);
  ok('판이 준 만큼만 늘었다', u.coins === before + out.rewards.coins,
     `${before} + ${out.rewards.coins} vs ${u.coins}`);
  ok('보상 400 이 섞여 있지 않다', u.coins < before + a.CYCLE_REWARD,
     `${before} → ${u.coins}`);
  // 칭호용 누적은 수령과 무관하게 올라야 한다 — "해냈다" 는 기록이라서
  ok('칭호용 누적은 올랐다', (u.stats || {}).cycle === 1, String((u.stats || {}).cycle));

  const beforeClaim = u.coins;
  const r = a.claimMission(t, 'm_cycle');
  ok('수령하면 들어온다', r.ok && u.coins === beforeClaim + a.CYCLE_REWARD,
     `${beforeClaim} → ${u.coins}`);
  ok('두 번은 못 받는다', !!a.claimMission(t, 'm_cycle').error);

  // 다 채운 뒤 또 이겨도 누적이 두 번 오르면 안 된다
  const cnt = u.stats.cycle;
  winWith(2);
  ok('완성 뒤 또 이겨도 누적은 그대로', u.stats.cycle === cnt, String(u.stats.cycle));
}

console.log('\n⑥ 못 채운 싸이클링은 거절');
{
  const t2 = a.signup('misman2', 'pw1234', '미션둘').token;
  const u2 = a.byToken(t2);
  for (const k of [2, 3]) a.recordResult(t2, 'win',
    { vsBot: false, turns: 10, playtimeSec: 60, setKind: k });
  const before = u2.coins;
  ok('2/4 에서는 거절', !!a.claimMission(t2, 'm_cycle').error);
  ok('코인 그대로', u2.coins === before);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
