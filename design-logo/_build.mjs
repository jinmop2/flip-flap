// FLIP FLAP 로고 방향 — 판마다 바탕과 껍데기는 같고 자물쇠(로고 조합)만 다르다.
// 값은 앱에서 그대로 뜯어왔다: Bangers 4.4rem/ls 5px, 크롬 칠, drop-shadow 넷,
// FLAP 은 rotate(180deg) margin-top:-17px, 아래 마감 줄(금색 선 + 마름모).
import fs from 'node:fs';
const out = (n, s) => fs.writeFileSync(new URL('./' + n + '.dc.html', import.meta.url), s);

const HEAD = (extraFont) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bangers${extraFont || ''}&display=swap" rel="stylesheet">
  <style>
    body { margin:0; font-family:'Bangers',Impact,cursive; }
    a { color:#9fb4d8; } a:hover { color:#cfe0f6; }
  </style>
</helmet>`;

const TAIL = `</x-dc>
<script data-dc-script data-props='{"$preview":{"width":560,"height":400}}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;

// 로비 바닥 — 남색 + 카드 문양 + 가장자리 그늘
const GROUND = (bg) => `<div style="position:relative; width:560px; height:400px; overflow:hidden;
     display:flex; align-items:center; justify-content:center; background:${bg};">
  <div style="position:absolute; inset:0; opacity:.055; pointer-events:none;
       background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='58' height='58'><g fill='%23bfd5f6'><path d='M14 8c0 0-4 4.2-4 6.4 0 1.5 1.5 2.4 3 1.8l-.7 2.8h3.4l-.7-2.8c1.5.6 3-.3 3-1.8C18 12.2 14 8 14 8z'/><path d='M44 38l3.4 3.4L44 44.8l-3.4-3.4z'/></g></svg>&quot;);"></div>
  <div style="position:absolute; inset:0; pointer-events:none;
       background:radial-gradient(ellipse 78% 58% at 50% 44%, rgba(0,0,0,0) 40%, rgba(0,0,0,.42) 100%);"></div>
`;
const NAVY = 'linear-gradient(180deg,#152037 0%,#0c1220 40%,#090e19 100%)';
const FELT = 'linear-gradient(180deg,#2c4f47 0%,#22403a 46%,#182c28 100%)';

// 앱의 마감 줄 — 금색 선 두 가닥과 가운데 마름모
const RULE = (w = 172) => `    <div style="display:flex; align-items:center; gap:10px; width:${w}px; margin:13px auto 0;">
      <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,rgba(224,180,92,.85),transparent);"></span>
      <i style="width:8px; height:8px; flex-shrink:0; transform:rotate(45deg);
         background:linear-gradient(135deg,#dcebff,#c8912e); box-shadow:0 0 12px rgba(200,222,255,.7), 0 1px 2px rgba(0,0,0,.5);"></i>
      <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,rgba(224,180,92,.85),transparent);"></span>
    </div>`;

// 크롬(백금) 칠 — 앱과 같은 값
const CHROME = `background:linear-gradient(180deg,#ffffff 0%,#d8e4f8 38%,#93a8cc 62%,#4e5e7e 100%);
        -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;`;
const RELIEF = `filter:drop-shadow(0 1px 0 #2a3450) drop-shadow(0 2px 0 #1a2438)
                drop-shadow(0 4px 6px rgba(0,0,0,.5)) drop-shadow(0 0 16px rgba(170,205,255,.34));`;

// ── 지금 쓰는 로고 ─────────────────────────────────────────────────────────
out('Current', HEAD() + GROUND(NAVY) + `
  <div style="position:relative; text-align:center; line-height:.9;">
    <div style="padding:9px 6px; margin:-9px -6px; font-size:4.4rem; letter-spacing:5px;
         ${CHROME} ${RELIEF}">FLIP</div>
    <div style="padding:9px 6px; margin:-26px -6px 0; font-size:4.4rem; letter-spacing:5px;
         transform:rotate(180deg); display:inline-block; ${CHROME} ${RELIEF}">FLAP</div>
${RULE()}
  </div>
</div>
` + TAIL);

// ── 방향 1 · 카드 뒤집기 ───────────────────────────────────────────────────
// 이름이 곧 카드 한 장이 뒤집히는 그림이다. 두 낱말 사이에 접힌 자리를 긋고,
// 아래쪽은 카드 뒷면처럼 어둡게 깐다.
out('Main', HEAD() + GROUND(NAVY) + `
  <div style="position:relative; display:flex; flex-direction:column; align-items:center; line-height:.9;">
    <div style="padding:9px 8px; margin:-9px -8px; font-size:4.4rem; letter-spacing:5px;
         ${CHROME} ${RELIEF}">FLIP</div>
    <div style="position:relative; width:298px; height:15px; margin:-2px 0 -3px;">
      <span style="position:absolute; left:0; right:0; top:7px; height:1.5px;
            background:linear-gradient(90deg,transparent,rgba(200,222,255,.9) 22%,rgba(200,222,255,.9) 78%,transparent);
            box-shadow:0 0 10px rgba(170,205,255,.5);"></span>
      <span style="position:absolute; left:50%; top:1px; width:13px; height:13px; margin-left:-6.5px;
            transform:rotate(45deg); background:linear-gradient(135deg,#f2f7ff,#8ea4c8);
            box-shadow:0 0 12px rgba(200,222,255,.65), 0 1px 2px rgba(0,0,0,.6);"></span>
    </div>
    <div style="padding:9px 8px; margin:-9px -8px; font-size:4.4rem; letter-spacing:5px;
         transform:rotate(180deg);
         background:linear-gradient(180deg,#9fb1cf 0%,#586a89 42%,#33405a 100%);
         -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
         filter:drop-shadow(0 1px 0 rgba(200,222,255,.34)) drop-shadow(0 -1px 0 #0a0f19)
                drop-shadow(0 3px 5px rgba(0,0,0,.55));">FLAP</div>
  </div>
</div>
` + TAIL);

// ── 방향 2 · 물비침 ────────────────────────────────────────────────────────
// 뒤집힌 낱말을 '비친 것'으로 읽게 한다. 아래로 갈수록 흐려지며 사라진다.
out('Mirror', HEAD() + GROUND(NAVY) + `
  <div style="position:relative; display:flex; flex-direction:column; align-items:center; line-height:.9;">
    <div style="padding:9px 8px; margin:-9px -8px; font-size:4.4rem; letter-spacing:5px;
         ${CHROME} ${RELIEF}">FLIP</div>
    <div style="width:250px; height:1.5px; margin:9px 0 6px; border-radius:1px;
         background:linear-gradient(90deg,transparent,rgba(200,222,255,.55),transparent);"></div>
    <div style="padding:9px 8px; margin:-9px -8px; font-size:4.4rem; letter-spacing:5px;
         transform:rotate(180deg); opacity:.5;
         -webkit-mask-image:linear-gradient(0deg, #000 6%, rgba(0,0,0,.15) 74%, transparent 100%);
         mask-image:linear-gradient(0deg, #000 6%, rgba(0,0,0,.15) 74%, transparent 100%);
         background:linear-gradient(180deg,#ffffff 0%,#d8e4f8 38%,#93a8cc 62%,#4e5e7e 100%);
         -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">FLAP</div>
  </div>
</div>
` + TAIL);

// ── 방향 3 · 압인 ──────────────────────────────────────────────────────────
// 칠도 빛도 없이, 판(펠트)에 눌러 찍은 자국만 남긴다. 한 색으로도 나오고
// 실물(카드 상자·굿즈)에 그대로 옮길 수 있다.
out('Press', HEAD() + GROUND(FELT) + `
  <div style="position:relative; text-align:center; line-height:.9;">
    <div style="padding:9px 8px; margin:-9px -8px; font-size:4.4rem; letter-spacing:5px; color:#16302a;
         text-shadow:0 2px 0 rgba(214,240,229,.46), 0 -1.5px 1px rgba(0,0,0,.72), 0 4px 7px rgba(0,0,0,.4);">FLIP</div>
    <div style="padding:9px 8px; margin:-26px -8px 0; font-size:4.4rem; letter-spacing:5px; color:#16302a;
         transform:rotate(180deg); display:inline-block;
         text-shadow:0 2px 0 rgba(214,240,229,.46), 0 -1.5px 1px rgba(0,0,0,.72), 0 4px 7px rgba(0,0,0,.4);">FLAP</div>
    <div style="display:flex; align-items:center; gap:10px; width:172px; margin:15px auto 0;">
      <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,rgba(197,226,214,.34),transparent);"></span>
      <i style="width:8px; height:8px; flex-shrink:0; transform:rotate(45deg); background:#1d3630;
         box-shadow:0 1.5px 0 rgba(197,226,214,.28);"></i>
      <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,rgba(197,226,214,.34),transparent);"></span>
    </div>
  </div>
</div>
` + TAIL);

// ── 방향 4 · 포스터 ────────────────────────────────────────────────────────
// Bangers 를 놓고 굵은 압축 활자로. FLAP 은 백금 띠에서 파낸다 — 두 낱말이
// 양각·음각으로 갈려, 뒤집힘이 색으로도 보인다.
out('Poster', HEAD('&family=Anton') + GROUND(NAVY) + `
  <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
    <div style="font-family:'Anton','Arial Narrow',Impact,sans-serif; font-size:4.9rem; line-height:.86;
         letter-spacing:-1px; color:#f2f7ff; text-shadow:0 3px 10px rgba(0,0,0,.5);">FLIP</div>
    <div style="margin-top:6px; padding:5px 16px 8px; border-radius:3px;
         background:linear-gradient(180deg,#e6eefb,#9fb4d8);
         box-shadow:0 4px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.7);">
      <div style="font-family:'Anton','Arial Narrow',Impact,sans-serif; font-size:4.9rem; line-height:.86;
           letter-spacing:-1px; color:#0d1524; transform:rotate(180deg);">FLAP</div>
    </div>
  </div>
</div>
` + TAIL);

// ── 방향 5 · 앱 아이콘 ─────────────────────────────────────────────────────
// 스토어·홈 화면에 서는 네모. 낱말은 안 들어간다 — 24px 에서 안 읽힌다.
// F 하나를 뒤집어 맞물린 자리가 이름의 그림이 된다.
const MONO = (n, stroke) => `<svg width="${n}" height="${n}" viewBox="0 0 100 100" fill="none">
        <path d="M22 24h34M22 24v52M22 46h24" stroke="${stroke.a}" stroke-width="${stroke.w}" stroke-linecap="round"/>
        <path d="M78 76H44M78 76V24M78 54H54" stroke="${stroke.b}" stroke-width="${stroke.w}" stroke-linecap="round"/>
      </svg>`;
const ICON = (n, r, chrome) => `<div style="position:relative; width:${n}px; height:${n}px; border-radius:${r}px; overflow:hidden;
       background:linear-gradient(160deg,#1c2b45 0%,#111a2c 48%,#080d16 100%);
       box-shadow:inset 0 1.5px 0 rgba(200,222,255,.20), 0 6px 20px rgba(0,0,0,.5);
       display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; left:50%; top:-18%; width:120%; height:78%; transform:translateX(-50%);
           background:radial-gradient(50% 50% at 50% 50%, rgba(44,79,71,.5), transparent 70%);"></div>
      <div style="position:relative; filter:drop-shadow(0 1px 0 #2a3450) drop-shadow(0 2px 5px rgba(0,0,0,.55))${chrome ? ' drop-shadow(0 0 10px rgba(170,205,255,.35))' : ''};">
        ${MONO(Math.round(n * 0.62), chrome ? { a:'#f2f7ff', b:'#8ea4c8', w:9 } : { a:'#e8eefb', b:'#e8eefb', w:9 })}
      </div>
    </div>`;

out('Icon', HEAD() + GROUND(NAVY) + `
  <div style="position:relative;">
${ICON(232, 52, true)}
  </div>
</div>
` + TAIL);

// ── 작은 크기와 단색 ───────────────────────────────────────────────────────
out('Sizes', HEAD() + `<div style="position:relative; width:1160px; height:300px; overflow:hidden;
     display:flex; align-items:center; justify-content:center; gap:52px; padding:0 44px;
     background:${NAVY};">
  <div style="display:flex; align-items:flex-end; gap:26px;">
${ICON(96, 22, true)}
${ICON(64, 15, true)}
${ICON(48, 11, true)}
${ICON(32, 7, true)}
${ICON(24, 6, true)}
  </div>
  <div style="width:1.5px; height:120px; background:linear-gradient(180deg,transparent,rgba(159,180,216,.35),transparent);"></div>
  <div style="display:flex; align-items:center; gap:26px;">
    <div style="width:96px; height:96px; border-radius:22px; display:flex; align-items:center; justify-content:center;
         background:#0b1220; border:1.5px solid rgba(159,180,216,.35);">
      ${MONO(60, { a:'#e8eefb', b:'#e8eefb', w:9 })}
    </div>
    <div style="width:96px; height:96px; border-radius:22px; display:flex; align-items:center; justify-content:center;
         background:#e9eef7; border:1.5px solid rgba(13,21,36,.2);">
      ${MONO(60, { a:'#101a2c', b:'#101a2c', w:9 })}
    </div>
    <div style="width:96px; height:96px; border-radius:22px; display:flex; align-items:center; justify-content:center;
         background:#2c4f47;">
      ${MONO(60, { a:'#eef6f2', b:'#eef6f2', w:9 })}
    </div>
  </div>
</div>
` + TAIL.replace('"width":560,"height":400', '"width":1160,"height":300'));

console.log('✓ 7장');
