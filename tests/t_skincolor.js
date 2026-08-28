// 상점에서 산 물건은 테마가 바뀌어도 제 색을 지킨다.
//
// 게임 전체를 심야·백금으로 옮길 때 색을 줄 단위로 건너뛰었는데, CSS 규칙이
// 여러 줄에 걸치면 선택자 줄만 지켜지고 안쪽 색은 그대로 바뀌었다 —
// 황금 카드백이 은색이 되고 무지개 닉네임이 파래졌다. 유저가 돈 주고 산
// 물건이라 테마 따라 바뀌면 안 된다.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (note ? '  ' + note : '')); }
};

// 규칙 덩어리를 훑는다. 선택자 앞의 주석은 떼어 낸다.
function rules(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '{') continue;
    let s = i - 1;
    while (s >= 0 && src[s] !== '}' && src[s] !== '{' && src[s] !== ';') s--;
    const sel = src.slice(s + 1, i).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    let depth = 0, k = i;
    for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) break; }
    if (k >= src.length) continue;
    if (sel && !sel.startsWith('@')) out.push({ sel, body: src.slice(i + 1, k) });
    i = k;
  }
  return out;
}

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const f = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
function oklch(hex) {
  const [R, G, B] = hex2rgb(hex); const r = f(R), g = f(G), b = f(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { C: Math.hypot(A, Bb), H: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360 };
}

console.log('① 산 물건의 색이 살아 있다');
{
  const body = (sel) => (rules(html).find((r) => r.sel === sel) || {}).body || '';
  // 황금 카드백 — 금박이 은박이 됐던 그 규칙
  const gold = body('.card.back.cb-gold');
  ok('황금 카드백 규칙이 있다', !!gold);
  ok('황금 카드백이 금색이다', /#7a5c10/.test(gold) && /#c99a2a/.test(gold) && /#ffe06a/.test(gold),
     '은색으로 바뀌면 여기서 걸린다');
  // 무지개 닉네임 — 본 규칙과 모션 줄이기 안에 두 번 나온다. 본 규칙을 봐야 한다.
  const rainbow = rules(html).filter((r) => r.sel === '.nc-rainbow').map((r) => r.body).join('');
  ok('무지개 닉네임이 무지개다',
     /#ff6b6b/.test(rainbow) && /#ffd94a/.test(rainbow) && /#7dd87d/.test(rainbow) && /#c39bff/.test(rainbow));
  ok('루비 카드백이 붉다', /#5c0a1e/.test(body('.card.back.cb-ruby')) && /#a51a38/.test(body('.card.back.cb-ruby')));
  ok('화투 카드백이 붉다', /#c8342c/.test(body('.card.back.cb-hwatu')));
  ok('오방색이 다섯 색 그대로다', ['#c8102e', '#f0a020', '#f4efe2', '#1f6fb2', '#2a2118']
     .every((h) => body('.card.back.cb-obang').includes(h)));
  ok('한지 카드백이 누렇다', /#f2e6cd/.test(body('.card.back.cb-hanji')) && /#8a6a3a/.test(body('.card.back.cb-hanji')));
}

console.log('\n② 카드 무늬와 모드 표식은 테마를 안 탄다');
{
  // 이 색들이 바뀌면 게임이 안 읽힌다. 테마를 또 옮길 때 휩쓸리기 쉬운 자리다.
  const must = {
    '카드 빨강': '#c1272d', '카드 파랑': '#1a5276', '카드 노랑': '#c9962c', '카드 먹': '#4a3728',
    '카드 앞면': '#f7d98a', '아이템전 보라': '#8b6ad8', 'TWELVE 하늘': '#6ac0f0',
    '다인전 초록': '#4a9a7a', '미니게임 분홍': '#d06a9a', '토너먼트 금': '#e0b45c',
    '코인 금색': '#ffd94a', '경고 빨강': '#ff9a9a',
  };
  for (const [name, hex] of Object.entries(must)) ok(name + ' 그대로', html.includes(hex), hex);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
