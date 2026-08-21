// ── 미니게임 족보 (두 장 승부) ────────────────────────────────────────────
//
// 판정만 다루는 순수 모듈이다. 배팅·소켓·코인은 바깥이 맡고, 여기서는
// "이 두 장이 저 두 장을 이기는가" 만 계산한다. 족보가 틀리면 게임이 통째로
// 틀어지는데, 서버를 안 띄우고 190가지 조합을 전부 확인할 수 있어야 잡힌다.
//
// 덱은 본 게임 카드에서 넉 장을 덜어낸 20장이다 — 카드를 새로 그릴 필요가 없고,
// 플레이어가 이미 아는 카드라 족보만 새로 외우면 된다.
//   2 그룹 2장 · 3 그룹 4장 · 4 그룹 6장 · 6 그룹 8장
//
// 카드는 { kind, grade } — kind 가 앞자리, grade 가 뒷자리. 둘 다 작을수록 강하다.
//
// ── 왜 족보를 갈아엎었나 ──────────────────────────────────────────────────
// 예전 족보는 '앞자리 합이 작은 쪽' 하나로 서열을 매겼다. 그런데 6종이 덱의
// 42% 라, 첫 장이 6이면(=거의 절반) 남은 판이 20% 확률로만 살 만한 패가 됐다.
// 첫 배팅 라운드가 절반쯤은 형식이었다는 뜻이다. 게다가 6+6 은 '합 12 꼴찌' 라
// 가장 흔한 조합(45가지)이 가장 죽은 패였다.
//
// 새 족보는 섯다의 땡과 포커의 페어를 가져와 그 자리를 메운다.
//   · 같은 종류 두 장 = 땡  → 6+6 이 죽은 패에서 어엿한 패가 된다
//   · 같은 등급 두 장 = 짝  → 종류가 갈려도 쥘 것이 생긴다
//   · 나머지 = 끗 (종류 합)  → 예전 서열을 그대로 물려받는다
// 재 보면 첫 장 기대치가 2종 85%/6종 28% 에서 2종 56%/6종 47% 로 평평해졌다.
// "첫 장이 6이면 접는다" 가 사라진다.

const SPEC = [[2, 2], [3, 4], [4, 6], [6, 8]];

function makeDeck() {
  const out = [];
  for (const [kind, n] of SPEC)
    for (let grade = 1; grade <= n; grade++) out.push({ kind, grade, id: kind * 100 + grade });
  return out;
}

// 카드 하나의 세기 — 앞자리 먼저, 같으면 뒷자리. 작을수록 강하다.
const cardValue = (c) => c.kind * 100 + c.grade;

// 각 종류의 마지막 등급 (= 그 종류에서 가장 약한 카드)
const lastGrade = (kind) => (SPEC.find(([k]) => k === kind) || [0, 0])[1];

// ── 졸개의 배신 ──
// 덱에서 가장 약한 두 장(4종 맨끝 + 6종 맨끝)이 모든 땡을 잡는다.
// 본 게임의 '졸개의 배신'(최약이 최강을 잡는다)을 그대로 물려받은 것이라
// 규칙을 새로 외울 필요가 없다. 190가지 중 딱 하나 — 그래서 터지면 사건이다.
// 땡이 아닌 상대에게는 그냥 가장 약한 끗10 이다. 잡는 것 말고는 밑바닥이다.
const JOL_A = 4 * 100 + lastGrade(4);
const JOL_B = 6 * 100 + lastGrade(6);
function isJol(a, b) {
  const x = Math.min(cardValue(a), cardValue(b)), y = Math.max(cardValue(a), cardValue(b));
  return x === JOL_A && y === JOL_B;
}

// 족보 종류 — 작을수록 강하다
const T_TTANG = 0, T_JJAK = 1, T_GGEUT = 2;
const KIND_NAME = { 2: '2땡', 3: '3땡', 4: '4땡', 6: '6땡' };

