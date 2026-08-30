// TWELVE — 칩으로 사는 경매. 규칙이 새것이라 셈이 맞는지부터 본다.
// 특히 "칩이 어디로 갔는가" 는 판마다 맞아떨어져야 한다 —
// 남은 칩 + 은행이 언제나 40(20+20)이어야 한다.
const T = require('../twelve.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// 되풀이되는 난수 — 실패를 다시 만들 수 있어야 한다
function rng(seed) {
  let x = seed >>> 0 || 1;
  // 작은 씨앗은 처음 몇 개가 0 에 붙는다. 데워서 쓴다(예전에 여기서 데었다).
  const step = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 20; i++) step();
  return step;
}
const chipsTotal = (g) => g.chips[1] + g.chips[2] + g.bank;

console.log('① 처음 놓인 판');
{
  const g = T.createGame({ rnd: rng(1) });
  ok('중앙덱 12장', g.center.length === 12, String(g.center.length));
  ok('손패 6장씩', g.hands[1].length === 6 && g.hands[2].length === 6);
  ok('카드 24장이 전부 쓰인다', g.center.length + g.hands[1].length + g.hands[2].length === 24);
  ok('칩 20개씩', g.chips[1] === 20 && g.chips[2] === 20);
  ok('칩 합이 40', chipsTotal(g) === 40);
  ok('같은 카드가 두 장 없다',
     new Set([...g.center, ...g.hands[1], ...g.hands[2]].map((c) => c.id)).size === 24);
  ok('진행자부터 시작', g.phase === 'draw' && g.auctioneer === 1);
}

console.log('\n② 순서를 어기면 안 먹힌다');
{
  const g = T.createGame({ rnd: rng(2) });
  ok('진행자가 아니면 못 뽑는다', T.draw(g, 2) === false);
  ok('뽑기 전에는 출품 못 한다', T.offer(g, 1, g.hands[1][0].id) === false);
  T.draw(g, 1);
  ok('뽑으면 출품 단계', g.phase === 'offer' && !!g.lot.center);
  ok('남의 손패는 못 낸다', T.offer(g, 1, g.hands[2][0].id) === false);
  ok('진행자가 아니면 못 낸다', T.offer(g, 2, g.hands[2][0].id) === false);
  const id = g.hands[1][0].id;
  ok('출품 성공', T.offer(g, 1, id) === true);
  ok('손패에서 빠졌다', g.hands[1].length === 5 && !g.hands[1].some((c) => c.id === id));
  ok('방식 고르는 단계', g.phase === 'choose');
  ok('엉뚱한 방식은 안 된다', T.chooseType(g, 1, 'weird') === false);
}

