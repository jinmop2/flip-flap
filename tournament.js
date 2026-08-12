// ── 토너먼트 (8강 · 2인전) ────────────────────────────────────────────────
//
// 대진표만 다루는 순수 모듈이다. 소켓·방·코인은 server.js 가 맡고, 여기서는
// "누가 누구와 붙고, 이기면 어디로 가는가" 만 계산한다. 그래야 대진이 맞는지를
// 서버를 띄우지 않고 확인할 수 있다 — 대진이 틀리면 대회 전체가 틀어진다.
//
// 규칙
//   · 참가비 200코인, 정원 8명
//   · 매시 정각과 30분에 열린다. 그 사이엔 언제든 접수하고, 시작 시각에 출발한다.
//   · 시작할 때 8명이 안 차면 나머지는 AI 로 채운다 (사람이 하나여도 시작한다)
//   · 8강 → 4강 → 결승, 모든 경기는 2인전
//   · 8강·4강은 단판, 결승만 3판 2선승
//   · 우승 1000코인, 준우승 200코인 (준우승은 참가비를 돌려받는 셈)

const SIZE = 8;                 // 정원 (2의 거듭제곱이어야 대진이 맞는다)
const ENTRY_FEE = 200;
const PRIZE = { 1: 1000, 2: 200 };
const PERIOD_MS = 30 * 60 * 1000;   // 30분마다
const ROUND_NAMES = ['8강', '4강', '결승'];
// 라운드별 판수. 결승만 3판 2선승 — 우승은 한 판 운으로 갈리지 않게.
const BEST_OF = [1, 1, 3];
const winsNeeded = (bestOf) => Math.floor((bestOf || 1) / 2) + 1;

// 다음 개최 시각 — 매시 0분·30분. now 를 주면 그 시점 기준으로 계산한다(테스트용).
function nextStartAt(now) {
  const t = now === undefined ? Date.now() : now;
  return Math.floor(t / PERIOD_MS) * PERIOD_MS + PERIOD_MS;
}

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
    rounds: [pairsOf([...Array(SIZE).keys()], BEST_OF[0])],
    over: false,
    rank: {},                       // seat → 등수 (1·2 만 상금)
  };
}

// 이웃끼리 짝짓기 — [0,1], [2,3] …
// score 는 그 자리가 딴 판수. 단판이면 한 판에 결판나고, 결승은 2승이 필요하다.
function pairsOf(list, bestOf) {
  const out = [];
  const bo = bestOf || 1;
  for (let i = 0; i < list.length; i += 2)
    out.push({ a: list[i], b: list[i + 1], winner: null, bestOf: bo, score: { [list[i]]: 0, [list[i + 1]]: 0 } });
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

  // 한 판을 딴 것으로 적는다. 3판 2선승이면 여기서 바로 안 끝난다.
  m.score = m.score || { [m.a]: 0, [m.b]: 0 };
  m.score[winnerSeat] = (m.score[winnerSeat] || 0) + 1;
  const need = winsNeeded(m.bestOf);
  if (m.score[winnerSeat] < need) {
    return { ok: true, advanced: false, seriesGame: true,
             score: { ...m.score }, need, matchIndex };   // 다음 판을 더 해야 한다
  }

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
  t.rounds.push(pairsOf(winners, BEST_OF[t.round]));
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
    // 3판 2선승이어도 나간 사람을 기다릴 이유가 없다 — 남은 판을 한 번에 준다.
    m.score = m.score || { [m.a]: 0, [m.b]: 0 };
    m.score[other] = winsNeeded(m.bestOf);
    m.score[seat] = Math.min(m.score[seat] || 0, winsNeeded(m.bestOf) - 1);
    m.score[other] -= 1;                       // reportWin 이 한 판을 더할 자리를 남긴다
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
      matches: ms.map((m) => ({ a: m.a, b: m.b, winner: m.winner,
                                bestOf: m.bestOf || 1, score: m.score || {} })),
    })),
    mySeat: mySeat === undefined ? null : mySeat,
    myRank: mySeat === undefined ? null : (t.rank[mySeat] || null),
  };
}

const prizeFor = (rank) => PRIZE[rank] || 0;

module.exports = {
  SIZE, ENTRY_FEE, PRIZE, PERIOD_MS, ROUND_NAMES, BEST_OF, winsNeeded, nextStartAt,
  createBracket, reportWin, forfeit, pendingMatches, curRound, seatOf, roundName, view, prizeFor,
  _shuffle: shuffle, _pairsOf: pairsOf,
};
