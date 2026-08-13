// 미니게임 족보 — 24장 덱에서 두 장을 뽑는 276가지를 전부 확인한다.
//
// 족보가 틀리면 게임이 통째로 틀어지는데, 눈으로는 못 잡는다. 개수를 세어
// 대조하고, 저격 규칙은 상대 티어별로 하나씩 짚는다.
const S = require('../sutda.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

const deck = S.makeDeck();
const C = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });
// 모든 두 장 조합
const all = [];
for (let i = 0; i < deck.length; i++)
  for (let j = i + 1; j < deck.length; j++) all.push([deck[i], deck[j]]);

console.log('① 덱');
{
  ok('24장', deck.length === 24, String(deck.length));
  ok('2그룹 2장', deck.filter((c) => c.kind === 2).length === 2);
  ok('3그룹 5장', deck.filter((c) => c.kind === 3).length === 5);
  ok('4그룹 7장', deck.filter((c) => c.kind === 4).length === 7);
  ok('6그룹 10장', deck.filter((c) => c.kind === 6).length === 10);
  ok('같은 카드가 없다', new Set(deck.map((c) => c.id)).size === 24);
  ok('두 장 조합은 276가지', all.length === 276, String(all.length));
}

console.log('\n② 티어별 개수');
{
  const bySum = {};
  for (const h of all) { const s = h[0].kind + h[1].kind; bySum[s] = (bySum[s] || 0) + 1; }
  ok('앞자리 합 4 → 1개', bySum[4] === 1, String(bySum[4]));
  ok('앞자리 합 5 → 10개', bySum[5] === 10, String(bySum[5]));
  ok('앞자리 합 6 → 24개', bySum[6] === 24, String(bySum[6]));
  ok('앞자리 합 7 → 35개', bySum[7] === 35, String(bySum[7]));
  ok('앞자리 합 8 → 41개', bySum[8] === 41, String(bySum[8]));
  ok('앞자리 합 9 → 50개', bySum[9] === 50, String(bySum[9]));
  ok('앞자리 합 12 → 45개', bySum[12] === 45, String(bySum[12]));
  ok('합 11 은 나오지 않는다', !bySum[11], String(bySum[11]));

  const snipers = all.filter((h) => S.sniperOf(h[0], h[1]) !== S.SNIPER_NONE);
  ok('스나이퍼 7개', snipers.length === 7, String(snipers.length));
  ok('거울쌍 1개', snipers.filter((h) => S.sniperOf(h[0], h[1]) === S.SNIPER_MIRROR).length === 1);
  ok('일반 10-10 6개', snipers.filter((h) => S.sniperOf(h[0], h[1]) === S.SNIPER_NORMAL).length === 6);

  // 합 10 은 4그룹 7장 × 6그룹 10장 = 70가지. 스나이퍼 7개를 빼면 63개다.
  // 규칙서에는 62로 적혀 있었는데, 그러면 전체가 275가 되어 276과 안 맞는다.
  ok('앞자리 합 10 → 70개', bySum[10] === 70, String(bySum[10]));
  ok('그중 일반(6티어)은 63개', bySum[10] - 7 === 63, String(bySum[10] - 7));
  const total = Object.values(bySum).reduce((a, b) => a + b, 0);
  ok('전부 더하면 276', total === 276, String(total));
}

