// 카드 수량 조합 연구 (반영 X, 탐색만)
// 총 24장 고정, 세트 조건=종류숫자 고정, 수량만 변경.
// 각 조합을 AI(hard) 대전으로 돌려 밸런스 지표를 측정.
// 실행: node research.js [gamesPerCombo]

const KINDS = [2, 3, 4, 6];
const strength = c => c.kind * 100 + c.grade;
const is610 = c => c && c.kind === 6 && c.grade === 10;
const is21  = c => c && c.kind === 2 && c.grade === 1;
function aBeatsB(a, b) { if (is610(a) && is21(b)) return true; if (is610(b) && is21(a)) return false; return strength(a) < strength(b); }

function initDeck(spec) {   // spec: {2:c2,3:c3,4:c4,6:c6}
  const cards = [];
  for (const k of KINDS) for (let g = 1; g <= spec[k]; g++) cards.push({ kind: k, grade: g, id: k * 100 + g });
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
const cnt = (acq, k) => acq.reduce((n, c) => n + (c.kind === k ? 1 : 0), 0);
function checkSet(acq) { for (const k of KINDS) if (cnt(acq, k) >= k) return k; return null; }
function progress(acq) { let best = 0; for (const k of KINDS) best = Math.max(best, cnt(acq, k) / k); return [best, acq.length]; }
function resolveEnd(a0, a1) { const a = progress(a0), b = progress(a1); if (a[0] !== b[0]) return a[0] > b[0] ? 0 : 1; if (a[1] !== b[1]) return a[1] > b[1] ? 0 : 1; return -1; }

// ── AI (hard, 대칭) ──
function cpuTarget(acq, hand) { const all = [...acq, ...hand]; let best = 6, br = -1; for (const k of KINDS) { const r = cnt(all, k) / k; if (r > br) { br = r; best = k; } } return best; }
function prizeValue(prize, acq) { let m = 0; for (const c of prize) { if (!c) continue; const need = c.kind - cnt(acq, c.kind); m = Math.max(m, need <= 0 ? 1 : 1 / need); } return Math.min(m, 1); }
function chooseOffer(hand, acq) { const t = cpuTarget(acq, hand); const nt = hand.filter(c => c.kind !== t); const pool = nt.length ? nt : hand; return [...pool].sort((a, b) => strength(b) - strength(a))[0]; }
function chooseType(hand, prize, acq) { const v = prizeValue(prize, acq); if (v >= 0.6) return Math.random() < 0.75 ? 'open' : 'closed'; return Math.random() < 0.65 ? 'closed' : 'open'; }
function decideBid(hand, prize, acq) {
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  let v = prizeValue(prize, acq);
  const target = cpuTarget(acq, hand);
  if (prize.some(c => c && c.kind === target)) v = Math.max(v, 0.72);
  const has610 = hand.find(is610);
  if (has610 && v < 0.4) return has610;
  if (Math.random() < 0.15 && v < 0.5) return byStrong[0];
  if (v >= 0.66) return byStrong[0];
  if (v >= 0.4) return byStrong[Math.min(1, byStrong.length - 1)];
  if (v >= 0.2) return byStrong[Math.floor(byStrong.length / 2)];
  return byStrong[byStrong.length - 1];
}

function playGame(spec) {
  const deck = initDeck(spec);        // 총 24장
  const g = { center: deck.slice(0, 12), hands: [deck.slice(12, 18), deck.slice(18, 24)], acq: [[], []], auc: 0, turns: 0 };
  let guard = 0;
  while (guard++ < 400) {
    if (g.center.length === 0) return { w: resolveEnd(g.acq[0], g.acq[1]), set: null };
    const a = g.auc, o = 1 - a;
    const center = g.center.shift();
    if (g.hands[a].length === 0) return { w: resolveEnd(g.acq[0], g.acq[1]), set: null };
    const off = chooseOffer(g.hands[a], g.acq[a]); g.hands[a].splice(g.hands[a].indexOf(off), 1);
    const prize = [center, off];
    const type = chooseType(g.hands[a], prize, g.acq[a]);
    if (g.hands[a].length === 0 || g.hands[o].length === 0) return { w: resolveEnd(g.acq[0], g.acq[1]), set: null };
    const bidA = decideBid(g.hands[a], prize, g.acq[a]); g.hands[a].splice(g.hands[a].indexOf(bidA), 1);
    const bidO = decideBid(g.hands[o], prize, g.acq[o]); g.hands[o].splice(g.hands[o].indexOf(bidO), 1);
    const aw = aBeatsB(bidA, bidO);
    if (aw) g.acq[a].push(center, off); else g.acq[o].push(center, off);
    g.hands[o].push(bidA); g.hands[a].push(bidO);
    g.turns++;
    const s0 = checkSet(g.acq[0]), s1 = checkSet(g.acq[1]);
    if (s0) return { w: 0, set: s0 };
    if (s1) return { w: 1, set: s1 };
  }
  return { w: -1, set: null };
}

function evalCombo(spec, N) {
  let p0 = 0, p1 = 0; const setc = { 2: 0, 3: 0, 4: 0, 6: 0 }; let comp = 0, turns = 0;
  for (let i = 0; i < N; i++) {
    const r = playGame(spec);
    if (r.w === 0) p0++; else if (r.w === 1) p1++;
    if (r.set) { setc[r.set]++; comp++; }
  }
  const shares = KINDS.map(k => comp ? setc[k] / comp : 0);
  const spread = Math.max(...shares) - Math.min(...shares);   // 0=완벽 균등
  const compRate = comp / N;
  const p1adv = Math.abs(p0 / N - 0.5);                        // 선공 편향(작을수록 좋음)
  const score = compRate * (1 - spread);                      // 균등+결정적일수록 높음
  return { spec, p0: p0 / N, compRate, spread, p1adv, shares, setc, score };
}

// ── 조합 스윕 ──
const N = parseInt(process.argv[2] || '4000');
const combos = [];
for (let c2 = 2; c2 <= 6; c2++)
  for (let c3 = 3; c3 <= 9; c3++)
    for (let c4 = 4; c4 <= 10; c4++) {
      const c6 = 24 - c2 - c3 - c4;
      if (c6 < 6 || c6 > 13) continue;    // 6짜리 최소 6장(완성가능), 상한 13
      combos.push({ 2: c2, 3: c3, 4: c4, 6: c6 });
    }

console.log(`조합 ${combos.length}개 × ${N}판 시뮬레이션...\n`);
const results = combos.map(s => evalCombo(s, N));

const fmt = r => `[2:${r.spec[2]} 3:${r.spec[3]} 4:${r.spec[4]} 6:${r.spec[6]}]  완성율 ${(r.compRate*100).toFixed(0)}%  세트분포 ${KINDS.map((k,i)=>`${k}:${(r.shares[i]*100).toFixed(0)}%`).join(' ')}  선공 ${(r.p0*100).toFixed(0)}%  균등도(낮을수록↑) ${(r.spread*100).toFixed(0)}`;

// 기준 (현재 구성)
const base = evalCombo({ 2: 2, 3: 5, 4: 7, 6: 10 }, N);
console.log('■ 현재 구성 (기준)');
console.log('  ' + fmt(base) + '\n');

console.log('■ 세트 균등도 TOP 12 (4종류가 골고루 완성 + 완성율 반영)');
results.sort((a, b) => b.score - a.score).slice(0, 12).forEach((r, i) => console.log(`${String(i+1).padStart(2)}. ${fmt(r)}`));

console.log('\n■ 세트 완성율 TOP 8 (승부가 확실히 나는 구성)');
results.slice().sort((a, b) => b.compRate - a.compRate).slice(0, 8).forEach((r, i) => console.log(`${String(i+1).padStart(2)}. ${fmt(r)}`));