function evaluate(hand) {
  const [a, b] = hand;
  const jol = isJol(a, b);
  const same = a.kind === b.kind;
  const pair = !same && a.grade === b.grade;
  const sum = a.kind + b.kind;
  const minValue = Math.min(cardValue(a), cardValue(b));
  if (jol) {
    // 서열은 밑바닥(끗10 중에서도 맨 아래)이되, 땡을 잡는 힘만 따로 갖는다
    return { type: T_GGEUT, jol: true, kind: null, sum, backSum: a.grade + b.grade, minValue,
             rank: [T_GGEUT, sum, 99, 999], name: '졸개의 배신' };
  }
  // 눈금은 끝까지 갈라 둔다 — 중간에서 끊으면 서로 다른 패가 무승부가 된다
  // (6-1+6-2 와 6-1+6-3 은 '가장 낮은 등급' 까지만 보면 같아진다).
  if (same) {
    return { type: T_TTANG, jol: false, kind: a.kind, sum, backSum: a.grade + b.grade, minValue,
             rank: [T_TTANG, a.kind, Math.min(a.grade, b.grade), Math.max(a.grade, b.grade)],
             name: KIND_NAME[a.kind] };
  }
  if (pair) {
    return { type: T_JJAK, jol: false, kind: null, sum, backSum: a.grade + b.grade, minValue,
             rank: [T_JJAK, a.grade, Math.min(a.kind, b.kind), Math.max(a.kind, b.kind)],
             name: `${a.grade}짝` };
  }
  return { type: T_GGEUT, jol: false, kind: null, sum, backSum: a.grade + b.grade, minValue,
           rank: [T_GGEUT, sum, a.grade + b.grade, minValue,
                  Math.max(cardValue(a), cardValue(b))], name: `${sum}끗` };
}

// 졸개가 상대를 잡아먹는가
function snipes(me, opp) { return !!me.jol && opp.type === T_TTANG; }

