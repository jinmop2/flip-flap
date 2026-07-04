// 세트 조건(요건) 변형 연구 — 수량만으론 6짜리 세트가 죽는 문제 확인용
// 실행: node research2.js [games]
const KINDS = [2, 3, 4, 6];
const strength = c => c.kind * 100 + c.grade;
const is610 = c => c && c.kind === 6 && c.grade === 10;
const is21  = c => c && c.kind === 2 && c.grade === 1;
function aBeatsB(a, b) { if (is610(a) && is21(b)) return true; if (is610(b) && is21(a)) return false; return strength(a) < strength(b); }
function initDeck(spec) { const cards = []; for (const k of KINDS) for (let g = 1; g <= spec[k]; g++) cards.push({ kind: k, grade: g, id: k * 100 + g }); for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
const cnt = (acq, k) => acq.reduce((n, c) => n + (c.kind === k ? 1 : 0), 0);
function checkSet(acq, req) { for (const k of KINDS) if (cnt(acq, k) >= req[k]) return k; return null; }
function progress(acq, req) { let best = 0; for (const k of KINDS) best = Math.max(best, cnt(acq, k) / req[k]); return [best, acq.length]; }
function resolveEnd(a0, a1, req) { const a = progress(a0, req), b = progress(a1, req); if (a[0] !== b[0]) return a[0] > b[0] ? 0 : 1; if (a[1] !== b[1]) return a[1] > b[1] ? 0 : 1; return -1; }
function cpuTarget(acq, hand, req) { const all = [...acq, ...hand]; let best = 6, br = -1; for (const k of KINDS) { const r = cnt(all, k) / req[k]; if (r > br) { br = r; best = k; } } return best; }
function prizeValue(prize, acq, req) { let m = 0; for (const c of prize) { if (!c) continue; const need = req[c.kind] - cnt(acq, c.kind); m = Math.max(m, need <= 0 ? 1 : 1 / need); } return Math.min(m, 1); }
function chooseOffer(hand, acq, req) { const t = cpuTarget(acq, hand, req); const nt = hand.filter(c => c.kind !== t); const pool = nt.length ? nt : hand; return [...pool].sort((a, b) => strength(b) - strength(a))[0]; }
function chooseType(hand, prize, acq, req) { const v = prizeValue(prize, acq, req); if (v >= 0.6) return Math.random() < 0.75 ? 'open' : 'closed'; return Math.random() < 0.65 ? 'closed' : 'open'; }
function decideBid(hand, prize, acq, req) {
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  let v = prizeValue(prize, acq, req);
  const target = cpuTarget(acq, hand, req);
  if (prize.some(c => c && c.kind === target)) v = Math.max(v, 0.72);
  const has610 = hand.find(is610);
  if (has610 && v < 0.4) return has610;
  if (Math.random() < 0.15 && v < 0.5) return byStrong[0];
  if (v >= 0.66) return byStrong[0];
  if (v >= 0.4) return byStrong[Math.min(1, byStrong.length - 1)];
  if (v >= 0.2) return byStrong[Math.floor(byStrong.length / 2)];
  return byStrong[byStrong.length - 1];
}
function playGame(spec, req) {
  const deck = initDeck(spec), total = deck.length, hs = 6;
  const g = { center: deck.slice(0, total - hs * 2), hands: [deck.slice(total - hs * 2, total - hs), deck.slice(total - hs, total)], acq: [[], []], auc: 0, turns: 0 };
  let guard = 0;
  while (guard++ < 400) {
    if (g.center.length === 0) return { w: resolveEnd(g.acq[0], g.acq[1], req), set: null };
    const a = g.auc, o = 1 - a;
    const center = g.center.shift();
    if (g.hands[a].length === 0) return { w: resolveEnd(g.acq[0], g.acq[1], req), set: null };
    const off = chooseOffer(g.hands[a], g.acq[a], req); g.hands[a].splice(g.hands[a].indexOf(off), 1);
    const prize = [center, off];
    chooseType(g.hands[a], prize, g.acq[a], req);
    if (g.hands[a].length === 0 || g.hands[o].length === 0) return { w: resolveEnd(g.acq[0], g.acq[1], req), set: null };
    const bidA = decideBid(g.hands[a], prize, g.acq[a], req); g.hands[a].splice(g.hands[a].indexOf(bidA), 1);
    const bidO = decideBid(g.hands[o], prize, g.acq[o], req); g.hands[o].splice(g.hands[o].indexOf(bidO), 1);
    const aw = aBeatsB(bidA, bidO);
    if (aw) g.acq[a].push(center, off); else g.acq[o].push(center, off);
    g.hands[o].push(bidA); g.hands[a].push(bidO);
    g.turns++;
    const s0 = checkSet(g.acq[0], req), s1 = checkSet(g.acq[1], req);
    if (s0) return { w: 0, set: s0 }; if (s1) return { w: 1, set: s1 };
  }
  return { w: -1, set: null };
}
function evalCfg(spec, req, N) {
  let p0 = 0; const setc = { 2: 0, 3: 0, 4: 0, 6: 0 }; let comp = 0;
  for (let i = 0; i < N; i++) { const r = playGame(spec, req); if (r.w === 0) p0++; if (r.set) { setc[r.set]++; comp++; } }
  const perGame = KINDS.map(k => setc[k] / N);   // 종류별 "게임당 완성률"
  const spread = Math.max(...perGame) - Math.min(...perGame);
  return { p0: p0 / N, compRate: comp / N, perGame, spread };
}
const N = parseInt(process.argv[2] || '15000');
const spec = { 2: 2, 3: 5, 4: 7, 6: 10 };  // 현재 수량 고정
const cases = [
  ['현재 요건 {2,3,4,6}',            { 2: 2, 3: 3, 4: 4, 6: 6 }],
  ['6짜리 6→5',                     { 2: 2, 3: 3, 4: 4, 6: 5 }],
  ['6짜리 6→4',                     { 2: 2, 3: 3, 4: 4, 6: 4 }],
  ['6→4, 4→3',                      { 2: 2, 3: 3, 4: 3, 6: 4 }],
  ['압축 {2,3,3,4}',                { 2: 2, 3: 3, 4: 3, 6: 4 }],
  ['평탄화 {2,3,4,5}',              { 2: 2, 3: 3, 4: 4, 6: 5 }],
  ['균등형 {3,3,4,5}',              { 2: 3, 3: 3, 4: 4, 6: 5 }],
];
console.log(`수량 고정 [2:2 3:5 4:7 6:10], 요건만 변형 × ${N}판\n`);
console.log('구성'.padEnd(22) + ' 완성율   종류별 완성률(2/3/4/6)         선공%   균등도');
for (const [name, req] of cases) {
  const r = evalCfg(spec, req, N);
  const pg = r.perGame.map(x => (x * 100).toFixed(0).padStart(3) + '%').join(' ');
  console.log(name.padEnd(22) + ` ${(r.compRate*100).toFixed(0).padStart(3)}%   ${pg}   ${(r.p0*100).toFixed(0)}%   ${(r.spread*100).toFixed(0)}`);
}
