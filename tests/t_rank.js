// 급수 / 단 / ACE 사다리
//
// 여기서 갈라야 할 규칙이 셋이다.
//   · 급수는 RP 만 채우면 자동으로 오르고 절대 내려가지 않는다
//   · 단은 RP 를 채워도 자동으로 안 오른다 — 승단전(5판 3승)을 통과해야 한다
//   · ACE 는 9단 중 상위 100명뿐, RP 순위로 자리가 오간다
//
// 등급이 RP 만의 함수가 아니게 됐다는 게 핵심이다. 표시용으로 rankOf(rp) 를
// 그대로 쓰면 승단전을 통과하지 않은 사람도 단으로 보인다.
const fs = require('fs');
const src = __dirname + '/..';
const accSrc = fs.readFileSync(src + '/accounts.js', 'utf8');
const art = fs.readFileSync(src + '/public/art.js', 'utf8');

const dir = '/tmp/ffrank';
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
const player = (rp = 0) => {
  const id = 'rk' + (seq++) + 'user';
  const t = a.signup(id, 'pw1234', '랭크' + seq).token;
  const u = a.byToken(t);
  u.rp = rp; u.mmr = rp; u.rank = '10K'; u.winStreak = 0;
  a.refreshRankState(u);
  return { t, u };
};
const play = (t, win, opts = {}) => a.recordResult(t, win ? 'win' : 'loss', {
  vsBot: false, turns: 9, playtimeSec: 120, oppUid: 'opp' + (seq++), ...opts,
}).rewards;

console.log('\n① 등급표가 이어져 있는가');
{
  const R = a.RANKS;
  ok('19개 등급', R.length === 19, String(R.length));
  ok('10급부터', R[0].id === '10K' && R[0].min === 0);
  ok('9단이 마지막', R[R.length - 1].id === '9D' && R[R.length - 1].max === null);
  const gaps = [];
  for (let i = 0; i + 1 < R.length; i++) {
    if (R[i].max === null) continue;
    if (R[i].max + 1 !== R[i + 1].min) gaps.push(`${R[i].id}→${R[i + 1].id}`);
  }
  ok('구간에 빈틈·겹침이 없다', gaps.length === 0, gaps.join(' '));
  ok('급수 10개 · 단 9개',
     R.filter((r) => r.tier === 'kyu').length === 10 && R.filter((r) => r.tier === 'dan').length === 9);

  // 아이콘에 그림이 없으면 그 등급만 시스템 이모지로 뜬다
  const grab = (n) => {
    const m = art.match(new RegExp('const ' + n + ' = \\{([\\s\\S]*?)\\n\\};'));
    return m ? [...m[1].matchAll(/^\s{2}'([^']+)'\s*:/gm)].map((x) => x[1]) : [];
  };
  const have = new Set([...grab('ICON_ART'), ...grab('RANK_ART'), ...grab('EMOTE_ART')]);
  const has = (e) => have.has(e) || have.has(e + '️') || have.has(e.replace(/️/g, ''));
  const miss = R.filter((r) => !has(r.icon)).map((r) => r.id + ':' + r.icon);
  ok('모든 등급 아이콘에 그림이 있다', miss.length === 0, miss.join(' '));
}

console.log('\n② 급수 — RP 만 채우면 오르고, 내려가지 않는다');
{
  const { t, u } = player(0);
  ok('시작은 10급', a.displayRankOf(u).name === '10급');

  u.rp = 300; a.refreshRankState(u);
  ok('RP 300 → 8급', a.displayRankOf(u).name === '8급', a.displayRankOf(u).name);

  u.rp = 2100; a.refreshRankState(u);
  ok('RP 2100 → 1급', a.displayRankOf(u).name === '1급', a.displayRankOf(u).name);

  // 여기서 RP 가 떨어져도 등급은 그대로여야 한다
  u.rp = 0; a.refreshRankState(u);
  ok('RP 가 0 이 돼도 1급 그대로', a.displayRankOf(u).name === '1급', a.displayRankOf(u).name);
  ok('강등이 없다', u.rank === '1K');

  // 져도 등급은 안 내려간다
  u.rp = 2100; a.refreshRankState(u);
  for (let i = 0; i < 20; i++) play(t, false);
  ok('20연패해도 1급', a.displayRankOf(a.byToken(t)).name === '1급',
     `${a.displayRankOf(a.byToken(t)).name} · RP ${a.byToken(t).rp}`);
}

