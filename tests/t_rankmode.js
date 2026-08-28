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
// 룰렛이 도는 동안(RANK_SPIN_MS)은 판을 안 연다 — 그래서 setTimeout 안으로 들어갔다
ok('AI 도 TWELVE 를 연다',
   /function startBotMatch[\s\S]{0,1600}if \(mode === 'twelve'\) \{ if \(tvRestart\) tvRestart\(roomId\); return; \}/.test(srv));
ok('룰렛이 도는 동안은 판을 안 연다',
   /const RANK_SPIN_MS = 2300;/.test(srv)
   && (srv.match(/\}, RANK_SPIN_MS\);/g) || []).length === 2);

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

console.log('\n⑤-0 랭크·빠른대전 버튼이 안 겹친다');
// margin-top 을 음수로 당겨 두 버튼이 3px 겹쳐 있었다 — 아래 버튼 윗줄을
// 누르면 위 버튼이 잡힌다. 사이는 flex gap 이 이미 벌려 준다.
ok('음수 여백으로 당기지 않는다',
   /\.mm-hero\.quick \{[\s\S]{0,220}\}/.test(htm)
   && !/\.mm-hero\.quick \{[\s\S]{0,220}margin-top:-/.test(htm));

console.log('\n⑤ 미니게임 — 다른 모드와 같은 자리에');
ok('로비 카드에서 뺐다', !/onclick="miniOpen\(\)"[\s\S]{0,120}미니게임/.test(htm));
// 로비 밖에 따로 서 있던 칸은 이제 하나도 없다. 토너먼트까지 솔로·멀티
// 안으로 들어가면서 곁들이 격자 자체가 없어졌다 — 규칙도 같이 걷었다.
ok('로비에 곁들이 격자가 없다', !/mode-grid sub/.test(htm) && !/mode-grid\.sub/.test(htm));
ok('토너먼트는 솔로 안에 있다', /onclick="soloPick\('tour'\)"/.test(htm)
   && /stourStart\('expert'\)/.test(htm));
// 대회도 다른 모드와 같은 칸이다. 따로 빼 두면 "지금 되는 건가" 를 눌러 봐야 안다.
ok('사람 대회는 모드 칸이 됐다', /class="mm-tile t-tour" onclick="tourOpen\(\)"/.test(htm)
   && !/mm-hero tour/.test(htm));
// 다른 모드와 같은 통로로 — 빠른 입장·방 모드 고르기에 나란히 선다
ok('빠른 입장에 있다', /quickJoin\('mini'\)/.test(htm)
   && /\['classic', 'item', 'quad', 'twelve', 'mini'\]\.includes\(mode\)/.test(srv));
// 대회까지 들어와 여섯 칸이다. 좁은 폰에서는 두 줄로 접는다 —
// 여섯이 한 줄에 들어가면 글씨가 읽을 수 없게 작아진다.
ok('빠른 입장이 여섯 칸이 됐다', /<div class="mm-tiles c6">/.test(htm)
   && /\.mm-tiles\.c6 \{ grid-template-columns:repeat\(6, 1fr\); gap:4px; \}/.test(htm));
ok('좁은 폰에서는 두 줄로', /@media \(max-width:380px\) \{ \.mm-tiles\.c6 \{ grid-template-columns:repeat\(3, 1fr\); \} \}/.test(htm));
ok('방 모드 고르기에 있다', /data-m="mini" onclick="roomMode\('mini'\)"/.test(htm)
   && /mini: '미니게임'/.test(cli));
ok('다섯 번째 칸이 한 줄을 다 쓴다', /\.wc-modes \.wc-mode:last-child:nth-child\(odd\) \{ grid-column:1 \/ -1; \}/.test(htm));

console.log('\n⑥ 인원을 미리 안 나눈다 — 자리 넷, 앉은 대로');
ok('자리가 넷이다', /room\.mode === 'quad' \|\| room\.mode === 'mini'\) \? 4 : 2/.test(srv));
ok('둘이면 선다', /const ready = room\.mode === 'mini' \? n >= 2 :/.test(srv));
ok('앉은 사람 수가 곧 자리 수', /miniOpenTable\(socks\.length, socks, 'multi'\)/.test(srv));
// 방을 먼저 지우고 열면 못 앉는 사람이 있을 때 방도 판도 없는 자리에 남는다
ok('앉을 수 있는지 먼저 본다', (() => {
  const at = srv.indexOf("if (room.mode === 'mini') {");
  const blk = srv.slice(at, at + 1400);
  return at > 0 && blk.indexOf('const bad = socks.filter') < blk.indexOf('delete rooms[roomId]');
})());
ok('못 앉으면 방이 그대로 남는다', /if \(bad\.length\) \{[\s\S]{0,420}return socket\.emit\('error'/.test(srv));
ok('빈자리는 AI 라고 적어 준다', /if \(roomReady && roomModeCur === 'mini'\) btn\.textContent = '게임 시작 \(빈자리는 AI\)';/.test(cli));
// 솔로는 AI 를 몇 명 붙일지 내가 정하는 게 낫다 — 온라인처럼 기다릴 상대가 없다
ok('솔로는 2·3·4인을 고른다',
   /miniGo\(2, false\)/.test(htm) && /miniGo\(3, false\)/.test(htm) && /miniGo\(4, false\)/.test(htm));
ok('솔로에 온라인 칸은 없다', (() => {
  const at = htm.indexOf('id="soloModal"');
  const solo = htm.slice(at, htm.indexOf('id="multiModal"'));
  return at > 0 && !/quickJoin\('mini'\)/.test(solo);
})());

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
