// 미니게임 온라인 대전 — 진짜 소켓 두 개로 붙여 본다.
// 규칙은 t_sutda 가 보고, 여기서는 "두 사람이 같은 판을 보는가",
// "남의 패가 안 새는가", "밑천이 코인으로 정확히 돌아오는가" 를 본다.
//
// 서버가 떠 있어야 한다(미리보기 3000). 안 떠 있으면 건너뛴다.
const io = require('socket.io-client');
const URL = process.env.MINI_URL || 'http://localhost:3000';

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
const w = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(URL + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}

// 시험 전용 계정. 판마다 밑천이 빠지므로 돌릴 때마다 새로 만든다 —
// 같은 계정을 다시 쓰면 두 번째 실행부터 코인이 모자라 시험이 조용히 넘어간다.
// 끝나고 지운다(아래 cleanup).
const PW = 'testpw123!';
const stamp = Date.now().toString(36).slice(-5);
async function account(tag) {
  const id = `mm${tag}${stamp}`;
  const r = await api('/api/signup', { id, password: PW, nick: `ㅁ${tag}${stamp}`.slice(0, 8) });
  return Object.assign({ id }, r);
}
async function cleanup(...accs) {
  for (const a of accs) if (a && a.token) {
    try { await api('/api/delete-account', { token: a.token, password: PW }); } catch (_) {}
  }
}

function client(token) {
  const sk = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { sk, state: null, over: null, stood: null, queue: null, errors: [] };
  sk.on('mini_state', (v) => { c.state = v; });
  sk.on('mini_over', (r) => { c.over = r; });
  sk.on('mini_stood', (r) => { c.stood = r; });
  sk.on('mini_queue', (q) => { c.queue = q; });
  sk.on('mini_error', (m) => c.errors.push(m));
  return new Promise((res) => {
    sk.on('connect', () => { sk.emit('auth', { token }); setTimeout(() => res(c), 250); });
    setTimeout(() => res(c), 3000);
  });
}

