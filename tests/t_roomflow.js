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
ok('가로 화면은 세로 프레임 안에 넣는다', /@media \(orientation:landscape\)[\s\S]{0,400}--frame-w/.test(htm));
ok('프레임이 너무 좁아지지 않는다', /max\(340px/.test(htm));
ok('듣던 음악 유지 토글은 없앴다', !/toggleKeepAudio/.test(htm) && !/togKeep/.test(htm));
ok('밖의 음악에 자동으로 양보한다', /yieldToOtherAudio/.test(cli));
ok('양보는 이번 접속 동안만', /sessionStorage[\s\S]{0,40}ff_yield/.test(cli));

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
ok('빠른 입장 방은 랭크 방을 안 집는다', /!r\.ranked/.test(srv));
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
ok('다인전 빠른 입장은 다인전 대기방으로', /mode === 'quad'[\s\S]{0,80}q4Quick/.test(cli));
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
     order.join(',') === 'soloPlay,soloPlay,soloPlay,startItemGame,q4Start,q4Start', order.join(','));
}

// 파편 상점 · 방에서 나가면 멀티 창으로
ok('교환소에 상자 테두리가 없다', /#gcPaneExch #gcShop \{[^}]*background:none/.test(htm));
ok('지갑이 제목 줄 밖으로 나왔다',
   /<div class="gc-wallet">/.test(htm) && !/class="lb-title"[^>]*>\s*<span><span data-ico="🎁"/.test(htm));
ok('방을 나오면 멀티 창으로 돌아온다',
   /ff_openmulti/.test(cli) && /openMode\('multi'\)/.test(cli));

console.log(`결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
