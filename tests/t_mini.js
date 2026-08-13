// 미니게임 — 규칙 모듈 자체는 t_sutda 가 본다. 여기서는 붙는 부분을 본다:
// AI 가 말이 되게 두는가, 화면·설명서·코인 정산이 서로 어긋나지 않는가.
const fs = require('fs');
const path = require('path');
const S = require('../sutda');
const src = path.join(__dirname, '..');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const srv = fs.readFileSync(src + '/server.js', 'utf8');
const acc = fs.readFileSync(src + '/accounts.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
// xorshift 는 작은 씨앗으로 시작하면 처음 몇 개가 전부 0에 가깝다 —
// 그대로 쓰면 "몇 %" 짜리 갈림길이 늘 한쪽으로만 간다.
const rngOf = (seed) => {
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 12; i++) next();
  return next;
};

console.log('① AI 가 규칙 안에서 둔다');
{
  let bad = 0, done = 0, fold = 0, show = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const n = 2 + (seed % 3);
    const st = S.start({ seats: n, rand: rngOf(seed) });
    const r = rngOf(seed * 7 + 1);
    let guard = 0;
    while (!st.over && guard++ < 80) {
      const v = S.viewFor(st, st.turn);
      const a = S.aiAction(v, r);
      if (!a || !v.actions.includes(a)) { bad++; break; }
      if (!S.act(st, st.turn, a).ok) { bad++; break; }
    }
    if (!st.over) { bad++; continue; }
    done++;
    if (st.reason === 'fold') fold++; else show++;
  }
  ok('600판 모두 규칙 안의 수만 둔다', bad === 0, `${bad}판 어긋남`);
  ok('스스로 판을 끝낸다', done === 600, String(done));
  ok('죽기도 한다', fold > 0, String(fold));
  ok('끝까지 가기도 한다', show > 0, String(show));
}

console.log('\n② AI 가 패 세기를 읽는다');
{
  const mk = (...ids) => ids.map((id) => ({ kind: Math.floor(id / 100), grade: id % 100, id }));
  // 두 번째 라운드에서, 같은 상황에 센 패와 약한 패를 쥐어 준다
  const bets = (hand) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const st = S.start({ seats: 2, first: 0, rand: rngOf(seed) });
      S.act(st, 0, 'check'); S.act(st, 1, 'check');    // 2라운드로
      st.hands[0] = hand; st.turn = 0;
      const a = S.aiAction(S.viewFor(st, 0), rngOf(seed * 3));
      if (['ping', 'quarter', 'half', 'ttadang', 'allin'].includes(a)) n++;
    }
    return n;
  };
  const strong = bets(mk(201, 202));    // 지배자 (합 4)
  const weak = bets(mk(609, 610));      // 꼴찌 (합 12)
  ok('센 패로는 자주 건다', strong > 200, String(strong));
  ok('약한 패로는 훨씬 덜 건다', weak < strong * 0.5, `${weak} vs ${strong}`);
  ok('그래도 가끔은 지른다 (읽히지 않게)', weak > 0, String(weak));

  // 받아야 하는 상황
  const calls = (hand) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const st = S.start({ seats: 2, first: 0, rand: rngOf(seed) });
      S.act(st, 0, 'check'); S.act(st, 1, 'check');
      st.hands[1] = hand;
      S.act(st, 0, 'half');                            // 선이 걸었다
      const a = S.aiAction(S.viewFor(st, 1), rngOf(seed * 3));
      if (a !== 'die') n++;
    }
    return n;
  };
  ok('센 패는 받는다', calls(mk(201, 202)) > 250, String(calls(mk(201, 202))));
  ok('꼴찌 패는 대개 접는다', calls(mk(609, 610)) < 120, String(calls(mk(609, 610))));
}

console.log('\n③ 첫 라운드는 한 장으로 가늠한다');
{
  const c = (id) => [{ kind: Math.floor(id / 100), grade: id % 100, id }];
  ok('2가 가장 세다', S.handStrength(c(201)) === 0);
  ok('6이 가장 약하다', S.handStrength(c(610)) === 1);
  ok('3·4는 그 사이', S.handStrength(c(301)) < S.handStrength(c(401)));
  ok('빈 손은 최약체로 본다', S.handStrength([]) === 1);
}

