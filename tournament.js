// ── 토너먼트 (8강 · 2인전) ────────────────────────────────────────────────
//
// 대진표만 다루는 순수 모듈이다. 소켓·방·코인은 server.js 가 맡고, 여기서는
// "누가 누구와 붙고, 이기면 어디로 가는가" 만 계산한다. 그래야 대진이 맞는지를
// 서버를 띄우지 않고 확인할 수 있다 — 대진이 틀리면 대회 전체가 틀어진다.
//
// 규칙
//   · 참가비 200코인, 정원 8명, 첫 사람이 들어온 뒤 30초에 시작
//   · 30초에 8명이 안 차면 나머지는 AI 로 채운다 (사람이 하나여도 시작한다)
//   · 8강 → 4강 → 결승, 모든 경기는 2인전
//   · 우승 1000코인, 준우승 200코인 (준우승은 참가비를 돌려받는 셈)

const SIZE = 8;                 // 정원 (2의 거듭제곱이어야 대진이 맞는다)
const ENTRY_FEE = 200;
const PRIZE = { 1: 1000, 2: 200 };
const START_DELAY = 30000;      // 첫 사람이 들어온 뒤 시작까지
const ROUND_NAMES = ['8강', '4강', '결승'];

// 자리 섞기 — 매칭은 무작위다. 시드를 주면 같은 대진을 다시 만들 수 있다(테스트용).
function shuffle(arr, rand) {
  const a = arr.slice();
  const r = rand || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 참가자: { key, nick, isBot, token }
// key 는 사람이면 소켓 id, AI 면 'bot0' 같은 고정 문자열. 대진표는 key 로만 말한다.
function createBracket(entrants, rand) {
  const seats = shuffle(entrants, rand);
  while (seats.length < SIZE) {
    const i = seats.length;
    seats.push({ key: 'bot' + i, nick: null, isBot: true, token: null });
  }
  return {
    size: SIZE,
    seats: seats.slice(0, SIZE),
    round: 0,                       // 0=8강, 1=4강, 2=결승
    // rounds[r] = [{ a, b, winner }]  — a·b 는 seats 의 자리 번호
    rounds: [pairsOf([...Array(SIZE).keys()])],
    over: false,
    rank: {},                       // seat → 등수 (1·2 만 상금)
  };
}

// 이웃끼리 짝짓기 — [0,1], [2,3] …
function pairsOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 2) out.push({ a: list[i], b: list[i + 1], winner: null });
  return out;
}

const seatOf = (t, i) => t.seats[i];
const curRound = (t) => t.rounds[t.round] || [];
const roundName = (r) => ROUND_NAMES[r] || `${r + 1}라운드`;

// 아직 안 끝난 경기들
function pendingMatches(t) {
  return curRound(t).map((m, i) => ({ ...m, index: i })).filter((m) => m.winner === null);
}

// 한 경기 결과를 적는다. 이미 적힌 경기는 다시 안 받는다(중복 정산 방지).
// 반환: { ok, advanced }  advanced 면 다음 라운드로 넘어갔다는 뜻
function reportWin(t, matchIndex, winnerSeat) {
  if (t.over) return { ok: false, reason: 'over' };
  const m = curRound(t)[matchIndex];
  if (!m) return { ok: false, reason: 'no-match' };
  if (m.winner !== null) return { ok: false, reason: 'done' };
  if (winnerSeat !== m.a && winnerSeat !== m.b) return { ok: false, reason: 'not-in-match' };

  m.winner = winnerSeat;
  const loser = winnerSeat === m.a ? m.b : m.a;
  // 진 사람의 등수 — 이번 라운드에서 떨어진 사람들은 같은 등수를 나눠 갖는다.
  // 8강 탈락 5위, 4강 탈락 3위, 결승 패배 2위.
  t.rank[loser] = t.round === 0 ? 5 : t.round === 1 ? 3 : 2;

  if (pendingMatches(t).length) return { ok: true, advanced: false };

  // 이번 라운드가 다 끝났다
  const winners = curRound(t).map((x) => x.winner);
  if (winners.length === 1) {
    t.over = true;
    t.rank[winners[0]] = 1;
    return { ok: true, advanced: false, finished: true, champion: winners[0] };
  }
  t.round++;
  t.rounds.push(pairsOf(winners));
  return { ok: true, advanced: true };
}

// 사람이 나갔을 때 — 그 자리는 남은 경기를 전부 진다.
// 판을 붙들고 있으면 남은 사람들이 못 넘어간다.
function forfeit(t, seat) {
  const out = [];
  while (!t.over) {
    const list = curRound(t);
    const idx = list.findIndex((m) => m.winner === null && (m.a === seat || m.b === seat));
    if (idx < 0) break;                              // 이 라운드에 그 자리의 경기가 없다
    const m = list[idx];
    const other = m.a === seat ? m.b : m.a;
    const r = reportWin(t, idx, other);
    out.push({ round: t.round, matchIndex: idx, winner: other });
    if (!r.ok) break;
    if (!r.advanced && !r.finished) break;            // 같은 라운드에 다른 경기가 남았다
    if (r.finished) break;
  }
  return out;
}

// 화면에 내려보낼 형태. 사람 이름은 서버가 채워 넣는다(여기선 seats 를 그대로 쓴다).
function view(t, mySeat) {
  return {
    size: t.size, round: t.round, roundName: roundName(t.round), over: t.over,
    seats: t.seats.map((s, i) => ({ i, nick: s.nick, isBot: s.isBot, rank: t.rank[i] || null,
                                    me: mySeat === i })),
    rounds: t.rounds.map((ms, r) => ({
      round: r, name: roundName(r),
      matches: ms.map((m) => ({ a: m.a, b: m.b, winner: m.winner })),
    })),
    mySeat: mySeat === undefined ? null : mySeat,
    myRank: mySeat === undefined ? null : (t.rank[mySeat] || null),
  };
}

const prizeFor = (rank) => PRIZE[rank] || 0;

module.exports = {
  SIZE, ENTRY_FEE, PRIZE, START_DELAY, ROUND_NAMES,
  createBracket, reportWin, forfeit, pendingMatches, curRound, seatOf, roundName, view, prizeFor,
  _shuffle: shuffle, _pairsOf: pairsOf,
};
