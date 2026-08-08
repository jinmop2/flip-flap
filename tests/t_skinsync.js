// 스킨이 상점에만 등록되고 인게임 표에는 빠지는 사고를 막는다.
//
// 왜 필요한가: 꾸미기 아이템은 표를 여러 벌 거친다.
//   상점 미리보기(CBP·TBLP·CFP·NP_CLASS) / 인게임(TABLE_CLS·FACE_CLS) / CSS 클래스
// 새 스킨을 넣을 때 한 군데라도 빠뜨리면 "사 놓고 판에서는 안 보이는" 상태가 된다.
// 실제로 흑요석·한지·크리스탈 카드백이 상점에만 보이고 인게임에는 안 나왔다.
const fs = require('fs');
const root = __dirname + '/..';
const acc = fs.readFileSync(root + '/accounts.js', 'utf8');
const cli = fs.readFileSync(root + '/public/client.js', 'utf8');
const css = fs.readFileSync(root + '/public/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

// 상점 카탈로그에서 종류별 id 를 뽑는다
const shopBody = acc.match(/const SHOP = \{([\s\S]*?)\n\};/)[1];
const entries = [...shopBody.matchAll(/^\s{2}(\w+):\s*\{([^\n]*(?:\n\s{4,}[^\n]*)*)/gm)]
  .map((m) => ({ id: m[1], body: m[2] }));
const idsOfType = (t) => entries.filter((e) => new RegExp("type:\\s*'" + t + "'").test(e.body)).map((e) => e.id);

// 클라이언트 맵을 읽는다
const mapOf = (name) => {
  const m = cli.match(new RegExp('const ' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\n?\\};'));
  if (!m) return null;
  const out = {};
  for (const kv of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[kv[1]] = kv[2];
  return out;
};

console.log('\n① 상점의 모든 스킨이 클라이언트 표에 있는가');
const CHECKS = [
  ['카드 뒷면', 'cardback', 'CBP'],
  ['테이블',   'table',    'TBLP'],
  ['카드 앞면', 'cardface', 'CFP'],
  ['명패',     'plate',    'NP_CLASS'],
];
for (const [label, type, mapName] of CHECKS) {
  const map = mapOf(mapName);
  if (!map) { ok(`${label} — ${mapName} 를 못 찾음`, false); continue; }
  const missing = idsOfType(type).filter((id) => !map[id]);
  ok(`${label} (${mapName})`, missing.length === 0, '빠진 것: ' + missing.join(' '));
}

console.log('\n② 인게임 표에도 있는가 (상점에만 있으면 판에서 안 보인다)');
{
  // 카드백은 표를 합쳐 한 벌만 쓰기로 했다
  ok('카드백 인게임 표가 상점 표를 그대로 쓴다', /const CB_CLASS\s*=\s*CBP\s*;/.test(cli),
     '표가 두 벌이면 새 카드백이 판에서 안 보인다');
  for (const [label, type, mapName] of [['테이블', 'table', 'TABLE_CLS'], ['카드 앞면', 'cardface', 'FACE_CLS']]) {
    const map = mapOf(mapName);
    if (!map) { ok(`${label} — ${mapName} 를 못 찾음`, false); continue; }
    const missing = idsOfType(type).filter((id) => !map[id]);
    ok(`${label} (${mapName})`, missing.length === 0, '빠진 것: ' + missing.join(' '));
  }
}

console.log('\n③ 스킨을 벗을 때 이전 클래스를 지우는 목록이 빠짐없는가');
{
  const rm = cli.match(/classList\.remove\(([^)]*)\)/g) || [];
  const removed = new Set();
  for (const r of rm) for (const m of r.matchAll(/'([^']+)'/g)) removed.add(m[1]);
  const all = [];
  for (const [label, type, mapName] of [['테이블', 'table', 'TABLE_CLS'], ['카드 앞면', 'cardface', 'FACE_CLS']]) {
    const map = mapOf(mapName) || {};
    for (const id of idsOfType(type)) if (map[id] && !removed.has(map[id])) all.push(map[id]);
  }
  ok('바꿀 때 예전 스킨이 안 남는다', all.length === 0,
     '지우는 목록에 없음: ' + all.join(' '));
}

console.log('\n④ CSS 클래스가 실제로 정의돼 있는가');
{
  const missing = [];
  for (const [, type, mapName] of CHECKS) {
    const map = mapOf(mapName) || {};
    for (const id of idsOfType(type)) {
      const cls = map[id]; if (!cls) continue;
      if (!new RegExp('\\.' + cls.replace(/-/g, '\\-') + '[\\s.,{:]').test(css)) missing.push(cls);
    }
  }
  ok('미리보기 클래스가 전부 CSS 에 있다', missing.length === 0, '없음: ' + [...new Set(missing)].join(' '));
}

console.log('\n⑤ 장착 슬롯이 서버와 짝이 맞는가');
{
  const srvSlot = acc.match(/const SLOT = \{([\s\S]*?)\n\};/);
  const cliSlot = cli.match(/const EQUIP_SLOT = \{([\s\S]*?)\n\};/);
  ok('양쪽 다 찾음', !!srvSlot && !!cliSlot);
  if (srvSlot && cliSlot) {
    const keys = (m) => [...m[1].matchAll(/(\w+):\s*'/g)].map((x) => x[1]).sort();
    const s = keys(srvSlot), c = keys(cliSlot);
    ok('슬롯 종류가 같다', JSON.stringify(s) === JSON.stringify(c),
       `서버 [${s}] / 클라 [${c}]`);
  }
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
