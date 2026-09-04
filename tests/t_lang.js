// 언어 꾸러미 — 일본어·중국어.
//
// 한국어 원문이 열쇠다. 원문을 고치면 짝이 끊기고, 열쇠에 없는 말을 적으면
// 아무 데도 안 걸리는 유령이 된다. 두 언어 모두 그걸 여기서 지켜본다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let n = 0, bad = 0;
const ok = (m, c, x) => { n++; if (c) console.log('  ✓ ' + m); else { bad++; console.log('  ✗ ' + m + (x !== undefined ? ' — ' + x : '')); } };

// i18n.js 를 브라우저처럼 읽는다(꾸러미까지 얹어서)
function load(extra) {
  const sb = {
    navigator: { languages: ['en'], language: 'en' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { documentElement: { classList: { add() {}, remove() {}, contains: () => false } },
      body: {}, readyState: 'complete', addEventListener() {},
      querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => null }) },
    requestAnimationFrame() {}, MutationObserver: function () { this.observe = () => {}; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 }, console,
  };
  sb.window = sb;
  const src = fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8')
            + (extra || []).map((f) => '\n' + fs.readFileSync(path.join(root, f), 'utf8')).join('');
  const fn = new Function('window', 'navigator', 'localStorage', 'document',
    'requestAnimationFrame', 'MutationObserver', 'NodeFilter', 'globalThis', 'console',
    src + '\nreturn window.FF;');
  return fn(sb, sb.navigator, sb.localStorage, sb.document, sb.requestAnimationFrame,
            sb.MutationObserver, sb.NodeFilter, sb, console);
}
const PACKS = [['ja', 'public/lang-ja.js', '日本語'], ['zh', 'public/lang-zh.js', '简体中文']];

console.log('① 꾸러미가 붙는다');
const FF = load(PACKS.map((p) => p[1]));
{
  ok('네 언어', FF.langs().join() === 'ko,en,ja,zh', FF.langs().join());
  for (const [code, , name] of PACKS) ok(code + ' 이름은 그 언어로 적혀 있다', FF.langName(code) === name, FF.langName(code));
  // 아직 없는 언어를 골라도 아무 일이 없어야 한다
  FF.setLang('xx'); ok('모르는 언어는 무시한다', FF.lang() !== 'xx', FF.lang());
}

console.log('\n② 전역에 이름이 안 샌다');
for (const [code, file] of PACKS) {
  const win = { FF: { register: (c, p) => { win['p_' + c] = p; } } };
  const ctx = vm.createContext({ window: win, globalThis: undefined, console });
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  const leaked = Object.keys(ctx).filter((k) => !['window', 'globalThis', 'console'].includes(k));
  ok(file + ' — 새는 이름 없음', leaked.length === 0, leaked.join(','));
  ok(file + ' — 감쌌다', /^\(function \(root\) \{\n'use strict';/m.test(fs.readFileSync(path.join(root, file), 'utf8')));
}

console.log('\n③ 열쇠가 한국어 원문과 맞는다');
{
  const en = FF.DICT;
  for (const [code, file] of PACKS) {
    const win = { FF: { register: (c, p) => { win.p = p; } } };
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), vm.createContext({ window: win, console }));
    const d = win.p.dict;
    const ghost = Object.keys(d).filter((k) => !Object.prototype.hasOwnProperty.call(en, k));
    const miss = Object.keys(en).filter((k) => !Object.prototype.hasOwnProperty.call(d, k));
    ok(code + ' — 유령 열쇠가 없다', ghost.length === 0, ghost.slice(0, 4).join(' | '));
    ok(code + ' — 빠진 열쇠가 없다', miss.length === 0, miss.slice(0, 4).join(' | '));
    ok(code + ' — 한국어가 그대로 남은 값이 없다',
       !Object.entries(d).some(([k, v]) => /[가-힣]/.test(v) && k !== '한국어' && v !== '한국어'),
       Object.entries(d).filter(([k, v]) => /[가-힣]/.test(v) && k !== '한국어').slice(0, 3).map(([k]) => k).join(' | '));
    ok(code + ' — 숫자가 끼는 문장도 옮겼다', win.p.patterns.length === FF.PATTERNS.length,
       win.p.patterns.length + ' vs ' + FF.PATTERNS.length);
  }
}

