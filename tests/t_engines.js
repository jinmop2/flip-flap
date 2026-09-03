// 엔진 파일을 브라우저처럼 읽어 본다.
//
// rules2.js 를 감싸지 않고 올렸다가 사이트를 삼십 분 죽였다. top-level const
// 하나(is21)가 브라우저 전역으로 새어 client.js 와 부딪혔고, client.js 가
// 통째로 안 돌았다. 서버 테스트는 require 로 읽으니 전부 통과했다.
// 그래서 여기서는 반드시 "브라우저가 읽는 방식"으로 읽는다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let n = 0, bad = 0;
const ok = (m, c, x) => { n++; if (c) console.log('  ✓ ' + m); else { bad++; console.log('  ✗ ' + m + (x ? ' — ' + x : '')); } };

const FILES = [['twelve.js', 'TWELVE'], ['game4.js', 'GAME4'], ['ai4.js', 'AI4'],
               ['items.js', 'ITEMS_M'], ['rules2.js', 'RULES2'], ['ai2.js', 'AI2']];

console.log('\n① 전역이 새지 않는다');
const win = {};
for (const [file, name] of FILES) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const ctx = vm.createContext({ window: win, globalThis: undefined, console });
  vm.runInContext(src, ctx);
  const leaked = Object.keys(ctx).filter((k) => !['window', 'globalThis', 'console'].includes(k));
  ok(file + ' — 새는 이름 없음', leaked.length === 0, leaked.slice(0, 6).join(','));
  ok(file + ' → window.' + name, !!win[name]);
}

console.log('\n② 서버로 읽어도 같은 것이 나온다');
for (const [file, name] of FILES) {
  const m = require(path.join(root, file));
  const a = Object.keys(m).sort().join(), b = Object.keys(win[name]).sort().join();
  ok(file + ' — 내놓는 목록이 같다', a === b, a.length !== b.length ? '길이 ' + a.length + ' vs ' + b.length : '');
}

console.log('\n③ 브라우저 쪽 엔진이 실제로 굴러간다');
{
  // 트웰브 — 판을 차리고 AI 가 끝까지 둔다
  const T = win.TWELVE;
  const g = T.createGame(['나', 'AI']);
  ok('트웰브 판이 선다', !!g && !!g.hands);
  let steps = 0;
  while (!g.over && steps < 4000) { const a = T.aiAct(g, g.turn, 'hard'); if (!a) break; T.applyAi(g, a); steps++; }
  ok('트웰브가 끝까지 간다', g.over === true || steps > 10, 'steps=' + steps + ' over=' + g.over);
}
{
  // 다인전 — 엔진과 AI 가 서로 맞물린다
  const G = win.GAME4, A = win.AI4;
  const g = G.createGame4(4, ['나', 'A', 'B', 'C']);
  ok('다인전 판이 선다', !!g && g.seats.length === 4);
  ok('AI4 가 게임4 를 붙잡았다', typeof A.chooseBid === 'function');
}
{
  const I = win.ITEMS_M;
  ok('아이템 목록이 있다', I.ITEMS && Object.keys(I.ITEMS).length >= 12, String(Object.keys(I.ITEMS || {}).length));
  ok('아이템 덱을 만든다', Array.isArray(I.newItemDeck()));
}

console.log('\n' + (bad ? 'FAIL ' + bad + '/' + n : 'OK ' + n + '개'));
process.exit(bad ? 1 : 0);
