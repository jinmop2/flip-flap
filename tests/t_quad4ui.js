// 3·4인전 화면 — 덱 · 확정 버튼 · 스킨
//
// 여기 걸린 셋은 전부 "판에서 만져 봐야 아는" 것들이라 정적으로라도 못 박는다.
//   · 카드를 누르는 순간 바로 나가면, 서버 상태가 도착해 손패가 다시 그려지는
//     찰나에 탭이 통째로 사라진다 ("카드가 안 내진다")
//   · 상태가 올 때마다 손패 DOM 을 갈아엎으면 같은 일이 난다
//   · 다인전만 카드백·테이블·앞면 스킨을 안 입혀서 "산 게 적용이 안 된다"
const fs = require('fs');
const src = __dirname + '/..';
const c4 = fs.readFileSync(src + '/public/client4.js', 'utf8');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const accSrc = fs.readFileSync(src + '/accounts.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 고르기와 내기가 분리됐는가');
{
  ok('확정 버튼이 있다', html.includes('id="q-confirm"'));
  ok('버튼이 q4Confirm 을 부른다', /onclick="q4Confirm\(\)"/.test(html));
  ok('q4Confirm 이 정의돼 있다', /window\.q4Confirm = function/.test(c4));
  ok('고른 카드를 담아 둔다', /let sel4 = null/.test(c4));

  // 카드를 누를 때 바로 emit 하면 안 된다
  const onPick = c4.slice(c4.indexOf('onPick: (card) =>'), c4.indexOf('onPick: (card) =>') + 300);
  ok('누를 때는 고르기만 한다', !/emit\(/.test(onPick), onPick.slice(0, 90));
  ok('다시 누르면 해제된다', /sel4 && sel4\.id === card\.id\) \? null : card/.test(c4));

  // 내보내는 곳은 확정 한 곳뿐이어야 한다 (덱 뽑기는 별개)
  const emits = [...c4.matchAll(/emit\('g4_act', \{ type: ([^,}]+)/g)].map((m) => m[1].trim());
  ok('offer·bid 를 내보내는 곳은 확정뿐',
     emits.filter((e) => /offer|bid/.test(e)).length === 1, emits.join(' | '));

  // 연타로 두 번 나가면 안 된다
  const conf = c4.slice(c4.indexOf('window.q4Confirm'), c4.indexOf('window.q4Confirm') + 420);
  ok('연타 방어 — 보내기 전에 비운다', conf.indexOf('sel4 = null') < conf.indexOf('emit('),
     '비우기가 emit 뒤에 있다');
  ok('고른 게 없으면 아무 일도 없다', /if \(!curPick \|\| !sel4\) return/.test(c4));
}

console.log('\n② 손패를 필요할 때만 다시 만드는가');
{
  // 상태는 자주 온다. 매번 DOM 을 갈아엎으면 누르는 도중에 대상이 사라진다.
  ok('손패 지문을 만든다', /const handSig = /.test(c4));
  ok('바뀔 때만 다시 만든다', /if \(fx\.handSig !== handSig\)/.test(c4));
  ok('지문에 선택 가능 여부도 넣는다', /handSig = sorted\.map[\s\S]{0,60}pickMode/.test(c4));

  // 손패에서 사라진 카드가 선택으로 남아 있으면 안 된다
  ok('낸 카드는 선택이 풀린다', /!sorted\.some\(\(c\) => String\(c\.id\) === String\(sel4\.id\)\)/.test(c4));
  ok('고를 수 없는 단계면 선택이 풀린다', /if \(!pickMode\) sel4 = null/.test(c4));
}

console.log('\n③ 덱에서 뽑는가');
{
  ok('덱 더미가 있다', html.includes('id="q-deckstack"'));
  ok('덱 CSS 가 있다', /#q-deckstack\s*\{/.test(html));
  ok('뽑을 수 있을 때 빛난다', /#q-deckstack\.drawable::after/.test(html));
  ok('2인전과 같은 맥박 애니메이션을 쓴다', /animation:deckPulse/.test(html));
  ok('덱을 그리는 함수', /function renderDeck4/.test(c4));
  ok('남은 장수를 보여준다', /덱 \$\{n\}장/.test(c4));
  ok('덱을 눌러야 뽑힌다', /el\.onclick = drawable && n > 0/.test(c4));

  // 예전엔 "공개 카드" 칸을 눌렀다 — 그 자리는 이제 클릭이 없어야 한다
  ok('공개 카드 칸은 더 이상 안 눌린다', /\$\('q-center'\)\.onclick = null/.test(c4));
  ok('공개 카드 칸에 뽑기가 안 걸려 있다',
     !/\$\('q-center'\)\.onclick = \(s\.phase === 'draw'/.test(c4));

  // 덱도 매번 다시 만들지 않는다
  ok('덱도 바뀔 때만 다시 만든다', /if \(fx\.deckSig !== sig\)/.test(c4));
  ok('덱이 비면 숨긴다', /el\.style\.display = n > 0/.test(c4));
}

console.log('\n④ 산 꾸미기가 다인전에도 입혀지는가');
{
  ok('카드백 도우미', /function myBackClass/.test(c4));
  ok('뒷면에 카드백을 붙인다', /el\.classList\.add\(c\)[\s\S]{0,40}bf flip/.test(c4)
     || /myBackClass\(\)[\s\S]{0,80}classList\.add/.test(c4));
  ok('테이블·앞면 스킨 도우미', /function applySkins4/.test(c4));
  ok('화면에 들어갈 때 입힌다', (c4.match(/applySkins4\(\);/g) || []).length >= 2);

  // 벗길 목록을 손으로 적으면 새 스킨을 넣을 때 빠뜨린다 — 표에서 끌어와야 한다
  ok('표에서 끌어와 벗긴다', /classList\.remove\(\.\.\.Object\.values\(TABLE_CLS\)\)/.test(c4)
     && /classList\.remove\(\.\.\.Object\.values\(FACE_CLS\)\)/.test(c4));

  // 2인전과 같은 표를 써야 한 쪽만 갱신되는 사고가 안 난다
  ok('2인전과 같은 표(CB_CLASS)를 쓴다', /CB_CLASS\[p\.cardBack\]/.test(c4));
  ok('그 표는 상점 표와 한 벌이다', /const CB_CLASS = CBP;/.test(cli));

  // client4 는 client.js 의 전역을 빌려 쓴다 — 없을 때 터지면 판이 멈춘다
  ok('표가 없어도 안 터진다', /typeof CB_CLASS !== 'undefined'/.test(c4)
     && /typeof TABLE_CLS !== 'undefined'/.test(c4));
  ok('예외를 삼킨다', /catch \(_\) \{ return null; \}/.test(c4));
}

console.log('\n⑤ 끊겼다 붙어도 카드를 낼 수 있는가');
{
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');
  const act = s4.slice(s4.indexOf("safe(socket, 'g4_act'"), s4.indexOf("safe(socket, 'g4_act'") + 1400);

  // 예전엔 자리에 적힌 옛 소켓 id 와 다르면 입력을 통째로 버렸다.
  // 소켓은 화면 잠금·네트워크 깜빡임만으로도 끊겼다 붙으며 id 가 바뀐다.
  // 그 뒤로는 아무것도 못 내고 시간만 흘러 AI 가 대신 뒀다.
  ok('옛 id 라고 그냥 버리지 않는다', !/sid !== socket\.id\) return;/.test(act), act.slice(0, 160));
  ok('자리를 다시 이어 붙인다', /seat\.sid = socket\.id/.test(act));
  ok('자리비움 표시도 푼다', /seat\.orphanAt = null/.test(act));
  ok('AI 가 넘겨받은 자리는 안 돌려준다', /if \(seat\.isBot\) return;/.test(act));

  // 자리 임자 판단은 서버가 심어 둔 값으로만 — 클라이언트가 보낸 좌석 번호를 믿으면 안 된다
  ok('좌석은 서버가 심은 값을 쓴다', /const me = socket\.g4seat;/.test(act));
  ok('클라가 보낸 좌석은 안 쓴다', !/data\.seat/.test(act));
  ok('없는 자리는 막는다', /!r\.seats\[me\]\) return;/.test(act));
}

console.log('\n⑥ 2인전과 결이 맞는가');
{
  // 고른 카드가 앞으로 나와야 한다. 예전엔 테두리만 둘러서 "골랐다" 는 게
  // 눈에 안 띄었고, 배팅 자리에는 확정을 눌러야 그제야 나타났다.
  ok('고른 카드가 위로 들린다', /#q-myhand \.fan-slot\.sel\s*\{[^}]*translateY/.test(html));
  ok('부채꼴과 안 부딪히게 칸을 든다', /el\.parentElement\.classList\.toggle\('sel'/.test(c4));
  ok('고른 카드를 배팅 자리에 미리 올린다', /q-pick-prev/.test(c4));
  ok('무엇을 고르는 중인지 적는다', /출품 선택 중.*배팅 선택 중|배팅 선택 중/.test(c4));
  ok('이미 낸 카드는 안 건드린다', /const already = mb\.querySelector\('\.card'\)/.test(c4));
  ok('미리보기는 매번 지우고 다시 만든다', /if \(prev\) prev\.remove\(\)/.test(c4));

  // 고르는 즉시 반영돼야 한다 — render 는 서버 상태가 올 때만 돈다
  const ps = c4.slice(c4.indexOf('function paintSel'), c4.indexOf('function paintSel') + 1400);
  ok('미리보기를 paintSel 에서 그린다', /q-pick-prev/.test(ps));
  ok('render 에는 미리보기가 없다', (c4.match(/q-pick-prev/g) || []).length <= 3);

  // 경매 방식은 매트 가운데가 아니라 턴바에
  ok('방식 표시가 턴바에 있다', /<span id="q-turnbar">[\s\S]{0,200}id="q-typeTag"/.test(html)
     || /id="q-turn"><\/span><span id="q-deck"><\/span><span id="q-typeTag">/.test(html));
  ok('매트 가운데에서 빠졌다', !/<div class="q-vs" id="q-typeTag">/.test(html));
  ok('비어 있으면 자리도 안 차지', /#q-typeTag:empty \{ display:none/.test(html));

  // 덱과 카드가 붙어 있던 문제
  ok('매트 간격이 넉넉하다', /#q-mat \{[^}]*gap:20px/.test(html));
  ok('덱 층이 삐져나오는 만큼 자리를 잡는다', /#q-deckstack \{[^}]*width:54px/.test(html));
  ok('덱 장수가 매트 밖으로 안 나간다', /#q-deckstack \.q-dcount \{[^}]*bottom:2px/.test(html));

  // 확정 버튼은 손패 바로 위 (고른 카드 → 버튼 → 손패 순)
  const me = html.slice(html.indexOf('<div id="q-me">'), html.indexOf('<div id="q-me">') + 300);
  ok('배팅 자리가 버튼보다 위', me.indexOf('q-mybid') < me.indexOf('q-confirm'), me.replace(/\s+/g, ' '));
  ok('버튼이 손패보다 위', me.indexOf('q-confirm') < me.indexOf('q-myhand'));
}

console.log('\n⑦ 안내 문구가 새 흐름과 맞는가');
{
  ok('덱을 뽑으라고 한다', /덱을 눌러 카드를 뽑으세요/.test(c4));
  ok('출품도 확정을 누르라고 한다', /내놓을 카드를 고른 뒤 확정을 누르세요/.test(c4));
  ok('배팅도 확정을 누르라고 한다', /배팅 카드를 고른 뒤 확정을 누르세요/.test(c4));
  ok('예전 문구가 안 남아 있다', !/배팅 카드를 고르세요/.test(c4));
}

console.log('\n⑧ 화면이 흔들지 않는가');
{
  // 자리 크기가 내용에 따라 변하면 그때마다 매트·손패가 통째로 밀린다.
  // 실제로 방식 버튼이 나타날 때 매트가 25px 튀었다.
  ok('카드 자리가 고정 크기', /\.q-scard \{[^}]*width:58px[^}]*height:81px/.test(html));
  ok('빈 자리도 같은 크기', /\.q-hole \{[^}]*width:58px[^}]*height:81px/.test(html));
  ok('방식 버튼이 자리를 늘 잡는다', /#q-typeBtns \{[^}]*visibility:hidden/.test(html));
  ok('방식 버튼을 display 로 껐다 켜지 않는다', !/#q-typeBtns \{ display:none/.test(html));
  ok('확정 버튼도 자리를 잡는다', /\.q-confirm-slot \{[^}]*height:44px/.test(html));
  ok('배팅 자리가 라벨까지 담는다', /#q-mybid \{ height:104px/.test(html));
}

console.log('\n⑨ 빈 자리와 뒷면을 구분하는가');
{
  // 아직 아무것도 없는데 뒷면이 깔려 있으면 "이미 카드가 놓였다" 로 잘못 읽힌다.
  // 다만 클로즈에서 가려진 출품은 뒷면이 맞다 — 이 둘을 갈라야 한다.
  ok('서버가 존재 여부를 따로 준다', /hasOffer: !!a\.offered/.test(fs.readFileSync(src + '/server4.js', 'utf8')));
  ok('빈 자리 요소', /function slotHole/.test(c4));
  ok('셋을 갈라 그린다', /a\.hasOffer \? card4\(null\)/.test(c4));
  ok('뽑기 전에도 빈 자리', /\$\('q-center'\)\.appendChild\(slotHole\(\)\)/.test(c4));
  ok('예전처럼 무조건 뒷면을 깔지 않는다', !/\$\('q-offer'\)\.appendChild\(card4\(a\.offered\)\)/.test(c4));
}

console.log('\n⑩ 나가기·설명·설정·프로필');
{
  ok('좌측 상단 조작', /id="q-controls"/.test(html));
  ok('가로 일렬', /#q-controls \{[^}]*flex-direction:row/.test(html));
  ok('중앙 나가기는 없앴다', !/id="q-quit"/.test(html));
  ok('상대 자리를 버튼 아래로 내렸다', /#q-opps \{ margin-top:34px/.test(html));
  ok('내 프로필은 오른쪽 아래', /#q-meProfile \{[^}]*right:8px[^}]*bottom:calc\(170px/.test(html));
  ok('손패를 안 가린다 (손패+확정 위)', /bottom:calc\(170px \+ var\(--safe-b\)\)/.test(html));
  ok('상대 등급·레벨을 보여준다', /q-owho/.test(c4) && /\.q-owho \{/.test(html));
  ok('AI 는 AI 로 적는다', /who\.textContent = 'AI'/.test(c4));
  ok('버튼 셋', (html.match(/id="q-controls"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0].split('ctrl-btn').length - 1 === 3
     || (html.slice(html.indexOf('id="q-controls"'), html.indexOf('id="q-meProfile"')).match(/ctrl-btn/g) || []).length === 3);
  ok('2인전과 같은 자리', /#q-controls \{[^}]*position:absolute[^}]*left:8px/.test(html));
  ok('내 프로필이 판에 보인다', /id="q-meProfile"/.test(html) && /renderGameProfile\('q-meProfile'/.test(c4));

  // 나갈 때 배경음악이 멈춰야 한다 — 2인전은 새로고침으로 저절로 꺼졌다
  ok('배경음악 정지 함수', /function stopBGM/.test(cli));
  ok('나갈 때 멈춘다', /q4Quit = function[\s\S]{0,300}stopBGM/.test(c4));
}

console.log('\n⑪ 상대 정보·친구 신청');
{
  ok('상대 정보 창', /id="oppModal"/.test(html));
  ok('여는 함수', /function openOppInfo/.test(cli));
  ok('친구 신청', /function addOppFriend/.test(cli) && /api\/friend-add/.test(cli));
  ok('2인전 닉네임을 누르면 열린다', /nk\.onclick[\s\S]{0,60}openOppInfo/.test(cli));
  ok('다인전 닉네임도', /openOppInfo\(p\.profile/.test(c4));
  ok('AI 는 안 열린다', /if \(!p\.isBot\) \{/.test(c4));
  ok('게스트엔 친구 신청 없음', /게스트에게는 친구 신청/.test(cli));
  ok('나에게는 안 보낸다', /me === p\.nick/.test(cli));

  // 남에게 보여도 되는 값만 나가야 한다 — 손패·토큰이 새면 치명적
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');
  ok('공개용만 추려 보낸다', /function publicCard/.test(s4));
  const pc = s4.slice(s4.indexOf('function publicCard'), s4.indexOf('function publicCard') + 700);
  ok('손패는 안 실린다', !/hand/.test(pc));
  ok('토큰은 안 실린다', !/token:/.test(pc));
  ok('코인·아이템도 안 실린다', !/coins|items/.test(pc));
}

console.log('\n⑫ 내 정보 · 명패 고르기');
{
  ok('전체화면', /#myInfoModal \{ padding:0/.test(html)
     && /\.lb-box\.myinfo-box \{[^}]*height:100dvh/.test(html));
  ok('탭 셋', (html.match(/class="mi-tab[^"]*" data-mi=/g) || []).length === 3);
  ok('칸 셋', /id="miPaneInv"/.test(html) && /id="miPaneTitle"/.test(html) && /id="miPaneHist"/.test(html));
  ok('탭 전환 함수', /function miTab/.test(cli));
  ok('열면 인벤토리부터', /miTab\('inv'\)/.test(cli));
  // 좁은 상자 시절의 높이 제한이 남아 있으면 전체화면이 무의미하다
  ok('옛 높이 제한이 없다', !/\.mi-inv \{[^}]*max-height:158px/.test(html)
     && !/#miTitles \{[^}]*max-height:104px/.test(html));

  ok('명패 고르기 창', /id="plateModal"/.test(html));
  ok('이름을 누르면 열린다', /openPlate\(\)/.test(cli));
  ok('내 정보로 새는 걸 막는다', /event\.stopPropagation\(\);openPlate/.test(cli));
  ok('효과 문구를 서버가 만든다', /function plateFxText/.test(accSrc));
  ok('상점 목록에 실려 나간다', /out\.fxText = plateFxText\(id\)/.test(accSrc));
  ok('화면은 받아 쓰기만 한다', /it\.fxText \? esc\(it\.fxText\)/.test(cli));
  ok('미보유는 못 고른다', /own \? ` onclick="pickPlate/.test(cli));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
