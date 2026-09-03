// ── 2인전 규칙 ────────────────────────────────────────────────────────────
//
// 판을 굴리는 데 필요한 순수한 셈만 모아 둔 곳이다. 방·소켓·계정·타이머는
// 하나도 안 쓴다. 그래서 서버에서도, 브라우저에서도 똑같이 돈다 —
// 그물이 끊겼을 때 화면이 혼자 판을 굴리려면 이 셈이 양쪽에 다 있어야 한다.
//
// 여기 있는 것을 고치면 온라인 판의 규칙이 그대로 바뀐다. 셈이 맞는지는
// tests/t_rules2.js 가 지켜본다 — 서버를 안 띄우고 다 확인할 수 있다.
//
// 여기 두면 안 되는 것: 무엇을 누구에게 보낼지, 언제 기다릴지, 코인·전적.
// 그건 판의 규칙이 아니라 살림살이다.

const SPEC = [[2,2],[3,5],[4,7],[6,10]];

function initDeck() {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++)
      cards.push({ kind, grade: g, id: kind*100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards; // 24장
}

// 배팅 강도: 값이 작을수록 강함 (종류 우선, 그 다음 등급)
function strength(c) { return c.kind * 100 + c.grade; }

const is610 = c => c.kind === 6 && c.grade === 10;
const is21  = c => c.kind === 2 && c.grade === 1;

// a가 b를 이기면 true. 졸개의 배신: 6-10이 2-1을 이긴다.
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}

function checkSet(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  for (const [kind] of SPEC)
    if ((counts[kind] || 0) >= kind) return kind;
  return null;
}
// 세트 진행도 [최고 근접비율, 총 획득수] — 덱 소진 시 판정용
function progress(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = 0, bestKind = null;
  for (const [kind] of SPEC) {
    const r = (counts[kind] || 0) / kind;
    if (r > best) { best = r; bestKind = kind; }
  }
  return { ratio: best, total: acquired.length, kind: bestKind };
}
// 세트 완성까지 남은 최소 장수 — 작을수록 "리치"에 가깝다
function needLeft(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = Infinity;
  for (const [kind] of SPEC) best = Math.min(best, kind - (counts[kind] || 0));
  return best;
}
// 획득 카드의 강함 합계 (strength 는 작을수록 강함)
function strengthSum(acquired) { return acquired.reduce((s, c) => s + strength(c), 0); }

// 반환: 1(P1승) | 2(P2승) | 0(무승부)
// 덱이 떨어져 승부가 안 났을 때 — 세트에 가장 가까운 사람이 이긴다.
// 한 단계에서 갈리지 않으면 다음 기준으로 넘어가, 사실상 무승부가 나지 않게 한다.
function resolveByProgress(acq1, acq2) {
  const n1 = needLeft(acq1), n2 = needLeft(acq2);
  if (n1 !== n2) return n1 < n2 ? 1 : 2;                     // ① 완성까지 남은 장수가 적은 쪽
  const a = progress(acq1), b = progress(acq2);
  if (a.ratio !== b.ratio) return a.ratio > b.ratio ? 1 : 2;  // ② 세트 진행률
  if (a.total !== b.total) return a.total > b.total ? 1 : 2;  // ③ 총 획득 장수
  const s1 = strengthSum(acq1), s2 = strengthSum(acq2);
  if (s1 !== s2) return s1 < s2 ? 1 : 2;                      // ④ 모은 카드가 더 강한 쪽
  return 0;   // 양쪽 모두 한 장도 못 가져간 극단적 경우에만 무승부
}

// 서버(require)와 브라우저(<script>) 양쪽에서 같은 파일을 읽는다.
// 빌드 도구를 들이면 이 한 파일 때문에 온 저장소에 설정이 붙는다 —
// 열두 줄로 끝나는 일이라 그러지 않는다.
const RULES2 = {
  SPEC, initDeck, strength, is610, is21, aBeatsB,
  checkSet, progress, needLeft, strengthSum, resolveByProgress,
};
if (typeof module !== 'undefined' && module.exports) module.exports = RULES2;
if (typeof window !== 'undefined') window.RULES2 = RULES2;
