// 진동 — 안드로이드(플레이 앱 포함)에서만 되는 기능이다.
// 아이폰 사파리에는 통로 자체가 없어서, 없는 기기에서는 조용히 아무 일도
// 안 일어나야 하고 설정 줄도 보이면 안 된다(눌러도 아무 일 없는 스위치는
// 고장으로 보인다).
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cli = read('public/client.js'), htm = read('public/index.html');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 통로');
ok('진동 함수가 있다', /function vibe\(kind\)/.test(cli));
ok('없는 기기에서는 조용히 지나간다', /try \{ if \(navigator\.vibrate\) navigator\.vibrate\(p\); \} catch \(_\) \{\}/.test(cli));
// 손대기 전 진동은 브라우저가 막고 콘솔에 오류를 남기므로 같은 줄에서 걸러낸다
ok('끄면 안 울린다', /if \(vibeOff \|\| !userTouched\) return;/.test(cli));
ok('사람이 손대기 전엔 안 울린다', /let userTouched = false;/.test(cli)
   && /\{ once: true, capture: true \}/.test(cli));
ok('설정에 남는다', /localStorage\.setItem\('ff_vibe'/.test(cli) && /localStorage\.getItem\('ff_vibe'\) === 'off'/.test(cli));
ok('기본은 켜짐', !/ff_vibe'\) !== 'on'/.test(cli));

console.log('\n② 설정 줄');
ok('설정 패널에 있다', /id="spVibeRow" onclick="toggleVibe\(\)"/.test(htm) && /id="togVibe"/.test(htm));
ok('안 되는 기기에서는 줄을 감춘다', /vr\.style\.display = canVibe\(\) \? '' : 'none'/.test(cli));
ok('켤 때 한 번 느껴 본다', /if \(!vibeOff\) vibe\('tap'\)/.test(cli));

console.log('\n③ 울리는 자리 — 짧고 드물게');
for (const k of ['tap', 'turn', 'win', 'lose', 'got', 'warn'])
  ok(`${k} 가 표에 있다`, new RegExp('\\n  ' + k + ':').test(cli));
ok('내 차례', /if \(mine && !prevMyAction\) vibe\('turn'\)/.test(cli));
ok('트웰브 내 차례', /tvPrev\.active !== v\.me && v\.active === v\.me\) vibe\('turn'\)/.test(cli));
ok('승리·패배', /playSound\('victory'\); vibe\('win'\)/.test(cli) && /playSound\('defeat'\); vibe\('lose'\)/.test(cli));
ok('트웰브 승리·패배', /vibe\('win'\);\s*\n\s*title\.textContent = '🏆 승리!'/.test(cli) && /vibe\('lose'\);/.test(cli));
ok('낙찰', /if \(iWon\) vibe\('got'\)/.test(cli));
ok('시간 경고', /playSound\('bell'\); vibe\('warn'\)/.test(cli) && /tvSfx\('hourglass'\); vibe\('warn'\)/.test(cli));
// 매 손짓마다 울리면 그 순간부터 성가신 기능이 된다
ok('손패를 만질 때마다 울리지 않는다', !/onTap\([^)]*vibe\(/.test(cli));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
