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
ok('가로에서는 격자로 편다', /body\.land\.ingame #game \{[\s\S]{0,700}grid-template-areas:"opp center pad" "mine mine mine"/.test(htm));
ok('좌우 칸 폭이 같다', /grid-template-columns:minmax\(120px, 21%\) 1fr minmax\(120px, 21%\)/.test(htm));
// !important 를 무조건 걸면 로비에서 꺼 둔 판까지 되살아난다 — .ingame 을 같이 건다
ok('판 안에서만 격자로 바꾼다', /body\.land\.ingame #game \{[\s\S]{0,40}display:grid !important/.test(htm));
ok('미니게임에는 가로 크기를 안 씌운다', /body\.land #mini \{[^}]*zoom:1/.test(htm));
// 줄에 같이 세우면 세 덩어리가 함께 가운데로 몰려 경매대가 밀린다 — 왼쪽 끝에 붙인다
ok('덱과 턴 표시는 가운데 칸 왼쪽 끝에',
   /body\.land #deckStack \{ position:absolute; left:4px/.test(htm) && /body\.land #turnInfo \{ position:absolute; left:4px/.test(htm));
ok('가로 설계 크기가 따로 있다', /LAND_W = 940, LAND_H = 520/.test(cli));
ok('눕히고 높이가 좁을 때만 쓴다', /vw > vh \* 1\.15 && vh < 760/.test(cli));
ok('듣던 음악 유지 토글은 없앴다', !/toggleKeepAudio/.test(htm) && !/togKeep/.test(htm));
ok('밖의 음악에 자동으로 양보한다', /yieldToOtherAudio/.test(cli));
// 접힌 상태를 저장하지 않는다 — 새로고침하면 늘 다시 시도한다
ok('양보를 저장하지 않는다', !/ff_yield/.test(cli) && /let keepOtherAudio = false/.test(cli));
ok('한 번 나온 뒤에 멈춰야 양보한다', /if \(played && bgmOn/.test(cli));
ok('막히면 다음 손짓마다 다시 시도한다', /function armKick/.test(cli) && /addEventListener\(t, kick, true\)/.test(cli));

// 알림·관전·손패 탭·랭킹
ok('로비 탭바 배지에 안 읽은 메시지를 얹는다', /function paintSocialBadges/.test(cli) && /gcClanUnread/.test(cli));
ok('메시지가 오면 로비 배지도 다시 칠한다', /gcPaintDot[\s\S]{0,400}paintSocialBadges\(\)/.test(cli));
ok('친구 목록에 관전 버튼', /watchFriend\('\$\{esc\(f\.watch\)\}'\)/.test(cli));
ok('관전은 서버에 spectate 로 붙는다', /socket\.emit\('spectate'/.test(cli));
ok('시계는 탭을 삼키지 않는다', /#mebar \.timer[^}]*pointer-events:none/.test(htm));
ok('겹치는 자리에서 손패가 이긴다', /#myHand \{[^}]*z-index:8/.test(htm));
ok('랭킹은 전체화면', /\.lb-box\.rank-box \{[\s\S]{0,120}height:100dvh/.test(htm));

// 랭크게임 · 빠른 입장 · 코드 로그인 제거
ok('RP 는 랭크게임에서만', /noRank: !room\.ranked/.test(srv));
ok('랭크 표시는 무작위 매칭에서만 붙는다',
   (srv.match(/ranked: true/g) || []).length === 2 && !/ranked: true[\s\S]{0,200}quick_join/.test(srv));
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
   !/q4Quick/.test(cli) && /\['classic', 'item', 'quad'\]\.includes\(mode\)/.test(srv));
ok('빠른 입장이 자리 남은 방을 찾는다', /n > 0 && n < capOf\(r\)/.test(srv));
ok('다인전 빠른 입장 방 이름이 있다', /다인전 빠른 입장/.test(srv));
ok('코드 로그인은 화면에서 사라졌다', !/코드로 시작/.test(htm) && !/codeLogin/.test(htm) && !/submitCode/.test(cli));

// 다인전 = 자리 늘리기
ok('방마다 자리 수가 있다', /function capOf\(room\)[\s\S]{0,80}'quad' \? 4 : 2/.test(srv));
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
  ok('상대 손패 위 자리를 비운다', /\n {4}#oppZone \{ padding-top:72px/.test(htm));
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
ok('다인전도 화면이 안 움직인다', /body\.ingame, body\.quad4 \{[^}]*position:fixed/.test(htm));
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

console.log(`결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
