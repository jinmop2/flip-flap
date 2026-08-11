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

console.log('\n⑦ 경매 방식을 제대로 고르는가');
{
  // 클로즈는 내 배팅을 상대가 먼저 본다 — 최소 승리를 당한다.
  // 전수로 재 보니 진행자에게 거의 언제나 손해였다:
  //   항상 오픈 vs 항상 클로즈 76.7% · 항상 오픈 vs 옛 규칙 54.7%
  // 옛 규칙은 마지막 두 갈래가 똑같이 'closed' 를 반환해 조건 하나가 죽어 있었다.
  const src = require('fs').readFileSync(path.join(ROOT, 'expert3.js'), 'utf8');
  const fn = src.slice(src.indexOf('function typeV3'), src.indexOf('function typeV3') + 2200);   // 함수 전체가 들어가게
  ok('죽은 갈래가 없다', !/return 'closed';\s*\/\/[^\n]*\n\s*return 'closed';/.test(fn));

  const C2 = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });
  const mid = { myAcq: [C2(4, 1)], oppAcq: [C2(3, 1)], center: C2(4, 2), offered: C2(4, 5),
                hand: [], deckLeft: 9, oppHandLen: 6, isAuctioneer: true };
  ok('갖고 싶으면 오픈', NEW.typeV3(mid, NEW.createMem()) === 'open');

  const junk = { myAcq: [C2(4, 1), C2(4, 2), C2(4, 3)], oppAcq: [C2(4, 4)],
                 center: C2(4, 6), offered: C2(4, 7), hand: [], deckLeft: 9,
                 oppHandLen: 6, isAuctioneer: true };
  void junk;

  // 첫 턴은 무조건 오픈 (정보 없는 클로즈는 일방적으로 당한다)
  const first = { myAcq: [], oppAcq: [], center: C2(6, 3), offered: C2(6, 7),
                  hand: [], deckLeft: 11, oppHandLen: 6, isAuctioneer: true };
  ok('첫 턴은 오픈', NEW.typeV3(first, NEW.createMem()) === 'open');

  // 옛 버전은 클로즈를 훨씬 자주 골랐다
  const { dealFrom, rngOf } = require(path.join(ROOT, 'tools', 'duel.js'));
  const closedRate = (E) => {
    let c = 0;
    for (let t = 0; t < 200; t++) {
      const { deck, h1 } = dealFrom(rngOf(3000 + t * 97));
      const v = { hand: h1.slice(1), myAcq: [C2(4, 1)], oppAcq: [C2(3, 1)],
                  center: deck[0], offered: h1[0], deckLeft: 9, oppHandLen: 6, isAuctioneer: true };
      if (E.typeV3(v, E.createMem()) === 'closed') c++;
    }
    return c / 200 * 100;
  };
  const nc = closedRate(NEW), oc = closedRate(OLD);
  console.log(`     클로즈 비율 — 옛 ${oc.toFixed(0)}% · 새 ${nc.toFixed(0)}%`);
  ok('클로즈를 덜 고른다', nc <= oc, `${oc.toFixed(0)}% → ${nc.toFixed(0)}%`);
  ok('그래도 아예 없애진 않았다 (규칙이 살아 있음)', /myVal < 0\.25\) return 'closed'/.test(fn));
  ok('세트 근접 시 변칙 클로즈를 섞는다', /near && Math\.random\(\) < 0\.10/.test(fn));
}

console.log('\n⑧ 져도 상대 카드를 받는다는 걸 아는가');
{
  // 배팅 카드는 낙찰 여부와 무관하게 교환된다. 예전엔 진 경우를 0점으로 둬서,
  // "일부러 세게 불러 상대의 강카드를 빼내는" 수가 아예 안 보였다.
  const src = require('fs').readFileSync(path.join(ROOT, 'expert3.js'), 'utf8');
  ok('받는 카드 값을 센다', /function recvValue/.test(src));
  ok('진 경우가 0 이 아니다', /win \? prizeVal : recvValue\(/.test(src));
  ok('옛 버전은 0 이었다 (회귀 확인용)',
     /\(win \? prizeVal : 0\)/.test(require('fs').readFileSync(path.join(ROOT, 'tools', 'expert3-baseline.js'), 'utf8')));
}

console.log('\n⑨ 졸개의 배신을 쓰는가');
{
  // 상대가 2-1 을 쥔 걸 알면 6-10 이 최약이 아니라 필승패가 된다.
  // 카드 카운팅(knownOpp) + 몬테카를로가 이걸 스스로 찾아낸다.
  const C2 = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });
  const hand = [C2(3, 2), C2(4, 3), C2(6, 4), C2(6, 10), C2(3, 5), C2(4, 6)];
  const v = () => ({ hand, myAcq: [C2(4, 1)], oppAcq: [C2(3, 1)], center: C2(4, 2),
                     offered: C2(4, 5), deckLeft: 7, oppHandLen: 6,
                     isAuctioneer: true, auctionType: 'open', visOpp: null });
  const rate = (mem) => {
    let n = 0;
    for (let i = 0; i < 120; i++) if (NEW.bidV3(v(), mem).id === 610) n++;
    return n / 120 * 100;
  };
  const know = NEW.createMem(); know.knownOpp.add(201);   // 2-1 이 상대 손에 있다
  const blind = NEW.createMem();
  const a = rate(know), b = rate(blind);
  console.log(`     6-10 을 내는 비율 — 2-1 위치를 알 때 ${a.toFixed(0)}% · 모를 때 ${b.toFixed(0)}%`);
  ok('알면 배신을 노린다', a > 70, `${a.toFixed(0)}%`);
  ok('모르면 함부로 안 던진다', b < 20, `${b.toFixed(0)}%`);
}

console.log('\n⑩ 사람이 기다릴 만한가');
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

console.log('\n⑪ 치팅하지 않는가');
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
