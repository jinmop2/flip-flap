// ── 미니게임 족보 (섯다식 2장 승부) ──────────────────────────────────────
//
// 판정만 다루는 순수 모듈이다. 배팅·소켓·코인은 바깥이 맡고, 여기서는
// "이 두 장이 저 두 장을 이기는가" 만 계산한다. 족보가 틀리면 게임이 통째로
// 틀어지는데, 서버를 안 띄우고 276가지 조합을 전부 확인할 수 있어야 잡힌다.
//
// 덱은 본 게임과 같은 24장을 쓴다 — 카드를 새로 그릴 필요가 없고,
// 플레이어가 이미 아는 카드라 족보를 새로 외우지 않아도 된다.
//   2 그룹 2장 · 3 그룹 5장 · 4 그룹 7장 · 6 그룹 10장
//
// 카드는 { kind, grade } — kind 가 앞자리, grade 가 뒷자리. 둘 다 작을수록 강하다.

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];

function makeDeck() {
  const out = [];
  for (const [kind, n] of SPEC)
    for (let grade = 1; grade <= n; grade++) out.push({ kind, grade, id: kind * 100 + grade });
  return out;
}

// 카드 하나의 세기 — 앞자리 먼저, 같으면 뒷자리. 작을수록 강하다.
const cardValue = (c) => c.kind * 100 + c.grade;

// ── 스나이퍼 ──
// "앞자리 합 10" 은 본래 최하위권인데, 뒷자리 합까지 10이면 최상위를 잡는다.
//   · 거울쌍 10 (4-4 + 6-6) — 0티어(합4)와 1티어(합5)를 잡는다
//   · 일반 10-10 (나머지 6종)  — 1티어(합5)만 잡는다. 0티어에게는 진다.
// 저격 대상이 아닌 패(합 6~9)를 만나면 그냥 '합 10' 으로 취급되어 진다.
const SNIPER_NONE = 0, SNIPER_NORMAL = 1, SNIPER_MIRROR = 2;

function sniperOf(a, b) {
  if (a.kind + b.kind !== 10) return SNIPER_NONE;
  if (a.grade + b.grade !== 10) return SNIPER_NONE;
  // 거울쌍 — 4-4 와 6-6
  const pair = [a, b].sort((x, y) => x.kind - y.kind);
  if (pair[0].kind === 4 && pair[0].grade === 4 && pair[1].kind === 6 && pair[1].grade === 6)
    return SNIPER_MIRROR;
  return SNIPER_NORMAL;
}

// 티어 — 화면에 이름을 띄우고, 저격 대상을 판단하는 데 쓴다.
// 앞자리로 가능한 합은 4·5·6·7·8·9·10·12 뿐이다(11은 나오지 않는다).
const TIER_OF_SUM = { 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 12: 7 };
const TIER_NAME = ['지배자', '최고급', '중간계', '중간계', '중간계', '중간계', '최하위', '꼴찌'];

function evaluate(hand) {
  const [a, b] = hand;
  const frontSum = a.kind + b.kind;
  const backSum = a.grade + b.grade;
  const sniper = sniperOf(a, b);
  const tier = TIER_OF_SUM[frontSum];
  return {
    frontSum, backSum, sniper, tier,
    minValue: Math.min(cardValue(a), cardValue(b)),   // 제3원칙 — 더 작은 패를 쥔 쪽
    name: sniper === SNIPER_MIRROR ? '거울쌍 10'
        : sniper === SNIPER_NORMAL ? '10-10 스나이퍼'
        : `${TIER_NAME[tier]} (합 ${frontSum})`,
  };
}

// 저격이 통하는가 — 스나이퍼가 상대를 잡아먹는 경우만 true
function snipes(me, opp) {
  if (me.sniper === SNIPER_NONE) return false;
  if (opp.sniper !== SNIPER_NONE) return false;      // 스나이퍼끼리는 저격이 아니다
  if (me.sniper === SNIPER_MIRROR) return opp.tier === 0 || opp.tier === 1;
  return opp.tier === 1;                             // 일반 10-10 은 1티어만
}

// A 가 B 를 이기면 1, 지면 -1, 완전히 같으면 0.
// 완전히 같은 패는 덱에 카드가 한 장씩뿐이라 나올 수 없지만, 판정은 열어 둔다.
function compare(handA, handB) {
  const A = evaluate(handA), B = evaluate(handB);
  // ① 저격이 먼저다 — 서열을 뒤집는 규칙이라 합 비교보다 앞선다
  if (snipes(A, B)) return 1;
  if (snipes(B, A)) return -1;
  // ② 앞자리 합이 작은 쪽
  if (A.frontSum !== B.frontSum) return A.frontSum < B.frontSum ? 1 : -1;
  // ③ 뒷자리 합이 작은 쪽
  if (A.backSum !== B.backSum) return A.backSum < B.backSum ? 1 : -1;
  // ④ 더 작은 카드를 쥔 쪽
  if (A.minValue !== B.minValue) return A.minValue < B.minValue ? 1 : -1;
  return 0;
}

