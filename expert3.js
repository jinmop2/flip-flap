// FLIP FLAP 전문가 AI v3 — server.js와 sim.js가 공유
// 핵심: ① 카드 카운팅(공개 정보 완전 추적) ② 몬테카를로 EV 배팅(배신 저격/방어가 자연 창발)
//       ③ 종반 확정화 롤아웃(덱≤3 완전 시뮬) ④ 상대 성향 학습(블러핑 빈도)
//       ⑤ 교환 인식(배팅 카드가 상대 손으로 감 → 무장 비용 반영) ⑥ 패턴 랜덤화
// 치팅 없음: 자기 손패 + 공개 정보(획득·중앙·리빌된 배팅/출품)만 사용.

const SPEC = [[2, 2], [3, 5], [4, 7], [6, 10]];
const TOTAL = { 2: 2, 3: 5, 4: 7, 6: 10 };
const strength = c => c.kind * 100 + c.grade;
const is610 = c => c.kind === 6 && c.grade === 10;
const is21 = c => c.kind === 2 && c.grade === 1;
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}
// 전체 24장 (불변)
const ALL = (() => {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind * 100 + g });
  return cards;
})();
// 배팅 서열 파워 0~1 (2-1=1.0 … 6-10≈0)
const RANK = new Map([...ALL].sort((a, b) => strength(a) - strength(b)).map((c, i) => [c.id, 1 - i / 23]));
const power = c => RANK.get(c.id) || 0;

const cnt = (acq, kind) => acq.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0);
function feasibleTarget(myAcq, oppAcq) {
  let best = null, bestScore = -1;
  for (const [kind] of SPEC) {
    const myC = cnt(myAcq, kind), oppC = cnt(oppAcq, kind);
    if (TOTAL[kind] - oppC < kind) continue;
    if (myC >= kind) continue;
    const score = myC / kind + (kind <= 3 ? 0.04 : 0);
    if (score > bestScore) { bestScore = score; best = kind; }
  }
  return best ?? 6;
}
function wantValue(prize, myAcq, target) {
  let v = 0;
  for (const c of prize) {
    if (!c) continue;
    const need = c.kind - cnt(myAcq, c.kind);
    let cv = need <= 0 ? 1 : 1 / need;
    if (c.kind === target) cv = Math.max(cv, 0.75);
    if (need === 1) cv = Math.max(cv, 0.97);
    v = Math.max(v, cv);
  }
  return v;
}
function denyValue(prize, oppAcq) {
  let v = 0;
  for (const c of prize) {
    if (!c) continue;
    const need = c.kind - cnt(oppAcq, c.kind);
    if (need === 1) v = Math.max(v, 0.88);
    else if (need === 2) v = Math.max(v, 0.45);
  }
  return v;
}

// ── 메모리 (게임당 1개) ──────────────────────────────────────
function createMem() {
  return {
    knownOpp: new Set(),            // 확실히 상대 손에 있는 카드 id (내가 배팅으로 넘긴 것)
    stats: { lowN: 0, lowStrong: 0 }, // 저가치 판 배팅 관찰 → 블러핑 빈도 추정
  };
}
// 정산(reveal) 시 호출 — 전부 공개된 정보만 기록
// view: { myBid, oppBid, offered, offeredByMe, oppValEst }
function noteSettle(mem, { myBid, oppBid, offered, offeredByMe, oppValEst }) {
  if (myBid) mem.knownOpp.add(myBid.id);            // 교환으로 상대 손으로
  if (oppBid) mem.knownOpp.delete(oppBid.id);       // 상대 손에서 나옴
  if (offered && !offeredByMe) mem.knownOpp.delete(offered.id);
  if (oppBid && typeof oppValEst === 'number' && oppValEst < 0.35) {
    mem.stats.lowN++;
    if (power(oppBid) > 0.6) mem.stats.lowStrong++; // 저가치 판에 강카드 = 블러핑 성향
  }
}
// 관찰 기반 상대 블러핑 확률 (기본 0.1, 관찰로 보정)
function bluffEst(mem) {
  const { lowN, lowStrong } = mem.stats;
  if (lowN < 3) return 0.1;
  return Math.min(0.5, Math.max(0.02, lowStrong / lowN));
}

