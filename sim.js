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

// ══ 개선 전문가 AI (expertx) ══
const TOTAL = { 2:2, 3:5, 4:7, 6:10 };
const cnt = (acq, kind) => acq.reduce((n,c)=>n+(c.kind===kind?1:0),0);
// 실현 가능한 최선의 목표 세트 (상대가 이미 가져간 카드로 불가능한 종류는 제외)
function feasibleTarget(myAcq, oppAcq) {
  let best=null, bestScore=-1;
  for (const [kind] of SPEC) {
    const myC=cnt(myAcq,kind), oppC=cnt(oppAcq,kind);
    if (TOTAL[kind]-oppC < kind) continue;          // 남은 카드로도 완성 불가 → 포기
    if (myC>=kind) continue;
    const score = myC/kind + (kind<=3?0.04:0);       // 근접도 + 쉬운 세트 약간 선호
    if (score>bestScore){bestScore=score;best=kind;}
  }
  return best ?? 6;
}
// 이 경매품을 내가 얼마나 원하는가 (0~1)
function wantValue(prize, myAcq, target) {
  let v=0;
  for (const c of prize){ if(!c)continue;
    const need=c.kind-cnt(myAcq,c.kind);
    let cv = need<=0?1: 1/need;
    if (c.kind===target) cv=Math.max(cv,0.75);
    if (need===1) cv=Math.max(cv,0.97);              // 이걸로 내 세트 완성!
    v=Math.max(v,cv);
  }
  return v;
}
// 상대를 막아야 하는 정도 (상대 세트 완성 임박)
function denyValue(prize, oppAcq) {
  let v=0;
  for (const c of prize){ if(!c)continue;
    const need=c.kind-cnt(oppAcq,c.kind);
    if (need===1) v=Math.max(v,0.88);                // 상대 완성 코앞 → 무조건 뺏기
    else if (need===2) v=Math.max(v,0.45);
  }
  return v;
}
function offerX(hand, myAcq, oppAcq) {
  const target=feasibleTarget(myAcq,oppAcq);
  let pool=hand.filter(c=>c.kind!==target);
  if(!pool.length) pool=hand.slice();
  // 상대가 1장 남은 종류는 출품 회피(뺏기면 완성시켜줌)
  const safe=pool.filter(c=>c.kind-cnt(oppAcq,c.kind)!==1);
  const use=safe.length?safe:pool;
  return [...use].sort((a,b)=>strength(b)-strength(a))[0];   // 배팅가치 가장 약한 카드 출품
}
function typeX(hand, prize, myAcq, oppAcq) {
  const val=Math.max(wantValue(prize,myAcq,feasibleTarget(myAcq,oppAcq)), denyValue(prize,oppAcq));
  return val>=0.5 ? 'open' : 'closed';               // 원하면 오픈(내 배팅 숨김), 버리면 클로즈
}
function decideBidX(hand, prize, myAcq, oppAcq, visOpp) {
  const byStrong=[...hand].sort((a,b)=>strength(a)-strength(b));  // 강한 순
  const target=feasibleTarget(myAcq,oppAcq);
  const val=Math.max(wantValue(prize,myAcq,target), denyValue(prize,oppAcq));
  if (visOpp) {                                       // 클로즈 후공: 상대 배팅 보임 → 최소 승리 배팅
    if (val<0.32) return byStrong[byStrong.length-1];
    const winners=hand.filter(c=>aBeatsB(c,visOpp)).sort((a,b)=>strength(b)-strength(a)); // 이기는 카드 중 가장 약한
    if (winners.length) return winners[0];
    return byStrong[byStrong.length-1];              // 못 이기면 최약 덤핑
  }
  if (val>=0.8)  return byStrong[0];
  if (val>=0.55) return byStrong[Math.min(1,byStrong.length-1)];
  if (val>=0.3)  return byStrong[Math.floor(byStrong.length/2)];
  return byStrong[byStrong.length-1];
}