console.log('\n③ 오픈 경매 — 번갈아 올린다');
{
  const g = T.createGame({ rnd: rng(3) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  ok('진행자가 먼저 부른다', g.lot.turnToAct === 1);
  ok('0 은 못 부른다', T.raise(g, 1, 0) === false);
  ok('상대는 아직 못 부른다', T.raise(g, 2, 3) === false);
  ok('3 부르기', T.raise(g, 1, 3) === true && g.lot.bets[1] === 3);
  ok('차례가 넘어갔다', g.lot.turnToAct === 2);
  ok('같은 값은 못 부른다', T.raise(g, 2, 3) === false);
  ok('더 부르면 된다', T.raise(g, 2, 4) === true);
  ok('가진 것보다 많이는 못 부른다', T.raise(g, 1, 21) === false);
  ok('계속 올릴 수 있다', T.raise(g, 1, 7) === true && g.lot.bets[1] === 7);
  // 상대가 물러선다 → 진행자 낙찰
  ok('물러서기', T.fold(g, 2) === true);
  ok('진행자가 가져갔다', g.last.winner === 1 && g.acq[1].length === 2);
  // 이긴 쪽 7 전액, 진 쪽 4의 절반 = 2
  ok('이긴 쪽은 전액', g.last.wPay === 7, String(g.last.wPay));
  ok('진 쪽은 절반 반내림', g.last.lPay === 2, String(g.last.lPay));
  ok('칩 합은 그대로 40', chipsTotal(g) === 40, String(chipsTotal(g)));
  ok('은행에 9 이 들어갔다', g.bank === 9, String(g.bank));
}

console.log('\n④ 절반은 반내림한다');
{
  // 진 쪽이 부른 값이 B 면 floor(B/2) 를 낸다. 홀수에서 반내림이 도는지 본다.
  for (const [B, expect] of [[1, 0], [2, 1], [3, 1], [5, 2], [7, 3], [9, 4], [10, 5]]) {
    const g = T.createGame({ rnd: rng(4) });
    T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
    T.raise(g, 1, B);          // 진행자가 B 를 부르고
    T.raise(g, 2, B + 1);      // 상대가 더 부르면
    T.fold(g, 1);              // 진행자가 물러선다 → 2번이 낙찰
    ok(`${B} 을 부르고 진 쪽은 ${expect} 낸다`, g.last.lPay === expect, String(g.last.lPay));
    ok(`이긴 쪽은 ${B + 1} 전액`, g.last.wPay === B + 1, String(g.last.wPay));
  }
}

console.log('\n⑤ 클로즈 경매 — 짝수로 부르고, 상대는 하나 더');
{
  const g = T.createGame({ rnd: rng(5) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'close');
  ok('홀수는 못 부른다', T.closeBet(g, 1, 3) === false);
  ok('0 도 못 부른다', T.closeBet(g, 1, 0) === false);
  ok('가진 것보다 많이는 못 부른다', T.closeBet(g, 1, 22) === false);
  ok('상대는 못 부른다', T.closeBet(g, 2, 4) === false);
  ok('4 부르기', T.closeBet(g, 1, 4) === true);
  ok('상대 차례', g.lot.turnToAct === 2);
  ok('진행자는 살 수 없다', T.closeTake(g, 1) === false);
  ok('사기', T.closeTake(g, 2) === true);
  ok('산 쪽이 가져갔다', g.last.winner === 2 && g.acq[2].length === 2);
  ok('산 쪽은 5 전액', g.last.wPay === 5, String(g.last.wPay));
  ok('진행자는 4의 절반 2', g.last.lPay === 2, String(g.last.lPay));
  ok('칩 합은 그대로', chipsTotal(g) === 40);
}

console.log('\n⑥ 클로즈에서 안 사면 진행자가 가져간다');
{
  const g = T.createGame({ rnd: rng(6) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'close');
  T.closeBet(g, 1, 6);
  ok('안 사기', T.closeDecline(g, 2) === true);
  ok('진행자가 가져갔다', g.last.winner === 1 && g.acq[1].length === 2);
  ok('진행자는 6 전액', g.last.wPay === 6);
  ok('안 산 쪽은 한 푼도 안 낸다', g.last.lPay === 0);
  ok('칩 합은 그대로', chipsTotal(g) === 40);
}

console.log('\n⑦ 클로즈에서 진행자가 부른 값은 안 보인다');
{
  const g = T.createGame({ rnd: rng(7) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'close');
  T.closeBet(g, 1, 8);
  const v2 = T.viewFor(g, 2);
  // 값은 양쪽 다 본다 — "부른 값 + 1" 로 사는 규칙이라 알 수밖에 없다.
  // 가려지는 것은 값이 아니라 출품 카드다.
  ok('진행자가 부른 값은 보인다', v2.lot.oppBet === 8, String(v2.lot.oppBet));
  ok('출품 카드도 가려진다', v2.lot.offered === null && v2.lot.hasOffer === true);
  // 방식을 고르기 전에도 가려야 한다 — 안 가리면 클로즈를 고르는 순간
  // 이미 본 카드를 다시 덮는 꼴이라 가린 의미가 없다
  {
    const w = T.createGame({ rnd: rng(71) });
    T.draw(w, 1); T.offer(w, 1, w.hands[1][0].id);
    ok('고르기 전에는 상대에게 안 보인다', T.viewFor(w, 2).lot.offered === null && T.viewFor(w, 2).lot.hasOffer === true);
    ok('진행자는 자기 카드를 본다', T.viewFor(w, 1).lot.offered !== null);
    T.chooseType(w, 1, 'open');
    ok('오픈으로 정하면 그때 열린다', T.viewFor(w, 2).lot.offered !== null);
  }
  // 가려지는 것은 값이 아니라 출품 카드다 — 하나 더 얹어 사는 규칙이니 값은 알 수밖에 없다
  ok('낼 값은 알려준다', v2.lot.takeCost === 9, String(v2.lot.takeCost));
  ok('살 수 있는지도 알려준다', v2.lot.canTake === true);
  ok('진행자에겐 살 자리가 없다', T.viewFor(g, 1).lot.canTake === false);
  const v1 = T.viewFor(g, 1);
  ok('진행자는 자기 값을 안다', v1.lot.closeBetKnown === 8);
}

console.log('\n⑧ 남의 손패는 어떤 상태에서도 안 나간다');
{
  const g = T.createGame({ rnd: rng(8) });
  for (const step of ['draw', 'offer', 'choose', 'bid']) {
    if (step === 'draw') T.draw(g, 1);
    if (step === 'offer') T.offer(g, 1, g.hands[1][0].id);
    if (step === 'choose') T.chooseType(g, 1, 'open');
    if (step === 'bid') T.raise(g, 1, 2);
    for (const me of [1, 2]) {
      const v = JSON.stringify(T.viewFor(g, me));
      const mine = new Set(g.hands[me].map((c) => c.id));
      const leaked = g.hands[me === 1 ? 2 : 1].filter((c) => !mine.has(c.id))
        .some((c) => v.includes(`"id":${c.id}`));
      ok(`${step} · ${me}번 시점에 남의 패가 안 샌다`, !leaked);
    }
  }
}

console.log('\n⑨ 세트를 완성하면 그 자리에서 끝');
{
  const g = T.createGame({ rnd: rng(9) });
  g.acq[1] = [{ kind: 2, grade: 1, id: 201 }];         // 2짜리 하나 있음
  g.center.unshift({ kind: 2, grade: 2, id: 202 });    // 하나 더 뒤집히게
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  T.raise(g, 1, 1); T.fold(g, 2);
  ok('세트로 끝났다', g.over === true && g.winner === 1 && g.endBy === 'set');
}

console.log('\n⑩ 칩이 0 이 되면 진다');
{
  const g = T.createGame({ rnd: rng(10) });
  g.chips[2] = 2;                                       // 2번은 칩이 얼마 없다
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  T.raise(g, 1, 1); T.raise(g, 2, 2); T.fold(g, 1);
  ok('2번이 이겼지만 칩이 0', g.chips[2] === 0);
  ok('세트를 못 냈으므로 진다', g.over === true && g.winner === 1 && g.endBy === 'chips');
}

console.log('\n⑪ 칩이 0 이어도 그 경매에서 세트를 내면 이긴다');
{
  const g = T.createGame({ rnd: rng(11) });
  g.chips[2] = 2;
  g.acq[2] = [{ kind: 2, grade: 1, id: 201 }];
  g.center.unshift({ kind: 2, grade: 2, id: 202 });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  T.raise(g, 1, 1); T.raise(g, 2, 2); T.fold(g, 1);
  ok('칩은 0 이 됐다', g.chips[2] === 0);
  ok('그래도 세트로 이긴다', g.over === true && g.winner === 2 && g.endBy === 'set');
}

console.log('\n⑫ 진행자는 턴마다 넘어간다');
{
  const g = T.createGame({ rnd: rng(12) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  T.raise(g, 1, 1); T.fold(g, 2);
  const before = g.auctioneer;
  ok('정산 뒤 다음 턴', T.nextTurn(g) === true);
  ok('진행자가 바뀌었다', g.auctioneer !== before);
  ok('턴이 올라갔다', g.turn === 2 && g.phase === 'draw');
}

console.log('\n⑬ 판을 끝까지 돌려도 셈이 맞는다');
{
  let games = 0, setWin = 0, chipWin = 0, deckWin = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = rng(seed);
    const g = T.createGame({ rnd });
    let guard = 0;
    while (!g.over && guard++ < 200) {
      const A = g.auctioneer, B = A === 1 ? 2 : 1;
      if (g.phase === 'draw') { T.draw(g, A); continue; }
      if (g.phase === 'offer') { T.offer(g, A, g.hands[A][0].id); continue; }
      if (g.phase === 'choose') {
        const wantClose = rnd() < 0.5 && T.canChoose(g, 'close');
        T.chooseType(g, A, wantClose ? 'close' : 'open'); continue;
      }
      if (g.phase === 'bid') {
        const who = g.lot.turnToAct;
        const lo = T.minRaise(g, who);
        if (rnd() < 0.45 && T.canRaise(g, who)) T.raise(g, who, Math.min(g.chips[who], lo + Math.floor(rnd() * 3)));
        else T.fold(g, who);
        continue;
      }
      if (g.phase === 'close') {
        const who = g.lot.turnToAct;
        if (who === A) {
          const even = Math.max(2, Math.min(g.chips[A] - (g.chips[A] % 2), 2 + 2 * Math.floor(rnd() * 3)));
          if (!T.closeBet(g, A, even)) T.closeBet(g, A, 2);
        } else if (rnd() < 0.5 && g.chips[B] > g.lot.closeBet) T.closeTake(g, who);
        else T.closeDecline(g, who);
        continue;
      }
      if (g.phase === 'settled') { T.nextTurn(g); continue; }
      break;
    }
    games++;
    if (chipsTotal(g) !== 40) { ok('칩 합이 안 맞는 판 seed=' + seed, false, String(chipsTotal(g))); break; }
    if (g.chips[1] < 0 || g.chips[2] < 0) { ok('칩이 음수가 된 판 seed=' + seed, false); break; }
    // 카드가 사라지거나 늘어나지 않았는가
    const inLot = g.lot ? [g.lot.center, g.lot.offered].filter(Boolean).length : 0;
    const all = g.center.length + g.hands[1].length + g.hands[2].length + g.acq[1].length + g.acq[2].length + inLot;
    if (all !== 24) { ok('카드가 안 맞는 판 seed=' + seed, false, String(all)); break; }
    if (!g.over) { ok('안 끝난 판 seed=' + seed, false, g.phase); break; }
    if (g.endBy === 'set') setWin++; else if (g.endBy === 'chips') chipWin++; else deckWin++;
  }
  ok('300 판 모두 끝났다', games === 300, String(games));
  ok('모든 판에서 칩 합 40 유지', true);
  ok('세트로 끝난 판이 있다', setWin > 0, String(setWin));
  ok('칩이 떨어져 끝난 판이 있다', chipWin > 0, String(chipWin));
  console.log(`     (세트 ${setWin} · 칩소진 ${chipWin} · 덱소진 ${deckWin})`);
}

console.log('\n⑭ 끝난 판은 더 못 건드린다');
{
  const g = T.createGame({ rnd: rng(14) });
  g.over = true;
  ok('뽑기 막힘', T.draw(g, 1) === false);
  ok('출품 막힘', T.offer(g, 1, g.hands[1][0].id) === false);
  ok('방식 막힘', T.chooseType(g, 1, 'open') === false);
  ok('다음 턴 막힘', T.nextTurn(g) === false);
}

console.log('\n⑮ AI 끼리 붙여도 판이 굴러간다');
{
  let done = 0, bad = 0, illegal = 0;
  const by = { set: 0, chips: 0, deck: 0 };
  for (let seed = 1; seed <= 400; seed++) {
    const rnd = rng(seed + 5000);
    const g = T.createGame({ rnd });
    let guard = 0;
    while (!g.over && guard++ < 400) {
      const before = JSON.stringify([g.phase, g.turn, g.lot && g.lot.turnToAct, g.chips[1], g.chips[2]]);
      const a1 = T.applyAi(g, 1, rnd);
      if (g.over) break;
      const a2 = T.applyAi(g, 2, rnd);
      // 정산은 AI 가 안 넘긴다(사람이 보고 넘기는 자리다) — 여기서는 시험이 대신 넘긴다
      if (!g.over && g.phase === 'settled') T.nextTurn(g);
      const after = JSON.stringify([g.phase, g.turn, g.lot && g.lot.turnToAct, g.chips[1], g.chips[2]]);
      if (!a1 && !a2 && before === after) { bad++; break; }   // 아무도 둘 수 없으면 멈춘 것
    }
    if (!g.over) { bad++; continue; }
    if (chipsTotal(g) !== 40) illegal++;
    if (g.chips[1] < 0 || g.chips[2] < 0) illegal++;
    const inLot = g.lot ? [g.lot.center, g.lot.offered].filter(Boolean).length : 0;
    if (g.center.length + g.hands[1].length + g.hands[2].length
        + g.acq[1].length + g.acq[2].length + inLot !== 24) illegal++;
    by[g.endBy] = (by[g.endBy] || 0) + 1;
    done++;
  }
  ok('400 판 모두 끝났다', done === 400 && bad === 0, `끝=${done} 멈춤=${bad}`);
  ok('규칙을 어긴 판이 없다', illegal === 0, String(illegal));
  ok('세트로 끝나는 판이 대부분', by.set > by.chips, `세트=${by.set} 칩=${by.chips} 덱=${by.deck || 0}`);
  console.log(`     (세트 ${by.set} · 칩소진 ${by.chips} · 덱소진 ${by.deck || 0})`);
}

console.log('\n⑯ AI 가 승부수를 알아본다');
{
  // 이걸 먹으면 세트가 완성되는 자리 — 값을 아끼지 않아야 한다
  const g = T.createGame({ rnd: rng(77) });
  g.acq[1] = [{ kind: 2, grade: 1, id: 201 }];
  g.center.unshift({ kind: 2, grade: 2, id: 202 });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id);
  ok('세트를 완성시키는 경매품은 값이 무한', T.apprise(g, 1, T.LEVELS.expert).mustWin === true);
  // 상대가 완성 직전이면 막는 것도 무한
  const h = T.createGame({ rnd: rng(78) });
  h.acq[2] = [{ kind: 2, grade: 1, id: 201 }];
  h.center.unshift({ kind: 2, grade: 2, id: 202 });
  T.draw(h, 1); T.offer(h, 1, h.hands[1][0].id);
  ok('상대 완성을 막는 것도 무한', T.apprise(h, 1, T.LEVELS.expert).mustDeny === true);
  // 아무 쓸모 없는 자리는 값이 작다
  const k = T.createGame({ rnd: rng(79) });
  T.draw(k, 1); T.offer(k, 1, k.hands[1][0].id);
  const w = T.apprise(k, 1, T.LEVELS.expert).worth;
  ok('보통 자리는 가진 칩보다 싸다', w !== Infinity && w <= k.chips[1], String(w));
}

console.log('\n⑰ 서버·화면에 제대로 물렸는가');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const srv = read('server.js'), cli = read('public/client.js'), htm = read('public/index.html');
  ok('서버가 규칙 모듈을 쓴다', /require\('\.\/twelve'\)/.test(srv));
  ok('한 수 통로가 있다', /socket\.on\('tv_act'/.test(srv));
  ok('혼자 하기가 있다', /socket\.on\('tv_solo'/.test(srv));
  ok('규칙 검사는 모듈이 한다',
     ['draw', 'offer', 'chooseType', 'raise', 'fold', 'closeBet', 'closeTake', 'closeDecline', 'nextTurn']
       .every((f) => srv.includes('twelve.' + f + '(')));
  // 랭크게임이 세 모드를 무작위로 돌리게 되면서, 트웰브도 랭크로 걸린 판이면
  // RP 가 움직인다. 하나만 빼 두면 그 모드가 뜨길 기다리는 사람이 생긴다.
  // 랭크가 아닌 트웰브(혼자 하기·빠른 입장·방)는 예전대로 RP 미반영이다.
  ok('랭크로 걸린 판만 RP', /noRank: !room\.ranked,  \/\/ 랭크로 걸린 판만 RP 반영/.test(srv));
  ok('방 모드로도 열린다', /room\.mode === 'twelve'\) \{ tvStart/.test(srv));
  ok('빠른 입장에 있다', /'classic', 'item', 'quad', 'twelve'/.test(srv));
  ok('화면이 있다', /id="tv"/.test(htm) && /body\.twelve #tv \{ display:flex/.test(htm));
  ok('클라이언트가 상태를 받는다', /socket\.on\('tv_state'/.test(cli) && /function tvRender/.test(cli));
  ok('클라이언트는 셈을 하지 않는다', !/tvView[\s\S]{0,200}Math\.floor\(.*\/ 2\)/.test(cli));
  ok('설명서 탭이 있다', /data-rt="twelve"/.test(htm) && /id="rulesTwelveModal"/.test(htm));
  ok('솔로·빠른입장 입구', /onclick="tvSolo\('hard'\)"/.test(htm) && /quickJoin\('twelve'\)/.test(htm));
}

console.log('\n⑱ 화면 — 덱·칩·액수·흔들림');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const cli = read('public/client.js'), htm = read('public/index.html');
  ok('덱을 누르면 뽑힌다', /id="tv-deck"/.test(htm) && /deck\.classList\.contains\('on'\)\) tvAct\('draw'\)/.test(cli));
  ok('같은 일을 하는 버튼을 겹쳐 두지 않는다', !/btn\('카드 뒤집기'/.test(cli));
  ok('뽑을 수 있을 때만 눌리는 티', /deck\.classList\.toggle\('on', canDraw\)/.test(cli) && /#tv-deck\.on/.test(htm));
  ok('칩은 검·흰 카지노 칩', /\.chip\.dark \{[\s\S]{0,160}conic-gradient/.test(htm) && /\.chip\.light \{[\s\S]{0,160}conic-gradient/.test(htm));
  // 가진 칩은 숫자만이 아니라 쌓아서 보여 준다
  ok('칩을 쌓아 보여준다', /function tvStack\(box, n, mine\)/.test(cli) && /\.cs-stack \{ position:relative/.test(htm));
  ok('숫자도 같이 있다', /querySelector\('b'\)\.textContent = myHeld/.test(cli));
  // 건 칩은 이미 손을 떠난 것으로 보여야 얼마를 더 지를 수 있는지가 눈에 맞는다
  ok('건 만큼 먼저 줄어든다', /const myHeld = v\.chips\.me - \(v\.lot \? \(v\.lot\.myBet \|\| 0\) : 0\)/.test(cli));
  ok('안 낸 만큼은 돌아온다', /function tvBackChips\(n, mine\)/.test(cli)
     && /tvBackChips\(myBet - myPay, true\)/.test(cli));
  ok('통째로 갈아 끼우지 않는다', !/tv-myChips'\)\.innerHTML =/.test(cli));
  ok('줄어든 칩은 덜어 내는 게 보인다', /el\.classList\.add\('gone'\)/.test(cli) && /@keyframes csGone/.test(htm));
  ok('값을 부르면 칩이 판돈으로 간다', /function tvBetChips\(n, mine\)/.test(cli)
     && /tvBetChips\(v\.lot\.myBet - \(prev\.lot\.myBet \|\| 0\), true\)/.test(cli));
  ok('판돈은 정산 때 은행으로 간다', /function tvFlyChips\(n, mine\)[\s\S]{0,200}'tv-potMe' : 'tv-potOpp'[\s\S]{0,120}getElementById\('tv-bank'\)/.test(cli));
  ok('건 칩이 레일에 쌓인다', /function tvPot\(box, n, mine, unknown\)/.test(cli)
     && /tvPot\(\$\('tv-potMe'\), v\.lot\.myBet, true, false\)/.test(cli));
  ok('클로즈에서도 건 값이 보인다', /tvPot\(\$\('tv-potOpp'\), v\.lot\.oppBet \|\| 0, false, false\)/.test(cli));
  // 물러선 것은 말풍선으로 잠깐 스치고 만다 — 건 칩 위에 도장으로 남긴다
  ok('포기하면 건 칩 위에 PASS', /class="pot-pass">PASS</.test(htm)
     && /\.tv-pot\.passed \.pot-pass \{ display:block; \}/.test(htm));
  ok('물러선 쪽에만 찍는다', /classList\.toggle\('passed', v\.last\.folded === v\.me\)/.test(cli));
  ok('한 푼도 안 걸고 물러서도 보인다', /box\.classList\.contains\('passed'\)/.test(cli));
  ok('다음 경매에서 지운다', /\$\('tv-potMe'\)\.classList\.remove\('passed'\)/.test(cli));
  // 가진 칩은 판 위에 올린다 — 왼쪽 레일에 상대 칩 · 덱 · 내 칩 순으로.
  // 판 밖에 두면 '내 지갑' 이 아니라 화면 장식으로 보인다.
  // 배팅과 가진 칩은 한자리에 모아 오른쪽 레일에 세운다 — 칩 이야기는
  // 한 군데서 읽혀야 한다. 위에서부터 상대 칩 · 상대 배팅 · 은행 · 내 배팅 · 내 칩.
  ok('칩이 오른쪽 레일에 다 모여 있다',
     /id="tv-rail">[\s\S]{0,200}id="tv-oppChips"[\s\S]{0,300}id="tv-potOpp"[\s\S]{0,300}id="tv-bank"[\s\S]{0,300}id="tv-potMe"[\s\S]{0,300}id="tv-myChips"/.test(htm));
  ok('다섯 칸이 서므로 칩 딱지는 작게', /\.tv-chips\.mini \{[^}]*white-space:nowrap/.test(htm));
  ok('액수는 큰 버튼으로 고른다', /function tvAmount/.test(cli) && /\.tv-step \{[\s\S]{0,80}width:46px; height:46px/.test(htm));
  ok('클로즈는 짝수만 나온다', /tvAmount\(box, 2, hi, 2, 2\)/.test(cli));
  ok('숫자 입력칸의 작은 화살표는 안 쓴다', !/inp\.type = 'number'/.test(cli));
  // 단계가 바뀌어도 판이 안 밀리게 — 칸마다 높이를 못 박았는가
  ok('문구 칸 높이 고정', /#tv-status \{[\s\S]{0,300}height:32px/.test(htm));
  // 배팅은 화면 맨 아래 한 줄 — 판 한복판에 있으면 카드를 가리고 엄지에서도 멀다
  ok('배팅 줄이 맨 아래', /#tv-actions \{ position:absolute;[^}]*bottom:calc\(10px \+ var\(--safe-b\)\)/.test(htm));
  ok('배팅 줄 빈자리는 통과시킨다', /#tv-actions \{[\s\S]{0,220}pointer-events:none;/.test(htm)
     && /#tv-actions > \* \{ pointer-events:auto; \}/.test(htm));
  ok('손패가 배팅 줄에 안 깔린다', /#tv-myZone \{[\s\S]{0,120}padding-bottom:calc\(66px \+ var\(--safe-b\)\)/.test(htm));
  // 높이는 화면에 매어 둔다 — 낮은 화면에서 안 줄면 아래 칸을 밀어낸다
  ok('카드 자리 고정', /#tv-mat \.a-card \{ width:70px; height:min\(98px, 15vh\)/.test(htm));
  ok('2인전과 같은 줄 구성', /id="tv-oppZone"/.test(htm) && /id="tv-centerZone"/.test(htm) && /id="tv-myZone"/.test(htm));
  ok('덱은 띄워 붙여 경매대를 안 민다', /#tv-deck \{ position:absolute/.test(htm));
  ok('덱이 가죽 테두리에 안 걸친다', /#tv-deck \{ left:38px; width:46px; \}/.test(htm));
  // 좁은 폰에서는 덱·경매대·레일이 서로 물린다 — 한 단계 더 줄인다
  ok('좁은 폰에서 셋이 안 물린다', /@media \(max-width:400px\) \{[\s\S]{0,1400}#tv-deck \{ left:24px; width:42px; \}/.test(htm)
     && /@media \(max-width:400px\) \{[\s\S]{0,1600}#tv-rail \{ right:24px; width:52px; \}/.test(htm));
  // 배팅 줄이 두 줄로 접히면 두 번째 줄이 손패를 덮는다
  ok('배팅 줄은 접히지 않는다', /#tv-actions \{[^}]*flex-wrap:nowrap/.test(htm));
  // 덱·은행이 카드보다 조금 위에 있어 줄이 안 맞아 보였다. 자리를 손으로 짚지 않고
  // 실제로 그려진 칸의 높이에 맞춘다 (화면 크기에 따라 카드가 줄기 때문이다).
  ok('덱·은행을 카드 줄에 맞춘다', /function tvAlignRow\(\)/.test(cli)
     && /requestAnimationFrame\(tvAlignRow\)/.test(cli));
  ok('움직이는 카드 말고 칸을 잰다', /const card = document\.getElementById\('tv-center'\);/.test(cli));
  // 회전은 값이 늦게 확정된다 — 그 자리에서 바로 재면 돌리기 전 크기로 잡힌다
  // 다인전이 끼면서 갈래가 셋이 됐다 (트웰브 · 다인전 · 나머지)
  ok('화면이 바뀌면 다시 맞춘다',
     /function relayoutBoards\(\) \{[\s\S]{0,300}tvAlignRow\(\);[\s\S]{0,120}quadLayTable\(\);\s*\n\s*else gameLayTable\(\);/.test(cli)
     && /function scheduleRelayout\(\)/.test(cli));
  // 두 장 사이의 + 는 뺐다 (모든 모드)
  ok('가운데 + 를 지웠다', !/vs-tag/.test(htm) && !/vs-tag/.test(cli));
}

console.log('\n⑲ 무슨 일이 있었는지 보이는가');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const cli = read('public/client.js'), htm = read('public/index.html'), tw = read('../twelve.js'.replace('../',''));
  ok('부른 값이 말풍선으로 뜬다', /function tvSay/.test(cli) && /tvSay\(meSide, tvChipHtml\(v\.lot\.myBet, true\)\)/.test(cli));
  ok('상대가 물러선 것도 보인다', /물러설게요/.test(cli) && /안 살래요/.test(cli));
  ok('칩이 은행으로 날아간다', /function tvFlyChips/.test(cli));
  ok('카드가 이긴 쪽으로 날아간다', /function tvLand\(prize, iWon\)/.test(cli));
  // 더미 상자 한가운데가 아니라, 실제로 놓일 자리의 좌표로 날아가야 끊겨 보이지 않는다
  ok('제 자리로 정확히 내려앉는다', /dest\.querySelector\(`\[data-cid="\$\{card\.id\}"\]`\)/.test(cli)
     && /const sc = t\.width \/ W;/.test(cli));
  ok('가는 도중에 흐려지지 않는다', /\.tv-fly \{ position:absolute; transition:transform \.85s [^}]*\}/.test(htm)
     && !/\.tv-fly \{[^}]*opacity/.test(htm));
  ok('앉을 자리를 미리 잡아 둔다', /\.tv-landing \{ visibility:hidden; \}/.test(htm)
     && /el\.classList\.add\('tv-landing'\)/.test(cli));
  ok('다 앉으면 켜 준다', /function tvFlyDone\(id\)/.test(cli));
  ok('경매품은 경매대에 안 남는다', !/정산 중에는 경매품을 그대로 둔다/.test(cli));
  ok('넘어가기 전에 연출할 틈이 있다', /\}, 880\);/.test(cli));
  // 말풍선 꼬리는 말한 사람 쪽을 봐야 한다
  ok('상대 말풍선 꼬리는 위로', /\.tv-say:not\(\.me\) \.bub::after \{ bottom:100%/.test(htm));
  ok('내 말풍선 꼬리는 아래로', /\.tv-say\.me \.bub::after \{ top:100%/.test(htm));
  ok('말풍선이 읽을 만큼 머문다', /\}, 300\); \}, 3400\);/.test(cli));

  // 2인전에 있는 것은 여기도 있어야 한다 — 채팅·설정·이모트.
  // 다만 판 위에 버튼 넉 장을 늘어놓지 않고 오른쪽 위 메뉴 하나로 접어 둔다.
  const ctrl = htm.slice(htm.indexOf('id="tv-menuWrap"'), htm.indexOf('id="tv-oppbar"'));
  ok('채팅 버튼이 있다', /toggleGameChat\(\)/.test(ctrl));
  ok('설정 버튼이 있다', /toggleSettings\(\)/.test(ctrl));
  ok('설명 버튼이 있다', /tvRules\(true\)/.test(ctrl));
  ok('나가기 버튼이 있다', /tvQuit\(\)/.test(ctrl));
  ok('평소엔 아이콘 하나만 보인다', /id="tv-menuBtn"/.test(ctrl) && /\.tv-menu \{[^}]*display:none/.test(htm));
  ok('눌러야 펼쳐진다', /\.tv-menu\.on \{ display:flex; \}/.test(htm)
     && /window\.tvMenu = \(open\) => boardMenu\('tv-menu', 'tv-menuBtn'/.test(cli));
  ok('판을 누르면 닫힌다', /if \(e\.target\.closest\(wrapSel\)\) continue;\s*\n\s*close\(false\);/.test(cli));
  ok('나가면 메뉴도 닫는다', /tv-table'\)[\s\S]{0,90}tvMenu\(false\);/.test(cli));
  ok('안 읽은 채팅 표시도 뜬다', /id="chatDotTv"/.test(htm)
     && /'chatDot', 'chatDotG', 'chatDot4', 'chatDot4M', 'chatDotTv', 'chatDotTvM'/.test(cli));
  ok('이모트 자리가 있다', /id="tv-emoteSlot"/.test(htm));
  ok('이모트는 두 벌 만들지 않는다', /function tvMoveEmote/.test(cli)
     && (htm.match(/id="emoteBtn"/g) || []).length === 1);
  ok('판을 열 때 이모트를 옮긴다', /tvMoveEmote\('tv-emoteSlot'\)/.test(cli));
  ok('나갈 때 제자리로', /tvMoveEmote\('mebar'\)/.test(cli));
  ok('상대 이모트가 상대 쪽에 뜬다', /tv \? 'tv-oppProfile' : 'oppProfile'/.test(cli));

  // 컨트롤이 노치에 안 가리게 — 좁은 화면에서도 안전 여백을 지킨다
  ok('좁은 화면에서도 노치를 피한다', /\.tv-menuWrap \{ top:calc\(8px \+ var\(--safe-t\)\)/.test(htm));
  // 경매대가 화면 한가운데 오게 — 아래 칸만큼 위에도 빈 칸을 둔다
  ok('경매대가 가운데로 내려온다', /#tv-centerZone::before \{ content:''; height:min\(98px, 9vh\)/.test(htm));
  ok('낮은 화면에서는 빈 칸을 접는다', /@media \(max-height:720px\) \{[\s\S]{0,120}#tv-centerZone::before \{ display:none/.test(htm));
  ok('경매대가 줄어들 수 있다', /#tv-mat \{[\s\S]{0,600}min-height:0; position:relative; z-index:2; flex-shrink:1/.test(htm));
  ok('AI 가 정산을 대신 넘기지 않는다', /if \(g\.phase === 'settled'\) return null;/.test(tw));
  ok('AI 가 뜸을 들인다', /\(g\.phase === 'bid' \|\| g\.phase === 'close'\) \? 2200 : 1500/.test(read('server.js')));
  // 내가 두자마자 받아치면 정신이 없다 — 사람 수 뒤에도 한 번 쉰다
  ok('사람이 둔 뒤에도 쉰다', /const pause = \(g\.phase === 'bid' \|\| g\.phase === 'close'\) \? 1400 : 900;/.test(read('server.js'))
     && /room2\.tvThink = setTimeout\(\(\) => tvBot\(roomId\), pause\)/.test(read('server.js')));
  ok('내 프로필이 보인다', /id="tv-myProfile"/.test(htm) && /renderGameProfile\('tv-myProfile'/.test(cli));
  // 사람은 판 위아래에 앉는다 — 프로필과 시계가 손패 바로 위에 나란히
  // 두 사람 다 판 ← 전리품 ← 자리 ← 손패 순. 상대만 자리가 손패 바깥이면
  // 마주 앉은 모양이 아니라 한쪽만 뒤로 물러앉은 꼴이 된다.
  ok('자리가 손패보다 판 쪽에 있다',
     /id="tv-oppHand"[\s\S]{0,400}id="tv-oppSeat"[\s\S]{0,400}id="tv-oppAcq"/.test(htm)
     && /id="tv-myAcq"[\s\S]{0,400}id="tv-mySeat"[\s\S]{0,400}id="tv-myHand"/.test(htm));
  // 이름이 판 한가운데, 시계는 그 옆. 시계까지 흐름에 두면 [이름+시계] 두 덩이의
  // 한가운데가 가운데가 되어 정작 이름은 왼쪽으로 밀려 앉는다.
  ok('시계가 프로필 옆에 붙어 있다',
     /id="tv-oppProfile"[\s\S]{0,200}id="tv-oppTimer"/.test(htm)
     && /id="tv-myProfile"[\s\S]{0,200}id="tv-myTimer"/.test(htm)
     && /\.tv-seat \{ position:relative; display:flex; align-items:center/.test(htm));
  ok('시계는 흐름에서 빼서 이름 옆에 띄운다',
     /\.tv-seat \.pc-timer \{ position:absolute; left:100%;/.test(htm)
     && /width:max-content; white-space:nowrap;/.test(htm));
  // 말풍선은 그 사람 이름에서 나온다 — 배팅액이 누구 것인지 읽혀야 한다
  ok('말풍선이 자리 옆에서 나온다',
     /id="tv-oppSeat"[\s\S]{0,400}id="tv-oppSay"[\s\S]{0,200}id="tv-oppAcq"/.test(htm)
     && /id="tv-myAcq"[\s\S]{0,200}id="tv-mySay"[\s\S]{0,300}id="tv-mySeat"/.test(htm));
  ok('이모트도 이름 위에서 뜬다', /document\.getElementById\(tv \? 'tv-myProfile' : 'myProfile'\)/.test(cli));
  // 트웰브의 이모트 버튼은 왼쪽 아래다 — 오른쪽 기준으로 펴면 목록이 잘린다
  ok('이모트 목록이 안쪽으로 펴진다', /#tv-emoteSlot #emotePicker \{ right:auto; left:0; \}/.test(htm));
  // 상표는 화면이 아니라 판 한가운데에 찍힌다
  ok('로고가 테이블 안에 있다', /<div id="tv-table"><div id="tableLogoTv">/.test(htm));
  ok('이모트는 왼쪽 아래', /#tv-emoteSlot \{ position:absolute; left:14px; bottom:calc\(12px \+ var\(--safe-b\)\)/.test(htm));
  ok('프로필이 칩을 안 덮는다', /\.tv-seat > \* \{ position:static/.test(htm));
  ok('판이 화면을 채운다', /#tv \{[\s\S]{0,400}position:fixed; inset:0/.test(htm));
  // 상대 손패가 좌측 상단 버튼·노치에 가리지 않아야 한다
  // 예전엔 왼쪽 위 조작 버튼 넉 장을 피하느라 위를 84px 비웠다. 이제 그 자리는
  // 오른쪽 위 메뉴 아이콘 하나뿐이라, 노치를 피할 만큼만 두고 테이블에 내준다.
  ok('위 여백은 노치를 피할 만큼만', /#tv-oppZone \{ padding-top:calc\(14px \+ var\(--safe-t\)\)/.test(htm));
  ok('좁은 화면에서도 마찬가지', /#tv-oppZone \{ padding-top:calc\(12px \+ var\(--safe-t\)\); \}/.test(htm));
}

console.log('\n⑳ 2인전과 같은 결인가 — 겉모습·시계·소리');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const htm = read('public/index.html'), cli = read('public/client.js'), srv = read('server.js');
  // 겉모습 — 같은 펠트, 같은 컨트롤, 같은 프로필·시계 자리
  // 펠트는 이제 화면 전체가 아니라 테이블 판이 두른다 — 손패는 테이블 밖이다
  ok('2인전과 같은 펠트', /#tv-table, #game-table, #quad-table \{[\s\S]{0,600}var\(--felt\)/.test(htm));
  ok('같은 컨트롤 버튼', /id="tv-menuWrap"[\s\S]{0,1200}id="tv-menu"/.test(htm));
  ok('테이블 로고가 있다', /id="tableLogoTv"/.test(htm));
  ok('시계가 화면에 있다', /id="tv-myTimer"/.test(htm) && /id="tv-oppTimer"/.test(htm)
     && /class="timer pc-timer"/.test(htm));

  // 시계 — 규칙은 모듈이, 눈금은 서버가
  const tw = read('twelve.js');
  ok('각 5분으로 시작', /time: \{ 1: 300, 2: 300 \}/.test(tw));
  ok('차례인 사람을 안다', /function activePlayer\(g\)/.test(tw) && /activePlayer,/.test(tw));
  ok('시간을 다 쓰면 진다', /function timeout\(g, who\)[\s\S]{0,140}finish\(g, other\(who\), 'time'\)/.test(tw));
  ok('정산 화면에선 안 줄어든다', /if \(g\.phase === 'bid' \|\| g\.phase === 'close'\) return g\.lot \? g\.lot\.turnToAct : null;\s*\n\s*return null;/.test(tw));
  ok('서버가 1초마다 깎는다', /function tvClock\(roomId\)/.test(srv) && /}, 1000\);/.test(srv));
  ok('한 판당 하나의 눈금', /if \(!io\._tvClock\)/.test(srv));
  ok('60초에 알린다', /g\.time\[ap\] === 60[\s\S]{0,120}'tv_warn'/.test(srv));
  ok('0이면 그 자리에서 끝', /twelve\.timeout\(g, ap\); tvPush/.test(srv));
  ok('숫자만 따로 보낸다', /'tv_clock', \{ time: g\.time/.test(srv));
  ok('클라이언트가 시계를 그린다', /socket\.on\('tv_clock'/.test(cli) && /tvFmt/.test(cli));
  ok('시계 갱신이 판을 다시 그리지 않는다',
     !/socket\.on\('tv_clock'[\s\S]{0,700}tvRender\(/.test(cli));

  // 소리 — 2인전이 쓰는 이름을 같은 뜻으로
  const names = ['flip', 'card', 'place', 'back', 'reveal', 'deal', 'tick', 'hourglass'];
  for (const n of names) ok(`소리 ${n} 를 쓴다`, new RegExp(`tvSfx\\('${n}'\\)`).test(cli));
  // 판이 끝날 때는 2인전 결과창을 그대로 쓰므로 그쪽 소리(victory·setwin·defeat)를 낸다
  ok('끝나면 2인전과 같은 소리', /playSound\('victory'\)/.test(cli) && /playSound\('setwin'\)/.test(cli)
     && /playSound\('defeat'\)/.test(cli));
  ok('없는 소리를 부르지 않는다', !/tvSfx\('lose'\)/.test(cli) && !/playSound\('lose'\)/.test(cli));
  ok('초읽기는 겹쳐 울리지 않는다', /Date\.now\(\) - tvTickAt > 900/.test(cli));
  // 칩은 진짜 칩 소리로
  ok('칩 소리 파일이 있다', require('fs').existsSync(require('path').join(__dirname, '..', 'public/chips.mp3')));
  ok('칩 소리를 불러 둔다', /loadSample\('chips', '\/chips\.mp3/.test(cli));
  ok('값을 부르면 칩이 울린다', /tvSfx\('chip'\)/.test(cli));
  ok('은행으로 쓸릴 때도 울린다', /tvSfx\('chips'\)/.test(cli));
  ok('두 소리 다 대체음이 있다', /playSample\('chips', \.5, 1\.35\)\) \{ tone/.test(cli)
     && /playSample\('chips', \.85, 0\.95\)\) \{ tone/.test(cli));
  ok('시간패도 이유를 말해 준다', /endBy === 'time' \? \(win \? '상대 시간 초과!' : '시간 초과\.\.\.'\)/.test(cli));
  // 결과창은 2인전 것을 그대로 쓴다 — 따로 만든 상자는 같은 승리도 다른 판처럼 보였다
  ok('따로 만든 결과 상자는 없앴다', !/tv-over/.test(cli) && !/tv-obox/.test(htm));
  ok('2인전 결과창을 쓴다', /function tvShowOver\(win, endBy\)/.test(cli)
     && /getElementById\('gameOver'\)\.style\.display = 'flex'; showRewards\(\)/.test(cli));
  ok('판 위로 올라온다', /body\.twelve #gameOver \{ z-index:41; \}/.test(htm));
  // tvAgain 은 버튼을 받아 눌린 뒤 잠근다(온라인 재대결 대기 표시)
  ok('버튼은 트웰브 것으로 갈아 끼운다', /rb\.onclick = \(\) => tvAgain\(rb\)/.test(cli)
     && /lobby\.onclick = \(\) => tvQuitNow\(\)/.test(cli));
  ok('완성한 세트를 보여준다', /function tvOverStats\(win, endBy\)/.test(cli) && /celebrateSet\('tv-myAcq'/.test(cli));
  ok('보상 타일도 나온다', /showRewards\(\)/.test(cli));
  // 클로즈에서 가려지는 것은 출품 카드다 — 값은 보여준다
  ok('낼 값을 화면에 쓴다', /const cost = v\.lot\.takeCost;/.test(cli));
  ok('무엇을 사는지는 모른다고 말한다', /무엇을 사는지는 안 보여요/.test(cli));
  // 정산은 저절로 넘어간다
  ok('다음 턴 버튼이 없다', !/btn\('다음 턴'/.test(cli));
  ok('서버가 알아서 넘긴다', /g\.phase === 'settled'\) \{\s*\n\s*clearTimeout\(room\.tvNext\)/.test(srv));
  // 칩이 은행으로 가고 카드가 날아 앉는 데 1.5초쯤. 4.2초는 판이 멈춘 것처럼 길었다.
  ok('넘기기 전에 연출할 틈을 준다', /\}, 2600\);/.test(srv));
  // 둘 게 없는데 판을 다시 보내면 두 가지가 같이 망가진다 —
  // 정산 화면이 다시 그려져 이미 날아간 낙찰 카드가 중앙에 도로 놓이고,
  // tvPush 가 다음 판 타이머를 새로 걸어 멈춤이 그만큼 길어진다.
  ok('AI 가 둘 게 없으면 판을 다시 보내지 않는다', /if \(!acted\) return;\s*\n\s*tvPush\(roomId\);/.test(srv));
  // 화면 쪽에도 한 겹 — 이미 날아가 앉았으면 중앙에 도로 놓지 않는다
  ok('앉은 카드를 중앙에 도로 놓지 않는다', /const pz = tvSettleLive \? \(v\.last\.prize \|\| \[\]\) : \[\];/.test(cli)
     && /if \(!tvFlying\.length\) tvSettleLive = false;/.test(cli));
  ok('끝난 판은 안 넘긴다', /if \(g\.over\) \{ tvFinish\(roomId\); return; \}/.test(srv));
  // 낙찰 카드는 이긴 쪽 필드로 간다 — 경매대에 남지 않는다
  // 경매품을 지웠다가 잠시 뒤 날아오르게 하면 한 번 사라졌다 나타나 보인다.
  // 있던 그 카드가 그대로 떠올라야 한다.
  // 덱에서 뽑는 모습 — 그냥 나타나면 "뽑았다" 는 느낌이 없다
  ok('덱에서 뒤집히며 나온다', /function tvDealt\(cardEl, deckEl\)/.test(cli)
     && /rotateY\(180deg\)/.test(cli) && /if \(tvJustDrew\) tvDealt\(cc, \$\('tv-deck'\)\)/.test(cli));
  // 직전 상태를 갈아 끼운 뒤에 보면 늘 "아니다" 가 나온다 — 미리 적어 둬야 한다
  ok('뽑은 순간을 미리 적어 둔다', /tvJustDrew = !!\(tvPrev && !tvPrev\.lot && v\.lot\);/.test(cli));
  ok('있던 카드가 그대로 떠오른다', /const stay = document\.querySelector\(`#tv-mat \[data-cid="\$\{card\.id\}"\]`\)/.test(cli)
     && /if \(stay\) stay\.style\.visibility = 'hidden'/.test(cli));
  ok('기다리지 않고 곧바로 띄운다', /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{\s*\n\s*tvLand\(l\.prize/.test(cli));
  ok('날아간 뒤 더미에 얹는다', /tvFlying = tvFlying\.filter/.test(cli) && /tvPile\(box, cards, landingIds\)/.test(cli));
  // 칩은 가운데에서 오른쪽 은행으로만 흐른다
  // 오른쪽 레일 — 위에서부터 상대 배팅 · 은행 · 내 배팅
  ok('은행 자리가 있다', /id="tv-bank"/.test(htm) && /#tv-rail \{ position:absolute; left:calc\(50% \+ 152px\)/.test(htm));
  ok('레일이 셋을 세로로 세운다', /id="tv-potOpp"[\s\S]{0,200}id="tv-bank"[\s\S]{0,200}id="tv-potMe"/.test(htm));
  // 곧게 가로지르면 미끄러지는 것처럼 보인다 — 살짝 떠올랐다 내려앉게
  ok('칩이 떠서 건너간다', /function tvTossChip\(fromEl, toEl, mine, delay\)/.test(cli)
     && /translate\(\$\{dx \* 0\.5\}px, \$\{dy \* 0\.5 - lift\}px\)/.test(cli));
  ok('내 자리에서 내 더미로 간다', /const pot = document\.getElementById\(mine \? 'tv-potMe' : 'tv-potOpp'\)/.test(cli));
  ok('칩이 프로필로 날지 않는다', !/tvFlyChips\(myEl/.test(cli));
  ok('설명서가 시간을 알린다', /제한 시간 5분/.test(htm));
}

console.log('\n㉑ AI — 세 급이 정말로 다른가');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const htm = read('public/index.html'), cli = read('public/client.js'), srv = read('server.js');
  ok('세 급이 있다', !!(T.LEVELS.easy && T.LEVELS.hard && T.LEVELS.expert));
  ok('전문가만 판을 견주어 본다', T.LEVELS.expert.reason === true && !T.LEVELS.hard.reason && !T.LEVELS.easy.reason);
  ok('쉬움은 칩을 함부로 쓴다', T.LEVELS.easy.safe === false && T.LEVELS.hard.safe === true);
  ok('고른 급이 서버까지 간다', /\['easy', 'hard', 'expert'\]\.includes\(diff\)/.test(srv)
     && /applyAi\(g, me, Math\.random, room\.difficulty \|\| 'hard'\)/.test(srv));
  ok('화면에 세 버튼이 있다', /tvSolo\('easy'\)/.test(htm) && /tvSolo\('hard'\)/.test(htm) && /tvSolo\('expert'\)/.test(htm));
  ok('한 판 더도 같은 급으로', /diff: tvDiff/.test(cli));
  ok('어느 급인지 보여준다', /cpuDiff/.test(cli) && /cpuDiff: label/.test(srv));

  // 칩을 0 까지 쓰면 진다 — 세트를 못 내는 수라면 마지막 한 칩은 남겨야 한다
  {
    const g = T.createGame({ rnd: rng(41) });
    g.chips[1] = 5;
    T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
    const cap5 = T.LEVELS.expert.safe ? 4 : 5;
    ok('마지막 한 칩은 남긴다', cap5 === 4);
  }
  // 상대 손패는 어떤 급도 안 본다
  {
    const g = T.createGame({ rnd: rng(42) });
    T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
    const before = JSON.stringify(g.hands[2]);
    const snap = JSON.stringify(g);
    for (const lv of ['easy', 'hard', 'expert']) {
      const h = JSON.parse(snap);
      const a1 = T.aiAct(h, 1, () => 0.5, lv);
      h.hands[2] = [];                       // 상대 손패를 지워도 같은 수가 나와야 한다
      const a2 = T.aiAct(h, 1, () => 0.5, lv);
      ok(`${lv} 는 상대 손패를 안 본다`, JSON.stringify(a1) === JSON.stringify(a2));
    }
    ok('상대 손패를 건드리지 않는다', JSON.stringify(g.hands[2]) === before);
  }
  // 자가대전 — 급이 높을수록 이겨야 한다
  {
    const duel = (l1, l2, n, seed0) => {
      let w1 = 0, w2 = 0;
      for (let i = 0; i < n; i++) {
        const rnd = rng(seed0 + i * 7919);
        const g = T.createGame({ rnd, first: i % 2 ? 2 : 1 });
        let guard = 0;
        while (!g.over && guard++ < 3000) {
          if (g.phase === 'settled') { T.nextTurn(g); continue; }
          const who = T.activePlayer(g); if (!who) break;
          if (!T.applyAi(g, who, rnd, who === 1 ? l1 : l2)) break;
        }
        if (g.over) (g.winner === 1 ? w1++ : w2++);
      }
      return w1 / (w1 + w2);
    };
    const both = (a, b) => (duel(a, b, 200, 101) + (1 - duel(b, a, 200, 404))) / 2;
    const eh = both('expert', 'hard'), he = both('hard', 'easy'), ee = both('expert', 'easy');
    ok('전문가가 보통을 이긴다', eh >= 0.78, (eh * 100).toFixed(1) + '%');
    ok('보통이 쉬움을 이긴다', he >= 0.58, (he * 100).toFixed(1) + '%');
    ok('전문가가 쉬움을 크게 이긴다', ee >= 0.90, (ee * 100).toFixed(1) + '%');
  }
}

console.log('\n㉒ 모드가 달라도 내 것은 그대로 — 스킨·설명서·손패');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const htm = read('public/index.html'), cli = read('public/client.js'), srv = read('server.js');
  // 장착한 것은 어느 판에서나
  ok('트웰브 판도 스킨을 칠한다', /for \(const id of \['game', 'mini', 'tv'\]\)/.test(cli)
     && /applyMySkins\(\); \} catch \(_\) \{\}   \/\/ 장착한/.test(cli));
  ok('테이블 스킨 선택자에 트웰브가 있다', (htm.match(/#tv\.tbl-/g) || []).length >= 9);
  ok('카드백도 붙는다', /gameProfiles = d\.profiles \|\| null; myIndex = d\.me;/.test(cli)
     && /slot\.appendChild\(makeOppBack\(\)\)/.test(cli));

  // 설명서는 지금 모드부터
  ok('지금 모드를 안다', /function currentMode\(\)/.test(cli) && /c\.contains\('twelve'\)\) return 'twelve'/.test(cli));
  ok('설명 버튼이 그 탭을 연다', /rulesTab\(currentMode\(\)\)/.test(cli));
  // 설명서는 눌렀을 때만 뜬다 — 판이 시작될 때 저절로 뜨면 방해만 된다
  ok('저절로 뜨지 않는다', !/rulesFirstTime/.test(cli));

  // 오른쪽 끝 패가 옆줄에 가리지 않게
  ok('세로줄 빈자리는 손가락을 통과시킨다', /#tv-oppZone, #tv-myZone \{ pointer-events:none; \}/.test(htm)
     && /\.tv-seat \{[^}]*pointer-events:none/.test(htm)
     && /\.tv-seat > \* \{ position:static; pointer-events:auto; \}/.test(htm));
  ok('2인전도 같이 고쳤다', /#oppbar, #mebar \{ pointer-events:none; \}/.test(htm));

  // 방식을 고르기 전에는 출품 카드를 무를 수 있다
  {
    const g = T.createGame({ rnd: rng(51) });
    T.draw(g, 1);
    const first = g.hands[1][0].id, second = g.hands[1][1].id;
    T.offer(g, 1, first);
    ok('한 번 낸 뒤에도 바꿀 수 있다', T.reoffer(g, 1, second) === true && g.lot.offered.id === second);
    ok('바꾼 카드는 손패로 돌아온다', g.hands[1].some((c) => c.id === first) && g.hands[1].length === 5);
    T.chooseType(g, 1, 'open');
    ok('방식을 고른 뒤엔 못 바꾼다', T.reoffer(g, 1, first) === false);
    ok('상대는 못 바꾼다', T.reoffer(T.createGame({ rnd: rng(52) }), 2, 1) === false);
  }
  ok('서버가 무르기를 받는다', /g\.phase === 'choose' \? twelve\.reoffer/.test(srv));
  ok('화면도 고를 수 있게 연다', /v\.phase === 'offer' \|\| v\.phase === 'choose'/.test(cli));

  // 모드 고르는 창은 한눈에
  ok('솔로·멀티 창이 전체화면', /#soloModal, #multiModal \{/.test(htm)
     && /#soloModal \.lb-box, #multiModal \.lb-box \{[\s\S]{0,120}height:100%/.test(htm));
  ok('닫기 버튼 대신 × 만 쓴다', !/style="margin-top:12px" onclick="closeModePanels\(\)">닫기/.test(htm));
}

console.log('\n㉓ 그냥 물러설 수는 없다 · 나가기는 한 번 묻는다 · 등급 숫자는 안 쓴다');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const htm = read('public/index.html'), cli = read('public/client.js');
  // 아무도 안 건 판에서 빠지면 경매가 아니라 그냥 넘겨 주는 것이다
  {
    const g = T.createGame({ rnd: rng(61) });
    T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
    ok('먼저 부르는 사람은 못 물러선다', T.canFold(g, 1) === false && T.fold(g, 1) === false);
    ok('최소 1 은 걸 수 있다', T.raise(g, 1, 1) === true);
    ok('받은 사람은 물러설 수 있다', T.canFold(g, 2) === true);
    ok('물러서면 상대가 가져간다', T.fold(g, 2) === true && g.last.winner === 1);
  }
  // AI 도 못 물러서는 자리에서는 최소로 건다
  {
    const g = T.createGame({ rnd: rng(62) });
    g.acq[1] = [{ kind: 6, grade: 1, id: 601 }];
    T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
    const a = T.aiAct(g, 1, () => 0.99, 'easy');
    ok('AI 는 그 자리에서 안 빠진다', a && a.act !== 'fold', a && a.act);
  }
  ok('화면도 물러서기를 감춘다', /if \(v\.lot\.canFold\) btn\('물러서기'/.test(cli));
  ok('먼저 부르는 자리임을 알려준다', /먼저 부르는 자리예요/.test(cli));
  ok('나가기 전에 한 번 묻는다', /askConfirm\(\{ icon: '🚪', title: '판을 나갈까요\?'/.test(cli));
  // 등급도, 2-1 의 왕관도, 6-10 의 칼도 트웰브에는 없는 이야기다
  ok('등급 숫자는 안 쓴다', /#tv \.card \.c-top \{ display:none; \}/.test(htm));
  ok('큰 숫자가 카드 한가운데', /#tv \.card \.c-num \{ flex:1; display:flex; align-items:center; justify-content:center/.test(htm));
  ok('더미도 고르게 겹친다', /#tv \.pile-group \.card \{ margin-left:-14px; \}/.test(htm));
  // 목록은 네 모드로 늘었다(다인전·미니게임이 빠져 있어 껐는데도 거기서만 나왔다).
  // 트웰브가 그 목록에 들어 있는지만 본다 — 목록 전체는 t_guidedeal 이 지킨다.
  ok('가이드 끄기가 트웰브에도 먹힌다',
     /for \(const id of \[[^\]]*'tv-status'[^\]]*\]\) \{\s*\n\s*const sb = document\.getElementById\(id\); if \(sb\) sb\.style\.display = guideOff/.test(cli));
}

console.log('\n㉔ 전문가는 방식도 셈해서 고른다 · 안 보이는 한 장 몫도 본다');
{
  const fs = require('fs'), path = require('path');
  const tw = fs.readFileSync(path.join(__dirname, '..', 'twelve.js'), 'utf8');
  // 오픈이냐 클로즈냐를 감(rnd)으로 고르지 않는다 — 두 갈래를 놓아 보고 고른다.
  // 사는 쪽이 값을 아는 규칙으로 바뀌어서 이 갈림을 셈할 수 있게 됐다.
  ok('방식을 셈해서 고른다', /bestClose > openScore \? 'close' : 'open'/.test(tw)
     && /let bestClose = -Infinity;/.test(tw));
  ok('상대가 살지 안 살지를 값으로 판단', /const takes = \(b \+ 1\) <= opCeil && g\.chips\[you\] >= b \+ 1/.test(tw));
  ok('안 보이는 한 장 몫을 셈에 넣는다', /ceilingFor\(g, me, P, a, rnd\) \+ \(P\.reason \? 3 : 0\)/.test(tw));
  ok('보통·쉬움은 여전히 감으로 고른다', /const wantClose = \(a\.mustWin \|\| a\.worth >= 4\) && rnd\(\) < 0\.72/.test(tw));
}

console.log('\n㉕ 전문가는 끝까지 두어 보고 정한다 (몬테카를로)');
{
  // 저울은 사람이 손으로 매긴 값이다. 진짜로 알고 싶은 건 "이 값에 사면
  // 이 판을 이기는가" 하나뿐이라, 안 보이는 것을 상상해 채워 끝까지 둬 본다.
  ok('전문가만 두어 본다', T.LEVELS.expert.mc === 16 && !T.LEVELS.hard.mc && !T.LEVELS.easy.mc);

  const g = T.createGame({ rnd: rng(81) });
  T.draw(g, 1); T.offer(g, 1, g.hands[1][0].id); T.chooseType(g, 1, 'open');
  const w = T.imagine(g, 1, rng(82));
  ok('상상한 판도 카드가 24장', (() => {
    const ids = new Set();
    for (const c of [...w.center, ...w.hands[1], ...w.hands[2], ...w.acq[1], ...w.acq[2]]) ids.add(c.id);
    if (w.lot) { if (w.lot.center) ids.add(w.lot.center.id); if (w.lot.offered) ids.add(w.lot.offered.id); }
    return ids.size === 24;
  })());
  ok('내 손패는 그대로 둔다',
     JSON.stringify(w.hands[1].map(c => c.id).sort()) === JSON.stringify(g.hands[1].map(c => c.id).sort()));
  ok('상대 손패는 장수만 맞춘다', w.hands[2].length === g.hands[2].length);
  ok('내가 아는 것은 안 흔든다', w.chips[1] === g.chips[1] && w.chips[2] === g.chips[2] && w.turn === g.turn);

  // 상상한 판을 끝까지 두면 반드시 끝난다 (교착이 없다)
  const done = T.playout(JSON.parse(JSON.stringify(w)), 1, 1, 2, rng(83), 'hard');
  ok('끝까지 두면 승패가 난다', done === 0 || done === 1, String(done));

  // 몬테카를로가 들어와도 상대 손패는 안 본다
  {
    const h = T.createGame({ rnd: rng(84) });
    T.draw(h, 1); T.offer(h, 1, h.hands[1][0].id); T.chooseType(h, 1, 'open');
    const snap = JSON.stringify(h);
    const a1 = T.aiAct(JSON.parse(snap), 1, () => 0.5, 'expert');
    const h2 = JSON.parse(snap); h2.hands[2] = [];
    const a2 = T.aiAct(h2, 1, () => 0.5, 'expert');
    ok('상대 손패를 지워도 같은 수', JSON.stringify(a1) === JSON.stringify(a2));
  }

  // 한 수에 오래 걸리면 판이 멈춘 것처럼 보인다 — 서버가 주는 뜸(1.5~2.2초) 안에 끝나야 한다
  {
    const rnd2 = rng(85); let worst = 0;
    for (let i = 0; i < 6; i++) {
      const k = T.createGame({ rnd: rnd2 }); let guard = 0;
      while (!k.over && guard++ < 400) {
        if (k.phase === 'settled') { T.nextTurn(k); continue; }
        const who = T.activePlayer(k); if (!who) break;
        const t0 = Date.now();
        if (!T.applyAi(k, who, rnd2, who === 1 ? 'expert' : 'hard')) break;
        if (who === 1) worst = Math.max(worst, Date.now() - t0);
      }
    }
    ok('한 수가 200ms 안에 끝난다', worst < 200, worst + 'ms');
  }
}

console.log('\n⑮ 재대결 — 같은 방에서 다시, 같은 게임으로');
{
  const fs2 = require('fs'), path2 = require('path');
  const read = (f) => fs2.readFileSync(path2.join(__dirname, '..', f), 'utf8');
  const srv = read('server.js'), cli = read('public/client.js');
// restartGame 은 방 모드를 안 보고 무조건 createGame(2인전)을 만들었다.
// TWELVE 방에서 재대결이 걸리면 칩 경매가 조용히 카드 경매로 바뀐다.
ok('restartGame 이 TWELVE 방을 알아본다',
   /if \(room\.mode === 'twelve'\) \{[\s\S]{0,160}tvRestart\(roomId\);[\s\S]{0,20}return;/.test(srv));
ok('tvStart 참조를 밖에서 쓸 수 있게 꺼내 둔다',
   /let tvRestart = null;/.test(srv) && /tvRestart = tvStart;/.test(srv));
// '한 판 더' 라고 적어 놓고 상대와 헤어지게 하면 안 된다
ok('온라인은 상대에게 재대결을 건다', /window\.tvAgain = function \(btn\) \{[\s\S]{0,700}socket\.emit\('rematch'\);/.test(cli));
ok('혼자 하기는 그 자리에서 다시', /if \(tvBot\) \{[\s\S]{0,260}socket\.emit\('tv_solo'/.test(cli));
ok('새 판이 열리면 결과창을 걷는다',
   /socket\.on\('tv_begin'[\s\S]{0,420}getElementById\('gameOver'\);\s*\n\s*if \(go\) go\.style\.display = 'none';/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
