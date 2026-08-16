// 룰북 탭 — 모드마다 규칙이 달라 설명서가 여러 벌인데, 들어가는 문이 따로따로면
// "다인전 규칙이 어디 있지" 를 찾아다녀야 한다. 한 창에서 탭으로 오가는지 본다.
//
// 탭은 반드시 상자 밖에 있어야 한다. 상자 안은 data-i18n-block 이 통째로
// 갈아끼우는 자리라, 안에 넣으면 영어로 바꾸는 순간 탭이 사라진다.
const fs = require('fs');
const src = __dirname + '/..';
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const i18n = fs.readFileSync(src + '/public/i18n.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 다섯 개 탭');
{
  const TABS = [['2', '2인용'], ['3', '3인용'], ['4', '4인용'], ['item', '아이템전'], ['mini', '미니게임']];
  for (const [key, label] of TABS) {
    ok(`${label} 탭`, html.includes(`data-rt="${key}"`) && html.includes(`rulesTab('${key}')`));
  }
  // 창마다 같은 탭 줄을 갖고 있어야 어디서 열어도 오갈 수 있다
  const modals = ['rulesModal', 'rules4Modal', 'rulesItemModal', 'rulesMiniModal'];
  for (const m of modals) ok(`${m} 에 탭이 있다`, new RegExp(`id="${m}"[\\s\\S]{0,600}rules-tabs`).test(html));
  ok('탭 줄이 창 수만큼 있다', (html.match(/class="rules-tabs"/g) || []).length === modals.length,
     String((html.match(/class="rules-tabs"/g) || []).length));
}

console.log('\n② 탭은 상자 밖에 있다');
{
  // rules-wrap > rules-tabs + rules-box 순서
  ok('감싸는 칸이 있다', /class="rules-wrap"/.test(html));
  ok('탭이 상자보다 먼저 온다',
     /class="rules-wrap">\s*<div class="rules-tabs"/.test(html));
  // 갈아끼우는 블록 안에 탭이 들어가 있으면 영어판에서 사라진다
  for (const blk of ['rules2', 'rules4', 'rulesMini', 'rulesItem']) {
    const at = i18n.indexOf(`${blk}: \``);
    if (at < 0) { ok(`${blk} 영어판이 있다`, false); continue; }
    const end = i18n.indexOf('`,', at);
    ok(`${blk} 영어판에 탭이 안 섞였다`, i18n.slice(at, end).indexOf('rules-tabs') === -1);
  }
}

console.log('\n③ 기본은 2인용');
{
  ok('게임방법 버튼은 2인용을 연다', /rulesTab\('2'\)/.test(cli));
  ok('2인용이 기본값', /let rulesCur = '2'/.test(cli));
  ok('판을 보고 알맞은 탭으로 연다',
     /classList\.contains\('quad4'\)[\s\S]{0,120}rulesTab\(document\.body\.classList\.contains\('q-n3'\) \? '3' : '4'\)/.test(cli));
  ok('한 번에 하나만 열린다', /mid === id \? 'flex' : 'none'/.test(cli));
  ok('켜진 탭을 칠한다', /classList\.toggle\('on', b\.dataset\.rt === name\)/.test(cli));
}

console.log('\n④ 3인용·4인용은 같은 글, 다른 숫자');
{
  // 같은 글을 두 벌로 두면 한쪽만 고치게 된다 — 상자는 하나를 같이 쓴다
  ok('두 탭이 같은 창을 본다', /'3': 'rules4Modal', '4': 'rules4Modal'/.test(cli));
  ok('다른 숫자만 따로 띄운다', /RULES_N = \{ '3': \{ hand: 7, deck: 17 \}, '4': \{ hand: 6, deck: 14 \} \}/.test(cli));
  ok('안내 줄이 있다', /id="rules4Note"/.test(html));
  ok('안내 줄도 상자 밖', /rules-tabs[\s\S]{0,700}id="rules4Note"[\s\S]{0,400}class="rules-box"/.test(html));
  // 실제 규칙(game4.js)과 숫자가 같아야 한다
  const g4 = fs.readFileSync(src + '/game4.js', 'utf8');
  ok('손패 장수가 규칙과 같다', /const HAND = \{ 3: 7, 4: 6 \}/.test(g4));
  ok('덱 장수가 주석과 같다', /3인 덱 17장 \/ 4인 덱 14장/.test(g4));
}

