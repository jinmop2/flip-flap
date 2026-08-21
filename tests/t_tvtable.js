// 트웰브 보드게임 연출 — 테이블 위에는 판(덱·경매대·칩·전리품)만 올라간다.
// 손패는 손에 든 것이니 테이블 밖이어야 하고, 배경은 방바닥이어야 한다.
// 이 구분이 무너지면 화면이 다시 '한 덩어리 판때기'로 돌아간다.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cli = read('public/client.js'), htm = read('public/index.html');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 테이블 판');
ok('테이블 요소가 있다', /<div id="tv-table"><\/div>/.test(htm));
ok('두툼한 가죽 레일이 둘러 있다', /#tv-table \{[\s\S]{0,900}0 0 0 22px #2b1d13/.test(htm));
ok('위아래가 둥근 판이다', /#tv-table \{[^}]*border-radius:46% \/ 20%/.test(htm));
ok('레일 윗면에 빛이 있다', /#tv-table::before \{[\s\S]{0,200}inset:-23px/.test(htm));
ok('펠트 천이다', /#tv-table \{[^}]*var\(--felt\)/.test(htm));
ok('켜질 때만 보인다', /#tv-table\.on \{ opacity:1; \}/.test(htm));
ok('탭을 먹지 않는다', /#tv-table \{[^}]*pointer-events:none/.test(htm));
ok('구역들이 테이블보다 위에 있다', /#tv-oppZone, #tv-centerZone, #tv-myZone \{ position:relative; z-index:1; \}/.test(htm));

console.log('\n② 무엇이 테이블 위에 오르나');
const lay = cli.slice(cli.indexOf('function tvLayTable'), cli.indexOf('function tvLayTable') + 1800);
// 좌우는 판 위에 놓인 것들로, 위아래는 앉은 사람 사이로 잡는다.
ok('가로는 덱·경매대·레일로 잰다', /const wide = \['tv-deck', 'tv-mat', 'tv-rail'\]/.test(lay));
ok('빈 더미에 휘둘리지 않는다', /r\.width > 0/.test(lay));

console.log('\n③ 손패는 테이블 밖');
ok('레일 두께를 알고 있다', /const RAIL = 25;/.test(lay));
// 놓인 것만 감싸면 판이 아래로 쏠려 위가 휑하게 빈다 — 두 사람 사이를 통째로 쓴다
ok('위아래는 앉은 사람 사이를 다 쓴다',
   /const myTop = seatEdge\('tv-mySeat', 'tv-myHand', Math\.min\)/.test(lay)
   && /const oppBottom = seatEdge\('tv-oppSeat', 'tv-oppHand', Math\.max\)/.test(lay)
   && /let top = oppBottom != null \? oppBottom \+ RAIL \+ 2/.test(lay)
   && /let bottom = myTop != null \? myTop - RAIL - 2/.test(lay));
// 덱·경매품은 테이블 한가운데 — 아래 문구 칸 때문에 저절로는 위로 쏠린다
ok('판 위 물건을 테이블 한가운데로', /function tvCenterBoard\(top, bottom\)/.test(cli)
   && /tvCenterBoard\(top, bottom\);/.test(cli));
ok('상자가 아니라 카드 칸을 가운데 맞춘다',
   /const mat = document\.getElementById\('tv-center'\) \|\| document\.getElementById\('tv-mat'\)/.test(cli));
ok('테이블을 잡은 뒤에 맞춘다 — 서로 물고 흔들리지 않게',
   cli.indexOf('table.classList.add(\'on\');') < cli.indexOf('tvCenterBoard(top, bottom);'));
ok('레일이 화면 밖으로 안 잘린다', /left = Math\.max\(left, host\.left \+ RAIL \+ 2\)/.test(lay)
   && /right = Math\.min\(right, host\.right - RAIL - 2\)/.test(lay));
// 레일이 지나갈 틈이 없으면 전리품이 테이블 밖으로 밀려난다
ok('전리품과 손패 사이에 레일 자리가 있다', /#tv-myAcq \{ margin-bottom:34px; \}/.test(htm) && /#tv-oppAcq \{ margin-top:34px; \}/.test(htm));

console.log('\n④ 배경은 어두운 방, 바깥은 검정');
ok('트웰브 배경이 어두운 방이다', /#tv \{[^}]*#241a14/.test(htm));
ok('바깥은 완전한 검정으로 마감한다', /#070403 74%, #000 100%\)/.test(htm)
   && /background-color:#000;/.test(htm));
ok('테이블 둘레만 빛이 든다', /#tv::after \{[\s\S]{0,320}radial-gradient\(ellipse 76% 56% at 50% 46%/.test(htm));
ok('어둠은 바닥에만 얹힌다 — 카드는 안 먹는다', /#tv::after \{[\s\S]{0,320}z-index:0;/.test(htm)
   && /#tv::after \{[\s\S]{0,120}pointer-events:none/.test(htm));

console.log('\n⑤ 가운데 네모 박스는 없다');
ok('경매대에 배경도 테두리도 없다', /#tv-mat \{[\s\S]{0,420}background:none; border:0; box-shadow:none;/.test(htm));

console.log('\n⑥ 버튼은 한 번에 눌린다 (아이폰에서 새던 길)');
// 아이폰은 버튼 위의 손가락도 스크롤로 채 간다. 그러면 pointerup 도 click 도
// 없이 pointercancel 만 남고 누름이 통째로 사라진다.
ok('버튼 위에서는 훑어 넘기기를 잠근다', /el\.style\.touchAction = 'none';/.test(cli));
ok('채여 간 누름도 받는다 \(onPress\)', /el\.addEventListener\('pointercancel', fire\);/.test(cli));
ok('제자리에서 채였을 때만 받는다 \(onTap\)', /el\.addEventListener\('pointercancel', \(\) => \{[\s\S]{0,120}if \(near\(\)\) fire\(\);/.test(cli));
ok('click 도 마지막 보루로 받는다', /el\.addEventListener\('click', \(e\) => \{\s*\n\s*if \(Date\.now\(\) - doneAt < 700\) return;/.test(cli)
   && /el\.addEventListener\('click', fire\);/.test(cli));
ok('두 번 먹지 않는다', /const fire = \(e\) => \{ doneAt = Date\.now\(\); fn\(e\); \};/.test(cli)
   && /if \(now - last < 350\) return;/.test(cli));
ok('손가락이 조금 흘러도 탭이다', /const TAP_SLOP = 16;/.test(cli));
ok('터치에는 포인터 캡처를 안 건다', /if \(e\.pointerType === 'mouse'\) \{ try \{ el\.setPointerCapture/.test(cli));
// 트웰브 버튼만 다른 길을 쓰고 있었다 — 2인전과 같은 길로 맞춘다
ok('경매 방식 버튼이 2인전과 같은 길을 쓴다', /b\.textContent = label; onPress\(b, fn\);/.test(cli));
ok('배팅 액수 버튼도 같은 길', /onPress\(minus, \(\) =>/.test(cli) && /onPress\(plus,  \(\) =>/.test(cli));
ok('덱·은행을 카드 줄에 맞춘다', /fix\(deck, stack\);/.test(cli) && /fix\(rail, bank\);/.test(cli));

// 진짜 원인은 겹침이었다. 세로가 짧은 기기(아이폰 사파리는 아래 툴바 때문에
// 745px 쯤 된다)에서 내 칸이 위로 올라와 경매 버튼을 통째로 덮었다 —
// 측정하니 391 표본 중 121/121 이 가려져 아예 못 누르는 상태였다.
// 내 칸은 DOM 뒤라 같은 z-index 에서 가운데 칸 위에 얹힌다.
ok('칸의 빈 자리는 손가락을 통과시킨다',
   /#tv-oppZone, #tv-myZone \{ pointer-events:none; \}/.test(htm)
   && /#tv-oppZone > \*, #tv-myZone > \* \{ pointer-events:auto; \}/.test(htm));
ok('손패 줄의 여백도 통과시킨다',
   /#tv-myHand, #tv-oppHand, #tv-myAcq, #tv-oppAcq, #tv \.tv-say \{ pointer-events:none; \}/.test(htm)
   && /#tv-myHand \.fan-slot, #tv-myHand \.card \{ pointer-events:auto; \}/.test(htm));
ok('안내 문구가 손패를 덮지 않는다', /#tv-status \{ pointer-events:none; \}/.test(htm));

console.log('\n⑦ 다시 그릴 때마다 맞춘다');
ok('정렬 끝에 테이블을 깐다', /tvLayTable\(\);   \/\/ 줄을 맞춘 뒤라야/.test(cli));
ok('나가면 테이블을 치운다', /tv-table'\)[\s\S]{0,80}classList\.remove\('on'\)/.test(cli));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
