// 테마 시안 생성 — 한 벌의 틀에 색만 갈아 끼운다.
// 네 장을 손으로 각각 쓰면 다음에 배치를 고칠 때 네 번 고쳐야 하고,
// 그러다 한 장만 어긋난다.
import { writeFileSync } from 'node:fs';

const THEMES = {
  Ink: {
    label: '먹과 주',
    BASE: '#0c0a09',
    FIELD: '#2c1613 0%, #150a08 55%, #060403 100%',
    NOISE: '0 0 0 0 0.26 0 0 0 0 0.13 0 0 0 0 0.09 0 0 0 0.34 0',
    WEAVE: '%23e0b45c', WEAVE_OP: '.06',
    CASE: '#1e1715 0%, #0d0a09 100%',
    TRIM: '#c8a24a', TRIM_HI: 'rgba(255,224,150,.3)',
    BAR: '#1e1715 0%, #0c0908 100%',
    FELT_S: '#2a7d4e 0%, #14442b 62%, #082115 100%',
    FELT_M: '#2a5a9e 0%, #14356a 62%, #081a38 100%',
    TXT: '#f2e6cc', TXT_DIM: '#9c8f7c', TXT_SUB: '#c8a24a',
    SH: '0 2px 6px rgba(0,0,0,.45)', SH_BIG: '0 6px 18px rgba(0,0,0,.4)',
    LOGO: '#fff3c8 0%, #f5cf6e 38%, #c8912e 62%, #8a5a12 100%',
    LOGO_SH: '#6a4210', LOGO_SH2: '#4a2c08', LOGO_GLOW: 'rgba(255,200,90,.34)',
    TAG: '#241c19 0%, #14100e 100%', TAG_TXT: '#e0c88a',
    VIG: 'rgba(0,0,0,.46)',
    ACT: 'rgba(200,162,74,.18)', ACT_TXT: '#ffe9a8',
    AVA: '#2e2622 0%, #1a1512 100%',
    NOTE: '옻칠 검정에 금테. 단청의 먹과 주를 빌려 왔다.',
  },
  Midnight: {
    label: '심야 · 백금',
    BASE: '#05080f',
    FIELD: '#17253f 0%, #0a1020 55%, #03060c 100%',
    NOISE: '0 0 0 0 0.12 0 0 0 0 0.16 0 0 0 0 0.26 0 0 0 0.32 0',
    WEAVE: '%23a8c0e8', WEAVE_OP: '.05',
    CASE: '#182240 0%, #0a1020 100%',
    TRIM: '#9fb4d8', TRIM_HI: 'rgba(200,225,255,.32)',
    BAR: '#182240 0%, #090e1c 100%',
    FELT_S: '#1e6f60 0%, #10453c 62%, #082622 100%',
    FELT_M: '#2f4f96 0%, #1a3162 62%, #0b1a38 100%',
    TXT: '#e4ecf8', TXT_DIM: '#8fa0bc', TXT_SUB: '#9fb4d8',
    SH: '0 2px 6px rgba(0,0,0,.45)', SH_BIG: '0 6px 18px rgba(0,0,0,.4)',
    LOGO: '#ffffff 0%, #d8e4f8 38%, #93a8cc 62%, #4e5e7e 100%',
    LOGO_SH: '#2a3450', LOGO_SH2: '#1a2438', LOGO_GLOW: 'rgba(170,205,255,.34)',
    TAG: '#1c2740 0%, #0e1626 100%', TAG_TXT: '#c4d4ee',
    VIG: 'rgba(0,0,0,.45)',
    ACT: 'rgba(159,180,216,.18)', ACT_TXT: '#e4ecf8',
    AVA: '#243350 0%, #141c30 100%',
    NOTE: '남색 가죽에 백금. 밤의 카드방 쪽으로 차갑게.',
  },
  Ivory: {
    label: '상아 · 감',
    BASE: '#efe7da',
    FIELD: '#f7f0e2 0%, #e4d6bd 58%, #cebda0 100%',
    NOISE: '0 0 0 0 0.42 0 0 0 0 0.36 0 0 0 0 0.28 0 0 0 0.16 0',
    WEAVE: '%238a6a3a', WEAVE_OP: '.07',
    CASE: '#fdfaf3 0%, #e6d9c2 100%',
    TRIM: '#b0873c', TRIM_HI: 'rgba(255,255,255,.9)',
    BAR: '#fdfaf3 0%, #e8dcc6 100%',
    FELT_S: '#2f8a58 0%, #1c5636 62%, #123725 100%',
    FELT_M: '#3563aa 0%, #1e3c74 62%, #142748 100%',
    TXT: '#3a2a1c', TXT_DIM: '#8a7860', TXT_SUB: '#a8642c',
    SH: '0 2px 7px rgba(120,92,52,.3)', SH_BIG: '0 8px 20px rgba(120,92,52,.32)',
    LOGO: '#b0873c 0%, #d8a854 34%, #a8642c 66%, #6e3c14 100%',
    LOGO_SH: '#e8d8b8', LOGO_SH2: '#c8b48c', LOGO_GLOW: 'rgba(200,150,60,.28)',
    TAG: '#fdf8ec 0%, #ecdcc0 100%', TAG_TXT: '#7a5a28',
    VIG: 'rgba(120,95,60,.16)',
    ACT: 'rgba(168,100,44,.14)', ACT_TXT: '#8a4a18',
    AVA: '#e8dcc6 0%, #d4c4a8 100%',
    NOTE: '유일하게 밝은 안. 낮에 밖에서도 읽히지만 밤 카드방의 분위기는 잃는다.',
  },
};

