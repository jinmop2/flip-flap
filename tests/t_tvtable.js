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
ok('테이블 요소가 있다', /<div id="tv-table">/.test(htm));
ok('두툼한 가죽 레일이 둘러 있다', /#tv-table, #game-table \{[\s\S]{0,900}0 0 0 22px #2b1d13/.test(htm));
ok('위아래가 둥근 판이다', /#tv-table, #game-table \{[^}]*border-radius:46% \/ 20%/.test(htm));
ok('레일 윗면에 빛이 있다', /#tv-table::before, #game-table::before \{[\s\S]{0,200}inset:-23px/.test(htm));
ok('펠트 천이다', /#tv-table, #game-table \{[^}]*var\(--felt\)/.test(htm));
ok('켜질 때만 보인다', /#tv-table\.on, #game-table\.on \{ opacity:1; \}/.test(htm));
ok('탭을 먹지 않는다', /#tv-table, #game-table \{[^}]*pointer-events:none/.test(htm));
ok('구역들이 테이블보다 위에 있다', /#tv-oppZone, #tv-centerZone, #tv-myZone \{ position:relative; z-index:1; \}/.test(htm));

console.log('\n② 무엇이 테이블 위에 오르나');
const lay = cli.slice(cli.indexOf('function layTable(cfg)'), cli.indexOf('function layTable(cfg)') + 2400);
// 좌우는 판 위에 놓인 것들로, 위아래는 앉은 사람 사이로 잡는다.
// 판은 하나의 셈을 두 모드가 나눠 쓴다 — 트웰브에서 맞춘 것이 2인전에서 어긋나면 안 된다
ok('두 판이 같은 셈을 쓴다', /function tvLayTable\(\) \{\s*\n\s*layTable\(\{/.test(cli)
   && /function gameLayTable\(\) \{/.test(cli));
ok('가로는 덱·경매대·레일로 잰다', /const wide = cfg\.wide\.map\(rect\)/.test(lay)
   && /wide: \['tv-deck', 'tv-mat', 'tv-rail'\]/.test(cli)
   && /wide: \['deckStack', 'auctionMat', 'g-rail'\]/.test(cli));
ok('빈 더미에 휘둘리지 않는다', /r\.width > 0/.test(lay));

console.log('\n③ 손패는 테이블 밖');
ok('레일 두께를 알고 있다', /const RAIL = 25;/.test(lay));
// 사람은 가죽 레일에 걸터앉는다 — 자리를 통째로 판 밖에 내보내면 그만큼 판이
// 짧아져 가로로만 두꺼운 납작한 판때기가 된다. 손에 든 패는 여전히 판 밖이다.
ok('자리 한가운데를 판 끝으로 잡는다',
   /const seatMid = \(id\) =>/.test(lay)
   && /let top = oppMid != null \? oppMid :/.test(lay)
   && /let bottom = myMid != null \? myMid :/.test(lay));
ok('그래도 손패는 판 밖에 남는다',
   /if \(oppHandB != null\) top = Math\.max\(top, oppHandB \+ 4\);/.test(lay)
   && /if \(myHandT != null\) bottom = Math\.min\(bottom, myHandT - 4\);/.test(lay));
ok('좌우는 바짝 붙인다 — 가로로 두꺼우면 납작해 보인다', /const padX = 10;/.test(lay));
// 덱·경매품은 테이블 한가운데 — 아래 문구 칸 때문에 저절로는 위로 쏠린다
ok('판 위 물건을 테이블 한가운데로', /function centerBoard\(zoneId, midId, top, bottom\)/.test(cli)
   && /centerBoard\(cfg\.zone, cfg\.mid, top, bottom\);/.test(cli));
ok('상자가 아니라 카드 칸을 가운데 맞춘다', /mid: 'tv-center'/.test(cli) && /mid: 'auctionItems'/.test(cli));
ok('테이블을 잡은 뒤에 맞춘다 — 서로 물고 흔들리지 않게',
   cli.indexOf('table.classList.add(\'on\');') < cli.indexOf('centerBoard(cfg.zone'));
ok('레일이 화면 밖으로 안 잘린다', /left = Math\.max\(left, h\.left \+ RAIL \+ 2\)/.test(lay)
   && /right = Math\.min\(right, h\.right - RAIL - 2\)/.test(lay));
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

// 부채꼴로 눕힌 카드는 제 칸 아래로 삐져나온다 — 그만큼 안 띄우면
// 상대 카드가 프로필을 깔고 앉는다(실제로 6장 전부 겹쳐 있었다).
ok('상대 카드가 프로필을 안 깔고 앉는다',
   /#tv-oppSeat \{ margin-top:16px;/.test(htm) && /#game #oppSeat \{ margin-top:16px; margin-bottom:10px; \}/.test(htm));
// 이름과 손패가 붙어 있으면 이름표가 카드에 얹힌 것처럼 보인다
ok('이름과 손패 사이가 떠 있다', /#tv-mySeat \{ margin-bottom:14px; \}/.test(htm) && /#game \.tv-seat \{ margin-bottom:14px; \}/.test(htm));

console.log('\n⑤-2 레일은 한 줄로 반듯하게');
// 다섯 칸이 제 내용 길이대로 가운데 정렬되면 20 과 8 이 서로 다른 자리에 서서
// 삐뚤어 보인다. 폭을 맞춰 한 줄로 세운다.
ok('레일 칸의 폭을 맞춘다', /#tv-rail > \* \{ width:100%; box-sizing:border-box; justify-content:center; \}/.test(htm));
ok('은행도 제 폭을 고집하지 않는다', !/#tv-bank \{ width:/.test(htm) && !/#tv-bank \{ width:50px/.test(htm));
// 가진 칩과 건 칩은 다른 이야기다
ok('가진 칩과 건 칩 사이를 벌린다',
   /#tv-rail #tv-oppChips \{ margin-bottom:8px; \}/.test(htm)
   && /#tv-rail #tv-myChips \{ margin-top:8px; \}/.test(htm));
// 상대 칩만 옆으로 밀려 판 밖으로 삐져나가던 옛 값
ok('상대 칩만 옆으로 밀지 않는다', !/#tv-oppChips \{ margin-left:30px; \}/.test(htm));

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

console.log('\n⑥-1 회전하면 판을 다시 잰다');
// 판 높이는 --app-h 에 매여 있고 그 값은 다른 처리에서 뒤늦게 들어온다.
// 그 자리에서 바로 재면 가로에서 세로로 돌아올 때 아직 가로 높이가 박혀 있어
// 자리가 다 눌린 채로 잡힌다 — 실제로 테이블이 336x82 로 납작해졌다.
ok('한 프레임 뒤와 한 박자 더 뒤에 잰다', /function scheduleRelayout\(\) \{[\s\S]{0,260}requestAnimationFrame[\s\S]{0,200}setTimeout\(relayoutBoards, 260\)/.test(cli));
ok('가로↔세로 두 갈래 모두에서 부른다',
   (cli.match(/scheduleRelayout\(\);/g) || []).length >= 3);
ok('화면 높이가 바뀌면 같이 잰다', /if \(typeof scheduleRelayout === 'function'\) scheduleRelayout\(\);/.test(cli));
ok('회전은 값이 늦게 확정되니 여러 번 잰다', /for \(const t of \[50, 250, 600\]\) setTimeout\(fitBoard, t\);/.test(cli));

console.log('\n⑥-2 가로 모드는 예전 그대로');
// 가로는 배치가 통째로 다르다(왼쪽 상대 · 가운데 판 · 아래 손패). 세로용
// 테이블을 그대로 얹으면 판이 한쪽에 쏠린 작은 타원이 된다 — 실제로 그랬다.
ok('가로에서는 테이블을 안 그린다', /body\.land #game-table, body\.land #tv-table \{ display:none; \}/.test(htm));
ok('가로에서는 화면 전체가 펠트', /body\.land #game, body\.land #tv \{[\s\S]{0,200}var\(--felt\)/.test(htm));
ok('가로에서는 자리 재기를 건너뛴다',
   /if \(document\.body\.classList\.contains\('land'\)\) \{\s*\n\s*table\.classList\.remove\('on'\);/.test(cli));
// 세로에서 밀어 둔 자리를 안 풀면 돌린 뒤에도 판이 그만큼 밀린 채로 남는다
ok('밀어 둔 자리도 푼다', /const z = document\.getElementById\(cfg\.zone\); if \(z\) z\.style\.transform = '';/.test(cli));
ok('낸 카드는 가운데 줄에 나란히', /body\.land #g-rail \{ position:static;/.test(htm));

// 트웰브와 2인전이 같은 조각(.tv-menuWrap/.tv-menuBtn/.tv-menu)을 쓴다.
// 선택자만 클래스로 바꾸고 마크업에 클래스를 안 달면, 규칙이 통째로 안 걸려
// 메뉴가 늘 펼쳐진 채로 뜬다 — 실제로 그랬다.
ok('두 판 모두 메뉴 조각에 클래스가 달려 있다',
   /<div class="tv-menuWrap" id="tv-menuWrap">/.test(htm)
   && /<button class="tv-menuBtn" id="tv-menuBtn"/.test(htm)
   && /<div class="tv-menu" id="tv-menu">/.test(htm)
   && /<div class="tv-menuWrap" id="g-menuWrap">/.test(htm)
   && /<button class="tv-menuBtn" id="g-menuBtn"/.test(htm)
   && /<div class="tv-menu" id="g-menu">/.test(htm));

// 네 판이 같은 메뉴를 쓴다 — 한 군데만 바꾸면 나머지가 옛 모습으로 남는다
ok('모든 판이 줄 세 개 아이콘 하나로', ['tv', 'g', 'q', 'mn'].every((k) =>
  new RegExp(`<div class="tv-menuWrap" id="${k}-menuWrap">`).test(htm)
  && new RegExp(`<button class="tv-menuBtn" id="${k}-menuBtn"`).test(htm)
  && new RegExp(`<div class="tv-menu" id="${k}-menu">`).test(htm)));
ok('옛 조작바는 남아 있지 않다',
   !/id="tv-controls"/.test(htm) && !/id="controls"/.test(htm)
   && !/id="q-controls"/.test(htm) && !/id="miniControls"/.test(htm));
ok('네 개 다 바깥을 누르면 닫힌다',
   /\['q-menu', '#q-menuWrap', qMenu\], \['mn-menu', '#mn-menuWrap', mnMenu\]/.test(cli));

console.log('\n⑦ 다시 그릴 때마다 맞춘다');
ok('정렬 끝에 테이블을 깐다', /tvLayTable\(\);   \/\/ 줄을 맞춘 뒤라야/.test(cli));
ok('나가면 테이블을 치운다', /tv-table'\)[\s\S]{0,80}classList\.remove\('on'\)/.test(cli));

console.log('\n⑧ 자리는 프로필이 한가운데, 나머지는 양옆에 띄운다');
// 흐름에 두면 [아이템+프로필+시계] 세 덩이의 중앙이 중앙이 되어 얼굴이 밀린다.
ok('시계는 오른쪽에 띄운다', /\.tv-seat \.pc-timer \{ position:absolute; left:100%;/.test(htm));
ok('아이템 수는 왼쪽에 띄운다',
   /#oppItemBadge \{[\s\S]{0,320}position:absolute; right:100%;/.test(htm));
ok('둘 다 제 너비를 못 박는다',
   (htm.match(/width:max-content; white-space:nowrap;/g) || []).length >= 2);

console.log('\n⑨ 두 자리 등급(6-10)이 세로로 접히지 않는다');
// 6-10 은 "10" 두 글자에 ⚔ 표식까지 달려, 좁은 배팅 레일에서 칸이 모자라
// "1" 과 "0" 이 위아래로 접혔다. 접지 말고 줄이게 한다.
ok('등급 딱지는 줄바꿈 금지', /\.card \.c-rank \{[\s\S]{0,420}white-space:nowrap;/.test(htm));
ok('배팅 레일에선 딱지도 줄인다',
   /#g-rail \.bid-area \.card \.c-rank \{/.test(htm)
   && /#g-rail \.bid-area \.card \.c-rank\.two \{/.test(htm));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
