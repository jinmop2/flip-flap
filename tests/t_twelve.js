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
  ok('RP 는 안 건드린다', /noRank: true,\s*\/\/ 트웰브는 RP 미반영/.test(srv));
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
  ok('숫자도 같이 있다', /querySelector\('b'\)\.textContent = v\.chips\.me/.test(cli));
  ok('통째로 갈아 끼우지 않는다', !/tv-myChips'\)\.innerHTML =/.test(cli));
  ok('줄어든 칩은 덜어 내는 게 보인다', /el\.classList\.add\('gone'\)/.test(cli) && /@keyframes csGone/.test(htm));
  ok('값을 부르면 칩이 판돈으로 간다', /function tvBetChips\(n, mine\)/.test(cli)
     && /tvBetChips\(v\.lot\.myBet - \(prev\.lot\.myBet \|\| 0\), true\)/.test(cli));
  ok('판돈은 정산 때 은행으로 간다', /function tvFlyChips\(n, mine\)[\s\S]{0,200}'tv-potMe' : 'tv-potOpp'[\s\S]{0,120}getElementById\('tv-bank'\)/.test(cli));
  ok('건 칩이 레일에 쌓인다', /function tvPot\(box, n, mine, unknown\)/.test(cli)
     && /tvPot\(\$\('tv-potMe'\), v\.lot\.myBet, true, false\)/.test(cli));
  ok('클로즈에서 상대 값은 물음표', /oppHidden \? 0 : \(v\.lot\.oppBet \|\| 0\), false, oppHidden/.test(cli));
  ok('액수는 큰 버튼으로 고른다', /function tvAmount/.test(cli) && /\.tv-step \{[\s\S]{0,80}width:46px; height:46px/.test(htm));
  ok('클로즈는 짝수만 나온다', /tvAmount\(box, 2, hi, 2, 2\)/.test(cli));
  ok('숫자 입력칸의 작은 화살표는 안 쓴다', !/inp\.type = 'number'/.test(cli));
  // 단계가 바뀌어도 판이 안 밀리게 — 칸마다 높이를 못 박았는가
  ok('문구 칸 높이 고정', /#tv-status \{[\s\S]{0,300}height:32px/.test(htm));
  ok('버튼 칸 높이 고정', /#tv-actions \{[\s\S]{0,140}height:56px/.test(htm));
  // 높이는 화면에 매어 둔다 — 낮은 화면에서 안 줄면 아래 칸을 밀어낸다
  ok('카드 자리 고정', /#tv-mat \.a-card \{ width:70px; height:min\(98px, 15vh\)/.test(htm));
  ok('2인전과 같은 줄 구성', /id="tv-oppZone"/.test(htm) && /id="tv-centerZone"/.test(htm) && /id="tv-myZone"/.test(htm));
  ok('덱은 띄워 붙여 경매대를 안 민다', /#tv-deck \{ position:absolute/.test(htm));
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

  // 2인전에 있는 것은 여기도 있어야 한다 — 채팅·설정·이모트
  const ctrl = htm.slice(htm.indexOf('id="tv-controls"'), htm.indexOf('id="tv-oppbar"'));
  ok('채팅 버튼이 있다', /toggleGameChat\(\)/.test(ctrl));
  ok('설정 버튼이 있다', /toggleSettings\(\)/.test(ctrl));
  ok('설명 버튼이 있다', /tvRules\(true\)/.test(ctrl));
  ok('나가기 버튼이 있다', /tvQuit\(\)/.test(ctrl));
  ok('안 읽은 채팅 표시도 뜬다', /id="chatDotTv"/.test(htm) && /'chatDot', 'chatDot4', 'chatDotTv'/.test(cli));
  ok('이모트 자리가 있다', /id="tv-emoteSlot"/.test(htm));
  ok('이모트는 두 벌 만들지 않는다', /function tvMoveEmote/.test(cli)
     && (htm.match(/id="emoteBtn"/g) || []).length === 1);
  ok('판을 열 때 이모트를 옮긴다', /tvMoveEmote\('tv-emoteSlot'\)/.test(cli));
  ok('나갈 때 제자리로', /tvMoveEmote\('mebar'\)/.test(cli));
  ok('상대 이모트가 상대 쪽에 뜬다', /tv \? 'tv-oppProfile' : 'oppProfile'/.test(cli));

  // 컨트롤이 노치에 안 가리게 — 좁은 화면에서도 안전 여백을 지킨다
  ok('좁은 화면에서도 노치를 피한다', /#tv-controls \{ top:calc\(8px \+ var\(--safe-t\)\)/.test(htm));
  // 경매대가 화면 한가운데 오게 — 아래 칸만큼 위에도 빈 칸을 둔다
  ok('경매대가 가운데로 내려온다', /#tv-centerZone::before \{ content:''; height:min\(98px, 9vh\)/.test(htm));
  ok('낮은 화면에서는 빈 칸을 접는다', /@media \(max-height:720px\) \{[\s\S]{0,120}#tv-centerZone::before \{ display:none/.test(htm));
  ok('경매대가 줄어들 수 있다', /#tv-mat \{[\s\S]{0,600}min-height:0; position:relative; z-index:2; flex-shrink:1/.test(htm));
  ok('AI 가 정산을 대신 넘기지 않는다', /if \(g\.phase === 'settled'\) return null;/.test(tw));
  ok('AI 가 뜸을 들인다', /\(g\.phase === 'bid' \|\| g\.phase === 'close'\) \? 1500 : 1100/.test(read('server.js')));
  ok('내 프로필이 보인다', /id="tv-myProfile"/.test(htm) && /renderGameProfile\('tv-myProfile'/.test(cli));
  ok('프로필이 칩을 안 덮는다', /#tv-oppbar > \*, #tv-mebar > \* \{ position:static/.test(htm));
  ok('판이 화면을 채운다', /#tv \{[\s\S]{0,400}position:fixed; inset:0/.test(htm));
  // 상대 손패가 좌측 상단 버튼·노치에 가리지 않아야 한다
  ok('상대 줄이 버튼을 피한다', /#tv-oppZone \{ padding-top:calc\(84px \+ var\(--safe-t\)\)/.test(htm));
  ok('좁은 화면에서도 피한다', /#tv-oppZone \{ padding-top:calc\(70px \+ var\(--safe-t\)\); \}/.test(htm));
}

console.log('\n⑳ 2인전과 같은 결인가 — 겉모습·시계·소리');
{
  const fs = require('fs'), path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const htm = read('public/index.html'), cli = read('public/client.js'), srv = read('server.js');
  // 겉모습 — 같은 펠트, 같은 컨트롤, 같은 프로필·시계 자리
  ok('2인전과 같은 펠트', /#tv \{[\s\S]{0,600}var\(--felt\)/.test(htm));
  ok('같은 컨트롤 버튼', /id="tv-controls"[\s\S]{0,900}class="ctrl-btn"/.test(htm));
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
  const names = ['flip', 'card', 'place', 'back', 'reveal', 'deal', 'tick', 'hourglass', 'setwin', 'defeat'];
  for (const n of names) ok(`소리 ${n} 를 쓴다`, new RegExp(`tvSfx\\('${n}'\\)`).test(cli));
  ok('없는 소리를 부르지 않는다', !/tvSfx\('lose'\)/.test(cli) && !/playSound\('lose'\)/.test(cli));
  ok('초읽기는 겹쳐 울리지 않는다', /Date\.now\(\) - tvTickAt > 900/.test(cli));
  // 칩은 진짜 칩 소리로
  ok('칩 소리 파일이 있다', require('fs').existsSync(require('path').join(__dirname, '..', 'public/chips.mp3')));
  ok('칩 소리를 불러 둔다', /loadSample\('chips', '\/chips\.mp3/.test(cli));
  ok('값을 부르면 칩이 울린다', /tvSfx\('chip'\)/.test(cli));
  ok('은행으로 쓸릴 때도 울린다', /tvSfx\('chips'\)/.test(cli));
  ok('두 소리 다 대체음이 있다', /playSample\('chips', \.5, 1\.35\)\) \{ tone/.test(cli)
     && /playSample\('chips', \.85, 0\.95\)\) \{ tone/.test(cli));
  ok('시간패도 이유를 말해 준다', /endBy === 'time' \? '시간 초과'/.test(cli));
  // 클로즈에서 가려지는 것은 출품 카드다 — 값은 보여준다
  ok('낼 값을 화면에 쓴다', /const cost = v\.lot\.takeCost;/.test(cli));
  ok('무엇을 사는지는 모른다고 말한다', /무엇을 사는지는 안 보여요/.test(cli));
  // 정산은 저절로 넘어간다
  ok('다음 턴 버튼이 없다', !/btn\('다음 턴'/.test(cli));
  ok('서버가 알아서 넘긴다', /g\.phase === 'settled'\) \{\s*\n\s*clearTimeout\(room\.tvNext\)/.test(srv));
  ok('넘기기 전에 연출할 틈을 준다', /\}, 4200\);/.test(srv));
  ok('끝난 판은 안 넘긴다', /if \(g\.over\) \{ tvFinish\(roomId\); return; \}/.test(srv));
  // 낙찰 카드는 이긴 쪽 필드로 간다 — 경매대에 남지 않는다
  ok('경매대를 비운다', /경매대는 비운다/.test(cli));
  ok('날아간 뒤 더미에 얹는다', /tvFlying = tvFlying\.filter/.test(cli) && /tvPile\(box, cards, landingIds\)/.test(cli));
  // 칩은 가운데에서 오른쪽 은행으로만 흐른다
  // 오른쪽 레일 — 위에서부터 상대 배팅 · 은행 · 내 배팅
  ok('은행 자리가 있다', /id="tv-bank"/.test(htm) && /#tv-rail \{ position:absolute; left:calc\(50% \+ 168px\)/.test(htm));
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
    ok('전문가가 보통을 이긴다', eh >= 0.60, (eh * 100).toFixed(1) + '%');
    ok('보통이 쉬움을 이긴다', he >= 0.62, (he * 100).toFixed(1) + '%');
    ok('전문가가 쉬움을 크게 이긴다', ee >= 0.68, (ee * 100).toFixed(1) + '%');
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
  ok('세로줄 빈자리는 손가락을 통과시킨다', /#tv-oppbar, #tv-mebar \{ pointer-events:none; \}/.test(htm)
     && /#tv-oppbar > \*, #tv-mebar > \* \{ pointer-events:auto; \}/.test(htm));
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

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
