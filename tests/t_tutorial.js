// 튜토리얼 — 어떤 판을 배울지 고르고, 모드마다 차근차근 넘겨 본다
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };
const htm = fs.readFileSync(R + '/public/index.html', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
const i18nSrc = fs.readFileSync(R + '/public/i18n.js', 'utf8');

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

console.log('\n② 클래식은 실제로 한 판 두면서');
ok('클래식만 실전으로 간다', /if \(mode === 'classic'\) return startTutorial\(\);/.test(cli));
ok('실전이라고 표시한다', /<span class="tp-tag">실전<\/span>/.test(htm));
ok('기존 실전 단계가 그대로 있다', /const TUT_STEPS = \[/.test(cli)
   && (cli.match(/\{ id: '/g) || []).length >= 14);

console.log('\n③ 나머지 넷은 차근차근 넘겨 본다');
// 엔진이 달라 실전 단계를 끼워 넣을 수 없다 — 대신 읽고 바로 해볼 수 있게 한다
const KO = (() => {
  const at = cli.indexOf('const TUT_SLIDES = {');
  return cli.slice(at, cli.indexOf('window.tutPickOpen'));
})();
for (const m of ['item', 'twelve', 'quad', 'mini']) {
  const blk = KO.match(new RegExp(`\\n  ${m}: \\{[\\s\\S]*?\\n  \\},`));
  const n = blk ? (blk[0].match(/\{ h: |\{ h:'/g) || []).length : 0;
  ok(`${m} 안내가 있다 (${n}장)`, n >= 4, String(n));
}
ok('마지막에서 그 모드를 바로 시작한다',
   /if \(next >= set\.slides\.length\) \{ tutSlideClose\(\); set\.go\(\); return; \}/.test(cli));
ok('시작 함수가 모드마다 붙어 있다',
   /go: \(\) => startItemGame\('easy'\)/.test(cli) && /go: \(\) => tvSolo\('easy'\)/.test(cli)
   && /go: \(\) => q4Start\(3\)/.test(cli) && /go: \(\) => miniGo\(4, false\)/.test(cli));
ok('마지막 장에서 버튼 이름이 바뀐다',
   /next\.textContent = tsAt === set\.slides\.length - 1 \? '직접 해보기 ▶' : '다음 →';/.test(cli));
ok('첫 장에서는 이전이 숨는다', /prev\.style\.visibility = tsAt === 0 \? 'hidden' : '';/.test(cli));
ok('몇 장 중 몇 번째인지 보인다', /id="tsDots"/.test(htm) && /\.ts-dots i\.on \{/.test(htm));

console.log('\n④ 영어로도 배울 수 있다');
{
  const FF = loadFF();
  ok('영문 한 벌이 있다', !!FF.TUT && Object.keys(FF.TUT).length === 4, Object.keys(FF.TUT || {}).join(','));
  // 본문에 <b> 가 섞여 문장 단위로 못 짝짓는다 — 설명서처럼 한 벌을 통째로 바꾼다
  ok('본문을 통째로 갈아 끼운다',
     /const en = \(typeof FF !== 'undefined' && FF\.lang && FF\.lang\(\) === 'en' && FF\.TUT\) \? FF\.TUT\[tsMode\] : null;/.test(cli));
  const koCount = (m) => {
    const blk = KO.match(new RegExp(`\\n  ${m}: \\{[\\s\\S]*?\\n  \\},`))[0];
    return (blk.match(/\{ h: /g) || []).length;
  };
  ok('장수가 두 벌 같다', ['item', 'twelve', 'quad', 'mini'].every((m) => FF.TUT[m].slides.length === koCount(m)));
  ok('영문에 한국어가 안 섞여 있다',
     !/[가-힣]/.test(JSON.stringify(FF.TUT)), (JSON.stringify(FF.TUT).match(/[가-힣]+/g) || []).slice(0, 3).join(','));
  ok('고르는 창도 번역된다',
     ['어떤 판을 배워볼까요? 처음이면 클래식부터가 좋아요.', '직접 한 판 두면서 배워요 · 처음이라면 여기',
      '실전', '클래식에 아이템이 얹힌 판', '다음 →', '직접 해보기 ▶']
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