console.log('\n③ 단 — RP 를 채워도 자동으로 안 오른다');
{
  const { u } = player(0);
  u.rank = '1K'; u.rp = 3000;      // 초단 구간(2475~)을 훌쩍 넘겼다
  a.refreshRankState(u);
  ok('RP 를 넘겨도 1급 그대로', u.rank === '1K', u.rank);
  ok('대신 승단 자격이 생긴다', u.promoEligible === true);
  ok('표시도 1급', a.displayRankOf(u).name === '1급');

  // RP 로만 보면 초단이다 — 이 둘이 갈리는 게 핵심
  ok('RP 로만 보면 단 구간', a.rankOf(3000).tier === 'dan', a.rankOf(3000).name);
  ok('초단 구간 경계', a.rankOf(2475).name === '초단' && a.rankOf(2824).name === '초단');
  ok('그래도 표시는 급수', a.displayRankOf(u).tier === 'kyu');

  // RP 가 급수 구간을 통째로 넘겨도 1급까지는 올라가야 한다.
  // 예전엔 "급수일 때만 올린다" 라서, 낮은 급수인 채로 RP 만 치솟으면
  // 그 자리에 영원히 묶였다.
  const far = player(0).u;
  far.rank = '5K'; far.rp = 9999;
  a.refreshRankState(far);
  ok('RP 가 넘쳐도 1급까지는 오른다', far.rank === '1K', far.rank);
  ok('단으로는 자동 진입 안 함', a.displayRankOf(far).tier === 'kyu');
  ok('대신 승단 자격', far.promoEligible === true);
}

console.log('\n④ 승단전 — 5판 3승');
{
  const { u } = player(0);
  u.rank = '1K'; u.rp = 3000; a.refreshRankState(u);
  ok('승단전 시작', a.startPromo(u) === true);
  ok('승단전 중', !!u.promo);

  a.promoResult(u, true); a.promoResult(u, false);
  ok('1승 1패면 아직', !!u.promo && u.promo.wins === 1 && u.promo.losses === 1);
  ok('승단전 중엔 등급 고정', u.rank === '1K');

  a.promoResult(u, true);
  const r = a.promoResult(u, true);
  ok('3승이면 통과', !!(r && r.done && r.passed), JSON.stringify(r));
  ok('초단이 된다', u.rank === '1D', u.rank);
  ok('승단전 상태가 정리된다', !u.promo && !u.promoEligible);

  // 실패 경로
  const b = player(0).u;
  b.rank = '1K'; b.rp = 3000; a.refreshRankState(b);
  a.startPromo(b);
  const rpBefore = b.rp;
  a.promoResult(b, false); a.promoResult(b, false);
  ok('2패까진 유지', !!b.promo);
  const f = a.promoResult(b, false);
  ok('3패면 실패', !!(f && f.done && !f.passed));
  ok('1급 그대로', b.rank === '1K');
  ok('RP 100 깎인다', b.rp === rpBefore - 100, `${rpBefore} → ${b.rp}`);
  ok('자격도 사라진다', !b.promoEligible);
}

console.log('\n⑤ ACE — 9단 상위 100명');
{
  // 101명을 9단으로 만들어 정원을 넘겨 본다
  const made = [];
  for (let i = 0; i < 101; i++) {
    const { u } = player(0);
    u.rank = '9D'; u.rp = 6000 + i;      // i 가 클수록 RP 높음
    made.push(u);
  }
  a.refreshAce();
  const aces = made.filter((u) => u.isAce);
  ok('정원은 100명', aces.length === a.ACE_CAPACITY, String(aces.length));
  ok('RP 가 가장 낮은 한 명이 밀린다', made[0].isAce === false, 'RP ' + made[0].rp);
  ok('밀린 사람은 9단으로', made[0].rank === '9D');

  const top = made[made.length - 1];
  ok('1위 표시', top.isAce && top.aceStanding === 1, String(top.aceStanding));
  ok('ACE 로 보인다', a.displayRankOf(top).name === 'ACE');
  ok('순위가 실려 나간다', a.displayRankOf(top).standing === 1);

  // RP 가 오르면 자리가 바뀐다
  made[0].rp = 99999; a.refreshAce();
  ok('RP 를 올리면 ACE 로 복귀', made[0].isAce === true && made[0].aceStanding === 1);
}

