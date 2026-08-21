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

  // 내보내는 곳은 확정 한 곳뿐이어야 한다 (덱 뽑기는 별개).
  // 이제 모든 행동은 sendAct 를 거친다 — 재시도가 붙어 있는 유일한 길이다.
  const sends = [...c4.matchAll(/sendAct\(\{ type: ([^,}]+)/g)].map((m) => m[1].trim());
  ok('offer·bid 를 내보내는 곳은 확정뿐',
     sends.filter((e) => /offer|bid/.test(e)).length === 1, sends.join(' | '));

  // 연타로 두 번 나가면 안 된다
  const conf = c4.slice(c4.indexOf('window.q4Confirm'), c4.indexOf('window.q4Confirm') + 420);
  ok('연타 방어 — 보내기 전에 비운다', conf.indexOf('sel4 = null') < conf.indexOf('sendAct('),
     '비우기가 보내기 뒤에 있다');
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
  // 조작 넉 장은 오른쪽 위 메뉴 아이콘 하나로 접혔다 — 트웰브·2인전과 같다
  ok('오른쪽 위 메뉴 아이콘', /<div class="tv-menuWrap" id="q-menuWrap">/.test(html)
     && /<button class="tv-menuBtn" id="q-menuBtn"/.test(html));
  ok('중앙 나가기는 없앴다', !/id="q-quit"/.test(html));
  ok('상대 자리를 버튼 아래로 내렸다', /#q-opps \{ margin-top:36px/.test(html));
  // 시계와 프로필은 각자 띄우지 않고 #q-mebar 한 줄로 묶었다(⑥ 참고).
  ok('내 줄은 오른쪽 맨 아래', /#q-mebar \{[^}]*right:8px[^}]*bottom:calc\(4px/.test(html));
  ok('손패 아래 자리를 비워 둔다', /#q-me \{ padding-bottom:\d+px/.test(html));
  ok('시계가 그 줄 안에 있다', /id="q-mebar"[\s\S]{0,400}?id="q-timer"/.test(html));
  ok('메뉴가 판 위층에 선다', /#q-menuWrap \{ z-index:40; \}/.test(html));
  ok('상대 등급·레벨을 보여준다', /q-owho/.test(c4) && /\.q-owho \{/.test(html));
  ok('AI 는 AI 로 적는다', /who\.textContent = 'AI'/.test(c4));
  // 개수를 박아 두면 버튼이 하나 늘 때마다 깨진다. 있어야 할 것이 다 있는지를 본다.
  {
    const bar = html.slice(html.indexOf('id="q-menuWrap"'), html.indexOf('id="q-menuWrap"') + 2200);
    for (const [name, re] of [['나가기', /q4AskQuit\(\)/], ['채팅', /toggleGameChat\(\)/],
                              ['설명', /toggleRules\(true\)/], ['설정', /toggleSettings\(\)/]])
      ok(`${name} 버튼이 있다`, re.test(bar));
    ok('2인전과 같은 것들만', (bar.match(/<button/g) || []).length === 5,
       String((bar.match(/<button/g) || []).length));
  }
  ok('내 프로필이 판에 보인다', /id="q-meProfile"/.test(html) && /renderGameProfile\('q-meProfile'/.test(c4));

  // 나갈 때 판 곡이 계속 흐르면 안 된다 — 2인전은 새로고침으로 저절로 로비 곡이 된다.
  // 다인전은 화면만 숨기므로 직접 로비 곡으로 바꿔 준다.
  ok('배경음악 정지 함수', /function stopBGM/.test(cli));
  ok('나갈 때 로비 곡으로', /q4Quit = function[\s\S]{0,320}startBGM\('lobby'\)/.test(c4));
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

console.log('\n⑫ 시계 (3분)');
{
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');
  const g4 = fs.readFileSync(src + '/game4.js', 'utf8');
  ok('자리마다 3분', /clock\[i\] = 180/.test(g4));
  ok('서버가 1초마다 센다', /}, 1000\);/.test(s4) && /const clk = setInterval/.test(s4));
  ok('입력을 기다리는 사람만 깎인다', /const seat = humanToAct\(g, r\);[\s\S]{0,120}g\.clock\[seat\] = Math\.max/.test(s4));
  ok('타이머를 unref 한다', /clk\.unref\(\)/.test(s4));

  // 매초 상태를 통째로 보내면 무겁다 — 시계만 따로
  ok('가벼운 시계 신호', /emit\('g4_clock'/.test(s4));
  ok('화면이 그 신호로 다시 그린다', /socket\.on\('g4_clock'/.test(c4));
  ok('상태가 올 때도 같은 함수로', /function paintClock/.test(c4)
     && (c4.match(/paintClock\(/g) || []).length >= 3);

  // 다 쓰면 판을 끝내지 않고 AI 가 넘겨받는다
  ok('시간 소진 시 AI 인계', /sk\.isBot = true; sk\.sid = null; sk\.left = true;/.test(s4));
  ok('당사자에게 알린다', /emit\('g4_timeout'\)/.test(s4) && /socket\.on\('g4_timeout'/.test(c4));

  ok('시계 요소', /id="q-timer"/.test(html));
  ok('30초 남으면 경고', /left <= 30/.test(c4));
}

console.log('\n⑬ 나가기 확인 · 친구 초대 · 상대 명패');
{
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');

  // 나가기 — 예전엔 누르는 즉시 나가서 잘못 눌러도 판이 끝났다
  ok('나가기가 한 번 묻는다', /function q4AskQuit|q4AskQuit = function/.test(c4));
  ok('버튼이 확인을 거친다', /onclick="qMenu\(false\);q4AskQuit\(\)"/.test(html));
  ok('바로 안 나간다', !/onclick="q4Quit\(\)" title="게임 나가기"/.test(html));
  ok('진행 중이면 AI 인계를 알린다', /자리를 AI 가 이어받아요/.test(c4));

  // 빈자리 + 로 친구 초대
  ok('빈자리에 + 버튼', /plus\.className = 'q-invite'/.test(c4) && /\.q-invite \{/.test(html));
  ok('친구 목록 창', /id="q-inviteModal"/.test(html));
  ok('못 누를 줄은 꺼둔다', /q-invrow\$\{can \? '' : ' off'\}/.test(c4));
  ok('서버가 초대를 받는다', /'g4_invite'/.test(s4));
  ok('수락하면 그 방으로', /'g4_accept'/.test(s4) && /joinPending\(socket, nickOf\(data\), p\)/.test(s4));
  ok('지정한 방으로 들어갈 수 있다', /function joinPending\(socket, nick, want\)/.test(s4));

  // 아무에게나 못 보낸다 — 클라가 보낸 상대를 그대로 믿으면 안 된다
  ok('친구인지 서버가 확인한다', /friendIdlsOf/.test(s4) && /친구만 초대할 수 있어요/.test(s4));
  ok('friendIdlsOf 에 idl 을 넘긴다', /friendIdlsOf\(String\(me\.id \|\| ''\)\.toLowerCase\(\)\)/.test(s4));
  ok('받는 쪽이 눌러야 들어간다', /socket\.on\('g4_invited'/.test(c4) && /askConfirm/.test(c4));
  ok('수락 시 화면을 실제로 연다', /function enterWaiting/.test(c4)
     && /enterWaiting\(\);\s*\n\s*socket\.emit\('g4_accept'/.test(c4));

  // 상대 명패·칭호 — 토큰은 게임 자리가 아니라 방 자리에 있다
  ok('방 자리에서 토큰을 찾는다', /room\.seats\[i\]\.token/.test(s4));
  ok('게임 자리에서 찾지 않는다', !/\(!s\.isBot && s\.token\)/.test(s4));
  ok('명패·닉색을 입힌다', /npClass\(p\.profile\.plate\)/.test(c4));
  ok('칭호도 보여준다', /titleTag\(p\.profile\.titleInfo\)/.test(c4));
}

console.log('\n⑭ 내 정보 · 명패 고르기');
{
  ok('전체화면', /#myInfoModal \{ padding:0/.test(html)
     && /\.lb-box\.myinfo-box \{[^}]*height:100%/.test(html));
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

console.log('\n⑥ 시계·프로필 줄 · 세로 예산');
{
  // 시계와 프로필을 따로 띄워 둔 동안 시계가 손패 카드 위에 얹혔다.
  ok('한 줄로 묶어 둔다', /#q-mebar \{[^}]*display:flex/.test(html));
  ok('손패 아래 오른쪽', /#q-mebar \{[^}]*right:8px/.test(html)
     && /#q-mebar \{[^}]*bottom:calc\(4px/.test(html));
  ok('안의 둘은 절대위치를 버린다', /#q-mebar > #q-timer \{ position:static/.test(html)
     && /#q-mebar > #q-meProfile \{ position:static/.test(html));

  // 가운데 정렬은 내용이 넘치면 "위로" 샐지고 나온다 — 그러면 턴바가
  // 바로 위 배팅 자리를 덮는다. safe 가 이걸 막는다.
  ok('#q-table 은 safe center', /#q-table \{[^}]*justify-content:safe center/.test(html));
  ok('그냥 center 가 아니다', !/#q-table \{[^}]*justify-content:center/.test(html));
}

console.log('\n⑦ 게임 중 표시');
{
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');
  const srv = fs.readFileSync(src + '/server.js', 'utf8');

  // 목록에 상태를 실어 보낸다 — 화면이 지어내면 실제와 어기난다
  ok('서버가 접속·게임 중을 판단', /function busyState/.test(srv));
  ok('방 소속으로 게임 중을 본다', /ingame: !!\(sk\.roomId \|\| sk\.g4room\)/.test(srv));
  ok('친구 목록에 입혀 보낸다', /function withOnline/.test(srv));

  ok('친구줄에 게임 중 불이 들어온다', /f\.ingame \? 'busy'/.test(cli));
  ok('게임 중 글자도 보인다', /게임 중/.test(cli));
  ok('게임 중이면 도전장을 숨긴다', /!f\.ingame/.test(cli));
  ok('불 색이 있다', /\.soc-dot\.busy \{/.test(html));

  // 초대는 서버가 막아야 한다 — 화면만 막으면 우회된다
  ok('게임 중인 친구 초대를 서버가 거절', /지금 게임 중이에요/.test(s4));
  ok('초대창에도 게임 중 표시', /f\.ingame \? '게임 중'/.test(c4));
  ok('게임 중은 누를 수 없다', /const can = !!f\.online && !f\.ingame/.test(c4));
  ok('쉽게 찾게 정렬한다', /x\.ingame \? 1 : 0/.test(c4));
}

console.log('\n⑧ 창이 판 위로 올라오는가');
{
  // 다인전 판이 z-index 60 이라 설명(40)·나가기 확인(45) 같은 창이
  // 판 뒤에서 열렸다 — 눌러도 아무 일도 안 생기는 것처럼 보였다.
  const z = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };
  const g4 = z(/#game4 \{[^}]*z-index:(\d+)/);
  ok('다인전 판 z-index 를 찾았다', g4 !== null, String(g4));
  ok('설명보다 아래', g4 < z(/\.rules-modal \{[^}]*z-index:(\d+)/), `판 ${g4}`);
  ok('창들보다 아래', g4 < z(/\.lb-modal \{[^}]*z-index:(\d+)/), `판 ${g4}`);

  // 설정 패널은 #game 안에 있어 다인전에서는 아예 뜼지 않았다
  // 순서만 보면 마크업을 옮길 때마다 같이 틀어진다. #game 이 실제로 어디서
  // 닫히는지 세어 그 밖인지 본다.
  const endOfGame = (() => {
    let i = html.indexOf('<div id="game" ');
    if (i < 0) i = html.indexOf('<div id="game"');
    let depth = 0;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = i;
    let m;
    while ((m = re.exec(html))) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) return m.index;
    }
    return -1;
  })();
  ok('#game 이 닫히는 곳을 찾았다', endOfGame > 0);
  ok('설정 패널이 그 밖에 있다', html.indexOf('id="settingsPanel"') > endOfGame);
  ok('설정 패널은 fixed', /#settingsPanel \{[^}]*position:fixed/.test(html));
  ok('설정 패널이 판보다 위', z(/#settingsPanel \{[^}]*z-index:(\d+)/) > g4);
}

console.log('\n⑨ 다인전 설명서');
{
  ok('따로 있다', /id="rules4Modal"/.test(html) && /id="rulesBox4"/.test(html));
  // 두 벌을 복사해 두면 같이 낡는다 — 껍데기는 공용 클래스로
  ok('껍데기를 나눠 쓴다', /\.rules-box \{/.test(html) && /\.rules-modal \{/.test(html));
  // 설명서가 늘어날 수 있으니 개수가 아니라 "다 같은 껍데기를 쓰는가" 를 본다
  ok('설명서마다 공용 클래스를 달았다',
     (html.match(/class="rules-box"/g) || []).length >= 2
     && !/class="rules-box[^"]*\brules-box2\b/.test(html));
  ok('여닫는 함수', /function toggleRules4/.test(cli));
  // 이제 한 창에서 탭으로 오간다 — 다인전 화면이면 인원에 맞는 탭으로 연다
  // 어느 판에 앉아 있는지는 currentMode() 한 곳에서 판단한다 —
  // 설명 버튼이 늘 그 판의 탭을 연다(트웰브·아이템전도 같은 통로).
  ok('다인전에서는 그쪽 탭이 뜬다',
     /function currentMode\(\)[\s\S]{0,300}contains\('quad4'\)\) return c\.contains\('q-n3'\) \? '3' : '4'/.test(cli)
     && /rulesTab\(currentMode\(\)\)/.test(cli));
  ok('ESC 로도 닫힌다', /\['rules4Modal',\s*\(\) => rulesClose\(\)\]/.test(cli));

  // 내용이 실제 규칙과 맞는가 (game4.js 가 진짜다)
  const g4src = fs.readFileSync(src + '/game4.js', 'utf8');
  // 다른 설명서까지 끌어오면 없는 문구도 있는 것처럼 보인다 — 이 상자 안에서만 찾는다
  const box = html.slice(html.indexOf('id="rulesBox4"'), html.indexOf('id="rulesMiniModal"'));
  // 3인은 같은 한 벌에서 8장을 덜어낸다 — 38장은 3인에게 과했다
  // (17장 덱에서 실제로 뽑히는 건 7.9장뿐이었다)
  ok('덱 4인 38장 · 3인 30장',
     /DECK38 = \[\[2, 4\], \[3, 6\], \[4, 10\], \[6, 18\]\]/.test(g4src)
     && /DECK30 = \[\[2, 3\], \[3, 5\], \[4, 8\], \[6, 14\]\]/.test(g4src)
     && /SPECS = \{ 3: DECK30, 4: DECK38 \}/.test(g4src)
     && /4인 38장 · 3인 30장/.test(box));
  ok('4종 10장·6종 18장', /4짜리<\/b> · 10장/.test(box) && /6짜리<\/b> · 18장/.test(box));
  ok('손패 둘 다 6장', /HAND = \{ 3: 6, 4: 6 \}/.test(g4src)
     && /<span>3인<\/span><span>30장<\/span><span>6장<\/span><span>12장<\/span>/.test(box)
     && /<span>4인<\/span><span>38장<\/span><span>6장<\/span><span>14장<\/span>/.test(box));
  ok('진행자도 같이 낸다', /전원<\/b>이 배팅 카드를 낸다/.test(box));
  ok('클로즈는 순차 공개', /<b>시계방향으로 한 명씩<\/b>/.test(box));
  ok('역순 분배', /약하게 부른 사람이 가장 강한 카드<\/b>/.test(box));
  // 최약 카드는 덤마다 다르다 — 2인전 6-10 을 그대로 베끼면 틀린 설명이 된다
  ok('배신은 6-18', /6-18/.test(box) && !/6-10<\/b>이 가장/.test(box));
  ok('제한 시간 3분', /<b>3분<\/b>/.test(box));
}

console.log('\n⑩ 카드가 안 내지는 버그');
{
  const s4 = fs.readFileSync(src + '/server4.js', 'utf8');

  // ① 내 자리는 0번이 아닐 수 있다. 0 으로 박아 두었더니 1·2·3번 자리
  //    사람은 진행자가 돼도 경매 방식을 고를 수 없어, 3분을 다 쓰고
  //    AI 에게 자리를 넘겼다. 4인전이면 4명 중 3명이 걸린다.
  ok('방식 고르기가 내 자리를 본다', /q4Type[\s\S]{0,300}?auctioneer !== mySeat/.test(c4));
  ok('0 으로 박아 두지 않았다', !/auctioneer !== 0/.test(c4));

  // ② 서버는 못 받아들인 행동을 조용히 버린다. 폰에서 화면 잠금·앱 전환으로
  //    소\耐켓이 다시 붙으면 자리 연결이 끊긴 채가 되고, 그 뒤로 뭐를 눌러도
  //    전부 버려진다. 보낸 걸 기억해 두고 안 먹히면 다시 이어 붙인다.
  ok('보낸 행동을 기억한다', /function sendAct/.test(c4) && /let pendAct = null/.test(c4));
  ok('상태가 바뀌면 먹힌 것으로 본다', /function noteState/.test(c4)
     && /noteState\(\); render\(\)/.test(c4));
  ok('안 먹히면 자리부터 다시 잉는다', /pendAct\.tries\+\+[\s\S]{0,120}?resume\(\)/.test(c4));
  ok('무한으로 재시도하지 않는다', /pendAct\.tries >= 2/.test(c4));
  ok('끝내 안 되면 솔직히 말한다', /서버가 응답하지 않아요/.test(c4));

  // 모든 행동이 같은 길로 나가야 한다 — 하나라도 빠지면 그것만 무성의상이 된다
  const raw = (c4.match(/socket\.emit\('g4_act'/g) || []).length;
  ok('직접 보내는 곳은 보내기·재시도 둘뿐', raw === 2, `${raw}곳`);
  for (const t of ['draw', 'auctionType'])
    ok(`${t} 도 sendAct 로`, new RegExp(`sendAct\\(\\{ type: '${t}'`).test(c4));
  ok('내기·출품도 sendAct 로', /sendAct\(\{ type: type === 'offer'/.test(c4));

  // ③ 자가복구가 "내 차례면" 꺼져 있었다 — 정확히 막히는 순간이다
  ok('내 차례여도 오래 조용하면 잉는다', !/if \(waiting\) return;/.test(c4));

  // 서버는 자리 임자가 다시 붙으면 받아 준다(예전 수정). 그대로인지 확인.
  ok('서버도 자리를 다시 잉는다', /seat\.sid = socket\.id; seat\.orphanAt = null/.test(s4));
}

console.log('\n⑪ 낙찰 카드가 잘리지 않는다');
{
  // 3인전에서 내 획득 칸이 30px 인데 카드가 50px 이라 아래가 잘려 나갔다.
  // 칸 높이를 CSS 로 인원·화면마다 맞추려 들면 조합이 늘 때마다 또 어긋난다 —
  // 그려 놓고 재서, 넘치는 만큼만 줄인다.
  ok('재서 줄이는 함수가 있다', /function fitAcq\(box\)/.test(c4));
  ok('내 더미를 감싸 둔다', /myin\.className = 'q-acqin'/.test(c4));
  ok('상대 더미도 감싼다', /oin\.className = 'q-acqin'/.test(c4));
  ok('다 그린 뒤에 한 번에 잰다', /for \(const box of fitBoxes\) fitAcq\(box\)/.test(c4));
  ok('가로·세로를 모두 본다', /Math\.min\(1, w \/ sw, h \/ sh\)/.test(c4));
  ok('이름표 폭은 빼고 잰다', /box\.dataset\.pad/.test(c4) && /dataset\.pad = String\(/.test(c4));
  // 트랜지션이 걸려 있으면 재는 순간과 보이는 순간이 어긋나 더미가 펄떡인다
  const acqin = html.slice(html.indexOf('.q-acqin {'), html.indexOf('.q-acqin {') + 260);
  ok('안쪽 묶음에 트랜지션을 안 건다', !/transition/.test(acqin), acqin.slice(0, 80));
  ok('축소 기준점은 가운데', /transform-origin:center center/.test(acqin));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
