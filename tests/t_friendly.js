// 친선전 보상 · RP 는 랜덤 매칭에서만
//
// 예전엔 친선전(비밀번호 방)이 통째로 보상에서 빠졌다 — "친구랑 하면 손해" 라
// 아무도 안 썼다. 이제 코인·경험치는 주되 RP 만 뺀다.
//
// 여기서 갈라야 할 것이 셋이다.
//   · 친선전 → 코인·경험치 ○, RP ×
//   · 같은 IP → 전부 × (친구가 아니라 한 사람이 계정 두 개를 돌리는 쪽에 가깝다)
//   · 같은 상대와 하루 3판 초과 → 전부 × (친선전도 이 그물에 걸려야 한다)
const fs = require('fs');
const src = __dirname + '/..';
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');

const dir = '/tmp/fffriendly';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(src + '/accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(src + '/node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

let seq = 0;
const player = () => {
  const id = 'fr' + (seq++) + 'user';
  return a.signup(id, 'pw1234', '친선' + seq).token;
};
const play = (t, opts) => a.recordResult(t, 'win', {
  vsBot: false, turns: 9, playtimeSec: 120, ...opts,
}).rewards;

console.log('\n① 친선전 — 코인·경험치는 주고 RP 만 뺀다');
{
  const t = player();
  const r = play(t, { friendly: true, oppUid: 'someone1' });
  ok('막히지 않는다', !r.blocked, r.reason);
  ok('코인이 나온다', r.coins > 0, String(r.coins));
  ok('경험치가 나온다', r.xp > 0, String(r.xp));
  ok('RP 는 0', r.rp === 0, String(r.rp));
  ok('실제 RP 가 안 오른다', (a.byToken(t).rp || 0) === 0);
  ok('화면에 이유를 알려준다', r.noRpFriendly === true);
  console.log(`     친선전 → 코인 ${r.coins} · 경험치 ${r.xp} · RP ${r.rp}`);
}

console.log('\n② 랜덤 매칭 — RP 가 오른다');
{
  const t = player();
  const r = play(t, { oppUid: 'someone2' });
  ok('막히지 않는다', !r.blocked, r.reason);
  ok('코인이 나온다', r.coins > 0);
  ok('RP 가 오른다', r.rp > 0, String(r.rp));
  ok('실제 RP 가 오른다', (a.byToken(t).rp || 0) > 0);
  ok('친선 문구는 안 뜬다', !r.noRpFriendly);
  console.log(`     랜덤 매칭 → 코인 ${r.coins} · 경험치 ${r.xp} · RP ${r.rp}`);
}

console.log('\n③ 같은 IP 는 그대로 막힌다');
{
  const t = player();
  const r = play(t, { sameIp: true, oppUid: 'someone3' });
  ok('막힌다', r.blocked === true);
  ok('이유가 sameip', r.reason === 'sameip', r.reason);
  ok('코인 0', !r.coins);
  ok('RP 0', !r.rp);

  // 친선전이면서 같은 IP 면 IP 쪽이 이긴다 (더 센 제약)
  const t2 = player();
  const r2 = play(t2, { sameIp: true, friendly: true, oppUid: 'someone4' });
  ok('친선 + 같은 IP 는 막힌다', r2.blocked === true, r2.reason);
}

console.log('\n④ 친선전도 반복 파밍 그물에 걸린다');
{
  // 같은 상대와 하루 3판까지만 보상. 예전엔 친선전이 그 앞에서 잘려
  // 이 그물에 닿지도 않았다.
  const t = player();
  const opp = 'farmbuddy';
  const got = [];
  for (let i = 0; i < 5; i++) got.push(play(t, { friendly: true, oppUid: opp }));
  ok('3판까지는 보상', got.slice(0, 3).every((r) => !r.blocked && r.coins > 0),
     got.map((r) => (r.blocked ? 'x' : r.coins)).join(' '));
  ok('4판째부터 막힌다', got[3].blocked === true && got[3].reason === 'repeat',
     got[3].reason);
  ok('5판째도 막힌다', got[4].blocked === true);
  console.log(`     같은 상대 5판 → ${got.map((r) => (r.blocked ? '막힘' : r.coins + '코인')).join(' · ')}`);
}

console.log('\n⑤ 짧은 판은 친선전이어도 안 준다');
{
  const t = player();
  const r = play(t, { friendly: true, oppUid: 'someone5', turns: 2, playtimeSec: 5 });
  ok('막힌다', r.blocked === true);
  ok('이유가 short', r.reason === 'short', r.reason);
}

console.log('\n⑥ 친선전에서도 싸이클링은 쌓인다');
{
  // 코인·경험치를 주기로 한 이상 싸이클링도 같이 가야 앞뒤가 맞는다
  const t = player();
  const r = a.recordResult(t, 'win', {
    vsBot: false, turns: 9, playtimeSec: 120, friendly: true, oppUid: 'someone6', setKind: 2,
  }).rewards;
  ok('세트 우승이 기록된다', !!(r.cycle && r.cycle.fresh), JSON.stringify(r.cycle));
}

console.log('\n⑦ 연승 RP 가중치도 친선전에서는 빠진다');
{
  // 플래티넘 3연승 가중치(+10)가 친선전으로 새면 랭킹이 그대로 오염된다
  const t = player();
  const u = a.byToken(t);
  u.rp = 900; u.winStreak = 5;
  const r = play(t, { friendly: true, oppUid: 'someone7' });
  ok('가중치도 안 붙는다', r.rp === 0, String(r.rp));
  ok('RP 가 그대로', a.byToken(t).rp === 900, String(a.byToken(t).rp));
}

console.log('\n⑧ 화면 문구');
{
  ok('같은 IP 문구가 있다', /reason === 'sameip'/.test(cli));
  ok('친선전 RP 안내가 있다', /noRpFriendly/.test(cli) && /RP는 랭킹전에서/.test(cli));
  // 막힌 게 아니라 "RP 만 없는" 상태를 따로 그려야 한다
  ok('막힘과 따로 그린다', /\} else if \(r\.noRpFriendly\)/.test(cli));
}

