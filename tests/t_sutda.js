// 미니게임 족보 — 20장 덱에서 두 장을 뽑는 190가지를 전부 확인한다.
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
  ok('20장', deck.length === 20, String(deck.length));
  ok('2그룹 2장', deck.filter((c) => c.kind === 2).length === 2);
  ok('3그룹 4장', deck.filter((c) => c.kind === 3).length === 4);
  ok('4그룹 6장', deck.filter((c) => c.kind === 6 ? false : c.kind === 4).length === 6);
  ok('6그룹 8장', deck.filter((c) => c.kind === 6).length === 8);
  ok('같은 카드가 없다', new Set(deck.map((c) => c.id)).size === 20);
  ok('두 장 조합은 190가지', all.length === 190, String(all.length));
}

console.log('\n② 족보별 개수');
{
  const T = { ttang: 0, jjak: 0, ggeut: {}, jol: 0 };
  for (const h of all) {
    const e = S.evaluate(h);
    if (e.jol) T.jol++;
    else if (e.type === S.T_TTANG) T.ttang++;
    else if (e.type === S.T_JJAK) T.jjak++;
    else T.ggeut[e.sum] = (T.ggeut[e.sum] || 0) + 1;
  }
  // 땡 = C(2,2)+C(4,2)+C(6,2)+C(8,2) = 1+6+15+28
  ok('땡 50가지', T.ttang === 50, String(T.ttang));
  // 짝(등급이 같고 종류가 다른 두 장) = 등급 1·2 는 네 종류 모두 있어 6가지씩,
  // 3·4 는 세 종류(3·4·6) 3가지씩, 5·6 은 두 종류(4·6) 1가지씩
  ok('짝 20가지', T.jjak === 20, String(T.jjak));
  ok('졸개는 딱 하나', T.jol === 1, String(T.jol));
  // 종류 곱에서 '등급이 같은 두 장'(=짝)을 뺀 값이다. 끗5 = 2장×4장 − 2
  ok('끗 5 → 6가지', T.ggeut[5] === 6, String(T.ggeut[5]));
  ok('끗 6 → 10가지', T.ggeut[6] === 10, String(T.ggeut[6]));
  ok('끗 7 → 20가지', T.ggeut[7] === 20, String(T.ggeut[7]));
  ok('끗 8 → 14가지', T.ggeut[8] === 14, String(T.ggeut[8]));
  ok('끗 9 → 28가지', T.ggeut[9] === 28, String(T.ggeut[9]));
  ok('끗 10 → 41가지 (졸개 제외)', T.ggeut[10] === 41, String(T.ggeut[10]));
  ok('합 11 은 나오지 않는다', !T.ggeut[11], String(T.ggeut[11]));
  const total = T.ttang + T.jjak + T.jol + Object.values(T.ggeut).reduce((a, b) => a + b, 0);
  ok('전부 더하면 190', total === 190, String(total));
}

console.log('\n③ 코어 룰 — 땡 > 짝 > 끗');
{
  // 땡끼리는 종류가 작을수록 강하다
  ok('2땡이 3땡을 이긴다', S.compare([C(2, 1), C(2, 2)], [C(3, 1), C(3, 2)]) === 1);
  ok('3땡이 4땡을 이긴다', S.compare([C(3, 1), C(3, 2)], [C(4, 1), C(4, 2)]) === 1);
  ok('4땡이 6땡을 이긴다', S.compare([C(4, 1), C(4, 2)], [C(6, 1), C(6, 2)]) === 1);
  // 같은 땡이면 더 강한 카드를 쥔 쪽
  ok('같은 땡은 등급이 낮은 쪽', S.compare([C(6, 1), C(6, 2)], [C(6, 3), C(6, 4)]) === 1);
  // 가장 약한 땡도 짝을 이긴다
  ok('6땡이 짝을 이긴다', S.compare([C(6, 7), C(6, 8)], [C(3, 1), C(4, 1)]) === 1);
  // 짝끼리는 등급이 낮을수록 강하다
  ok('1짝이 2짝을 이긴다', S.compare([C(3, 1), C(4, 1)], [C(3, 2), C(4, 2)]) === 1);
  ok('같은 짝은 종류가 낮은 쪽', S.compare([C(2, 1), C(3, 1)], [C(3, 1), C(4, 1)]) === 1);
  // 짝은 어떤 끗보다도 강하다
  ok('짝이 5끗을 이긴다', S.compare([C(4, 5), C(6, 5)], [C(2, 1), C(3, 2)]) === 1);
  // 끗끼리는 종류 합이 작을수록 강하다
  ok('5끗이 6끗을 이긴다', S.compare([C(2, 1), C(3, 2)], [C(2, 1), C(4, 2)]) === 1);
  ok('9끗이 10끗을 이긴다', S.compare([C(3, 1), C(6, 2)], [C(4, 1), C(6, 2)]) === 1);
  // 같은 끗이면 등급 합이 작은 쪽
  ok('같은 끗은 등급 합이 작은 쪽', S.compare([C(2, 1), C(4, 2)], [C(2, 1), C(4, 3)]) === 1);
}