// ── expertx2: 진행도 인식 추가 (열세면 싸게라도 경매 이겨 카드 축적) ──
function decideBidX2(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const byStrong=[...hand].sort((a,b)=>strength(a)-strength(b));
  const target=feasibleTarget(myAcq,oppAcq);
  let val=Math.max(wantValue(prize,myAcq,target), denyValue(prize,oppAcq));
  // 경매 승리 자체가 진행도(획득 2장)에 유리 → 카드가 뒤지거나 종반이면 적극 경합
  const behind = myAcq.length <= oppAcq.length;
  const late = deckLeft <= 5;
  if (behind || late) val = Math.max(val, late ? 0.5 : 0.42);
  if (visOpp) {
    if (val<0.3) return byStrong[byStrong.length-1];
    const winners=hand.filter(c=>aBeatsB(c,visOpp)).sort((a,b)=>strength(b)-strength(a));
    if (winners.length) return winners[0];
    return byStrong[byStrong.length-1];
  }
  if (val>=0.8)  return byStrong[0];
  if (val>=0.55) return byStrong[Math.min(1,byStrong.length-1)];
  if (val>=0.3)  return byStrong[Math.floor(byStrong.length/2)];
  return byStrong[byStrong.length-1];
}

// ── AI 디스패처 ──
function aiOffer(hand, myAcq, oppAcq, d){ return (d==='expertx'||d==='expertx2')?offerX(hand,myAcq,oppAcq):cpuChooseOffer(hand,myAcq); }
function aiType(hand, prize, myAcq, oppAcq, d){ return (d==='expertx'||d==='expertx2')?typeX(hand,prize,myAcq,oppAcq):cpuChooseType(hand,prize,myAcq,d); }
function aiBid(hand, prize, myAcq, oppAcq, type, visOpp, d, deckLeft){
  if (d==='expertx2') return decideBidX2(hand,prize,myAcq,oppAcq,visOpp,deckLeft);
  if (d==='expertx')  return decideBidX(hand,prize,myAcq,oppAcq,visOpp);
  return cpuDecideBid(hand,prize,myAcq,d);
}

// ── 한 판 시뮬 (순차 배팅: 진행자 먼저, 클로즈면 후공이 진행자 배팅 봄) ──
function playGame(d1, d2) {
  const deck = initDeck();
  const g = {
    centerDeck: deck.slice(0,12), hands:[deck.slice(12,18), deck.slice(18,24)],
    acq:[[],[]], auctioneer:0, turns:0,
  };
  const diff=[d1,d2];
  let guard=0;
  while (guard++ < 500) {
    if (g.centerDeck.length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const auc=g.auctioneer, opp=1-auc;
    const center=g.centerDeck.shift();
    if(g.hands[auc].length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const offCard=aiOffer(g.hands[auc], g.acq[auc], g.acq[opp], diff[auc]);
    g.hands[auc].splice(g.hands[auc].indexOf(offCard),1);
    const prize=[center, offCard];
    const type=aiType(g.hands[auc], prize, g.acq[auc], g.acq[opp], diff[auc]);
    if(g.hands[auc].length===0||g.hands[opp].length===0) return { winner:resolveEnd(g.acq[0],g.acq[1]), turns:g.turns };
    const dl = g.centerDeck.length;
    // 진행자 먼저 배팅
    const bidA=aiBid(g.hands[auc], prize, g.acq[auc], g.acq[opp], type, null, diff[auc], dl);
    g.hands[auc].splice(g.hands[auc].indexOf(bidA),1);
    // 후공 배팅 (클로즈면 진행자 배팅 공개)
    const visForOpp = type==='closed' ? bidA : null;
    const bidO=aiBid(g.hands[opp], prize, g.acq[opp], g.acq[auc], type, visForOpp, diff[opp], dl);
    g.hands[opp].splice(g.hands[opp].indexOf(bidO),1);
    // 정산
    const aucWins=aBeatsB(bidA,bidO);
    if(aucWins)g.acq[auc].push(center,offCard); else g.acq[opp].push(center,offCard);
    g.hands[opp].push(bidA); g.hands[auc].push(bidO);
    g.turns++;
    const s0=checkSet(g.acq[0]), s1=checkSet(g.acq[1]);
    if(s0)return{winner:0,turns:g.turns,setKind:s0};
    if(s1)return{winner:1,turns:g.turns,setKind:s1};
    g.auctioneer = 1 - g.auctioneer;   // 실제 게임처럼 진행자 매 턴 교대
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