// 섞기 — 시드를 주면 같은 패를 다시 돌릴 수 있다(테스트·재현용)
function shuffle(arr, rand) {
  const a = arr.slice();
  const r = rand || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 두 사람에게 2장씩
function deal(rand) {
  const d = shuffle(makeDeck(), rand);
  return { hands: [[d[0], d[1]], [d[2], d[3]]], rest: d.slice(4) };
}

// ── 배팅 ──────────────────────────────────────────────────────────────────
//
// 2인 · 두 번의 배팅 라운드. 상태기계라 서버를 안 띄우고 한 판을 통째로 돌릴 수 있다.
//
//   1) 각자 한 장씩 받는다 — 이 장은 서로 보인다. 1차 배팅.
//   2) 두 번째 장을 받는다 — 이건 자기만 본다. 2차 배팅.
//   3) 콜(또는 양쪽 체크)로 라운드가 닫히면 공개하고 족보로 가른다.
//
// 첫 장이 보이는 이유: 아무 정보 없이 배팅하면 그냥 동전 던지기가 된다.
// 보이는 한 장이 있어야 블러핑과 읽기가 생긴다.
const ANTE = 10;                 // 판에 들어갈 때 각자 내는 돈
const BET_UNIT = 20;             // 배팅 한 단위
const MAX_RAISE = 3;             // 한 라운드에 레이즈는 세 번까지 (판이 무한히 안 커지게)

// 사람이 지금 할 수 있는 행동
function actionsFor(st) {
  if (st.over || st.turn === null) return [];
  const toCall = st.bet[1 - st.turn] - st.bet[st.turn];
  if (toCall > 0) {
    return st.raises < MAX_RAISE ? ['call', 'raise', 'fold'] : ['call', 'fold'];
  }
  return st.raises < MAX_RAISE ? ['check', 'bet', 'fold'] : ['check', 'fold'];
}

function createGame(rand) {
  const d = shuffle(makeDeck(), rand);
  return {
    deck: d,
    hands: [[d[0]], [d[1]]],       // 1차에는 한 장씩
    round: 0,                      // 0 = 1차, 1 = 2차
    bet: [ANTE, ANTE],             // 이번 라운드까지 각자 낸 돈
    pot: ANTE * 2,
    raises: 0,
    acted: [false, false],         // 이번 라운드에 행동했는가
    turn: 0,                       // 먼저 행동하는 쪽 (아래에서 정한다)
    over: false,
    winner: null,
    reason: null,                  // 'fold' | 'showdown'
    log: [],
  };
}

// 보이는 카드가 강한 쪽이 먼저 — 섯다에서 선이 도는 것과 같은 결
function setFirst(st) {
  st.turn = cardValue(st.hands[0][0]) <= cardValue(st.hands[1][0]) ? 0 : 1;
  return st;
}

function deal2(rand) {
  const st = createGame(rand);
  return setFirst(st);
}

// 라운드가 닫혔는가 — 둘 다 행동했고 낸 돈이 같으면
function roundClosed(st) {
  return st.acted[0] && st.acted[1] && st.bet[0] === st.bet[1];
}

// 한 수. seat 가 action 을 한다. 반환: { ok, error }
function act(st, seat, action) {
  if (st.over) return { ok: false, error: '이미 끝난 판이에요.' };
  if (seat !== st.turn) return { ok: false, error: '아직 차례가 아니에요.' };
  if (!actionsFor(st).includes(action)) return { ok: false, error: '지금 할 수 없는 행동이에요.' };

  const other = 1 - seat;
  const toCall = st.bet[other] - st.bet[seat];

  if (action === 'fold') {
    st.over = true; st.winner = other; st.reason = 'fold';
    st.log.push({ seat, action });
    return { ok: true };
  }
  if (action === 'check') { /* 돈은 그대로 */ }
  else if (action === 'call') { st.bet[seat] += toCall; st.pot += toCall; }
  else if (action === 'bet' || action === 'raise') {
    const add = toCall + BET_UNIT;
    st.bet[seat] += add; st.pot += add; st.raises++;
    st.acted[other] = false;                 // 상대는 다시 답해야 한다
  }
  st.acted[seat] = true;
  st.log.push({ seat, action, pot: st.pot });

  if (!roundClosed(st)) { st.turn = other; return { ok: true }; }

  // 라운드가 닫혔다
  if (st.round === 0) {
    st.round = 1;
    st.hands[0].push(st.deck[2]);
    st.hands[1].push(st.deck[3]);
    st.acted = [false, false];
    st.raises = 0;
    setFirst(st);                            // 2차도 보이는 카드 기준으로 선을 정한다
    return { ok: true, dealt: true };
  }
  // 공개
  st.over = true; st.reason = 'showdown';
  const c = compare(st.hands[0], st.hands[1]);
  st.winner = c === 0 ? null : (c > 0 ? 0 : 1);
  return { ok: true, showdown: true };
}

// 화면·AI 에 내려보낼 형태. me 아닌 쪽의 두 번째 장은 가린다.
function viewFor(st, me) {
  const opp = 1 - me;
  const hideOpp = !st.over || st.reason === 'fold';
  return {
    round: st.round, pot: st.pot, bet: st.bet.slice(),
    turn: st.turn, over: st.over, winner: st.winner, reason: st.reason,
    myHand: st.hands[me].slice(),
    oppHand: hideOpp ? st.hands[opp].slice(0, 1) : st.hands[opp].slice(),
    oppHidden: hideOpp && st.hands[opp].length > 1,
    actions: st.turn === me ? actionsFor(st) : [],
    toCall: Math.max(0, st.bet[opp] - st.bet[me]),
    myEval: st.hands[me].length === 2 ? evaluate(st.hands[me]) : null,
    oppEval: (!hideOpp && st.hands[opp].length === 2) ? evaluate(st.hands[opp]) : null,
  };
}

module.exports = {
  ANTE, BET_UNIT, MAX_RAISE, actionsFor, deal2, act, viewFor, roundClosed,
  SPEC, TIER_NAME, TIER_OF_SUM,
  SNIPER_NONE, SNIPER_NORMAL, SNIPER_MIRROR,
  makeDeck, cardValue, sniperOf, evaluate, snipes, compare, deal, _shuffle: shuffle,
};
