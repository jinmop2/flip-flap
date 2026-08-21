// 친구 1:1 채팅 — 새로 만든 기능이라 데이터 계층부터 굳힌다.
//
// 클랜 채팅과 같은 규칙(길이·도배·욕설·차단)을 쓰되, 저장 위치가 다르다.
// 각자 자기 기록을 갖는다 — 계정을 지우면 그 사람 쪽 기록이 같이 사라진다.
const fs = require('fs');
const dir = '/tmp/ffdm';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
const sleep = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };   // 도배 쿨다운 넘기기

const A = a.signup('dmalice', 'pw1234', '앨리스').token;
const B = a.signup('dmbob', 'pw1234', '바비').token;   // 닉은 2자 이상이어야 한다

console.log('① 친구끼리만');
{
  ok('친구가 아니면 못 읽는다', !!a.dmList(A, 'dmbob').error, JSON.stringify(a.dmList(A, 'dmbob')));
  ok('친구가 아니면 못 보낸다', !!a.dmSend(A, 'dmbob', '안녕').error);
  // 친구를 맺는다
  a.sendFriendReq(A, '바비');
  a.acceptFriendReq(B, 'dmalice');
  ok('친구가 되면 열린다', !!a.dmList(A, 'dmbob').ok, JSON.stringify(a.dmList(A, 'dmbob')));
  ok('자기 자신과는 못 한다', !!a.dmSend(A, 'dmalice', '혼잣말').error);
  ok('없는 사람과도 못 한다', !!a.dmSend(A, '없는사람', '안녕').error);
}

console.log('\n② 주고받기');
{
  const r = a.dmSend(A, 'dmbob', '안녕 밥');
  ok('보내진다', !!r.ok, JSON.stringify(r));
  ok('상대에게 전할 주소가 나온다', r.target === 'dmbob', String(r.target));

  const mine = a.dmList(A, 'dmbob');
  ok('내 쪽에 남는다', mine.messages.length === 1 && mine.messages[0].text === '안녕 밥');
  ok('내가 쓴 것으로 표시된다', mine.messages[0].mine === true);

  const theirs = a.dmList(B, 'dmalice');
  ok('상대 쪽에도 남는다', theirs.messages.length === 1 && theirs.messages[0].text === '안녕 밥');
  ok('상대에겐 남이 쓴 것', theirs.messages[0].mine === false);
  ok('상대 닉네임이 실려 온다', theirs.otherNick === '앨리스', theirs.otherNick);
}

console.log('\n③ 안 읽음');
{
  sleep(1300);
  a.dmSend(A, 'dmbob', '자니');
  const u = a.dmUnread(B);
  ok('안 읽은 개수가 센다', u.total >= 1, JSON.stringify(u));
  ok('누구에게서 왔는지도 안다', (u.by || {}).dmalice >= 1);
  // 보낸 쪽은 자기 글로 안 읽음이 늘면 안 된다
  ok('보낸 사람은 안 읽음이 안 는다', (a.dmUnread(A).by || {}).dmbob === undefined,
     JSON.stringify(a.dmUnread(A)));
  a.dmList(B, 'dmalice');                       // 열어 보면
  ok('열면 0 이 된다', a.dmUnread(B).total === 0, JSON.stringify(a.dmUnread(B)));
}

console.log('\n④ 클랜 채팅과 같은 방어');
{
  sleep(1300);
  ok('빈 내용은 거절', !!a.dmSend(A, 'dmbob', '   ').error);
  ok('욕설은 거절', !!a.dmSend(A, 'dmbob', '야 이 병신아').error);
  sleep(1300);
  const long = 'ㄱ'.repeat(300).replace(/ㄱ/g, '가');
  const r = a.dmSend(A, 'dmbob', long);
  ok('너무 길면 잘라서 저장', r.ok && r.msg.text.length <= 100, String(r.ok && r.msg.text.length));
  // 도배 — 바로 다음 것은 막힌다
  const quick = a.dmSend(A, 'dmbob', '연타');
  ok('연달아 보내면 막힌다', !!quick.error, JSON.stringify(quick));
}

console.log('\n⑤ 차단');
{
  sleep(1300);
  a.blockUser(B, 'dmalice', true);              // 밥이 앨리스를 차단
  const r = a.dmSend(A, 'dmbob', '차단 뒤 메시지');
  ok('보낸 쪽은 성공한 것처럼 보인다', !!r.ok);
  ok('상대에게 전하지 않는다', r.target === null, String(r.target));
  const theirs = a.dmList(B, 'dmalice');
  ok('차단한 사람 글은 안 보인다', !theirs.messages.some(m => m.text === '차단 뒤 메시지'));
  a.blockUser(B, 'dmalice', false);
}

console.log('\n⑥ 기록이 무한히 안 쌓인다');
{
  const src = fs.readFileSync(__dirname + '/../accounts.js', 'utf8');
  ok('대화당 보관 수 상한', /const DM_KEEP = \d+/.test(src));
  ok('대화 수 상한', /const DM_THREADS = \d+/.test(src));
  ok('오래된 대화부터 버린다', /function dmTrim/.test(src));
  // 실제로 잘리는지 — 상한을 넘겨 넣어 본다
  const u = a.byToken(A);
  const th = u.dm['dmbob'];
  for (let i = 0; i < 200; i++) th.msgs.push({ id: 'x' + i, idl: 'dmalice', nick: 'a', text: 't', at: Date.now() });
  sleep(1300);
  a.dmSend(A, 'dmbob', '마지막');
  ok('보관 수 안으로 잘린다', u.dm['dmbob'].msgs.length <= 60, String(u.dm['dmbob'].msgs.length));
}