console.log('\n③ 코어 룰 (1·2·3원칙)');
{
  // 제1원칙 — 앞자리 합이 작은 쪽
  ok('합 4 가 합 5 를 이긴다', S.compare([C(2, 1), C(2, 2)], [C(2, 1), C(3, 1)]) === 1);
  ok('합 6 이 합 7 을 이긴다', S.compare([C(2, 1), C(4, 1)], [C(3, 1), C(4, 1)]) === 1);
  ok('합 9 가 합 12 를 이긴다', S.compare([C(3, 1), C(6, 1)], [C(6, 1), C(6, 2)]) === 1);

  // 제2원칙 — 앞자리 합이 같으면 뒷자리 합
  ok('같은 합이면 뒷자리 합이 작은 쪽',
     S.compare([C(3, 1), C(4, 1)], [C(3, 5), C(4, 7)]) === 1);
  ok('반대도 성립', S.compare([C(3, 5), C(4, 7)], [C(3, 1), C(4, 1)]) === -1);

  // 제3원칙 — 둘 다 같으면 더 작은 카드를 쥔 쪽
  // 3-1+4-5 (합7, 뒷합6) vs 3-2+4-4 (합7, 뒷합6) → 3-1 이 3-2 보다 작다
  ok('합이 다 같으면 더 작은 패를 쥔 쪽',
     S.compare([C(3, 1), C(4, 5)], [C(3, 2), C(4, 4)]) === 1);
  ok('반대도 성립', S.compare([C(3, 2), C(4, 4)], [C(3, 1), C(4, 5)]) === -1);
}

console.log('\n④ 저격 — 거울쌍 10 (4-4 + 6-6)');
{
  const mirror = [C(4, 4), C(6, 6)];
  ok('거울쌍으로 인식', S.evaluate(mirror).sniper === S.SNIPER_MIRROR);
  ok('0티어(합4)를 잡는다', S.compare(mirror, [C(2, 1), C(2, 2)]) === 1);
  ok('1티어(합5)를 잡는다', S.compare(mirror, [C(2, 1), C(3, 1)]) === 1);
  // 저격 대상이 아니면 그냥 합 10 — 중간계에게 진다
  for (const [name, opp] of [['2티어(합6)', [C(2, 1), C(4, 1)]], ['3티어(합7)', [C(3, 1), C(4, 1)]],
                             ['4티어(합8)', [C(2, 1), C(6, 1)]], ['5티어(합9)', [C(3, 1), C(6, 1)]]])
    ok(`${name}에게는 진다`, S.compare(mirror, opp) === -1, String(S.compare(mirror, opp)));
  ok('7티어(합12)는 이긴다', S.compare(mirror, [C(6, 1), C(6, 2)]) === 1);
}

console.log('\n⑤ 저격 — 일반 10-10');
{
  const norm = [C(4, 1), C(6, 9)];
  ok('일반 스나이퍼로 인식', S.evaluate(norm).sniper === S.SNIPER_NORMAL);
  ok('1티어(합5)를 잡는다', S.compare(norm, [C(2, 1), C(3, 1)]) === 1);
  ok('0티어(합4)에게는 진다', S.compare(norm, [C(2, 1), C(2, 2)]) === -1,
     String(S.compare(norm, [C(2, 1), C(2, 2)])));
  for (const [name, opp] of [['2티어', [C(2, 1), C(4, 1)]], ['5티어', [C(3, 1), C(6, 1)]]])
    ok(`${name}에게는 진다`, S.compare(norm, opp) === -1);
  // 규칙서에 적힌 여섯 조합이 전부 일반 스나이퍼인가
  for (const [a, b] of [[C(4, 1), C(6, 9)], [C(4, 2), C(6, 8)], [C(4, 3), C(6, 7)],
                        [C(4, 5), C(6, 5)], [C(4, 6), C(6, 4)], [C(4, 7), C(6, 3)]])
    ok(`${a.kind}-${a.grade} + ${b.kind}-${b.grade} 는 스나이퍼`,
       S.sniperOf(a, b) === S.SNIPER_NORMAL);
}

console.log('\n⑥ 스나이퍼끼리는 코어 룰');
{
  const mirror = [C(4, 4), C(6, 6)], norm = [C(4, 1), C(6, 9)];
  // 둘 다 합10·뒷합10 이므로 제3원칙으로 간다. 4-1 이 4-4 보다 작다.
  ok('저격끼리는 저격이 안 통한다', S.compare(mirror, norm) === -1, String(S.compare(mirror, norm)));
  ok('더 작은 패를 쥔 쪽이 이긴다', S.compare(norm, mirror) === 1);
}

