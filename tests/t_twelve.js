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
  ok('상대에게 진행자 배팅이 안 나간다', v2.lot.oppBet === null && v2.lot.closeBetKnown === null);
  ok('출품 카드도 가려진다', v2.lot.offered === null && v2.lot.hasOffer === true);
  ok('사는 값만 알려준다', v2.lot.takeCost === 9, String(v2.lot.takeCost));
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
  ok('세트를 완성시키는 경매품은 값이 무한', T.lotWorth(g, 1) === Infinity);
  // 상대가 완성 직전이면 막는 것도 무한
  const h = T.createGame({ rnd: rng(78) });
  h.acq[2] = [{ kind: 2, grade: 1, id: 201 }];
  h.center.unshift({ kind: 2, grade: 2, id: 202 });
  T.draw(h, 1); T.offer(h, 1, h.hands[1][0].id);
  ok('상대 완성을 막는 것도 무한', T.lotWorth(h, 1) === Infinity);
  // 아무 쓸모 없는 자리는 값이 작다
  const k = T.createGame({ rnd: rng(79) });
  T.draw(k, 1); T.offer(k, 1, k.hands[1][0].id);
  const w = T.lotWorth(k, 1);
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
  ok('RP 는 안 건드린다', /noRank: true,\s*\/\/ 트웰브는 RP 미반영/.test(srv));
  ok('방 모드로도 열린다', /room\.mode === 'twelve'\) \{ tvStart/.test(srv));
  ok('빠른 입장에 있다', /'classic', 'item', 'quad', 'twelve'/.test(srv));
  ok('화면이 있다', /id="tv"/.test(htm) && /body\.twelve #tv \{ display:flex/.test(htm));
  ok('클라이언트가 상태를 받는다', /socket\.on\('tv_state'/.test(cli) && /function tvRender/.test(cli));
  ok('클라이언트는 셈을 하지 않는다', !/tvView[\s\S]{0,200}Math\.floor\(.*\/ 2\)/.test(cli));
  ok('설명서 탭이 있다', /data-rt="twelve"/.test(htm) && /id="rulesTwelveModal"/.test(htm));
  ok('솔로·빠른입장 입구', /onclick="tvSolo\(\)"/.test(htm) && /quickJoin\('twelve'\)/.test(htm));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
