// ── 다인전 화면 상태 ──────────────────────────────────────────────────────
//
// 판(game4)에서 "이 자리가 볼 수 있는 것" 만 골라내는 곳이다. 서버가 온라인
// 멀티에 쓰고, 화면이 그물 없이 둘 때 쓴다 — 같은 파일이라야 온라인과
// 오프라인이 같은 모양으로 그려진다.
//
// 가리는 것
//   · 남의 손패 — 어떤 경우에도 안 나간다
//   · 클로즈에서 누가 "산다" 고 했는지 — 다 답하기 전까지는 누가 답했는지만 보인다
//   · AI 가 속으로 정한 한도(aiW) — 화면으로 나가면 그걸 보고 두면 그만이다
// 보이는 것: 칩·금고·딴 카드는 모두에게 공개다 — 값을 부르려면 남의 형편을 알아야 한다.
//
// 프로필 카드는 계정 표를 봐야 해서 서버만 만들 수 있다. 그래서 만드는 함수를
// 밖에서 받는다 — 화면 쪽은 안 넘기면 그냥 비어 있다.
// __ff_wrapped — 서버와 브라우저가 같은 파일을 읽는다.
(function () {
'use strict';
const __ff_m = (typeof module !== 'undefined' && module.exports) ? module : { exports: {} };
const G = (typeof require === 'function') ? require('./game4') : window.GAME4;

function make(publicCard) {
  if (typeof publicCard !== 'function') publicCard = () => null;

  function auctionView(g, me) {
    const a = g.auction; if (!a) return null;
    const settled = a.winner !== undefined;
    return {
      center: a.center, offered: a.offered, type: a.type, tiebreak: !!a.tiebreak,
      price: a.price, high: a.high, bids: { ...a.bids }, out: [...(a.out || [])],
      turnSeat: g.phase === 'open' ? a.turnSeat : null,
      closeP: a.closeP,
      // 클로즈 — 다 모이기 전에는 "답했다" 는 사실만. 내 답은 나에게 보인다.
      answered: Object.keys(a.answers || {}).map(Number),
      myAnswer: (me !== null && me !== undefined && a.answers && a.answers[me] !== undefined) ? a.answers[me] : null,
      buyers: a.buyers || null,
      winner: settled ? a.winner : null, paid: settled ? a.paid : null,
    };
  }

  // me 좌석 시점으로만 만든다. me 가 null 이면 관전(손패 없음).
  function stateFor(g, me, rp, room) {
    const watching = me === null || me === undefined;
    return {
      me: watching ? null : me, n: g.n, turn: g.turn, phase: g.phase, auctioneer: g.auctioneer,
      deckLeft: g.deck.length, hand: G.HAND, need: G.NEED,
      myHand: watching ? [] : g.seats[me].hand,
      canClose: g.phase === 'choose_type' && G.canClose(g),
      income: g.lastIncome || null,                  // 이번 턴 시작에 받은 금고 수입 (연출용)
      seats: g.seats.map((s, i) => {
        const v = G.vaultsOf(s.acq);
        return {
          name: s.name, isBot: s.isBot, handLen: s.hand.length, acq: s.acq, chips: s.chips,
          vaults: v, income: G.income(v), counts: G.counts(s.acq), need: G.needLeft(s.acq),
          // 이름을 눌렀을 때 보여줄 정보. 토큰은 방 자리(room.seats)에 있다.
          profile: (!s.isBot && room && room.seats[i] && room.seats[i].token) ? publicCard(room.seats[i].token) : null,
        };
      }),
      auction: auctionView(g, me),
      clock: g.clock || null,
      waitSeat: (room && room.waitSeat !== undefined) ? room.waitSeat : null,
      waitLeft: (room && room.waitUntil) ? Math.max(0, Math.round((room.waitUntil - Date.now()) / 1000)) : null,
      result: (g.phase === 'settled' || g.phase === 'game_over') ? g.lastResult : null,
      over: g.over, rp: rp || null, watching,
    };
  }

  // 관전자 — 어느 자리도 아니다. 손패도 클로즈 답도 안 보인다.
  function stateForSpec(g, rp, room) { return stateFor(g, null, rp, room); }

  return { stateFor, stateForSpec };
}

__ff_m.exports = { make };
if (typeof window !== 'undefined') window.VIEW4 = __ff_m.exports;
})();