console.log('\n⑥ RP 계산 — MMR 보정 · 연승 보너스');
{
  const { u } = player(1000);
  u.rank = '5K';                          // 하한 750

  // 기대치와 비슷 → 계수 1.0
  u.mmr = 800;
  const even = a.calcRpDelta(u, 'winlose', { didWin: true }, 0);
  ok('보통은 기본값', even.delta === a.RP_CONFIG.baseWin, String(even.delta));

  // 실력이 기대치보다 훨씬 높으면 가속
  u.mmr = 750 + a.RP_CONFIG.mmrBand + 50;
  const high = a.calcRpDelta(u, 'winlose', { didWin: true }, 0);
  ok('실력이 높으면 더 준다', high.delta > even.delta, `${even.delta} → ${high.delta}`);

  // 낮으면 늦춘다 (운으로 올라온 자리가 오래 안 남게)
  u.mmr = 750 - a.RP_CONFIG.mmrBand - 50;
  const low = a.calcRpDelta(u, 'winlose', { didWin: true }, 0);
  ok('실력이 낮으면 덜 준다', low.delta < even.delta, `${even.delta} → ${low.delta}`);

  // 연승 보너스
  u.mmr = 800;
  const s2 = a.calcRpDelta(u, 'winlose', { didWin: true }, 2).delta;
  const s3 = a.calcRpDelta(u, 'winlose', { didWin: true }, 3).delta;
  const s9 = a.calcRpDelta(u, 'winlose', { didWin: true }, 9).delta;
  ok('2연승까진 보너스 없음', s2 === even.delta, String(s2));
  ok('3연승부터 붙는다', s3 > s2, `${s2} → ${s3}`);
  ok('상한이 있다', s9 - even.delta === a.RP_CONFIG.streakBonusMax,
     `+${s9 - even.delta} (상한 ${a.RP_CONFIG.streakBonusMax})`);

  // 패배엔 연승 보너스가 안 붙는다
  const lose = a.calcRpDelta(u, 'winlose', { didWin: false }, 9);
  ok('패배엔 보너스 없음', lose.delta === Math.round(a.RP_CONFIG.baseLose * 1.0), String(lose.delta));

  // 다인전 순위제
  const p1 = a.calcRpDelta(u, 'rank', { place: 1 }, 0).delta;
  const p4 = a.calcRpDelta(u, 'rank', { place: 4 }, 0).delta;
  ok('1위는 오르고 4위는 내린다', p1 > 0 && p4 < 0, `${p1} / ${p4}`);
}

console.log('\n⑦ 실제 대전에 연결됐는가');
{
  const { t, u } = player(0);
  const before = u.rp;
  const r = play(t, true);
  ok('이기면 RP 가 오른다', a.byToken(t).rp > before, `${before} → ${a.byToken(t).rp}`);
  ok('MMR 도 따라 움직인다', a.byToken(t).mmr !== undefined);
  ok('등급 정보가 실려 나간다', !!r.rankInfo);

  // 연승 보너스가 한 판 앞서가면 안 된다 (winStreak 을 두 번 올리는 사고)
  const { t: t2, u: u2 } = player(0);
  u2.mmr = 0;
  const d = [];
  for (let i = 0; i < 4; i++) { const b = a.byToken(t2).rp; play(t2, true); d.push(a.byToken(t2).rp - b); }
  ok('1·2연승은 보너스 없음', d[0] === d[1], d.join(' '));
  ok('3연승부터 커진다', d[2] > d[1], d.join(' '));
  console.log(`     4연승 RP 변화: ${d.join(' → ')}`);

  // AI전·친선전은 RP 를 안 준다
  const { t: t3 } = player(0);
  play(t3, true, { vsBot: true, difficulty: 'expert' });
  ok('AI전은 RP 없음', a.byToken(t3).rp === 0, String(a.byToken(t3).rp));
  const { t: t4 } = player(0);
  play(t4, true, { friendly: true });
  ok('친선전도 RP 없음', a.byToken(t4).rp === 0, String(a.byToken(t4).rp));
}

console.log('\n⑧ 미접속 감소는 단·ACE 에만');
{
  const { u } = player(500);
  u.rank = '6K'; u.lastLoginIdx = 0;
  const kyuBefore = u.rp;
  a.claimDaily && null;                       // 감소는 출석 시 정산된다
  ok('급수는 안 깎인다 (규칙상 강등 없음)', /!\(u\.isAce \|\| cur\.tier === 'dan'\)/.test(accSrc));
  ok('예전 RP 문턱은 사라졌다', !/DECAY_RANK_RP/.test(accSrc));
  ok('감소 뒤 등급 상태를 다시 본다', /refreshRankState\(u\);\s*\/\/ 승단 자격이 풀릴 수 있다/.test(accSrc));
  void kyuBefore;
}

