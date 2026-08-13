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

console.log('\n⑩ 배팅 — 두 장 완전 비공개');
{
  const st = S.deal2(rngOf(5));
  ok('각자 두 장', st.hands[0].length === 2 && st.hands[1].length === 2);
  ok('네 장이 서로 다르다',
     new Set([...st.hands[0], ...st.hands[1]].map((c) => c.id)).size === 4);
  ok('앤티가 들어가 있다', st.pot === S.ANTE * 2, String(st.pot));
  ok('선이 정해져 있다', st.turn === 0 || st.turn === 1);

  const v = S.viewFor(st, 0);
  ok('내 패는 두 장 다 보인다', v.myHand.length === 2);
  ok('상대 패는 안 보인다', v.oppHand === null);
  ok('뒷면 장수만 알려준다', v.oppCount === 2);
  ok('상대 족보도 안 알려준다', v.oppEval === null);
  ok('내 족보는 처음부터 보인다', !!v.myEval && typeof v.myEval.name === 'string');
}

console.log('\n⑪ 배팅 — 한 라운드로 끝난다');
{
  const st = S.deal2(rngOf(7));
  const a = st.turn, b = 1 - a;
  S.act(st, a, 'check');
  ok('체크로는 판돈이 안 는다', st.pot === S.ANTE * 2, String(st.pot));
  ok('아직 안 끝났다', st.over === false);
  const r = S.act(st, b, 'check');
  ok('양쪽 체크면 바로 공개', r.showdown === true && st.over === true);
  ok('공개로 끝났다고 적힌다', st.reason === 'showdown');
  ok('승자가 족보와 맞는다',
     st.winner === (S.compare(st.hands[0], st.hands[1]) > 0 ? 0 : 1), String(st.winner));
  const v = S.viewFor(st, 0);
  ok('그때 상대 패가 보인다', !!v.oppHand && v.oppHand.length === 2);
  ok('상대 족보도 온다', !!v.oppEval);
}

console.log('\n⑫ 배팅 — 콜·레이즈·폴드');
{
  let st = S.deal2(rngOf(9));
  let a = st.turn, b = 1 - a;
  S.act(st, a, 'bet');
  ok('배팅하면 판돈이 는다', st.pot === S.ANTE * 2 + S.BET_UNIT, String(st.pot));
  ok('차례가 넘어간다', st.turn === b);
  ok('낼 돈을 알려준다', S.viewFor(st, b).toCall === S.BET_UNIT, String(S.viewFor(st, b).toCall));
  S.act(st, b, 'call');
  ok('콜하면 양쪽이 같아진다', st.bet[0] === st.bet[1], JSON.stringify(st.bet));
  ok('판돈은 둘이 낸 합', st.pot === st.bet[0] + st.bet[1]);
  ok('콜로 공개까지 간다', st.over === true && st.reason === 'showdown');

  // 폴드
  st = S.deal2(rngOf(11));
  a = st.turn; b = 1 - a;
  S.act(st, a, 'bet');
  S.act(st, b, 'fold');
  ok('폴드하면 바로 끝난다', st.over === true && st.reason === 'fold');
  ok('안 죽은 쪽이 이긴다', st.winner === a, String(st.winner));
  // 죽은 판은 패를 안 깐다 — 다음 판에 읽힌다
  ok('폴드로 끝나면 패를 안 깐다', S.viewFor(st, b).oppHand === null);

  // 레이즈 상한
  st = S.deal2(rngOf(13));
  S.act(st, st.turn, 'bet');
  for (let i = 0; i < 5; i++) {
    if (!S.actionsFor(st).includes('raise')) break;
    S.act(st, st.turn, 'raise');
  }
  ok('레이즈 상한에 걸리면 못 올린다', !S.actionsFor(st).includes('raise'),
     JSON.stringify(S.actionsFor(st)));
  ok('그래도 콜·폴드는 된다',
     S.actionsFor(st).includes('call') && S.actionsFor(st).includes('fold'));
}

console.log('\n⑬ 배팅 — 못 하는 행동은 거절');
{
  const st = S.deal2(rngOf(15));
  const a = st.turn, b = 1 - a;
  ok('내 차례가 아니면 거절', S.act(st, b, 'check').ok === false);
  ok('없는 행동도 거절', S.act(st, a, 'allin').ok === false);
  ok('아직 낼 돈이 없으면 콜 못 한다', S.act(st, a, 'call').ok === false);
  const before = st.pot;
  S.act(st, b, 'bet');
  ok('거절된 수는 판돈을 안 건드린다', st.pot === before, `${before} → ${st.pot}`);
  S.act(st, a, 'check'); S.act(st, b, 'check');
  ok('끝난 판에는 더 못 둔다', S.act(st, st.winner, 'bet').ok === false);
}

console.log('\n⑭ 300판을 돌려도 판돈이 안 샌다');
{
  let bad = 0, folds = 0, shows = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const st = S.deal2(rngOf(seed));
    let guard = 0;
    while (!st.over && guard++ < 40) {
      const acts = S.actionsFor(st);
      // 폴드만 고르면 공개까지 가는 판이 안 나온다 — 네 판에 한 번만 죽는다
      const pool = (seed + guard) % 4 === 0 ? acts : acts.filter((x) => x !== 'fold');
      S.act(st, st.turn, pool[(seed + guard) % pool.length]);
    }
    if (!st.over) { bad++; continue; }
    if (st.pot !== st.bet[0] + st.bet[1]) bad++;
    if (st.winner === null) bad++;              // 무승부는 나올 수 없다
    if (st.reason === 'fold') folds++; else shows++;
  }
  ok('300판 모두 정상으로 끝난다', bad === 0, `${bad}판 이상`);
  ok('폴드로 끝난 판이 있다', folds > 0, String(folds));
  ok('공개로 끝난 판도 있다', shows > 0, String(shows));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
