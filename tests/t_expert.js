// 전문가 AI — 개선이 되돌아가지 않게 못 박는다.
//
// 실력은 "코드가 이렇게 생겼다" 로는 못 재므로 실제로 붙여서 잰다.
// tools/expert3-baseline.js 는 개선 전 사본이다. 새 전문가가 그보다 확실히
// 세야 한다. 좌석·선공을 모두 바꿔 같은 덱으로 치르므로 자리 이점은 상쇄된다.
//
// 잡음 크기: 같은 버전끼리 1200판을 여러 시드로 돌리면 평균 50.3%, 표준편차
// 0.8%p 다. 그래서 53% 를 넘으면 우연으로 보기 어렵다(3σ 이상).
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { duel } = require(path.join(ROOT, 'tools', 'duel.js'));
const NEW = require(path.join(ROOT, 'expert3.js'));
const OLD = require(path.join(ROOT, 'tools', 'expert3-baseline.js'));

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };
const C = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });

console.log('\n① 같은 종류가 여러 장이면 그만큼 값나가는가');
{
  // 예전엔 카드마다 값을 매겨 Math.max 를 써서, 6이 두 장이든 한 장이든
  // 똑같이 0.167 이었다. 두 걸음을 한 걸음으로 센 것이다.
  const one = NEW.wantValue([C(6, 3)], [], 6);
  const two = NEW.wantValue([C(6, 3), C(6, 7)], [], 6);
  ok('6 두 장 > 6 한 장', two > one + 0.1, `${one.toFixed(3)} → ${two.toFixed(3)}`);

  const o4 = NEW.wantValue([C(4, 2)], [], 4);
  const t4 = NEW.wantValue([C(4, 2), C(4, 5)], [], 4);
  ok('4 두 장 > 4 한 장', t4 > o4 + 0.1, `${o4.toFixed(3)} → ${t4.toFixed(3)}`);

  // 옛 버전은 실제로 같았다 — 이 사실을 남겨 둔다
  const oldOne = OLD.wantValue([C(6, 3)], [], 6);
  const oldTwo = OLD.wantValue([C(6, 3), C(6, 7)], [], 6);
  ok('옛 버전은 같았다 (회귀 확인용)', Math.abs(oldOne - oldTwo) < 1e-9,
     `${oldOne.toFixed(3)} vs ${oldTwo.toFixed(3)}`);

  // 세트를 그 자리에서 완성하는 경매품은 최고값
  ok('완성시키는 경매품은 1.0', NEW.wantValue([C(2, 1), C(2, 2)], [], 2) === 1);
  ok('이미 완성한 종류는 안 센다', NEW.wantValue([C(2, 1)], [C(2, 1), C(2, 2)], 6) === 0);
}

console.log('\n② 상대를 막는 값도 장수를 세는가');
{
  const one = NEW.denyValue([C(6, 3)], []);
  const two = NEW.denyValue([C(6, 3), C(6, 7)], []);
  ok('상대에게 두 장 넘기는 게 더 아프다', two > one, `${one.toFixed(3)} → ${two.toFixed(3)}`);
  ok('상대 완성 카드는 최우선 차단', NEW.denyValue([C(2, 1), C(2, 2)], []) >= 0.9);
  ok('막는 값이 먹는 값보다 낮다',
     NEW.denyValue([C(6, 3), C(6, 7)], []) < NEW.wantValue([C(6, 3), C(6, 7)], [], 6));
}

console.log('\n③ 첫 목표가 가장 빡빡한 세트가 아닌가');
{
  // 예전엔 빈손이면 늘 2를 골랐다. 2세트는 덱에 두 장뿐이라 둘 다 먹어야 하는
  // 가장 빡빡한 길인데도 그랬고, 그래서 첫 수가 늘 똑같았다.
  ok('옛 버전은 2를 골랐다 (회귀 확인용)', OLD.feasibleTarget([], []) === 2, String(OLD.feasibleTarget([], [])));
  ok('새 버전은 2를 안 고른다', NEW.feasibleTarget([], []) !== 2, String(NEW.feasibleTarget([], [])));

  // 상대가 다 가져가 불가능해진 종류는 안 고른다
  const dead = NEW.feasibleTarget([], [C(2, 1), C(2, 2)]);
  ok('불가능해진 종류는 피한다', dead !== 2, String(dead));

  // 이미 모은 게 있으면 그쪽을 우선한다
  ok('모은 쪽을 이어간다', NEW.feasibleTarget([C(3, 1), C(3, 2)], []) === 3,
     String(NEW.feasibleTarget([C(3, 1), C(3, 2)], [])));
}