console.log('\n⑨ 시즌 리셋');
{
  const { u: d1 } = player(0); d1.rank = '5D'; d1.rp = 4000;
  const { u: k1 } = player(0); k1.rank = '3K'; k1.rp = 1400;
  const kyuRp = k1.rp;
  a.seasonReset();
  ok('단은 한 단계 아래로', d1.rank === '4D', d1.rank);
  ok('RP 도 그 등급 하한으로', d1.rp === a.RANKS.find((r) => r.id === '4D').min, String(d1.rp));
  ok('급수는 그대로', k1.rank === '3K' && k1.rp === kyuRp, `${k1.rank} ${k1.rp}`);
  ok('최고 기록은 남는다', d1.bestRank === '5D', d1.bestRank);
  ok('연승·승단전은 초기화', !d1.winStreak && !d1.promo && !d1.promoEligible);
}

console.log('\n⑩ 화면에 필요한 것이 실려 나가는가');
{
  const { t, u } = player(1500);
  u.rank = '3K'; u.rp = 1500; a.refreshRankState(u);
  const p = a.profileOf(u);
  ok('등급 이름·아이콘·색', !!(p.rank && p.rankIcon && p.rankColor));
  ok('등급 id 와 계층', p.rankId === '3K' && p.rankTier === 'kyu');
  ok('다음 등급까지 남은 RP', p.rankInfo && typeof p.rankInfo.need === 'number',
     JSON.stringify(p.rankInfo));
  ok('다음 등급 이름', p.rankInfo.nextName === '2급', p.rankInfo.nextName);

  u.rp = 3000; a.refreshRankState(u);      // 1급까지 오르고 승단 자격이 생긴다
  ok('1급이 된다', u.rank === '1K', u.rank);
  const p2 = a.profileOf(u);
  ok('자격이 차면 알려준다', p2.rankInfo.promoReady === true, JSON.stringify(p2.rankInfo));

  a.startPromo(u);
  const p3 = a.profileOf(u);
  ok('승단전 중이면 전적을 준다', !!(p3.rankInfo.promo && p3.rankInfo.promo.need === 3),
     JSON.stringify(p3.rankInfo));
  void t;
}

console.log('\n⑪ 예전 계정 이관');
{
  // 예전 계정에는 rank 필드가 없다 (RP 만으로 등급을 정하던 시절).
  // 세워 주지 않으면 RP 가 아무리 높아도 전부 10급으로 떨어져 보인다 — 실제로 그랬다.
  const mk = (rp) => {
    const { u } = player(0);
    u.rp = rp; delete u.rank; delete u.mmr;
    return u;
  };
  ok('RP 0 → 10급', a.displayRankOf(mk(0)).name === '10급');
  ok('RP 120 → 9급', a.displayRankOf(mk(120)).name === '9급', a.displayRankOf(mk(120)).name);
  ok('RP 1800 → 2급', a.displayRankOf(mk(1800)).name === '2급', a.displayRankOf(mk(1800)).name);
  ok('RP 가 넘쳐도 1급까지만', a.displayRankOf(mk(9999)).name === '1급', a.displayRankOf(mk(9999)).name);
  ok('단으로 자동 진입은 없다', a.displayRankOf(mk(9999)).tier === 'kyu');

  // MMR 은 지연 초기화 — 등급을 세울 때 같이 채워진다
  const hi = mk(9999);
  a.displayRankOf(hi);
  ok('MMR 도 같이 세워 준다', hi.mmr === 9999, String(hi.mmr));
  // 세우기 전이라도 계산이 터지면 안 된다 (RP 로 대신 본다)
  const raw = mk(500);
  ok('MMR 이 없어도 계산된다', typeof a.calcRpDelta(raw, 'winlose', { didWin: true }, 0).delta === 'number');
  ok('프로필로도 이관된다', a.profileOf(mk(1200)).rank === '4급');
  ok('이관 함수가 있다', /function ensureRank/.test(accSrc));

  // 승단 자격은 대전 결과 때만 갱신되던 promoEligible 을 믿으면 안 된다.
  // 로그인 직후처럼 아직 안 돈 시점에 "자격 없음" 으로 보였다 — 실제로 겪었다.
  const fresh = mk(2500);
  fresh.rank = '1K'; delete fresh.promoEligible;
  const ri = a.rankInfoOf(fresh);
  ok('갱신 전에도 자격을 알아본다', ri.promoReady === true, JSON.stringify(ri));
  ok('RP 로 직접 판단한다', /\(u\.rp \|\| 0\) >= next\.min/.test(accSrc));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
