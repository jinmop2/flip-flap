// 다인전 "한 판 더" — 사람들과 하던 판이 끊기지 않는가.
// 예전엔 이 단추가 솔로를 열어서 같이 하던 사람들과 그냥 헤어졌다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const srv = fs.readFileSync(src + '/server4.js', 'utf8');
const cli = fs.readFileSync(src + '/public/client4.js', 'utf8');
const htm = fs.readFileSync(src + '/public/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

console.log('① 단추가 솔로로 안 샌다');
ok('단추가 q4Again 을 부른다', /id="q-again"[^>]*onclick="q4Again\(\)"/.test(htm));
ok('예전처럼 바로 솔로를 열지 않는다', !/onclick="q4Start\(\)">한 판 더/.test(htm));
ok('멀티였으면 재대결을 보낸다',
   /q4Again[\s\S]{0,300}if \(!q4WasMulti\) return window\.q4Start\(\)[\s\S]{0,200}socket\.emit\('g4_rematch'\)/.test(cli));
ok('멀티였는지는 서버가 알려 준 값으로 안다', /q4WasMulti = !d\.solo/.test(cli));

console.log('\n② 서버가 자리를 지키는가');
ok('재대결을 받는다', /safe\(socket, 'g4_rematch'/.test(srv));
ok('솔로 방은 해당 없음', /if \(!r \|\| r\.solo\) return;/.test(srv));
ok('끝난 판에서만 된다', /r\.game\.phase !== 'game_over'\) return;/.test(srv));
ok('AI 자리는 못 누른다', /mine\.isBot \|\| mine\.left\) return;/.test(srv));
// 나간 사람을 기다리면 한 명이 창을 닫는 것으로 나머지가 영영 못 한다
ok('나간 사람은 안 기다린다', /!s\.isBot && !s\.left && s\.sid/.test(srv));
ok('다 누르면 같은 인원으로 새 판', /startRoom\(here\.map[\s\S]{0,60}r\.seats\.length\)/.test(srv));
ok('옛 방은 멈춘다', /r\.dead = true;\s*\/\/ 옛 방의 시계·감시를 멈춘다/.test(srv));
// 소켓이 끊겼다 붙으면 id 가 바뀐다 — 옛 id 로 emit 하면 아무에게도 안 간다
ok('바뀐 소켓 id 를 다시 잇는다', /mine\.sid = socket\.id;/.test(srv));

console.log('\n③ 몇 명이 눌렀는지 보이는가');
ok('남이 누르면 알려 준다', /emit\('g4_rematch_wanted', \{ ready, of: here\.length \}\)/.test(srv));
ok('화면이 그 수를 적는다', /markRematch\(\(d && d\.ready\)/.test(cli));
ok('내가 누르면 기다리는 중', /markRematch\(0, 0, '기다리는 중…'\)/.test(cli));
ok('단추가 스스로 말한다', /#q-again\.wanted/.test(htm));
ok('새 판이 시작되면 표시가 지워진다', /q4RematchOn = false; markRematch\(0, 0\)/.test(cli));

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