// ── 카운팅: 미지 풀(상대 미확인 손패 ∪ 덱) 계산 ──────────────
// view: { hand, myAcq, oppAcq, center, offered, visOpp, oppHandLen }
function unknownPool(view, mem) {
  const gone = new Set();
  for (const c of view.hand) gone.add(c.id);
  for (const c of view.myAcq) gone.add(c.id);
  for (const c of view.oppAcq) gone.add(c.id);
  for (const id of mem.knownOpp) gone.add(id);
  if (view.center) gone.add(view.center.id);
  if (view.offered) gone.add(view.offered.id);
  if (view.visOpp) gone.add(view.visOpp.id);
  return ALL.filter(c => !gone.has(c.id));
}
// 상대 손 샘플링 (알려진 카드 + 미지 풀에서 부족분 추출)
function sampleOppHand(pool, mem, view) {
  const known = [];
  for (const id of mem.knownOpp) {
    const c = ALL.find(x => x.id === id);
    if (c) known.push(c);
  }
  let k = Math.max(0, (view.oppHandLen || 0) - known.length);
  k = Math.min(k, pool.length);
  // 부분 셔플 추출
  const idx = [...pool.keys()];
  const picked = [];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
    picked.push(pool[idx[i]]);
  }
  return known.concat(picked);
}

// ── 상대 배팅 모델 (샘플 손패 기준) ──────────────────────────
// visMyBid: 클로즈에서 내가 진행자(선공)라 상대가 내 배팅을 보고 침
function modelOppBid(oppHand, oppVal, visMyBid, bluffP) {
  if (!oppHand.length) return null;
  const s = [...oppHand].sort((a, b) => strength(a) - strength(b)); // 강→약
  if (visMyBid) {
    if (oppVal >= 0.3) {
      const winners = s.filter(c => aBeatsB(c, visMyBid));
      if (winners.length) return winners[winners.length - 1];      // 최소 승리
    }
    return s[s.length - 1];                                        // 포기 덤핑 (6-10이면 배신 위협!)
  }
  if (Math.random() < bluffP && oppVal < 0.5) return s[0];         // 블러핑 강배팅
  if (oppVal >= 0.8) return s[0];
  if (oppVal >= 0.55) return s[Math.min(1, s.length - 1)];
  if (oppVal >= 0.3) return s[Math.floor(s.length / 2)];
  return s[s.length - 1];
}

// ── 내가 카드를 넘길 때의 비용 (교환 인식) ───────────────────
function bidCost(c, myTarget, myAcq, oppAcq) {
  let cost = power(c) * 0.5;                                       // 강카드 상실+상대 무장
  if (c.kind === myTarget) {
    const need = c.kind - cnt(myAcq, c.kind);
    cost += need > 0 ? 0.3 / need : 0;                             // 내 목표 종류 유출
  }
  const oppNeed = c.kind - cnt(oppAcq, c.kind);
  if (oppNeed === 1) cost += 0.3;                                  // 상대 완성 종류 헌납 위험
  else if (oppNeed === 2) cost += 0.12;
  return cost;
}

