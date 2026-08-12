// 언어 — 한국어 원문을 열쇠로 쓰는 방식이라, 원문이 바뀌면 짝이 조용히 끊긴다.
// 여기서 그걸 잡고, 지금 얼마나 덮였는지도 같이 센다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..');
const i18nSrc = fs.readFileSync(src + '/public/i18n.js', 'utf8');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// 사전을 실제로 읽어 온다 (브라우저 전역 없이 돌리려고 가짜 창을 만든다)
function loadDict() {
  const sandbox = {
    navigator: { language: 'en', languages: ['en'] },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete', documentElement: {}, body: null,
      addEventListener() {}, querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => null }),
    },
    requestAnimationFrame() {},
    MutationObserver: function () { this.observe = () => {}; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  };
  sandbox.window = sandbox;
  const fn = new Function('window', 'navigator', 'localStorage', 'document',
    'requestAnimationFrame', 'MutationObserver', 'NodeFilter', 'globalThis',
    i18nSrc + '\nreturn window.FF;');
  return fn(sandbox, sandbox.navigator, sandbox.localStorage, sandbox.document,
    sandbox.requestAnimationFrame, sandbox.MutationObserver, sandbox.NodeFilter, sandbox);
}

console.log('① 뼈대');
const FF = loadDict();
{
  ok('사전을 읽었다', !!FF && !!FF.DICT, typeof FF);
  ok('바꾸는 함수', typeof FF.t === 'function');
  ok('언어를 고를 수 있다', typeof FF.setLang === 'function' && typeof FF.lang === 'function');
  ok('사람이 골랐는지 알 수 있다', typeof FF.langChosen === 'function');
  // 저장된 게 없으면 기기 언어를 따른다 — 위 가짜 창은 영어다
  ok('기기 언어를 따른다', FF.lang() === 'en', FF.lang());
  ok('덩어리 갈아끼우기', !!FF.BLOCKS && !!FF.BLOCKS.rules2 && !!FF.BLOCKS.rules4);
}

console.log('\n② 화면에 붙어 있는가');
{
  ok('i18n.js 를 먼저 읽는다',
     html.indexOf('src="i18n.js"') > 0 && html.indexOf('src="i18n.js"') < html.indexOf('src="client.js"'));
  ok('설정에 언어 칸이 있다', /class="sp-row sp-lang"/.test(html));
  ok('가입할 때도 고를 수 있다', /class="nick-lang"/.test(html));
  ok('두 곳 다 같은 함수를 쓴다', (html.match(/onclick="pickLang\('(ko|en)'\)"/g) || []).length === 4);
  ok('바꾸는 함수가 있다', /function pickLang/.test(cli));
  ok('바꿔도 새로고침하지 않는다', !/function pickLang[\s\S]{0,220}?location\.reload/.test(cli));
  ok('설명서 두 개가 덩어리로 묶였다',
     /id="rulesBox" class="rules-box" data-i18n-block="rules2"/.test(html)
     && /id="rulesBox4" class="rules-box" data-i18n-block="rules4"/.test(html));
  ok('되돌릴 원문을 보관한다', /el\.dataset\.i18nKo = el\.innerHTML/.test(i18nSrc));
}

console.log('\n③ 번역이 실제로 되는가');
{
  ok('짧은 말', FF.t('나가기') === 'Leave', FF.t('나가기'));
  ok('앞뒤 공백은 살린다', FF.t('  나가기 ') === '  Leave ', JSON.stringify(FF.t('  나가기 ')));
  ok('값이 섞인 말(패턴)', FF.t('덱 12장') === 'Deck 12', FF.t('덱 12장'));
  // 끼워 넣는 값도 사전을 거친다 — 안 그러면 문장만 영어고 이름은 한국어로 남는다
  ok('이름이 든 말 · 이름도 번역', FF.t('경매왕 덕배 님이 낙찰!') === 'Auction King Deokbae wins the lot!',
     FF.t('경매왕 덕배 님이 낙찰!'));
  ok('사전에 없는 이름은 그대로', FF.t('철수 님이 낙찰!') === '철수 wins the lot!',
     FF.t('철수 님이 낙찰!'));
  // 사전에 없으면 한국어가 그대로 나와야 한다 — 깨진 열쇠가 보이면 안 된다
  ok('모르는 말은 한국어 그대로', FF.t('없는말입니다') === '없는말입니다');
  ok('영어는 건드리지 않는다', FF.t('Ranking') === 'Ranking');
  ok('빈 값도 안전', FF.t('') === '' && FF.t(null) === '');

  // 설명서 영어판에 한글이 남아 있으면 반쯤 번역된 채로 나간다
  for (const k of ['rules2', 'rules4']) {
    const ko = (FF.BLOCKS[k].match(/[가-힣]+/g) || []);
    ok(`${k} 영어판에 한글이 없다`, ko.length === 0, ko.slice(0, 5).join(','));
  }
}

console.log('\n④ 원문이 바뀌면 짝이 끊긴다');
{
  // 사전의 열쇠는 어딘가에 실제로 있는 한국어여야 한다. 원문을 고치고 사전을
  // 안 고치면 여기서 걸린다. (값이 섞이는 말은 패턴이 맡으므로 제외)
  const all = html + cli + fs.readFileSync(src + '/public/client4.js', 'utf8')
    + fs.readFileSync(src + '/accounts.js', 'utf8') + fs.readFileSync(src + '/server.js', 'utf8')
    + fs.readFileSync(src + '/server4.js', 'utf8') + fs.readFileSync(src + '/items.js', 'utf8');
  const orphan = Object.keys(FF.DICT).filter((k) => !all.includes(k));
  ok('사전에 유령 열쇠가 없다', orphan.length === 0, orphan.slice(0, 8).join(' | '));
  ok('사전이 비어 있지 않다', Object.keys(FF.DICT).length >= 150, String(Object.keys(FF.DICT).length));
}

console.log('\n⑤ 화면 밖에서도 따라잡는가');
{
  // requestAnimationFrame 은 탭이 화면에 없으면 아예 안 불린다. 그동안 그려진
  // 것들이 한국어로 굳는다 — 폰에서 앱을 내렸다 올리면 그대로 재현됐다.
  ok('rAF 로 미루지 않는다', !/requestAnimationFrame\(\(\) => \{\s*queued = false/.test(i18nSrc));
  // 타이머로 미루면 불리긴 하나 한 번 그린 뒤라, 한국어가 잠깐 스쳤다 바뀐다.
  // 마이크로태스크는 지금 일이 끝나는 즉시 = 그리기 전에 돈다.
  ok('그리기 전에 바꾼다', /queueMicrotask\(run\)/.test(i18nSrc));
  ok('마이크로태스크가 없어도 돌아간다', /Promise\.resolve\(\)\.then\(run\)/.test(i18nSrc));
  ok('돌아오면 한 번 더 훑는다', /visibilitychange[\s\S]{0,120}?apply\(document\.body\)/.test(i18nSrc));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