console.log('\n③-2 설명서도 통째로 갈아 끼운다');
{
  // 설명서는 한 문장씩 옮기면 어순이 깨진다. 짝이 없으면 그 페이지만 한국어로 남는다.
  // 미니게임은 입구를 막아 둔 화면이라 뺐다(짝이 없으면 한국어로 떨어질 뿐이다).
  const 필요 = ['rules2', 'rules4', 'rulesItem', 'rulesTwelve', 'rulesEtc'];
  for (const [code, file] of PACKS) {
    const win = { FF: { register: (c, p) => { win.p = p; } } };
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), vm.createContext({ window: win, console }));
    const B = win.p.blocks;
    for (const k of 필요) {
      ok(`${code} — ${k} 가 있다`, !!B[k] && B[k].length > 800, String((B[k] || '').length));
      ok(`${code} — ${k} 에 한국어가 안 남았다`, !/[가-힣]/.test(B[k] || ''),
         ((B[k] || '').match(/[가-힣][가-힣 ]*/g) || []).slice(0, 2).join(' | '));
    }
    // 화면이 붙잡는 이름과 맞아야 한다
    const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    for (const k of 필요) ok(`${code} — 화면의 ${k} 자리와 맞는다`, htm.includes(`data-i18n-block="${k}"`));
  }
}

console.log('\n④ 실제로 바꿔 본다');
{
  const cases = { ja: [['클래식', 'クラシック'], ['물러서기', '降りる'], ['덱 12장', '山札 12 枚']],
                  zh: [['클래식', '经典'], ['물러서기', '弃牌'], ['덱 12장', '牌堆 12 张']] };
  for (const [code, list] of Object.entries(cases)) {
    FF.setLang(code);
    for (const [k, want] of list) ok(`${code}: ${k} → ${want}`, FF.t(k) === want, FF.t(k));
  }
  // 영어 위에 일본어를 덮으면 이미 바뀐 글자는 열쇠에 안 걸려 영어로 남는다
  ok('다른 언어로 갈 때 한국어를 한 번 거친다',
     /if \(prev !== 'ko'\) restoreKo\(prev\);/.test(fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8')));
}

console.log('\n⑤ 기기 언어를 알아본다');
{
  const src = fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8');
  for (const [p, want] of [['ko', 'ko'], ['ja', 'ja'], ['zh', 'zh'], ['en', 'en']])
    ok(`${p}로 시작하면 ${want}`, new RegExp(`startsWith\\('${p}'\\)\\) return '${want}'`).test(src));
}

console.log('\n⑥ 화면·서비스워커가 안다');
{
  const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
  for (const f of ['lang-ja.js', 'lang-zh.js']) {
    ok(`화면이 ${f} 를 읽는다`, htm.includes(`<script src="${f}">`));
    ok(`미리 담는다 — ${f}`, sw.includes(`'/${f}'`));
  }
  // i18n.js 보다 뒤에 와야 register 가 있다
  ok('꾸러미는 i18n 다음에 온다',
     htm.indexOf('<script src="i18n.js">') < htm.indexOf('<script src="lang-ja.js">'));
  ok('언어를 네 개 고를 수 있다',
     ['ko', 'en', 'ja', 'zh'].every((c) => htm.includes(`onclick="pickLang('${c}')"`)));
  // 네 개를 한 줄로 늘어놓으면 설정 줄이 넘쳐 흐른다
  ok('두 칸씩 접어 줄 높이를 고정한다', /\.sp-grid \{[^}]*grid-template-columns:1fr 1fr/.test(htm));
  // 안내판은 언어별 표가 있으면 그걸 쓰고, 없으면 영어로 떨어진다
  ok('안내판도 언어를 고른다', /const TUT_L = \{ ja: /.test(cli) && /table\[st\.id\]\) \|\| \(L !== 'ko' && TUT_EN\[st\.id\]\)/.test(cli));
  for (const t of ['TUT_JA', 'TUT_ZH']) ok(`${t} 가 있다`, new RegExp(`const ${t} = \\{`).test(cli));
}

console.log('\n' + (bad ? 'FAIL ' + bad + '/' + n : 'OK ' + n + '개'));
process.exit(bad ? 1 : 0);
