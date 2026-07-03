// FLIP FLAP 밸런스 시뮬레이터 (헤드리스 AI vs AI)
// 실행: node sim.js [games] [p1diff] [p2diff]
// server.js의 순수 로직/AI를 복제해 대량 대국으로 밸런스를 측정한다.

const SPEC = [[2,2],[3,5],[4,7],[6,10]];

function initDeck() {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++) cards.push({ kind, grade: g, id: kind*100+g });
  for (let i = cards.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
const strength = c => c.kind*100 + c.grade;
const is610 = c => c.kind===6 && c.grade===10;
const is21  = c => c.kind===2 && c.grade===1;
function aBeatsB(a,b){ if(is610(a)&&is21(b))return true; if(is610(b)&&is21(a))return false; return strength(a)<strength(b); }
function checkSet(acq){ const c={}; for(const x of acq)c[x.kind]=(c[x.kind]||0)+1; for(const[k]of SPEC) if((c[k]||0)>=k)return k; return null; }
// 세트 진행도: [최고 근접비율, 총 획득수] — 종료 시 판정용
function progress(acq){ const c={}; for(const x of acq)c[x.kind]=(c[x.kind]||0)+1; let best=0; for(const[k]of SPEC)best=Math.max(best,(c[k]||0)/k); return [best, acq.length]; }
function resolveEnd(acq0, acq1){ const a=progress(acq0), b=progress(acq1); if(a[0]!==b[0])return a[0]>b[0]?0:1; if(a[1]!==b[1])return a[1]>b[1]?0:1; return -1; }

// ── AI (server.js와 동일) ──
function cpuTarget(acq, hand){ const all=[...acq,...hand]; const c={}; for(const x of all)c[x.kind]=(c[x.kind]||0)+1; let best=6,br=-1; for(const[k]of SPEC){const r=(c[k]||0)/k; if(r>br){br=r;best=k;}} return best; }
function prizeValue(cards, acq){ const c={}; for(const x of acq)c[x.kind]=(c[x.kind]||0)+1; let m=0; for(const x of cards){ if(!x)continue; const owned=c[x.kind]||0; const need=x.kind-owned; const v=need<=0?1:1/need; m=Math.max(m,v);} return Math.min(m,1); }
function bluffRate(d){ return {easy:0,normal:0,hard:0.15,expert:0.25}[d]??0.1; }

function cpuChooseOffer(hand, acq){ const t=cpuTarget(acq,hand); const nt=hand.filter(c=>c.kind!==t); const pool=nt.length?nt:hand; return [...pool].sort((a,b)=>strength(b)-strength(a))[0]; }
function cpuChooseType(hand, prize, acq, d){ if(d==='easy')return Math.random()<0.5?'open':'closed'; const v=prizeValue(prize,acq); if(v>=0.6)return Math.random()<0.75?'open':'closed'; return Math.random()<0.65?'closed':'open'; }
function cpuDecideBid(hand, prize, acq, d){
  const byStrong=[...hand].sort((a,b)=>strength(a)-strength(b));
  let v=prizeValue(prize,acq);
  if(d==='easy')return byStrong[Math.floor(Math.random()*byStrong.length)];
  // 목표 세트 커밋: 경매품에 내 목표 종류가 있으면 적극 가치 부여 (어려운 세트도 끝까지)
  if(d==='smart'||d==='hard'||d==='expert'){ const target=cpuTarget(acq,hand); if(prize.some(c=>c&&c.kind===target)) v=Math.max(v,0.72); }
  const has610=hand.find(is610);
  if(d==='expert'&&has610&&v<0.4)return has610;
  if((d==='hard'||d==='expert')&&Math.random()<bluffRate(d)&&v<0.5)return byStrong[0];
  if(v>=0.66)return byStrong[0];
  if(v>=0.4)return byStrong[Math.min(1,byStrong.length-1)];
  if(v>=0.2)return byStrong[Math.floor(byStrong.length/2)];
  return byStrong[byStrong.length-1];
}

// ── 한 판 시뮬 ──
function playGame(d1, d2) {
  const deck = initDeck();
  const g = {
    centerDeck: deck.slice(0,12), hands:[deck.slice(12,18), deck.slice(18,24)],
    acq:[[],[]], auctioneer:0, time:[420,420], turns:0,
  };
  const diff=[d1,d2];
  let guard=0;
  while (guard++ < 500) {
    if (g.centerDeck.length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const auc=g.auctioneer, opp=1-auc;
    // draw
    const center=g.centerDeck.shift();
    // offer
    if(g.hands[auc].length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const offCard=cpuChooseOffer(g.hands[auc], g.acq[auc]);
    g.hands[auc].splice(g.hands[auc].indexOf(offCard),1);
    const prize=[center, offCard];
    // type
    const type=cpuChooseType(g.hands[auc], prize, g.acq[auc], diff[auc]);
    // bids (진행자 먼저지만 동시판정)
    if(g.hands[auc].length===0||g.hands[opp].length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const bidA=cpuDecideBid(g.hands[auc], prize, g.acq[auc], diff[auc]);
    const bidO=cpuDecideBid(g.hands[opp], prize, g.acq[opp], diff[opp]);
    g.hands[auc].splice(g.hands[auc].indexOf(bidA),1);
    g.hands[opp].splice(g.hands[opp].indexOf(bidO),1);
    // settle
    const aucWins=aBeatsB(bidA,bidO);
    if(aucWins)g.acq[auc].push(center,offCard); else g.acq[opp].push(center,offCard);
    g.hands[opp].push(bidA); g.hands[auc].push(bidO);
    g.turns++;
    const s0=checkSet(g.acq[0]), s1=checkSet(g.acq[1]);
    if(s0)return{winner:0,turns:g.turns,setKind:s0};
    if(s1)return{winner:1,turns:g.turns,setKind:s1};
  }
  return { winner:-1, turns:g.turns };
}

// ── 통계 ──
const N = parseInt(process.argv[2]||'20000');
const D1 = process.argv[3]||'hard';
const D2 = process.argv[4]||'hard';
let p0=0,p1=0,draw=0,totTurns=0; const setCount={};
for(let i=0;i<N;i++){
  const r=playGame(D1,D2);
  if(r.winner===0)p0++; else if(r.winner===1)p1++; else draw++;
  totTurns+=r.turns;
  if(r.setKind)setCount[r.setKind]=(setCount[r.setKind]||0)+1;
}
console.log(`\n=== ${N}판 · P1(${D1}) vs P2(${D2}) ===`);
console.log(`선공(P1) 승: ${p0} (${(p0/N*100).toFixed(1)}%)`);
console.log(`후공(P2) 승: ${p1} (${(p1/N*100).toFixed(1)}%)`);
console.log(`무승부:      ${draw} (${(draw/N*100).toFixed(1)}%)`);
console.log(`평균 턴수:   ${(totTurns/N).toFixed(1)}`);
console.log(`완성 세트 분포:`, Object.fromEntries(Object.entries(setCount).map(([k,v])=>[k+'짜리',`${(v/N*100).toFixed(1)}%`])));