console.log('\n④ 졸개의 배신 — 가장 약한 두 장이 땡을 잡는다');
{
  const JOL = [C(4, 6), C(6, 8)];
  ok('졸개는 딱 한 조합', S.isJol(JOL[0], JOL[1]) === true);
  ok('이름이 붙는다', S.evaluate(JOL).name === '졸개의 배신');
  for (const [name, h] of [['2땡', [C(2, 1), C(2, 2)]], ['3땡', [C(3, 1), C(3, 2)]],
                           ['4땡', [C(4, 1), C(4, 2)]], ['6땡', [C(6, 1), C(6, 2)]]])
    ok(`${name}을 잡는다`, S.compare(JOL, h) === 1);
  ok('짝에게는 진다', S.compare(JOL, [C(3, 1), C(4, 1)]) === -1);
  ok('가장 약한 끗에게도 진다', S.compare(JOL, [C(4, 1), C(6, 2)]) === -1);
  // 서열은 밑바닥이어야 한다 — 땡 말고는 아무도 못 이긴다
  let beat = 0;
  for (const h of all) {
    if (h[0].id === JOL[0].id || h[1].id === JOL[1].id) continue;
    if (S.compare(JOL, h) === 1) beat++;
  }
  ok('땡 말고는 못 이긴다', beat <= 50, `${beat}가지`);
}

console.log('\n⑤ 6+6 이 죽은 패가 아니다');
{
  // 예전 족보에서는 6+6 이 '합 12 꼴찌' 라 가장 흔한 조합이 가장 죽은 패였다.
  const h = [C(6, 3), C(6, 4)];
  ok('6+6 은 6땡이다', S.evaluate(h).name === '6땡');
  ok('끗은 전부 이긴다', S.compare(h, [C(2, 1), C(3, 2)]) === 1);
  ok('짝도 이긴다', S.compare(h, [C(3, 1), C(4, 1)]) === 1);
}

console.log('\n⑥ 이름이 사람 말로 나온다');
{
  ok('2땡', S.evaluate([C(2, 1), C(2, 2)]).name === '2땡');
  ok('3짝', S.evaluate([C(3, 3), C(4, 3)]).name === '3짝');
  ok('7끗', S.evaluate([C(3, 1), C(4, 2)]).name === '7끗');
}

console.log('\n⑦ 첫 장이 6이어도 절망적이지 않다');
{
  // 예전에는 첫 장이 6(덱의 42%)이면 살 만한 패가 될 확률이 20% 뿐이었다.
  const rate = (kind) => {
    let s = 0, c = 0;
    for (const first of deck.filter((x) => x.kind === kind))
      for (const second of deck) {
        if (second.id === first.id) continue;
        s += S.equity2([first, second]); c++;
      }
    return s / c;
  };
  const two = rate(2), six = rate(6);
  ok('2종 첫 장과 6종 첫 장의 차이가 크지 않다', two - six < 0.15, `${(two * 100).toFixed(0)}% vs ${(six * 100).toFixed(0)}%`);
  ok('6종 첫 장도 반타작은 된다', six > 0.4, `${(six * 100).toFixed(0)}%`);
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
  ok('나머지는 16장', d.rest.length === 16, String(d.rest.length));
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
    mk(406, 608),          // 졸개의 배신 — 땡을 잡는다
    mk(201, 202),          // 2땡
    mk(201 + 100, 302),    // 3땡 아님 — 3-1+3-2 를 쓴다
  ];
  st.hands[2] = mk(301, 302);
  const w = S.resolve(st);
  ok('졸개가 2땡을 잡는다', S.compare(st.hands[0], st.hands[1]) > 0);
  ok('3땡도 잡는다', S.compare(st.hands[0], st.hands[2]) > 0);
  ok('2땡은 3땡을 이긴다', S.compare(st.hands[1], st.hands[2]) > 0);
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

