// 전문가 AI 맞대결 — 두 버전을 좌석을 바꿔가며 같은 덱으로 붙인다.
//
// 왜 이렇게까지 하나:
//   · 이 게임은 선공(진행자)이 유리하다. 한쪽만 선공으로 재면 실력이 아니라
//     자리를 재게 된다. 그래서 같은 덱으로 좌석을 바꿔 두 판씩 치른다.
//   · 덱이 다르면 운이 섞인다. 판마다 시드를 고정해 두 버전이 똑같은 패를 본다.
//   · 예전에 "도전자 1명 vs 나머지" 로 쟀다가, 서로가 서로를 이기는 결과가
//     나온 적이 있다(비추이적). 맞대결만 믿는다.
//
// 실행: node tools/duel.js [판수] [A파일] [B파일]
//   예: node tools/duel.js 400 expert3.js expert4.js

const path = require('path');
const ROOT = path.join(__dirname, '..');

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];
const strength = (c) => c.kind * 100 + c.grade;
const is610 = (c) => c.kind === 6 && c.grade === 10;
const is21 = (c) => c.kind === 2 && c.grade === 1;
// 졸개의 배신 — 순환 관계라 정렬 기준으로 쓰면 안 된다. 두 장 비교에만.
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}
const checkSet = (acq) => {
  const c = {};
  for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1;
  for (const [k] of SPEC) if ((c[k] || 0) >= k) return k;
  return null;
};
const progress = (acq) => {
  const c = {};
  for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1;
  let best = 0;
  for (const [k] of SPEC) best = Math.max(best, (c[k] || 0) / k);
  return [best, acq.length];
};

// 시드 난수 — 같은 시드면 같은 덱. 판마다 재현된다.
function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
function dealFrom(rand) {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind * 100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { deck: cards.slice(0, 12), h1: cards.slice(12, 18), h2: cards.slice(18, 24) };
}

// 한 판. brains[0] 이 1번 자리, brains[1] 이 2번 자리.
// 서버(server.js)의 진행 규칙을 그대로 옮겼다 — 출품·경매방식·배팅·교환·종료.
function playGame(brains, seed, firstAuctioneer) {
  const rand = rngOf(seed);
  const { deck, h1, h2 } = dealFrom(rand);
  const g = {
    centerDeck: deck, hands: [h1, h2], acq: [[], []],
    auctioneer: firstAuctioneer, turn: 1,
  };
  const mems = [brains[0].createMem(), brains[1].createMem()];

  for (let guard = 0; guard < 60; guard++) {
    const set0 = checkSet(g.acq[0]), set1 = checkSet(g.acq[1]);
    if (set0) return { winner: 0, turns: g.turn, by: 'set', kind: set0 };
    if (set1) return { winner: 1, turns: g.turn, by: 'set', kind: set1 };

    const auc = g.auctioneer, oth = 1 - auc;
    // 진행자는 출품 1 + 배팅 1 = 2장, 상대는 배팅 1장이 필요하다
    if (!g.centerDeck.length || g.hands[auc].length < 2 || g.hands[oth].length < 1) break;

    const center = g.centerDeck.shift();
    const viewOf = (me, extra) => ({
      hand: g.hands[me], myAcq: g.acq[me], oppAcq: g.acq[1 - me],
      center, deckLeft: g.centerDeck.length, oppHandLen: g.hands[1 - me].length,
      isAuctioneer: me === auc, ...extra,
    });

    // ① 출품
    const offered = brains[auc].offerV3(viewOf(auc, { offered: null }), mems[auc]);
    g.hands[auc] = g.hands[auc].filter((c) => c.id !== offered.id);

    // ② 경매 방식
    const type = brains[auc].typeV3(viewOf(auc, { offered }), mems[auc]);
    const auctionType = type === 'open' ? 'open' : 'closed';

    // ③ 배팅. 클로즈는 진행자가 먼저 내고 상대가 그걸 보고 낸다.
    let bids = [null, null];
    if (auctionType === 'open') {
      bids[auc] = brains[auc].bidV3(viewOf(auc, { offered, auctionType, visOpp: null }), mems[auc]);
      bids[oth] = brains[oth].bidV3(viewOf(oth, { offered, auctionType, visOpp: null }), mems[oth]);
    } else {
      bids[auc] = brains[auc].bidV3(viewOf(auc, { offered, auctionType, visOpp: null }), mems[auc]);
      // 상대는 출품 카드를 못 본다 (클로즈)
      bids[oth] = brains[oth].bidV3(
        { ...viewOf(oth, { offered: null, auctionType, visOpp: bids[auc] }) }, mems[oth]);
    }
    for (const s of [0, 1]) g.hands[s] = g.hands[s].filter((c) => c.id !== bids[s].id);

    // ④ 낙찰 — 이긴 쪽이 경매품 2장을 가져가고, 배팅 카드는 서로 교환한다
    const p0Wins = aBeatsB(bids[0], bids[1]);
    const win = p0Wins ? 0 : 1;
    g.acq[win].push(center, offered);
    g.hands[0].push(bids[1]);
    g.hands[1].push(bids[0]);

    // 전문가 기억 갱신 (리빌에서 공개되는 정보만 — 치팅 아님)
    for (const s of [0, 1]) {
      if (!brains[s].noteSettle) continue;
      const oppAcq = g.acq[1 - s], myAcq = g.acq[s];
      const oppValEst = Math.max(
        brains[s].wantValue([center, offered], oppAcq, brains[s].feasibleTarget(oppAcq, myAcq)),
        brains[s].denyValue([center, offered], myAcq));
      brains[s].noteSettle(mems[s], {
        myBid: bids[s], oppBid: bids[1 - s], offered,
        offeredByMe: auc === s, oppValEst,
      });
    }

    g.auctioneer = 1 - g.auctioneer;
    g.turn++;
  }

  // 진행 불가 — 세트 근접도로 판정 (서버와 같은 규칙)
  const a = progress(g.acq[0]), b = progress(g.acq[1]);
  if (a[0] !== b[0]) return { winner: a[0] > b[0] ? 0 : 1, turns: g.turn, by: 'prog' };
  if (a[1] !== b[1]) return { winner: a[1] > b[1] ? 0 : 1, turns: g.turn, by: 'prog' };
  return { winner: -1, turns: g.turn, by: 'draw' };
}