// A 가 B 를 이기면 1, 지면 -1, 완전히 같으면 0.
// 완전히 같은 패는 덱에 카드가 한 장씩뿐이라 나올 수 없지만, 판정은 열어 둔다.
function compare(handA, handB) {
  const A = evaluate(handA), B = evaluate(handB);
  // ① 졸개가 먼저다 — 서열을 뒤집는 규칙이라 족보 비교보다 앞선다
  if (snipes(A, B)) return 1;
  if (snipes(B, A)) return -1;
  // ② 족보 순서대로 (땡 → 짝 → 끗), 같은 족보 안에서는 정해진 눈금대로
  for (let i = 0; i < Math.max(A.rank.length, B.rank.length); i++) {
    const d = (A.rank[i] === undefined ? 0 : A.rank[i]) - (B.rank[i] === undefined ? 0 : B.rank[i]);
    if (d) return d < 0 ? 1 : -1;
  }
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
// 2~4인. 섯다 방식 그대로다.
//
//   1) 모두 기본 단위(삥)만큼 걸고 한 장씩 받는다. 선부터 배팅.
//   2) 한 명 빼고 모두 콜하거나 죽으면 라운드가 닫힌다.
//   3) 한 명만 남으면 그대로 승리(기권승), 둘 이상 남으면 한 장 더 받고 두 번째 배팅.
//   4) 두 번째 배팅이 닫히면 패를 열고 족보로 가른다.
//   5) 선은 이긴 사람이 잡는다.
//
// 두 장 모두 끝까지 비공개다. 읽을 것은 상대가 얼마를 언제 거느냐뿐이다.
//
// 상태기계라 서버를 안 띄우고 한 판을 통째로 돌릴 수 있다. 돈이 오가는 곳이라
// 화면 없이 수천 판을 돌려 봐야 새는 곳이 보인다.
const ANTE = 40;                 // 기본 단위 = 판에 들어갈 때 각자 내는 돈(판 열기 한 번)
const BET_UNIT = ANTE;           // 판 여는 값 (예전 이름 — 밖에서 쓰던 것을 살려 둔다)
// 자리에 앉을 때 들고 오는 돈. 전부 걸기가 뜻을 가지려면 앞에 쌓인 소지금이 있어야 한다.
// 기본 단위의 쉰 배로 잡았다 — 이보다 얇으면 두세 판에 털려 배팅이랄 게 없어진다.
const BUY_IN = ANTE * 50;        // 2000달
// 코인 ↔ 달 환율. 판에서는 달로만 세고, 코인은 앉을 때와 일어설 때만 만진다.
// 큰 숫자로 굴려야 판이 판답고, 코인은 그만큼 적게 든다(200코인 = 2000달).
const MOON_PER_COIN = 10;
const MAX_SEATS = 4;
const MIN_SEATS = 2;

// 각 행동이 "얼마를 더 내는가".
// 하프·쿼터는 콜을 하고 난 뒤의 판돈을 기준으로 잡는다 — 콜 값을 빼고 계산하면
// 앞사람이 크게 지를수록 되받아치는 값이 상대적으로 작아져 후행이 유리해진다.
//
// 금액은 기본 단위로 떨어뜨린다. 그냥 나누면 7·19·37 같은 값이 나와서
// 칩으로 쌓을 수도 없고 머리로 셈하기도 나쁘다. 내림이라 판이 덜 커진다.
const unitDown = (x) => Math.max(ANTE, Math.floor(x / ANTE) * ANTE);
function raiseAmounts(st, seat) {
  const my = st.roundBet[seat];
  const max = Math.max(...st.alive.map((a, i) => (a ? st.roundBet[i] : 0)));
  const toCall = max - my;
  const potAfterCall = st.pot + toCall;
  return {
    call: toCall,
    ping: ANTE,                                   // 삥 — 기본 단위
    half: toCall + unitDown(potAfterCall / 2),
    quarter: toCall + unitDown(potAfterCall / 4),
    ttadang: max * 2 - my,                        // 따당 — 앞사람이 건 돈의 두 배
    allin: st.stack[seat],
  };
}

// 올인이 아니어도 밑천보다 많이 걸 수는 없고, 남들이 받을 수 없는 액수도 걸 수 없다.
// 사이드팟을 만들지 않기로 했으니(3~4인에서 판을 셋으로 쪼개면 화면이 못 따라온다)
// 레이즈는 "가장 가난한 상대가 받을 수 있는 만큼" 에서 끊는다.
function capFor(st, seat) {
  let cap = st.stack[seat];
  for (let i = 0; i < st.n; i++) {
    if (i === seat || !st.alive[i]) continue;
    const can = st.roundBet[i] + st.stack[i] - st.roundBet[seat];
    if (can < cap) cap = can;
  }
  return Math.max(0, cap);
}

// 지금 이 사람이 할 수 있는 행동. 순서는 화면에 놓는 순서와 같다.
function actionsFor(st, seat) {
  const me = seat === undefined ? st.turn : seat;
  if (st.over || st.turn === null || me !== st.turn || !st.alive[me]) return [];
  const A = raiseAmounts(st, me);
  const cap = capFor(st, me);
  const out = [];
  const opening = A.call === 0 && !st.opened;      // 이번 라운드에 아직 아무도 안 걸었다

  // 콜/체크한 사람은 그 라운드에서 다시 못 올린다 — 콜·다이만 남는다
  if (!st.locked[me]) {
    // 삥은 규칙대로 선만 — 판을 여는 값이다.
    // 체크는 걸린 돈이 없을 때 누구나. 규칙은 선만이지만, 그러면 선이 체크한 뒤
    // 뒷사람은 걸거나 죽어야 해서 아무것도 아닌 판이 억지로 커진다.
    if (A.call === 0) out.push('check');
    if (opening && me === st.first && cap >= A.ping && st.stack[me] > A.ping) out.push('ping');
    if (!opening || me !== st.first) {
      if (A.call > 0 && A.ttadang <= cap && A.ttadang > A.call) out.push('ttadang');
    }
    if (A.quarter <= cap && A.quarter > A.call) out.push('quarter');
    if (A.half <= cap && A.half > A.call) out.push('half');
    if (st.stack[me] > A.call) out.push('allin');
  }
  if (A.call > 0) out.push('call');
  out.push('die');
  return out;
}

// 한 판 시작. seats 는 자리 수(2~4), first 는 선(없으면 무작위).
function start(opt = {}) {
  const r = opt.rand || Math.random;
  const n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, opt.seats || 2));
  const stacks = opt.stacks ? opt.stacks.slice(0, n) : new Array(n).fill(BUY_IN);
  const d = shuffle(makeDeck(), r);
  const st = {
    n,
    deck: d,
    hands: [], stack: [], alive: [], roundBet: [], put: [], locked: [],
    acted: [],
    pot: 0, round: 1, opened: false,
    first: (opt.first === undefined || opt.first === null) ? Math.floor(r() * n) : opt.first % n,
    turn: null, over: false, winner: null, reason: null, log: [],
  };
  for (let i = 0; i < n; i++) {
    st.hands.push([d[i]]);                         // 1장씩 — 두 번째 장은 라운드가 끝나고
    st.stack.push(stacks[i] === undefined ? BUY_IN : stacks[i]);
    st.alive.push(true); st.locked.push(false); st.acted.push(false);
    st.roundBet.push(0); st.put.push(0);
  }
  // 기본 단위를 모두 건다 (판에 들어가는 값)
  for (let i = 0; i < n; i++) {
    const a = Math.min(ANTE, st.stack[i]);
    st.stack[i] -= a; st.roundBet[i] += a; st.put[i] += a; st.pot += a;
  }
  st.turn = st.first;
  return st;
}

