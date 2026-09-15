// 화면 — 눈으로 봐야 보이는 것들 중, 코드에서 못 박을 수 있는 것만 모은다.
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };
const htm = fs.readFileSync(R + '/public/index.html', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');

console.log('\n① 프로필 바 — 오른쪽 단추 줄 자리를 비워 둔다');
// 톱니와 보너스는 .pb-acts 에 세로로 쌓여 절대 배치로 빠져 있다. 오른쪽 끝에
// 오는 것들이 저마다 그만큼 비워 두지 않으면 그 위에 깔린다. 로그인 버튼이
// 그랬다 — 버튼 오른쪽 28px 을 누르면 로그인이 아니라 설정이 열렸다.
ok('단추 줄은 오른쪽 끝 절대 배치',
   /\.pb-acts \{[\s\S]{0,160}position:absolute;[\s\S]{0,60}right:10px;/.test(htm));
// 세로로 쌓으므로 비워야 할 폭은 단추 한 칸 그대로다
ok('단추는 세로로 쌓는다', /\.pb-acts \{[\s\S]{0,420}flex-direction:column;/.test(htm));
const gap = (htm.match(/#setBtn \{[\s\S]{0,200}?width:(\d+)px/) || [])[1];
ok('코인·RP 가 톱니 자리를 비운다', /\.pb-right \{ margin-right:38px; \}/.test(htm));
ok('로그인 버튼도 같이 비운다', /\.pb-login \{ margin-left:auto; margin-right:38px;/.test(htm));
ok(`비운 폭(38px)이 톱니 폭(${gap}px)+여백보다 크다`, 38 >= Number(gap), `톱니 ${gap}px`);

console.log('\n② 아이템 카드 — 긴 이름이 좁은 카드에서 무너지지 않는다');
// 가로 모드에선 카드가 31px 까지 좁아진다. '도둑고양이' 는 한 줄에 못 들어가
// 두 줄로 접히는데, 기본 줄 간격이면 글자가 카드 밖으로 밀려 나온 것처럼 보였다.
ok('줄 간격을 좁혀 둔다', /\.card\.item-card \.ic-name \{[\s\S]{0,220}line-height:1\.05;/.test(htm));
ok('카드 폭을 넘지 않게 잡는다', /\.card\.item-card \.ic-name \{[\s\S]{0,240}width:100%;[\s\S]{0,80}overflow-wrap:anywhere;/.test(htm));
ok('아주 좁아지는 자리에선 딱지를 접는다',
   /body\.land \.card\.item-card \.ic-tag,\s*\n\s*\.pile-group \.card\.item-card \.ic-tag \{ display:none; \}/.test(htm));

console.log('\n③ 명암비 — 설명서 보조 글씨');
// 설명서 배경(#080204) 위에서 #6a5a70 은 3.2:1 로 12px 기준(4.5:1)에 못 미쳤다.
const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (fg, bg) => { const a = lum(...hex(fg)), b = lum(...hex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const gcol = (htm.match(/\.r-comp-g\{ color:(#[0-9a-f]{6});/) || [])[1];
ok('설명서 보조 글씨 색을 읽었다', !!gcol, gcol);
ok(`보조 글씨가 4.5:1 을 넘는다 (${gcol} → ${ratio(gcol, '#080204').toFixed(2)}:1)`,
   ratio(gcol, '#080204') >= 4.5);

console.log('\n④ 진동 — 사람이 손대기 전에는 부르지 않는다');
// 손대기 전 진동은 브라우저가 막고 콘솔에 오류를 남긴다(try/catch 로 못 잡는다).
// 진짜 오류가 그 소음에 묻힌다.
ok('첫 손짓을 기다린다', /let userTouched = false;/.test(cli)
   && /window\.addEventListener\(ev, \(\) => \{ userTouched = true; \}, \{ once: true, capture: true \}\)/.test(cli));
ok('손대기 전엔 그냥 돌아간다', /if \(vibeOff \|\| !userTouched\) return;/.test(cli));
ok('진동 종류도 상속 키를 안 탄다', /hasOwnProperty\.call\(VIBE, kind\)/.test(cli));

console.log('\n⑤ 회전 — 가로에서는 테이블을 접는다');
ok('가로면 테이블을 감춘다', /body\.land #game-table, body\.land #tv-table, body\.land #quad-table \{ display:none; \}/.test(htm));
ok('회전 뒤 다시 잰다', /function scheduleRelayout/.test(cli)
   && /orientationchange/.test(cli));

console.log('\n⑥ 2인전 가운데 — 덱·턴·경매품이 한 줄에 선다');
// 덱 층은 .card 라서 제 크기를 들고 온다. 칸(#deckStack)은 그보다 작아서
// 층이 칸 밖으로 삐져나왔고, 칸을 기준으로 잡은 것들(턴 표시·덱 장수)이
// 전부 실제 덱과 어긋났다 — 장수는 덱 위에 12px 겹쳐 있었다.
ok('덱 층을 칸 크기에 맞춘다',
   /#deckStack \.deck-layer \{[\s\S]{0,160}width:100%; height:100%;/.test(htm));
// 한쪽으로만 밀면 덱의 눈에 보이는 가운데가 칸 가운데에서 밀려난다
ok('쌓인 티는 가운데를 축으로 벌린다',
   /const mid = \(layers - 1\) \/ 2;/.test(cli)
   && /const k = i - mid;/.test(cli)
   && /translate\(\$\{\(k \* 2\)\.toFixed\(1\)\}px, \$\{\(-k \* 2\)\.toFixed\(1\)\}px\)/.test(cli));
// 턴 표시는 덱과 같은 축·같은 폭이어야 한다. 따로 적어 두면 화면 폭마다 어긋난다.
const axis = (w) => {
  const m = htm.match(new RegExp(`@media \\(max-width:${w}px\\)([\\s\\S]*?)\\n    \\}`));
  if (!m) return null;
  const d = m[1].match(/#deckStack \{ left:(\d+)px; width:(\d+)px/);
  const t = m[1].match(/#turnInfo \{ left:(\d+)px; width:(\d+)px/);
  return d && t ? { deck: [d[1], d[2]], turn: [t[1], t[2]] } : null;
};
for (const w of [400]) {
  const a = axis(w);
  ok(`${w}px 이하에서 턴과 덱이 같은 축`, a && a.deck[0] === a.turn[0] && a.deck[1] === a.turn[1],
     a ? JSON.stringify(a) : '못 찾음');
}
ok('덱 장수가 덱에 안 닿게 띄운다', /#deckStack \.deck-count \{ font-size:\.55rem; bottom:-19px; \}/.test(htm));

// 트웰브에는 tvAlignRow 가 있는데 2인전에는 짝이 없어, 덱·레일이 경매품보다
// 몇 픽셀 위에 떠 있었다(안내 문구가 아래에서 칸을 밀어 올린다).
ok('2인전에도 줄 맞추는 함수가 있다', /function gAlignRow\(\)/.test(cli));
ok('테이블을 깔기 전에 줄을 맞춘다',
   /gAlignRow\(\);   \/\/ 줄을 맞춘 뒤라야/.test(cli));
// 카드가 없을 때 맞추면 엉뚱한 값이 박히고 카드가 나온 뒤에도 남는다
ok('카드가 없으면 건드리지 않는다',
   /const slot = document\.querySelector\('#auctionItems \.a-slot'\);\s*\n\s*if \(!slot\) return;/.test(cli));
// 카드는 딜·비행 중 transform 으로 움직인다 — 그때 재면 어긋난 값이 잡힌다
ok('움직이지 않는 칸을 잰다',
   /const lbl = slot\.querySelector\('\.a-label'\);/.test(cli)
   && /const cy = s\.top \+ lh \+ \(s\.height - lh\) \/ 2;/.test(cli));
ok('가로 모드에서는 밀어 둔 자리를 푼다',
   /function gAlignRow\(\)[\s\S]{0,400}for \(const el of \[deck, rail, turn\]\) if \(el\) el\.style\.marginTop = '';\s*\n\s*return;/.test(cli));

console.log('\n⑨ 탭을 넘길 때 넘어가는 중이라고 보여 준다');
{
  // 여태 막이 새까맣기만 해서 잠깐 화면이 꺼진 것처럼 보였다
  // 기다리는 표시는 로고가 한다 — 이름이 곧 그 동작이다.
  // (돌아가는 고리를 따로 두었더니 로고와 따로 놀아 둘 다 눈에 안 들어왔다.)
  ok('막에 로고가 있다', /<div id="fadeVeil">[\s\S]{0,200}fv-logo/.test(htm)
     && /<b><img src="\/logo-flip\.webp"[^>]*><\/b><i><img src="\/logo-flap\.webp"/.test(htm)
     && !/fv-ring/.test(htm));
  // 넘어가는 구간을 키프레임에서 읽어 실제 시각(ms)으로 바꿔 본다.
  // 퍼센트를 그대로 못 박아 두면, 막 시간이 바뀌어도 시금석은 계속 초록이다.
  const kf = (name) => {
    const i = htm.indexOf('@keyframes ' + name + ' {');
    const body = htm.slice(i, htm.indexOf('\n    }', i));
    const stops = [...body.matchAll(/([\d.]+%(?:,\s*[\d.]+%)*)\s*\{([^}]*)\}/g)]
      .flatMap((m) => m[1].split(',').map((q) => ({ at: parseFloat(q), turn: /rotateX\((-?\d+)deg\)/.exec(m[2]) })));
    const moving = stops.filter((x) => x.turn);
    const startAt = Math.max(...moving.filter((x) => +x.turn[1] === 0).map((x) => x.at));
    const endAt = Math.min(...moving.filter((x) => Math.abs(+x.turn[1]) === 360).map((x) => x.at));
    const sign = Math.sign(+moving.find((x) => Math.abs(+x.turn[1]) === 360).turn[1]);
    return { from: startAt / 100 * 1800, to: endAt / 100 * 1800, sign };
  };
  const flip = kf('fvFlipUp'), flap = kf('fvFlapUp');
  const veilMs = +(/const VEIL_MIN = (\d+);/.exec(cli) || [, 0])[1];
  // 탭을 옮길 때 막은 VEIL_MIN 만큼만 떠 있다. 예전엔 FLAP 이 306ms 에야
  // 출발해 막이 걷히는 순간 막 움직이기 시작한 참이었다 — FLIP 만 돌고
  // FLAP 은 안 도는 것으로 보였다.
  ok('FLAP 까지 막이 걷히기 전에 다 넘어간다', flip.to <= veilMs && flap.to <= veilMs,
     `FLIP ${flip.to}ms · FLAP ${Math.round(flap.to)}ms · 막 ${veilMs}ms`);
  // FLIP 이 다 넘어간 뒤 한 박자 쉬고 FLAP 이 넘어간다. 겹치면 둘이 한꺼번에
  // 돌아 무엇이 먼저인지 안 읽힌다.
  ok('FLIP 이 다 돈 뒤 조금 있다 FLAP 이 돈다', flip.to < flap.from && flap.from - flip.to >= 100,
     `FLIP ${flip.from}→${flip.to} · FLAP ${Math.round(flap.from)}→${Math.round(flap.to)}`);
  // 막이 필요 이상 길면 탭을 옮길 때마다 괜히 기다린다
  ok('막은 FLAP 이 내려앉는 데까지만 더 머문다', veilMs - flap.to >= 0 && veilMs - flap.to <= 120,
     `막 ${veilMs}ms · FLAP 끝 ${Math.round(flap.to)}ms`);
  // 한 바퀴가 너무 짧으면 도는 방향이 눈에 안 잡힌다
  ok('한 바퀴에 0.18초는 쓴다', flip.to - flip.from >= 180 && flap.to - flap.from >= 180);
  // FLIP 은 아래로, FLAP 은 위로. 로고가 그림이 된 뒤로 FLAP 은 그림에 이미
  // 뒤집혀 그려져 있어 CSS 로 따로 뒤집지 않는다 — 그래서 부호가 서로 반대다.
  // (글꼴 시절엔 rotate(180deg) 를 씌워 둘 다 -360 이었다.)
  ok('FLIP 은 아래로, FLAP 은 위로 돈다', flip.sign === -1 && flap.sign === 1);
  // 늘 돌려 두면 안 보이는 채로 판이 도는 내내 폰을 깨워 둔다
  ok('막이 켜졌을 때만 넘어간다', /#fadeVeil\.on \.fv-logo b \{ animation:fvFlipUp/.test(htm)
     && !/^\s*\.fv-logo b, \.fv-logo i \{[^}]*animation:/m.test(htm));
  // 그림 안에서 이미 뒤집혀 있다 — 또 뒤집으면 FLAP 이 바로 서 버린다
  ok('FLAP 그림을 CSS 로 또 뒤집지 않는다', !/rotate\(180deg\) rotateX\(/.test(htm)
     && !/\.fv-logo i \{ transform:rotate\(180deg\)/.test(htm));
  // 두 쪽이 같은 자리에 겹쳐야 멈췄을 때 그림 한 장이 된다
  ok('두 쪽이 제자리에 겹친다', /\.fv-logo b, \.fv-logo i \{ position:absolute; inset:0;/.test(htm));
  // 빨리 홱 도니 급해 보였다 — 한 바퀴를 늘리고 도는 구간도 넓혔다
  // 넘어간 뒤에는 다음 판까지 쉰다.
  ok('막 안에서 한 바퀴를 마친다', /animation:fvFlipUp 1\.8s/.test(htm)
     && /animation:fvFlapUp 1\.8s/.test(htm)
     && /const VEIL_MIN = \d+;/.test(cli));
  // 로고는 그림 한 장이다 — 타이틀·로비가 같은 그림을 쓰고, 옛 글꼴 로고가 남지 않는다
  const fs2 = require('fs'), path2 = require('path');
  ok('로고는 그림 한 장이다', (htm.match(/<h1 class="logo-img"><img src="\/logo\.webp"/g) || []).length === 2
     && !/<h1>FLIP<\/h1>/.test(htm) && !/class="tl flap"/.test(htm));
  ok('그림 파일이 다 있다', ['logo.webp', 'logo-flip.webp', 'logo-flap.webp']
     .every((f) => fs2.existsSync(path2.join(__dirname, '..', 'public', f))));
  // 그물 없이 켜도 제목 자리가 비지 않게
  ok('서비스워커가 로고를 미리 담는다', /'\/logo\.webp', '\/logo-flip\.webp', '\/logo-flap\.webp'/.test(fs2.readFileSync(path2.join(__dirname, '..', 'public', 'sw.js'), 'utf8')));
  // 깜빡이는 것은 로고를 감싼 불빛이지 글자가 아니다 — 글자를 깜빡이게
  // 했더니 이름이 안 읽히는 순간이 생겼다. 주기는 길게(16초).
  // 빛을 따로 한 층 깔았다가 데였다. 글자에는 이미 drop-shadow 가 넷
  // 걸려 있어, 그 안쪽에 빛을 넣으면 넷이 그 빛을 각각 한 번씩 더 번지게
  // 한다 — 겹겹이 부풀어 로고 둘레가 허옇게 떴다(실기기에서 확인).
  // 층을 새로 깔지 않고 원래 걸려 있던 그 빛의 세기만 바꾼다.
  ok('빛 층을 따로 깔지 않는다', !/logo-img::before/.test(htm) && !/logo-img img::before/.test(htm));
  ok('원래 걸린 빛의 세기만 바꾼다',
     /#lobby \.logo \.logo-img img \{ animation:logoGlow 20s steps\(1, end\) infinite; \}/.test(htm)
     && /@keyframes logoGlow \{[\s\S]{0,300}drop-shadow\(0 0 18px rgba\(120,170,255,\.30\)\)/.test(htm)
     && /drop-shadow\(0 0 5px rgba\(120,170,255,\.05\)\)/.test(htm));
  // 입체는 그림에 들어 있다. 깜빡이는 동안에도 바닥 그림자는 그대로 둔다 — 빼면 로고가 뜬다
  ok('바닥 그림자는 깜빡이는 내내 그대로', (htm.match(/drop-shadow\(0 6px 10px rgba\(0,0,0,\.45\)\) drop-shadow\(0 0 /g) || []).length >= 8);
  // 어긋나게 뒀더니 등이 하나 나가는 게 아니라 두 개가 따로 노는 것으로 보였다
  ok('두 줄이 같은 순간에 깜빡인다', !/#lobby \.logo \.flap::before \{ animation-delay:/.test(htm));
  // 크기는 폭 하나로만 정한다 — 높이까지 적으면 좁은 화면에서 그림이 찌그러진다
  ok('로고 크기는 폭으로만', /width:var\(--logo-w, 172px\); height:auto;/.test(htm));
}

console.log('\n⑪ 랭킹은 올라온다');
{
  // 열었을 때 다 떠 있으면 등수가 그냥 목록으로만 읽힌다 — 3등부터 차례로 선다
  ok('3등 → 2등 → 1등 차례로', /#lbBox\.lb-in \.pod-3 \{ animation-delay:0s; \}/.test(htm)
     && /#lbBox\.lb-in \.pod-2 \{ animation-delay:\.14s; \}/.test(htm)
     && /#lbBox\.lb-in \.pod-1 \{ animation-delay:\.3s; \}/.test(htm));
  ok('나머지 줄도 차례로', /#lbBox\.lb-in \.lb-row[\s\S]{0,180}var\(--i, 0\) \* 26ms/.test(htm)
     && /row\.style\.setProperty\('--i', String\(i\)\)/.test(cli));
  // 켜 두면 새로 받아 다시 그릴 때마다 또 올라와 목록이 들썩인다
  ok('열 때만 올라온다', /box\.classList\.add\('lb-in'\)/.test(cli)
     && /box\.classList\.remove\('lb-in'\), 2200\)/.test(cli));
  // 눈에 안 잡힐 만큼 짧으면 화면이 한 번 깜빡인 것으로만 보인다
  ok('고리가 보일 만큼은 머문다', /const VEIL_MIN = \d+;/.test(cli)
     && /Math\.max\(0, VEIL_MIN - \(Date\.now\(\) - t0\)\)/.test(cli));
  ok('막의 로고도 로비와 같은 그림에서 잘랐다', /logo-flip\.webp/.test(htm) && /logo-flap\.webp/.test(htm)
     && /\.fv-logo \{ position:relative; width:118px; aspect-ratio:931\/803;/.test(htm));
  // 서서히 짙어지게 두면 그 사이 옛 화면이 비치고, 화면을 갈아 끼우는 순간(85ms)이
  // 아직 반투명한 막 너머로 드러난다 — "탭을 넘기면 로비가 잠깐씩 보인다".
  ok('막은 즉시 덮고 걷을 때만 서서히',
     /#fadeVeil\.on \{ opacity:1; pointer-events:auto; transition:none; \}/.test(htm)
     && /#fadeVeil \{[\s\S]{0,160}transition:opacity \.16s linear;/.test(htm));
  // 나가는 길에도 덮는다 — 안 덮으면 흰 화면이 한 번 지나간다
  ok('나갈 때도 덮는다', /function fastReload\(\) \{[\s\S]{0,200}veilHold\(\);/.test(cli)
     && /function veilHold\(\)/.test(cli));
}

console.log('\n⑩ 솔로플레이 모드 고르기');
{
  // 길게 한 줄씩 늘어놓으면 아래 것은 스크롤해야 보였다 — 한 줄에 둘씩
  ok('모드는 두 개씩 한 줄', /\.sm-list \{ display:grid; grid-template-columns:1fr 1fr;/.test(htm));
  // 설명이 한 줄인 것과 두 줄인 것이 섞여 있다 — 높이를 못 박아야 격자가 안 어그러진다
  // 창은 화면을 꽉 채우는데 단추만 위쪽에 모여 있으면 아래가 텅 빈다
  ok('남는 자리를 단추가 나눠 갖는다', /\.sm-list \{[\s\S]{0,220}grid-template-rows:1fr 1fr \.62fr;/.test(htm)
     && /\.sm-list \{[\s\S]{0,260}flex:1; min-height:0;/.test(htm));
  // 토너먼트는 한 판이 아니라 한 대회다
  ok('토너먼트는 한 줄을 다 쓴다', /\.sm-item\.wide \{ grid-column:1 \/ -1; \}/.test(htm));
  // 난이도를 아래 따로 두면 어느 모드의 것인지 눈이 한 번 더 오간다
  ok('난이도는 그 칸 안에서 드러난다',
     /\.sm-item\.on \.sm-head \{ opacity:0;/.test(htm)
     && /\.sm-item\.on \.sm-body \{ opacity:1;/.test(htm)
     && !/sm-diff/.test(htm));
  // 반 칸 너비에 셋을 가로로 늘어놓으면 글자가 안 읽힌다
  ok('반 칸에서는 세로로 쌓는다', /\.sm-body \{\s*display:flex; flex-direction:column;/.test(htm)
     && /\.sm-item\.wide \.sm-body \{ flex-direction:row;/.test(htm));
  ok('한 칸만 열린다', /document\.querySelectorAll\('#soloModal \.sm-item'\)[\s\S]{0,120}el\.dataset\.m === m/.test(htm));
}

console.log('\n⑪ 이모트 목록');
{
  // 팩을 사면 이모트가 차단 단추 뒤에 붙는다(refreshEmotes 가 append 한다).
  // 적어 놓은 차례와 상관없이 늘 맨 아래여야 한다.
  ok('차단 단추는 늘 맨 아래', /#emotePicker \.emote-mute \{\n\s*order:99;/.test(htm));
  ok('팩 이모트는 뒤에 붙는다', /picker\.appendChild\(b\);/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
