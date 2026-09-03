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
  ok('규칙이나 상대가 없으면 안 나선다', /if \(!R \|\| !A\) return;/.test(off));
}

console.log('\n② 감싸서 이름이 안 샌다');
{
  ok('감쌌다', /^\(function \(\) \{\n'use strict';/m.test(off) && /\n\}\)\(\);\s*$/.test(off));
  const win = { RULES2: require(path.join(root, 'rules2.js')), AI2: require(path.join(root, 'ai2.js')) };
  const ctx = vm.createContext({ window: win, setTimeout, clearTimeout });
  vm.runInContext(off, ctx);
  const leaked = Object.keys(ctx).filter((k) => !['window', 'setTimeout', 'clearTimeout'].includes(k));
  ok('전역에 새는 이름이 없다', leaked.length === 0, leaked.join(','));
  ok('창에는 OFFLINE 만 더 붙는다',
     Object.keys(win).sort().join() === 'AI2,OFFLINE,RULES2', Object.keys(win).join());
  ok('시작·행동·정지가 있다', win.OFFLINE && typeof win.OFFLINE.start === 'function'
     && typeof win.OFFLINE.act === 'function' && typeof win.OFFLINE.live === 'function');
}

console.log('\n③ 진짜로 한 판 돌려 본다 (서버 없이)');
{
  const win = { RULES2: require(path.join(root, 'rules2.js')), AI2: require(path.join(root, 'ai2.js')) };
  const ctx = vm.createContext({ window: win, setTimeout, clearTimeout });
  vm.runInContext(off, ctx);
  const O = win.OFFLINE;
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

console.log('\n④ 화면이 오프라인 엔진으로 갈라 보낸다');
{
  ok('갈라 보내는 자리가 있다', /const OFF_EVENTS = \[/.test(cli)
     && /if \(window\.OFFLINE && OFFLINE\.live\(\) && OFF_EVENTS\.includes\(ev\)\) return OFFLINE\.act\(ev, data\);/.test(cli));
  for (const ev of ['draw_card', 'offer_card', 'choose_auction', 'pick_card', 'submit_bid'])
    ok(`${ev} 를 가로챈다`, new RegExp(`OFF_EVENTS = \\[[^\\]]*'${ev}'`).test(cli));
  // 서버에서 오든 오프라인에서 오든 같은 길로 들어가야 한다
  ok('한 길로 들어간다', /function onGameStart\(/.test(cli) && /function onStateUpdate\(/.test(cli)
     && /function onGameOver\(/.test(cli));
  ok('소켓도 그 길을 쓴다', /socket\.on\('state_update', onStateUpdate\)/.test(cli));
  ok('오프라인도 그 길을 쓴다', /OFFLINE\.start\(d, \{ onState: onStateUpdate, onOver: onGameOver \}\)/.test(cli));
  ok('그물이 있으면 서버로 간다', /if \(!socket\.connected && window\.OFFLINE && OFFLINE\.ready\) return offlineStart\(d\);/.test(cli));
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
if (fail) { console.log(`✗ ${fail}개 실패 (${pass}/${pass + fail})`); process.exit(1); }
console.log(`✓ 전부 통과 (${pass}/${pass})`);