console.log('\n⑦ 0티어와 1티어');
{
  const boss = [C(2, 1), C(2, 2)];
  ok('0티어는 단 하나', all.filter((h) => h[0].kind + h[1].kind === 4).length === 1);
  ok('0티어는 거울쌍에게만 진다', (() => {
    let losses = 0;
    for (const h of all) {
      if (h[0].id === boss[0].id && h[1].id === boss[1].id) continue;
      if (S.compare(boss, h) === -1) losses++;
    }
    return losses === 1;
  })());
  // 1티어는 0티어와 스나이퍼 7개, 모두 8개에게 진다
  const t1 = [C(2, 1), C(3, 1)];
  let l1 = 0;
  for (const h of all) {
    if (h[0].id === t1[0].id && h[1].id === t1[1].id) continue;
    if (S.compare(t1, h) === -1) l1++;
  }
  ok('1티어는 8개에게만 진다 (0티어 + 스나이퍼 7)', l1 === 8, String(l1));
}

console.log('\n⑧ 판정이 앞뒤로 맞는가');
{
  // A 가 B 를 이기면 B 는 A 에게 져야 한다. 276×275 전부 확인한다.
  let bad = 0, ties = 0;
  for (const a of all) for (const b of all) {
    if (a === b) continue;
    const x = S.compare(a, b), y = S.compare(b, a);
    if (x !== -y) bad++;
    if (x === 0) ties++;
  }
  ok('모순되는 짝이 없다', bad === 0, `${bad}쌍`);
  // 같은 카드를 함께 쓰는 조합은 실제 판에서 나올 수 없으나, 판정 자체는 무승부가 없어야 한다
  ok('서로 다른 패는 무승부가 없다', ties === 0, `${ties}쌍`);
}

console.log('\n⑨ 나눠주기');
{
  const rngOf = (seed) => { let s = seed >>> 0;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const d = S.deal(rngOf(1));
  ok('두 사람에게 2장씩', d.hands.length === 2 && d.hands[0].length === 2 && d.hands[1].length === 2);
  const used = [...d.hands[0], ...d.hands[1]].map((c) => c.id);
  ok('같은 카드가 겹치지 않는다', new Set(used).size === 4);
  ok('나머지는 20장', d.rest.length === 20, String(d.rest.length));
  const again = S.deal(rngOf(1));
  ok('같은 시드면 같은 패', JSON.stringify(again.hands) === JSON.stringify(d.hands));
}

// xorshift 는 작은 씨앗으로 시작하면 처음 몇 개가 전부 0에 가깝게 나온다.
// 그대로 쓰면 "18% 확률" 이 늘 참이 되어 시험이 거짓말을 한다 — 미리 몇 번 돌린다.
const rngOf = (seed) => {
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 12; i++) next();
  return next;
};

const drive = (st, seed) => {           // 한 판을 끝까지 굴린다
  const r = rngOf(seed);
  let g = 0;
  while (!st.over && g++ < 80) {
    const a = S.aiAction(S.viewFor(st, st.turn), r);
    if (!a) break;
    if (!S.act(st, st.turn, a).ok) break;
  }
  return st;
};

console.log('\n⑩ 배팅 — 판을 여는 모양');
{
  for (const n of [2, 3, 4]) {
    const st = S.start({ seats: n, rand: rngOf(n * 11) });
    ok(`${n}인: 한 장씩 받는다`, st.hands.every((h) => h.length === 1));
    ok(`${n}인: 기본 단위를 모두 걸었다`, st.pot === S.ANTE * n, String(st.pot));
    ok(`${n}인: 밑천에서 빠졌다`, st.stack.every((s2) => s2 === S.BUY_IN - S.ANTE));
    ok(`${n}인: 선부터 시작한다`, st.turn === st.first);
    ok(`${n}인: 카드가 겹치지 않는다`,
       new Set(st.hands.flat().map((c) => c.id)).size === n);
  }
  const st = S.start({ seats: 5 });
  ok('다섯 자리는 넷으로 깎인다', st.n === 4, String(st.n));
  ok('한 자리는 둘로 늘린다', S.start({ seats: 1 }).n === 2);
}

