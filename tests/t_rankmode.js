// 랭크게임(세 모드 무작위) · 빠른대전 · 미니게임 자리 옮김
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };
const srv = fs.readFileSync(R + '/server.js', 'utf8');
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
const htm = fs.readFileSync(R + '/public/index.html', 'utf8');

console.log('\n① 랭크게임 — 세 모드 중 무작위');
ok('세 모드가 후보다', /const RANKED_MODES = \['classic', 'item', 'twelve'\];/.test(srv));
ok('서버가 고른다', /const pickRankedMode = \(\)/.test(srv)
   && /const mode = pickRankedMode\(\);/.test(srv));
// 클라이언트가 모드를 보내면 그게 곧 모드 고르기가 되어 무작위의 뜻이 없어진다
ok('클라이언트는 모드를 안 보낸다',
   /socket\.emit\('quick_match', \{ pid: PID, nick: getNick\(\) \}\);/.test(cli)
   && !/quick_match'[^)]*itemMode/.test(cli));
ok('서버도 itemMode 를 안 받는다', /socket\.on\('quick_match', \(\{ pid, nick \} = \{\}\) =>/.test(srv));
// 줄이 하나면 사람이 적을 때도 잡힌다
ok('한 줄에 선다', !/if \(!!c\.itemMode !== want\) continue;/.test(srv));
ok('TWELVE 는 트웰브로 연다', /if \(mode === 'twelve'\) \{ if \(tvRestart\) tvRestart\(roomId\); return; \}/.test(srv));
ok('무엇이 걸렸는지 먼저 알린다', /emit\('ranked_mode', \{ mode \}\)/.test(srv)
   && /socket\.on\('ranked_mode'/.test(cli));

console.log('\n② 10초 안에 상대가 없으면 전문가 AI');
ok('10초로 잡혀 있다', /const MATCH_BOT_WAIT = 10000;/.test(srv));
ok('전문가로 붙는다', /function startBotMatch\(entry, opts = \{\}\)[\s\S]{0,900}difficulty: 'expert'/.test(srv));
ok('AI 도 같은 규칙으로 모드를 고른다',
   /const mode = opts\.mode \|\| pickRankedMode\(\);/.test(srv));
ok('AI 도 TWELVE 를 연다',
   /function startBotMatch[\s\S]{0,1400}if \(mode === 'twelve'\) \{ if \(tvRestart\) tvRestart\(roomId\); return; \}/.test(srv));

console.log('\n③ RP 는 랭크에서만, 세 모드 다');
// 랭크가 세 모드를 돌리는데 하나만 빼면 그게 뜨길 기다리는 사람이 생긴다
ok('아이템전만 빼던 것을 없앴다', !/noRank: !room\.ranked \|\| !!room\.itemMode/.test(srv));
ok('랭크로 걸린 판만 RP', /noRank: !room\.ranked \|\| !!room\.noRank,/.test(srv));
ok('트웰브도 랭크면 RP', /noRank: !room\.ranked,  \/\/ 랭크로 걸린 판만 RP 반영/.test(srv));

console.log('\n④ 빠른대전 — 모드 안 가리고 가장 빨리');
ok('통로가 있다', /socket\.on\('quick_any'/.test(srv) && /window\.quickAny = function/.test(cli));
ok('열린 방 전부를 본다', /const joinable = Object\.keys\(rooms\)\.filter/.test(srv));
ok('빈자리가 적은 방부터', /const left = \(id\) => capOf\(rooms\[id\]\) - rooms\[id\]\.players\.filter\(Boolean\)\.length;/.test(srv));
ok('랭크 방에는 안 들어간다', /if \(!r \|\| r\.game \|\| r\.tv \|\| r\.secret \|\| r\.vsBot \|\| r\.tutorial \|\| r\.ranked\) return false;/.test(srv));
// 등급을 안 걸겠다고 누른 사람을 랭크 판에 넣으면 약속을 어기는 것이다
ok('랭크 줄과 안 섞인다', /if \(c\.casual\) continue;/.test(srv) && /if \(!c\.casual\) continue;/.test(srv));
ok('빠른대전끼리는 붙는다', /if \(mate\) \{ clearTimeout\(mate\.botTimer\); return startMatch\(mate, me, \{ ranked: false \}\); \}/.test(srv));
ok('RP 는 안 걸린다', /startBotMatch\(me, \{ ranked: false \}\)/.test(srv)
   && /const ranked = opts\.ranked !== false;/.test(srv));
ok('연타 간격이 있다', /quick_any: 1200/.test(srv));
ok('버튼이 랭크 바로 아래', (() => {
  const a = htm.indexOf('onclick="quickMatch()"'), b = htm.indexOf('onclick="quickAny()"');
  return a > 0 && b > a && (b - a) < 700;
})());

console.log('\n⑤ 미니게임 — 솔로·멀티 안으로');
ok('로비 카드에서 뺐다', !/onclick="miniOpen\(\)"[\s\S]{0,120}미니게임/.test(htm));
ok('솔로 패널에 있다', /soloModal[\s\S]*?miniGo\(2, false\)[\s\S]*?miniGo\(4, false\)/.test(htm));
ok('멀티 패널에 있다', /multiModal[\s\S]*?miniGo\(2, true\)[\s\S]*?miniGo\(4, true\)/.test(htm));
ok('어디서 눌렀는지가 곧 답이다', /window\.miniGo = function \(seats, online\)/.test(cli)
   && /if \(online\) \{[\s\S]{0,260}socket\.emit\('mini_quick', \{ seats \}\);[\s\S]{0,60}socket\.emit\('mini_sit', \{ seats \}\);/.test(cli));
ok('곁들이 격자는 한 칸이 됐다', /<div class="mode-grid sub one">/.test(htm)
   && /\.mode-grid\.sub\.one \{ grid-template-columns:1fr; \}/.test(htm));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