const alivePlayers = (st) => st.alive.reduce((n, a) => n + (a ? 1 : 0), 0);

// 다음 차례 — 죽은 사람과 밑천이 바닥난 사람은 건너뛴다
function nextSeat(st, from) {
  for (let k = 1; k <= st.n; k++) {
    const i = (from + k) % st.n;
    if (st.alive[i]) return i;
  }
  return from;
}

// 라운드가 닫혔는가 — 살아 있는 모두가 한 번씩 행동했고 낸 돈이 같으면.
// 올인으로 더 낼 수 없는 사람은 액수가 달라도 닫힌 것으로 본다.
function roundClosed(st) {
  const max = Math.max(...st.alive.map((a, i) => (a ? st.roundBet[i] : 0)));
  for (let i = 0; i < st.n; i++) {
    if (!st.alive[i]) continue;
    if (!st.acted[i]) return false;
    if (st.roundBet[i] < max && st.stack[i] > 0) return false;
  }
  return true;
}

// 두 번째 장을 돌리고 라운드를 연다
function openRound2(st) {
  st.round = 2; st.opened = false;
  for (let i = 0; i < st.n; i++) {
    st.locked[i] = false; st.acted[i] = false; st.roundBet[i] = 0;
    if (st.alive[i]) st.hands[i].push(st.deck[st.n + i]);
  }
  st.turn = st.alive[st.first] ? st.first : nextSeat(st, st.first);
}

// 승부 — 저격은 서열을 뒤집는 규칙이라 3~4인에서는 A>B>C>A 가 생길 수 있다.
// (졸개의 배신과 같은 성질이다.) 그래서 "몇 명을 이겼나" 로 먼저 세고,
// 같으면 기본 서열(앞자리 합 → 뒷자리 합 → 더 강한 카드)로 가른다.
// 정렬 함수로 쓰면 안 된다 — 순환이 있으면 정렬 결과가 뒤죽박죽이 된다.
function resolve(st) {
  const seats = [];
  for (let i = 0; i < st.n; i++) if (st.alive[i]) seats.push(i);
  if (seats.length === 1) return seats[0];
  let best = seats[0], bestWins = -1;
  for (const i of seats) {
    let wins = 0;
    for (const j of seats) if (i !== j && compare(st.hands[i], st.hands[j]) > 0) wins++;
    if (wins > bestWins) { best = i; bestWins = wins; continue; }
    if (wins === bestWins) {
      const A = evaluate(st.hands[i]), B = evaluate(st.hands[best]);
      if (A.frontSum !== B.frontSum) { if (A.frontSum < B.frontSum) best = i; }
      else if (A.backSum !== B.backSum) { if (A.backSum < B.backSum) best = i; }
      else if (A.minValue < B.minValue) best = i;
    }
  }
  return best;
}

function finish(st, winner, reason) {
  st.over = true; st.winner = winner; st.reason = reason; st.turn = null;
  st.stack[winner] += st.pot;
  st.first = winner;                 // 선은 이긴 사람이 잡는다
  return { ok: true, over: true };
}

