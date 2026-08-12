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
  // 예전엔 시작부터 최고 등급 색이었다(결과를 미리 알려 줬다). 이제는
  // 계단을 밟아 올라가며 그 단계의 색을 입는다.
  ok('올라간 단계의 색을 입는다', /orb\.classList\.add\('hint-' \+ name\)/.test(cli));
  for (const t of ['rare', 'epic', 'legend'])
    ok(`hint-${t} CSS`, new RegExp('\\.gc-orb\\.hint-' + t + '\\s*\\{').test(html));
  ok('전설이면 더 오래 끈다', /top >= 3 \? 900 : 520/.test(cli));
  ok('전설이면 문구가 다르다', /무언가 온다/.test(cli));
}

console.log('\n③ 등급이 높을수록 크게 터지는가');
{
  for (const t of ['rare', 'epic', 'legend'])
    ok(`pop-${t} CSS`, new RegExp('\\.gc-item\\.pop-' + t + '\\s*\\{').test(html));
  ok('오라 CSS', /\.gc-item\.lit \.gc-aura\s*\{/.test(html));
  ok('전설은 화면이 번쩍', /function gcFlash/.test(cli) && /\.gc-flash\s*\{/.test(html));
  ok('번쩍임은 스스로 사라진다', /f\.remove\(\)/.test(cli));
  ok('전설만 번쩍인다', /rank >= 3\) \{ gcFlash\(\)/.test(cli));
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
  ok('1장일 땐 안내를 안 띄운다', /shown\.length > 1 && !_skipReveal/.test(cli));

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

console.log('\n⓪ 순서·승급 연출');
{
  // 구슬이 처음부터 최고 등급 색이면 뽑기 전에 결과를 알려 준다.
  // 밑에서부터 한 계단씩 올라가야 기대할 시간이 생긴다.
  ok('계단식 충전 함수', /async function gcCharge/.test(cli));
  ok('0부터 최고까지 올라간다', /for \(let step = 0; step <= top; step\+\+\)/.test(cli));
  ok('올라갈 때마다 튀다', /orb\.classList\.add\('gc-step'\)/.test(cli));
  ok('튀는 움직임이 있다', /@keyframes gcStep/.test(html));
  ok('마지막 계단을 길게 끓다', /step === top \? \(top >= 3/.test(cli));

  // 서버 순서 그대로 뒤집으면 첫 장에 전설이 나와 나머지가 소화 경기가 된다
  ok('좋은 것을 뒤로 미룬다', /function gcRevealOrder/.test(cli));
  ok('등급 오름차순', /\(a\.r - b\.r\) \|\| \(a\.i - b\.i\)/.test(cli));
  ok('보여주는 차례만 바꿄다', /const shown = gcRevealOrder\(results\)/.test(cli));

  // 전설 전용 연출은 아껴 써야 멀미가 안 난다
  ok('흔들림과 광선', /function gcQuake/.test(cli) && /function gcRay/.test(cli));
  ok('전설에만 쓴다', /rank >= 3\) \{ gcFlash\(\); gcRay\(\); gcQuake/.test(cli));
  ok('흔들림 CSS', /@keyframes gcQuake/.test(html) && /@keyframes gcRay/.test(html));

  // 열 장을 다 훑지 않아도 뭐를 얻었는지 보여 준다
  ok('요약 줄', /function gcSummary/.test(cli) && /\.gc-sum \{/.test(html));
  ok('요약은 원래 결과로 센다', /gcSummary\(results\)/.test(cli));

  // 움직임을 줄인 사람에게는 새 연출도 끄진다
  ok('움직임 줄이기를 따른다', /\.gc-quake, \.gc-ray, \.gc-sum,/.test(html));
}

console.log('\n⑩ 카드백 미리보기 크기');
{
  // 카드백 미리보기는 .card 를 같이 달고 나온다. 클래스 하나짜리로 써 두면
  // 뒤에 오는 .card(70×98) 에 밀려 뽑기·교환소에서 이름을 덮었다.
  ok('.card 를 붙여 이긴다', /\.card\.shop-cbprev \{/.test(html));
  ok('클래스 하나짜리가 남아있지 않다', !/\n    \.shop-cbprev \{ width:38px/.test(html));
  ok('아이콘 칸 크기를 따로 준다', /\.gi-ico \.card\.shop-cbprev \{[^}]*width:28px/.test(html));
  ok('칸 밖으로 못 나가게 막는다', /\.gi-ico > \* \{ max-width:100%/.test(html));
  // 카드백만이 아니라 같은 길로 들어오는 다른 미리보기도 같이 재둔다
  for (const c of ['shop-cfprev', 'shop-tblprev', 'shop-npprev', 'shop-avaprev'])
    ok(`${c} 도 칸에 맞췄다`, new RegExp(`\\.gi-ico \\.${c} \\{`).test(html));
}

console.log('\n⑪ 눌러서 먼저 열기');
{
  // 순서를 기다리는 게 답답하다는 얼궜다. 궁금한 걸 먼저 열 수 있게 한다.
  ok('한 장 뒤집기 함수', /function gcFlipOne/.test(cli));
  ok('이미 뒤집힌 건 그대로 둔다', /el\.classList\.contains\('flipped'\)\) return false/.test(cli));
  ok('카드마다 누를 수 있다', /el\.onclick = \(\) => gcFlipOne\(el, g\)/.test(cli));
  // 자동 차례와 손으로 누르는 걸 두 벌로 나누면 한쪽에만 연출이 붙는다
  ok('자동 차례도 같은 길을 쓴다', /if \(!gcFlipOne\(el, g\)\) continue/.test(cli));
  ok('넣기기면 나머지를 조용히 뒤집는다', /gcFlipOne\(els\[i\], shown\[i\], true\)/.test(cli));

  // 카드를 눌렀는데 전체가 넘어가면 한 장 열기가 무의미해진다
  ok('카드 클릭은 전체 넘기기가 아니다', /closest\('\.gc-item'\)\) return/.test(cli));
  ok('안내 문구도 바뀌었다', /카드를 누르면 먼저 열려요/.test(html) || /카드를 누르면 먼저 열려요/.test(cli));

  // 눌러도 된다는 표시 — 다시 그리지 않는 opacity 로만 움직여야 한다
  ok('누를 수 있다는 표시', /\.gc-item\.gc-tap \{/.test(html));
  ok('깜빡임은 opacity 만', /@keyframes gcTapHint \{ 0%,100% \{ opacity:0; \} 50% \{ opacity:1; \} \}/.test(html));
  ok('box-shadow 를 깜빡이지 않는다', !/@keyframes gcTapHint[\s\S]{0,160}?box-shadow:/.test(html));
  ok('무늬 부분(::after)과 안 부딪친다', /\.gc-item\.gc-tap \.gc-back::before \{/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
