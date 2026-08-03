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
