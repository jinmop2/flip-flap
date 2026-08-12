// 칭호 · 쿠폰 칭호 지급 · 싸이클링 · 빨리 끝난 판 기준
//
// 여기 걸린 것들은 전부 "조용히 어긋나는" 부류다.
//   · 칭호 아이콘에 그림이 없으면 시스템 이모지가 그대로 뜬다 (예전에 여러 번 밟았다)
//   · 단계가 뒤집히면 상위 칭호가 하위보다 먼저 풀린다
//   · 쿠폰이 한 명만 쓰게 돼 있는지는 눈으로 확인할 방법이 없다
const fs = require('fs');
const src = __dirname + '/..';
const art = fs.readFileSync(src + '/public/art.js', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const srv = fs.readFileSync(src + '/server.js', 'utf8');
const srv4 = fs.readFileSync(src + '/server4.js', 'utf8');
const g4 = fs.readFileSync(src + '/game4.js', 'utf8');
const accSrc = fs.readFileSync(src + '/accounts.js', 'utf8');

const dir = '/tmp/fftitle';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(src + '/accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(src + '/node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 칭호가 지표마다 세 단계인가');
{
  const T = a.TITLES;
  const fam = {};
  for (const [id, t] of Object.entries(T)) (fam[t.goalKey] = fam[t.goalKey] || []).push({ id, ...t });

  const stat = Object.entries(fam).filter(([k]) => k !== '__never');
  ok('지표가 여럿이다', stat.length >= 8, String(stat.length) + '종');
  const thin = stat.filter(([, list]) => list.length < 3).map(([k, l]) => `${k}=${l.length}`);
  ok('모든 지표가 3단계 이상', thin.length === 0, thin.join(' '));

  // 같은 지표 안에서 목표가 겹치면 두 개가 동시에 풀려 단계가 무너진다
  const dupGoal = [];
  for (const [k, list] of stat) {
    const goals = list.map((x) => x.goal);
    if (new Set(goals).size !== goals.length) dupGoal.push(k);
  }
  ok('같은 지표에 같은 목표가 없다', dupGoal.length === 0, dupGoal.join(' '));

  // id 는 달라도 이름이 겹치면 화면에서 구분이 안 된다
  const names = Object.values(T).map((t) => t.name);
  ok('이름이 겹치지 않는다', new Set(names).size === names.length);

  for (const [k, list] of stat) {
    const sorted = [...list].sort((x, y) => x.goal - y.goal);
    console.log(`     ${k.padEnd(12)} ${sorted.map((x) => `${x.name}(${x.goal})`).join(' → ')}`);
  }
}

console.log('\n② 칭호 아이콘에 그림이 있는가');
{
  // ico() 로 그리므로 그림이 없으면 시스템 이모지가 그대로 뜬다.
  // emoteArt 와 같은 순서로 찾는다: EMOTE_ART → RANK_ART → ICON_ART
  const grab = (n) => {
    const m = art.match(new RegExp('const ' + n + ' = \\{([\\s\\S]*?)\\n\\};'));
    return m ? [...m[1].matchAll(/^\s{2}'([^']+)'\s*:/gm)].map((x) => x[1]) : [];
  };
  const have = new Set([...grab('ICON_ART'), ...grab('RANK_ART'), ...grab('EMOTE_ART')]);
  const has = (e) => have.has(e) || have.has(e + '️') || have.has(e.replace(/️/g, ''));
  const miss = Object.entries(a.TITLES).filter(([, t]) => !has(t.icon)).map(([id, t]) => `${id}:${t.icon}`);
  ok('모든 칭호 아이콘에 그림이 있다', miss.length === 0, miss.join(' '));
}

console.log('\n③ 단계가 순서대로 풀리는가');
{
  const t = a.signup('titleman', 'pw1234', '칭호').token;
  const u = a.byToken(t);
  u.coins = 0; u.titles = {};
  const owned = () => a.titleList(t).list.filter((x) => x.owned).map((x) => x.id);

  u.coins = 2500; a.checkTitles ? a.checkTitles(u) : null;
  // checkTitles 는 내부 함수라 결과 반영 경로(recordResult)를 쓴다
  a.recordResult(t, 'win', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120 });
  ok('코인 2,500 → 큰손만', owned().includes('t_rich') && !owned().includes('t_rich5k'),
     owned().join(' '));

  a.byToken(t).coins = 6000;
  a.recordResult(t, 'win', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120 });
  ok('코인 6,000 → 갑부까지', owned().includes('t_rich5k') && !owned().includes('t_rich15k'),
     owned().join(' '));

  a.byToken(t).coins = 20000;
  a.recordResult(t, 'win', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120 });
  ok('코인 20,000 → 재벌까지', owned().includes('t_rich15k'));

  ok('조건으로는 초대 패왕이 안 풀린다', !owned().includes('t_invite'));
  ok('조건으로는 창단 멤버가 안 풀린다', !owned().includes('t_founder'));
}

