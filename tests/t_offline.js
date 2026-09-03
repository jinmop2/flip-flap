// 그물 없이 두는 판.
//
// 서버가 없을 때 화면이 혼자 판을 굴린다. 핵심은 "규칙을 두 번 적지 않는 것" —
// 오프라인 엔진이 규칙을 따로 갖고 있으면 언젠가 온라인과 판정이 갈라진다.
// 여기 있어야 하는 것은 살림살이(언제 뽑고 언제 기다리나)뿐이다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const off = fs.readFileSync(path.join(root, 'public/offline.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
const sw  = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

// 브라우저 흉내. 엔진은 서버가 쓰는 그 파일을 그대로 읽어 창에 붙인다 —
// 화면이 <script> 로 읽는 것과 같은 상태를 만든다.
function browser() {
  const win = {};
  for (const [f, name] of [['rules2.js', 'RULES2'], ['ai2.js', 'AI2'], ['twelve.js', 'TWELVE'],
                           ['game4.js', 'GAME4'], ['ai4.js', 'AI4'], ['items.js', 'ITEMS_M'],
                           ['view4.js', 'VIEW4']]) {
    const ctx = vm.createContext({ window: win, module: undefined, require: undefined, console });
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
    if (!win[name]) throw new Error(f + ' 이 window.' + name + ' 을 안 붙였다');
  }
  const sent = [];
  win.FFDELIVER = (ev, d) => sent.push([ev, d]);
  win.FFONLINE = () => false;
  const ctx = vm.createContext({ window: win, console,
    setTimeout, clearTimeout, setInterval, clearInterval, getNick: () => '나' });
  vm.runInContext(off, ctx);
  OPEN.push(win.OFFLINE);   // 시계를 켜 둔 채로 두면 테스트가 안 끝난다
  const leaked = Object.keys(ctx).filter((k) => !['window', 'console', 'setTimeout', 'clearTimeout',
                                                  'setInterval', 'clearInterval', 'getNick'].includes(k));
  return { win, sent, O: win.OFFLINE, leaked,
           last: (ev) => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i][0] === ev) return sent[i][1]; return null; } };
}

const OPEN = [];
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  ' + x : ''))); };

