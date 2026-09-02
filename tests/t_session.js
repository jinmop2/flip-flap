// 로그인이 저절로 풀리지 않아야 한다.
//
// 무슨 일이 있었나:
//   서버는 DB 를 다 읽기 전에 이미 요청을 받는다(loadFromDB 를 await 하지 않는다).
//   렌더 무료 요금제는 놀다가 깨어나므로, 깨어나는 동안 들어온 첫 /api/me 가
//   그 틈에 닿는 일이 잦다. 그때 서버가 "세션 만료" 라고 답했고, 화면은 그 말을
//   믿고 localStorage 의 로그인을 지웠다 — 멀쩡한 계정이 접속할 때마다 풀렸다.
//
// 그래서 두 겹으로 막는다:
//   서버 — 아직 못 읽었으면 "만료" 가 아니라 "준비 중"(503) 이라고 답한다.
//   화면 — 200 이 아닌 답은 '무효다' 가 아니라 '지금은 모른다' 로 보고 토큰을 지킨다.
//
// 로그인을 지우는 건 되돌릴 수 없다. 애매하면 지키는 쪽이 맞다.
const fs = require('fs');
const path = require('path');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const cli = fs.readFileSync(path.join(__dirname, '..', 'public/client.js'), 'utf8');
const acc = fs.readFileSync(path.join(__dirname, '..', 'accounts.js'), 'utf8');
const sw  = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 서버는 준비되기 전에 "만료" 라고 답하지 않는다');
{
  ok('준비됐는지 물어볼 수 있다', /function storeReady\(\) \{ return !pool \|\| dbReady; \}/.test(acc));
  ok('storeReady 를 내보낸다', /storeInfo, storeReady,/.test(acc));
  ok('/api/me 가 준비 전이면 503 을 준다',
     /app\.post\('\/api\/me'[\s\S]{0,400}!accounts\.storeReady\(\)[\s\S]{0,200}status\(503\)/.test(srv));
  ok('503 에는 다시 오라는 표시가 붙는다',
     /app\.post\('\/api\/me'[\s\S]{0,400}retry: true/.test(srv));
  ok('소켓 인사도 준비 전이면 게스트로 확정 짓지 않는다',
     /socket\.on\('auth'[\s\S]{0,300}!accounts\.storeReady\(\)[\s\S]{0,80}auth_retry/.test(srv));
  // DB 를 다 읽기 전에 듣기 시작하는 구조 자체는 그대로 둔다(듣기를 늦추면 깨어나는
  // 시간이 그만큼 길어진다). 대신 그 틈을 답으로 내보내지 않는 것이 위 장치들이다.
  ok('DB 로드는 여전히 비동기다 (그래서 위 장치가 필요하다)',
     /if \(pool\) loadFromDB\(\);/.test(acc) && !/await loadFromDB\(\)/.test(acc));
}

console.log('② 화면은 확실할 때만 로그인을 지운다');
{
  ok('200 이 아니면 표시를 남긴다', /if \(!r\.ok\) \{ j\.httpFail = true; j\.status = r\.status; \}/.test(cli));
  ok('연결 실패·HTTP 실패면 지우지 않는다',
     /if \(!\(r\.netFail \|\| r\.httpFail\)\) \{ localStorage\.removeItem\('ff_auth'\); return; \}/.test(cli));
  ok('몇 번 더 물어본다', /const naps = \[0, 700, 1500, 3000\];/.test(cli));
  ok('되살아나면 소켓에도 계정을 다시 붙인다',
     /restoreSession[\s\S]{0,900}if \(socket\.connected\) socket\.emit\('auth', \{ token: tk \}\);/.test(cli));
  ok('서버가 다시 오라 하면 다시 인사한다', /socket\.on\('auth_retry'/.test(cli));

  // 되돌릴 수 없는 일이므로, 토큰을 지우는 곳은 넷뿐이어야 한다:
  // 스스로 로그아웃 · 계정 삭제 · 서버가 분명히 거부 · 운영자가 정지.
  // (정지는 서버가 토큰을 이미 끊은 뒤라, 화면에 남겨 두면 '세션 만료' 만 반복된다)
  const spots = (cli.match(/removeItem\('ff_auth'\)/g) || []).length;
  ok('토큰을 지우는 자리는 넷뿐', spots === 4, spots + '곳');
  ok('그중 하나는 정지 통보다', /socket\.on\('banned'[\s\S]{0,400}removeItem\('ff_auth'\)/.test(cli));
}

console.log('③ 깨어나는 동안 옛 화면에 갇히지 않는다');
{
  // 판 번호를 그대로 박아 두면 올릴 때마다 이 시험을 고쳐야 한다.
  // 정작 중요한 건 "판이 있고, 판이 바뀌면 옛 캐시를 버린다" 는 쪽이다.
  const ver = (sw.match(/const VER = '(ff-v\d+)';/) || [])[1];
  ok('서비스워커에 캐시 판이 있다', !!ver, ver || '못 찾음');
  ok('판이 바뀌면 옛 캐시를 버린다',
     /keys\.filter\(k => k !== VER\)\.map\(k => caches\.delete\(k\)\)/.test(sw));
  ok('5xx 면 캐시로 물러난다', /res\.status >= 500[\s\S]{0,140}caches\.match/.test(sw));
  ok('API·소켓은 여전히 캐시하지 않는다', sw.includes('socket.io|api|auth|health'.replace('socket.io','socket\\.io')));
}

console.log('\n' + (fail ? '✗ ' + fail + '개 실패' : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