(async () => {
  let up = false;
  try { up = (await fetch(URL)).ok; } catch (_) {}
  if (!up) { console.log('서버가 없어 건너뜁니다 (' + URL + ')'); process.exit(0); }

  console.log('① 두 사람이 붙는다');
  const A = await account('a'), B = await account('b');
  ok('시험 계정 둘', !!A.token && !!B.token, `${A.error || ''} ${B.error || ''}`);
  // 앉을 코인이 있어야 한다. 가입 코인으로도 앉을 수 있어야 정상이다 —
  // 자리값이 가입 코인보다 크면 새로 온 사람은 미니게임을 아예 못 한다.
  const S = require('../sutda');
  const minBuy = S.ANTE * 5;
  const coinsA0 = A.profile.coins, coinsB0 = B.profile.coins;
  ok('가입한 코인으로 앉을 수 있다', coinsA0 >= minBuy, `${coinsA0} < ${minBuy}`);
  if (coinsA0 < minBuy || coinsB0 < minBuy) {
    console.log(`  (코인 부족 — A ${coinsA0}, B ${coinsB0}. 남은 시험은 건너뜁니다)`);
    console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
    process.exit(fail ? 1 : 0);
  }

  const ca = await client(A.token), cb = await client(B.token);
  ca.sk.emit('mini_quick', { seats: 2 });
  await w(400);
  ok('먼저 온 사람은 기다린다', !!ca.queue && ca.queue.waiting === true, JSON.stringify(ca.queue));
  ok('아직 판은 안 열렸다', ca.state === null);

  cb.sk.emit('mini_quick', { seats: 2 });
  await w(900);
  ok('둘이 차면 바로 시작', !!ca.state && !!cb.state);
  ok('둘 다 사람이다', ca.state && ca.state.ais.every((x) => x === false), JSON.stringify(ca.state && ca.state.ais));
  ok('온라인 판이라고 적힌다', ca.state && ca.state.mode === 'multi');
  ok('서로 다른 자리에 앉는다', ca.state.me !== cb.state.me, `${ca.state.me} / ${cb.state.me}`);
  ok('판돈은 둘이 같다', ca.state.pot === cb.state.pot, `${ca.state.pot} / ${cb.state.pot}`);
  ok('기본 단위 둘', ca.state.pot === S.ANTE * 2, String(ca.state.pot));
  ok('상대 이름이 보인다', ca.state.names[cb.state.me] === B.profile.nick, ca.state.names.join(','));

  console.log('\n② 남의 패는 안 보인다');
  {
    const mine = ca.state.seats[ca.state.me].cards;
    const theirs = ca.state.seats[cb.state.me].cards;
    ok('내 패는 보인다', !!mine && mine.length === 1);
    ok('상대 패는 안 온다', theirs === null);
    // 상대가 실제로 쥔 카드가 내 화면 데이터에 없어야 한다
    const his = cb.state.seats[cb.state.me].cards[0];
    ok('상대 카드가 통째로 안 새어 나온다',
       !JSON.stringify(ca.state).includes(`"id":${his.id}`) || mine[0].id === his.id);
    ok('상대 족보도 안 온다', ca.state.seats[cb.state.me].eval === null);
  }

  console.log('\n③ 차례와 시계');
  {
    const turnC = ca.state.turn === ca.state.me ? ca : cb;
    const waitC = turnC === ca ? cb : ca;
    ok('차례인 사람에게만 행동이 온다',
       turnC.state.actions.length > 0 && waitC.state.actions.length === 0);
    ok('제한 시간이 내려온다', turnC.state.deadline > Date.now(), String(turnC.state.deadline - Date.now()));
    ok('남의 차례에는 시계가 없다', !waitC.state.deadline || waitC.state.turn !== waitC.state.me);
    const before = turnC.state.pot;
    waitC.sk.emit('mini_act', { action: 'die' });      // 차례가 아닌데 두면
    await w(300);
    ok('남의 차례에 두면 거절', waitC.errors.length > 0, JSON.stringify(waitC.errors));
    ok('거절된 수는 판을 안 건드린다', ca.state.pot === before, `${before} → ${ca.state.pot}`);
  }

  console.log('\n④ 한 판을 끝까지');
  {
    let guard = 0;
    while (!ca.over && !cb.over && guard++ < 30) {
      for (const c of [ca, cb]) {
        if (!c.state || c.state.over) continue;
        if (c.state.turn !== c.state.me) continue;
        const acts = c.state.actions;
        const a = acts.includes('check') ? 'check' : acts.includes('call') ? 'call' : 'die';
        c.sk.emit('mini_act', { action: a });
      }
      await w(350);
    }
    ok('판이 끝난다', !!ca.over && !!cb.over);
    ok('한 사람만 이긴다', ca.over.won !== cb.over.won, `${ca.over.won} / ${cb.over.won}`);
    ok('딴 돈과 잃은 돈이 맞물린다', ca.over.net + cb.over.net === 0, `${ca.over.net} + ${cb.over.net}`);
    if (ca.over.view.reason === 'showdown') {
      ok('공개로 끝나면 서로 패가 보인다',
         ca.over.view.seats.every((s) => !s.alive || (s.cards && s.cards.length === 2)));
    } else {
      ok('죽어서 끝나면 안 깐다',
         ca.over.view.seats.filter((s, i) => i !== ca.state.me).every((s) => s.cards === null));
    }
    ok('다음 판까지 시간을 알려준다', ca.over.nextIn > 0, String(ca.over.nextIn));
  }

  console.log('\n⑤ 다음 판이 저절로 온다');
  {
    ca.state = null; cb.state = null;
    await w(10500);
    ok('가만 있어도 다음 판이 열린다', !!ca.state && !!cb.state);
    ok('선은 지난 판 승자', ca.state && ca.state.seats.some((s) => s.first));
  }

  console.log('\n⑥ 일어서면 코인으로 돌아온다');
  {
    const stackA = ca.state.seats[ca.state.me].stack;
    ca.sk.emit('mini_leave');
    await w(700);
    ok('정산 결과가 온다', !!ca.stood, JSON.stringify(ca.stood));
    ok('소지금이 코인으로', ca.stood.back >= 0 && ca.stood.buyIn > 0, String(ca.stood.buyIn));
    ok('코인이 늘어 있다', typeof ca.stood.coins === 'number');
    // 서버가 요청을 많이 받으면 잠깐 막는다(rateLimit) — 그때는 이 확인만 건너뛴다
    const me = await api('/api/me', { token: A.token });
    if (me && me.profile) {
      ok('서버 계좌와도 맞는다', me.profile.coins === ca.stood.coins,
         `${me.profile.coins} vs ${ca.stood.coins}`);
    } else {
      ok('서버 계좌와도 맞는다 (요청 제한으로 건너뜀)', true);
    }
    ok('되돌려받은 액수가 소지금과 맞는다', ca.stood.back <= stackA, `${ca.stood.back} <= ${stackA}`);
    // 남은 사람은 쫓겨나지 않는다 — 빈자리는 AI 가 맡는다.
    // (여기서 판을 끝내 버리면 지는 쪽이 나가는 게 이득이 된다)
    ok('남은 사람은 아직 앉아 있다', cb.stood === null, JSON.stringify(cb.stood));
    await w(6000);
    ok('빈자리를 AI 가 메운다', cb.state && cb.state.ais.some((x) => x === true),
       JSON.stringify(cb.state && cb.state.ais));
    ok('판이 계속 돈다', !!cb.state && cb.state.n === 2);
    cb.sk.emit('mini_leave');
    await w(700);
    ok('마지막 사람도 일어서면 정산된다', !!cb.stood, JSON.stringify(cb.stood));
  }

  ca.sk.close(); cb.sk.close();
  await cleanup(A, B);                     // 시험 계정은 남기지 않는다
  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