console.log('\n④ 6 두 장이 걸린 판에서 포기하지 않는가');
{
  // 사용자가 짚은 그 장면. 옛 전문가는 가장 약한 카드를 던져 사실상 포기했다.
  const hand = [C(2, 1), C(3, 2), C(4, 3), C(6, 4), C(6, 9), C(3, 5)];
  const view = () => ({
    hand, myAcq: [], oppAcq: [], center: C(6, 3), offered: C(6, 7),
    deckLeft: 9, oppHandLen: 6, isAuctioneer: true, auctionType: 'open', visOpp: null,
  });
  // 값이 작을수록 센 카드다 (2-1 = 201 이 최강, 6-x 가 최약).
  const strength = (c) => c.kind * 100 + c.grade;
  const avg = (E) => {
    let sum = 0;
    for (let i = 0; i < 120; i++) sum += strength(E.bidV3(view(), E.createMem()));
    return sum / 120;
  };
  const nw = avg(NEW), ow = avg(OLD);
  console.log(`     평균 배팅 세기 — 옛 ${ow.toFixed(0)} · 새 ${nw.toFixed(0)} (작을수록 셈)`);
  ok('옛 버전보다 확실히 센 카드를 낸다', nw < ow - 100, `${ow.toFixed(0)} → ${nw.toFixed(0)}`);
  ok('6 계열을 던지고 마는 수준이 아니다', nw < 600, `${nw.toFixed(0)}`);
  ok('옛 버전은 6 계열을 던졌다 (회귀 확인용)', ow >= 600, `${ow.toFixed(0)}`);
}

console.log('\n⑤ 같은 판에서 늘 같은 수를 두지 않는가');
{
  // 1등만 두면 읽힌다. 비슷한 후보 중에서 고르게 해 수가 갈리게 했다.
  // 우열이 뚜렷한 판에서는 갈리지 않는 게 맞다 — 좋은 수가 하나뿐이니까.
  // 그래서 여러 상황을 돌려 "갈리는 판이 얼마나 되는가" 로 본다.
  const { dealFrom, rngOf } = require(path.join(ROOT, 'tools', 'duel.js'));
  const variedIn = (E) => {
    let varied = 0;
    for (let t = 0; t < 40; t++) {
      const { deck, h1 } = dealFrom(rngOf(9000 + t * 131));
      const v = { hand: h1, myAcq: [], oppAcq: [], center: deck[0], offered: null,
                  deckLeft: 11, oppHandLen: 6, isAuctioneer: true };
      const seen = new Set();
      for (let i = 0; i < 40; i++) seen.add(E.offerV3(v, E.createMem()).id);
      if (seen.size >= 2) varied++;
      // 아무거나 뽑으면 실력이 무너진다 — 후보가 손패 전체로 퍼지면 안 된다
      if (seen.size > 3) return -1;
    }
    return varied;
  };
  const nv = variedIn(NEW), ov = variedIn(OLD);
  console.log(`     40개 상황 중 수가 갈린 판 — 옛 ${ov} · 새 ${nv}`);
  ok('갈리는 판이 생겼다', nv > 0, `${nv}/40`);
  ok('옛 버전은 하나도 없었다 (회귀 확인용)', ov === 0, `${ov}/40`);
  ok('아무거나 뽑지는 않는다 (후보 3개 이하)', nv > 0);
  ok('그렇다고 매번 흔들리지도 않는다', nv < 40, `${nv}/40`);
}

console.log('\n⑥ 실제로 더 세게 두는가 (맞대결)');
{
  // 좌석·선공을 모두 바꿔 같은 덱으로 치른다 — 자리 이점은 상쇄된다.
  const r = duel(NEW, OLD, 1600, 20260812);
  const dec = r.a + r.b;
  const win = r.a / dec * 100;
  console.log(`     ${r.n}판 · 평균 ${(r.turns / r.n).toFixed(1)}턴 · 세트승 ${(r.bySet / r.n * 100).toFixed(0)}%`);
  console.log(`     새 전문가 ${r.a}승 / 옛 전문가 ${r.b}승 / 무 ${r.draw}  →  ${win.toFixed(1)}%`);
  // 같은 버전끼리는 평균 50.3%, 표준편차 0.8%p. 53% 를 넘으면 3σ 이상이다.
  ok('기준선보다 확실히 세다 (53% 초과)', win > 53, `${win.toFixed(1)}%`);
  ok('판이 정상적으로 끝난다 (세트승 90% 이상)', r.bySet / r.n > 0.9,
     `${(r.bySet / r.n * 100).toFixed(0)}%`);
  ok('무승부가 드물다', r.draw / r.n < 0.06, `${(r.draw / r.n * 100).toFixed(1)}%`);
}

console.log('\n⑦ 사람이 기다릴 만한가');
{
  const hand = [C(2, 1), C(3, 2), C(4, 3), C(6, 4), C(6, 9), C(3, 5)];
  const late = { hand, myAcq: [], oppAcq: [], center: C(4, 6), offered: C(3, 3),
                 deckLeft: 5, oppHandLen: 6, isAuctioneer: true, auctionType: 'open', visOpp: null };
  const mem = NEW.createMem();
  const t = Date.now();
  for (let i = 0; i < 60; i++) NEW.bidV3(late, mem);
  const ms = (Date.now() - t) / 60;
  console.log(`     종반 배팅 1회 ${ms.toFixed(1)}ms`);
  ok('종반 판단이 100ms 안', ms < 100, `${ms.toFixed(1)}ms`);
}

console.log('\n⑧ 치팅하지 않는가');
{
  // 전문가는 자기 손패와 공개 정보만 봐야 한다. 상대 손패를 인자로 받으면 안 된다.
  const src = require('fs').readFileSync(path.join(ROOT, 'expert3.js'), 'utf8');
  ok('상대 손패를 직접 받지 않는다', !/view\.oppHand\b/.test(src));
  ok('덱을 직접 들여다보지 않는다', !/view\.deck\b/.test(src));
  ok('상대 손패는 표본으로만 추정한다', /function sampleOppHand/.test(src));
  ok('공개된 장수만 안다', /oppHandLen/.test(src));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
