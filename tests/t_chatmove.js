// 판 위의 채팅창 · 이모트 장착.
//
// 제보 ①: "이모티콘 장착하는데 적용 안 되는 경우가 많아"
//   myAccount 는 스물네 군데에서 바뀌는데 refreshEmotes 는 두 군데에서만 불렀다.
//   로그인 경로가 빠져 있어, 산 이모트가 새로고침 한 번에 사라졌다.
//   부르는 자리를 늘리면 다음에 또 빠뜨린다 — 목이 하나인 곳에서 부른다.
//
// 제보 ②: "게임하면서 채팅하고 싶으니까 창을 띄워 놓고 옮길 수 있게"
//   판을 가리는 창이라 옮길 수 있어야 하고, 화면 밖으로 나가면 안 된다.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  ' + x : ''))); };

console.log('① 이모트는 프로필을 따라온다');
{
  // 목이 하나인 곳 = renderAccount. 프로필이 바뀌면 반드시 여기를 지난다.
  ok('renderAccount 끝에서 부른다',
     /function renderAccount\(\)[\s\S]*?try \{ refreshEmotes\(\); \} catch \(_\) \{\}\n\}/.test(cli));
  // 스물네 군데에 흩어 놓지 않았는지 — 흩으면 언젠가 또 빠진다
  const calls = (cli.match(/refreshEmotes\(\)/g) || []).length;
  ok('부르는 자리가 몇 안 된다', calls <= 5, `${calls}곳`);
  ok('가진 팩만 붙인다', /if \(!myAccount \|\| !myAccount\.items\) return;/.test(cli)
     && /if \(!myAccount\.items\[pack\]\) continue;/.test(cli));
  // 붙일 때마다 옛 것을 걷어야 두 번 안 붙는다
  ok('두 번 안 붙는다', /picker\.querySelectorAll\('\.emote-extra'\)\.forEach\(b => b\.remove\(\)\)/.test(cli));
  // 그림으로 그린 이모트는 보낼 때와 누를 때가 같아야 한다
  ok('팩도 기본과 같은 꼴로', /b\.className = 'emo-b emote-extra'/.test(cli));
}

console.log('\n② 채팅창을 옮길 수 있다');
{
  ok('잡을 손잡이가 있다', /<span class="gcx-grip"/.test(htm));
  ok('손잡이가 눈에 보인다', /\.gcx-grip::before \{/.test(htm) && /cursor:grab/.test(htm));
  // 손가락으로도 끌려야 한다. touch-action 을 안 끄면 화면이 같이 움직인다.
  ok('손가락 끌기를 막지 않는다', /\.gcx-grip \{[\s\S]{0,240}touch-action:none/.test(htm));
  ok('마우스·손가락 둘 다', /grip\.addEventListener\('mousedown', down\)/.test(cli)
     && /grip\.addEventListener\('touchstart', down, \{ passive: false \}\)/.test(cli));
  // 탭·× 위에서 끌면 그 단추가 안 눌린다 — 그래서 손잡이를 따로 뒀다
  ok('닫기 단추는 그대로', /<button class="gcx-close" onclick="toggleGameChat\(false\)">×<\/button>/.test(htm));
}

console.log('\n③ 화면 밖으로 안 나간다');
{
  ok('가두는 셈이 있다', /function gcClamp\(el, x, y\)/.test(cli));
  ok('오른쪽·아래를 막는다', /const maxX = Math\.max\(0, window\.innerWidth - w\)/.test(cli)
     && /const maxY = Math\.max\(0, window\.innerHeight - h\)/.test(cli));
  ok('왼쪽·위도 막는다', /Math\.min\(Math\.max\(0, x\), maxX\)/.test(cli));
  // 폰을 돌리거나 작은 기기로 바꾸면 기억한 자리가 화면 밖일 수 있다
  ok('화면이 바뀌면 다시 가둔다', /addEventListener\('resize', \(\) => \{ if \(gameChatOpen\(\)\) gcRestorePos\(\); \}\)/.test(cli));
}

console.log('\n④ 옮긴 자리를 기억한다');
{
  ok('자리를 남긴다', /localStorage\.setItem\('ff_chatpos'/.test(cli));
  ok('열 때 되찾는다', /function gcRestorePos\(\)/.test(cli)
     && /gcRestorePos\(\);   \/\/ 지난번에 옮겨 둔 자리로/.test(cli));
  ok('되찾을 때도 가둔다', /function gcRestorePos\(\)[\s\S]{0,400}gcClamp\(el, p\.x, p\.y\)/.test(cli));
}

console.log('\n⑤ 끌기를 놓을 때 창이 안 튄다');
{
  // 등장 연출이 창에 직접 걸려 있으면, 끌기용 규칙이 걷히는 순간 연출이
  // 처음부터 다시 돌아 창이 30px 튀어 오른다. 실제로 그랬다.
  ok('연출이 창에 직접 안 걸려 있다',
     !/#gameChat \{[\s\S]{0,400}animation:slideDown/.test(htm));
  ok('연출은 딱지로', /#gameChat\.intro \{ animation:slideDown/.test(htm));
  ok('열 때 한 번만 붙였다 뗀다', /p\.classList\.add\('intro'\)/.test(cli)
     && /setTimeout\(\(\) => p\.classList\.remove\('intro'\), 260\)/.test(cli));
}

console.log('');
if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
console.log(`✓ 전부 통과 (${pass}/${pass})`);
