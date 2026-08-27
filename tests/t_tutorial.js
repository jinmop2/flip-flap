// 튜토리얼 — 어떤 판을 배울지 고르고, 모드마다 차근차근 넘겨 본다
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };
const htm = fs.readFileSync(R + '/public/index.html', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
const i18nSrc = fs.readFileSync(R + '/public/i18n.js', 'utf8');
const c4 = fs.readFileSync(R + '/public/client4.js', 'utf8');

function loadFF() {
  const sb = { navigator: { language: 'en', languages: ['en'] },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { readyState: 'complete', documentElement: {}, body: null, addEventListener() {},
                querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => null }) },
    requestAnimationFrame() {}, MutationObserver: function () { this.observe = () => {}; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 } };
  sb.window = sb;
  return new Function('window', 'navigator', 'localStorage', 'document', 'requestAnimationFrame',
    'MutationObserver', 'NodeFilter', 'globalThis', i18nSrc + '\nreturn window.FF;')(
    sb, sb.navigator, sb.localStorage, sb.document, sb.requestAnimationFrame, sb.MutationObserver, sb.NodeFilter, sb);
}

console.log('\n① 홈의 튜토리얼은 먼저 무엇을 배울지 묻는다');
// 예전엔 누르면 곧장 클래식 한 판이 시작됐다 — 다른 모드는 배울 길이 없었다
ok('바로 시작하지 않는다', /onclick="tutPickOpen\(\)"[\s\S]{0,400}튜토리얼<\/button>/.test(htm)
   && !/onclick="startTutorial\(\)"/.test(htm));
ok('고르는 창이 있다', /id="tutPickModal"/.test(htm) && /window\.tutPickOpen = function/.test(cli));
const MODES = ['classic', 'item', 'twelve', 'quad', 'mini'];
ok(`다섯 모드가 다 있다`, MODES.every((m) => new RegExp(`tutStart\\('${m}'\\)`).test(htm)));

console.log('\n② 클래식은 처음 오는 사람의 자리');
// 다섯 다 실전이 됐으니 '클래식만 실전' 이 아니라 '클래식부터' 가 맞다
ok('클래식을 먼저 권한다', /<span class="tp-tag">추천<\/span>/.test(htm)
   && /처음이라면 여기부터/.test(htm));