// A 와 B 를 좌석·선공을 모두 바꿔가며 붙인다.
// 한 시드마다 4판(A선공/B선공 × A가1번/B가1번)을 치러 자리 이점을 상쇄한다.
function duel(A, B, games, baseSeed = 12345) {
  const rec = { a: 0, b: 0, draw: 0, turns: 0, n: 0, bySet: 0 };
  const seeds = Math.max(1, Math.ceil(games / 4));
  for (let i = 0; i < seeds; i++) {
    const seed = baseSeed + i * 7919;
    for (const aSeat of [0, 1]) {
      for (const first of [0, 1]) {
        const brains = aSeat === 0 ? [A, B] : [B, A];
        const r = playGame(brains, seed, first);
        rec.n++; rec.turns += r.turns;
        if (r.by === 'set') rec.bySet++;
        if (r.winner === -1) rec.draw++;
        else if (r.winner === aSeat) rec.a++;
        else rec.b++;
      }
    }
  }
  return rec;
}

function pct(x, n) { return n ? (x / n * 100).toFixed(1) + '%' : '-'; }

if (require.main === module) {
  const games = Number(process.argv[2]) || 400;
  const fileA = process.argv[3] || 'expert3.js';
  const fileB = process.argv[4] || 'expert3.js';
  const A = require(path.join(ROOT, fileA));
  const B = require(path.join(ROOT, fileB));

  const t0 = Date.now();
  const r = duel(A, B, games);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n${fileA}  vs  ${fileB}`);
  console.log(`판수 ${r.n} · ${secs}초 · 평균 ${(r.turns / r.n).toFixed(1)}턴 · 세트승 ${pct(r.bySet, r.n)}`);
  console.log(`  ${fileA.padEnd(14)} ${String(r.a).padStart(4)}승  ${pct(r.a, r.n)}`);
  console.log(`  ${fileB.padEnd(14)} ${String(r.b).padStart(4)}승  ${pct(r.b, r.n)}`);
  console.log(`  무승부         ${String(r.draw).padStart(4)}      ${pct(r.draw, r.n)}`);
  // 무승부를 뺀 승률 — 이게 실력 비교의 기준
  const dec = r.a + r.b;
  console.log(`\n무승부 제외 승률: ${fileA} ${pct(r.a, dec)} / ${fileB} ${pct(r.b, dec)}`);
}

module.exports = { duel, playGame, dealFrom, rngOf };
