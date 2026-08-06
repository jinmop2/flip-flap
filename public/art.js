// 직접 그린 아이콘 모음 — 기본 이모지는 기기·OS마다 모양이 달라 게임 톤과 안 맞는다.
// 전송 규약은 그대로 두고(이모지 문자를 주고받음) 화면에 그릴 때만 이 SVG로 바꾼다.
// 매핑에 없는 것(상점 이모트 팩 등)은 원래 이모지로 자연스럽게 대체된다.
//
// 공통 규격: viewBox 0 0 48 48, 어두운 윤곽(#2a0a10)으로 실루엣을 잡고 밝은 면으로 채운다.
// <defs> id 는 한 화면에 여러 개가 동시에 들어가므로 반드시 유니크하게.

// ── AI 상대 아바타 ────────────────────────────────────────
const AI_AVATAR = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="aiHead" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfe4f5"/><stop offset="1" stop-color="#8fa8bd"/></linearGradient></defs>
  <path d="M24 6 v4" stroke="#2a0a10" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="24" cy="5" r="2.8" fill="#e06a5a" stroke="#2a0a10" stroke-width="1.6"/>
  <rect x="8" y="11" width="32" height="26" rx="8" fill="url(#aiHead)" stroke="#2a0a10" stroke-width="2"/>
  <rect x="12.5" y="16" width="23" height="13" rx="5" fill="#20303f" stroke="#2a0a10" stroke-width="1.5"/>
  <circle cx="19" cy="22.5" r="3" fill="#5fd0c0"/>
  <circle cx="29" cy="22.5" r="3" fill="#5fd0c0"/>
  <circle cx="19" cy="22.5" r="1.1" fill="#0d1b24"/>
  <circle cx="29" cy="22.5" r="1.1" fill="#0d1b24"/>
  <path d="M19 32.5 h10" stroke="#2a0a10" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="3.5" y="19" width="5" height="10" rx="2.4" fill="#8fa8bd" stroke="#2a0a10" stroke-width="1.6"/>
  <rect x="39.5" y="19" width="5" height="10" rx="2.4" fill="#8fa8bd" stroke="#2a0a10" stroke-width="1.6"/>
  <rect x="15" y="37" width="18" height="5" rx="2.4" fill="#6d8497" stroke="#2a0a10" stroke-width="1.6"/>
</svg>`;

// ── 기본 이모트 8종 ───────────────────────────────────────
const F = '#ffd45e', FS = '#2a0a10';   // 얼굴 기본색·윤곽
const face = inner => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="18" fill="${F}" stroke="${FS}" stroke-width="2"/>${inner}</svg>`;

const EMOTE_ART = {
  // 따봉
  '👍': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 22 c0-3 2-5 3-8 1-2.5 1-5 3-5 2.5 0 3.5 2 3.5 5 0 2-.6 3.6-1.2 5 h8.7
             c2.6 0 4.4 2 3.9 4.4 l-2.2 10.4 c-.4 2-2.2 3.4-4.3 3.4 H18 z"
          fill="${F}" stroke="${FS}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="8" y="22" width="8" height="16" rx="2.6" fill="#f0a83c" stroke="${FS}" stroke-width="2"/>
  </svg>`,
  // 크게 웃음
  '😆': face(`<path d="M13 19 l7 3 -7 3 z" fill="${FS}"/><path d="M35 19 l-7 3 7 3 z" fill="${FS}"/>
    <path d="M14 29 h20 a10 10 0 0 1 -20 0 z" fill="#8c2f22" stroke="${FS}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M17.5 34.5 a7.5 4 0 0 1 13 0 z" fill="#ff7a86"/>`),
  // 놀람
  '😮': face(`<circle cx="17.5" cy="20" r="2.6" fill="${FS}"/><circle cx="30.5" cy="20" r="2.6" fill="${FS}"/>
    <ellipse cx="24" cy="31" rx="5" ry="6.4" fill="#8c2f22" stroke="${FS}" stroke-width="1.6"/>`),
  // 비명
  '😱': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="24" cy="25" rx="15" ry="18" fill="#9fd8e8" stroke="${FS}" stroke-width="2"/>
    <ellipse cx="16.5" cy="21" rx="3.4" ry="5" fill="#fff" stroke="${FS}" stroke-width="1.5"/>
    <ellipse cx="31.5" cy="21" rx="3.4" ry="5" fill="#fff" stroke="${FS}" stroke-width="1.5"/>
    <circle cx="16.5" cy="22" r="1.9" fill="${FS}"/><circle cx="31.5" cy="22" r="1.9" fill="${FS}"/>
    <ellipse cx="24" cy="34" rx="4.6" ry="6" fill="#8c2f22" stroke="${FS}" stroke-width="1.6"/>
    <path d="M6 16 c2-4 4-6 6-7 M42 16 c-2-4-4-6-6-7" stroke="${FS}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  </svg>`,
  // 불꽃
  '🔥': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 3 C29 12 38 15 38 26 C38 35.9 31.7 43 24 43 C16.3 43 10 35.9 10 26
             C10 20 13 17 15.5 13 C16.5 18 19 20 21 21 C19.5 14 21 8 24 3 Z"
          fill="#ff7a1f" stroke="${FS}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 10 C28 17 33 20 33 27 C33 34 29 39.5 24 39.5 C19 39.5 15 34 15 27
             C15 23 17 21 18.5 18 C19.5 21.5 21 23 22.5 23.6 C21.5 19 22 14.5 24 10 Z"
          fill="#ffb02e"/>
    <path d="M24 24 C27 29 29.5 31 29.5 35 C29.5 38.9 27 42 24 42 C21 42 18.5 38.9 18.5 35
             C18.5 31 21 29 24 24 Z" fill="#ffe98c"/>
  </svg>`,
  // 고민
  '🤔': face(`<path d="M13 19 a5 4 0 0 1 8 -1" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="17.5" cy="23" r="2.4" fill="${FS}"/><circle cx="30.5" cy="23" r="2.4" fill="${FS}"/>
    <path d="M18 33 c3-2 7-2.4 11-1" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="35" cy="34" r="4.6" fill="#f0a83c" stroke="${FS}" stroke-width="1.8"/>`),
  // 능글
  '😏': face(`<path d="M13 21 a5 3.4 0 0 1 8 0" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M27 21 a5 3.4 0 0 1 8 0" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M15 31 c5 5 12 4 17 -2" stroke="${FS}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`),
  // 울음
  '😭': face(`<path d="M13 20 a5 4 0 0 1 8 2" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M35 20 a5 4 0 0 0 -8 2" stroke="${FS}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="24" cy="33" rx="5.6" ry="5" fill="#8c2f22" stroke="${FS}" stroke-width="1.6"/>
    <path d="M15 26 c-1 5-1 8 0 11 1-3 1-6 0-11 z" fill="#6ec8f0" stroke="${FS}" stroke-width="1.4"/>
    <path d="M33 26 c1 5 1 8 0 11 -1-3-1-6 0-11 z" fill="#6ec8f0" stroke="${FS}" stroke-width="1.4"/>`),
};