console.log('\n⑤ 위장 봇 매치도 사람과 같은 보상');
{
  // 15초 매칭이 안 되면 전문가봇이 유저처럼 들어온다. 유저는 구별할 수
  // 없는데 보상만 다르면 억울하다 — 코인·XP 는 원래 같았고, RP 도 준다.
  // 방 쪽은 vsBot:false 로 꾸미므로(server.js startBotMatch) 여기서도 같이 꾸민다.
  const t = player();
  const r = a.recordResult(t, 'win', { vsBot: false, turns: 10, playtimeSec: 60 });
  ok('코인을 받는다', r.rewards.coins > 0, String(r.rewards.coins));
  ok('RP 도 받는다', r.rewards.rp > 0, String(r.rewards.rp));

  // 서버가 이제 botMatch 를 RP 에서 빼지 않는지 확인한다.
  // 이건 생성된 값이 아니라 불러지는 자리라 소스로 본다.
  const srv = fs.readFileSync(src + '/server.js', 'utf8');
  ok('위장 봇 매치는 RP 제외 목록에 없다', !/noRank:[^,\n]*room\.botMatch/.test(srv));
  ok('아이템전은 그대로 제외', /noRank:[^\n]*!!room\.itemMode/.test(srv));

  // noRank 를 주면 여전히 RP 가 안 붙어야 한다 (아이템전 경로)
  const t2 = player();
  const r2 = a.recordResult(t2, 'win', { vsBot: false, turns: 10, playtimeSec: 60, noRank: true });
  ok('noRank 면 RP 0', !r2.rewards.rp, String(r2.rewards.rp));
  ok('그래도 코인은 나온다', r2.rewards.coins > 0, String(r2.rewards.coins));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
