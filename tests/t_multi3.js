// 멀티 3인전 — 클로즈 순차 공개가 사람 여럿일 때도 제대로 도는가.
// 순서제는 "내 차례가 와야 낼 수 있다" 라서, 서버가 순서를 잘못 잡으면
// 아무도 못 내고 판이 멈춘다. 그 지점을 집중해서 본다.
const io = require('/Users/jinmo9/참치/my-game/node_modules/socket.io-client');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (ip) => io('http://localhost:3000', { transports: ['websocket'], forceNew: true, extraHeaders: { 'X-Forwarded-For': ip } });

function join(i, base) {
  const p = { i, s: mk(base + i), st: null, seat: null, begun: false, errors: [], states: 0 };
  p.s.on('connect', () => p.s.emit('g4_quick', { nick: 'H' + i }));
  p.s.on('g4_begin', (d) => { p.seat = d.me; p.begun = true; });
  p.s.on('g4_room', (d) => { p.room = d; });
  p.s.on('g4_state', (s) => { p.st = s; p.states++; });
  p.s.on('g4_error', (m) => p.errors.push(m));
  return p;
}

// 사람 셋이 자동으로 플레이 — 낼 수 있으면 낸다
function autoplay(p) {
  const s = p.st;
  if (!s || p.seat === null) return false;
  const a = s.auction;
  if (s.phase === 'draw' && s.auctioneer === p.seat) { p.s.emit('g4_act', { type: 'draw' }); return true; }
  if (s.phase === 'offer' && s.auctioneer === p.seat && s.myHand.length) {
    p.s.emit('g4_act', { type: 'offer', cardId: s.myHand[0].id }); return true;
  }
  if (s.phase === 'choose_type' && s.auctioneer === p.seat) {
    p.s.emit('g4_act', { type: 'auctionType', val: 'close' });   // 순서제를 보려고 항상 클로즈
    return true;
  }
  if (s.phase === 'bidding' && a && s.myHand.length) {
    const mine = s.seats[p.seat];
    if (mine.bidded) return false;
    if (!s.bidders.includes(p.seat)) return false;
    // 클로즈면 내 차례일 때만
    if (a.closed && a.turnToBid !== p.seat) return false;
    p.s.emit('g4_act', { type: 'bid', cardId: s.myHand[0].id });
    return true;
  }
  return false;
}

(async () => {
  console.log('\n① 사람 셋이 모여 3인전을 시작한다');
  const P = [1, 2, 3].map((i) => join(i, '10.7.1.'));
  await wait(2500);
  // 시작 전에는 대기방 정보(g4_room)만 온다 — 게임 상태(g4_state)는 아직 없다
  ok('세 명 같은 방', P.every((p) => p.room) && new Set(P.map((p) => p.room.roomId)).size === 1);
  P[0].s.emit('g4_startnow');
  await wait(2500);
  ok('시작됨', P.every((p) => p.begun));
  ok('3인전 · 전원 사람', P[0].st && P[0].st.n === 3 && P[0].st.seats.every((x) => !x.isBot));

  console.log('\n② 클로즈 순차 공개 — 순서·공개 범위가 맞는가');
  let sawClosed = false, seqOk = true, leakOk = true, stalls = 0;
  let lastSig = '', same = 0;
  for (let step = 0; step < 400; step++) {
    const s = P[0].st;
    if (s && s.over) break;
    const sig = s ? (s.turn + '|' + s.phase + '|' + JSON.stringify(s.auction && s.auction.bids ? Object.keys(s.auction.bids) : [])) : '';
    if (sig === lastSig) same++; else { same = 0; lastSig = sig; }
    if (same > 60) { stalls++; break; }

    if (s && s.phase === 'bidding' && s.auction && s.auction.closed) {
      sawClosed = true;
      const a = s.auction;
      // 순서: seq 에서 아직 안 낸 첫 사람이 turnToBid 여야 한다
      if (a.seq) {
        const expect = a.seq.find((x) => !s.seats[x].bidded);
        if ((expect === undefined ? null : expect) !== a.turnToBid) {
          seqOk = false;
          console.log('    순서 어긋남: 기대 ' + expect + ' / 실제 ' + a.turnToBid);
        }
      }
      // 정보 누출: 아직 안 낸 사람의 카드가 보이면 안 된다
      for (const p of P) {
        const st = p.st; if (!st || !st.auction) continue;
        for (const k of Object.keys(st.auction.bids || {})) {
          if (!st.seats[+k].bidded) { leakOk = false; console.log('    안 낸 사람 카드가 보임: seat' + k); }
        }
      }
    }
    for (const p of P) autoplay(p);
    await wait(150);
  }
  ok('클로즈 경매가 실제로 나왔다', sawClosed);
  ok('순서가 항상 맞다', seqOk);
  ok('안 낸 사람 카드는 안 보인다', leakOk);
  ok('멈추지 않았다', stalls === 0);
  ok('g4_error 없음', P.every((p) => !p.errors.length), P.map((p) => p.errors.join(',')).join(' | '));

  console.log('\n③ 순서 중간에 한 명이 나가도 판이 이어지는가');
  {
    const s = P[0].st;
    ok('게임이 끝났거나 진행 중', !!s);
    P[1].s.close();                       // 두 번째 사람 이탈
    await wait(2500);
    let moved = false;
    const before = P[0].st ? P[0].st.turn + P[0].st.phase : '';
    for (let i = 0; i < 60; i++) {
      for (const p of [P[0], P[2]]) autoplay(p);
      await wait(200);
      const now = P[0].st ? P[0].st.turn + P[0].st.phase : '';
      if (now !== before) { moved = true; break; }
    }
    ok('한 명이 나가도 진행된다', moved || (P[0].st && P[0].st.over));
  }

  P.forEach((p) => { try { p.s.close(); } catch (_) {} });
  console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
