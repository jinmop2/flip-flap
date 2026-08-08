// 뽑기 연출.
//
// 뽑는 맛은 "결과를 알기 전의 긴장" 에서 나온다. 예전엔 등급이 확정된 카드가
// 그냥 나타나서 아무 긴장이 없었다. 순서를 ①구슬 ②뒷면 ③한 장씩 뒤집기 로
// 바꿨고, 그게 도로 풀리지 않게 못 박는다.
//
// 화면 움직임 자체는 눈으로 봐야 알지만, 아래는 코드로 잡을 수 있다.
const fs = require('fs');
const root = __dirname + '/..';
const html = fs.readFileSync(root + '/public/index.html', 'utf8');
const cli = fs.readFileSync(root + '/public/client.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 카드가 뒤집히는 구조인가');
{
  ok('앞뒤 두 면이 있다', /class="gc-face gc-back"/.test(cli) && /class="gc-face gc-front"/.test(cli));
  ok('3D 로 뒤집는다', /\.gc-inner\s*\{[^}]*preserve-3d/.test(html));
  ok('뒷면이 안 비친다', /\.gc-face\s*\{[^}]*backface-visibility:\s*hidden/.test(html));
  ok('사파리용 접두사도 있다', /-webkit-backface-visibility/.test(html));
  ok('앞면이 뒤집힌 채 시작', /\.gc-front\s*\{[^}]*rotateY\(180deg\)/.test(html));
  ok('flipped 로 뒤집힌다', /\.gc-item\.flipped \.gc-inner\s*\{[^}]*rotateY\(180deg\)/.test(html));
  ok('처음엔 안 뒤집힌 채로 깔린다', /el\.className = 'gc-item t-'/.test(cli) && !/gc-item flipped/.test(cli));
  // 두 면이 겹치려면 높이가 고정이어야 한다. 내용에 따라 늘면 카드가 어긋난다.
  ok('카드 높이가 고정', /\.gc-item\s*\{[^}]*height:\s*\d+px/.test(html));
}

console.log('\n② 결과보다 긴장이 먼저 오는가');
{
  ok('구슬(대기 연출)이 있다', /class="gc-orb/.test(cli) && /\.gc-orb\s*\{/.test(html));
  ok('이번 판 최고 등급을 먼저 계산한다', /const top = results\.reduce/.test(cli));
  ok('그 색으로 구슬을 물들인다', /hint-\$\{topName\}/.test(cli));
  for (const t of ['rare', 'epic', 'legend'])
    ok(`hint-${t} CSS`, new RegExp('\\.gc-orb\\.hint-' + t + '\\s*\\{').test(html));
  ok('전설이면 더 오래 끈다', /top >= 3 \? 1100/.test(cli));
  ok('전설이면 문구가 다르다', /무언가 온다/.test(cli));
}

console.log('\n③ 등급이 높을수록 크게 터지는가');
{
  for (const t of ['rare', 'epic', 'legend'])
    ok(`pop-${t} CSS`, new RegExp('\\.gc-item\\.pop-' + t + '\\s*\\{').test(html));
  ok('오라 CSS', /\.gc-item\.lit \.gc-aura\s*\{/.test(html));
  ok('전설은 화면이 번쩍', /function gcFlash/.test(cli) && /\.gc-flash\s*\{/.test(html));
  ok('번쩍임은 스스로 사라진다', /f\.remove\(\)/.test(cli));
  ok('전설만 번쩍인다', /rank >= 3\) gcFlash\(\)/.test(cli));
  // 등급별로 기다리는 시간이 달라야 "전설이 나왔다" 는 느낌이 산다
  const m = cli.match(/gcWait\(rank >= 3 \? (\d+) : rank >= 2 \? (\d+) : (\d+)\)/);
  ok('등급별 여운이 다르다', !!m && +m[1] > +m[2] && +m[2] > +m[3], m ? m.slice(1).join('/') : '못 찾음');
  ok('등급별 소리가 다르다', /rank >= 3 \? 'setwin'/.test(cli));
}

console.log('\n④ 지루해지지 않게 넘길 수 있는가');
{
  ok('넘기기 함수', /function skipGachaReveal/.test(cli));
  ok('누르면 넘어간다', /addEventListener\('pointerdown', skipGachaReveal\)/.test(cli));
  ok('끝나면 리스너를 뗀다', /removeEventListener\('pointerdown', skipGachaReveal\)/.test(cli));
  ok('뽑을 때마다 초기화', /_skipReveal = false/.test(cli));
  ok('넘기면 기다리지 않는다', /if \(_skipReveal.*\) continue;/.test(cli));
  ok('넘기기 안내가 뜬다', /gc-skip/.test(cli) && /\.gc-skip\s*\{/.test(html));
  ok('안내는 다 보면 사라진다', /skip\.remove\(\)/.test(cli));
  ok('1장일 땐 안내를 안 띄운다', /results\.length > 1 && !_skipReveal/.test(cli));

  // 실제로 밟은 것: 연출 도중에 창을 닫아도 루프가 계속 돌아서,
  // 닫힌 뒤에 화면이 번쩍이고 소리가 났다.
  ok('창이 열렸는지 묻는 함수', /function gachaOpen/.test(cli));
  ok('닫기가 연출을 끊는다', /function closeGacha\(\)[\s\S]{0,120}skipGachaReveal\(\)/.test(cli));
  ok('뒤집기 중에도 닫힘을 본다', /_skipReveal \|\| !gachaOpen\(\)/.test(cli));
  ok('기다리는 중에도 닫힘을 본다', /!_skipReveal && gachaOpen\(\)/.test(cli));
}

console.log('\n⑤ 밟기 쉬운 것들');
{
  // wait 같은 흔한 이름을 전역에 두면 다른 스크립트와 부딪친다
  ok('흔한 전역 이름을 안 쓴다', !/^const wait =/m.test(cli), 'const wait 가 전역에 있다');
  ok('gcWait 로 지었다', /const gcWait =/.test(cli));

  // 오라가 카드 밖으로 번지므로 가로가 넘치면 스크롤바가 생긴다
  ok('가로 넘침 차단', /\.gc-stage\s*\{[^}]*overflow-x:\s*hidden/.test(html));

  // 연출이 끝나기 전에 또 누르면 두 번 돌아간다
  ok('중복 실행 차단', /if \(_gachaBusy \|\| !myAccount\) return/.test(cli));
  ok('실패해도 버튼이 살아난다', /finally \{[\s\S]{0,200}one\.disabled = ten\.disabled = false/.test(cli));

  // 움직임을 줄여 달라는 설정을 존중한다
  ok('모션 줄이기 배려', /prefers-reduced-motion[\s\S]{0,300}\.gc-item/.test(html));

  // 이름은 서버가 준 값이다. 그대로 넣으면 HTML 로 샌다.
  ok('이름을 escape 한다', /esc\(g\.name\)/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