// 한 수. 반환: { ok, error }
function act(st, seat, action) {
  if (st.over) return { ok: false, error: '이미 끝난 판이에요.' };
  if (seat !== st.turn) return { ok: false, error: '아직 차례가 아니에요.' };
  if (!actionsFor(st, seat).includes(action)) return { ok: false, error: '지금 할 수 없는 행동이에요.' };

  const A = raiseAmounts(st, seat);
  const cap = capFor(st, seat);

  if (action === 'die') {
    st.alive[seat] = false;
    st.log.push({ seat, action, round: st.round });
    if (alivePlayers(st) === 1) {
      const last = st.alive.indexOf(true);
      return finish(st, last, 'fold');           // 기권승 — 패는 안 깐다
    }
  } else {
    let add = 0;
    if (action === 'call') add = Math.min(A.call, st.stack[seat]);
    else if (action === 'check') add = 0;
    else if (action === 'ping') add = A.ping;
    else if (action === 'half') add = A.half;
    else if (action === 'quarter') add = A.quarter;
    else if (action === 'ttadang') add = A.ttadang;
    else if (action === 'allin') add = Math.min(st.stack[seat], Math.max(cap, A.call));
    add = Math.min(add, st.stack[seat]);

    const raising = add > A.call;
    st.stack[seat] -= add; st.roundBet[seat] += add; st.put[seat] += add; st.pot += add;
    if (raising) {
      st.opened = true;
      // 누가 올리면 이미 콜한 사람도 다시 답해야 한다 — 다만 올릴 수는 없다
      for (let i = 0; i < st.n; i++) if (i !== seat && st.alive[i]) st.acted[i] = false;
    } else {
      st.locked[seat] = true;                    // 콜·체크한 사람은 이 라운드에 다시 못 올린다
    }
    if (action === 'allin') st.locked[seat] = true;
    st.acted[seat] = true;
    st.log.push({ seat, action, add, pot: st.pot, round: st.round });
  }

  if (!roundClosed(st)) { st.turn = nextSeat(st, seat); return { ok: true }; }

  if (st.round === 1) { openRound2(st); return { ok: true, round: 2 }; }
  return finish(st, resolve(st), 'showdown');
}

// 왜 이겼는가 — 이긴 패와 진 패를 대 놓고 "어느 규칙에서 갈렸는지" 를 짚어 준다.
// 화면이 스스로 계산하면 규칙이 두 벌이 되어 언젠가 어긋난다. 여기서 한 번만 판정한다.
function explain(winHand, loseHand) {
  const A = evaluate(winHand), B = evaluate(loseHand);
  if (snipes(A, B)) return { rule: 'snipe', win: A.name, lose: B.name };
  if (snipes(B, A)) return { rule: 'sniped', win: A.name, lose: B.name };
  // 족보 칸이 다르면 그것으로 갈린다 (땡 → 짝 → 끗)
  if (A.type !== B.type) return { rule: 'jokbo', win: A.name, lose: B.name };
  // 같은 칸 안에서는 눈금 순서대로 — 종류(끗은 합) → 등급 합 → 더 강한 카드
  if (A.rank[1] !== B.rank[1])
    return { rule: 'front', a: A.rank[1], b: B.rank[1], win: A.name, lose: B.name };
  if (A.backSum !== B.backSum)
    return { rule: 'back', a: A.backSum, b: B.backSum, win: A.name, lose: B.name };
  if (A.minValue !== B.minValue) {
    const card = (v) => `${Math.floor(v / 100)}-${v % 100}`;
    return { rule: 'card', a: card(A.minValue), b: card(B.minValue), win: A.name, lose: B.name };
  }
  return { rule: 'same', win: A.name, lose: B.name };
}

// 판이 끝났을 때, 이긴 자리와 진 자리들을 하나씩 짚어 준다.
function verdictOf(st) {
  if (!st.over || st.reason !== 'showdown' || st.winner === null) return null;
  const out = [];
  for (let i = 0; i < st.n; i++) {
    if (i === st.winner || !st.alive[i] || st.hands[i].length < 2) continue;
    out.push(Object.assign({ seat: i }, explain(st.hands[st.winner], st.hands[i])));
  }
  return { winner: st.winner, vs: out };
}

// 이번 라운드에 그 자리가 마지막으로 한 행동. 화면에 띄우고, AI 가 앞뒤를 맞추는 데 쓴다.
function lastActOf(st, seat) {
  for (let i = st.log.length - 1; i >= 0; i--) {
    const l = st.log[i];
    if (l.round !== st.round) break;
    if (l.seat === seat) return l.action;
  }
  return null;
}
// 이 판에서 한 번이라도 돈을 올렸는가 — 올려 놓고 다음 라운드에 갑자기 죽으면
// 사람 눈에 "쟤는 세면 계속 건다" 가 안 보인다.
function openedThisHand(st, seat) {
  for (const l of st.log)
    if (l.seat === seat && ['ping', 'quarter', 'half', 'ttadang', 'allin'].includes(l.action)) return true;
  return false;
}

