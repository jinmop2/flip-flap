// 로비 모드 카드 · 로고 시안. 값은 앱에서 그대로 뜯어왔다:
//   카드 159×203 · 테두리 5px #1b2026 + 외곽선 1.5px #282d34 · 모서리 18
//   펠트(솔로) #305275→#22374c 78%→#15283b · (멀티) #1a354f→#102031→#0b1928
//   안쪽 선 inset 7px · 1px rgba(144,167,200,.12) · 제목 1.14rem/800 #e6edf8
//   설명 .68rem #b8c4d6 · 칸 사이 12px
import fs from 'node:fs';
const out = (n, s) => fs.writeFileSync(new URL('./' + n + '.dc.html', import.meta.url), s);

const HEAD = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { margin:0; font-family:'Fredoka',system-ui,sans-serif; }
    a { color:#9fb4d8; } a:hover { color:#cfe0f6; }
    .card { position:relative; border-radius:18px; overflow:hidden; padding:0;
      border:5px solid #1b2026; outline:1.5px solid #282d34;
      box-shadow:inset 0 0 40px rgba(0,0,0,.55), inset 0 0 0 2px rgba(144,167,200,.18), 0 8px 22px rgba(0,0,0,.6); }
    .card::after { content:''; position:absolute; inset:7px; border-radius:12px; pointer-events:none;
      border:1px solid rgba(144,167,200,.12); box-shadow:inset 0 0 22px rgba(0,0,0,.25); }
    .felt { position:relative; width:100%; height:100%;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; }
    .t { font-size:1.14rem; font-weight:800; color:#e6edf8; letter-spacing:.6px; text-shadow:0 1px 3px rgba(0,0,0,.7); }
    .s { font-size:.68rem; color:#b8c4d6; opacity:.9; letter-spacing:.3px; }
    .ico { filter:drop-shadow(0 3px 8px rgba(0,0,0,.5)); }
  </style>
</helmet>
`;
const TAIL = (w, h) => `</x-dc>
<script data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;
const GROUND = (w, h, extra = '') => `<div style="width:${w}px; height:${h}px; position:relative; overflow:hidden;
     display:flex; align-items:center; justify-content:center;
     background:linear-gradient(180deg,#152037 0%,#0c1220 40%,#090e19 100%);">
  <div style="position:absolute; inset:0; opacity:.055; pointer-events:none;
       background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='58' height='58'><g fill='%23bfd5f6'><path d='M14 8c0 0-4 4.2-4 6.4 0 1.5 1.5 2.4 3 1.8l-.7 2.8h3.4l-.7-2.8c1.5.6 3-.3 3-1.8C18 12.2 14 8 14 8z'/><path d='M44 38l3.4 3.4L44 44.8l-3.4-3.4z'/></g></svg>&quot;);"></div>
${extra}`;

const FELT_SOLO_NOW  = 'radial-gradient(ellipse 90% 70% at 50% 50%, #305275 0%, #22374c 78%, #15283b 100%)';
const FELT_MULTI_NOW = 'radial-gradient(ellipse 90% 70% at 50% 50%, #1a354f 0%, #102031 78%, #0b1928 100%)';

// ── 지금 쓰는 문장 ────────────────────────────────────────────────────────
const EM_SOLO_NOW = `<svg width="43" height="43" viewBox="0 0 48 48">
        <rect x="14" y="8" width="20" height="30" rx="4" fill="#f7d98a" stroke="#5e3a0c" stroke-width="2"/>
        <path d="M24 13.5 C24 13.5 17.5 20 17.5 24.2 C17.5 26.7 20 28.2 22.6 27.1 L21.5 32.5 L26.5 32.5 L25.4 27.1 C28 28.2 30.5 26.7 30.5 24.2 C30.5 20 24 13.5 24 13.5 Z" fill="#2a0a10"/>
      </svg>`;
const EM_MULTI_NOW = `<svg width="43" height="43" viewBox="0 0 48 48">
        <g transform="rotate(-16 24 25)"><rect x="7" y="10" width="18" height="27" rx="3.5" fill="#cfe0f4" stroke="#2b4c6d" stroke-width="2"/></g>
        <g transform="rotate(16 24 25)"><rect x="23" y="10" width="18" height="27" rx="3.5" fill="#f7d98a" stroke="#5e3a0c" stroke-width="2"/>
          <path d="M32 16 C32 16 26.5 21.5 26.5 25 C26.5 27 28.5 28.2 30.5 27.3 L29.5 31.5 L34.5 31.5 L33.5 27.3 C35.5 28.2 37.5 27 37.5 25 C37.5 21.5 32 16 32 16 Z" fill="#2a0a10"/></g>
      </svg>`;

// ── 다듬은 문장 — 두 그림이 같은 말투를 쓰게 ──────────────────────────────
// 카드 한 장의 규격을 하나로 못 박고(18×27 · r3.5 · 테두리 2), 솔로는 그
// 한 장을 똑바로, 멀티는 같은 장을 둘 겹쳐 기울인다. 스페이드도 같은 크기다.
const SPADE = (cx, cy, s) => {
  const p = (x, y) => `${(cx + x * s).toFixed(1)} ${(cy + y * s).toFixed(1)}`;
  return `<path d="M${p(0,-5.2)} C${p(0,-5.2)} ${p(-5.2,0.8)} ${p(-5.2,4.2)} C${p(-5.2,6.2)} ${p(-3.1,7.4)} ${p(-1.1,6.5)} L${p(-2,10.4)} L${p(2,10.4)} L${p(1.1,6.5)} C${p(3.1,7.4)} ${p(5.2,6.2)} ${p(5.2,4.2)} C${p(5.2,0.8)} ${p(0,-5.2)} ${p(0,-5.2)} Z" fill="#20303f"/>`;
};
const CARD = (x, y, fill, stroke) =>
  `<rect x="${x}" y="${y}" width="18" height="27" rx="3.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const GOLD = ['#f4d98d', '#6b4712'], PALE = ['#cfe0f4', '#33526f'];

const EM_SOLO_NEW = `<svg width="43" height="43" viewBox="0 0 48 48">
        <g transform="rotate(-7 24 24)">${CARD(15, 10, GOLD[0], GOLD[1])}${SPADE(24, 23, 1)}</g>
      </svg>`;
const EM_MULTI_NEW = `<svg width="43" height="43" viewBox="0 0 48 48">
        <g transform="rotate(-15 24 24)">${CARD(8, 10, PALE[0], PALE[1])}${SPADE(17, 23, 0.86)}</g>
        <g transform="rotate(9 24 24)">${CARD(22, 10, GOLD[0], GOLD[1])}${SPADE(31, 23, 0.86)}</g>
      </svg>`;

const CARDS = (soloFelt, multiFelt, emSolo, emMulti, w = 159, h = 203, wSolo) => `
  <div style="position:relative; display:grid; grid-template-columns:${wSolo ? wSolo + 'px ' + (2 * w + 12 - wSolo) + 'px' : '1fr 1fr'}; gap:12px; width:${2 * w + 12}px;">
    <div class="card" style="height:${h}px;">
      <div class="felt" style="background:${soloFelt};">
        <span class="ico">${emSolo}</span><span class="t">솔로플레이</span><span class="s">AI와 대전</span>
      </div>
    </div>
    <div class="card" style="height:${h}px;">
      <div class="felt" style="background:${multiFelt};">
        <span class="ico">${emMulti}</span><span class="t">멀티플레이</span><span class="s">온라인 대전</span>
      </div>
    </div>
  </div>
</div>
`;

const W = 400, H = 300;
out('Current', HEAD + GROUND(W, H) + CARDS(FELT_SOLO_NOW, FELT_MULTI_NOW, EM_SOLO_NOW, EM_MULTI_NOW) + TAIL(W, H));

// 안 ① — 문장을 한 벌로 맞춘다. 펠트는 그대로 둔다(밝기 차는 유지).
out('Main', HEAD + GROUND(W, H) + CARDS(FELT_SOLO_NOW, FELT_MULTI_NOW, EM_SOLO_NEW, EM_MULTI_NEW) + TAIL(W, H));

// 안 ② — 거기에 색조를 갈라 준다. 로비의 낮은 채도 안에서만 움직인다.
const FELT_SOLO_HUE = 'radial-gradient(ellipse 90% 70% at 50% 50%, #2f6157 0%, #22423b 78%, #142925 100%)';
out('Hue', HEAD + GROUND(W, H) + CARDS(FELT_SOLO_HUE, FELT_MULTI_NOW, EM_SOLO_NEW, EM_MULTI_NEW) + TAIL(W, H));

// 안 ③ — 크기로 우선순위를 말한다(마크업 주석이 원래 그렇게 적혀 있다).
out('Size', HEAD + GROUND(W, H) + CARDS(FELT_SOLO_NOW, FELT_MULTI_NOW, EM_SOLO_NEW, EM_MULTI_NEW, 159, 203, 186) + TAIL(W, H));

console.log('✓ 모드 카드 네 장');

// ── 로고 — 기울이고 살짝 벌려 번개 결로 ──────────────────────────────────
// 지금 로고는 두 낱말이 정확히 겹쳐 쌓여 있다. 번개는 '한 번 꺾이는' 모양이라,
// 서로 반대로 기울이고 좌우로 조금 어긋내면 그 결이 난다.
// 많이 벌리면 두 낱말이 갈라져 이름이 아니라 두 단어로 읽히므로 조금만.
const CHROME = `background:linear-gradient(180deg,#ffffff 0%,#d8e4f8 38%,#93a8cc 62%,#4e5e7e 100%);
        -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;`;
const RELIEF = `filter:drop-shadow(0 1px 0 #2a3450) drop-shadow(0 2px 0 #1a2438)
        drop-shadow(0 4px 6px rgba(0,0,0,.5)) drop-shadow(0 0 16px rgba(170,205,255,.34));`;

// tilt = 기울기(도) · shift = 좌우로 어긋내는 값(px) · pull = 두 줄 사이 당김
const LOGO = (tilt, shift, pull = -17, size = 70) => `
  <div style="position:relative; text-align:center; line-height:.9;">
    <div style="padding:9px 6px; margin:-9px -6px 0; font-size:${size}px; letter-spacing:5px;
         transform:rotate(${-tilt}deg) translateX(${-shift}px); ${CHROME} ${RELIEF}">FLIP</div>
    <div style="padding:9px 6px; margin:${pull}px -6px 0; font-size:${size}px; letter-spacing:5px;
         transform:rotate(180deg) rotate(${-tilt}deg) translateX(${-shift}px); display:inline-block;
         ${CHROME} ${RELIEF}">FLAP</div>
  </div>
</div>
`;
const LW = 400, LH = 280;
out('LogoNow',   HEAD + GROUND(LW, LH) + LOGO(0, 0) + TAIL(LW, LH));
out('LogoBolt',  HEAD + GROUND(LW, LH) + LOGO(5, 9) + TAIL(LW, LH));
out('LogoBolt2', HEAD + GROUND(LW, LH) + LOGO(8, 15) + TAIL(LW, LH));
console.log('✓ 로고 세 장');