console.log('\n⑪ 배팅 — 두 라운드');
{
  const st = S.start({ seats: 2, first: 0, rand: rngOf(5) });
  ok('처음엔 1라운드', st.round === 1);
  S.act(st, 0, 'check');
  ok('체크로는 판돈이 안 는다', st.pot === S.ANTE * 2, String(st.pot));
  ok('아직 1라운드', st.round === 1 && !st.over);
  const r = S.act(st, 1, 'check');
  ok('둘 다 체크하면 2라운드로', r.round === 2 && st.round === 2);
  ok('두 번째 장을 받았다', st.hands.every((h) => h.length === 2));
  ok('두 번째 장도 겹치지 않는다',
     new Set(st.hands.flat().map((c) => c.id)).size === 4);
  ok('낸 돈은 라운드마다 새로 센다', st.roundBet.every((b) => b === 0), JSON.stringify(st.roundBet));
  ok('판돈은 그대로 이어진다', st.pot === S.ANTE * 2);
  ok('2라운드도 선부터', st.turn === st.first);
  S.act(st, 0, 'check'); S.act(st, 1, 'check');
  ok('2라운드가 닫히면 공개', st.over && st.reason === 'showdown');
  ok('세 번째 라운드는 없다', st.round === 2);
}

console.log('\n⑫ 배팅 — 할 수 있는 행동');
{
  const st = S.start({ seats: 3, first: 0, rand: rngOf(7) });
  const a0 = S.actionsFor(st);
  ok('선은 체크할 수 있다', a0.includes('check'));
  ok('선은 삥을 놓을 수 있다', a0.includes('ping'));
  ok('걸린 돈이 없으면 콜은 없다', !a0.includes('call'));
  ok('언제든 죽을 수 있다', a0.includes('die'));
  ok('따당은 받을 돈이 있어야 한다', !a0.includes('ttadang'));

  S.act(st, 0, 'ping');
  const a1 = S.actionsFor(st);
  ok('뒷사람은 삥을 못 놓는다', !a1.includes('ping'));
  ok('뒷사람은 콜할 수 있다', a1.includes('call'));
  ok('뒷사람은 따당을 칠 수 있다', a1.includes('ttadang'));
  ok('하프·쿼터도 있다', a1.includes('half') && a1.includes('quarter'));
  ok('올인도 있다', a1.includes('allin'));

  S.act(st, 1, 'call');
  ok('콜한 사람은 잠긴다', st.locked[1] === true);
  S.act(st, 2, 'half');
  const a1b = S.actionsFor(st, 1);
  ok('잠긴 사람에게 다시 차례가 온다', st.turn === 0 || st.turn === 1);
  const back = S.actionsFor(st, st.turn);
  if (st.turn === 1) {
    ok('잠긴 사람은 콜·다이만', back.every((x) => x === 'call' || x === 'die'), JSON.stringify(back));
  } else {
    ok('아직 안 잠긴 선은 되받아칠 수 있다', back.some((x) => ['half', 'quarter', 'ttadang', 'allin'].includes(x)));
  }
  ok('없는 행동은 거절', S.act(st, st.turn, '올인').ok === false);
  ok('남의 차례에는 못 둔다', S.act(st, (st.turn + 1) % 3, 'die').ok === false);
}