// ── 종반 확정화 롤아웃 (그리디 정책 자가 플레이) ─────────────
function greedyBid(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const s = [...hand].sort((a, b) => strength(a) - strength(b));
  let val = Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, oppAcq)), denyValue(prize, oppAcq));
  if (myAcq.length <= oppAcq.length || deckLeft <= 5) val = Math.max(val, deckLeft <= 5 ? 0.5 : 0.42);
  if (visOpp) {
    if (val < 0.3) return s[s.length - 1];
    const w = hand.filter(c => aBeatsB(c, visOpp)).sort((a, b) => strength(b) - strength(a));
    return w.length ? w[0] : s[s.length - 1];
  }
  if (val >= 0.8) return s[0];
  if (val >= 0.55) return s[Math.min(1, s.length - 1)];
  if (val >= 0.3) return s[Math.floor(s.length / 2)];
  return s[s.length - 1];
}
function greedyOffer(hand, myAcq, oppAcq) {
  const t = feasibleTarget(myAcq, oppAcq);
  let pool = hand.filter(c => c.kind !== t);
  if (!pool.length) pool = hand.slice();
  const safe = pool.filter(c => c.kind - cnt(oppAcq, c.kind) !== 1);
  const use = safe.length ? safe : pool;
  return [...use].sort((a, b) => strength(b) - strength(a))[0];
}
const checkSet = acq => { const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1; for (const [k] of SPEC) if ((c[k] || 0) >= k) return k; return null; };
const prog = acq => { const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1; let b = 0; for (const [k] of SPEC) b = Math.max(b, (c[k] || 0) / k); return [b, acq.length]; };
function endScore(myAcq, oppAcq) {   // 1 승 / 0.4 무 / 0 패
  if (checkSet(myAcq)) return 1;
  if (checkSet(oppAcq)) return 0;
  const a = prog(myAcq), b = prog(oppAcq);
  if (a[0] !== b[0]) return a[0] > b[0] ? 0.85 : 0.05;
  if (a[1] !== b[1]) return a[1] > b[1] ? 0.85 : 0.05;
  return 0.4;
}
// 현재 경매를 (myBid vs oppBid)로 정산한 뒤 남은 게임을 그리디로 완주
function rolloutAfter(myBid, oppBid, view, world) {
  // world: { deck(추정), oppHand(샘플, oppBid 포함) }
  let myHand = view.hand.filter(c => c.id !== myBid.id);
  let oppHand = world.oppHand.filter(c => c.id !== oppBid.id);
  let myAcq = view.myAcq.slice(), oppAcq = view.oppAcq.slice();
  const items = [view.center, view.offered || world.offered].filter(Boolean);
  if (aBeatsB(myBid, oppBid)) myAcq.push(...items); else oppAcq.push(...items);
  myHand = myHand.concat([oppBid]); oppHand = oppHand.concat([myBid]);   // 교환
  if (checkSet(myAcq)) return 1;
  if (checkSet(oppAcq)) return 0;
  let deck = world.deck.slice();
  // 다음 진행자는 교대 — 이번 턴 진행자가 나였는지로 결정
  let auc = view.isAuctioneer ? 1 : 0;   // 0=나, 1=상대
  let guard = 0;
  while (guard++ < 20) {
    if (!deck.length) return endScore(myAcq, oppAcq);
    const center = deck.shift();
    const aucHand = auc === 0 ? myHand : oppHand;
    const aucAcq = auc === 0 ? myAcq : oppAcq;
    const defAcq = auc === 0 ? oppAcq : myAcq;
    if (!aucHand.length) return endScore(myAcq, oppAcq);
    const off = greedyOffer(aucHand, aucAcq, defAcq);
    aucHand.splice(aucHand.indexOf(off), 1);
    const prize = [center, off];
    const defHand = auc === 0 ? oppHand : myHand;
    if (!aucHand.length || !defHand.length) return endScore(myAcq, oppAcq);
    const bidA = greedyBid(aucHand, prize, aucAcq, defAcq, null, deck.length);
    aucHand.splice(aucHand.indexOf(bidA), 1);
    const bidD = greedyBid(defHand, prize, defAcq, aucAcq, bidA, deck.length);  // 클로즈 가정(후공 정보우위)
    defHand.splice(defHand.indexOf(bidD), 1);
    if (aBeatsB(bidA, bidD)) aucAcq.push(...prize); else defAcq.push(...prize);
    defHand.push(bidA); aucHand.push(bidD);
    if (checkSet(myAcq)) return 1;
    if (checkSet(oppAcq)) return 0;
    auc = 1 - auc;
  }
  return endScore(myAcq, oppAcq);
}

// ── 배팅 결정 (v3 메인) ──────────────────────────────────────
// view: { hand, myAcq, oppAcq, center, offered(모르면 null), visOpp(보이면 카드),
//         auctionType, isAuctioneer, deckLeft, oppHandLen }
function bidV3(view, mem) {
  const hand = view.hand;
  if (hand.length === 1) return hand[0];
  const myTarget = feasibleTarget(view.myAcq, view.oppAcq);
  const prizeKnown = [view.center, view.offered].filter(Boolean);
  let myVal = Math.max(wantValue(prizeKnown, view.myAcq, myTarget), denyValue(prizeKnown, view.oppAcq));
  // 캐치업: 열세·종반이면 템포 가치 상승
  const behind = view.myAcq.length <= view.oppAcq.length;
  const late = view.deckLeft <= 5;
  if (behind || late) myVal = Math.max(myVal, late ? 0.5 : 0.42);

  const pool = unknownPool(view, mem);
  const bluffP = bluffEst(mem);
  const endgame = view.deckLeft <= 3;
  const SAMPLES = endgame ? 40 : 64;

  // 상대가 보는 경매품 (클로즈면 출품 카드 안 보임 → 상대는 중앙만으로 판단)
  const prizeForOpp = view.auctionType === 'open' || !view.isAuctioneer
    ? prizeKnown : [view.center];
  const oppVal = Math.max(
    wantValue(prizeForOpp, view.oppAcq, feasibleTarget(view.oppAcq, view.myAcq)),
    denyValue(prizeForOpp, view.myAcq)
  );

  // 클로즈 후공(상대 배팅 보임): 결정적 승패 → 최소 승리 or 덤핑, 종반이면 롤아웃로 확인
  if (view.visOpp && !endgame) {
    const winners = hand.filter(c => aBeatsB(c, view.visOpp)).sort((a, b) => strength(b) - strength(a));
    const weakest = [...hand].sort((a, b) => strength(b) - strength(a))[0];
    if (myVal < 0.3 || !winners.length) return weakest;
    // 최소 승리 후보 vs 덤핑: 비용 대비 이득 비교
    const w = winners[0];
    const gain = myVal + 0.15;                       // 경매품 + 템포
    return gain > bidCost(w, myTarget, view.myAcq, view.oppAcq) * 0.9 ? w : weakest;
  }

  // 후보 (중복 제거 없이 손패 그대로 — 24장 전부 유니크)
  const candidates = hand;
  const scores = new Map();
  for (const c of candidates) scores.set(c.id, 0);

  for (let s = 0; s < SAMPLES; s++) {
    const oppHand = sampleOppHand(pool, mem, view);
    if (!oppHand.length) break;
    // 미지 출품 카드(클로즈 후공): 풀에서 하나 가정
    let offered = view.offered;
    let deckPool = pool.filter(c => !oppHand.includes(c));
    if (!offered && deckPool.length) offered = deckPool[Math.floor(Math.random() * deckPool.length)];
    if (!offered) offered = null;
    const deck = deckPool.filter(c => c !== offered);
    // 덱 크기 맞추기 (남은 미지 카드 중 덱에 있는 것)
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const deckSlice = deck.slice(0, view.deckLeft);

    for (const c of candidates) {
      const visMyBid = (view.auctionType === 'closed' && view.isAuctioneer) ? c : null;
      const oppBid = view.visOpp || modelOppBid(oppHand, oppVal, visMyBid, bluffP);
      if (!oppBid) continue;
      let sc;
      if (endgame) {
        sc = rolloutAfter(c, oppBid, view, { deck: deckSlice, oppHand, offered });
      } else {
        const win = aBeatsB(c, oppBid);
        const prizeVal = myVal + denyValue(prizeKnown, view.oppAcq) * 0.3 + 0.15; // 획득+저지+템포
        sc = (win ? prizeVal : 0) - bidCost(c, myTarget, view.myAcq, view.oppAcq);
      }
      scores.set(c.id, scores.get(c.id) + sc);
    }
  }
  const ranked = [...candidates].sort((a, b) => scores.get(b.id) - scores.get(a.id));
  // 패턴 랜덤화: 근소 차이(5% 이내)면 가끔 2등 선택
  if (ranked.length > 1 && Math.random() < 0.08) {
    const a = scores.get(ranked[0].id), b = scores.get(ranked[1].id);
    if (a !== 0 && Math.abs(a - b) / Math.max(Math.abs(a), 1e-9) < 0.05) return ranked[1];
  }
  return ranked[0];
}

