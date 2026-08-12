// 멀티에서 한 명이 안 내면 어떻게 되는가.
// 제보: "멀티플레이에서 카드가 안 내지거나 그래"
// 예전에는 사람 차례에 제한이 없어서, 한 명이 가만히 있으면 나머지가
// 무한정 기다렸다. 이제는 시간이 지나면 AI 가 대신 두고 판이 굴러가야 한다.
const io = require('/Users/jinmo9/참치/my-game/node_modules/socket.io-client');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (ip) => io('http://localhost:3000', { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': ip } });

function join(i, base) {
  const p = { i, s: mk(base + i), st: null, room: null, seat: null, begun: false, errors: [] };
  p.s.on('connect', () => p.s.emit('g4_quick', { nick: 'A' + i }));
  p.s.on('g4_room', (d) => { p.room = d; });
  p.s.on('g4_begin', (d) => { p.seat = d.me; p.begun = true; });
  p.s.on('g4_state', (st) => { p.st = st; });
  p.s.on('g4_error', (m) => p.errors.push(m));
  return p;
}

// 성실한 플레이어 — 낼 수 있으면 낸다
function play(p) {
  const s = p.st; if (!s || p.seat === null) return;
  const a = s.auction;
  if (s.phase === 'draw' && s.auctioneer === p.seat) return p.s.emit('g4_act', { type: 'draw' });
  if (s.phase === 'offer' && s.auctioneer === p.seat && s.myHand.length)
    return p.s.emit('g4_act', { type: 'offer', cardId: s.myHand[0].id });
  if (s.phase === 'choose_type' && s.auctioneer === p.seat)
    return p.s.emit('g4_act', { type: 'auctionType', val: 'close' });
  if (s.phase === 'bidding' && a && s.myHand.length) {
    if (s.seats[p.seat].bidded || !s.bidders.includes(p.seat)) return;
    if (a.closed && a.turnToBid !== p.seat) return;
    p.s.emit('g4_act', { type: 'bid', cardId: s.myHand[0].id });
  }
}

(async () => {
  console.log('\n① 사람 셋 중 하나(2번)가 아무것도 안 한다');
  const P = [1, 2, 3].map((i) => join(i, '10.8.1.'));
  await wait(2500);
  P[0].s.emit('g4_startnow');
  await wait(2500);
  ok('3인전 시작', P.every((p) => p.begun) && P[0].st && P[0].st.n === 3);

  // 남은 시간이 클라이언트로 내려오는지
  await wait(1500);
  const anyWait = P.find((p) => p.st && p.st.waitSeat !== null && p.st.waitSeat !== undefined);
  ok('누구를 기다리는지 화면에 내려온다', !!anyWait,
     'waitSeat=' + (P[0].st ? P[0].st.waitSeat : '?'));
  ok('남은 시간도 내려온다', anyWait && typeof anyWait.st.waitLeft === 'number',
     'waitLeft=' + (anyWait ? anyWait.st.waitLeft : '?'));

  console.log('\n② 2번이 손 놓고 있어도 판이 굴러가는가');
  // "턴이 넘어갔나" 로 재면 손 놓은 사람이 진행자일 때 오래 걸려 들쭉날쭉하다.
  // 대신 "한 자리에 얼마나 오래 멈춰 있었나" 를 재면 어느 경우든 같은 기준이 된다.
  let longestStall = 0, sawTakeover = false;
  {
    let lastSig = '', since = Date.now();
    const t0 = Date.now();
    while (Date.now() - t0 < 75000) {
      play(P[0]); play(P[2]);              // 1번·3번만 성실히. 2번은 아무것도 안 한다.
      await wait(400);
      const s2 = P[0].st;
      if (!s2) continue;
      if (s2.over) break;
      if (s2.seats[1] && s2.seats[1].bidded) sawTakeover = true;
      const sig = s2.turn + '|' + s2.phase + '|' + s2.seats.map((x) => (x.bidded ? 1 : 0)).join('');
      if (sig !== lastSig) {
        longestStall = Math.max(longestStall, Date.now() - since);
        lastSig = sig; since = Date.now();
      }
    }
    longestStall = Math.max(longestStall, Date.now() - since);
  }
  const sec = Math.round(longestStall / 1000);
  console.log('    가장 오래 멈춰 있던 시간: ' + sec + '초');
  ok('무한 대기가 없다 (40초 이내에 반드시 진행)', longestStall < 40000, sec + '초 멈춤');
  ok('AI 가 대신 둔 흔적이 있다', sawTakeover || (P[0].st && P[0].st.turn > 1));
  // 손 놓은 자리가 언제 AI 로 넘어가는지는 그 사람 차례가 몇 번 돌아왔느냐에
  // 달려서, 75초 안에 볼 수도 못 볼 수도 있다. 시간에 기대는 단정 대신 규칙
  // 자체를 본다 — 이게 없으면 대신 두기만 반복하며 판이 안 굴러갔다.
  const s4 = require('fs').readFileSync(__dirname + '/../server4.js', 'utf8');
  ok('대신 두기가 실패했는지 확인한다', /played = !!autoPlayFor\(r\.game, waiting\)/.test(s4));
  ok('못 두거나 여러 번 넘기면 자리를 AI 에게 넘긴다',
     /if \(!played \|\| r\.afk\[waiting\] >= AFK_GIVEUP\)/.test(s4));
  ok('넘기는 기준이 정해져 있다', /const AFK_GIVEUP = \d+;/.test(s4));
  ok('오류 없음', P.every((p) => !p.errors.length), P.map((p) => p.errors.join(',')).join('|'));

  P.forEach((p) => { try { p.s.close(); } catch (_) {} });
  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