console.log('\n⑬ 배팅 — 금액');
{
  const st = S.start({ seats: 2, first: 0, rand: rngOf(9) });
  ok('삥은 기본 단위', S.raiseAmounts(st, 0).ping === S.ANTE);
  S.act(st, 0, 'ping');
  const A = S.raiseAmounts(st, 1);
  ok('콜은 모자란 만큼', A.call === S.ANTE, String(A.call));
  // 하프 = 콜 + (콜을 받은 뒤 판돈)/2, 기본 단위로 내림
  const potAfterCall = st.pot + A.call;
  const unit = (x) => Math.max(S.ANTE, Math.floor(x / S.ANTE) * S.ANTE);
  ok('하프는 받은 뒤 판돈의 절반', A.half === A.call + unit(potAfterCall / 2),
     `${A.half} vs ${A.call + unit(potAfterCall / 2)}`);
  ok('쿼터는 그 절반', A.quarter === A.call + unit(potAfterCall / 4), String(A.quarter));
  ok('금액이 기본 단위로 떨어진다',
     [A.ping, A.half, A.quarter, A.ttadang].every((x) => x % S.ANTE === 0),
     JSON.stringify([A.ping, A.half, A.quarter, A.ttadang]));
  ok('따당은 앞사람의 두 배', A.ttadang === st.roundBet[0] * 2 - st.roundBet[1], String(A.ttadang));
  const before = st.pot, myStack = st.stack[1];
  S.act(st, 1, 'half');
  ok('건 만큼 판돈이 는다', st.pot === before + A.half, `${before} → ${st.pot}`);
  ok('건 만큼 밑천이 준다', st.stack[1] === myStack - A.half);
  ok('낸 돈이 기록된다', st.put[1] === S.ANTE + A.half);
}

console.log('\n⑭ 배팅 — 죽으면');
{
  const st = S.start({ seats: 3, first: 0, rand: rngOf(13) });
  S.act(st, 0, 'ping'); S.act(st, 1, 'die');
  ok('죽은 사람은 빠진다', st.alive[1] === false);
  ok('둘 남았으면 계속', st.over === false);
  ok('죽은 사람은 건너뛴다', st.turn === 2, String(st.turn));
  const potNow = st.pot, stack2 = st.stack[2];
  S.act(st, 2, 'die');
  ok('하나만 남으면 기권승', st.over && st.reason === 'fold' && st.winner === 0);
  ok('남은 사람이 판돈을 가져간다', st.stack[0] > 0 && st.pot === potNow);
  ok('죽은 사람은 낸 돈만 잃는다', st.stack[2] === stack2);
  const v = S.viewFor(st, 1);
  ok('기권승은 패를 안 깐다', v.seats.every((s2, i) => i === 1 || s2.cards === null));
}

console.log('\n⑮ 배팅 — 남의 패는 안 보인다');
{
  const st = S.start({ seats: 4, first: 0, rand: rngOf(17) });
  const v = S.viewFor(st, 2);
  ok('내 패만 실린다', v.seats.filter((s2) => s2.cards).length === 1);
  ok('그게 나다', v.seats[2].cards.length === 1);
  const json = JSON.stringify(v);
  let leaked = 0;
  for (let i = 0; i < 4; i++) if (i !== 2)
    for (const c of st.hands[i]) if (json.includes(`"id":${c.id}`)) leaked++;
  ok('남의 카드가 새지 않는다', leaked === 0, String(leaked));
  ok('몇 장 쥐었는지는 알려준다', v.seats.every((s2) => s2.count === 1));
  ok('첫 라운드엔 족보가 없다', v.myEval === null);
  drive(st, 21);
  if (st.reason === 'showdown') {
    const v2 = S.viewFor(st, 2);
    ok('공개로 끝나면 살아남은 패가 보인다',
       v2.seats.filter((s2) => s2.alive).every((s2) => s2.cards && s2.cards.length === 2));
    // 내 패는 죽었어도 나에게는 보인다 — 남의 죽은 패만 본다
    ok('죽은 사람 패는 그래도 안 깐다',
       v2.seats.filter((s2) => !s2.alive && s2.seat !== 2).every((s2) => s2.cards === null));
  } else {
    ok('기권승이면 아무 패도 안 깐다',
       S.viewFor(st, 2).seats.every((s2, i) => i === 2 || s2.cards === null));
    ok('(공개 판정은 다른 씨앗에서 본다)', true);
  }
}

