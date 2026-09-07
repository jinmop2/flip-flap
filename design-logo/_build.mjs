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
out('Flip', HEAD() + GROUND(NAVY) + `
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

// ── 고른 방향 · 압인 ───────────────────────────────────────────────────────
// "좋은데 너무 안 보인다" 는 한 가지 문제가 아니다. 글자와 바탕의 밝기 차가
// 없어서일 수도, 파낸 방향이 반대여서일 수도, 바탕이 펠트가 아니어서일 수도
// 있다. 세 갈래로 나눠 각각 하나씩 손본다.
const PRESS = (px, fill, edge, rule) => {
  const pull = Math.round(px * 0.37);   // 4.4rem(70.4px) 에서 -26px 이던 값과 같은 비율
  const L = (t, extra = '') => `<div style="padding:9px 8px; margin:${extra} -8px 0; font-size:${px}px; letter-spacing:5px;
           ${fill} ${edge}">${t}</div>`;
  return `<div style="text-align:center; line-height:.9;">
      <div style="padding:9px 8px; margin:-9px -8px 0; font-size:${px}px; letter-spacing:5px; ${fill} ${edge}">FLIP</div>
      <div style="padding:9px 8px; margin:-${pull}px -8px 0; font-size:${px}px; letter-spacing:5px;
           transform:rotate(180deg); display:inline-block; ${fill} ${edge}">FLAP</div>
      <div style="display:flex; align-items:center; gap:10px; width:${Math.round(px * 2.44)}px; margin:${Math.round(px * 0.21)}px auto 0;">
        <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,${rule.line},transparent);"></span>
        <i style="width:8px; height:8px; flex-shrink:0; transform:rotate(45deg); background:${rule.gem}; box-shadow:${rule.gemShadow};"></i>
        <span style="flex:1; height:1.5px; border-radius:1px; background:linear-gradient(90deg,transparent,${rule.line},transparent);"></span>
      </div>
    </div>`;
};
const clip = (g) => `background:linear-gradient(180deg,${g});
        -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;`;

// 판마다 파낸 자리의 바닥색과 턱의 방향이 다르다
const TAKE = {
  // 깊게 — 파인 자리를 바탕보다 확실히 어둡게 하고, 아래 턱에 빛을 물린다
  deep:   { felt: { fill: clip('#081714 0%,#0f241f 58%,#1e3b34 100%'),
                    edge: `filter:drop-shadow(0 -1.5px 0 rgba(0,0,0,.9)) drop-shadow(0 2px 0 rgba(198,232,217,.55)) drop-shadow(0 5px 9px rgba(0,0,0,.45));` },
            navy: { fill: clip('#04080e 0%,#0a1120 58%,#1b2540 100%'),
                    edge: `filter:drop-shadow(0 -1.5px 0 rgba(0,0,0,.9)) drop-shadow(0 2px 0 rgba(186,212,255,.5)) drop-shadow(0 5px 9px rgba(0,0,0,.5));` } },
  // 박 — 판 자리에 백금을 채운다. 아래쪽이 밝은 칠이라 '파인 바닥에 빛이 든' 것으로 읽힌다
  foil:   { felt: { fill: clip('#93a9c9 0%,#778db2 28%,#c6d7ef 70%,#f2f7ff 100%'),
                    edge: `filter:drop-shadow(0 -2px 0 rgba(0,0,0,.85)) drop-shadow(0 1.5px 0 rgba(214,240,229,.42)) drop-shadow(0 5px 9px rgba(0,0,0,.5));` },
            navy: { fill: clip('#93a9c9 0%,#778db2 28%,#c6d7ef 70%,#f2f7ff 100%'),
                    edge: `filter:drop-shadow(0 -2px 0 rgba(0,0,0,.9)) drop-shadow(0 1.5px 0 rgba(190,215,255,.4)) drop-shadow(0 5px 9px rgba(0,0,0,.55));` } },
  // 양각 — 파는 대신 밀어 올린다. 빛이 위에서 오므로 위 턱이 밝고 아래가 그늘이다
  emboss: { felt: { fill: clip('#4d8073 0%,#39655a 52%,#25463e 100%'),
                    edge: `filter:drop-shadow(0 -1.5px 0 rgba(214,240,229,.6)) drop-shadow(0 2px 0 rgba(0,0,0,.7)) drop-shadow(0 6px 10px rgba(0,0,0,.45));` },
            navy: { fill: clip('#3b4a66 0%,#28334e 52%,#171f33 100%'),
                    edge: `filter:drop-shadow(0 -1.5px 0 rgba(190,215,255,.55)) drop-shadow(0 2px 0 rgba(0,0,0,.75)) drop-shadow(0 6px 10px rgba(0,0,0,.5));` } },
};
const RULE_FELT = { line: 'rgba(197,226,214,.34)', gem: '#17322c', gemShadow: '0 1.5px 0 rgba(198,232,217,.4)' };
const RULE_NAVY = { line: 'rgba(159,180,216,.34)', gem: '#0b1220', gemShadow: '0 1.5px 0 rgba(186,212,255,.4)' };
const RULE_FOIL = { line: 'rgba(224,180,92,.7)', gem: 'linear-gradient(135deg,#dcebff,#c8912e)',
                    gemShadow: '0 0 10px rgba(200,222,255,.55), 0 1px 2px rgba(0,0,0,.6)' };