// ── 출품 결정 (v3): 목표 보존 + 상대 저지 + 매집 + 최약 방출 ──
function offerV3(view, mem) {
  const hand = view.hand;
  const myTarget = feasibleTarget(view.myAcq, view.oppAcq);
  const scored = hand.map(c => {
    let s = 0;
    s += (1 - power(c)) * 1.0;                                   // 약할수록 방출 적합
    if (c.kind === myTarget) {
      const need = c.kind - cnt(view.myAcq, c.kind);
      s -= need > 0 ? 1.2 / need : 0;                            // 내 목표 종류 보존
    }
    const oppNeed = c.kind - cnt(view.oppAcq, c.kind);
    if (oppNeed === 1) s -= 2.0;                                 // 상대 완성 카드 절대 회피
    else if (oppNeed === 2) s -= 0.7;                            // 매집(호딩): 임박 2장 전부터 조임
    else if (oppNeed === 3) s -= 0.2;
    return { c, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0].c;
}

// ── 경매 방식 결정 (v3) ──────────────────────────────────────
// 클로즈=내 배팅이 상대에게 먼저 공개(최소승리 당함) + 출품 은닉 / 오픈=배팅 은닉 + 출품 공개
function typeV3(view, mem) {
  const prize = [view.center, view.offered].filter(Boolean);
  const myTarget = feasibleTarget(view.myAcq, view.oppAcq);
  const myVal = Math.max(wantValue(prize, view.myAcq, myTarget), denyValue(prize, view.oppAcq));
  // 첫 턴 진행자는 오픈: 정보 없는 1턴 클로즈는 후공 최소승리에 일방적으로 당함
  // (시뮬 4000판: 선공 승률 36.5%→43.3%, 2턴까지 확장하면 오히려 손해라 1턴만)
  if (view.myAcq.length + view.oppAcq.length === 0) return 'open';
  if (myVal >= 0.5) return 'open';                               // 갖고 싶다 → 내 강배팅 숨김
  const oppNeedOff = view.offered ? view.offered.kind - cnt(view.oppAcq, view.offered.kind) : 9;
  if (oppNeedOff <= 2) return 'closed';                          // 상대가 탐낼 출품 → 숨겨서 경합 차단
  return 'closed';                                               // 저가치 → 싸게 정리
}

module.exports = {
  createMem, noteSettle, bidV3, offerV3, typeV3,
  // 내부 재사용 (sim/서버에서 oppValEst 계산용)
  feasibleTarget, wantValue, denyValue, power,
};