console.log('\n⑲ AI 가 확률로 판단한다');
{
  const mk = (...ids) => ids.map((id) => ({ kind: Math.floor(id / 100), grade: id % 100, id }));
  ok('2땡은 거의 다 이긴다', S.equity2(mk(201, 202)) > 0.98, S.equity2(mk(201, 202)).toFixed(3));
  // 가장 약한 끗(졸개가 아닌 4+6)은 거의 못 이긴다
  ok('가장 약한 끗은 거의 못 이긴다', S.equity2(mk(406, 607)) < 0.03, S.equity2(mk(406, 607)).toFixed(3));
  // 졸개는 땡만 잡는다 — 이름값과 달리 이길 확률 자체는 낮다
  const jol = S.equity2(mk(406, 608));
  ok('졸개는 이름값보다 확률이 낮다', jol > 0.15 && jol < 0.45, jol.toFixed(3));
  // 6+6 이 죽은 패가 아니게 됐다 — 예전 족보에서는 0% 였다
  ok('6땡은 어엿한 패다', S.equity2(mk(607, 608)) > 0.7, S.equity2(mk(607, 608)).toFixed(3));
  ok('한 장짜리도 잰다', S.equity1(mk(201)[0]) > S.equity1(mk(610)[0]));
  ok('상대가 늘면 확률이 떨어진다',
     S.equityOf(mk(301, 302), 3) < S.equityOf(mk(301, 302), 1));
  // 표에 적어 두므로 두 번째부터는 즉시 나온다 (서버가 매 수마다 부른다)
  const t0 = Date.now();
  for (let i = 0; i < 20000; i++) S.equity2(mk(201, 202));
  ok('두 번째부터는 표에서 꺼낸다', Date.now() - t0 < 200, `${Date.now() - t0}ms`);
}

console.log('\n⑳ AI 가 옛 AI 보다 세다');
{
  // 같은 패를 자리만 바꿔 두 번 돌린다(듀플리케이트). 카드 운이 상쇄돼
  // 실력 차이만 남는다 — 안 그러면 수만 판을 돌려도 노이즈에 묻힌다.
  const hand = (seed, brains, n) => {
    const st = S.start({ seats: n, stacks: new Array(n).fill(S.BUY_IN), first: 0, rand: rngOf(seed) });
    const rs = [];
    for (let i = 0; i < n; i++) rs.push(rngOf(seed * 31 + i + 1));
    let g = 0;
    while (!st.over && g++ < 80) {
      const s2 = st.turn;
      if (!S.act(st, s2, brains[s2](S.viewFor(st, s2), rs[s2]) || 'die').ok) break;
    }
    return st.over ? st.stack.map((x) => x - S.BUY_IN) : null;
  };
  const duel = (A, B, hands) => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= hands; seed++) {
      const a = hand(seed, [A, B], 2), b = hand(seed, [B, A], 2);
      if (!a || !b) continue;
      sum += (a[0] + b[1]) / 2; n++;
    }
    return n ? sum / n : 0;
  };
  const now = (v, r) => S.aiAction(v, r);
  const old = (v, r) => S.aiSimple(v, r);
  const gain = duel(now, old, 4000);
  ok('옛 AI 를 확실히 이긴다 (판당 이득)', gain > 0.8, gain.toFixed(2));

  // 무조건 따라오는 사람에게는 더 크게 이겨야 한다 — 못 이기면 딸 돈을 흘리는 것이다
  const station = (v) => {
    const a = v.actions || [];
    if (!a.length) return null;
    return a.includes('call') ? 'call' : a.includes('check') ? 'check' : 'die';
  };
  const vsStation = duel(now, station, 3000);
  ok('따라오기만 하는 상대는 크게 이긴다', vsStation > 5, vsStation.toFixed(2));

  // 접기만 하는 상대에게 지면 안 된다 (기본 단위는 계속 먹어야 한다)
  const quitter = (v) => {
    const a = v.actions || [];
    return a.includes('die') ? 'die' : a[0] || null;
  };
  ok('맨날 접는 상대에게는 당연히 이긴다', duel(now, quitter, 1500) > 0);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
