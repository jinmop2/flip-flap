// 토큰 다인전 — 설계용 시뮬레이터. 게임에는 붙지 않는다.
//
// 무엇을 정하려는가: 카드를 손패 대신 칩(토큰)으로 사는 3·4인 경매의
// 카드 구성과 규칙. 숫자(등급)는 없다 — 카드는 종류만 있다.
// 그리고 한 종류를 더 넣는다: 금고(수입) 카드. 가지고 있으면 매 턴 칩이 들어온다.
//
// 규칙 뼈대 (TWELVE 를 여럿으로 넓힌 것)
//   · 손패 H 장씩, 중앙 덱 N×H 장 — 경매마다 중앙 1장 + 출품 1장이 나가서
//     둘이 같은 때 떨어진다. 끝날 때 안 쓰는 카드가 없다.
//   · 매 턴 시작에 금고 하나당 y 칩을 받는다.
//   · 진행자: 중앙에서 한 장 뒤집고, 손패에서 한 장 더해 경매품 두 장.
//   · 오픈 — 돌아가며 1씩 올리거나 빠진다. 마지막 한 명이 산다.
//     클로즈 — 진행자가 짝수 P 를 한 번 부른다. 왼쪽부터 P+1 에 살 수 있고,
//             아무도 안 사면 진행자가 P 에 가져간다.
//   · 낸 칩은 은행으로 사라진다. 진 사람이 얼마를 내는지는 규칙 후보(lose)다.
//   · 세트(2종 2장·3종 3장·4종 4장·6종 6장)를 채우면 그 자리에서 이긴다.
//     덱이 떨어지면 세트에 가까운 사람 → 모은 비율 → 장수 → 칩 순.
//
// ── 결론 (시뮬레이션으로 정함 — 아래 FINAL3 / FINAL4) ─────────────────────────
//   4인: 손패 4 · 32장 = 2종 3 / 3종 6 / 4종 8 / 6종 13 + 금고 2 · 칩 30
//   3인: 손패 4 · 24장 = 2종 2 / 3종 4 / 4종 6 / 6종 10 + 금고 2 · 칩 25
//        3인 덱은 4인 덱에서 8장(2·3·3·4·4·6·6·6)을 뺀 것 — 한 벌로 두 인원을 다 한다.
//   · 금고: 매 턴 시작에 하나당 1칩. '내 차례에만' 으로 바꿔 봐도 3인 금고 세기는 그대로였다.
//   · 낙찰자만 낸다. TWELVE 의 '진 쪽 절반' 은 여럿이면 칩이 너무 빨리 녹고, 세트를 막는
//     값이 비싸져서 2종이 쉽게 이겼다 — 상위 15개 조합이 전부 '낙찰자만'이었다.
//   · 클로즈는 가장 높이 쳐주는 사람이 산다(같으면 왼쪽). 먼저 물어본 사람이 사게 두면
//     모두 빈손인 첫 경매를 첫 진행자 왼쪽이 가져가, 그 자리가 30% 까지 이겼다(4인 공정 25%).
//     진행자에게 낙찰 몫을 주는 것으로는 오히려 나빠졌다 — 원인이 진행 부담이 아니었다.
//   · 첫 경매는 오픈으로만.
//   · 시작 칩 보정(덤)은 필요 없다 — 위 두 규칙을 넣으니 +2 만 줘도 순서가 뒤집혔다.
//   결과(2만 판): 4인 종류 편차 7.0p · 자리 편차 3.1p · 세트 완성 99.7% · 9.6턴
//                3인 종류 편차 4.9p · 자리 편차 3.6p · 세트 완성 89%   · 9.3턴
//   금고를 아예 무시하면 4인 −2.3p, 3인 −2.6p. 두세 배로 쳐줘도 이득이 없다 —
//   사야 하지만 필수품은 아니다. (3인은 사람들이 금고를 1.5배쯤 쳐줄 때가 균형점이라
//   그 값으로 쟀다. 4인에서 맞춘 AI 그대로 두면 금고를 싸게 사서 필수품처럼 보인다.)
//
// ── 2차: 특수 카드와 금고 시너지 (FINAL4X / FINAL3X) ─────────────────────────
//   재미 눈금을 더했다 — 선두가 바뀐 횟수, 절반 시점 선두가 아닌 사람이 이긴 비율(역전),
//   둘 이상이 동시에 한 장 남은 턴(리치 대결), 마지막 경매품에 특수 카드가 있던 비율(잭팟).
//   규칙마다 덱을 다시 맞춘 뒤 견줬다 — 남의 덱으로 재면 규칙이 아니라 덱을 재게 된다.
//   · 더블6(6종 두 장으로 친다) ×2 — 가장 약하던 6종을 끌어올려 4인 종류 편차 6.6 → 3.7p.
//   · 쌍둥이 4/6(4종·6종에 동시에 친다) ×1 — 4인에서는 균형을 안 깬다(6.4p). 3인에서는
//     넣는 순간 10.6~16.3p 로 무너진다 — 카드가 24장뿐이라 한 장이 너무 크다. 3인엔 뺀다.
//   · 가파른 금고(1개 1칩 · 2개 3칩 · 3개 6칩) ×3 — 모을수록 수입이 가팔라진다.
//     역전이 49.7 → 51~53% 로 조금 늘고, 균형은 거의 그대로.
//   · 금고를 승리 세트(5종)로 — 버렸다. 세 장·네 장·다섯 장, 수입을 매 턴·내 차례·없음으로
//     바꿔 봐도 그 세트로 이기는 판은 2~7% 뿐이고 종류 편차가 22~33p 로 무너졌다. 수입을
//     아예 없애도 2.6% 였다 — 모두 보는 앞에 하나뿐인 세트는 막히기가 가장 쉽다. 게다가
//     금고를 무시하면 14~20% 로 떨어져(공정 25%) 필수품이 됐다. 선두 교체가 1.7 → 3.0 으로
//     늘긴 했지만 그 값으로는 못 산다.
//   결과: 4인 종류 5.7p · 자리 4.1p · 역전 51% · 잭팟 19% (특수 카드 셋을 다 무시하면 −6p)
//         3인 종류 3.4p · 자리 3.0p · 역전 53% · 잭팟 8%  · 세트 완성 88%
//   3인 덱은 여전히 4인 덱에서 8장을 뺀 것이다 — 상자 하나로 둘 다 된다.
//
//   node tools/token4.mjs            결론 구성들을 다시 돌려 본다
import { pathToFileURL } from 'node:url';

