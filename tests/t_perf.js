// 앱이 무거워지지 않게 지키는 선.
//
// 폰의 렉은 여기서 재현할 수 없다. 그래서 "재서 고쳤다" 대신, 다시 무거워지기
// 쉬운 자리에 못을 박아 둔다 — 상시 폴링, 매 프레임 다시 그리는 애니메이션,
// 그리고 무심코 커지는 아이콘 파일.
const fs = require('fs');
const src = __dirname + '/..';
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const c4 = fs.readFileSync(src + '/public/client4.js', 'utf8');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const srv = fs.readFileSync(src + '/server.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 아무 일 없을 때는 쉬어야 한다');
{
  // 예전엔 0.4초마다 모달 상태를 훑었다. 아무도 안 눌러도 초당 2.5번 깨어난다.
  ok('모달 상태를 폴링하지 않는다', !/setInterval\(navRefresh/.test(cli));
  ok('class 변화를 지켜본다', /MutationObserver/.test(cli) && /attributeFilter: \['class'\]/.test(cli));
  // 한 번의 변화로 여러 번 부르지 않게 미뤄 부르되, rAF 는 쓰지 않는다 —
  // 탭이 화면에 없으면 아예 안 불려서 탭 표시가 굳는다.
  ok('묶어서 한 번만 부른다', /watchModals\.q = true;\s*\n\s*const run = \(\) => \{ watchModals\.q = false; navRefresh\(\); \};/.test(cli));
  ok('rAF 로 미루지 않는다', !/requestAnimationFrame\([^)]*navRefresh/.test(cli));

  // 다인전 재시도 타이머 — 보낸 게 있을 때만 돈다
  ok('재시도 타이머는 필요할 때만', /pendTimer = pendAct \? setInterval\(checkPend, 700\) : null/.test(c4));
  ok('먹히면 타이머를 끈다', /pendAct = null; watchPend\(\)/.test(c4));

  // 남아 있는 타이머를 세어 둔다. 늘어나면 여기서 걸린다.
  // 미니게임 것 둘(차례 시계·다음 판 카운트다운)은 판이 도는 동안만 돌고 반드시 꺼진다.
  // 매칭 대기 카운트다운이 하나 늘었다(8). 상시로 도는 게 아니라 대기 창이
  // 열려 있는 동안만 돈다 — 매칭 성사·취소·판 시작 어디로 끝나든 꺼진다.
  const always = [...cli.matchAll(/setInterval\(/g)].length + [...c4.matchAll(/setInterval\(/g)].length;
  // 끊김 카운트다운이 하나 늘었다(9). 이것도 상시가 아니다 — 연결이 끊겨
  // 창이 떠 있는 동안만 돌고, 0 이 되거나 다시 붙으면 스스로 끈다.
  ok('상시 타이머가 늘지 않았다', always <= 9, `${always}개`);
  ok('끊김 카운트다운은 스스로 끈다',
     /if \(dcLeft <= 0\) \{ clearInterval\(dcTimer\); dcTimer = null; \}/.test(cli)
     && /function dcHide\(\)[\s\S]{0,200}clearInterval\(dcTimer\)/.test(cli));
  ok('매칭 카운트다운은 반드시 꺼진다',
     (cli.match(/matchCountdownStop\(\)/g) || []).length >= 4
     && /function matchCountdownStop\(\) \{ clearInterval\(_mmTick\); \}/.test(cli));
  // 켜는 곳마다 끄는 곳이 있어야 한다 — 안 끄면 판을 나가도 계속 돈다
  for (const name of ['miniClock', 'miniNextTick']) {
    const on = [...cli.matchAll(new RegExp(`${name} = setInterval`, 'g'))].length;
    const off = [...cli.matchAll(new RegExp(`clearInterval\\(${name}\\)`, 'g'))].length;
    ok(`${name} 는 반드시 꺼진다`, on > 0 && off >= on + 1, `${on}켜기 / ${off}끄기`);
  }
}

console.log('\n② 매 프레임 다시 그리는 애니메이션');
{
  // opacity·transform 은 합성만 하지만, box-shadow·filter·width 는 다시 그린다.
  // 무한히 도는 것 중에 그런 게 있으면 폰이 계속 일한다.
  // 이름만이 아니라 그 선언 전체를 들고 있는다 — 시간 곡선(steps 여부)을 봐야 한다
  const decls = [...html.matchAll(/animation:\s*([\w-]+)([^;]*)infinite/g)]
    .map((m) => ({ name: m[1], rest: m[2] }));
  const infinite = decls.map((d) => d.name);
  ok('무한 애니메이션을 찾았다', infinite.length > 0, `${infinite.length}개`);

  // 키프레임 본문은 중괄호가 겹쳐 있어 정규식으로 자르면 옆 규칙까지 삼킨다.
  // 여는 괄호부터 짝이 맞을 때까지 직접 센다.
  const bodyOf = (name) => {
    const i = html.search(new RegExp('@keyframes\\s+' + name + '\\s*\\{'));
    if (i < 0) return '';
    let j = html.indexOf('{', i), depth = 0;
    for (let k = j; k < html.length; k++) {
      if (html[k] === '{') depth++;
      else if (html[k] === '}' && --depth === 0) return html.slice(j + 1, k);
    }
    return '';
  };
  // steps 로 끊은 것은 값이 프레임마다 변하지 않는다 — 키프레임 경계에서만
  // 몇 번 바뀐다. 무거운 값이라도 20초에 예닐곱 번이면 다시 그리는 값이 없다.
  // 그러니 '무겁다' 는 판단에서 빼되, 끊긴 것만 빼야 한다. 쓰이는 자리가
  // 하나라도 이어지는(steps 아닌) 곳이 있으면 그건 여전히 매 프레임이다.
  const stepped = (name) => decls.filter((d) => d.name === name).every((d) => /steps\(/.test(d.rest));
  const heavy = [];
  for (const name of new Set(infinite)) {
    // 값 안에 섞인 단어가 아니라 실제 선언만 본다
    if (!/(^|[{;\s])(box-shadow|filter|width|height|background)\s*:/.test(bodyOf(name))) continue;
    if (stepped(name)) continue;
    heavy.push(name);
  }
  // 봐주는 목록을 두면 거기에 자꾸 쌓인다. 지금 하나도 없으니 그냥 0을 지킨다.
  ok('무한히 도는 무거운 애니가 없다', heavy.length === 0, heavy.join(','));
  // 끊어 돌리는 것도 '끊겨 있다' 는 사실 자체는 지켜야 한다
  ok('무거운 값은 끊어서만 돌린다',
     [...new Set(infinite)].filter((n) =>
       /(^|[{;\s])(box-shadow|filter|width|height|background)\s*:/.test(bodyOf(n)))
       .every(stepped));

  // 뽑기 카드 열 장이 동시에 도는 자리 — 여기만은 반드시 가벼워야 한다
  ok('뽑기 카드 힌트는 opacity 만', /@keyframes gcTapHint \{ 0%,100% \{ opacity:0; \} 50% \{ opacity:1; \} \}/.test(html));
}

console.log('\n③ 내려받는 무게');
{
  const kb = (f) => Math.round(fs.statSync(src + '/public/' + f).size / 1024);
  // 표지 그림은 무심코 원본을 그대로 넣기 쉽다. 원본은 2.7MB 였다.
  ok('icon-512 가 200KB 이하', kb('icon-512.png') <= 200, kb('icon-512.png') + 'KB');
  ok('icon-192 가 60KB 이하', kb('icon-192.png') <= 60, kb('icon-192.png') + 'KB');
  ok('icon-180 가 60KB 이하', kb('icon-180.png') <= 60, kb('icon-180.png') + 'KB');
  for (const f of ['icon-512.png', 'icon-192.png', 'icon-180.png'])
    ok(`${f} 이 있다`, fs.existsSync(src + '/public/' + f));

  // 서버가 압축·캐시를 해 주는지 (한 줄 지우면 전송량이 4배가 된다)
  ok('gzip 압축을 쓴다', /require\('compression'\)\(\)/.test(srv));
  ok('그림·음악·폰트는 캐시한다', /max-age=604800/.test(srv));
}

console.log('\n④ 누른 즉시 반응하는가 (2인전)');
{
  // 카드를 고를 때마다 render() 를 통째로 불렀다. 손패 여섯 장을 다시 만들고
  // 부채꼴까지 다시 계산하니, 톡 누를 때마다 한 박자씩 늦었다.
  ok('고르기는 표시만 바꾼다', /paintBidSel\(\); \} \}\);/.test(cli)
     || /selectedBidCard\?\.id === c\.id \? null : c; paintBidSel\(\)/.test(cli));
  ok('고를 때 render 를 안 부른다',
     !/selectedBidCard\?\.id === c\.id \? null : c; render\(\)/.test(cli));
  ok('표시만 바꾸는 함수가 있다', /function paintBidSel/.test(cli));

  // 재생성 여부를 가르는 열쇠에서 "고른 카드" 를 뺀다 — 손패도 매트도.
  ok('손패 열쇠에 선택이 없다',
     !/const sig = hand\.map\(c => c\.id\)\.join\(','\)[^\n]*selectedBidCard/.test(cli));
  ok('매트 열쇠에도 선택이 없다',
     !/JSON\.stringify\(\[s\.phase, s\.auctioneer, s\.pick, s\.auction, selectedBidCard/.test(cli));

  // 확정을 누르면 서버 답을 기다리지 않고 먼저 손에서 버린다
  ok('손에서 먼저 민다', /if \(el && el\.parentElement\) el\.parentElement\.remove\(\)/.test(cli));
  ok('다음 상태에서 다시 맞춘다', /lastSig\.hand = null;/.test(cli));

  // 출품은 교체가 되는 단계라 미리 빼면 안 된다 — 대신 누름을 바로 보여 준다
  ok('출품은 미리 빼지 않는다',
     /el\.classList\.add\('sending'\);\n        socket\.emit\('offer_card'/.test(cli));
  ok('가는 중 표시 CSS', /#myHand \.card\.sending \{/.test(html));

  // 버튼이 생기며 아래가 밀리면 판이 들썿거린다
  ok('확정 버튼 자리를 비워 둔다', /\.bid-confirm-slot \{/.test(html)
     && /slot\.className = 'bid-confirm-slot'/.test(cli));
}

console.log('\n⑤ 아이템전 진입 위치');
{
  // 전에는 로비에 따로 버튼이 있고 거기서 다시 "솔로 / 빠른플레이" 를 물었다.
  // AI전은 솔로 안, 온라인 매칭은 멀티 안에 있는 게 찾기 쉽다 — 한 번 덜 묻는다.
  const solo = html.slice(html.indexOf('id="soloModal"'), html.indexOf('id="multiModal"'));
  const multi = html.slice(html.indexOf('id="multiModal"'), html.indexOf('id="multiModal"') + 2200);
  ok('솔로 안에 AI 아이템전', /onclick="startItemGame\('/.test(solo));
  ok('멀티 안에 빠른 아이템전', /onclick="quickJoin\('item'\)"/.test(multi));
  ok('솔로에는 빠른매칭이 없다', !/quickMatch\(true\)/.test(solo));
  ok('멀티에는 AI전이 없다', !/startItemGame\(\)/.test(multi));
  // 로비의 별도 버튼과, 거기서 다시 묻던 창은 사라져야 한다
  ok('로비에 따로 있던 버튼이 없다', !/mode-card mini item/.test(html));
  ok('다시 묻는 창도 없다', !/function openItemMode/.test(cli));
  ok('시작하면 팝업을 닫는다', /window\.startItemGame = function \([^)]*\) \{\s*\n\s*closeModePanels\(\);/.test(cli));
}

console.log('\n⑩ 배경음악 — 로비와 판이 다른 곡');
{
  const fs2 = require('fs');
  ok('곡이 둘이다', /const BGM_SRC = \{ lobby: '\/lobby\.m4a[^']*', game: '\/bgm\.m4a[^']*' \}/.test(cli));
  ok('두 파일이 다 있다',
     fs2.existsSync(src + '/public/lobby.m4a') && fs2.existsSync(src + '/public/bgm.m4a'));
  // 로비 곡은 모바일에서 받는 것이라 가벼워야 한다.
  // 지금 곡은 5분 24초짜리 라운지 곡이라 1MB 로는 안 들어간다 — 대신 64kbps
  // 로 눌러 담았다(라운지 음색이라 이 대역에서 티가 잘 안 난다). 3MB 를
  // 넘어가면 그때는 곡을 자르든 대역을 더 낮추든 손을 봐야 한다.
  const kb = Math.round(fs2.statSync(src + '/public/lobby.m4a').size / 1024);
  ok('로비 곡이 3MB 아래', kb < 3072, kb + 'KB');
  ok('로비에 들어오면 로비 곡', /function hideTitle\(\)[\s\S]{0,160}lobbyBGM\(\)/.test(cli));
  ok('판에 들어가면 판 곡', /startBGM\('game'\)/.test(cli));
  ok('다인전도 판 곡', /startBGM\('game'\)/.test(c4));
  ok('다인전에서 나오면 로비 곡', /startBGM\('lobby'\)/.test(c4));
  // 같은 곡이면 다시 틀지 않는다 — 판을 오갈 때마다 처음부터 시작하면 뚝뚝 끊긴다
  ok('같은 곡이면 그대로 둔다', /if \(bgmOn && bgmTrack === track\) return;/.test(cli));
  ok('다른 곡이면 갈아 끼운다', /if \(bgmOn\) stopBGM\(\);/.test(cli));
  // 듣던 음악 유지
  ok('켜면 우리 소리를 안 낸다', /if \(keepOtherAudio\) return;/.test(cli));
  ok('효과음도 막는다', /playSample[\s\S]{0,90}if \(keepOtherAudio\) return true;/.test(cli));
}

console.log('\n⑪ 접속하는 첫 순간 — 로비가 스쳐 보이지 않게');
{
  // 본문이 다 그려진 뒤 자바스크립트로 가리면 이미 한 프레임 늦다.
  // 문서를 읽기 시작하는 순간(머리글)에 표시를 걸어야 한다.
  const head = html.slice(0, html.indexOf('<body'));
  ok('머리글에서 표시를 건다', /classList\.add\('booting'\)/.test(head));
  ok('내부 이동이면 안 건다', /if \(!sessionStorage\.getItem\('ff_skipsplash'\)\) document\.documentElement\.classList\.add\('booting'\)/.test(head));
  ok('가리는 규칙이 있다', /html\.booting #lobby, html\.booting #title, html\.booting #profileBar,\s*\n\s*html\.booting #navBar, html\.booting #game, html\.booting #tv \{ visibility:hidden; \}/.test(html));
  ok('로고가 걷힐 때 같이 밝아진다', /document\.documentElement\.classList\.remove\('booting'\);\s*\n\s*s\.classList\.add\('hide'\)/.test(cli));
  ok('건너뛴 경우엔 곧바로 보여 준다', /s\.style\.display = 'none';\s*\n\s*document\.documentElement\.classList\.remove\('booting'\)/.test(cli));
  // 로고가 안 걷히는 사고가 나도 화면은 보여야 한다
  ok('8초 뒤에는 무조건 보여 준다', /setTimeout\(\(\) => document\.documentElement\.classList\.remove\('booting'\), 8000\)/.test(cli));
}

console.log('\n⑧ 첫 화면에서 소리 파일을 미리 받지 않는다');
// 브라우저는 사람이 화면을 건드리기 전엔 소리를 안 내준다. 그런데 코드는
// 곧바로 오디오를 만들고 play() 를 불러, 로비 곡 2.5MB 를 "받아 놓고 못 트는"
// 상태로 버리고 있었다. 음악을 꺼 둔 사람에게도 똑같이 받았다.
// 실측: 첫 화면 전송량 2,700KB → 166KB.
{
  const cliSrc = fs.readFileSync(src + '/public/client.js', 'utf8');
  ok('음악을 꺼 뒀으면 아예 안 만든다', /if \(bgmOff\) return;/.test(cliSrc)
     && /bgmOn = true; bgmTrack = track;/.test(cliSrc));
  ok('껐다 켜면 그때 시작한다',
     /if \(bgmOff\) stopBGM\(\);\s*\n\s*else if \(!bgmOn\) startBGM\(inGameNow\(\) \? 'game' : 'lobby'\);/.test(cliSrc));
  ok('src 를 걸어도 미리 받지 않는다', /bgmAudio\.preload = 'none';/.test(cliSrc));
  ok('손대기 전엔 play() 를 안 부른다',
     /const ua = navigator\.userActivation;\s*\n\s*if \(ua && ua\.hasBeenActive === false\) armKick\(true\);\s*\n\s*else tryPlay\(\);/.test(cliSrc));
  ok('효과음도 손짓 뒤에 받는다',
     /function loadSamplesOnce\(\)/.test(cliSrc)
     && /hasBeenActive === false\) \{\s*\n\s*for \(const t of \['pointerdown', 'keydown', 'touchend'\]\)\s*\n\s*window\.addEventListener\(t, loadSamplesOnce/.test(cliSrc));
  // 손짓이 이미 있었던 경우(재접속 등)에는 곧바로 받아야 한다 — 안 그러면 소리가 영영 안 난다
  ok('이미 손댄 뒤라면 곧바로 받는다', /\} else loadSamplesOnce\(\);/.test(cliSrc));
  ok('음악 상태를 밖에서 확인할 수 있다', /window\.__bgm = \(\) =>/.test(cliSrc));
}

console.log('\n⑨ 딜 — 두 사람에게 한 장씩 번갈아');
// 한쪽 여섯 장을 몰아서 뿌리면 '나눠 준다' 가 아니라 '펼쳐진다' 로 보인다.
// 화투·포커처럼 한 장씩 오가야 카드가 어디서 왔는지가 읽힌다.
{
  const c = fs.readFileSync(src + '/public/client.js', 'utf8');
  ok('끼워넣을 자리를 받는다', /const offset = o\.offset \|\| 0, step = o\.step \|\| 1;/.test(c)
     && /el\.style\.animationDelay = \(\(offset \+ i \* step\) \* stagger\) \+ 'ms';/.test(c));
  ok('진행자가 자기 것을 나중에 받는다', /function dealOrder\(\)/.test(c)
     && /const iDeal = !!\(s && s\.auctioneer === s\.myIndex\);/.test(c)
     && /return \{ me: iDeal \? 1 : 0, opp: iDeal \? 0 : 1, step: 2/.test(c));
  ok('상대 손패도 덱에서 받는다',
     /if \(needsDeal && n >= 6\) \{[\s\S]{0,260}offset: d\.opp, step: d\.step/.test(c));
  ok('내 손패는 엇갈린 박자로', /offset: d\.me, step: d\.step/.test(c));
  ok('소리도 열두 번 — 상대에게 가는 카드도 소리가 난다',
     /const beats = hand\.length \* 2;/.test(c));
  // 상대 쪽 딜이 needsDeal 을 먼저 꺼 버리면 내 손패는 그냥 나타난다
  ok('상대 쪽은 깃발을 끄지 않는다',
     !/if \(needsDeal && n >= 6\) \{[\s\S]{0,300}needsDeal = false/.test(c));
  ok('끝나는 시각도 끼워넣기를 반영한다',
     /return \(offset \+ \(cards\.length - 1\) \* step\) \* stagger \+ dur;/.test(c));
}


console.log('\n⑦ 켤 때 같은 것을 두 번 부르지 않는다');
{
  // 미리받기와 배지 갱신이 각자 쏘아, 켤 때마다 /api/friends · /api/clan ·
  // /api/missions 가 두 번씩 나갔다. 느린 망에서는 그대로 왕복 세 번이다.
  const c = fs.readFileSync(src + '/public/client.js', 'utf8');
  ok('받아 둔 값에 나이가 있다', /const _cacheAt = new Map\(\);/.test(c)
     && /function fetchInto\(key, fetcher, maxAge\)/.test(c));
  ok('안 지난 값은 그대로 쓴다',
     /if \(at && Date\.now\(\) - at < maxAge && _cache\.has\(key\)\) return Promise\.resolve/.test(c));
  ok('배지도 받아 둔 것을 쓴다',
     /fetchInto\('friends',[\s\S]{0,90}?15000\)/.test(c) && /fetchInto\('clan',[\s\S]{0,90}?15000\)/.test(c));
  ok('미리받기도 같은 규칙', /const FRESH = 15000;/.test(c)
     && (c.match(/FRESH\)/g) || []).length >= 5);
  // 값을 버릴 때 나이도 같이 버려야 한다 — 안 그러면 낡은 값을 새것으로 안다
  ok('버릴 때 나이도 버린다', /_cache\.delete\(key\); _cacheAt\.delete\(key\);/.test(c));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