// 화면·AI 에 내려보낼 형태. 남의 패는 공개로 끝났을 때만 실린다 —
// 죽은 사람 패는 끝까지 안 깐다. 다음 판에 읽히고, 실제 섯다에서도 안 깐다.
function viewFor(st, me) {
  const showAll = st.over && st.reason === 'showdown';
  const seats = [];
  for (let i = 0; i < st.n; i++) {
    const open = i === me || (showAll && st.alive[i]);
    seats.push({
      seat: i,
      alive: st.alive[i], stack: st.stack[i], roundBet: st.roundBet[i], put: st.put[i],
      first: i === st.first, turn: i === st.turn,
      cards: open ? st.hands[i].slice() : null,
      count: st.hands[i].length,
      lastAct: lastActOf(st, i),               // 이번 라운드에 마지막으로 한 행동
      opened: openedThisHand(st, i),           // 이 판에서 한 번이라도 걸었는가
      // 첫 라운드는 한 장뿐이라 족보가 없다 — 두 장이 되었을 때만 매긴다
      eval: open && st.hands[i].length === 2 ? evaluate(st.hands[i]) : null,
    });
  }
  const A = raiseAmounts(st, me);
  return {
    me, n: st.n, pot: st.pot, round: st.round, turn: st.turn,
    over: st.over, winner: st.winner, reason: st.reason, seats,
    actions: st.turn === me ? actionsFor(st, me) : [],
    amounts: { call: A.call, ping: A.ping, half: A.half, quarter: A.quarter,
               ttadang: A.ttadang, allin: Math.min(st.stack[me], Math.max(capFor(st, me), A.call)) },
    toCall: A.call,
    myEval: st.hands[me].length === 2 ? evaluate(st.hands[me]) : null,
  };
}

// ── AI ────────────────────────────────────────────────────────────────────
//
// 예전 AI 는 "내 패가 몇 티어냐" 만 보고 성향을 정했다. 그러면 두 가지를 못 한다.
//   · 3~4인에서 이길 확률이 확 떨어지는 걸 모른다 (혼자 이기면 되는 게 아니다)
//   · 얼마를 받아야 하는지(팟 오즈)를 안 따진다 — 싼 콜을 접고 비싼 콜을 받는다
//
// 그래서 이길 확률을 직접 센다. 덱이 24장뿐이라 남은 패를 전부 훑어도 금방이다.
//   · 두 장 다 받았으면: 상대가 가질 수 있는 두 장 조합 231가지를 다 비교
//   · 한 장만 받았으면: 내 두 번째 장 23가지 × 위의 231가지를 평균
// 카드 조합마다 값이 고정이므로 한 번 센 값은 표에 적어 둔다(24 + 276칸).
const equityCache = new Map();

function deckExcept(cards) {
  const out = [];
  const drop = new Set(cards.map((c) => c.id));
  for (const c of makeDeck()) if (!drop.has(c.id)) out.push(c);
  return out;
}

// 두 장을 쥐었을 때, 무작위 상대 하나를 이길 확률
function equity2(hand) {
  const key = hand.map((c) => c.id).sort().join(',');
  const hit = equityCache.get(key);
  if (hit !== undefined) return hit;
  const rest = deckExcept(hand);
  let win = 0, total = 0;
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++) {
      const c = compare(hand, [rest[i], rest[j]]);
      win += c > 0 ? 1 : c === 0 ? 0.5 : 0;
      total++;
    }
  const eq = total ? win / total : 0;
  equityCache.set(key, eq);
  return eq;
}

// 한 장만 쥐었을 때 — 아직 안 온 내 두 번째 장까지 평균낸다
function equity1(card) {
  const key = 'one:' + card.id;
  const hit = equityCache.get(key);
  if (hit !== undefined) return hit;
  const rest = deckExcept([card]);
  let sum = 0;
  for (const second of rest) sum += equity2([card, second]);
  const eq = sum / rest.length;
  equityCache.set(key, eq);
  return eq;
}

