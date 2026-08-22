// 아이템전 아이콘 13종 — 44px 슬롯에서도 실루엣이 읽히도록 면으로 채운 엠블럼 스타일.
// 어두운 윤곽(#2a0a10)으로 테두리를 잡고 밝은 면색으로 채워 보라색 슬롯 위에서 또렷하게 보이게 한다.
// 그라디언트 id는 아이템 이름을 붙여 유니크하게 — 12개가 한 화면에 동시에 들어가므로 충돌하면 색이 섞인다.
const ITEM_ICONS = {

  // ── 일반 (골드 위주) ───────────────────────────────────
  magnify: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="iiMagLens" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bfe9ff"/><stop offset="1" stop-color="#6aa8cc"/></linearGradient></defs>
    <path d="M25 27 L38 40" stroke="#7a4e10" stroke-width="7" stroke-linecap="round"/>
    <path d="M25 27 L38 40" stroke="#2a0a10" stroke-width="9" stroke-linecap="round" opacity=".35"/>
    <path d="M25 27 L38 40" stroke="#e0b84a" stroke-width="5" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="12.5" fill="url(#iiMagLens)" stroke="#2a0a10" stroke-width="1.8"/>
    <circle cx="20" cy="20" r="12.5" fill="none" stroke="#f7d98a" stroke-width="3.2"/>
    <circle cx="20" cy="20" r="12.5" fill="none" stroke="#2a0a10" stroke-width="1.4"/>
    <path d="M13 17 A9 9 0 0 1 20 12" stroke="#fff6e0" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".9"/>
  </svg>`,

  // 눈금자 — 상대에게 얼마나 쓸모 있는지 '재는' 물건이다.
  scan: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-20 24 24)">
      <rect x="6" y="18" width="36" height="13" rx="2.5" fill="#fff6e0" stroke="#2a0a10" stroke-width="2"/>
      <path d="M12 18 v6 M18 18 v4 M24 18 v6 M30 18 v4 M36 18 v6" stroke="#2a0a10" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M6 24.5 h36" stroke="#e0b84a" stroke-width="1.4"/>
      <circle cx="24" cy="28" r="1.6" fill="#e06a5a"/>
    </g>
  </svg>`,

  swap: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-14 17 26)">
      <rect x="7" y="14" width="17" height="24" rx="3" fill="#c99a3a" stroke="#2a0a10" stroke-width="1.8"/>
      <rect x="10" y="17.5" width="11" height="17" rx="1.6" fill="#7a4e10" opacity=".45"/>
    </g>
    <g transform="rotate(14 31 26)">
      <rect x="24" y="14" width="17" height="24" rx="3" fill="#f7d98a" stroke="#2a0a10" stroke-width="1.8"/>
      <rect x="27" y="17.5" width="11" height="17" rx="1.6" fill="#c99a3a" opacity=".5"/>
    </g>
    <path d="M12 9 h18" stroke="#2a0a10" stroke-width="5" stroke-linecap="round"/>
    <path d="M12 9 h18" stroke="#5fd0c0" stroke-width="3" stroke-linecap="round"/>
    <path d="M27 5.5 L31.5 9 L27 12.5 z" fill="#5fd0c0" stroke="#2a0a10" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M36 43 h-18" stroke="#2a0a10" stroke-width="5" stroke-linecap="round"/>
    <path d="M36 43 h-18" stroke="#5fd0c0" stroke-width="3" stroke-linecap="round"/>
    <path d="M21 39.5 L16.5 43 L21 46.5 z" fill="#5fd0c0" stroke="#2a0a10" stroke-width="1.3" stroke-linejoin="round"/>
  </svg>`,

  // ── 희귀 (보라·청록 포인트) ────────────────────────────
  smoke: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="iiSmokeCan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9c2bd"/><stop offset="1" stop-color="#7d7671"/></linearGradient></defs>
    <ellipse cx="17" cy="13" rx="9.5" ry="6" fill="#b98fe0" opacity=".55"/>
    <ellipse cx="29" cy="9.5" rx="7.5" ry="5" fill="#8f6fc0" opacity=".6"/>
    <ellipse cx="23.5" cy="17.5" rx="12" ry="6.5" fill="#b98fe0" opacity=".4"/>
    <rect x="17" y="24" width="14" height="18" rx="3.4" fill="url(#iiSmokeCan)" stroke="#2a0a10" stroke-width="1.8"/>
    <rect x="19.6" y="27.5" width="8.8" height="3.6" rx="1.2" fill="#e06a5a"/>
    <rect x="20.4" y="20.5" width="7.2" height="4" rx="1.4" fill="#7d7671" stroke="#2a0a10" stroke-width="1.5"/>
    <path d="M24 20.5 v-3.2" stroke="#2a0a10" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`,

  flip: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 24 A14 14 0 0 1 34 14.2" fill="none" stroke="#2a0a10" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M10 24 A14 14 0 0 1 34 14.2" fill="none" stroke="#b98fe0" stroke-width="5" stroke-linecap="round"/>
    <path d="M38 24 A14 14 0 0 1 14 33.8" fill="none" stroke="#2a0a10" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M38 24 A14 14 0 0 1 14 33.8" fill="none" stroke="#5fd0c0" stroke-width="5" stroke-linecap="round"/>
    <path d="M31 6.5 L39.5 14 L30.5 20 z" fill="#b98fe0" stroke="#2a0a10" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M17 41.5 L8.5 34 L17.5 28 z" fill="#5fd0c0" stroke="#2a0a10" stroke-width="1.7" stroke-linejoin="round"/>
  </svg>`,

  // 교환권 — 두 장이 자리를 맞바꾼다. 화살표가 서로 반대로 돌아 '맞바꿈' 이 읽힌다.
  trade: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="13" width="15" height="21" rx="3" fill="#fff6e0" stroke="#2a0a10" stroke-width="2" transform="rotate(-9 12 23)"/>
    <rect x="28" y="13" width="15" height="21" rx="3" fill="#e0b84a" stroke="#2a0a10" stroke-width="2" transform="rotate(9 36 23)"/>
    <path d="M20 18 h8 l-3-3 M28 30 h-8 l3 3" fill="none" stroke="#2a0a10" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 18 h8 l-3-3 M28 30 h-8 l3 3" fill="none" stroke="#5cd69c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 폭탄 — 심지에 불이 붙어 있다. 먹는 쪽이 손해라는 걸 그림만으로 알아야 한다.
  bomb: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 13 l4-5 M34 8 l5 1 M34 8 l1-5" stroke="#ffd94a" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M28 15 q4-7 9-6" fill="none" stroke="#2a0a10" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M28 15 q4-7 9-6" fill="none" stroke="#c8a86a" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="22" cy="29" r="13" fill="#3a2430" stroke="#2a0a10" stroke-width="2"/>
    <circle cx="17.5" cy="24.5" r="3.6" fill="#fff6e0" opacity=".55"/>
    <rect x="25" y="12" width="7" height="5" rx="1.5" fill="#2a0a10" transform="rotate(30 28 14)"/>
  </svg>`,

  // 부적 — 붉은 종이에 먹으로 친 부적. 막는 물건이라 가운데를 비우지 않고 꽉 채웠다.
  ward: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="iiWardPaper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6d9c0"/><stop offset="1" stop-color="#e0b08c"/></linearGradient>
      <linearGradient id="iiWardSeal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e8556a"/><stop offset="1" stop-color="#b8283a"/></linearGradient></defs>
    <path d="M14 5 h20 a2 2 0 0 1 2 2 v30 l-12 6 -12-6 V7 a2 2 0 0 1 2-2 z"
          fill="url(#iiWardPaper)" stroke="#2a0a10" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="M14 5 h20 a2 2 0 0 1 2 2 v4 H12 V7 a2 2 0 0 1 2-2 z" fill="url(#iiWardSeal)" stroke="#2a0a10" stroke-width="1.6"/>
    <path d="M24 14 v20 M17 20 h14 M19 27 h10" stroke="#2a0a10" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M24 14 v20 M17 20 h14 M19 27 h10" stroke="#8d1f1a" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="24" cy="37.5" r="3.2" fill="url(#iiWardSeal)" stroke="#2a0a10" stroke-width="1.5"/>
  </svg>`,

  redo: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="iiRedoHorn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7d98a"/><stop offset="1" stop-color="#c99a3a"/></linearGradient></defs>
    <path d="M9 19 h7 l14-9 v25 l-14-9 H9 z" fill="url(#iiRedoHorn)" stroke="#2a0a10" stroke-width="1.9" stroke-linejoin="round"/>
    <rect x="6" y="18" width="6" height="12" rx="2.2" fill="#7a4e10" stroke="#2a0a10" stroke-width="1.6"/>
    <path d="M34 17 a9 9 0 0 1 0 14" fill="none" stroke="#2a0a10" stroke-width="5" stroke-linecap="round"/>
    <path d="M34 17 a9 9 0 0 1 0 14" fill="none" stroke="#5fd0c0" stroke-width="3" stroke-linecap="round"/>
    <path d="M38.5 34 a13 13 0 0 0 0-20" fill="none" stroke="#2a0a10" stroke-width="4.6" stroke-linecap="round" opacity=".85"/>
    <path d="M38.5 34 a13 13 0 0 0 0-20" fill="none" stroke="#b98fe0" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`,

  // ── 전설 (골드 + 붉은 포인트로 화려하게) ────────────────
  steal: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(12 33 31)">
      <rect x="27" y="22" width="14" height="19" rx="2.6" fill="#f7d98a" stroke="#2a0a10" stroke-width="1.8"/>
      <rect x="29.5" y="25" width="9" height="13" rx="1.4" fill="#e06a5a" opacity=".65"/>
    </g>
    <path d="M9 40 c-1.5-8 1-16 7-20 4.5-3 10-2.5 13 1"
          fill="none" stroke="#2a0a10" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 40 c-1.5-8 1-16 7-20 4.5-3 10-2.5 13 1"
          fill="none" stroke="#4a3550" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 21 l-2.5-8 7 4 z" fill="#4a3550" stroke="#2a0a10" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M21 17 l3-7.5 3 7.5 z" fill="#4a3550" stroke="#2a0a10" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="14" cy="22.5" r="2" fill="#ffd94a"/>
    <circle cx="21.5" cy="21.5" r="2" fill="#ffd94a"/>
    <circle cx="14" cy="22.5" r="0.8" fill="#2a0a10"/>
    <circle cx="21.5" cy="21.5" r="0.8" fill="#2a0a10"/>
    <path d="M17.8 26.5 l-2.6 1.6 M17.8 26.5 l2.6 1.6" stroke="#2a0a10" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,

  copy: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="9" width="19" height="26" rx="3" fill="#c99a3a" stroke="#2a0a10" stroke-width="1.8"/>
    <rect x="11" y="12.5" width="13" height="19" rx="1.6" fill="#7a4e10" opacity=".5"/>
    <rect x="20" y="14" width="20" height="27" rx="3" fill="#f7d98a" stroke="#2a0a10" stroke-width="1.9"/>
    <rect x="23.5" y="17.8" width="13" height="19.4" rx="1.6" fill="#e06a5a" opacity=".55"/>
    <path d="M30 22.5 v10 M25 27.5 h10" stroke="#fff6e0" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M30 22.5 v10 M25 27.5 h10" stroke="#2a0a10" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,

  tyrant: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="iiTyrCrown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset="0.55" stop-color="#f7d98a"/><stop offset="1" stop-color="#c99a3a"/></linearGradient></defs>
    <path d="M8 34 L5 13 l10.5 7.5 L24 8 l8.5 12.5 L43 13 l-3 21 z"
          fill="url(#iiTyrCrown)" stroke="#2a0a10" stroke-width="2" stroke-linejoin="round"/>
    <rect x="8" y="34" width="32" height="7" rx="2.4" fill="#c99a3a" stroke="#2a0a10" stroke-width="1.9"/>
    <circle cx="24" cy="28.5" r="3.4" fill="#e06a5a" stroke="#2a0a10" stroke-width="1.6"/>
    <circle cx="14" cy="29.5" r="2.4" fill="#5fd0c0" stroke="#2a0a10" stroke-width="1.4"/>
    <circle cx="34" cy="29.5" r="2.4" fill="#b98fe0" stroke="#2a0a10" stroke-width="1.4"/>
    <circle cx="5" cy="13" r="2.6" fill="#ffe9a8" stroke="#2a0a10" stroke-width="1.5"/>
    <circle cx="43" cy="13" r="2.6" fill="#ffe9a8" stroke="#2a0a10" stroke-width="1.5"/>
    <circle cx="24" cy="8" r="3" fill="#e06a5a" stroke="#2a0a10" stroke-width="1.6"/>
  </svg>`,

  // 고르기 — 석 장 중 한 장에 체크. '뽑는' 게 아니라 '고르는' 것이라는 게 요점이다.
  pick3: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="16" width="14" height="20" rx="3" fill="#d8c9ad" stroke="#2a0a10" stroke-width="2" transform="rotate(-14 11 26)"/>
    <rect x="17" y="15" width="14" height="20" rx="3" fill="#e8dcc0" stroke="#2a0a10" stroke-width="2"/>
    <rect x="28" y="9" width="16" height="23" rx="3" fill="#fff6e0" stroke="#2a0a10" stroke-width="2.4" transform="rotate(11 36 20)"/>
    <path d="M33 17 l3 3 6-7" fill="none" stroke="#5cd69c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 40 l4-5 4 5" fill="none" stroke="#ffd94a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

if (typeof module !== 'undefined') module.exports = { ITEM_ICONS };