console.log('\n④ 쿠폰이 칭호를 준다 · 한 명만 쓴다');
{
  const r = a.createCoupons(1, 0, { maxUses: 1, title: 't_invite', code: 'INVITEPAEWANG', memo: '초대 패왕' });
  ok('칭호만 주는 쿠폰이 만들어진다', !!(r && r.ok), r && r.error);
  ok('코드를 직접 정할 수 있다', r.ok && /INVI/.test(r.codes[0]), r.ok && r.codes[0]);

  const t1 = a.signup('cpnone', 'pw1234', '첫째').token;
  const t2 = a.signup('cpntwo', 'pw1234', '둘째').token;
  const code = r.codes[0];
  const x1 = a.redeemCoupon(t1, code, '1.1.1.1');
  ok('첫 사람이 받는다', !!(x1 && x1.ok && x1.title && x1.title.id === 't_invite'), x1 && x1.error);
  ok('실제로 보유하게 된다', !!a.byToken(t1).titles.t_invite);
  ok('코인은 안 준다', a.byToken(t1).coins === 200, String(a.byToken(t1).coins));
  ok('장착할 수 있다', !!a.equipTitle(t1, 't_invite').ok);

  ok('둘째는 못 쓴다', !!a.redeemCoupon(t2, code, '2.2.2.2').error);
  ok('둘째는 장착도 못 한다', !!a.equipTitle(t2, 't_invite').error);
  ok('첫 사람도 다시 못 쓴다', !!a.redeemCoupon(t1, code, '1.1.1.1').error);

  ok('없는 칭호는 거부', !!a.createCoupons(1, 0, { title: 'nope' }).error);
  ok('__proto__ 거부', !!a.createCoupons(1, 0, { title: '__proto__' }).error);
  ok('오염 안 됨', ({}).polluted === undefined);
  ok('같은 코드 두 번 거부', !!a.createCoupons(1, 0, { title: 't_invite', code: 'INVITEPAEWANG' }).error);
  ok('짧은 코드 거부', !!a.createCoupons(1, 0, { title: 't_invite', code: 'AB' }).error);
  ok('코드 지정 + 여러 장 거부', !!a.createCoupons(5, 0, { title: 't_invite', code: 'MANYCODE12' }).error);
  ok('칭호 없이 코인 0 은 거부', !!a.createCoupons(1, 0, {}).error);

  // 화면이 "🪙 0 코인을 받았어요" 라고 띄우면 안 된다
  ok('화면이 칭호를 따로 적는다', /res\.title/.test(cli) && /칭호/.test(cli));
  ok('코인 0 이면 코인 문구를 안 낸다', /if \(res\.amount\)/.test(cli));
  ok('관리자 화면에 칭호 선택이 있다', /id="title"/.test(srv) && /accounts\.TITLES/.test(srv));
  ok('관리자 화면에 코드 지정이 있다', /id="code"/.test(srv));
}

