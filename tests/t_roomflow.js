// 방 대기실 → 시작 흐름에서 두 번 물린 버그를 지킨다.
//  1) 방장이 시작한 아이템전 판에 fx 가 없어 아이템이 통째로 죽었다.
//  2) 참가해도 방 목록 팝업이 안 닫혀 "안 들어가진 것처럼" 보였다.
//  3) 판이 시작됐는데 다인전 화면이 안 켜져 상태를 전부 버렸다.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };

const srv = read('server.js');
const start = srv.slice(srv.indexOf("socket.on('room_start'"), srv.indexOf("socket.on('rejoin'"));
ok('room_start 가 모드를 넘겨 판을 만든다', /createGame\(!!room\.itemMode\)/.test(start));
ok('fx 를 손으로 채우지 않는다', !/game\.items\s*=\s*\{\s*1:/.test(start));

const cli = read('public/client.js');
const lobby = cli.slice(cli.indexOf("socket.on('room_lobby'"), cli.indexOf("const MODE_NAME"));
ok('대기실에 들어가면 떠 있던 팝업을 닫는다', /lb-modal\.show/.test(lobby));
ok('빈자리는 친구 초대 버튼', /roomInvite\(\)/.test(lobby));

const c4 = read('public/client4.js');
const begin = c4.slice(c4.indexOf("socket.on('g4_begin'"), c4.indexOf("socket.on('g4_room'"));
ok('판이 시작되면 다인전 화면을 켠다', /if \(!q4Live\)[\s\S]{0,200}enterWaiting\(\)/.test(begin));
const room = c4.slice(c4.indexOf("socket.on('g4_room'"), c4.indexOf("socket.on('g4_cancelled'"));
ok('자리 넷짜리로 옮겨져도 화면을 켠다', /if \(!q4Live\)[\s\S]{0,300}enterWaiting\(\)/.test(room));

// 화면 비율·줄바꿈·오디오 — 이번에 손본 것들
const htm = read('public/index.html');
ok('한글이 낱말 단위로만 끊긴다', /word-break:\s*keep-all/.test(htm) && !/word-break:break-all/.test(htm));
// 화면에 맞춰 판 전체를 키우고 줄인다 (폭만 늘리면 비율이 어긋난다)
ok('판을 배율로 맞춘다', /body\.board-zoom #game[^}]*zoom:var\(--board-zoom/.test(htm));
ok('폰 세로는 손대지 않는다', /if \(vw <= 700 && vh > vw\) \{[\s\S]{0,180}removeProperty\('--board-zoom'\)/.test(cli));
ok('배율을 화면에서 계산한다', /Math\.min\(\(vw - 16\) \/ W, \(vh - 8\) \/ H\)/.test(cli));
ok('가로를 막지 않는다', !/rotateNote/.test(htm) && !/lock\('portrait'\)/.test(cli));
// 가로 전용 배치 — 왼쪽 상대 · 가운데 경매대 · 아래 한 줄이 내 자리
// 오른쪽에 같은 폭의 빈 칸을 둬야 가운데 칸이 판 한가운데에 온다
// 고르는 자리에 제 줄을 준다 — 세로에서 #myZone 이 비워 두던 아래 여백이
// 가로에는 없어서, 확정 버튼이 고를 카드 위에 그대로 앉았다.
ok('가로에서는 격자로 편다', /body\.land\.ingame #game \{[\s\S]{0,900}grid-template-areas:"opp center pad" "act act act" "mine mine mine"/.test(htm));
ok('고르는 자리는 손패 위가 아니다', /body\.land #game #actionArea \{ position:static; grid-area:act;/.test(htm));
// 세로 레일용 폭 100% 가 가로에서는 서로를 밀어내, 내 배팅 칸이 레일 밖으로 나갔다
ok('가로 레일은 칸을 밀어내지 않는다', /body\.land #g-rail > \* \{ width:auto; \}/.test(htm));
ok('좌우 칸 폭이 같다', /grid-template-columns:minmax\(120px, 21%\) 1fr minmax\(120px, 21%\)/.test(htm));
// !important 를 무조건 걸면 로비에서 꺼 둔 판까지 되살아난다 — .ingame 을 같이 건다
ok('판 안에서만 격자로 바꾼다', /body\.land\.ingame #game \{[\s\S]{0,40}display:grid !important/.test(htm));
ok('미니게임에는 가로 크기를 안 씌운다', /body\.land #mini \{[^}]*zoom:1/.test(htm));
// 줄에 같이 세우면 세 덩어리가 함께 가운데로 몰려 경매대가 밀린다 — 왼쪽 끝에 붙인다
ok('덱과 턴 표시는 가운데 칸 왼쪽 끝에',
   /body\.land #deckStack \{ position:absolute; left:4px/.test(htm) && /body\.land #turnInfo \{ position:absolute; left:4px/.test(htm));
ok('가로 설계 크기가 따로 있다', /LAND_W = 940, LAND_H = 520/.test(cli));
// 노트북 창은 대부분 높이 660~760 이라 예전 기준(760)에 걸려, 타원 테이블이
// 사라지고 화면 전체가 펠트인 큰 판이 떴다. 눕힌 폰만 그 배치를 쓴다.
ok('눕힌 폰에서만 가로 배치', /vw > vh \* 1\.15 && vh < 560/.test(cli));
// 판을 열 때 테이블을 재지 않으면, 리사이즈가 없는 컴퓨터에서는 영영 안 그려진다
ok('판을 열면 테이블을 잰다',
   /startBGM\('game'\);[\s\S]{0,320}scheduleRelayout\(\);\n\}\);/.test(cli)
   && /tvOpen\(\) \{[\s\S]{0,420}scheduleRelayout\(\);/.test(cli));
// 카드를 줄였으면 그 안 글자도 줄여야 한다 — 낮고 넓은 화면에서 숫자가 카드 밖으로 나갔다
{
  const short = (h) => {
    const i = htm.indexOf(`@media (max-height: ${h}px) {`);
    return i < 0 ? '' : htm.slice(i, htm.indexOf('\n    }', i));
  };
  ok('낮은 화면에서 카드 글자도 줄인다',
     [730, 640].every((h) => /\.card \.c-num \{ font-size:2\.3rem; \}/.test(short(h))
                          && /\.card \.c-rank \{ font-size:\.95rem/.test(short(h))));
}
ok('듣던 음악 유지 토글은 없앴다', !/toggleKeepAudio/.test(htm) && !/togKeep/.test(htm));
ok('밖의 음악에 자동으로 양보한다', /yieldToOtherAudio/.test(cli));
// 접힌 상태를 저장하지 않는다 — 새로고침하면 늘 다시 시도한다
ok('양보를 저장하지 않는다', !/ff_yield/.test(cli) && /let keepOtherAudio = false/.test(cli));
ok('한 번 나온 뒤에 멈춰야 양보한다', /if \(played && bgmOn/.test(cli));
ok('막히면 다음 손짓마다 다시 시도한다', /function armKick/.test(cli) && /addEventListener\(t, kick, true\)/.test(cli));

// 알림·관전·손패 탭·랭킹
ok('로비 탭바 배지에 안 읽은 메시지를 얹는다', /function paintSocialBadges/.test(cli) && /gcClanUnread/.test(cli));
ok('메시지가 오면 로비 배지도 다시 칠한다', /gcPaintDot[\s\S]{0,400}paintSocialBadges\(\)/.test(cli));
ok('친구 목록에 관전 버튼', /watchFriend\('\$\{esc\(f\.watch\)\}',\$\{f\.watchQuad/.test(cli));
ok('관전은 서버에 spectate 로 붙는다', /socket\.emit\('spectate'/.test(cli));
ok('시계는 탭을 삼키지 않는다', /#mebar \.timer[^}]*pointer-events:none/.test(htm));
ok('겹치는 자리에서 손패가 이긴다', /#myHand \{[^}]*z-index:8/.test(htm));
// 창의 여백(로비에서는 메뉴바 자리)을 지켜야 하므로 100dvh 가 아니라 100%
ok('랭킹은 전체화면', /\.lb-box\.rank-box \{[\s\S]{0,120}height:100%/.test(htm));

// 랭크게임 · 빠른 입장 · 코드 로그인 제거
ok('RP 는 랭크게임에서만', /noRank: !room\.ranked/.test(srv));
// 랭크 딱지는 매칭 두 길(사람끼리 · 10초 뒤 AI)에서만 붙는다.
// 이제 그 둘이 빠른대전과 코드를 함께 쓰므로 ranked 는 변수로 넘어온다 —
// 리터럴 true 를 세는 대신 "그 두 곳 말고는 안 붙는다" 를 본다.
ok('랭크 표시는 매칭에서만 붙는다',
   (srv.match(/^ {4}ranked,/gm) || []).length === 2
   && !/ranked: true/.test(srv)
   // 빠른 입장이 만드는 방에는 랭크가 안 붙는다 (그 처리기 안만 본다)
   && (() => {
     const at = srv.indexOf("socket.on('quick_join'");
     const body = srv.slice(at, srv.indexOf('\n  });', at));
     // r.ranked 를 '읽어서 거르는' 것은 정상 — 방에 랭크를 '다는' 것만 본다
     return at > 0 && !/^\s*ranked[,:]/m.test(body);
   })());
ok('빠른대전은 랭크가 아니다', /startMatch\(mate, me, \{ ranked: false \}\)/.test(srv)
   && /startBotMatch\(me, \{ ranked: false \}\)/.test(srv));
ok('빠른 입장 통로가 있다', /socket\.on\('quick_join'/.test(srv));
ok('빠른 입장 방은 랭크 방을 안 집는다', /r\.tutorial \|\| r\.ranked/.test(srv));
// 방이 없으면 그냥 방을 만든 것과 똑같아야 한다 — 자리도 보이고 시작도 방장이 누른다
{
  const qj = srv.slice(srv.indexOf("socket.on('quick_join'"), srv.indexOf("socket.on('quick_join'") + 3000);
  ok('빠른 입장이 연 방은 보통 방과 같다', /hostStart: true/.test(qj));
  ok('대기실 화면을 그대로 쓴다', /room_created/.test(qj) && /pushRoomLobby\(roomId\)/.test(qj));
  ok('따로 만든 대기 화면이 없다', !/quick_waiting/.test(srv) && !/quick_waiting/.test(cli));
}
ok('클라이언트에 빠른 입장 버튼 셋', (htm.match(/quickJoin\('(classic|item|quad)'\)/g) || []).length === 3);
ok('랭크게임 버튼', /onclick="quickMatch\(\)"[\s\S]{0,200}랭크게임/.test(htm));
ok('랭크게임 칸에 내 등급이 보인다', /id="mmRank"/.test(htm) && /mmRank/.test(cli));
ok('다인전 빠른 입장도 같은 대기실을 쓴다',
   !/q4Quick/.test(cli) && /\['classic', 'item', 'quad', 'twelve', 'mini'\]\.includes\(mode\)/.test(srv));
ok('빠른 입장이 자리 남은 방을 찾는다', /n > 0 && n < capOf\(r\)/.test(srv));
ok('다인전 빠른 입장 방 이름이 있다', /다인전 빠른 입장/.test(srv));
ok('코드 로그인은 화면에서 사라졌다', !/코드로 시작/.test(htm) && !/codeLogin/.test(htm) && !/submitCode/.test(cli));

// 다인전 = 자리 늘리기
// 미니게임도 자리가 넷이다 — 인원을 미리 나누지 않고 앉은 대로 시작한다
ok('방마다 자리 수가 있다',
   /function capOf\(room\)[\s\S]{0,140}room\.mode === 'quad' \|\| room\.mode === 'mini'\) \? 4 : 2/.test(srv));
ok('다인전을 골라도 방을 안 옮긴다',
   /if \(mode === 'quad'\) \{[\s\S]{0,200}pushRoomLobby/.test(srv));
ok('엔진을 갈아타는 것은 시작할 때', /room\.mode === 'quad'[\s\S]{0,600}g4\.startGroup/.test(srv));
ok('다인전은 세 명부터', /다인전은 세 명부터/.test(srv));
ok('빈자리는 자리 수만큼 받는다', /for \(let i = 0; i < cap; i\+\+\) if \(!room\.players\[i\]\)/.test(srv));
ok('방장 승계가 네 자리를 다 훑는다', /for \(let i = 0; i < cap; i\+\+\) if \(room\.players\[i\]\) kept\.push\(i\)/.test(srv));
ok('대기실이 네 자리로 늘어난다', /wc-seats\.four/.test(htm));

// 기타 탭 · UI 잔소리 정리 · 솔로 순서
ok('기타 탭이 있다', /data-rt="etc"/.test(htm) && /id="rulesEtcModal"/.test(htm));
ok('기타 탭에 급수·RP·레벨·보상이 다 있다',
   ['급수와 단', 'RP — 랭크게임에서만', '레벨과 경험치', '판이 끝나면 받는 것', '매일 받는 것']
     .every((h) => htm.includes(h)));
ok('기타 탭 영어판이 있다', /rulesEtc: `/.test(read('public/i18n.js')));
ok('UI 잔소리는 기타 탭으로 옮겼다',
   !/고르면 바로 시작 · 승리 시 코인 보상/.test(htm)
   && !/경매에서 지면 아이템을 받아요 · 랭킹 미반영/.test(htm)
   && !/여기서 붙은 판만 RP 가 오르내려요/.test(htm));
{
  const solo = htm.slice(htm.indexOf('id="soloModal"'), htm.indexOf('멀티플레이 팝업'));
  // 주석에도 같은 말이 들어 있으므로, 실제로 누르는 버튼의 순서를 본다
  const order = [...solo.matchAll(/onclick="(soloPlay|startItemGame|q4Start)\(/g)].map((m) => m[1]);
  ok('솔로는 클래식 → 아이템전 → 다인전 순',
     order.join(',') === 'soloPlay,soloPlay,soloPlay,startItemGame,startItemGame,startItemGame,q4Start,q4Start', order.join(','));
}

// 파편 상점 · 방에서 나가면 멀티 창으로
ok('교환소에 상자 테두리가 없다', /#gcPaneExch #gcShop \{[^}]*background:none/.test(htm));
ok('지갑이 제목 줄 밖으로 나왔다',
   /<div class="gc-wallet">/.test(htm) && !/class="lb-title"[^>]*>\s*<span><span data-ico="🎁"/.test(htm));
ok('방을 나오면 멀티 창으로 돌아온다',
   /ff_openmulti/.test(cli) && /openMode\('multi'\)/.test(cli));

// 탭을 누르면 바로 그려진다 (담아 둔 값 + 미리 받기)
ok('담아 두는 틀이 있다', /function showThenRefresh/.test(cli) && /function fetchInto/.test(cli));
ok('로그인하면 미리 받아 둔다', /function prefetchTabs/.test(cli) && /prefetchTabs\(\);/.test(cli));
ok('미리 받는 것에 미션·친구·클랜·랭킹이 다 있다',
   ['/api/missions', '/api/friends', '/api/clan', '/api/leaderboard', '/api/clan-list']
     .every((u) => new RegExp("fetchInto\\('[a-z]+',\\s*\\(\\) => (apiPost\\('" + u + "'|fetch\\('" + u + "')").test(cli)));
ok('무언가를 바꾸면 담아 둔 값을 버린다', (cli.match(/cacheDrop\(/g) || []).length >= 10);
ok('창을 열 때는 안 버린다',
   !/function openFriends\(\) \{[\s\S]{0,200}cacheDrop/.test(cli)
   && !/function openClan\(\) \{[\s\S]{0,200}cacheDrop/.test(cli));
ok('상점 표는 다음에도 남는다', /localStorage\.setItem\('ff_shop'/.test(cli));

// 상대 손패가 위쪽 버튼·프로필과 겹치지 않게 자리를 비운다.
// 화면 폭과 상관없는 일이라 미디어쿼리 밖에 있어야 한다.
{
  // 미디어쿼리 안은 여섯 칸, 바깥은 네 칸 들여쓴다 — 들여쓰기로 위치를 본다
  // 왼쪽 위 조작 버튼 넉 장이 오른쪽 위 메뉴 아이콘 하나로 접힌 뒤로는
  // 그 자리를 비워 둘 이유가 없다 — 노치를 피할 만큼만 두고 판에 내준다.
  ok('상대 손패 위는 노치만큼만 비운다', /\n {4}#oppZone \{ padding-top:calc\(14px \+ var\(--safe-t\)\)/.test(htm));
  ok('좁은 화면에서만 비우던 옛 규칙이 없다', !/#oppZone \{ padding-top:0/.test(htm));
}

// 마우스로 손패를 누를 때 — 카드가 들려도 누르는 자리가 사라지지 않아야 한다
ok('손패 hover 는 칸이 받는다', /\.fan-slot:has\(> \.card\.selectable\):hover > \.card\.selectable/.test(htm));
// 카드 자체 hover 는 남기되 "움직이지 않는" 것만 — 움직이면 커서에서 빠져나가 떨린다
ok('카드가 직접 hover 로 들리지 않는다',
   !/\n {4}\.card\.selectable:hover \{[^}]*transform/.test(htm));
ok('손패는 칸이 누름을 받는다', /if \(cardEl\._tap\) onTap\(slot, cardEl\._tap\)/.test(cli));
ok('그때 카드에는 안 묶는다', /if \(opts\.tapOnSlot\) el\._tap =/.test(cli));

// 판 안의 버튼은 click 이 아니라 pointerup 으로 받는다
// 마우스에서는 pointerup 과 click 중 하나가 조용히 사라지는 일이 있다 — 둘 다 듣는다
ok('오픈·클로즈 버튼이 두 길로 받는다',
   /onPress\(bo, \(\) => \{[\s\S]{0,80}choose_auction/.test(cli)
   && /onPress\(bc, \(\) => \{[\s\S]{0,80}choose_auction/.test(cli));
ok('같은 누름은 한 번만', /if \(now - last < 350\) return;/.test(cli));
ok('그 버튼에 onclick 을 안 쓴다', !/b[oc]\.onclick =/.test(cli));
ok('배팅 확정도 두 길로', /onPress\(btn, \(\) => \{ if \(btn\._fire\)/.test(cli));
ok('확정 버튼은 한 번만 묶는다', /if \(!btn\) \{[\s\S]{0,300}onPress\(btn,/.test(cli));

// 랭킹 · 강퇴 · 화면 밀림
ok('랭킹 줄 안의 칭호가 안 늘어난다', /\.lb-row \.lb-title \{[^}]*flex-grow:0/.test(htm));
ok('넓은 화면 규칙은 직계에만', /rank-box > \.lb-title/.test(htm) && !/rank-box \.lb-title,/.test(htm));
ok('방장이 내보낼 수 있다', /socket\.on\('room_kick'/.test(srv) && /window\.roomKick/.test(cli));
ok('방장만 · 자기는 못 내보낸다', /socket\.playerIndex !== 0\) return;[\s\S]{0,200}i <= 0/.test(srv));
ok('쫓겨나면 알려준다', /room_kicked/.test(srv) && /room_kicked/.test(cli));
// 이제는 판 안이든 밖이든 화면 자체가 안 움직인다 (body 에 통째로 걸었다)
ok('다인전도 화면이 안 움직인다', /body \{ position:fixed; inset:0; width:100%; overflow:hidden; \}/.test(htm));
ok('밀린 화면을 되돌린다', /function pinViewport/.test(cli) && /visualViewport\.addEventListener\('scroll', pinViewport\)/.test(cli));

// 배팅 차례가 아닐 때 이유가 보이는가 · 세로 고정
ok('차례가 아니면 손패를 잠근 티를 낸다', /el\.classList\.toggle\('locked', !!waiting\)/.test(cli));
ok('말 대신 흐리게만 알린다', !/handWait/.test(htm) && !/진행자가 먼저 배팅해요/.test(htm));
ok('잠기면 흐리게', /#myHand\.locked \.card \{[^}]*opacity:\.5/.test(htm));
ok('올리면 반응은 있다', /\n {4}\.card\.selectable:hover \{ border-color/.test(htm));
ok('가로로도 할 수 있다', !/id="rotateNote"/.test(htm));

// 결과창이 남아 판을 덮는 것 · 두 자리 등급
ok('판이 도는 중이면 결과창을 내린다',
   /if \(s\.phase !== 'game_over'\) \{[\s\S]{0,220}gameOver[\s\S]{0,80}display = 'none'/.test(cli));
ok('두 자리 등급에 표시를 붙인다', /card\.grade >= 10 \? ' two' : ''/.test(cli));
ok('다인전도 같이', /card\.grade >= 10 \? ' two' : ''/.test(read('public/client4.js')));
ok('두 자리는 여백을 줄인다', /\.c-rank\.two \{[^}]*padding:2px 4px/.test(htm));

// 프로필은 위, 메뉴는 아래. 둘 다 금테 없음.
ok('프로필 바가 위', /#profileBar \{[\s\S]{0,120}position:fixed; top:0/.test(htm));
ok('메뉴바가 아래', /#navBar \{[\s\S]{0,120}position:fixed; bottom:0/.test(htm));
ok('프로필 바에 금테가 없다', /#profileBar \{[\s\S]{0,260}border:none/.test(htm));
ok('메뉴바에 금테가 없다', /\n    #navBar \{[\s\S]{0,320}border:none/.test(htm));
ok('로비 여백이 뒤바뀐 순서에 맞다', /#lobby \{ padding-top:calc\(84px[^}]*padding-bottom:calc\(72px/.test(htm));
ok('레벨 배지가 사진 아래로', /\.pb-lv \{ position:absolute; top:calc\(100% - 6px\)/.test(htm));

// 랭킹은 메뉴바로, 설정은 프로필 바 오른쪽에 아이콘만
ok('메뉴바 끝 칸이 랭킹', /data-nav="rank" onclick="navGo\('rank'\)"/.test(htm) && !/data-nav="settings"/.test(htm));
ok('랭킹 탭이 랭킹 창을 연다', /rank:\s*\(\) => openLeaderboard\(\)/.test(cli));
ok('열린 탭 표시에 랭킹도 있다', /open\('lbModal'\) \? 'rank'/.test(cli));
ok('로비 한가운데 랭킹 버튼은 뺐다', !/class="rank-btn"/.test(htm));
ok('설정은 아이콘만', /id="setBtn"[\s\S]{0,200}<svg/.test(htm) && !/id="setBtn"[\s\S]{0,400}>설정</.test(htm));
ok('설정 누름이 프로필로 안 퍼진다', /id="setBtn"[^>]*event\.stopPropagation\(\)/.test(htm));

// 아래 탭 — 켜진 곳에 판이 깔린다(테마가 심야·백금으로 바뀌며 금색 → 백금)
ok('메뉴바가 로비 창들 위에 있다', /#navBar \{[\s\S]{0,140}z-index:50/.test(htm));
ok('켜진 탭에 판이 깔린다', /\.nav-item\.active::before \{[\s\S]{0,160}rgba\(144,167,200,\.15\)/.test(htm));
ok('탭을 옮기면 열린 창을 닫는다', /function navGo[\s\S]{0,200}closeAllNavModals\(\)/.test(cli));
ok('랭킹 창도 같이 닫는다', /function closeAllNavModals[\s\S]{0,300}closeLb\(\)/.test(cli));
// 홈은 무조건 홈 — 모드 고르는 창과 설명서도 같이 닫는다
ok('홈이면 모드 창·설명서도 닫는다',
   /function closeAllNavModals[\s\S]{0,200}closeModePanels\(\)[\s\S]{0,120}rulesClose\(\)/.test(cli));
ok('메뉴바 자리만큼 창 아래를 비운다', /body:not\(\.ingame\):not\(\.quad4\) \.lb-modal \{ padding-bottom/.test(htm));

// 탭 화면은 모두 전체화면 · 큰 닫기 버튼 없음
{
  const tabs = ['missionModal', 'shopModal', 'friendsModal', 'clanModal', 'lbModal', 'gachaModal'];
  ok('탭 창이 화면을 통째로 쓴다',
     /#missionModal, #friendsModal, #clanModal, #gachaModal,\s*\n\s*#soloModal, #multiModal \{[\s\S]{0,120}padding:0 0 var\(--tabgap/.test(htm)
     && /#shopModal \{ padding:0 0 var\(--tabgap/.test(htm)
     && /#lbModal \{ padding:0 0 var\(--tabgap/.test(htm));
  ok('메뉴바 자리는 로비에서만 비운다',
     /body:not\(\.ingame\):not\(\.quad4\) \{ --tabgap/.test(htm));
  ok('전체화면 틀이 있다', /\.lb-box\.tab-box \{[\s\S]{0,160}height:100%/.test(htm));
  ok('미션·친구·클랜에 그 틀을 붙였다',
     (htm.match(/class="lb-box(?: soc-box)? tab-box"/g) || []).length === 3);
  // 큰 "닫기" 버튼은 뺐다 — 아래 탭으로 오간다. 오른쪽 위 × 만 남긴다.
  for (const id of tabs) {
    const at = htm.indexOf('id="' + id + '"');
    const box = htm.slice(at, at + 4000);
    const end = box.indexOf('\n</div>');
    const body = end > 0 ? box.slice(0, end) : box;
    ok(id + ' 에 닫기 버튼이 없다', !/>닫기<\/button>/.test(body));
    ok(id + ' 에 × 가 있다', /class="close-x"/.test(body));
  }
}

// 1·2·3등 시상대
ok('시상대 자리가 목록 밖에 있다', /<div id="lbPodium"><\/div>\s*<div id="lbList">/.test(htm));
ok('2 · 1 · 3 순서로 세운다', /\[top\[1\], top\[0\], top\[2\]\]\.filter\(Boolean\)/.test(cli));
ok('얼굴·닉·칭호·급수·RP·메달을 담는다',
   ['pod-ava', 'pod-nick', 'pod-title', 'pod-grade', 'pod-rp', 'pod-medal'].every((c) => cli.includes(c)));
ok('칭호는 같은 함수로 그린다', /pod-title">\$\{titleTag\(p\.titleInfo\)/.test(cli));
ok('1등은 더 높고 크다', /\.pod-1 \.pod-ava \{[^}]*width:66px/.test(htm) && /\.pod-1 \.pod-stand \{[^}]*padding-top:22px/.test(htm));
ok('시상대에 올린 셋은 목록에서 뺀다', /r\.players\.slice\(3\)\.forEach/.test(cli));

// 전적에 RP · 친구 탭 대화
{
  const acc = read('accounts.js');
  // 랭크가 안 걸린 판은 0 이 아니라 아예 안 적는다 — 0 과 "해당 없음" 은 다르다
  ok('전적에 RP 를 남긴다', /\.\.\.\(rankable \? \{ rp \} : \{\}\)/.test(acc));
  ok('없는 판은 자리를 비운다', /typeof m\.rp === 'number'/.test(cli) && /hist-rp none/.test(cli));
  ok('오르내림을 색으로', /m\.rp >= 0 \? '#8fe0a0' : '#ff9aa8'/.test(cli));
}
ok('친구 줄에 대화 버튼', /onclick="friendTalk\('\$\{esc\(f\.idl\)\}','\$\{esc\(f\.nick\)\}'\)"/.test(cli));
ok('친구 탭에 대화 칸이 있다', /id="fpane-talk"/.test(htm) && /id="ftalkMsgs"/.test(htm));
ok('같은 통로를 쓴다', /friendTalk[\s\S]{0,400}apiPost\('\/api\/dm'/.test(cli)
   && /friendTalkSend[\s\S]{0,300}apiPost\('\/api\/dm-send'/.test(cli));
ok('상대 말이 바로 붙는다', /ftalkWith === from && ftalk/.test(cli));
ok('다른 탭으로 가면 대화 칸을 접는다', /function friendTab[\s\S]{0,600}talk\.style\.display = 'none'/.test(cli));
ok('안 읽은 수를 대화 버튼에 보여준다', /대화\$\{\s*gcUnread\[f\.idl\]/.test(cli));

// 시상대 메달·급수·칭호 자리 · 상위 100명 · 아래 탭 알림
ok('1·2·3 은 금·은·동 메달', /rankIco\(\['🥇', '🥈', '🥉'\]\[p\.no - 1\]\)/.test(cli) && /pod-medal/.test(htm));
ok('숫자 원판은 뺐다', !/pod-no/.test(cli) && !/\.pod-no \{/.test(htm));
// 급수는 글자만 — 아이콘을 붙이면 아래 등수 메달과 겹쳐 메달이 둘로 보인다
ok('급수를 보여준다', /pod-grade[^>]*>\$\{esc\(p\.rank\)\}<\/div>/.test(cli));
ok('칭호는 닉네임 바로 밑', /pod-nick[\s\S]{0,120}pod-title/.test(cli));
ok('칭호는 가운데', /\.pod-title \{[^}]*justify-content:center/.test(htm));
ok('랭킹은 100명까지', /topPlayers\(100\)/.test(srv) && /function topPlayers\(limit = 100\)/.test(read('accounts.js')));

ok('탭 알림을 한 곳에서 만든다', /function paintNavBadge/.test(cli) && /function navMark/.test(cli));
ok('그 탭을 보면 표시가 꺼진다', /function navGo[\s\S]{0,260}navSeen\(key\)/.test(cli));
ok('새 일이 생기면 다시 뜬다', /const left = \(navCount\[key\] \|\| 0\) - \(navSeenAt\[key\] \|\| 0\)/.test(cli));
ok('처리해서 줄면 기준도 내린다', /if \(n < \(navSeenAt\[key\] \|\| 0\)\) navSeenAt\[key\] = n;/.test(cli));
ok('옛 배지 요소는 걷어냈다', !/id="friendBadge"/.test(htm) && !/id="clanBadge"/.test(htm) && !/id="missionDot"/.test(htm));

// 친구가 다인전을 하고 있어도 관전할 수 있다
{
  const s4 = read('server4.js');
  const c4 = read('public/client4.js');
  ok('다인전에 관전 통로가 있다', /safe\(socket, 'g4_spectate'/.test(s4));
  ok('관전자에게도 상태를 보낸다', /for \(const sid of r\.specs \|\| \[\]\)/.test(s4));
  ok('관전자에게 손패는 안 보낸다', /function stateForSpec[\s\S]{0,200}st\.myHand = \[\];/.test(s4));
  ok('앉아 있는 사람은 관전이 아니다', /r\.seats\.some\(\(s\) => s\.sid === socket\.id\)\) return;/.test(s4));
  ok('친구 목록이 다인전도 알려준다', /watchQuad: watchable \? false : !!w4/.test(srv));
  ok('어느 문을 두드릴지 가른다', /if \(quad\) socket\.emit\('g4_spectate'/.test(cli));
  ok('관전 중에는 못 고른다', /if \(iAmSpec\) pickMode = null;/.test(c4));
  ok('관전 중에는 버튼을 감춘다', /body\.q-spec #q-confirm/.test(htm));
  ok('나갈 때 관전 명단에서 뺀다', /if \(q4Spec\) socket\.emit\('g4_spec_leave'\)/.test(c4)
     && /safe\(socket, 'g4_spec_leave'/.test(s4));
}

// 클랜에 들어도 다른 클랜을 볼 수 있다
ok('클랜 탭에 "다른 클랜" 이 있다', /clanViewTab\('browse'\)/.test(cli) && /id="clanPaneBrowse"/.test(cli));
ok('세 칸을 순서대로 칠한다', /const order = \['chat', 'info', 'browse'\]/.test(cli));
ok('우리 클랜을 표시한다', /우리 클랜<\/span>/.test(cli));
ok('거기서는 가입 신청을 안 받는다', !/clanPaneBrowse[\s\S]{0,900}clanApply/.test(cli));

// 관전 통로 문단속
{
  const s4 = read('server4.js');
  ok('아무 방 번호나 못 붙는다', /Object\.prototype\.hasOwnProperty\.call\(rooms4, id\)/.test(s4));
  ok('혼자 하는 판은 관전 대상이 아니다', /if \(r\.solo\) return socket\.emit\('g4_error'/.test(s4));
  ok('관전 인원에 한도가 있다', /r\.specs\.length >= 10/.test(s4));
}
ok('안 쓰는 배경음 원본은 뺐다', !fs.existsSync(path.join(__dirname, '..', 'public', 'bgm.mp3')));

// 방 만들기에도 TWELVE 가 있어야 한다 — 모드가 넷이 됐다
ok('대기실에 TWELVE 칸', /data-m="twelve" onclick="roomMode\('twelve'\)"/.test(htm));
ok('넷이라 두 줄로 편다', /\.wc-modes \{ display:grid; grid-template-columns:1fr 1fr/.test(htm));
ok('서버가 twelve 를 받는다', /\['item', 'classic', 'quad', 'twelve', 'mini', 'random'\]\.includes\(mode\)/.test(srv)
   && /room\.mode === 'twelve'\) \{ tvStart/.test(srv));
// 랜덤이 붙어 여섯이 됐다 — 모드가 아니라 '고르지 않기' 지만 이름표는 필요하다
ok('모드 이름표가 여섯 다 있다', /MODE_NAME = \{ classic: '클래식', item: '아이템전', twelve: 'TWELVE', quad: '다인전', mini: '미니게임', random: '랜덤' \}/.test(cli));
ok('랜덤은 시작할 때 정해진다', /if \(room\.mode === 'random'\) \{[\s\S]{0,240}const picked = pickRankedMode\(\);/.test(srv)
   && /roomSpin = true;/.test(srv));
ok('랜덤에 다인전은 안 들어간다', /const RANKED_MODES = \['classic', 'item', 'twelve'\];/.test(srv));
// 목록에서도 무슨 판인지 보인다
ok('방 목록이 모드를 함께 보낸다', /mode: r\.mode \|\| 'classic'/.test(srv));
ok('목록에 모드 딱지를 붙인다', /rl-mode m-\$\{esc\(r\.mode\)\}/.test(cli) && /\.rl-mode \{/.test(htm));
ok('클래식에는 안 붙인다', /r\.mode !== 'classic'/.test(cli));

// 탭을 옮길 때 한 번 덮었다 걷는다 — 창이 통째로 갈리는 순간을 가려 준다
ok('덮개가 있다', /id="fadeVeil"/.test(htm) && /#fadeVeil \{[\s\S]{0,160}opacity:0; pointer-events:none/.test(htm));
ok('덮은 동안은 손가락도 막는다', /#fadeVeil\.on \{ opacity:1; pointer-events:auto; \}/.test(htm));
// 가리는 것이 목적이지 뜸을 들이는 게 아니다 — 눈에 안 걸릴 만큼만 짧게
ok('덮개는 아주 짧다', /transition:opacity \.08s linear/.test(htm) && /\}, 85\);/.test(cli));
ok('탭 이동이 덮개를 거친다', /function navGo\(key\)[\s\S]{0,200}veil\(\(\) => \{/.test(cli));
ok('새 화면을 그린 뒤에 걷는다', /requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(cli));
ok('넘어가는 중에 또 눌러도 안 엉킨다', /if \(veilBusy\) \{ fn\(\); return; \}/.test(cli));

// 창 제목의 × 가 바로 아래 큰 버튼과 손가락 자리를 다투지 않게
ok('× 가 제목 줄 안에 선다', /#soloModal \.lb-title \.close-x, #multiModal \.lb-title \.close-x \{[\s\S]{0,120}margin-left:auto/.test(htm));
ok('제목 줄이 한 줄을 차지한다', /#soloModal \.lb-title, #multiModal \.lb-title \{[\s\S]{0,140}width:100%; min-height:48px/.test(htm));
// 이름이 겹치는 랭킹 줄 규칙이 창 제목까지 줄여 버렸다 — 그래서 × 가 제자리를 잃었다
ok('랭킹 줄 규칙은 랭킹 줄에만', /@media \(max-width:420px\) \{ \.lb-row \.lb-title \{ max-width:30%/.test(htm));

// 화면이 통째로 스크롤되면 안 된다.
// 로비가 출렁이면 주소창이 들락날락하고, 바닥에 붙인 메뉴바가 같이 흔들린다.
ok('페이지 자체는 안 움직인다', /body \{ position:fixed; inset:0; width:100%; overflow:hidden; \}/.test(htm));
ok('넘치면 로비 안에서만 흐른다', /#lobby \{ max-height:100%; overflow-y:auto; overscroll-behavior:contain; \}/.test(htm));
// 대기실에서는 큰 로고가 자리만 먹는다
ok('대기실에서 로고를 접는다', /body\.waiting #lobby \.logo, body\.waiting \.logo-actions \{ display:none; \}/.test(htm));
ok('대기실 표시를 건다', (cli.match(/classList\.add\('waiting'\)/g) || []).length === 2);
ok('낮은 화면에서는 카드도 줄인다', /@media \(max-height:700px\) \{[\s\S]{0,200}#waitCard \{ gap:8px/.test(htm));

// 판을 버리고 나가면 진 것으로 남아야 한다.
// 여태 사람끼리 붙은 판만 몰수패로 남기고 AI전·트웰브는 아무 기록도 안 남겼다 —
// 지고 있으면 나가 버리면 그만이었다.
ok('나가기·끊김을 한 곳에서 다룬다', /function abandonIfLive\(roomId, slot\)/.test(srv));
ok('AI전도 남긴다', !/if \(g && g\.phase !== 'game_over' && !room\.vsBot && slot !== -1\)/.test(srv));
ok('나가기에서 부른다', /if \(slot !== -1 && abandonIfLive\(roomId, slot\)\)/.test(srv));
ok('끊겨서 방이 지워지기 전에도 부른다',
   /abandonIfLive\(roomId, slot\);\s*\n\s*if \(room\.graceTimer\)/.test(srv));
ok('트웰브도 남긴다', /room\.tv && !room\.tv\.over && !room\.tvDone[\s\S]{0,200}tvFinish\(roomId\)/.test(srv));
ok('튜토리얼은 전적에 안 남긴다', /if \(room\.tutorial\) return false;/.test(srv));

console.log('\n⑫ 대기실 — 짧은 화면에서도 시작·나가기가 보인다');
// 모드가 다섯이 되면서 카드가 556px 까지 자랐다. 화면이 짧으면 위아래가 잘리는데
// 하필 아래가 '시작'·'나가기' 라, 방에 갇힌 것처럼 보였다.
ok('카드를 화면 안에 묶는다',
   /#waitCard \{[\s\S]{0,760}max-height:calc\(var\(--app-h, 100vh\) - 96px - 72px - var\(--safe-b\)\);/.test(htm));
ok('가운데만 스크롤한다', /#waitCard \.wc-scroll \{[\s\S]{0,200}overflow-y:auto;/.test(htm)
   && /<div class="wc-scroll">/.test(htm) && /<\/div><!-- \/wc-scroll -->/.test(htm));
ok('시작·나가기는 바닥에 붙는다', /#waitCard \.wc-foot \{[\s\S]{0,180}flex-shrink:0;/.test(htm)
   && /<div class="wc-foot">[\s\S]{0,400}id="wcStart"[\s\S]{0,300}cancelWait\(\)/.test(htm));
// 스크롤되는 쪽에 시작·나가기가 들어가면 다시 같은 문제가 된다
ok('시작·나가기가 스크롤 안에 없다', (() => {
  const a = htm.indexOf('<div class="wc-scroll">');
  const b = htm.indexOf('</div><!-- /wc-scroll -->');
  const inner = htm.slice(a, b);
  return a > 0 && b > a && !/id="wcStart"/.test(inner) && !/cancelWait\(/.test(inner);
})());

console.log('\n⑬ 대기실에서도 홈은 홈이다');
// 예전엔 창만 닫혀서, 홈을 눌렀는데 대기실에 그대로 남아 갇힌 것처럼 보였다
ok('홈이 방에서 나가게 한다',
   /home:    \(\) => \{ closeAllNavModals\(\); if \(document\.body\.classList\.contains\('waiting'\)\) cancelWait\(true\); \},/.test(cli));
// '나가기' 는 다른 방을 고르려는 것이라 멀티 창을 다시 열지만, '홈' 은 홈이어야 한다
ok('홈으로 나가면 멀티 창을 안 연다',
   /function cancelWait\(toHome\)/.test(cli)
   && /if \(toHome\) \{ leaveWaitUI\(\); return; \}/.test(cli));
// 새로고침을 하면 배경음악이 끊겼다 다시 시작한다 — 방 하나 나왔을 뿐인데
// 화면이 통째로 갈리는 것으로 느껴진다. 홈으로 갈 때는 화면만 되돌린다.
ok('홈으로 나갈 때는 새로고침하지 않는다', /function leaveWaitUI\(\)/.test(cli)
   && /if \(toHome\) \{ leaveWaitUI\(\); return; \}[\s\S]{0,400}fastReload\(\);/.test(cli));
ok('화면을 제자리로 돌려놓는다',
   /function leaveWaitUI\(\)[\s\S]{0,420}waitCard'\)\.style\.display = 'none';[\s\S]{0,200}classList\.remove\('waiting'\);/.test(cli));

console.log('\n⑭ 대기실이 탭바 뒤로 내려가지 않는다');
// 위쪽 프로필 바와 아래쪽 탭바 자리를 안 비우면 나가기가 탭바 뒤로 숨는다
ok('위아래 자리를 비운다',
   /max-height:calc\(var\(--app-h, 100vh\) - 96px - 72px - var\(--safe-b\)\);/.test(htm));
ok('짧은 화면은 한 단계 더 조인다',
   /@media \(max-height:760px\)[\s\S]{0,200}max-height:calc\(var\(--app-h, 100vh\) - 72px - 66px - var\(--safe-b\)\);/.test(htm));
ok('바닥 버튼 폭을 줄였다',
   /#waitCard \.wc-foot \.btn \{ width:100%; padding-top:9px; padding-bottom:9px; \}/.test(htm));
ok('나가기 버튼은 예전 그대로', /onclick="cancelWait\(\)"/.test(htm));

console.log(`결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