// 상대가 여럿이면 전부 이겨야 한다. 서로 독립이라 보고 거듭제곱으로 잡는다 —
// 정확하진 않지만(같은 덱을 나눠 갖는다) 사람 눈에 드러날 만큼 어긋나지 않는다.
function equityOf(cards, opponents) {
  if (!cards || !cards.length) return 0;
  const one = cards.length === 1 ? equity1(cards[0]) : equity2(cards);
  return Math.pow(one, Math.max(1, opponents || 1));
}

// 거친 눈금 — 화면·옛 AI 가 쓴다. 0 이 가장 세고 1 이 가장 약하다.
// 족보 서열을 0~1 로 눌러 담은 것이라 정확한 승률은 아니다(그건 equity 가 한다).
function handStrength(cards) {
  if (!cards || !cards.length) return 1;
  // 한 장뿐일 때는 종류만으로 어림한다. 새 족보에서는 6 도 땡·짝이 될 수 있어
  // 예전만큼 절망적이지 않다 — 기울기를 완만하게 잡는다.
  if (cards.length === 1) return 0.28 + (cards[0].kind - 2) / 4 * 0.34;
  const ev = evaluate(cards);
  if (ev.jol) return 0.72;                      // 땡만 잡는다 — 평소엔 밑바닥
  if (ev.type === T_TTANG) return { 2: 0.02, 3: 0.05, 4: 0.14, 6: 0.28 }[ev.kind];
  if (ev.type === T_JJAK) return 0.42;
  return Math.min(1, 0.5 + (ev.sum - 5) * 0.1);   // 끗5 0.5 → 끗10 1.0
}
// 서열 눈금 — 낮을수록 세다. 족보 칸을 그대로 쓴다.
const strengthOf = (ev) => (ev.jol ? 6.5
  : ev.type === T_TTANG ? { 2: 0, 3: 1, 4: 2, 6: 3 }[ev.kind]
  : ev.type === T_JJAK ? 4 : 4 + (ev.sum - 4) / 2);

// 옛 AI — 지금 AI 가 정말 나아졌는지 재는 기준으로 남겨 둔다(시험에서 붙여 본다).
function aiSimple(view, rand) {
  const acts = view.actions || [];
  if (!acts.length) return null;
  const r = rand || Math.random;
  const my = view.seats[view.me];
  const s = handStrength(my && my.cards);
  const pick = (...names) => names.find((n) => acts.includes(n));
  const affordable = (n) => (view.amounts[n] || 0) <= Math.max(view.amounts.call, my.stack * 0.6);
  const raise = () => {
    if (s <= 0.1 && acts.includes('allin') && r() < 0.12) return 'allin';
    const cands = ['ttadang', 'half', 'quarter'].filter((n) => acts.includes(n) && affordable(n));
    if (!cands.length) return null;
    return s < 0.12 && r() < 0.35 ? cands[0] : cands[cands.length - 1];
  };
  if (view.toCall > 0) {
    if (s <= 0.2 && r() < 0.55) { const x = raise(); if (x) return x; }
    if (s <= 0.5) return pick('call', 'check') || 'die';
    if (s <= 0.7) return r() < 0.5 ? (pick('call') || 'die') : 'die';
    if (view.toCall <= ANTE && r() < 0.3) return pick('call') || 'die';
    return pick('die') || 'check';
  }
  if (s <= 0.25) { const x = raise() || pick('ping'); if (x) return x; }
  if (s <= 0.5 && r() < 0.4) { const x = pick('ping') || raise(); if (x) return x; }
  if (r() < 0.15) { const x = pick('ping') || raise(); if (x) return x; }
  return pick('check', 'ping') || 'die';
}

