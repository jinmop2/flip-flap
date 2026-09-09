// 배경음악 — "나오고 있다" 고 믿으면서 소리는 안 나는 상태에 빠지지 않는가.
//
// 웹오디오는 그래프가 잠들어 있으면(state !== 'running') 소리를 한 톨도 안
// 내보낸다. 그런데 <audio> 는 자기 딴에 재생 중이라고 답한다. 그래서 play() 가
// 성공했다는 이유로 "손짓 기다리기" 를 풀어 버리면, 그 뒤로 아무리 눌러도
// 음악이 안 나오는 채로 굳는다 — 코드는 나온다고 믿는다.
//
// 실제로 그렇게 죽는 길: 매칭이 잡혀 서버 신호로 판이 열린다(손짓이 아니다)
// → resume 이 거절된다 → play() 는 성공한다 → 기다리기가 풀린다 → 끝.
// 효과음이 켜져 있으면 playSound 가 매번 resume 을 불러 저절로 살아나는데,
// 꺼 둔 사람은 그 길마저 없다(playSound 는 sfxOff 에서 먼저 돌아간다).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('① 그래프가 깨어 있는지를 본다');
ok('깨어 있는지 묻는 자리가 있다', /const audioAwake = \(\) => AC\.state === 'running';/.test(cli));
// 여기가 이 시험의 핵심이다. armKick(false) 로 되돌아가면 그 버그가 되살아난다.
ok('재생 성공만으로 기다리기를 풀지 않는다',
   /el\.play\(\)\.then\(\(\) => \{ armKick\(!audioAwake\(\)\); \}\)/.test(cli));
ok('재생 실패면 당연히 기다린다', /\.catch\(\(\) => \{ armKick\(true\); \}\)/.test(cli));

console.log('\n② 어떤 손짓에서든 깨어난다');
ok('깨우는 자리가 있다', /function wakeAudio\(\)/.test(cli));
ok('이미 깨어 있으면 아무것도 안 한다', /function wakeAudio\(\) \{\s*\n\s*if \(audioAwake\(\)\) return;/.test(cli));
ok('세 손짓 모두에 걸려 있다',
   /for \(const t of \['pointerdown', 'keydown', 'touchend'\]\)\s*\n\s*document\.addEventListener\(t, wakeAudio, true\);/.test(cli));
// 효과음을 꺼 둔 사람에게는 playSound 가 아니라 이 길만 남는다
ok('효과음과 무관한 길이다', !/function wakeAudio[\s\S]{0,300}sfxOff/.test(cli));
ok('깨어나면 멈춰 있던 곡도 되살린다', /if \(bgmOn && bgmAudio && bgmAudio\.paused\) bgmAudio\.play\(\)/.test(cli));
// 다른 앱에 갔다 오면 그래프가 잠든 채로 돌아오기도 한다
ok('돌아왔을 때도 깨운다', /visibilitychange[\s\S]{0,60}wakeAudio\(\)/.test(cli));

console.log('\n③ 다음에 또 이러면 한 줄로 알 수 있는가');
ok('상태를 밖에서 볼 수 있다', /window\.__bgm = \(\) => \(\{[^}]*ac: AC\.state/.test(cli));

console.log('\n④ 예전 함정이 안 남아 있다');
// resume() 은 프로미스라 try/catch 로는 거절이 안 잡힌다 — .catch 가 붙어 있어야 한다
  ok('playSound 는 여전히 resume 을 부른다', /if \(sfxOff\) return;[\s\S]{0,220}AC\.resume\(\)\.catch\(\(\) => \{\}\)/.test(cli));
  ok('resume 거절이 콘솔에 안 쌓인다', (cli.match(/AC\.resume\(\)(?!\.catch|\.then)/g) || []).length === 0);
ok('음악을 끈 사람에게는 안 만든다', /if \(bgmOff\) return;/.test(cli));

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
