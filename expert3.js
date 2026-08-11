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
// 목표 세트 고르기.
// 예전엔 "가진 비율 + 2·3종에 가산점" 이라, 아무것도 없을 때 늘 2를 골랐다.
// 2세트는 덱에 두 장뿐이라 둘 다 먹어야 하는 가장 빡빡한 길인데도 그랬다.
// 그래서 첫 수가 늘 똑같았다 — "전략이 단조롭다" 의 뿌리.
//
// 이제 남은 공급으로 실현 가능성을 잰다. 필요량보다 여유가 많은 종류가 편하다.
//   2: 2장 중 2장 필요 (여유 0)   3: 5중 3 (여유 2)
//   4: 7중 4 (여유 3)             6: 10중 6 (여유 4)
function feasibleTarget(myAcq, oppAcq) {
  let best = null, bestScore = -Infinity;
  for (const [kind] of SPEC) {
    const myC = cnt(myAcq, kind), oppC = cnt(oppAcq, kind);
    if (myC >= kind) continue;
    const left = TOTAL[kind] - myC - oppC;          // 아직 내가 노릴 수 있는 장수
    const need = kind - myC;
    if (left < need) continue;                      // 상대가 너무 먹어 불가능
    // 이미 모은 비율이 가장 중요하고, 남은 여유가 다음이다
    const score = (myC / kind) * 1.0 + ((left - need) / TOTAL[kind]) * 0.45;
    if (score > bestScore) { bestScore = score; best = kind; }
  }
  return best ?? 6;
}

// 경매품이 나에게 얼마나 값나가는가 (0~1).
//
// 예전엔 카드마다 값을 매겨 Math.max 를 썼다. 그래서 6이 두 장이든 한 장이든
// 똑같이 0.167 이었다 — 같은 종류가 두 장이면 두 걸음인데 한 걸음으로 셌다.
// 이제 종류별로 몇 장인지 세서 "먹은 뒤 진행도" 로 값을 매긴다.
function wantValue(prize, myAcq, target) {
  const byKind = {};
  for (const c of prize) if (c) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  let best = 0;
  for (const k of Object.keys(byKind)) {
    const kind = +k, n = byKind[k];
    const have = cnt(myAcq, kind), need = kind - have;
    if (need <= 0) continue;                        // 이미 완성한 종류
    let v;
    if (n >= need) v = 1;                           // 이걸 먹으면 그 자리에서 완성
    else {
      // 먹은 뒤 진행도. 지수 0.8 로 살짝 오목하게 — 초반 몇 장도 값을 인정한다.
      // (선형이면 6세트 초반이 지나치게 싸 보이고, 볼록하면 더 심해진다)
      v = Math.pow((have + n) / kind, 0.8);
      if (kind === target) v += 0.07;               // 지금 노리는 길이면 조금 더
    }
    best = Math.max(best, Math.min(1, v));
  }
  return best;
}

// 상대에게 넘어가면 얼마나 아픈가. 같은 셈을 상대 기준으로 하되,
// 막는 것은 내가 먹는 것보다 값이 낮다(이득이 아니라 손실 회피라서).
function denyValue(prize, oppAcq) {
  const byKind = {};
  for (const c of prize) if (c) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  let best = 0;
  for (const k of Object.keys(byKind)) {
    const kind = +k, n = byKind[k];
    const have = cnt(oppAcq, kind), need = kind - have;
    if (need <= 0) continue;
    let v;
    if (n >= need) v = 0.95;                        // 넘기면 상대가 바로 이긴다
    else if (need - n === 1) v = 0.62;              // 넘기면 상대가 한 장 남는다
    else v = Math.pow((have + n) / kind, 0.8) * 0.55;
    best = Math.max(best, Math.min(1, v));
  }
  return best;
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

// 져도 상대의 배팅 카드를 받는다(교환). 예전엔 진 경우를 0점으로 뒀는데,
// 그러면 "일부러 세게 불러 상대의 강카드를 빼내는" 수가 아예 안 보인다.
// 상대가 2-1 을 던져 나를 이기면 그 2-1 이 내 손으로 온다 — 판이 뒤집힌다.
function recvValue(c, myTarget, myAcq) {
  if (!c) return 0;
  let v = power(c) * 0.40;                       // 강할수록 다음 판에 쓸 무기
  if (c.kind === myTarget) {
    const need = c.kind - cnt(myAcq, c.kind);
    if (need > 0) v += 0.18 / need;              // 내 목표 종류면 세트에도 보탬
  }
  return v;
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
  // 종반 완전 시뮬(롤아웃) 범위. 3 → 5 로 넓히니 맞대결 승률이 2%p 올랐다.
  // 이 구간은 수가 적어 끝까지 읽는 게 표본 추정보다 정확하다.
  const endgame = view.deckLeft <= 5;
  const SAMPLES = endgame ? 60 : 96;

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
        // 지면 상대 카드를 받는다 — 0 이 아니다
        sc = (win ? prizeVal : recvValue(oppBid, myTarget, view.myAcq))
             - bidCost(c, myTarget, view.myAcq, view.oppAcq);
      }
      scores.set(c.id, scores.get(c.id) + sc);
    }
  }
  // 예전엔 "8% 확률로, 5% 이내면 2등" 이라 사실상 늘 1등이었다.
  // 비슷한 후보들 중에서 고르게 바꿔 같은 판에서도 수가 갈리게 한다.
  const scored = [...candidates].map((c) => ({ c, s: scores.get(c.id) }))
    .sort((a, b) => b.s - a.s);
  return pickNear(scored, 0.06);
}

