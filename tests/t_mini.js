// 미니게임 — 규칙 모듈은 t_sutda 가 본다. 여기서는 붙는 부분을 본다:
// AI 가 말이 되게 두는가, 화면·설명서·코인 계산이 서로 어긋나지 않는가.
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
// xorshift 는 작은 씨앗으로 시작하면 처음 몇 개가 전부 0에 가깝게 나온다.
// 그대로 쓰면 "18% 확률" 이 늘 참이 되어 시험이 거짓말을 한다 — 미리 몇 번 돌린다.
const rngOf = (seed) => {
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 12; i++) next();
  return next;
};

console.log('① AI 가 규칙 안에서 둔다');
{
  let bad = 0, hands = 0, folded = 0, showdown = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const st = S.deal2(rngOf(seed));
    const r = rngOf(seed * 7 + 1);
    let guard = 0;
    while (!st.over && guard++ < 40) {
      const v = S.viewFor(st, st.turn);
      const a = S.aiAction(v, r);
      if (!a || !v.actions.includes(a)) { bad++; break; }
      S.act(st, st.turn, a);
    }
    if (!st.over) { bad++; continue; }
    hands++;
    if (st.reason === 'fold') folded++; else showdown++;
  }
  ok('400판 모두 규칙 안의 수만 둔다', bad === 0, `${bad}판 어긋남`);
  ok('스스로 판을 끝낸다', hands === 400, String(hands));
  ok('접기도 한다', folded > 0, String(folded));
  ok('끝까지 가기도 한다', showdown > 0, String(showdown));
}

console.log('\n② AI 가 패 세기를 읽는다');
{
  // 같은 난수로 센 패와 약한 패를 비교 — 센 패에서 더 자주 건다.
  const bet = (hand) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const st = S.deal2(rngOf(seed));
      st.hands[0] = hand; st.turn = 0;
      const a = S.aiAction(S.viewFor(st, 0), rngOf(seed * 3));
      if (a === 'bet' || a === 'raise') n++;
    }
    return n;
  };
  const strong = bet([{ kind: 2, grade: 1, id: 201 }, { kind: 2, grade: 2, id: 202 }]);  // 합 4
  const weak = bet([{ kind: 6, grade: 9, id: 609 }, { kind: 6, grade: 10, id: 610 }]);   // 합 12
  ok('센 패로는 거의 항상 건다', strong > 280, String(strong));
  ok('약한 패로는 훨씬 덜 건다', weak < strong * 0.4, `${weak} vs ${strong}`);
  ok('그래도 가끔은 지른다 (읽히지 않게)', weak > 0, String(weak));
}

console.log('\n③ 받아야 할 때');
{
  const call = (hand) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const st = S.deal2(rngOf(seed));
      st.hands[0] = hand; st.turn = 1;
      S.act(st, 1, 'bet');                     // 상대가 먼저 걸었다
      const a = S.aiAction(S.viewFor(st, 0), rngOf(seed * 3));
      if (a === 'call' || a === 'raise') n++;
    }
    return n;
  };
  const strong = call([{ kind: 2, grade: 1, id: 201 }, { kind: 2, grade: 2, id: 202 }]);
  const weak = call([{ kind: 6, grade: 9, id: 609 }, { kind: 6, grade: 10, id: 610 }]);
  ok('센 패는 받는다', strong > 280, String(strong));
  ok('꼴찌 패는 대개 접는다', weak < 120, String(weak));
}

console.log('\n④ 서버가 돈을 쥔다');
{
  ok('참가금은 서버가 규칙에서 꺼낸다', /miniStake\(socket\.token,\s*SUTDA\.ANTE\)/.test(srv));
  ok('화면이 보낸 금액은 안 쓴다', !/mini_act[\s\S]{0,400}\bamount\b/.test(srv));
  ok('배팅 단위도 규칙에서 온다', /SUTDA\.BET_UNIT/.test(srv));
  ok('코인이 모자라면 판이 안 열린다', /paid\.error[\s\S]{0,80}mini_error/.test(srv));
  ok('막힌 수는 뺀 돈을 되돌린다', /if \(!r\.ok\)[\s\S]{0,200}miniPay\(socket\.token, need, false\)/.test(srv));
  ok('정산은 한 번만', /if \(!m \|\| m\.paid\) return;[\s\S]{0,40}m\.paid = true/.test(srv));
  ok('창을 닫으면 다이 처리', /mini_leave[\s\S]{0,200}'fold'/.test(srv));
  ok('코인 차감에 자물쇠가 있다', /miniLocks\.add\(idl\)/.test(acc));
  ok('없는 계정 키를 만들지 않는다', /hasOwnProperty\.call\(db\.users, idl\)[\s\S]{0,600}miniStake|miniStake[\s\S]{0,300}hasOwnProperty\.call\(db\.users, idl\)/.test(acc));
}