console.log('① 규칙을 두 번 적지 않는다');
{
  // 판정은 전부 rules2 를 거쳐야 한다. 여기서 직접 세면 갈라진다.
  for (const own of ['function checkSet', 'function aBeatsB', 'function strength',
                     'function resolveByProgress', 'function judgeAuction'])
    ok(`규칙을 직접 안 적었다 — ${own}`, !off.includes(own));
  ok('판정은 규칙에 맡긴다', /R\.judgeAuction\(g\)/.test(off) && /R\.applyAuction\(g, d\)/.test(off)
     && /R\.checkSet\(/.test(off) && /R\.canContinue\(g\)/.test(off));
  ok('보여 줄 몫도 규칙이 추린다', /R\.stateFor\(g, 0\)/.test(off));
  ok('차례도 규칙이 정한다', /R\.activePlayer\(g\)/.test(off));
  ok('상대는 ai2 를 쓴다', /A\.decideBidX|A\.cpuDecideBid/.test(off) && /A\.offerX|A\.cpuChooseOffer/.test(off));
  ok('규칙이나 상대가 없으면 클래식은 안 연다', /if \(!R \|\| !A\) return false;/.test(off));
}

console.log('\n② 감싸서 이름이 안 샌다');
{
  ok('감쌌다', /^\(function \(\) \{\n'use strict';/m.test(off) && /\n\}\)\(\);\s*$/.test(off));
  const b = browser();
  ok('전역에 새는 이름이 없다', b.leaked.length === 0, b.leaked.join(','));
  ok('창에 붙는 것은 OFFLINE 하나뿐', b.win.OFFLINE && !b.win.offline);
  ok('시작·행동·정지가 있다', b.O && typeof b.O.start === 'function'
     && typeof b.O.act === 'function' && typeof b.O.live === 'function'
     && typeof b.O.handle === 'function');
}

console.log('\n③ 진짜로 한 판 돌려 본다 (서버 없이)');
{
  const O = browser().O;
  let last = null, done = null;
  O.start('normal', { onState: (s) => { last = s; }, onOver: (o) => { done = o; } });
  ok('판이 차려진다', !!last && last.phase === 'pick', last ? last.phase : '상태 없음');
  ok('손패 6장', last && last.myHand && last.myHand.length === 6, last ? String(last.myHand.length) : '?');
  ok('덱 12장', last && last.centerDeckSize === 12, last ? String(last.centerDeckSize) : '?');
  // 상대 손패는 장수만 — 오프라인이라고 상대 패가 보이면 안 된다
  ok('상대 패는 안 보여 준다', last && last.oppHand === undefined && last.oppHandLen === 6);
  // 선공 뽑기
  O.act('pick_card', { slot: 0 });
  ok('선공을 골랐다', last.pick && last.pick.myChoice === 0);
  O.stop();
  ok('멈추면 판이 사라진다', O.live() === false);
}

console.log('\n③-2 트웰브를 그물 없이 한 판');
{
  // 규칙도 상대도 twelve.js — 서버가 쓰는 그 파일이다. 여기서 확인하는 것은
  // "서버 없이도 판이 서고, 사람 차례가 실제로 돌아오는가" 다.
  const b = browser();
  ok('트웰브를 열 수 있다', b.O.can('twelve'));
  ok('그물이 없으면 tv_solo 를 받는다', b.O.handle('tv_solo', { diff: 'hard' }) === true);
  const begin = b.last('tv_begin');
  ok('판을 열었다고 알린다', !!begin && begin.me === 1 && begin.vsBot === true);
  const st = b.last('tv_state');
  ok('상태가 왔다', !!st);
  ok('내 칩이 있다', st && typeof st.chips === 'object');
  // 남의 손패가 실려 오면 안 된다 — 오프라인이라고 규칙이 달라지진 않는다
  ok('상대 손패는 안 실린다', st && !st.oppHand && !(st.hands && st.hands[2]));
  ok('판이 살아 있다', b.O.live() === true);
  b.O.stop();
  ok('멈추면 사라진다', b.O.live() === false);
}

console.log('\n③-3 다인전을 그물 없이 한 판');
{
  const b = browser();
  ok('다인전을 열 수 있다', b.O.can('quad'));
  ok('그물이 없으면 g4_start 를 받는다', b.O.handle('g4_start', { n: 4 }) === true);
  const begin = b.last('g4_begin');
  ok('넷이 앉는다', !!begin && begin.n === 4 && begin.me === 0 && begin.solo === true);
  ok('나 말고는 전부 AI', begin && begin.seats.filter((x) => x.isBot).length === 3);
  const st = b.last('g4_state');
  ok('상태가 왔다', !!st && st.me === 0);
  ok('내 손패가 있다', st && Array.isArray(st.myHand) && st.myHand.length > 0);
  // view4 가 거르는 경계. 오프라인에서도 같은 파일을 쓰므로 같이 지켜져야 한다.
  ok('남의 손패는 장수만 온다', st && st.seats.every((x) => x.hand === undefined && typeof x.handLen === 'number'));
  ok('셋이서도 선다', (() => { const c = browser(); c.O.handle('g4_start', { n: 3 });
                              const g = c.last('g4_begin'); c.O.stop(); return !!g && g.n === 3; })());
  b.O.stop();
  ok('멈추면 사라진다', b.O.live() === false);
}

console.log('\n④ 화면이 오프라인 엔진으로 갈라 보낸다');
{
  ok('갈라 보내는 자리가 있다',
     /if \(window\.OFFLINE && OFFLINE\.handle\(ev, data\)\) return;/.test(cli));
  ok('서버가 쏘던 것을 같은 자리로 건넨다', /window\.FFDELIVER = function/.test(cli)
     && /socket\.listeners\(ev\)/.test(cli));
  ok('붙어 있는지 화면이 알려 준다', /window\.FFONLINE = \(\) => !!socket\.connected;/.test(cli));
  {
    // 말이 아니라 실제로 — 판을 열어 놓고 신호를 하나씩 건네 본다
    const b2 = browser();
    b2.O.start('normal', { onState: () => {}, onOver: () => {} });
    for (const ev of ['draw_card', 'offer_card', 'choose_auction', 'pick_card', 'submit_bid'])
      ok(`${ev} 를 가로챈다`, b2.O.handle(ev, {}) === true);
    b2.O.stop();
    // 판이 없으면 서버로 가야 한다 — 아무거나 삼키면 온라인이 망가진다
    ok('판이 없으면 서버로 보낸다', b2.O.handle('draw_card', {}) !== true);
    ok('모르는 신호는 안 삼킨다', b2.O.handle('buy_item', {}) !== true);
  }
  // 서버에서 오든 오프라인에서 오든 같은 길로 들어가야 한다
  ok('한 길로 들어간다', /function onGameStart\(/.test(cli) && /function onStateUpdate\(/.test(cli)
     && /function onGameOver\(/.test(cli));
  ok('소켓도 그 길을 쓴다', /socket\.on\('state_update', onStateUpdate\)/.test(cli));
  ok('오프라인도 그 길을 쓴다', /OFFLINE\.start\(d, \{ onState: onStateUpdate, onOver: onGameOver \}\)/.test(cli));
  ok('그물이 있으면 서버로 간다', /if \(!socket\.connected && window\.OFFLINE && OFFLINE\.ready\) return offlineStart\(d\);/.test(cli));
  // 그물 없이 두는 판에는 돌아갈 서버가 없다. 재접속 덮개가 올라오면
  // 멀쩡히 돌아가는 판을 가린다 — 실제로 그랬다.
  ok('오프라인 판 위에 재접속 덮개를 안 씌운다',
     /function inLiveGame\(\) \{\n(?:.*\n)*?\s*if \(window\.OFFLINE && OFFLINE\.live\(\)\) return false;/.test(cli));
  ok('방 번호 없는 다인전은 안 적어 둔다',
     /if \(q4Room\) localStorage\.setItem\('ff_q4'/.test(fs.readFileSync(path.join(root, 'public/client4.js'), 'utf8')));
  ok('코인이 안 쌓인다고 알린다', /코인·전적은 안 쌓여요/.test(cli));
}

console.log('\n⑤ 그물이 아예 없어도 앱이 켜진다');
{
  // 한 번이라도 온라인으로 열어 봤으면 이것들이 담겨 있어야 한다.
  // socket.io 가 빠지면 client.js 첫 줄에서 io 를 못 찾아 화면이 통째로 죽는다.
  for (const f of ['/socket.io/socket.io.js', '/rules2.js', '/ai2.js', '/offline.js',
                   '/client.js', '/i18n.js', '/art.js'])
    ok(`미리 담는다 — ${f}`, new RegExp(`'${f.replace(/\//g, '\\/')}'`).test(sw));
  ok('판을 올렸다', /const VER = 'ff-v[8-9]'|const VER = 'ff-v\d\d/.test(sw));
  ok('화면이 오프라인 엔진을 읽는다', /<script src="offline\.js">/.test(htm));
}

console.log('');
for (const o of OPEN) { try { o.stop(); } catch (_) {} }   // 켜 둔 시계를 다 끈다
if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
console.log(`✓ 전부 통과 (${pass}/${pass})`);