out('Main',   HEAD() + GROUND(FELT) + `
  <div style="position:relative;">${PRESS(70, TAKE.deep.felt.fill, TAKE.deep.felt.edge, RULE_FELT)}</div>
</div>
` + TAIL);
out('Foil',   HEAD() + GROUND(FELT) + `
  <div style="position:relative;">${PRESS(70, TAKE.foil.felt.fill, TAKE.foil.felt.edge, RULE_FOIL)}</div>
</div>
` + TAIL);
out('Emboss', HEAD() + GROUND(FELT) + `
  <div style="position:relative;">${PRESS(70, TAKE.emboss.felt.fill, TAKE.emboss.felt.edge, RULE_FELT)}</div>
</div>
` + TAIL);

// 실제로 서는 자리는 로비의 남색이다 — 펠트가 아니다. 큰 것과 작은 것을 같이 본다.
const col = (label, big, small) => `    <div style="display:flex; flex-direction:column; align-items:center; gap:26px;">
      <div>${big}</div>
      <div>${small}</div>
    </div>`;
out('OnNavy', HEAD() + `<div style="position:relative; width:1160px; height:460px; overflow:hidden;
     display:flex; align-items:center; justify-content:space-around; padding:0 30px; background:${NAVY};">
  <div style="position:absolute; inset:0; opacity:.055; pointer-events:none;
       background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='58' height='58'><g fill='%23bfd5f6'><path d='M14 8c0 0-4 4.2-4 6.4 0 1.5 1.5 2.4 3 1.8l-.7 2.8h3.4l-.7-2.8c1.5.6 3-.3 3-1.8C18 12.2 14 8 14 8z'/><path d='M44 38l3.4 3.4L44 44.8l-3.4-3.4z'/></g></svg>&quot;);"></div>
  <div style="position:absolute; inset:0; pointer-events:none;
       background:radial-gradient(ellipse 78% 58% at 50% 44%, rgba(0,0,0,0) 40%, rgba(0,0,0,.42) 100%);"></div>
${col('깊게', PRESS(70, TAKE.deep.navy.fill, TAKE.deep.navy.edge, RULE_NAVY), PRESS(40, TAKE.deep.navy.fill, TAKE.deep.navy.edge, RULE_NAVY))}
${col('박',   PRESS(70, TAKE.foil.navy.fill, TAKE.foil.navy.edge, RULE_FOIL), PRESS(40, TAKE.foil.navy.fill, TAKE.foil.navy.edge, RULE_FOIL))}
${col('양각', PRESS(70, TAKE.emboss.navy.fill, TAKE.emboss.navy.edge, RULE_NAVY), PRESS(40, TAKE.emboss.navy.fill, TAKE.emboss.navy.edge, RULE_NAVY))}
</div>
` + TAIL.replace('"width":560,"height":400', '"width":1160,"height":460'));
console.log('✓ 압인 네 장');

// 눌러 찍으려면 눌릴 재료가 있어야 한다. 로비 바탕은 남색이라 팬 자리가 더
// 어두워질 여지가 없다 — 그래서 순수 압인은 남색 위에서 힘을 못 쓴다.
// 펠트 판을 한 장 깔고 거기에 찍으면 같은 결로 화면에서도 산다.
out('Plaque', HEAD() + GROUND(NAVY) + `
  <div style="position:relative; width:436px; padding:30px 26px 26px; border-radius:20px;
       background:${FELT}; border:1.5px solid rgba(159,180,216,.34);
       box-shadow:inset 0 2px 0 rgba(214,240,229,.16), inset 0 -14px 26px rgba(0,0,0,.34), 0 12px 30px rgba(0,0,0,.5);">
    <div style="position:absolute; inset:0; border-radius:19px; opacity:.06; pointer-events:none;
         background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='58' height='58'><g fill='%23dff2e8'><path d='M14 8c0 0-4 4.2-4 6.4 0 1.5 1.5 2.4 3 1.8l-.7 2.8h3.4l-.7-2.8c1.5.6 3-.3 3-1.8C18 12.2 14 8 14 8z'/><path d='M44 38l3.4 3.4L44 44.8l-3.4-3.4z'/></g></svg>&quot;);"></div>
    <div style="position:relative;">${PRESS(64, TAKE.deep.felt.fill, TAKE.deep.felt.edge, RULE_FELT)}</div>
  </div>
</div>
` + TAIL);
console.log('✓ 펠트 판 한 장');