export const KINDS = [2, 3, 4, 6];
export const VAULT = 0;                         // 금고 카드

// 카드 한 장이 어느 세트에 몇 장으로 치나. 보통 카드는 제 종류에 한 장.
//   금고(0)  수입. vaultSet 을 주면 5종으로도 친다 — 금고를 vaultSet 장 모으면 이긴다.
//   'Dab'    쌍둥이 — a 종에도 b 종에도 한 장씩 동시에 친다 (예: 'D46')
//   'Wk'     더블 — k 종 두 장으로 친다 (예: 'W6')
// 특수 카드는 cfg.special = { D46: 1, W6: 1 } 처럼 준다.
function cardAdd(cfg, c) {
  if (c === VAULT) return cfg.vaultSet ? { 5: 1 } : {};
  if (typeof c === 'number') return { [c]: 1 };
  if (c[0] === 'D') return { [+c[1]]: 1, [+c[2]]: 1 };
  if (c[0] === 'W') return { [+c.slice(1)]: 2 };
  throw new Error('모르는 카드 ' + c);
}

export function rng(seed) {                     // 재현되는 난수
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── AI 가 값을 매기는 방식 ──────────────────────────────────────────────────
// 칩 단위다. STEP: 세트까지 한 걸음, CLOSE: 끝에 가까울수록 한 걸음이 비싸진다,
// PART: 다른 종류에서의 진척, INC: 금고가 남은 턴 동안 벌어 줄 칩 중 얼마를 쳐주나,
// BLOCK: 남이 가져가면 곤란한 만큼, RESERVE: 세트가 아니면 남겨 두는 칩,
// OFFER: 출품할 때 남에게 좋은 카드를 얼마나 피하나.
export const AI0 = { STEP: 1.6, CLOSE: 1.4, PART: 9, INC: 0.7, BLOCK: 0.2, RESERVE: 0, OFFER: 0.8, NOISE: 0.9, WIN: 200 };

// 자가대전으로 맞춰 보니 한 점에 서지 않고 돌았다 — 다들 세게 막으면 안 막는
// 쪽이 이기고(남들끼리 칩을 태운다), 다들 안 막으면 막는 쪽이 이긴다. 금고 값도
// 0.5 와 1.0 사이를 오갔다. 그래서 설계는 한 가지 AI 가 아니라 그 범위에서
// 자리마다 성격을 뽑은 무리로 잰다 — 사람도 저마다 다르게 둔다.
export function crowd(N, r) {
  const pick = (lo, hi) => lo + (hi - lo) * r();
  return Array.from({ length: N }, () => ({ ...AI0,
    STEP: pick(1.1, 2.2), PART: pick(6, 12), INC: pick(0.49, 0.97), BLOCK: pick(0.14, 0.28), RESERVE: r() < 0.5 ? 0 : 1 }));
}

function newGame(cfg, rnd) {
  const d = [];
  for (const k of KINDS) for (let i = 0; i < cfg.deck[k]; i++) d.push(k);
  for (let i = 0; i < cfg.vault; i++) d.push(VAULT);
  if (cfg.special) for (const [c, n] of Object.entries(cfg.special)) for (let i = 0; i < n; i++) d.push(c);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  // 세트 종류와 필요 장수. 금고가 세트면 5종이 끼어든다.
  const kinds = cfg.vaultSet ? [2, 3, 4, 5, 6] : KINDS;
  const req = { 2: 2, 3: 3, 4: 4, 5: cfg.vaultSet || 5, 6: 6 };
  const total = {}, addOf = {};
  for (const k of kinds) total[k] = 0;
  for (const c of d) { const a = addOf[c] || (addOf[c] = cardAdd(cfg, c)); for (const k in a) total[k] += a[k]; }
  const P = [];
  for (let i = 0; i < cfg.N; i++)
    P.push({ hand: d.slice(i * cfg.H, (i + 1) * cfg.H), cnt: Object.fromEntries(kinds.map((k) => [k, 0])), vault: 0, chips: cfg.chips });
  const first = Math.floor(rnd() * cfg.N);
  if (cfg.bonus) for (let k = 0; k < cfg.N; k++) P[(first + k) % cfg.N].chips += cfg.bonus[k] || 0;
  return { cfg, P, center: d.slice(cfg.N * cfg.H), auc: first, first, round: 0, kinds, req, total, addOf };
}

const taken = (g, k) => { let s = 0; for (const p of g.P) s += p.cnt[k]; return s; };

// 한 사람의 형편. add: 이 사람이 가상으로 더 받는 카드(종류별 장수)
function look(g, pi, add) {
  const p = g.P[pi]; let need = 99, part = 0, done = 0;
  for (const k of g.kinds) {
    const r = g.req[k], have = p.cnt[k] + (add[k] || 0);
    if (have >= r) done = done || k;
    const left = g.total[k] - taken(g, k) - (add[k] || 0);       // 아직 아무도 안 가진 몫
    if (have + left < r) continue;                                // 이 종류로는 더 못 만든다
    need = Math.min(need, r - have);
    part += (Math.min(have, r) / r) ** 2;
  }
  return { need, part, done };
}

// 경매품이 세트마다 몇 장어치이고 금고가 몇 개인가. blind: 없는 셈 칠 카드(실험용 — 특수 카드를 무시하는 사람)
function lotParts(g, lot, blind) {
  const add = {}; let v = 0;
  for (const c of lot) {
    if (blind && blind.includes(c)) continue;
    if (c === VAULT) v++;
    const a = g.addOf[c]; for (const k in a) add[k] = (add[k] || 0) + a[k];
  }
  return { add, v };
}

// pi 가 이 경매품을 가지면 얼마나 좋은가 (남 몫은 빼고)
function gain(g, pi, lot, A) {
  const { add, v } = lotParts(g, lot, A.blind);
  const b = look(g, pi, {}), a = look(g, pi, add);
  let val;
  if (a.done) val = A.WIN;
  else val = A.STEP * (b.need - a.need) * (1 + A.CLOSE / Math.max(1, a.need)) + A.PART * (a.part - b.part);
  // 이 금고들이 한 턴에 더 벌어 줄 칩. escal 은 이미 가진 수에 따라 한 개의 값이 커진다.
  const cur = g.P[pi].vault, tri = (n) => n * (n + 1) / 2, y = g.cfg.y;
  const perRound = g.cfg.pay === 'own' ? v * y / g.N : g.cfg.pay === 'escal' ? (tri(cur + v) - tri(cur)) * y : v * y;
  return val + A.INC * perRound * g.center.length;
}

// 얼마까지 부를 생각인가 — 내 몫 + 남이 가져가면 곤란한 만큼
function worth(g, pi, lot, A) {
  let deny = 0;
  for (let o = 0; o < g.N; o++) if (o !== pi) deny = Math.max(deny, gain(g, o, lot, A));
  const mine = gain(g, pi, lot, A);
  const chips = g.P[pi].chips;
  if (mine >= A.WIN) return chips;                                 // 이걸로 이긴다
  if (deny >= A.WIN) return chips;                                 // 이걸 놓치면 진다
  return Math.min(mine + A.BLOCK * deny, chips - A.RESERVE);
}

function openAuction(g, W) {
  const N = g.N, order = [];
  for (let k = 1; k <= N; k++) order.push((g.auc + k) % N);       // 진행자 왼쪽부터, 진행자가 마지막
  const out = new Set(order.filter((i) => g.P[i].chips < 1)), last = {};
  let price = 0, high = -1;
  for (let step = 0; step < 4000; step++) {
    const i = order[step % N];
    if (out.has(i) || i === high) continue;
    if (W[i] >= price + 1 && g.P[i].chips >= price + 1) { price++; high = i; last[i] = price; }
    else out.add(i);
    const alive = N - out.size;
    if ((high >= 0 && alive === 1) || alive === 0) break;
  }
  if (high < 0) return { winner: g.auc, price: 0, last, type: 'open' };  // 아무도 안 불렀다 — 진행자가 그냥 가져간다
  return { winner: high, price, last, type: 'open' };
}

function closeAuction(g, W, est) {
  const a = g.auc, N = g.N; let top = 0;
  for (let k = 1; k < N; k++) { const i = (a + k) % N; top = Math.max(top, Math.min(est[i], g.P[i].chips - 1)); }
  let P;
  if (W[a] >= top + 1) { P = Math.max(2, Math.ceil(top / 2) * 2); if (P > W[a] || P > g.P[a].chips) return null; }
  else { P = Math.floor((top - 1) / 2) * 2; if (P < 2 || P > g.P[a].chips) return null; }
  let buyer = -1;
  for (let k = 1; k < N; k++) {
    const i = (a + k) % N;
    if (!(W[i] >= P + 1 && g.P[i].chips >= P + 1)) continue;
    if (!g.cfg.closeBest) { buyer = i; break; }                  // 왼쪽부터 먼저 원하는 사람
    if (buyer < 0 || W[i] > W[buyer]) buyer = i;                   // 가장 높이 쳐주는 사람
  }
  if (buyer >= 0) return { winner: buyer, price: P + 1, last: {}, type: 'close' };
  return { winner: a, price: P, last: {}, type: 'close' };
}

function rank(g) {
  const s = g.P.map((p, i) => ({ i, l: look(g, i, {}), n: g.kinds.reduce((t, k) => t + p.cnt[k], 0), c: p.chips }));
  s.sort((x, y) => (x.l.need - y.l.need) || (y.l.part - x.l.part) || (y.n - x.n) || (y.c - x.c));
  return s[0].i;
}

// 한 판. AIs: 자리마다 다른 AI 를 줄 수 있다(없으면 전부 AI0)
export function play(cfg, seed, AIs) {
  const rnd = rng(seed), g = newGame(cfg, rnd); g.N = cfg.N;
  const A = (i) => (AIs && AIs[i]) || AI0;
  const log = { prices: [], vaultPrices: [], free: 0, close: 0, lots: 0, leaders: [], duel: 0 };
  while (g.center.length) {
    g.round++;
    if (cfg.pay === 'own') g.P[g.auc].chips += g.P[g.auc].vault * cfg.y;   // 금고 — 내가 진행하는 턴에만
    else if (cfg.pay === 'escal') for (const p of g.P) p.chips += (p.vault * (p.vault + 1) / 2) * cfg.y;   // 금고 — 모을수록 가파르게
    else for (const p of g.P) p.chips += p.vault * cfg.y;               // 금고 — 매 턴 모두에게
    const a = g.auc, card = g.center.pop(), hand = g.P[a].hand;
    // 출품 — 나한테 좋고 남에게 덜 좋은 카드
    let best = 0, bestS = -Infinity;
    for (let h = 0; h < hand.length; h++) {
      const lot = [card, hand[h]]; let opp = 0;
      for (let o = 0; o < g.N; o++) if (o !== a) opp = Math.max(opp, gain(g, o, lot, A(a)));
      const s = gain(g, a, lot, A(a)) - A(a).OFFER * opp;
      if (s > bestS) { bestS = s; best = h; }
    }
    const lot = [card, hand.splice(best, 1)[0]];
    const est = [], W = [];
    for (let i = 0; i < g.N; i++) {
      est[i] = worth(g, i, lot, A(a));                               // 진행자가 짐작하는 남의 값
      W[i] = Math.max(0, worth(g, i, lot, A(i)) + (rnd() - 0.5) * 2 * A(i).NOISE);
      if (W[i] > g.P[i].chips) W[i] = g.P[i].chips;
    }
    let r = null;
    if (!cfg.openOnly && !(cfg.firstOpen && g.round === 1)) {
      let topOther = 0; for (let i = 0; i < g.N; i++) if (i !== a) topOther = Math.max(topOther, est[i]);
      if (W[a] < topOther || rnd() < 0.5) r = closeAuction(g, W, est);
    }
    if (!r) r = openAuction(g, W);
    // 정산
    g.P[r.winner].chips -= r.price;
    // 진행자 몫 — 남이 사면 값의 일부가 진행자에게 간다(나머지는 은행).
    // 진행은 손패를 시장에 내놓는 일이라, 몫이 없으면 진행을 많이 하는 첫 자리가 손해를 본다.
    if (cfg.cut && r.winner !== g.auc && r.price > 0) g.P[g.auc].chips += Math.floor(r.price * cfg.cut);
    if (r.type === 'open' && cfg.lose !== 'none') {
      const losers = Object.entries(r.last).filter(([i]) => Number(i) !== r.winner).map(([i, b]) => [Number(i), b]);
      if (cfg.lose === 'second') { losers.sort((x, y) => y[1] - x[1]); if (losers[0]) g.P[losers[0][0]].chips -= Math.floor(losers[0][1] / 2); }
      else for (const [i, b] of losers) g.P[i].chips -= Math.floor(b / 2);
    }
    const w = g.P[r.winner];
    for (const c of lot) { if (c === VAULT) w.vault++; const ad = g.addOf[c]; for (const k in ad) w.cnt[k] += ad[k]; }
    // 재미를 재는 눈금 — 지금 누가 앞서나, 한 장 남은(리치) 사람이 몇인가
    let lead = -1, bn = 99, bp = -1, reach = 0;
    for (let i = 0; i < g.N; i++) {
      const l = look(g, i, {});
      if (l.need <= 1) reach++;
      if (l.need < bn || (l.need === bn && l.part > bp)) { bn = l.need; bp = l.part; lead = i; }
    }
    log.leaders.push(lead); if (reach >= 2) log.duel++;
    log.lots++; log.prices.push(r.price); if (lot.includes(VAULT)) log.vaultPrices.push(r.price);
    if (r.price === 0) log.free++; if (r.type === 'close') log.close++;
    const done = look(g, r.winner, {}).done;
    if (done) { log.winLot = lot; return finish(g, r.winner, 'set', done, log); }
    g.auc = (g.auc + 1) % g.N;
  }
  return finish(g, rank(g), 'deck', 0, log);
}

function finish(g, winner, by, kind, log) {
  const L = log.leaders; let changes = 0;
  for (let i = 1; i < L.length; i++) if (L[i] !== L[i - 1]) changes++;
  const mid = L[Math.max(0, Math.floor(L.length / 2) - 1)];     // 절반쯤 왔을 때의 선두
  return { winner, by, kind, rounds: g.round, seat: (winner - g.first + g.N) % g.N,
    vault: g.P.map((p) => p.vault), chips: g.P.map((p) => p.chips), log,
    changes, comeback: mid !== undefined && mid !== winner };
}

// 여러 판을 돌려 설계가 볼 숫자로 줄인다
export function run(cfg, games = 2000, seed0 = 1, AIs) {
  const kinds = cfg.vaultSet ? [2, 3, 4, 5, 6] : KINDS;
  const byKind = Object.fromEntries(kinds.map((k) => [k, 0])), bySeat = Array(cfg.N).fill(0);
  let changes = 0, comeback = 0, duel = 0, jackpot = 0, vaultWin = 0;
  let set = 0, rounds = 0, price = 0, lots = 0, vp = 0, vpN = 0, free = 0, close = 0;
  let vWin = 0, vHave = 0, nWin = 0, nHave = 0, vaultTaken = 0, endChips = 0;
  for (let s = 0; s < games; s++) {
    const ais = AIs === 'crowd' ? crowd(cfg.N, rng(seed0 * 31 + s * 104729)) : typeof AIs === 'function' ? AIs(s) : AIs;
    const r = play(cfg, seed0 + s * 7919, ais);
    if (r.by === 'set') { set++; byKind[r.kind]++; }
    bySeat[r.seat]++; rounds += r.rounds;
    changes += r.changes; if (r.comeback) comeback++; duel += r.log.duel;
    // 판을 끝낸 경매품에 특수 카드가 있었나 — '그 카드로 이겼다' 는 순간
    if (r.by === 'set' && r.log.winLot.some((c) => typeof c === 'string')) jackpot++;
    for (const x of r.log.prices) price += x; lots += r.log.lots; free += r.log.free; close += r.log.close;
    for (const x of r.log.vaultPrices) { vp += x; vpN++; }
    r.vault.forEach((v, i) => { vaultTaken += v; if (v > 0) { vHave++; if (i === r.winner) vWin++; } else { nHave++; if (i === r.winner) nWin++; } });
    endChips += r.chips.reduce((a, b) => a + b, 0) / cfg.N;
  }
  const share = kinds.map((k) => (set ? byKind[k] / set : 0));
  // 이기는 길이 얼마나 고르게 쓰이나 (1 이면 모든 세트가 똑같이 자주 이긴다)
  const entropy = -share.filter((x) => x > 0).reduce((t, x) => t + x * Math.log(x), 0) / Math.log(kinds.length);
  const seat = bySeat.map((x) => x / games);
  return {
    setRate: set / games,
    kindShare: Object.fromEntries(kinds.map((k, i) => [k, +(share[i] * 100).toFixed(1)])),
    kindSpread: +((Math.max(...share) - Math.min(...share)) * 100).toFixed(1),
    seatSpread: +((Math.max(...seat) - Math.min(...seat)) * 100).toFixed(1),
    seatShare: seat.map((x) => +(x * 100).toFixed(1)),
    rounds: +(rounds / games).toFixed(1),
    avgPrice: +(price / Math.max(1, lots)).toFixed(2),
    vaultPrice: vpN ? +(vp / vpN).toFixed(2) : null,
    freeRate: +(free / Math.max(1, lots) * 100).toFixed(1),
    closeRate: +(close / Math.max(1, lots) * 100).toFixed(1),
    // 금고를 가진 사람의 승률 ÷ 안 가진 사람의 승률 — 1 이면 쓸모없고, 너무 크면 필수품
    vaultEdge: (vHave && nHave && nWin) ? +((vWin / vHave) / (nWin / nHave)).toFixed(2) : null,
    vaultTaken: +(vaultTaken / games / Math.max(1, cfg.vault) * 100).toFixed(0),
    endChips: +(endChips / games).toFixed(1),
    // 재미 눈금
    leadChanges: +(changes / games).toFixed(2),        // 한 판에 선두가 몇 번 바뀌나
    comeback: +(comeback / games * 100).toFixed(1),    // 절반 시점 선두가 아닌 사람이 이긴 비율(%)
    reachDuel: +(duel / games).toFixed(2),             // 둘 이상이 동시에 리치인 턴 수(판당)
    pathEntropy: +entropy.toFixed(3),
    jackpot: +(jackpot / Math.max(1, set) * 100).toFixed(1),  // 이긴 판 중 마지막 경매품에 특수 카드가 있던 비율(%)
  };
}

export const FINAL4 = { N: 4, H: 4, deck: { 2: 3, 3: 6, 4: 8, 6: 13 }, vault: 2, pay: 'round', y: 1, chips: 30, lose: 'none', closeBest: true, firstOpen: true };
export const FINAL3 = { N: 3, H: 4, deck: { 2: 2, 3: 4, 4: 6, 6: 10 }, vault: 2, pay: 'round', y: 1, chips: 25, lose: 'none', closeBest: true, firstOpen: true };

// 2차 — 더블6 · 쌍둥이 4/6 · 가파른 금고. special 의 순서도 덱을 만드는 순서라 그대로 둔다.
export const FINAL4X = { ...FINAL4, deck: { 2: 3, 3: 6, 4: 8, 6: 9 }, vault: 3, pay: 'escal', special: { W6: 2, D46: 1 } };
export const FINAL3X = { ...FINAL3, deck: { 2: 2, 3: 4, 4: 6, 6: 8 }, vault: 3, pay: 'escal', special: { W6: 1 } };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const people3 = (s) => crowd(3, rng(7001 * 31 + s * 104729)).map((x) => ({ ...x, INC: x.INC * 1.5 }));
  const show = (name, r) => console.log(name.padEnd(8), '종류', r.kindSpread, JSON.stringify(r.kindShare), '| 자리', r.seatSpread,
    '| 완성', (r.setRate * 100).toFixed(1) + '%', '| 턴', r.rounds, '| 선두교체', r.leadChanges, '| 역전', r.comeback + '%', '| 잭팟', r.jackpot + '%');
  show('4인', run(FINAL4, 20000, 7001, 'crowd'));
  show('3인', run(FINAL3, 20000, 7001, people3));
  show('4인 2차', run(FINAL4X, 20000, 7001, 'crowd'));
  show('3인 2차', run(FINAL3X, 20000, 7001, people3));
}