// 점수가 비슷한 후보 중에서 고른다.
// 늘 1등만 두면 같은 판에서 늘 같은 수가 나와 읽힌다("전략이 단조롭다").
// 그렇다고 아무렇게나 섞으면 약해진다. 그래서 1등과의 격차가 tol 안인 것만
// 후보로 두고, 그 안에서 점수에 비례해 뽑는다 — 나쁜 수는 애초에 안 들어온다.
function pickNear(scored, tol) {
  if (scored.length <= 1) return scored[0] && scored[0].c;
  const top = scored[0].s;
  const span = Math.max(Math.abs(top), 1e-6);
  const near = scored.filter((x) => (top - x.s) / span <= tol);
  if (near.length === 1) return near[0].c;
  // 1등에 가까울수록 잘 뽑히게 가중치를 준다
  const w = near.map((x) => Math.pow(1 - (top - x.s) / (span * tol + 1e-9), 2) + 0.15);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < near.length; i++) { r -= w[i]; if (r <= 0) return near[i].c; }
  return near[0].c;
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
  // 8% 안쪽으로 비슷한 것들 중에서 고른다 — 같은 판이라도 수가 갈린다
  return pickNear(scored, 0.08);
}

// ── 경매 방식 결정 (v3) ──────────────────────────────────────
// 클로즈=내 배팅이 상대에게 먼저 공개(최소승리 당함) + 출품 은닉 / 오픈=배팅 은닉 + 출품 공개
// 경매 방식 고르기.
//
// 오픈  = 출품 카드가 보인다 · 배팅은 서로 못 본다
// 클로즈 = 출품 카드를 숨긴다 · 내 배팅을 상대가 먼저 본다(최소 승리 당함)
//
// 재 보니 진행자에게 클로즈는 거의 언제나 손해다.
//   항상 오픈 vs 항상 클로즈 = 76.7%
//   항상 오픈 vs 옛 규칙     = 54.7%
// 출품을 숨겨 얻는 이득보다, 내 배팅을 먼저 보여 최소 승리를 당하는 손해가 크다.
// 문턱을 0·0.15·0.25·0.35 로 바꿔 봐도 전부 "항상 오픈" 과 같았다(50%) —
// 클로즈가 이득인 구간이 아예 없다는 뜻이다.
//
// 그래도 아주 낮은 값일 때만 남겨 둔다. 어차피 못 가져갈 판이라 손해가 없고,
// 클로즈를 통째로 없애면 그 방식 자체가 판에서 사라져 게임이 단조로워진다.
function typeV3(view, mem) {
  const prize = [view.center, view.offered].filter(Boolean);
  const myTarget = feasibleTarget(view.myAcq, view.oppAcq);
  const myVal = Math.max(wantValue(prize, view.myAcq, myTarget), denyValue(prize, view.oppAcq));
  // 첫 턴은 무조건 오픈 (정보 없는 클로즈는 후공 최소승리에 일방적으로 당한다)
  if (view.myAcq.length + view.oppAcq.length === 0) return 'open';
  if (myVal < 0.25) return 'closed';           // 못 가져갈 판 — 싸게 넘긴다

  // 변칙 — 세트에 가까울 때 이따금 클로즈로 간다.
  //
  // 클로즈는 내 배팅을 먼저 보여 주는 대신 출품을 숨긴다. 그래서 세트가
  // 임박했을 때 일부러 세게 불러 상대의 강카드를 빼내는 수가 된다
  // (배팅 카드는 교환되므로, 상대가 2-1 로 나를 이기면 그 2-1 이 내 손에 온다).
  //
  // 다만 AI 끼리는 보이는 배팅에 최소 승리로 완벽 대응해서 이 수가 잘 안 통한다.
  // 섞는 비율별로 3200판씩 재 보니 10% 까지는 손해가 없고(48.6% ↔ 48.6%),
  // 20% 부터 밀리기 시작해 30% 면 2%p 손해다. 그래서 10% 로 둔다.
  // 사람 상대로는 읽히지 않는 값이 되고, AI 상대로는 잃는 게 없다.
  const have = cnt(view.myAcq, myTarget);
  const near = (myTarget - have) <= 2;
  if (near && Math.random() < 0.10) return 'closed';
  return 'open';
}

module.exports = {
  createMem, noteSettle, bidV3, offerV3, typeV3,
  // 내부 재사용 (sim/서버에서 oppValEst 계산용)
  feasibleTarget, wantValue, denyValue, power,
};