console.log('\n⑦ 서버가 실어 나른다');
{
  const srv = fs.readFileSync(__dirname + '/../server.js', 'utf8');
  ok('읽기 API', /app\.post\('\/api\/dm'/.test(srv));
  ok('보내기 API', /app\.post\('\/api\/dm-send'/.test(srv));
  ok('안 읽음 API', /app\.post\('\/api\/dm-unread'/.test(srv));
  ok('상대에게 실시간 전달', /notifyIdl\(r\.target, 'dm'/.test(srv));
  ok('차단당했으면 안 보낸다', /if \(r\.target\) notifyIdl/.test(srv));
}

console.log('\n⑧ 인게임 채팅 화면');
{
  const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');
  const cli = fs.readFileSync(__dirname + '/../public/client.js', 'utf8');

  // 판을 나가지 않고도 얘기할 수 있어야 한다 — 두 판 모두 좌측 상단에서
  // 2인전 조작은 오른쪽 위 메뉴 하나로 접혔다 — 채팅은 그 안에 있다
  ok('2인전 조작바에 채팅 버튼',
     /id="g-menu"[\s\S]{0,600}?onclick="gMenu\(false\);toggleGameChat\(\)"/.test(html));
  ok('다인전 조작바에도 있다',
     /id="q-menu"[\s\S]{0,600}?onclick="qMenu\(false\);toggleGameChat\(\)"/.test(html));
  ok('패널은 하나만 둔다', (html.match(/id="gameChat"/g) || []).length === 1);
  ok('친구·클랜 두 탭', /data-gct="friend"/.test(html) && /data-gct="clan"/.test(html));

  // 판 위에 떠야 한다 — 다인전 판이 z 30 이라 그보다 위여야 보인다
  const z = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };
  ok('판보다 위에 뜬다', z(/#gameChat \{[^}]*z-index:(\d+)/) > z(/#game4 \{[^}]*z-index:(\d+)/),
     `${z(/#gameChat \{[^}]*z-index:(\d+)/)} vs ${z(/#game4 \{[^}]*z-index:(\d+)/)}`);

  ok('여닫는 함수', /window\.toggleGameChat = function/.test(cli));
  ok('탭 전환', /window\.gameChatTab = function/.test(cli));
  ok('보내기는 한 곳에서', /window\.gameChatSend = async function/.test(cli));
  ok('클랜이면 클랜 API 로', /clan\s*\n?\s*\? await apiPost\('\/api\/clan-chat-send'/.test(cli));
  ok('아니면 1:1 API 로', /await apiPost\('\/api\/dm-send'/.test(cli));
  // 보낸 걸 서버에서 다시 받아 그리면 느리게 느껴진다
  ok('보낸 건 바로 붙인다', /보낸 건 바로 붙인다/.test(cli));
  ok('새 메시지를 실시간으로 받는다', /socket\.on\('dm', /.test(cli));
  ok('클랜 메시지도 받는다', /socket\.on\('clan_chat'/.test(cli));
  ok('안 읽으면 버튼에 점', /function gcPaintDot/.test(cli) && /class="ctrl-dot"/.test(html));
  ok('로그인하면 안 읽음을 가져온다', /gcRefreshUnread\(\);\s*\/\/ 안 읽은/.test(cli));
}

// 인게임 채팅이 안 눌리던 것 — 이름이 겹친 CSS
// 뽑기 카드의 뒷면도 .gc-back, 채팅의 '목록으로'도 .gc-back 이었다.
// 뽑기 쪽 장식(::after, inset:7px)이 position:static 인 채팅 버튼에 붙어
// 채팅 창 전체를 덮었고, 입력칸·보내기 탭이 전부 그 버튼으로 들어갔다.
{
  const fs2 = require('fs'), path2 = require('path');
  const htm = fs2.readFileSync(path2.join(__dirname, '..', 'public/index.html'), 'utf8');
  ok('뽑기 뒷면 규칙은 카드 안으로 좁혔다',
     /\.gc-item \.gc-back \{ background:linear-gradient/.test(htm)
     && /\.gc-item \.gc-back::after \{ content:''; position:absolute; inset:7px/.test(htm));
  // 채팅 쪽 .gc-back 규칙은 남아도 된다 — 덮는 장식이 없어야 한다는 뜻이다
  ok('맨 이름으로 덮는 장식이 없다', !/\n\s*\.gc-back::after \{/.test(htm));
  ok('채팅 버튼은 자기 자리만 차지한다',
     /\n\s*\.gc-back \{ flex-shrink:0;[^}]*\}/.test(htm)
     && !/\n\s*\.gc-back \{[^}]*position:absolute/.test(htm));
  ok('채팅 목록 버튼은 그대로', /class="gc-back" onclick="gameChatBack\(\)"/.test(htm));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