// 지금 AI.
//
//   · 받을 때는 팟 오즈로 잰다. 판돈 90에 20을 받는다면 18%만 이겨도 남는 장사다.
//   · 걸 때는 확률에 맞춰 크기를 고른다. 센 패로 조금만 걸면 딸 돈을 흘린다.
//   · 약한 패로도 가끔 지른다. 늘 정직하면 "걸면 세다" 를 한 판에 들킨다.
//   · 밑천을 한 판에 다 밀지 않는다 — 털리면 다음 판이 없다.
//
// 아래 숫자는 감으로 적은 게 아니라 자가대전으로 골랐다. 같은 패를 자리만 바꿔
// 두 번 돌리는 방식(듀플리케이트)으로 카드 운을 상쇄시키고, 상대를 넷 두어
// (옛 AI · 무조건 따라오는 사람 · 센 패만 치는 사람 · 튜닝 전 자신) 평균이
// 가장 높은 값을 골랐다. 한 상대만 놓고 맞추면 그 상대만 이기는 값이 나온다.
const AI = {
  eqRaise: 0.82,   // 이만큼 앞서면 되받아친다
  pRaise: 0.9,
  edgeRaise: 0.28, // 팟 오즈보다 이만큼 앞서면 가끔 올린다
  pEdgeRaise: 0.25,
  edgeCall: 0.05,  // 이만큼 앞서면 받는다
  edgeThin: -0.02, // 살짝 모자라도 값이 싸면 따라간다
  potThin: 0.25,
  pThin: 0.3,
  eqBet: 0.65,     // 먼저 걸 때 — 이만큼이면 크게
  eqBet2: 0.4,
  pBet2: 0.9,
  eqProbe: 0.3,
  pProbe: 0.25,
  pBluff: 0.22,    // 아무것도 없을 때 지르는 비율
  limStrong: 0.85, // 센 패로 밑천의 이만큼까지
  limWeak: 0.3,    // 어중간할 땐 이만큼까지
  eqAllin: 0.85,
  pAllin: 0.25,
};

function aiAction(view, rand) {
  const acts = view.actions || [];
  if (!acts.length) return null;
  const r = rand || Math.random;
  const me = view.seats[view.me];
  const opponents = view.seats.filter((s, i) => i !== view.me && s.alive).length;
  const eq = equityOf(me && me.cards, opponents);
  const pick = (...names) => names.find((n) => acts.includes(n));

  const pot = view.pot, toCall = view.toCall;
  const amt = view.amounts || {};
  const stack = me.stack;
  // 이 값을 걸면 밑천의 몇 할을 쓰는가 — 큰 값은 센 패일 때만 쓴다
  const share = (n) => (stack > 0 ? (amt[n] || 0) / stack : 1);
  const affordable = (n, lim) => acts.includes(n) && share(n) <= lim;

  const sizeUp = (strong) => {
    const lim = strong ? AI.limStrong : AI.limWeak;
    const big = ['allin', 'ttadang', 'half', 'quarter'].filter((n) => affordable(n, lim));
    if (!big.length) return null;
    if (strong && eq > AI.eqAllin && acts.includes('allin') && r() < AI.pAllin) return 'allin';
    if (strong) return big.find((n) => n !== 'allin') || big[0];
    return ['quarter', 'half'].find((n) => affordable(n, lim)) || null;
  };

  if (toCall > 0) {
    const odds = toCall / (pot + toCall);       // 이만큼은 이겨야 본전
    const edge = eq - odds;
    if (eq > AI.eqRaise && r() < AI.pRaise) { const x = sizeUp(true); if (x) return x; }
    if (edge > AI.edgeRaise && r() < AI.pEdgeRaise) { const x = sizeUp(false); if (x) return x; }
    if (edge > AI.edgeCall) return pick('call', 'check') || 'die';
    if (edge > AI.edgeThin && toCall <= pot * AI.potThin && r() < AI.pThin) return pick('call') || 'die';
    return pick('die') || pick('check') || 'die';
  }

  // 걸린 돈이 없다 — 먼저 거는 자리
  if (eq > AI.eqBet) { const x = sizeUp(true) || pick('ping'); if (x) return x; }
  if (eq > AI.eqBet2 && r() < AI.pBet2) { const x = sizeUp(false) || pick('ping'); if (x) return x; }
  if (eq > AI.eqProbe && r() < AI.pProbe) { const x = pick('ping') || sizeUp(false); if (x) return x; }
  if (r() < AI.pBluff) { const x = pick('ping') || sizeUp(false); if (x) return x; }   // 허풍
  return pick('check', 'ping') || 'die';
}

module.exports = {
  ANTE, BET_UNIT, BUY_IN, MOON_PER_COIN, MAX_SEATS, MIN_SEATS,
  explain, verdictOf,
  start, act, actionsFor, viewFor, roundClosed, raiseAmounts, capFor, resolve,
  aiAction, aiSimple, AI, handStrength, strengthOf, equityOf, equity2, equity1,
  SPEC, KIND_NAME, T_TTANG, T_JJAK, T_GGEUT, isJol,
  makeDeck, cardValue, evaluate, snipes, compare, deal, _shuffle: shuffle,
};
