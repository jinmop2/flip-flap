// ── 다인전 화면 상태 ──────────────────────────────────────────────────────
//
// 판(game4)에서 "이 자리가 볼 수 있는 것" 만 골라내는 곳이다. 서버가 온라인
// 멀티에 쓰고, 화면이 그물 없이 둘 때 쓴다 — 같은 파일이라야 온라인과
// 오프라인이 같은 모양으로 그려진다.
//
// 남의 손패는 어떤 경우에도 안 나간다. 클로즈 경매에서 남의 출품과 배팅도
// 마찬가지다. 이 파일이 그 경계다.
//
// 프로필 카드는 계정 표를 봐야 해서 서버만 만들 수 있다. 그래서 만드는 함수를
// 밖에서 받는다 — 화면 쪽은 안 넘기면 그냥 비어 있다.
// __ff_wrapped — 서버와 브라우저가 같은 파일을 읽는다. 감싸지 않으면
// top-level const 가 브라우저 전역으로 새어 client.js 와 부딪힌다.
(function () {
'use strict';
const __ff_m = (typeof module !== 'undefined' && module.exports) ? module : { exports: {} };
const G = (typeof require === 'function') ? require('./game4') : window.GAME4;

function make(publicCard) {
  if (typeof publicCard !== 'function') publicCard = () => null;

  // me 좌석 시점으로만 만든다. 남의 손패는 어떤 경우에도 내보내지 않는다.
  function stateFor(g, me, rp, room) {
    const a = g.auction;
    const reveal = g.phase === 'reveal' || g.phase === 'settled' || g.phase === 'game_over';
    const openedList = G.openedBids(g);
    const openOffer = a && (a.type === 'open' || g.auctioneer === me || reveal);
    return {
      me, n: g.n, spec: g.spec, turn: g.turn, phase: g.phase, auctioneer: g.auctioneer, deckLeft: g.deck.length,
      bidders: G.bidderSeats(g), myHand: g.seats[me].hand,
      seats: g.seats.map((s, i) => ({
        name: s.name, isBot: s.isBot, handLen: s.hand.length, acq: s.acq,
        // 이름을 눌렀을 때 보여줄 정보. 손패 같은 건 절대 안 실린다 —
        // 여기 넣는 건 상대에게 그대로 보이는 값이다.
        //
        // 토큰은 게임 자리(g.seats)가 아니라 방 자리(room.seats)에 있다.
        // g.seats 에서 찾다가 늘 null 이 나와 상대가 "게스트" 로만 보였다.
        profile: (!s.isBot && room && room.seats[i] && room.seats[i].token)
          ? publicCard(room.seats[i].token) : null,
        need: G.needLeft(s.acq), bidded: !!(a && a.bids[i]),
      })),
      auction: a ? {
        center: a.center,
        offered: openOffer ? a.offered : null,
        // 클로즈에서 남의 출품은 가려야 하지만, "아직 안 냈다" 와 "냈는데 안 보인다" 는
        // 다르다. 화면이 빈 자리와 뒷면을 구분해 그릴 수 있게 존재 여부만 따로 준다.
        hasOffer: !!a.offered,
        type: a.type,
        // 오픈은 전원 뒤집어 냈다가 한 번에 공개.
        // 클로즈는 순서대로 한 명씩 공개 — 이미 낸 사람 것만 보인다.
        bids: reveal ? { ...a.bids }
                     : Object.fromEntries(openedList.map((e) => [e.seat, e.card])),
        closed: !!a.closed,
        seq: a.seq || null,
        turnToBid: G.turnToBid(g),
      } : null,
      // 지금 누구를 몇 초 기다리는지 — 화면에 남은 시간을 보여주려고
      clock: g.clock || null,
      waitSeat: (room && room.waitSeat !== undefined) ? room.waitSeat : null,
      waitLeft: (room && room.waitUntil) ? Math.max(0, Math.round((room.waitUntil - Date.now()) / 1000)) : null,
      result: (g.phase === 'settled' || g.phase === 'game_over') ? g.lastResult : null,
      over: g.over, rp: rp || null,
    };
  }

  // 관전자가 볼 상태. 자리 0 시점을 빌리되 손패는 지운다 —
  // 관전은 남의 패를 보는 자리가 아니다.
  function stateForSpec(g, rp, room) {
    const st = stateFor(g, 0, rp, room);
    st.myHand = [];
    st.me = null;
    st.watching = true;
    // 자리 0 을 빌려 왔다는 게 함정이다. 진행자가 마침 0 번이면 stateFor 가
    // "내가 진행자니까" 하고 클로즈 출품 카드를 열어 준다 — 그게 그대로
    // 관전자 전원에게 나간다. 관전자는 어느 자리도 아니므로 여기서 다시 덮는다.
    if (st.auction && g.auction) {
      const open = g.auction.type === 'open'
                || g.phase === 'reveal' || g.phase === 'settled' || g.phase === 'game_over';
      if (!open) st.auction.offered = null;
    }
    return st;
  }

  return { stateFor, stateForSpec };
}

__ff_m.exports = { make };
if (typeof window !== 'undefined') window.VIEW4 = __ff_m.exports;
})();