console.log('\n⑤ 아이템전 설명서');
{
  const at = html.indexOf('id="rulesItemModal"');
  const box = html.slice(at, html.indexOf('id="rulesModal"'));
  ok('설명서가 있다', at > 0 && /data-i18n-block="rulesItem"/.test(box));
  ok('닫는 버튼', /toggleRulesItem\(false\)/.test(box));
  ok('여는 함수', /window\.toggleRulesItem/.test(cli));
  // 규칙 숫자가 실제 코드와 같아야 한다 — 어긋나면 사람이 잘못 배운다
  const it = fs.readFileSync(src + '/items.js', 'utf8');
  const tiers = { common: 0, rare: 0, legend: 0 };
  for (const m of it.matchAll(/tier: '(\w+)'/g)) tiers[m[1]]++;
  ok(`일반 ${tiers.common}종이 설명서와 같다`, box.includes(`일반 (${tiers.common}종)`), String(tiers.common));
  ok(`희귀 ${tiers.rare}종이 설명서와 같다`, box.includes(`희귀 (${tiers.rare}종)`), String(tiers.rare));
  ok(`전설 ${tiers.legend}종이 설명서와 같다`, box.includes(`전설 (${tiers.legend}종)`), String(tiers.legend));
  ok('보유 한도가 코드와 같다', /const MAX_HOLD = 3/.test(it) && box.includes('3개'));
  ok('확률이 코드와 같다', /r < 0\.60 \? 'common' : r < 0\.92 \? 'rare'/.test(it)
     && box.includes('60%') && box.includes('32%') && box.includes('8%'));
  // 12개 아이템 이름이 다 적혀 있어야 한다
  const names = [...it.matchAll(/name: '([^']+)', icon:/g)].map((m) => m[1]);
  const missing = names.filter((n) => !box.includes(n));
  ok('모든 아이템이 적혀 있다', missing.length === 0, missing.join(','));
  ok('영어판도 있다', /rulesItem: `/.test(i18n));
  const eb = i18n.slice(i18n.indexOf('rulesItem: `'), i18n.indexOf('`,', i18n.indexOf('rulesItem: `')));
  ok('영어판에 한글이 안 남았다', !/[가-힣]/.test(eb.replace(/\/\/.*$/gm, '')),
     (eb.match(/[가-힣]+/g) || []).slice(0, 3).join(','));
}

console.log('\n⑥ 부적 (상대 아이템 1회 차단)');
{
  const it = fs.readFileSync(src + '/items.js', 'utf8');
  const srv = fs.readFileSync(src + '/server.js', 'utf8');
  ok('아이템이 있다', /ward: \{[\s\S]{0,120}name: '부적'/.test(it));
  ok('희귀다', /name: '부적', icon: '🧿', tier: 'rare'/.test(it));
  // 이번 턴에만 산다 = fx 에 둔다 (fx 는 턴마다 새로 만든다)
  ok('턴이 넘어가면 사라진다', /peek: \{ 1: null, 2: null \}, ward: \{ 1: false, 2: false \}/.test(it));
  ok('막으면 상대 아이템이 사라진다', /held\.splice\(held\.indexOf\(itemId\), 1\);\s*\/\/ 막힌 아이템도 사라진다/.test(it));
  ok('부적은 부적으로 못 막는다', /itemId !== 'ward' && g\.fx && g\.fx\.ward && g\.fx\.ward\[opp\]/.test(it));
  ok('한 번 쓰면 없어진다', /g\.fx\.ward\[opp\] = false;/.test(it));
  // 막을 게 없으면 못 건다 — 1턴짜리라 그냥 버려지는 걸 막는다
  ok('이미 걸었으면 못 건다', /이미 부적을 걸어 두었어요/.test(it));
  ok('상대가 이미 썼으면 못 건다', /g\.itemUsed\[opp\]\) return '상대가 이번 턴에 이미 아이템을 썼어요/.test(it));
  ok('상대가 아이템이 없으면 못 건다', /상대가 가진 아이템이 없어요/.test(it));
  // 화면
  ok('내가 건 부적만 알려준다', /wardMe: !!game\.fx\.ward\[me\]/.test(srv));
  ok('상대 부적은 안 알려준다', !/wardOpp/.test(srv));
  ok('걸린 상태가 화면에 뜬다', /f\.wardMe.*부적/.test(cli));
  ok('막혔다는 걸 양쪽에 알린다', /blocked: !!out\.blocked/.test(srv));
  ok('AI 도 부적을 쓴다', /case 'ward':/.test(srv));
  ok('아이콘이 있다', /ward: `<svg/.test(fs.readFileSync(src + '/public/item-icons.js', 'utf8')));
}

console.log('\n⑦ 방 만들기 · 모드 고르기');
{
  const srv = fs.readFileSync(src + '/server.js', 'utf8');
  // 방 이름은 미리 채워 둔다 — 빈칸이면 뭘 적어야 하나 망설이게 된다
  ok('방 이름 기본값을 채운다', /el\.value = `\$\{\(typeof getNick/.test(cli));
  ok('바로 고칠 수 있게 선택해 둔다', /el\.focus\(\); el\.select\(\)/.test(cli));

  // 손으로 만든 방은 방장이 눌러야 시작한다. 빠른 매칭은 예전처럼 바로.
  ok('사람 방만 방장이 시작한다', /hostStart: !vsBot/.test(srv));
  ok('들어오자마자 시작하지 않는다', /if \(room\.hostStart\) \{ pushRoomLobby/.test(srv));
  ok('시작은 방장만', /socket\.on\('room_start'[\s\S]{0,220}socket\.playerIndex !== 0\) return/.test(srv));
  ok('혼자서는 못 시작한다', /상대가 아직 없어요/.test(srv));
  ok('모드 바꾸기도 방장만', /socket\.on\('room_mode'[\s\S]{0,200}socket\.playerIndex !== 0\) return/.test(srv));
  ok('방 상태를 사람마다 따로 보낸다', /function pushRoomLobby/.test(srv) && /host: i === 0, ready/.test(srv));

  // 화면
  for (const m of ['classic', 'item', 'quad']) ok(`${m} 버튼`, html.includes(`roomMode('${m}')`));
  ok('시작 버튼', /id="wcStart"/.test(html) && /onclick="roomStart\(\)"/.test(html));
  ok('상대가 없으면 눌리지 않는다', /btn\.disabled = !roomReady/.test(cli));
  ok('손님에게는 안내만', /id="wcGuestNote"/.test(html));
  ok('손님에게는 모드 버튼을 숨긴다', /modes\.style\.display = roomIsHost \? '' : 'none'/.test(cli));

  // 대기실 — 사람이 들락날락해도 방이 살아 있어야 한다
  ok('시작 전에 나가면 자리만 비운다', /function leaveWaitingRoom/.test(srv));
  ok('아무도 없을 때만 방을 지운다', /if \(!room\.players\.some\(Boolean\)\) \{ delete rooms\[roomId\]/.test(srv));
  ok('방장이 나가면 물려받는다', /if \(!room\.players\[0\] && room\.players\[1\]\)/.test(srv));
  ok('연결이 끊겨도 자리만 비운다', /r && !r\.game && r\.hostStart && !socket\.isSpec/.test(srv));
  ok('누가 있는지 내려보낸다', /const seats = room\.players\.map/.test(srv));
  ok('자리를 그린다', /id="wcSeats"/.test(html) && /wc-seat/.test(cli));
  ok('들어온 사람 모두 대기실 화면으로', /waitCard'\)\.style\.display = 'flex';\s*\n\s*roomIsHost/.test(cli));
  ok('나갈 때 서버에도 알린다', /function cancelWait\(\) \{\s*\n\s*socket\.emit\('leave_room'\)/.test(cli));
  // 다인전은 엔진이 달라 그쪽 대기방으로 넘긴다
  ok('다인전은 옮겨간다고 묻는다', /다인전으로 바꿀까요/.test(cli));
}

console.log('\n⑧ 모드 자리 정리');
{
  // AI 다인전은 솔로 안이 제자리다 — 두 곳에 두면 갈라진다
  const solo = html.slice(html.indexOf('id="soloModal"'), html.indexOf('id="multiModal"'));
  ok('솔로에 다인전 AI전이 있다', /q4Start\(3\)/.test(solo) && /q4Start\(4\)/.test(solo));
  const quad = html.slice(html.indexOf('id="quadModal"'), html.indexOf('id="gachaModal"'));
  ok('다인전 팝업에는 AI 버튼이 없다', !/q4Start\(/.test(quad));
  ok('어디 있는지 알려준다', /솔로플레이에 있어요/.test(quad));
  // 미니게임 설명서는 게임방법 탭 안으로 들어갔다
  const learn = html.slice(html.indexOf('class="lobby-top learn"'), html.indexOf('</div>', html.indexOf('class="lobby-top learn"')));
  ok('로비에 미니게임 버튼이 없다', !/toggleRulesMini/.test(learn), learn.slice(0, 60));
  ok('게임방법 버튼은 남아 있다', /toggleRules\(true\)/.test(learn));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