console.log('\n⑤ 싸이클링 (일일퀴스트)');
{
  ok('필요한 종류가 2·3·4·6', JSON.stringify(a.CYCLE_KINDS) === JSON.stringify([2, 3, 4, 6]));
  ok('보상이 400', a.CYCLE_REWARD === 400);

  const t = a.signup('cycleman', 'pw1234', '싸이클').token;
  const u = a.byToken(t);
  const win = (kind) => a.recordResult(t, 'win', {
    vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120, setKind: kind });

  const c1 = win(2).rewards.cycle;
  ok('2 세트 우승이 기록된다', !!(c1 && c1.fresh && !c1.done && c1.kind === 2), JSON.stringify(c1));
  ok('진행도가 1/4', c1.got === 1);

  const same = win(2).rewards.cycle;
  ok('같은 종류를 또 이겨도 안 늘어난다', same && !same.fresh && !same.done && same.got === 1);

  win(3); win(4);
  ok('3/4 까지는 보상 없음', (u.stats.cycle || 0) === 0);
  const before = a.byToken(t).coins;
  const done = win(6).rewards.cycle;
  ok('넷을 채우면 완성', !!(done && done.done), JSON.stringify(done));
  // 코인은 완성 시점이 아니라 미션 창에서 수령할 때 들어온다.
  ok('완성만으로는 400 이 안 들어온다', a.byToken(t).coins - before < 400,
     `${before} → ${a.byToken(t).coins}`);
  const beforeClaim = a.byToken(t).coins;
  const got = a.claimMission(t, 'm_cycle');
  ok('수령하면 400 코인', got.ok && a.byToken(t).coins - beforeClaim === 400,
     `${beforeClaim} → ${a.byToken(t).coins}`);
  ok('누적 횟수가 쌓인다', a.byToken(t).stats.cycle === 1);
  ok('칭호가 풀린다', !!a.byToken(t).titles.t_cycle1);

  // 하루에 한 번만
  const again = win(2);
  ok('같은 날 또 완성해도 안 준다', !again.rewards.cycle,
     JSON.stringify(again.rewards.cycle));
  ok('누적도 안 늘어난다', a.byToken(t).stats.cycle === 1);

  // 날짜가 바뀌면 초기화된다 — 미션 상태에 얹어 뒀으므로 같이 리셋된다
  a.byToken(t).missions.day = '2000-01-01';
  const nextDay = win(2).rewards.cycle;
  ok('다음 날 다시 시작된다', !!(nextDay && nextDay.fresh && nextDay.got === 1),
     JSON.stringify(nextDay));

  // 미션 목록에 붙어 나오는가
  const ml = a.missionList(t);
  const row = ml.list.find((x) => x.id === 'm_cycle');
  ok('일일미션 목록에 있다', !!row, JSON.stringify(ml.list.map((x) => x.id)));
  ok('무작위 3개 + 싸이클링', ml.list.length === 4, String(ml.list.length));
  ok('종류별 상태를 같이 준다', Array.isArray(row.cycle) && row.cycle.length === 4);
  ok('2 는 완료로 표시', row.cycle.find((c) => c.kind === 2).done === true);
  ok('3 은 아직', row.cycle.find((c) => c.kind === 3).done === false);
  ok('목표는 4, 보상은 400', row.goal === 4 && row.reward === 400);

  // 세지 않는 경우
  const t2 = a.signup('cycletwo', 'pw1234', '싸이클둘').token;
  ok('세트 우승이 아니면 무시',
     !a.recordResult(t2, 'win', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120 }).rewards.cycle);
  ok('없는 종류(5)는 무시',
     !a.recordResult(t2, 'win', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120, setKind: 5 }).rewards.cycle);
  ok('진 판은 안 센다',
     !a.recordResult(t2, 'loss', { vsBot: true, difficulty: 'easy', turns: 9, playtimeSec: 120, setKind: 2 }).rewards.cycle);

  const t3 = a.signup('cyclebad', 'pw1234', '싸이클셋').token;
  const short = a.recordResult(t3, 'win', { vsBot: false, turns: 2, playtimeSec: 5, setKind: 2 });
  ok('짧은 판은 안 센다', !short.rewards.cycle);

  // 서버가 세트 종류를 실제로 넘기는가
  ok('세트 우승 경로에서만 넘긴다', /finishStats\(room, winner, false, p1Set \|\| p2Set\)/.test(srv));
  ok('recordResult 로 전달된다', /oppUid, forfeit, setKind,/.test(srv));
  ok('시간패·탈주는 안 넘긴다', /function finishStats\(room, winner, forfeit = false, setKind = null\)/.test(srv));

  // 화면
  ok('미션 화면이 종류별로 그린다', /mis-cyc-k/.test(cli));
  ok('클라가 금액을 서버로 안 보낸다', !/emit\('cycle'/.test(cli));
  ok('진행 상태가 미션 안에 있다', /m\.cycle = m\.cycle \|\| \{\}/.test(accSrc));
}