// ── 랭크 아이콘 6종 ───────────────────────────────────────
const star = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};
// 리본은 위에서 아래로 내려오는 끈 두 가닥, 원반은 그 아래. 등급은 별 개수로 구분.
const medal = (ribbon, ribbonDark, disc, edge, stars) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <path d="M13 3 h7 l6 17 h-7 z" fill="${ribbon}" stroke="${FS}" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M35 3 h-7 l-6 17 h7 z" fill="${ribbonDark}" stroke="${FS}" stroke-width="1.7" stroke-linejoin="round"/>
  <circle cx="24" cy="31" r="13" fill="${disc}" stroke="${FS}" stroke-width="2"/>
  <circle cx="24" cy="31" r="9.5" fill="none" stroke="${edge}" stroke-width="1.8"/>
  ${stars}
</svg>`;

const RANK_ART = {
  // 브론즈 — 별 1
  '🥉': medal('#e08a5a', '#b05a30', '#cd8a52', '#8a5220', star(24, 31, 5.2, '#7a4410')),
  // 실버 — 별 2
  '🥈': medal('#9ab2c8', '#6d8399', '#dde3ea', '#8b98a8',
    star(19, 31, 4.4, '#5f6b78') + star(29, 31, 4.4, '#5f6b78')),
  // 골드 — 별 3
  '🥇': medal('#e8544a', '#b02a26', '#f7d15a', '#a8790c',
    star(17.5, 31, 3.8, '#7a5808') + star(24, 29.5, 4.4, '#7a5808') + star(30.5, 31, 3.8, '#7a5808')),
  // 플래티넘 — 육각 보석
  '💠': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 5 L41 15 v18 L24 43 L7 33 V15 z" fill="#5fbdb4" stroke="${FS}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 5 L41 15 v18 L24 43 z" fill="#3f9d95"/>
    <path d="M24 12 L34 18 v12 L24 36 L14 30 V18 z" fill="#a8f0ea" stroke="${FS}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M24 12 L34 18 v12 L24 36 z" fill="#7fd8d0"/>
  </svg>`,
  // 다이아
  '💎': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 9 h22 l9 11 -20 22 -20 -22 z" fill="#8ecbf0" stroke="${FS}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M4 20 h40 l-20 22 z" fill="#5aa8dd"/>
    <path d="M13 9 h22 l-5 11 h-12 z" fill="#cfeaff"/>
    <path d="M4 20 l9 -11 5 11 z" fill="#b4dcf7"/>
    <path d="M44 20 l-9 -11 -5 11 z" fill="#b4dcf7"/>
    <path d="M18 20 h12 l-6 22 z" fill="#7bbde8"/>
    <path d="M4 20 h40 M18 20 l6 22 6 -22" stroke="#eaf7ff" stroke-width="1.4" fill="none" opacity=".9"/>
  </svg>`,
  // 마스터 — 왕관
  '👑': `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 33 L4 12 l11.5 8 L24 7 l8.5 13 L44 12 l-3 21 z"
          fill="#c79bf0" stroke="${FS}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M7 33 L4 12 l11.5 8 L24 7 v26 z" fill="#e0c2ff"/>
    <rect x="7" y="33" width="34" height="7" rx="2.4" fill="#8e4fd0" stroke="${FS}" stroke-width="1.9"/>
    <circle cx="24" cy="27" r="3.2" fill="#ffd45e" stroke="${FS}" stroke-width="1.5"/>
    <circle cx="14" cy="28" r="2.2" fill="#7fe8ff" stroke="${FS}" stroke-width="1.3"/>
    <circle cx="34" cy="28" r="2.2" fill="#ff8ac0" stroke="${FS}" stroke-width="1.3"/>
    <circle cx="4" cy="12" r="2.6" fill="#e9c7ff" stroke="${FS}" stroke-width="1.4"/>
    <circle cx="44" cy="12" r="2.6" fill="#e9c7ff" stroke="${FS}" stroke-width="1.4"/>
    <circle cx="24" cy="7" r="2.8" fill="#ffd45e" stroke="${FS}" stroke-width="1.5"/>
  </svg>`,
};

// 이모지 → SVG (없으면 원래 이모지 그대로)
const emoteArt = e => EMOTE_ART[e] || null;
const rankArt  = e => RANK_ART[e]  || null;

if (typeof module !== 'undefined') module.exports = { AI_AVATAR, EMOTE_ART, RANK_ART };

// ══════════════════════════════════════════════════════════
//  상점·칭호·UI 아이콘
// ══════════════════════════════════════════════════════════
// 반복 렌더되는 자리(상점 목록·인벤토리·랭킹)에 들어가므로 그라디언트를 쓰지 않는다.
// <defs> id 가 중복되면 url(#id) 참조가 깨져 면이 비어 보인다(불꽃에서 겪음).
const D = '#2a0a10';   // 공통 윤곽

// 카드 모양 헬퍼 — 카드백/카드앞면 상품에 재사용
const cardShape = (fill, inner = '') =>
  `<rect x="12" y="7" width="24" height="34" rx="4" fill="${fill}" stroke="${D}" stroke-width="2"/>${inner}`;

const ICON_ART = {
  // ── 상점: 카드백 ──
  '🌙': `<svg viewBox="0 0 48 48">${cardShape('#1b2a63',
    `<path d="M28.5 16 a7.5 7.5 0 1 0 5.5 12 A9 9 0 0 1 28.5 16 z" fill="#d3e0ff"/>
     <circle cx="19" cy="15" r="1.2" fill="#fff"/><circle cx="17" cy="30" r="1" fill="#fff"/>
     <circle cx="30" cy="35" r="1.1" fill="#fff"/>`)}</svg>`,
  '🏆': `<svg viewBox="0 0 48 48">${cardShape('#c99a2a',
    `<path d="M18 14 h12 v6 a6 6 0 0 1 -12 0 z" fill="#fff4c8" stroke="${D}" stroke-width="1.4"/>
     <path d="M18 15 h-3 a3 3 0 0 0 3 4 M30 15 h3 a3 3 0 0 1 -3 4" stroke="${D}" stroke-width="1.4" fill="none"/>
     <path d="M23 26 h2 v4 h-2 z M20 30 h8 v2.4 h-8 z" fill="#fff4c8" stroke="${D}" stroke-width="1.2"/>`)}</svg>`,
  '🎏': `<svg viewBox="0 0 48 48">${cardShape('#f4efe2',
    `<path d="M12 11 h24 v5 h-24 z" fill="#c8102e"/><path d="M12 16 h24 v5 h-24 z" fill="#f0a020"/>
     <path d="M12 26 h24 v5 h-24 z" fill="#1f6fb2"/><path d="M12 31 h24 v5 h-24 z" fill="#2a2118"/>`)}</svg>`,
  '❤️‍🔥': `<svg viewBox="0 0 48 48">${cardShape('#a51a38',
    `<path d="M24 34 c-6-4.5-9-7.5-9-11.5 0-2.8 2.1-4.8 4.6-4.8 1.7 0 3.3 .9 4.4 2.4
              1.1-1.5 2.7-2.4 4.4-2.4 2.5 0 4.6 2 4.6 4.8 0 4-3 7-9 11.5 z"
           fill="#ff7f96" stroke="${D}" stroke-width="1.4"/>`)}</svg>`,
  '🌌': `<svg viewBox="0 0 48 48">${cardShape('#2b0f52',
    `<ellipse cx="26" cy="20" rx="9" ry="6" fill="#7a4ad0" opacity=".7"/>
     <circle cx="17" cy="14" r="1.3" fill="#fff"/><circle cx="31" cy="13" r="1" fill="#ffe9a8"/>
     <circle cx="19" cy="31" r="1.4" fill="#bcd0ff"/><circle cx="30" cy="34" r="1.1" fill="#fff"/>
     <circle cx="24" cy="24" r="1" fill="#fff"/>`)}</svg>`,
  // ── 상점: 카드 앞면 ──
  '🃏': `<svg viewBox="0 0 48 48">${cardShape('#14202c',
    `<text x="24" y="30" font-size="15" font-weight="800" text-anchor="middle" fill="#6ffcff">6</text>`)}</svg>`,
  '♠️': `<svg viewBox="0 0 48 48">${cardShape('#f0e8d8',
    `<path d="M24 14 c-4 4-7 6.5-7 9.6 0 2 1.6 3.4 3.4 3.4 1.2 0 2.2-.5 2.8-1.3 l-1 5.3 h3.6 l-1-5.3
              c.6 .8 1.6 1.3 2.8 1.3 1.8 0 3.4-1.4 3.4-3.4 0-3.1-3-5.6-7-9.6 z" fill="#1c1c22"/>`)}</svg>`,
  // ── 상점: 염색·티켓 ──
  '🎨': `<svg viewBox="0 0 48 48">
    <path d="M24 6 C13 6 5 14 5 24 c0 9 7 14 14 14 3 0 4-1.6 4-3.4 0-1.6-1.2-2.4-1.2-4 0-1.7 1.4-3 3.2-3 H29
             c8 0 14-5 14-12 C43 11 34 6 24 6 z" fill="#f0e2c8" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="14" cy="20" r="3" fill="#e0544a"/><circle cx="22" cy="14" r="3" fill="#f0b32a"/>
    <circle cx="31" cy="16" r="3" fill="#5fbdd8"/><circle cx="35" cy="25" r="3" fill="#8f6fc0"/>
  </svg>`,
  '✏️': `<svg viewBox="0 0 48 48">
    <path d="M9 39 l2-8 22-22 6 6 -22 22 z" fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M33 9 l3-3 6 6 -3 3 z" fill="#e06a5a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9 39 l2-8 4 4 z" fill="#3a2606" stroke="${D}" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`,
  '💎': `<svg viewBox="0 0 48 48">
    <path d="M13 10 h22 l9 10 -20 20 -20 -20 z" fill="#8ecbf0" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M4 20 h40 l-20 20 z" fill="#5aa8dd"/><path d="M13 10 h22 l-5 10 h-12 z" fill="#cfeaff"/>
  </svg>`,
  // ── 상점: 이모트 팩 ──
  '🎉': `<svg viewBox="0 0 48 48">
    <path d="M7 41 L18 16 l14 14 z" fill="#f0a83c" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M7 41 L15 23 l10 10 z" fill="#ffd45e"/>
    <circle cx="34" cy="10" r="2.4" fill="#e06a5a"/><circle cx="41" cy="18" r="2" fill="#5fd0c0"/>
    <circle cx="28" cy="7" r="1.8" fill="#8f6fc0"/><circle cx="40" cy="8" r="1.8" fill="#ffd45e"/>
  </svg>`,
  '🐾': `<svg viewBox="0 0 48 48">
    <ellipse cx="24" cy="32" rx="9" ry="7.5" fill="#f0a83c" stroke="${D}" stroke-width="2"/>
    <ellipse cx="13" cy="21" rx="4" ry="5" fill="#f0a83c" stroke="${D}" stroke-width="1.8"/>
    <ellipse cx="20" cy="14" rx="4" ry="5" fill="#f0a83c" stroke="${D}" stroke-width="1.8"/>
    <ellipse cx="28" cy="14" rx="4" ry="5" fill="#f0a83c" stroke="${D}" stroke-width="1.8"/>
    <ellipse cx="35" cy="21" rx="4" ry="5" fill="#f0a83c" stroke="${D}" stroke-width="1.8"/>
  </svg>`,
  '⚔️': `<svg viewBox="0 0 48 48">
    <path d="M10 6 l6 0 20 26 -3 4 z" fill="#c9c2bd" stroke="${D}" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="M38 6 l-6 0 -20 26 3 4 z" fill="#e6e0da" stroke="${D}" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="M8 34 l6 6 M40 34 l-6 6" stroke="#7a4e10" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="24" cy="30" r="2.6" fill="#e0b84a" stroke="${D}" stroke-width="1.4"/>
  </svg>`,
  // ── 상점: 명패 ──
  '🪵': `<svg viewBox="0 0 48 48">
    <rect x="5" y="15" width="38" height="18" rx="5" fill="#a5763f" stroke="${D}" stroke-width="2"/>
    <ellipse cx="12" cy="24" rx="4.5" ry="8" fill="#c99a5f" stroke="${D}" stroke-width="1.6"/>
    <ellipse cx="12" cy="24" rx="2" ry="4" fill="#8a5a2a"/>
    <path d="M22 19 h16 M22 24 h14 M22 29 h16" stroke="#7a4e10" stroke-width="1.6" opacity=".7"/>
  </svg>`,
  '💜': `<svg viewBox="0 0 48 48">
    <path d="M24 40 C11 30 5 24 5 17.5 5 12 9.4 8 14.6 8 c3.6 0 6.9 2 9.4 5.2 C26.5 10 29.8 8 33.4 8
             38.6 8 43 12 43 17.5 43 24 37 30 24 40 z" fill="#b98fe0" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M15 15 a7 7 0 0 1 5-3" stroke="#e9d5ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`,
  '🏅': `<svg viewBox="0 0 48 48">
    <path d="M15 4 h6 l5 14 h-6 z" fill="#5fbdd8" stroke="${D}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M33 4 h-6 l-5 14 h6 z" fill="#e8544a" stroke="${D}" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="24" cy="31" r="12" fill="#f7d15a" stroke="${D}" stroke-width="2"/>
    <circle cx="24" cy="31" r="8.5" fill="none" stroke="#a8790c" stroke-width="1.8"/>
    <circle cx="24" cy="31" r="4" fill="#a8790c"/>
  </svg>`,
  '🍀': `<svg viewBox="0 0 48 48">
    <path d="M24 24 c-3-7-10-8-12-4 -1.8 3.6 2 8 12 4 z" fill="#5fb04a" stroke="${D}" stroke-width="1.7"/>
    <path d="M24 24 c3-7 10-8 12-4 1.8 3.6-2 8-12 4 z" fill="#6fc45a" stroke="${D}" stroke-width="1.7"/>
    <path d="M24 24 c-7 3-8 10-4 12 3.6 1.8 8-2 4-12 z" fill="#6fc45a" stroke="${D}" stroke-width="1.7"/>
    <path d="M24 24 c7 3 8 10 4 12 -3.6 1.8-8-2-4-12 z" fill="#5fb04a" stroke="${D}" stroke-width="1.7"/>
    <path d="M25 26 c2 6 3 10 2 15" stroke="#3a7a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`,
  '🎖️': `<svg viewBox="0 0 48 48">
    <path d="M13 5 h22 v13 l-11 5 -11 -5 z" fill="#e8544a" stroke="${D}" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="M18 5 h5 v13 h-5 z" fill="#f0e8d8"/><path d="M25 5 h5 v13 h-5 z" fill="#1f6fb2"/>
    <circle cx="24" cy="32" r="10.5" fill="#f7d15a" stroke="${D}" stroke-width="2"/>
    <path d="M24 26 l1.9 3.9 4.3 .6 -3.1 3 .7 4.3 -3.8-2 -3.8 2 .7-4.3 -3.1-3 4.3-.6 z" fill="#a8790c"/>
  </svg>`,
  // ── 상점: 테이블 ──
  '🔵': `<svg viewBox="0 0 48 48"><rect x="5" y="12" width="38" height="24" rx="9" fill="#1a3a5a" stroke="${D}" stroke-width="2"/><ellipse cx="24" cy="24" rx="13" ry="7" fill="#255076"/></svg>`,
  '🟣': `<svg viewBox="0 0 48 48"><rect x="5" y="12" width="38" height="24" rx="9" fill="#3d2350" stroke="${D}" stroke-width="2"/><ellipse cx="24" cy="24" rx="13" ry="7" fill="#54326e"/></svg>`,
  '🟡': `<svg viewBox="0 0 48 48"><rect x="5" y="12" width="38" height="24" rx="9" fill="#5a4410" stroke="${D}" stroke-width="2"/><ellipse cx="24" cy="24" rx="13" ry="7" fill="#7d5f16"/></svg>`,
  '🟢': `<svg viewBox="0 0 48 48"><rect x="5" y="12" width="38" height="24" rx="9" fill="#14532d" stroke="${D}" stroke-width="2"/><ellipse cx="24" cy="24" rx="13" ry="7" fill="#1c6e3d"/></svg>`,

  // ── 칭호 ──
  '🏛️': `<svg viewBox="0 0 48 48">
    <path d="M24 5 L44 15 H4 z" fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="8" y="17" width="5" height="19" fill="#f0e2c8" stroke="${D}" stroke-width="1.6"/>
    <rect x="17" y="17" width="5" height="19" fill="#f0e2c8" stroke="${D}" stroke-width="1.6"/>
    <rect x="26" y="17" width="5" height="19" fill="#f0e2c8" stroke="${D}" stroke-width="1.6"/>
    <rect x="35" y="17" width="5" height="19" fill="#f0e2c8" stroke="${D}" stroke-width="1.6"/>
    <rect x="4" y="36" width="40" height="6" rx="2" fill="#c99a3a" stroke="${D}" stroke-width="2"/>
  </svg>`,
  '🎓': `<svg viewBox="0 0 48 48">
    <path d="M24 9 L45 18 L24 27 L3 18 z" fill="#3a2e50" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 22 v9 c0 3.4 5.4 6 12 6 s12-2.6 12-6 v-9" fill="#4a3c68" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M42 19.5 v10" stroke="${D}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="42" cy="32" r="3" fill="#ffd45e" stroke="${D}" stroke-width="1.6"/>
  </svg>`,
  '🎯': `<svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="18" fill="#f0e2c8" stroke="${D}" stroke-width="2"/>
    <circle cx="24" cy="24" r="12.5" fill="#e0544a" stroke="${D}" stroke-width="1.6"/>
    <circle cx="24" cy="24" r="7" fill="#f0e2c8" stroke="${D}" stroke-width="1.4"/>
    <circle cx="24" cy="24" r="3" fill="#e0544a"/>
  </svg>`,
  '🌐': `<svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="18" fill="#5fa8dd" stroke="${D}" stroke-width="2"/>
    <ellipse cx="24" cy="24" rx="8" ry="18" fill="none" stroke="#e8f4ff" stroke-width="1.8"/>
    <path d="M7 18 h34 M7 30 h34 M24 6 v36" stroke="#e8f4ff" stroke-width="1.8"/>
  </svg>`,
  '📅': `<svg viewBox="0 0 48 48">
    <rect x="6" y="10" width="36" height="32" rx="5" fill="#f0e2c8" stroke="${D}" stroke-width="2"/>
    <path d="M6 19 h36" stroke="${D}" stroke-width="2"/>
    <rect x="6" y="10" width="36" height="9" rx="5" fill="#e0544a" stroke="${D}" stroke-width="2"/>
    <path d="M15 6 v8 M33 6 v8" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
    <rect x="12" y="24" width="6" height="5" rx="1.4" fill="#c8a86a"/>
    <rect x="21" y="24" width="6" height="5" rx="1.4" fill="#c8a86a"/>
    <rect x="30" y="24" width="6" height="5" rx="1.4" fill="#5fb04a"/>
    <rect x="12" y="32" width="6" height="5" rx="1.4" fill="#c8a86a"/>
  </svg>`,
  '💰': `<svg viewBox="0 0 48 48">
    <path d="M18 12 l-3-5 h18 l-3 5" fill="#7a4e10" stroke="${D}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M18.5 12 h11 c6.5 4 10 10.5 10 17 0 7-5.5 12-15.5 12 S8.5 36 8.5 29 c0-6.5 3.5-13 10-17 z"
          fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 21 v16 M20 25 h8 M20 31 h8" stroke="#7a4e10" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`,
  '🛡️': `<svg viewBox="0 0 48 48">
    <path d="M24 4 L41 10 v13 c0 11-8 18-17 21 -9-3-17-10-17-21 V10 z"
          fill="#c8a86a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 10 L36 14 v9 c0 8-5.6 13-12 15.4 z" fill="#a5854a"/>
    <path d="M24 17 l2.6 5.4 5.9 .8 -4.3 4.1 1 5.9 -5.2-2.8 -5.2 2.8 1-5.9 -4.3-4.1 5.9-.8 z" fill="#f7d98a"/>
  </svg>`,

  // ── UI 라벨 ──
  '🎒': `<svg viewBox="0 0 48 48">
    <path d="M17 12 a7 7 0 0 1 14 0" stroke="${D}" stroke-width="2.4" fill="none"/>
    <rect x="8" y="12" width="32" height="30" rx="8" fill="#5a8ad0" stroke="${D}" stroke-width="2"/>
    <rect x="14" y="24" width="20" height="12" rx="4" fill="#e8d8b0" stroke="${D}" stroke-width="1.8"/>
    <path d="M14 30 h20" stroke="${D}" stroke-width="1.6"/>
  </svg>`,
  '🏷️': `<svg viewBox="0 0 48 48">
    <path d="M25 5 H41 a2 2 0 0 1 2 2 V23 L23 43 L5 25 z" fill="#e0b84a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="34" cy="14" r="3.6" fill="#fff6e0" stroke="${D}" stroke-width="1.8"/>
  </svg>`,
  '📜': `<svg viewBox="0 0 48 48">
    <path d="M11 7 h26 v30 a5 5 0 0 0 5 5 H16 a5 5 0 0 1 -5 -5 z" fill="#f0e2c8" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 12 a5 5 0 0 1 5 -5 v30 H6 z" fill="#d8c49a" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17 15 h14 M17 21 h14 M17 27 h9" stroke="#8a6a3a" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  '🛒': `<svg viewBox="0 0 48 48">
    <path d="M4 7 h6 l6 22 h20" stroke="${D}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 12 h30 l-4 14 H16 z" fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="19" cy="38" r="3.4" fill="#c99a3a" stroke="${D}" stroke-width="1.8"/>
    <circle cx="34" cy="38" r="3.4" fill="#c99a3a" stroke="${D}" stroke-width="1.8"/>
  </svg>`,
  '👥': `<svg viewBox="0 0 48 48">
    <circle cx="32" cy="17" r="6.5" fill="#a5854a" stroke="${D}" stroke-width="1.9"/>
    <path d="M22 40 c0-6 4.4-10 10-10 s10 4 10 10 z" fill="#a5854a" stroke="${D}" stroke-width="1.9" stroke-linejoin="round"/>
    <circle cx="17" cy="15" r="7.5" fill="#f7d98a" stroke="${D}" stroke-width="2"/>
    <path d="M5 40 c0-7 5.2-11.5 12-11.5 s12 4.5 12 11.5 z" fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,
  '👤': `<svg viewBox="0 0 48 48">
    <circle cx="24" cy="16" r="8.5" fill="#f7d98a" stroke="${D}" stroke-width="2"/>
    <path d="M8 42 c0-8.4 7.2-14 16-14 s16 5.6 16 14 z" fill="#f7d98a" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,
  '🎪': `<svg viewBox="0 0 48 48">
    <path d="M24 4 v6" stroke="${D}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="24" cy="3.5" r="2.2" fill="#ffd45e" stroke="${D}" stroke-width="1.3"/>
    <path d="M24 9 C34 14 42 22 42 30 H6 C6 22 14 14 24 9 z" fill="#f0e2c8" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24 9 C20 16 18 23 18 30 H6 C6 22 14 14 24 9 z" fill="#e0544a"/>
    <path d="M24 9 C28 16 30 23 30 30 h12 C42 22 34 14 24 9 z" fill="#e0544a" opacity=".55"/>
    <rect x="6" y="30" width="36" height="12" rx="3" fill="#c8a86a" stroke="${D}" stroke-width="2"/>
    <path d="M19 42 V33 a5 5 0 0 1 10 0 v9 z" fill="#2a1a12" stroke="${D}" stroke-width="1.6"/>
  </svg>`,
  '💬': `<svg viewBox="0 0 48 48">
    <path d="M6 11 a4 4 0 0 1 4 -4 h28 a4 4 0 0 1 4 4 v18 a4 4 0 0 1 -4 4 H20 l-10 8 v-8 a4 4 0 0 1 -4 -4 z"
          fill="#f0e2c8" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="16" cy="20" r="2.6" fill="#8a6a3a"/><circle cx="24" cy="20" r="2.6" fill="#8a6a3a"/>
    <circle cx="32" cy="20" r="2.6" fill="#8a6a3a"/>
  </svg>`,
  '🚪': `<svg viewBox="0 0 48 48">
    <rect x="9" y="5" width="24" height="38" rx="3" fill="#a5763f" stroke="${D}" stroke-width="2"/>
    <rect x="13" y="9" width="16" height="30" rx="2" fill="#8a5a2a"/>
    <circle cx="28" cy="25" r="2.2" fill="#f7d98a" stroke="${D}" stroke-width="1.3"/>
    <path d="M37 24 h8 M41 19 l5 5 -5 5" stroke="#5fd0c0" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  // ── 카드 표식 · 이모트 버튼 ──
  '⚔️': `<svg viewBox="0 0 48 48">
    <path d="M10 6 L20 16 L16 20 L6 10 z" fill="#c9ccd4" stroke="${D}" stroke-width="2"/>
    <path d="M38 6 L28 16 L32 20 L42 10 z" fill="#c9ccd4" stroke="${D}" stroke-width="2"/>
    <path d="M16 20 L34 38 M32 20 L14 38" stroke="#c9ccd4" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M16 20 L34 38 M32 20 L14 38" stroke="${D}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="27" r="3" fill="#c99a3a" stroke="${D}" stroke-width="1.8"/></svg>`,
  '😀': `<svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="19" fill="#ffd94a" stroke="${D}" stroke-width="2.4"/>
    <circle cx="17" cy="20" r="2.6" fill="${D}"/><circle cx="31" cy="20" r="2.6" fill="${D}"/>
    <path d="M14 28 a10 10 0 0 0 20 0 z" fill="#7a2a20" stroke="${D}" stroke-width="2" stroke-linejoin="round"/></svg>`,

  // ── UI 공용 (버튼·안내) ──
  '🔥': `<svg viewBox="0 0 48 48">
    <path d="M24 4 c6 8 2 11 6 14 c3-2 3-5 3-5 c5 6 7 11 7 16 a16 16 0 0 1-32 0 c0-8 6-13 9-19 c2 4 5 5 5 5 c1-5 2-8 2-11 z" fill="#ff8c2a" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 22 c3 4 5 7 5 11 a5 5 0 0 1-10 0 c0-4 3-7 5-11 z" fill="#ffe14a"/></svg>`,
  '⬆️': `<svg viewBox="0 0 48 48">
    <path d="M24 5 L41 24 H31 v18 H17 V24 H7 z" fill="#8fe0a0" stroke="${D}" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  '📲': `<svg viewBox="0 0 48 48">
    <rect x="13" y="6" width="22" height="36" rx="4" fill="#f7d98a" stroke="${D}" stroke-width="2.2"/>
    <rect x="16.5" y="10" width="15" height="24" rx="1.5" fill="#2a1a30"/>
    <circle cx="24" cy="38" r="1.8" fill="${D}"/>
    <path d="M24 15 v11 M19.5 21.5 L24 26 l4.5-4.5" stroke="#8fe0a0" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  '⚡': `<svg viewBox="0 0 48 48">
    <path d="M27 4 L12 27 h9 l-4 17 15-23 h-9 z" fill="#ffd94a" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  '🔍': `<svg viewBox="0 0 48 48">
    <circle cx="21" cy="20" r="12" fill="#cfe6ff" stroke="${D}" stroke-width="2.6"/>
    <circle cx="21" cy="20" r="7.5" fill="#eaf5ff"/>
    <path d="M30 29 L41 40" stroke="${D}" stroke-width="4.4" stroke-linecap="round"/></svg>`,
  '👁': `<svg viewBox="0 0 48 48">
    <path d="M4 24 C12 13 36 13 44 24 C36 35 12 35 4 24 z" fill="#f4efe2" stroke="${D}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="7.5" fill="#3c7fc0" stroke="${D}" stroke-width="2"/>
    <circle cx="24" cy="24" r="3.2" fill="${D}"/><circle cx="21.5" cy="21.5" r="1.4" fill="#fff"/></svg>`,
  '🙈': `<svg viewBox="0 0 48 48">
    <path d="M4 24 C12 13 36 13 44 24 C36 35 12 35 4 24 z" fill="#f4efe2" stroke="${D}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M4 24 C12 13 36 13 44 24" fill="#8a7a70"/>
    <path d="M9 15 L39 33" stroke="${D}" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  '🔒': `<svg viewBox="0 0 48 48">
    <path d="M16 21 v-5 a8 8 0 0 1 16 0 v5" stroke="${D}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="11" y="21" width="26" height="19" rx="3.5" fill="#f7d98a" stroke="${D}" stroke-width="2.2"/>
    <circle cx="24" cy="29" r="3" fill="${D}"/><path d="M24 31 v4" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  '💡': `<svg viewBox="0 0 48 48">
    <path d="M24 6 a13 13 0 0 1 8 23 v4 H16 v-4 a13 13 0 0 1 8-23 z" fill="#ffe98a" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="18" y="34" width="12" height="4" rx="1.4" fill="#c9a24a" stroke="${D}" stroke-width="1.8"/>
    <path d="M20 40 h8" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  '🔄': `<svg viewBox="0 0 48 48">
    <path d="M40 24 a16 16 0 1 1-5-11.6" stroke="${D}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M36 4 v10 h-10" stroke="${D}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  '🔔': `<svg viewBox="0 0 48 48">
    <path d="M24 7 a10 10 0 0 1 10 10 v8 l4 6 H10 l4-6 v-8 a10 10 0 0 1 10-10 z" fill="#f7d98a" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M20 34 a4 4 0 0 0 8 0" stroke="${D}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="6" r="2.4" fill="${D}"/></svg>`,
  '⚠': `<svg viewBox="0 0 48 48">
    <path d="M24 6 L44 40 H4 z" fill="#ffcf5a" stroke="${D}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M24 17 v11" stroke="${D}" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="24" cy="34" r="2.2" fill="${D}"/></svg>`,
  '⏱': `<svg viewBox="0 0 48 48">
    <circle cx="24" cy="27" r="15" fill="#eaf0f6" stroke="${D}" stroke-width="2.6"/>
    <path d="M19 6 h10" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 9 v3" stroke="${D}" stroke-width="3"/>
    <path d="M24 18 v9 h7" stroke="${D}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  '🎟': `<svg viewBox="0 0 48 48">
    <path d="M5 14 h38 v7 a4 4 0 0 0 0 8 v7 H5 v-7 a4 4 0 0 0 0-8 z" fill="#f7d98a" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M19 16 v16" stroke="${D}" stroke-width="2" stroke-dasharray="3 3"/>
    <circle cx="30" cy="24" r="4.5" fill="#c8102e" stroke="${D}" stroke-width="1.8"/></svg>`,
  '🎁': `<svg viewBox="0 0 48 48">
    <rect x="5" y="17" width="38" height="9" rx="2.4" fill="#e0544a" stroke="${D}" stroke-width="2"/>
    <rect x="8" y="26" width="32" height="16" rx="3" fill="#c8443a" stroke="${D}" stroke-width="2"/>
    <rect x="20" y="17" width="8" height="25" fill="#ffd45e" stroke="${D}" stroke-width="1.7"/>
    <path d="M24 17 c-6 0-10-3-10-6 0-2.4 2-4 4.4-4 3.6 0 5.6 4 5.6 10 z" fill="#ffd45e" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M24 17 c6 0 10-3 10-6 0-2.4-2-4-4.4-4 -3.6 0-5.6 4-5.6 10 z" fill="#ffd45e" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,
};

// 이모지 → SVG (이모트·랭크·일반 아이콘 순서로 찾는다. 없으면 null)
const iconArt = e => ICON_ART[e] || RANK_ART[e] || EMOTE_ART[e] || null;