console.log('\n⑤ 상대 패가 새지 않는다');
{
  const st = S.deal2(rngOf(21));
  const v = S.viewFor(st, 0);
  const json = JSON.stringify(v);
  const oppIds = st.hands[1].map((c) => c.id);
  ok('진행 중에는 상대 카드가 안 실린다',
     !oppIds.some((id) => json.includes(`"id":${id}`)), json.slice(0, 120));
  ok('상대 족보도 안 실린다', v.oppEval === null);
  // 다이로 끝난 판도 마찬가지
  S.act(st, st.turn, 'fold');
  const after = JSON.stringify(S.viewFor(st, st.winner));
  ok('다이로 끝나도 안 깐다',
     !S.viewFor(st, st.winner).oppHand && !after.includes('"oppEval":{'));
}

console.log('\n⑥ 화면');
{
  ok('로비에 들어가는 문이 있다', /onclick="miniOpen\(\)"/.test(html));
  ok('판을 그리는 화면이 있다', /id="miniPlay"/.test(html) && /id="mnMyHand"/.test(html));
  ok('상대 자리는 뒷면으로 깐다', /oppCount; i\+\+\) opp\.appendChild\(makeCard\(null\)\)/.test(cli));
  ok('족보를 이름만이 아니라 자리로 보여준다', /mn-ladder/.test(cli) && /mn-rung/.test(html));
  ok('스나이퍼는 잡아먹는 자리를 칠한다', /beats\.includes\(i\) \? 'snipe'/.test(cli));
  ok('족보표가 있다', /id="miniRankModal"/.test(html) && /window\.miniRank/.test(cli));
  ok('두 번 눌러도 두 수가 안 나간다', /miniState\.turn = null;/.test(cli));
  ok('ESC 로 닫힌다', /'miniModal',\s*\(\) => miniClose\(\)/.test(cli));
  ok('금액을 화면에서 계산하지 않는다', !/socket\.emit\('mini_act',\s*\{[^}]*amount/.test(cli));
}

console.log('\n⑦ 설명서');
{
  const box = html.slice(html.indexOf('id="rulesMiniModal"'), html.indexOf('id="rulesModal"'));
  ok('미니게임 전용 설명서가 있다', /data-i18n-block="rulesMini"/.test(box));
  ok('로비 배우기 줄에서 열린다', /onclick="toggleRulesMini\(true\)"/.test(html));
  ok('여는 함수가 있다', /window\.toggleRulesMini/.test(cli));
  for (const w of ['지배자', '최고급', '중간계', '최하위', '꼴찌', '거울쌍 10'])
    ok(`설명서에 ${w}`, box.includes(w));
  ok('앞자리 합이 작을수록 강하다고 적혀 있다', /작을수록 강합니다/.test(box));
  ok('다이로 끝나면 안 깐다고 적혀 있다', /패는 안 깝니다/.test(box));
  // 설명서 숫자가 규칙과 같은가 — 여기가 어긋나면 사람이 규칙을 잘못 배운다
  ok('참가금이 규칙과 같다', box.includes(`🪙${S.ANTE}`), String(S.ANTE));
  ok('배팅 단위가 규칙과 같다', box.includes(`🪙${S.BET_UNIT}`), String(S.BET_UNIT));
  ok('레이즈 횟수가 규칙과 같다', box.includes('세 번까지') && S.MAX_RAISE === 3);
  // 표에 적힌 합이 실제로 나올 수 있는 합과 같은가
  const sums = new Set();
  const deck = S.makeDeck();
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++)
    sums.add(deck[i].kind + deck[j].kind);
  const listed = [4, 5, 6, 7, 8, 9, 10, 12];
  ok('표의 합이 실제 나올 수 있는 합과 같다',
     [...sums].sort((a, b) => a - b).join() === listed.join(), [...sums].join());
}

console.log('\n⑧ 영어판');
{
  const i18n = fs.readFileSync(src + '/public/i18n.js', 'utf8');
  const b = i18n.slice(i18n.indexOf('rulesMini: `'), i18n.indexOf('rules2: `'));
  ok('설명서 영어판이 있다', b.length > 500, String(b.length));
  ok('영어판에 한글이 안 남았다', !/[가-힣]/.test(b.replace(/\/\/.*$/gm, '')),
     (b.replace(/\/\/.*$/gm, '').match(/[가-힣]+/g) || []).slice(0, 3).join(','));
  ok('닫기 버튼이 살아 있다', /toggleRulesMini\(false\)/.test(b));
  for (const k of ['미니게임', '체크', '콜', '다이', '지배자', '꼴찌'])
    ok(`${k} 번역이 있다`, i18n.includes(`'${k}':`));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