console.log('\n⑥ 빨리 끝난 판 기준');
{
  const m = accSrc.match(/const MIN_TURNS = (\d+), MIN_PLAYTIME = (\d+)/);
  ok('기준을 찾았다', !!m);
  ok('시간 기준이 30초', m && +m[2] === 30, m && m[2]);
  ok('턴 기준은 그대로 5턴', m && +m[1] === 5, m && m[1]);

  const t = a.signup('shortman', 'pw1234', '짧은판').token;
  // 35초 · 9턴 → 정상 인정
  const good = a.recordResult(t, 'win', { vsBot: false, turns: 9, playtimeSec: 35 });
  ok('35초 판은 보상이 나온다', good && good.rewards && good.rewards.coins > 0,
     JSON.stringify(good && good.rewards));
  // 25초 → 여전히 막힌다
  const bad = a.recordResult(t, 'win', { vsBot: false, turns: 9, playtimeSec: 25 });
  ok('25초 판은 여전히 막힌다', bad && bad.rewards && !bad.rewards.coins,
     JSON.stringify(bad && bad.rewards));
  // 턴이 모자라면 시간이 넉넉해도 막힌다
  const few = a.recordResult(t, 'win', { vsBot: false, turns: 2, playtimeSec: 300 });
  ok('턴이 모자라면 막힌다', few && few.rewards && !few.rewards.coins);
}

console.log('\n⑦ 티배깅 이모트');
{
  // 상점 미리보기·피커에만 붙어 있어서 정작 판에서는 안 흔들렸다
  ok('보낼 때도 흔들리는 클래스를 붙인다', /emoji === '🫖'[\s\S]{0,80}em-teabag/.test(cli));
  const html = fs.readFileSync(src + '/public/index.html', 'utf8');
  ok('흔드는 애니메이션이 있다', /@keyframes teaDip/.test(html));
  ok('말풍선에도 규칙이 걸린다', /\.em-teabag svg/.test(html));
  ok('모션 줄이기 배려', /prefers-reduced-motion[\s\S]{0,120}em-teabag/.test(html));

  // 팩 이모트가 전부 그려지는가 (emoteArt 는 EMOTE_ART → RANK_ART → ICON_ART 순)
  const grab = (n) => {
    const m = art.match(new RegExp('const ' + n + ' = \\{([\\s\\S]*?)\\n\\};'));
    return m ? [...m[1].matchAll(/^\s{2}'([^']+)'\s*:/gm)].map((x) => x[1]) : [];
  };
  const have = new Set([...grab('EMOTE_ART'), ...grab('RANK_ART'), ...grab('ICON_ART')]);
  const packs = cli.match(/const EMOTE_PACKS = \{([\s\S]*?)\n\};/)[1];
  const miss = [];
  for (const row of packs.split('\n')) {
    const mm = row.match(/(\w+):\s*\[(.*)\]/); if (!mm) continue;
    for (const e of [...mm[2].matchAll(/'([^']+)'/g)].map((x) => x[1]))
      if (!have.has(e) && !have.has(e + '️') && !have.has(e.replace(/️/g, ''))) miss.push(mm[1] + ':' + e);
  }
  ok('팩 이모트에 전부 그림이 있다', miss.length === 0, miss.join(' '));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