console.log('\n④ 서버가 돈을 쥔다');
{
  ok('앉을 때 소지금을 산다', /accounts\.miniStake\(sk\.token, buy\)/.test(srv));
  ok('가진 만큼만 산다 (상한 안에서)', /Math\.min\(SUTDA\.BUY_IN, Math\.max\(0, \(have && have\.coins\) \|\| 0\)\)/.test(srv));
  ok('너무 적으면 못 앉는다', /buy < MINI_MIN_BUY/.test(srv));
  ok('자리 수는 서버가 깎는다', /Math\.min\(SUTDA\.MAX_SEATS,\s*Math\.max\(SUTDA\.MIN_SEATS/.test(srv));
  ok('화면이 보낸 금액은 안 쓴다', !/miniHumanAct[\s\S]{0,400}\bamount\b/.test(srv));
  ok('행동 이름은 문자열로 굳혀 넘긴다', /SUTDA\.act\(t\.st, m\.seat, String\(action \|\| ''\)\)/.test(srv));
  ok('규칙이 막으면 그대로 되돌린다', /if \(!r\.ok\) return socket\.emit\('mini_error', r\.error\)/.test(srv));
  ok('일어설 때만 코인으로 바꾼다', /accounts\.miniPay\(s\.token, back, null\)/.test(srv));
  ok('판마다 코인을 만지지 않는다', /accounts\.miniPay\(sk\.token, 0, won\)/.test(srv));
  ok('나간 자리는 다시 정산되지 않는다', /t\.seats\[seat\] = null;/.test(srv));
  ok('창을 닫으면 죽은 것으로 친다',
     /if \(t\.st && !t\.st\.over && t\.st\.alive\[seat\]\)[\s\S]{0,120}'die'/.test(srv));
  ok('연결이 끊겨도 정산한다', /if \(socket\.mini\) miniStand\(socket, '연결이 끊겼어요\.'\)/.test(srv));
  ok('안 두고 버티면 대신 넘겨준다', /MINI_TURN_MS[\s\S]{0,600}acts\.includes\('check'\) \? 'check' : 'die'/.test(srv));
  ok('사람이 나가도 남은 사람은 계속한다', /miniLive\(t\) < 2\) miniFillSeats\(t\)/.test(srv));
  ok('사람이 다 나가면 테이블을 닫는다', /if \(miniHumans\(t\) === 0\) return miniCloseTable\(t\)/.test(srv));
  ok('멀티는 대기열로 붙인다', /const miniQueue = \{ 2: \[\], 3: \[\], 4: \[\] \}/.test(srv));
  ok('안 차면 AI 로 메워 시작한다', /MINI_FILL_MS[\s\S]{0,400}miniOpenTable\(n, mine\.map/.test(srv));
  ok('코인 차감에 자물쇠가 있다', /miniLocks\.add\(idl\)/.test(acc));
  ok('없는 계정 키를 만들지 않는다',
     /function miniStake[\s\S]{0,200}hasOwnProperty\.call\(db\.users, idl\)/.test(acc));
  ok('일어서는 정산은 전적을 안 센다', /if \(won !== null && won !== undefined\)/.test(acc));
}

console.log('\n⑤ 상대 패가 새지 않는다');
{
  const st = S.start({ seats: 4, first: 0, rand: rngOf(31) });
  const json = JSON.stringify(S.viewFor(st, 0));
  let leak = 0;
  for (let i = 1; i < 4; i++) for (const c of st.hands[i]) if (json.includes(`"id":${c.id}`)) leak++;
  ok('진행 중에는 남의 카드가 안 실린다', leak === 0, String(leak));
  ok('남의 족보도 안 실린다', S.viewFor(st, 0).seats.slice(1).every((s2) => s2.eval === null));
  ok('밑천과 건 돈은 보여준다', S.viewFor(st, 0).seats.every((s2) => typeof s2.stack === 'number'));
}

console.log('\n⑥ 경기장');
{
  ok('2인 경기장과 같은 껍데기를 쓴다', /#game, #mini \{/.test(html));
  ok('테이블 스킨도 같이 입는다', /#mini\.tbl-blue/.test(html));
  ok('스킨을 두 경기장에 다 칠한다', /for \(const id of \['game', 'mini'\]\)/.test(cli));
  ok('경기장이 있다', /<div id="mini">/.test(html));
  ok('남의 자리를 그린다', /id="mnSeats"/.test(html) && /mn-seat2/.test(cli));
  ok('판돈이 크게 보인다', /id="mnPotBig"/.test(html));
  ok('라운드를 알려준다', /id="mnRound"/.test(html) && /첫 번째 걸기/.test(cli));
  ok('남의 패는 뒷면으로 깐다', /else for \(let k = 0; k < st\.count; k\+\+\) \{[\s\S]{0,240}makeCard\(null\)/.test(cli));
  ok('선 표시가 있다', /mn-first/.test(cli) && /mn-first/.test(html));
  ok('족보를 자리로 보여준다', /mn-ladder/.test(cli) && /mn-rung/.test(html));
  ok('스나이퍼는 잡아먹는 자리를 칠한다', /beats\.includes\(i\) \? 'snipe'/.test(cli));
  ok('버튼 금액은 서버 값을 쓴다', /const amt = v\.amounts\[a\]/.test(cli));
  ok('두 번 눌러도 두 수가 안 나간다', /miniState\.turn = null;/.test(cli));
  ok('앉으면 로비를 접는다', /getElementById\('lobby'\)\.style\.display = 'none'/.test(cli));
  ok('일어서면 로비로 돌아온다', /function miniHide\(\)[\s\S]{0,400}lobby'\)\.style\.display = 'flex'/.test(cli));
  ok('온라인 대전으로 앉을 수 있다', /window\.miniQuick/.test(cli) && /mini_quick/.test(cli));
  ok('매칭 대기 화면이 있다', /id="miniWaitModal"/.test(html) && /mini_queue/.test(cli));
  ok('기다리다 취소할 수 있다', /window\.miniCancelQueue/.test(cli) && /mini_cancel/.test(srv));
  ok('판이 열리면 대기창이 닫힌다', /mini_state[\s\S]{0,120}miniWaitModal'\)\.classList\.remove\('show'\)/.test(cli));
  ok('남은 시간을 센다', /miniClock = setInterval/.test(cli));
  ok('멀티에서는 다음 판을 기다린다', /r\.view\.mode === 'solo'/.test(cli));
  ok('자리 수를 고를 수 있다', /miniPickSeats/.test(cli) && /id="mnSeatSeg"/.test(html));
  ok('ESC 로 닫힌다', /'miniModal',\s*\(\) => miniClose\(\)/.test(cli));
  // 버튼 이름이 규칙의 행동과 하나씩 맞는가 — 여기가 어긋나면 누를 수 없는 수가 생긴다
  const acts = ['check', 'ping', 'quarter', 'half', 'ttadang', 'call', 'allin', 'die'];
  for (const a of acts) ok(`${a} 버튼이 있다`, new RegExp(`\\b${a}:`).test(cli.slice(cli.indexOf('MINI_LABEL'), cli.indexOf('MINI_ORDER'))));
  ok('그리는 순서에도 다 들어 있다',
     acts.every((a) => cli.slice(cli.indexOf('MINI_ORDER'), cli.indexOf('MINI_ACT_KO')).includes(`'${a}'`)));
}

console.log('\n⑥‴′ 화투 에디션');
{
  const acc = fs.readFileSync(src + '/accounts.js', 'utf8');
  for (const id of ['back_hwatu', 'np_hwatu', 'tbl_hwatu', 'face_hwatu'])
    ok(`상점에 ${id}`, new RegExp(`${id}:\\s*\\{`).test(acc));
  ok('세트로 묶었다', /hwatu:\s*\{ back: 'back_hwatu'/.test(acc));
  ok('뽑기에도 들어간다', /'back_hwatu'/.test(acc.slice(acc.indexOf('const GACHA_TIER'), acc.indexOf('const TIERS'))));
  // 화면 표들 — 한 곳만 빠져도 갈아입어도 안 바뀐다
  for (const [map, cls] of [['CBP', 'cb-hwatu'], ['TBLP', 'tp-hwatu'], ['CFP', 'cfp-hwatu'],
                            ['NP_CLASS', 'np-hwatu'], ['TABLE_CLS', 'tbl-hwatu'], ['FACE_CLS', 'cf-hwatu']])
    ok(`${map} 에 화투`, cli.includes(`'${cls}'`), cls);
  // 우리 카드 종류가 곧 화투 월이다 — 2·3·4·6 넷 다 그림이 있어야 한다
  for (const k of [2, 3, 4, 6])
    ok(`${k}월 그림`, new RegExp(`#mini\\.cf-hwatu \\.card\\[data-kind="${k}"\\]::after`).test(html));
  ok('숫자가 그림 위로 온다', /#mini\.cf-hwatu \.card > \* \{ position:relative; z-index:1/.test(html));
  ok('미니게임 경기장에도 앞면 스킨이 먹는다', (html.match(/#mini\.cf-/g) || []).length >= 10);
  ok('뒷면도 내 카드백으로', /myAccount && CB_CLASS\[myAccount\.cardBack\]/.test(cli));
}

console.log('\n⑥‴″ 결과를 볼 시간');
{
  ok('결과가 판을 덮지 않는다', /#miniOver \{[\s\S]{0,200}position:absolute/.test(html));
  ok('배경을 어둡게 깔지 않는다', !/#miniOver \{[\s\S]{0,300}inset:0/.test(html));
  ok('패를 먼저 보여주고 결과를 얹는다', /reason === 'showdown'[\s\S]{0,60}setTimeout\(showRes, 1600\)/.test(cli));
  ok('다음 판까지 남은 시간을 센다', /초 뒤 다음 판/.test(cli));
  ok('서버도 넉넉히 기다린다', /MINI_NEXT_MS = 9000/.test(srv));
  ok('족보표에 실제 카드를 놓는다', /mn-trcards/.test(cli) && /\.mn-trcards \.card/.test(html));
  ok('예시는 실제로 나올 수 있는 조합', /const MINI_EX = \{/.test(cli));
}

console.log('\n⑥″ 한 화면에 들어간다');
{
  // 처음 들어가면 버튼이 화면 밖에 있던 두 가지 원인
  ok('좌측 버튼 묶음을 판 위에 띄운다',
     /#miniControls \{ position:absolute/.test(html));
  ok('흐름에 끼우지 않는다', !/id="miniControls" class=/.test(html));
  ok('자리는 그 아래로 내려온다', /\.mn-top \{ padding-top:50px/.test(html));
  // 하단 제스처바 — #game 과 같은 줄에 묶여 8px 로 덮어써지고 있었다
  const mob = html.slice(html.indexOf('@media (max-width: 600px)'), html.indexOf('@media (max-width:520px)') + 1
    || html.length);
  ok('미니게임은 아래 여백을 따로 준다',
     /#mini \{ padding:calc\(8px \+ var\(--safe-t\)\) 8px calc\(10px \+ var\(--safe-b\)\); \}/.test(html));
  ok('제스처바만큼 띄운다', /calc\(1[04]px \+ var\(--safe-b\)\)/.test(html));
  // 버튼 자리를 미리 비워 둔다 — 내 차례에 생기면서 판이 아래로 밀리면 안 된다
  ok('버튼 자리를 미리 잡아 둔다', /\.mn-btns \{ min-height:46px/.test(html));
  ok('가운데가 먼저 줄어든다', /\.mn-mid \{ flex:1 1 0; min-height:0; \}/.test(html));
}

console.log('\n⑥‴ 나눠주는 모션');
{
  ok('나눠주는 애니메이션이 있다', /@keyframes mnDeal/.test(html) && /\.card\.mn-deal/.test(html));
  ok('새로 온 카드만 날린다', /function miniDealtCount/.test(cli));
  ok('판이 새로 서면 전부 다시 날린다', /if \(count < had\)[\s\S]{0,160}miniSeen = \[\]/.test(cli));
  ok('다시 그려도 또 날리지 않는다', /miniSeen\[seat\] = count;[\s\S]{0,120}return Math\.max\(0, count - had\)/.test(cli));
  ok('한 장씩 늦게 떨어진다', /animationDelay/.test(cli));
  ok('내 패도 상대 패도 날아온다',
     (cli.match(/classList\.add\('mn-deal'\)/g) || []).length >= 2);
  ok('자리에서 일어나면 기억을 지운다', /miniSitting = false; miniSeen = \[\]/.test(cli));
  ok('모션을 끈 사람은 건드리지 않는다',
     /prefers-reduced-motion[\s\S]{0,120}\.mn-deal \{ animation:none/.test(html));
}

console.log('\n⑥′ 배팅 칩');
{
  ok('칩을 그린다', /function chipsEl/.test(cli) && /\.chip \{/.test(html));
  ok('큰 단위부터 헌다', /const CHIP_UNITS = \[500, 100, 50, 10, 1\]/.test(cli));
  ok('자리마다 칩이 놓인다', /chipsEl\(st\.alive \? st\.roundBet : 0/.test(cli));
  ok('판돈도 칩으로 쌓인다', /id="mnPotChips"/.test(html) && /chipsEl\(v\.pot/.test(cli));
  ok('늘었을 때만 떨어진다', /const grew = v\.pot >/.test(cli));
  // 칩으로 쌓이려면 금액이 기본 단위로 떨어져야 한다
  const st = S.start({ seats: 3, first: 0 });
  S.act(st, 0, 'ping');
  const A = S.raiseAmounts(st, 1);
  ok('배팅액이 기본 단위로 떨어진다',
     [A.ping, A.half, A.quarter, A.ttadang].every((x) => x % S.ANTE === 0),
     JSON.stringify(A));
}

console.log('\n⑦ 설명서');
{
  const box = html.slice(html.indexOf('id="rulesMiniModal"'), html.indexOf('id="rulesModal"'));
  ok('미니게임 전용 설명서가 있다', /data-i18n-block="rulesMini"/.test(box));
  ok('로비 배우기 줄에서 열린다', /onclick="toggleRulesMini\(true\)"/.test(html));
  ok('여는 함수가 있다', /window\.toggleRulesMini/.test(cli));
  for (const w of ['지배자', '최고급', '중간계', '최하위', '꼴찌', '거울쌍 10'])
    ok(`설명서에 ${w}`, box.includes(w));
  // 도박판 말(삥·하프·쿼터·따당·올인·다이) 대신 경매장 말을 쓴다
  for (const w of ['판 열기', '크게 올림', '살짝 올림', '두 배 올림', '전부 걸기', '접기'])
    ok(`거는 법 ${w}`, box.includes(w));
  for (const w of ['삥', '하프', '쿼터', '따당', '올인'])
    ok(`도박판 말 ${w} 는 안 쓴다`, !box.includes(w), w);
  // 화면 버튼도 같은 말이어야 한다 — 설명서와 버튼이 다르면 규칙을 두 번 배워야 한다
  const labels = cli.slice(cli.indexOf('const MINI_LABEL'), cli.indexOf('const MINI_ORDER'));
  for (const w of ['판 열기', '넘기기', '살짝 올림', '크게 올림', '두 배 올림', '전부 걸기', '맞추기', '접기'])
    ok(`버튼 ${w}`, labels.includes(w));
  ok('두 라운드라고 적혀 있다', /두 번째 배팅|한 장 더/.test(box));
  ok('선은 이긴 사람이 잡는다고 적혀 있다', /선은[\s\S]{0,20}이긴/.test(box));
  ok('2~4인이라고 적혀 있다', /2~4인|2～4인/.test(box));
  // 설명서 숫자가 규칙과 같은가 — 어긋나면 사람이 규칙을 잘못 배운다
  ok('기본 단위가 규칙과 같다', box.includes(`🪙${S.ANTE}`), String(S.ANTE));
  ok('소지금 상한이 규칙과 같다', box.includes(`🪙${S.BUY_IN}`), String(S.BUY_IN));
  const sums = new Set();
  const deck = S.makeDeck();
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++)
    sums.add(deck[i].kind + deck[j].kind);
  ok('표의 합이 실제 나올 수 있는 합과 같다',
     [...sums].sort((a, b) => a - b).join() === [4, 5, 6, 7, 8, 9, 10, 12].join(), [...sums].join());
}

console.log('\n⑧ 영어판');
{
  const i18n = fs.readFileSync(src + '/public/i18n.js', 'utf8');
  const b = i18n.slice(i18n.indexOf('rulesMini: `'), i18n.indexOf('rules2: `'));
  ok('설명서 영어판이 있다', b.length > 500, String(b.length));
  ok('영어판에 한글이 안 남았다', !/[가-힣]/.test(b.replace(/\/\/.*$/gm, '')),
     (b.replace(/\/\/.*$/gm, '').match(/[가-힣]+/g) || []).slice(0, 3).join(','));
  ok('닫기 버튼이 살아 있다', /toggleRulesMini\(false\)/.test(b));
  for (const k of ['미니게임', '체크', '콜', '다이', '삥', '하프', '쿼터', '따당', '올인', '지배자', '꼴찌'])
    ok(`${k} 번역이 있다`, i18n.includes(`'${k}':`));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