console.log('\n⑯ 승부 — 저격이 도는 판');
{
  // 저격은 서열을 뒤집으므로 3인 이상에서 A>B>C>A 가 될 수 있다.
  // 정렬로 풀면 결과가 뒤죽박죽이 되니 "몇 명을 이겼나" 로 센다.
  const mk = (a, b) => [a, b].map((id) => ({ kind: Math.floor(id / 100), grade: id % 100, id }));
  const st = S.start({ seats: 3, first: 0 });
  st.hands = [
    mk(404, 606),          // 거울쌍 10 — 0·1티어를 잡는다
    mk(201, 202),          // 지배자 (합 4)
    mk(301, 302),          // 중간계 (합 6)
  ];
  const w = S.resolve(st);
  ok('저격수가 지배자를 잡는다', S.compare(st.hands[0], st.hands[1]) > 0);
  ok('그런데 중간계에게는 진다', S.compare(st.hands[0], st.hands[2]) < 0);
  ok('지배자는 중간계를 이긴다', S.compare(st.hands[1], st.hands[2]) > 0);
  ok('순환이 생겨도 승자가 하나로 정해진다', w === 0 || w === 1 || w === 2, String(w));
  let wins = 0;
  for (let i = 0; i < 3; i++) if (i !== w && S.compare(st.hands[w], st.hands[i]) > 0) wins++;
  let best = 0;
  for (let i = 0; i < 3; i++) {
    let c = 0;
    for (let j = 0; j < 3; j++) if (i !== j && S.compare(st.hands[i], st.hands[j]) > 0) c++;
    if (c > best) best = c;
  }
  ok('가장 많이 이긴 사람이 가져간다', wins === best, `${wins} vs ${best}`);
}

console.log('\n⑰ 선은 이긴 사람이 잡는다');
{
  for (const seed of [3, 8, 14, 25]) {
    const st = S.start({ seats: 3, first: 1, rand: rngOf(seed) });
    drive(st, seed + 100);
    ok(`씨앗 ${seed}: 선이 승자에게 넘어간다`, st.first === st.winner,
       `${st.first} vs ${st.winner}`);
  }
}

console.log('\n⑱ 2000판을 돌려도 돈이 안 샌다');
{
  let bad = 0, unfinished = 0, folds = 0, shows = 0, r2 = 0, allin = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const n = 2 + (seed % 3);
    const st = S.start({ seats: n, rand: rngOf(seed) });
    const total = st.stack.reduce((a, b) => a + b, 0) + st.pot;
    drive(st, seed * 3);
    if (!st.over) { unfinished++; continue; }
    if (st.stack.reduce((a, b) => a + b, 0) !== total) bad++;   // 판돈이 새거나 생겨나면
    if (st.stack.some((x) => x < 0)) bad++;                     // 밑천보다 많이 걸었으면
    if (st.pot !== st.put.reduce((a, b) => a + b, 0)) bad++;    // 판돈이 낸 돈 합과 다르면
    if (st.winner === null) bad++;
    if (st.reason === 'fold') folds++; else shows++;
    if (st.round === 2) r2++;
    if (st.log.some((l) => l.action === 'allin')) allin++;
  }
  ok('2000판 모두 끝난다', unfinished === 0, `${unfinished}판 안 끝남`);
  ok('돈이 새지 않는다', bad === 0, `${bad}판 어긋남`);
  ok('기권승도 나온다', folds > 0, String(folds));
  ok('공개까지도 간다', shows > 0, String(shows));
  ok('2라운드까지 가는 판이 대부분', r2 > shows, `${r2}`);
  ok('올인도 나온다', allin > 0, String(allin));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
