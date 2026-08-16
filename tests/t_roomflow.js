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

console.log(`결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