const tpl = (t) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@500;600;700&display=swap">
  <style>
    body { margin:0; font-family:'Fredoka',system-ui,sans-serif; background:${t.BASE}; }
    a { color:${t.TXT_SUB}; text-decoration:none; } a:hover { color:${t.TXT}; }
    .ff, .ff * { box-sizing:border-box; }
    .ff button { font-family:'Fredoka'; cursor:pointer; border:none; background:none; color:inherit; padding:0; }
    .ff svg { fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .ff-bg {
      background-color:${t.BASE};
      background-image:
        url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/><feColorMatrix type='matrix' values='${t.NOISE}'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>"),
        radial-gradient(ellipse 130% 95% at 50% 26%, ${t.FIELD});
    }
    .ff-weave { position:absolute; inset:0; pointer-events:none; opacity:${t.WEAVE_OP};
      background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='58' height='58'><g fill='${t.WEAVE}'><path d='M14 8c0 0-4 4.2-4 6.4 0 1.5 1.5 2.4 3 1.8l-.7 2.8h3.4l-.7-2.8c1.5.6 3-.3 3-1.8C18 12.2 14 8 14 8z'/><path d='M44 38l3.4 3.4L44 44.8l-3.4-3.4z'/></g></svg>"); }
    .ff-vig { position:absolute; inset:0; pointer-events:none;
      background:radial-gradient(ellipse 78% 58% at 50% 44%, rgba(0,0,0,0) 40%, ${t.VIG} 100%); }
    .ff .lg h1, .ff .lg .flap {
      margin:0; font-family:'Bangers',cursive; font-size:3.55rem; letter-spacing:3.5px; line-height:.9;
      background:linear-gradient(180deg, ${t.LOGO});
      -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
      filter:drop-shadow(0 1px 0 ${t.LOGO_SH}) drop-shadow(0 2px 0 ${t.LOGO_SH2})
             drop-shadow(0 4px 6px rgba(0,0,0,.4)) drop-shadow(0 0 18px ${t.LOGO_GLOW}); }
    .ff .lg .flap { transform:rotate(180deg); display:inline-block; opacity:.92; }
    .ff .rule { display:flex; align-items:center; gap:10px; width:172px; margin:13px auto 0; }
    .ff .rule span { flex:1; height:1.5px; border-radius:1px;
      background:linear-gradient(90deg,transparent,${t.TRIM},transparent); }
    .ff .rule i { width:8px; height:8px; flex-shrink:0; transform:rotate(45deg);
      background:${t.TRIM}; box-shadow:0 0 12px ${t.TRIM_HI}, 0 1px 2px rgba(0,0,0,.35); }
    .ff .top-link { position:relative; transition:.15s; }
    .ff .top-link::after { content:''; position:absolute; inset:3px; border-radius:8px;
      border:1px dashed ${t.TRIM}; opacity:.5; pointer-events:none; }
    .ff .top-link:hover { filter:brightness(1.08); }
    .ff .mode-card { transition:.17s; position:relative; }
    .ff .mode-card::after { content:''; position:absolute; inset:5px; border-radius:14px;
      border:1.5px dashed ${t.TRIM}; opacity:.5; pointer-events:none; }
    .ff .mode-card:hover { transform:translateY(-3px); filter:brightness(1.06); }
    .ff .felt { position:relative; flex:1; width:100%; border-radius:13px; display:flex;
      flex-direction:column; align-items:center; justify-content:center; gap:7px;
      box-shadow:inset 0 3px 18px rgba(0,0,0,.62), inset 0 0 0 1px ${t.TRIM_HI}; }
    .ff .misc { transition:.14s; color:${t.TXT_DIM}; }
    .ff .misc:hover { color:${t.TXT_SUB}; }
  </style>
</helmet>

<div class="ff ff-bg" style="position:relative; width:390px; height:844px; overflow:hidden;
  color:${t.TXT}; display:flex; flex-direction:column;">
  <div class="ff-weave"></div>
  <div class="ff-vig"></div>

  <div style="position:relative; z-index:2; flex-shrink:0; display:flex; flex-direction:column;
    overflow:hidden; background:linear-gradient(180deg, ${t.BAR});
    border-radius:0 0 18px 18px; box-shadow:${t.SH_BIG};">
    <div style="display:flex; align-items:center; gap:11px; padding:12px 15px 13px;">
      <div style="width:42px; height:42px; border-radius:12px; flex-shrink:0; display:flex;
        align-items:center; justify-content:center; color:${t.TXT_SUB};
        background:linear-gradient(160deg, ${t.AVA}); border:2px solid ${t.TRIM};">
        <svg viewBox="0 0 24 24" style="width:21px; height:21px;"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"></path></svg>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:.98rem; font-weight:800; color:${t.TXT}; line-height:1.25;">게스트9063</div>
        <div style="font-size:.66rem; color:${t.TXT_DIM}; line-height:1.35;">게스트 · 기록이 저장되지 않아요</div>
      </div>
      <button style="min-height:44px; padding:0 16px; border-radius:999px; font-size:.79rem;
        font-weight:700; color:${t.TXT}; background:linear-gradient(180deg, ${t.TAG});
        border:1.5px solid ${t.TRIM};">로그인</button>
      <button title="설정" style="width:44px; height:44px; border-radius:12px; color:${t.TXT_SUB};
        display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <svg viewBox="0 0 24 24" style="width:19px; height:19px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </div>
    <div style="height:5px; background:rgba(0,0,0,.28); overflow:hidden;">
      <div style="height:100%; width:34%; background:${t.TRIM};"></div>
    </div>
  </div>

  <div style="position:relative; z-index:2; flex:1; min-height:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:23px; padding:6px 23px 10px;">
    <div class="lg" style="text-align:center;">
      <h1>FLIP</h1><div class="flap">FLAP</div>
      <div class="rule"><span></span><i></i><span></span></div>
    </div>

    <div style="display:flex; gap:8px; width:100%;">
      <button class="top-link" style="flex:1; min-width:0; min-height:44px; display:flex;
        align-items:center; justify-content:center; gap:7px; padding:0 8px; border-radius:12px;
        font-size:.76rem; font-weight:700; background:linear-gradient(180deg, ${t.TAG});
        border:1.5px solid ${t.TRIM}; color:${t.TAG_TXT}; box-shadow:${t.SH};">
        <svg viewBox="0 0 24 24" style="width:17px; height:17px; flex-shrink:0;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
        게임방법
      </button>
      <button class="top-link" style="flex:1; min-width:0; min-height:44px; display:flex;
        align-items:center; justify-content:center; gap:7px; padding:0 8px; border-radius:12px;
        font-size:.76rem; font-weight:700; background:linear-gradient(180deg, ${t.TAG});
        border:1.5px solid ${t.TRIM}; color:${t.TAG_TXT}; box-shadow:${t.SH};">
        <svg viewBox="0 0 24 24" style="width:17px; height:17px; flex-shrink:0;"><path d="M22 10 12 5 2 10l10 5z"></path><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"></path><path d="M22 10v6"></path></svg>
        튜토리얼
      </button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; width:100%;">
      <button class="mode-card" style="height:216px; display:flex; padding:7px; border-radius:20px;
        border:2.5px solid ${t.TRIM}; background:linear-gradient(180deg, ${t.CASE});
        box-shadow:inset 0 1px 0 ${t.TRIM_HI}, ${t.SH_BIG};">
        <span class="felt" style="background:radial-gradient(ellipse at 50% 32%, ${t.FELT_S});">
          <svg viewBox="0 0 48 48" style="width:52px; height:52px; stroke:none; filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));">
            <rect x="13" y="7" width="22" height="32" rx="4.5" fill="#f7d98a" stroke="#7a4e10" stroke-width="2"></rect>
            <path d="M24 13C24 13 17 20 17 24.5c0 2.7 2.7 4.3 5.5 3.1L21.3 33h5.4l-1.2-5.4c2.8 1.2 5.5-.4 5.5-3.1C31 20 24 13 24 13Z" fill="#2a0a10"></path>
          </svg>
          <span style="font-size:1.14rem; font-weight:800; color:#f7ecd0; letter-spacing:.6px;
            text-shadow:0 1px 3px rgba(0,0,0,.7);">솔로플레이</span>
          <span style="font-size:.68rem; color:#bfe0cc; opacity:.9;">AI와 대전</span>
        </span>
      </button>
      <button class="mode-card" style="height:216px; display:flex; padding:7px; border-radius:20px;
        border:2.5px solid ${t.TRIM}; background:linear-gradient(180deg, ${t.CASE});
        box-shadow:inset 0 1px 0 ${t.TRIM_HI}, ${t.SH_BIG};">
        <span class="felt" style="background:radial-gradient(ellipse at 50% 32%, ${t.FELT_M});">
          <svg viewBox="0 0 48 48" style="width:52px; height:52px; stroke:none; filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));">
            <g transform="rotate(-16 24 25)"><rect x="7" y="9" width="19" height="29" rx="4" fill="#c99a3a" stroke="#7a4e10" stroke-width="2"></rect></g>
            <g transform="rotate(16 24 25)"><rect x="22" y="9" width="19" height="29" rx="4" fill="#f7d98a" stroke="#7a4e10" stroke-width="2"></rect>
              <path d="M31.5 15s-5.8 5.8-5.8 9.5c0 2.1 2.1 3.4 4.2 2.4l-1 4.4h5.2l-1-4.4c2.1 1 4.2-.3 4.2-2.4 0-3.7-5.8-9.5-5.8-9.5Z" fill="#2a0a10"></path></g>
          </svg>
          <span style="font-size:1.14rem; font-weight:800; color:#f7ecd0; letter-spacing:.6px;
            text-shadow:0 1px 3px rgba(0,0,0,.7);">멀티플레이</span>
          <span style="font-size:.68rem; color:#c2d6f0; opacity:.9;">온라인 대전</span>
        </span>
      </button>
    </div>

    <div style="display:flex; gap:4px; width:100%; justify-content:center;">
      <button class="misc" style="flex:1; min-height:44px; display:flex; align-items:center;
        justify-content:center; gap:5px; font-size:.66rem; font-weight:600; border-radius:11px;">
        <svg viewBox="0 0 24 24" style="width:14px; height:14px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        친구 초대
      </button>
      <button class="misc" style="flex:1; min-height:44px; display:flex; align-items:center;
        justify-content:center; gap:5px; font-size:.66rem; font-weight:600; border-radius:11px;">
        <svg viewBox="0 0 24 24" style="width:14px; height:14px;"><rect x="7" y="2" width="10" height="20" rx="2.5"></rect><path d="M11 18h2"></path></svg>
        앱으로 추가
      </button>
      <button class="misc" style="flex:1; min-height:44px; display:flex; align-items:center;
        justify-content:center; gap:5px; font-size:.66rem; font-weight:600; border-radius:11px;">
        <svg viewBox="0 0 24 24" style="width:14px; height:14px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        버그 제보
      </button>
    </div>
  </div>

  <div style="position:relative; z-index:2; flex-shrink:0; display:flex; padding:6px 4px;
    background:linear-gradient(180deg, ${t.BAR});
    border-radius:18px 18px 0 0; box-shadow:${t.SH_BIG};">
    ${[['홈','M3 10.5 12 3l9 7.5|M5 9.5V20h14V9.5',1],
       ['미션','',0],['상점','',0],['친구','',0],['클랜','',0],['랭킹','',0]]
      .map(([label,, on]) => `<button style="flex:1; min-height:44px; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:3px; border-radius:12px; font-size:.62rem;
      font-weight:700; color:${on ? t.ACT_TXT : t.TXT_DIM}; background:${on ? t.ACT : 'none'};">
      ${NAV_ICON[label]}${label}
    </button>`).join('\n    ')}
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;

const NAV_ICON = {
  '홈': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V20h14V9.5"></path></svg>',
  '미션': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.4"></circle></svg>',
  '상점': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><circle cx="9" cy="20" r="1.4"></circle><circle cx="18" cy="20" r="1.4"></circle><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"></path></svg>',
  '친구': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><circle cx="9" cy="8" r="3.4"></circle><path d="M2 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"></path><path d="M17 8.5a3 3 0 0 1 0 5.4"></path><path d="M19 20c0-2.6-1-4.2-2.6-5"></path></svg>',
  '클랜': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z"></path></svg>',
  '랭킹': '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M7 4h10v6a5 5 0 0 1-10 0z"></path><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4"></path><path d="M17 6h2.5a2.5 2.5 0 0 1-2.5 4"></path><path d="M10 20h4M12 15v5"></path></svg>',
};

// 심야 안의 펠트 짝. 케이스 남색과 같은 계열이던 멀티 파랑이 파묻혀
// 한쪽은 묻히고 한쪽은 겉돌았다 — 짝이 맞으려면 둘이 케이스에서
// 비슷한 만큼 떨어져 있어야 한다.
const MID_FELTS = {
  MidnightJade: { label: '심야 · 청옥과 감청',
    FELT_S: '#2c7f72 0%, #154a41 62%, #0a2823 100%',
    FELT_M: '#2f74b8 0%, #17457a 62%, #0b2444 100%' },
  MidnightSilver: { label: '심야 · 은녹과 강청',
    FELT_S: '#4a7d72 0%, #2c4f47 62%, #182c28 100%',
    FELT_M: '#4a6e9e 0%, #2c4468 62%, #18263c 100%' },
  MidnightGrape: { label: '심야 · 청록과 포도',
    FELT_S: '#1d7a72 0%, #0f4741 62%, #082623 100%',
    FELT_M: '#7d5eb6 0%, #48327a 62%, #271a42 100%' },
};

for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(`${name}.dc.html`, tpl(t));
  console.log(`${name}.dc.html — ${t.label}`);
}
for (const [name, f] of Object.entries(MID_FELTS)) {
  writeFileSync(`${name}.dc.html`, tpl({ ...THEMES.Midnight, ...f }));
  console.log(`${name}.dc.html — ${f.label}`);
}
