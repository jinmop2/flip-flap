// 다인전 오픈 경매에서 "부를 차례인 사람" 이 끊기면 판이 서는가.
//
// 오픈은 돌아가며 부르므로 그 사람이 두기 전에는 아무도 못 둔다. 그런데 소켓이
// 끊긴 자리는 잠깐 동안 사람도 아니고 AI 도 아니다 — 되찾을 시간을 주려고
// 일부러 그렇게 뒀다(SEAT_GRACE). 그 사이에 서버의 진행 장치가 할 일을 못
// 찾으면, 남은 사람들은 아무 설명 없이 멈춘 판을 본다.
//
// 여기서 보는 것은 하나다: 그래도 판은 결국 굴러가는가.
const io = require('socket.io-client');
const { liveServer } = require('./live');
let URL;

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function join(i) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': '10.9.2.' + i } });
  const p = { i, s, st: null, seat: null, begun: false, errors: [], pushes: 0 };
  s.on('connect', () => s.emit('g4_quick', { nick: 'S' + i }));
  s.on('g4_begin', (d) => { p.seat = d.me; p.begun = true; });
  s.on('g4_state', (x) => { p.st = x; p.pushes++; });
  s.on('g4_over', (x) => { p.st = x; });
  s.on('g4_error', (m) => p.errors.push(m));
  return p;
}

// 경매를 몬다 — holdSeat 자리는 제 차례가 와도 두지 않는다
function drive(p, holdSeat) {
  const s = p.st;
  if (!s || p.seat === null || s.over) return;
  const a = s.auction;
  if (p.seat === holdSeat) return;
  if (s.phase === 'offer' && s.auctioneer === p.seat && s.myHand.length)
    return void p.s.emit('g4_act', { type: 'offer', cardId: s.myHand[0].id });
  if (s.phase === 'choose_type' && s.auctioneer === p.seat)
    return void p.s.emit('g4_act', { type: 'auctionType', val: 'open' });
  if (s.phase === 'open' && a && a.turnSeat === p.seat)
    return void p.s.emit('g4_act', a.price < 3 && s.seats[p.seat].chips > a.price ? { type: 'raise', to: a.price + 1 } : { type: 'pass' });
}

(async () => {
  URL = (await liveServer(39526)).url;
  const P = [1, 2, 3].map(join);
  await wait(2500);
  P[0].s.emit('g4_startnow');
  await wait(2500);
  ok('셋이 판을 시작한다', P.every((p) => p.begun) && P[0].st && P[0].st.n === 3);

  // ① 오픈 경매에서 사람이 부를 차례가 올 때까지 민다
  let victim = null;
  for (let k = 0; k < 300 && victim === null; k++) {
    const s = P[0].st;
    if (s && s.phase === 'open' && s.auction) {
      const t = s.auction.turnSeat;
      // 누가 한 번은 부른 뒤를 고른다 — 판이 중간에 서는 쪽이 실제로 겪는 모양이다
      if (t !== null && t !== undefined && s.auction.high !== null && !s.seats[t].isBot) victim = t;
    }
    if (victim === null) for (const p of P) drive(p, null);
    await wait(150);
  }
  ok('오픈 경매에서 부를 차례를 잡았다', victim !== null, String(victim));
  if (victim === null) { console.log(`\n결과: ${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0); }

  // ② 그 사람을 끊는다
  const who = P.find((p) => p.seat === victim);
  const others = P.filter((p) => p !== who);
  const sigOf = () => { const s = others[0].st; const a = (s && s.auction) || {}; return s ? [s.turn, s.phase, a.price, a.turnSeat, (a.out || []).length].join('|') : ''; };
  const before = sigOf();
  const pushesBefore = others.map((p) => p.pushes);
  who.s.close();

  // ③ 판이 다시 굴러가는가. 자리를 AI 에게 넘기는 데 SEAT_GRACE(20초)를
  //    주게 돼 있으니, 그보다 넉넉히 기다려 준다.
  let movedAt = null;
  const t0 = Date.now();
  for (let k = 0; k < 200 && movedAt === null; k++) {
    for (const p of others) drive(p, null);
    await wait(250);
    if (sigOf() !== before || (others[0].st && others[0].st.over)) movedAt = Date.now() - t0;
  }
  ok('멈춘 판이 다시 굴러간다', movedAt !== null, movedAt === null ? '50초를 기다려도 그대로' : '');
  if (movedAt !== null) ok('되살아나는 데 30초를 넘기지 않는다', movedAt < 30000, (movedAt / 1000).toFixed(1) + '초');
  // 멈춰 있는 동안에도 남은 사람에게 소식이 가야 한다 — 아무 말 없이 멈춘
  // 화면은 "카드가 안 내져요" 로 돌아온다
  ok('기다리는 동안에도 화면에 소식이 온다',
     others.some((p, i) => p.pushes > pushesBefore[i]),
     others.map((p, i) => p.pushes - pushesBefore[i]).join('/'));
  ok('g4_error 없음', others.every((p) => !p.errors.length), others.map((p) => p.errors.join(',')).join(' | '));

  // ④ 얼개 자체도 본다 — 이 모듈의 불변식이다
  {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'server4.js'), 'utf8');
    const wf = src.slice(src.indexOf('function waitFor('), src.indexOf('function step('));
    // 둘 사람이 자리에 없는 갈래에서 그냥 돌아가면 그 방의 시계가 아예 선다
    ok('둘 사람이 없어도 다음 박자를 남긴다', /return schedule\(roomId, T\.raise\);/.test(wf));
    ok('그때 서버가 그 사실을 적는다', /둘 사람이 자리에 없어 기다립니다/.test(wf));
    ok('오픈·출품·방식 고르기가 다 이 길로 간다', (src.match(/return waitFor\(roomId, /g) || []).length >= 3);
  }

  P.forEach((p) => { try { p.s.close(); } catch (_) {} });
  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