ok('기존 실전 단계가 그대로 있다', /const TUT_STEPS = \[/.test(cli)
   && (cli.match(/\{ id: '/g) || []).length >= 14);
ok('튜토리얼은 서버가 기다려 준다', /socket\.emit\('tut_hold'\)/.test(cli)
   && /function tutGate\(roomId, fn\)/.test(fs.readFileSync(R + '/server.js', 'utf8')));

console.log('\n③ 다섯 모드 전부 실제 판을 두면서 배운다');
// 넘겨 보는 안내는 읽고 나면 남는 게 없다. 판이 그 상황에 닿는 순간 짚어 준다.
ok('모드마다 단계 목록이 있다',
   ['TUT_STEPS', 'TUT_ITEM', 'TUT_TV', 'TUT_Q4', 'TUT_MN'].every((n) => new RegExp('const ' + n + ' = \\[').test(cli)));
ok('다섯 모드가 실제 판을 연다',
   /classic: \{ steps: \(\) => TUT_STEPS,[\s\S]{0,120}createRoom\(true\)/.test(cli)
   // 아이템전은 각본 덱이 걸린 방이어야 한다 — 평범한 방을 열면 아이템을
   // 한 장도 못 보고 끝나는 판이 생긴다.
   && /item:[\s\S]{0,420}itemMode: true, tutorial: true \}\);/.test(cli)
   && /twelve:  \{ steps: \(\) => TUT_TV,    go: \(\) => tvSolo\('easy'\) \}/.test(cli)
   && /quad:    \{ steps: \(\) => TUT_Q4,    go: \(\) => q4Start\(3\) \}/.test(cli)
   && /mini:    \{ steps: \(\) => TUT_MN,    go: \(\) => miniGo\(3, false\) \}/.test(cli));

console.log('\n③-2 튜토리얼은 각본대로 돈다');
{
  const srv = fs.readFileSync(R + '/server.js', 'utf8');
  // 배울 것을 우연에 맡기면 배우지 못하고 끝나는 사람이 생긴다.
  ok('선공은 늘 사람이다', /game\.tutFirst = 1;/.test(srv)
     && /game\.auctioneer = game\.tutFirst \|\|/.test(srv));
  ok('첫 턴 보너스·둘째 턴 덤', /\{ item: 'bonus', id: 'it_tut_b' \}/.test(srv)
     && /\{ item: 'tip', id: 'it_tut_t' \}/.test(srv));
  ok('손에 들어올 아이템도 정해 둔다', /game\.itemDeck = \[\.\.\.rest, 'bomb', 'magnify'\]/.test(srv));
  ok('아이템전 튜토리얼 방이 열린다', /itemMode: !!itemMode,/.test(srv)
     && !/itemMode: !!itemMode && !tutorial/.test(srv));
  // 배팅 카드가 어디로 가는지 — 제일 자주 놓치는 규칙이라 방금 낸 두 장을 집어 보여 준다
  ok('낸 카드의 행방을 짚는다', /id: 'swap_rule'/.test(cli) && /id: 'where_rule'/.test(cli)
     && /ts-dst/.test(cli));
  // 밀린 안내는 그때의 판으로 그려야 "방금 낸 카드" 를 집을 수 있다
  ok('밀린 안내는 그때 판을 담아 둔다', /tutQueue\.push\(\{ st, view/.test(cli)
     && /const q = tutQueue\.shift\(\); return tutShow\(q\.st, q\.view\);/.test(cli));
  ok('아이템 종류를 먼저 보여 준다', /id: 'i_kinds'/.test(cli) && /tut-kinds/.test(cli));
}
// 엔진마다 상태 모양이 달라서 재는 대상만 바꾼다
ok('재는 방식은 하나다', /function tutTickWith\(view\)/.test(cli) && /window\.tutTickWith = tutTickWith;/.test(cli));
ok('네 엔진에 다 물려 있다',
   /tvRender\(v\);\s*\n\s*tutTickWith\(v\);/.test(cli)
   && /miniState = v;\s*\n\s*tutTickWith\(v\);/.test(cli)
   && /window\.tutTickWith\(s\);/.test(c4)
   && /tutTick\(\);/.test(cli));
// 슬라이드로 넘겨 보던 길은 걷어냈다 — 남겨 두면 죽은 코드가 된다
ok('넘겨 보는 안내는 안 남아 있다',
   !/TUT_SLIDES/.test(cli) && !/tutSlideDraw/.test(cli) && !/tutSlideModal/.test(htm));
// 단계마다 언제 뜰지 조건이 있어야 판을 따라간다
ok('모든 단계에 조건이 있다', (() => {
  for (const n of ['TUT_ITEM', 'TUT_TV', 'TUT_Q4', 'TUT_MN']) {
    const at = cli.indexOf('const ' + n + ' = [');
    const blk = cli.slice(at, cli.indexOf('\n];', at));
    const ids = (blk.match(/\{ id: '/g) || []).length;
    const whens = (blk.match(/when: /g) || []).length;
    if (ids < 5 || ids !== whens) return false;
  }
  return true;
})());

console.log('\n④ 영어로도 배울 수 있다');
{
  const FF = loadFF();
  // 실전 튜토리얼 문구는 한 문장 안에 <b> 가 섞여 있어 조각으로 짝지으면 어순이
  // 깨진다 — tutShow 가 문장을 통째로 바꾼 뒤 넣는다(사전에 문장 전체가 있다).
  ok('문장을 통째로 바꾼다', /const text = T\(typeof st\.text === 'function' \? st\.text\(_v\) : st\.text\);/.test(cli));
  ok('넘겨 보던 영문 한 벌은 걷어냈다', !FF.TUT);
  ok('고르는 창은 번역된다',
     ['직접 한 판 두면서 배웁니다. 처음이면 클래식부터가 좋아요.', '처음이라면 여기부터', '추천',
      '클래식에 아이템이 얹힌 판', '두 장으로 겨루는 섯다식 판']
       .every((k) => FF.t(k) !== k));
}

console.log('\n⑤ 솔로 패널에서 미니게임 족보·설명서 버튼을 뺐다');
// 다른 모드에는 없는 버튼이라 미니게임만 특별해 보였다. 설명서는 메뉴에 있다.
{
  const at = htm.indexOf('id="soloModal"');
  const solo = htm.slice(at, htm.indexOf('id="multiModal"'));
  ok('족보 보기 버튼이 없다', !/miniRank\(true\)/.test(solo));
  ok('설명서 버튼이 없다', !/toggleRulesMini\(true\)/.test(solo));
  // 판 안 메뉴에는 그대로 있어야 한다
  ok('판 안 메뉴에는 남아 있다', /mnMenu\(false\);miniRank\(true\)/.test(htm)
     && /mnMenu\(false\);toggleRulesMini\(true\)/.test(htm));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
