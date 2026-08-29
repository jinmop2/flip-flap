// 보안 회귀 — 한 번 새면 조용히 새는 것들만 모아 둔다.
const fs = require('fs');
const R = '/Users/jinmo9/참치/my-game';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };

const srv  = fs.readFileSync(R + '/server.js', 'utf8');
const srv4 = fs.readFileSync(R + '/server4.js', 'utf8');
const acc  = fs.readFileSync(R + '/accounts.js', 'utf8');
const twv  = fs.readFileSync(R + '/twelve.js', 'utf8');
const sut  = fs.readFileSync(R + '/sutda.js', 'utf8');

console.log('\n① 비밀값은 코드에 없다');
for (const [name, s] of [['server', srv], ['server4', srv4], ['accounts', acc]]) {
  ok(name + ' 에 접속 문자열·키가 박혀 있지 않다',
     !/postgres(ql)?:\/\/[^'"\s]*:[^'"\s]*@/.test(s) && !/GOCSPX-/.test(s)
     && !/AIza[A-Za-z0-9_-]{30}/.test(s) && !/-----BEGIN [A-Z ]*PRIVATE KEY/.test(s));
}
const ign = fs.readFileSync(R + '/.gitignore', 'utf8');
ok('키스토어·빌드 산출물이 gitignore 에 있다',
   ['android-build/', '*.keystore', '*.jks', '*.aab', '*.apk', 'keystore-password.txt', '.env', 'data/']
     .every((p) => ign.includes(p)));

console.log('\n② 남의 손패는 나가지 않는다');
// 2인전 — stateFor 는 자리별로 직접 조립한다(게임 객체를 통째로 안 퍼뜨린다)
ok('2인전 state 는 통째 전개가 없다', !/\.\.\.game\b/.test(srv) && !/\.\.\.g\b/.test(srv));
ok('2인전 관전자는 손패 길이만 본다',
   /p1HandLen: game\.p1Hand\.length, p2HandLen: game\.p2Hand\.length/.test(srv)
   && !/p1Hand:/.test(srv.slice(srv.indexOf('function stateForSpec'))));
// 아이템 덱 — 다음에 뭐가 나올지 보이면 앞면 공개의 뜻이 없다
ok('아이템 덱은 클라이언트로 안 나간다',
   /game\.itemDeck = items\.newItemDeck\(\)/.test(srv)
   && !/itemDeck/.test(srv.slice(srv.indexOf('function stateFor(game, pi)'), srv.indexOf('function broadcast'))));
// 트웰브·섯다
ok('트웰브는 내 손패만 보낸다', /myHand: g\.hands\[me\], oppHandLen: g\.hands\[you\]\.length/.test(twv));
ok('섯다는 공개 조건일 때만 카드를 보낸다',
   /cards: open \? st\.hands\[i\]\.slice\(\) : null/.test(sut)
   && /eval: open && st\.hands\[i\]\.length === 2/.test(sut));

console.log('\n③ 다인전 관전자에게 클로즈 출품이 새지 않는다');
// stateForSpec 은 자리 0 시점을 빌린다. 진행자가 마침 0번이면 stateFor 가
// "내가 진행자니까" 하고 가려야 할 출품 카드를 열어 준다 — 다시 덮어야 한다.
ok('관전자 상태에서 출품 카드를 다시 덮는다',
   /function stateForSpec[\s\S]{0,700}if \(!open\) st\.auction\.offered = null;/.test(srv4));
ok('관전자는 손패도 자리 번호도 없다',
   /st\.myHand = \[\];[\s\S]{0,40}st\.me = null;/.test(srv4));

console.log('\n④ 클라이언트 입력으로 객체를 뒤지지 않는다');
// SLOT[kind] 를 그냥 찾으면 kind='constructor' 가 Object 생성자에 걸려
// u['function Object() { [native code] }'] 가 계정 기록에 박힌다.
ok('equipItem 이 hasOwnProperty 로 막는다',
   /function equipItem[\s\S]{0,600}hasKey\(SLOT, kind\)/.test(acc)
   && /function equipItem[\s\S]{0,600}hasKey\(SHOP, itemId\)/.test(acc)
   && /function equipItem[\s\S]{0,600}hasKey\(SLOT, it\.type\)/.test(acc));
ok('hasKey 는 문자열만 받는다', /const hasKey = \(o, k\) => typeof k === 'string' && Object\.prototype\.hasOwnProperty\.call\(o, k\);/.test(acc));
// 실제로 막히는지 — equipItem 의 분기를 그대로 흉내 낸다
ok('상속 키로는 아무것도 안 써진다', (() => {
  const SLOT = { cardback: 'cardBack', emotes: 'emoteSet' };
  const hasKey = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  for (const kind of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', null, {}, 7]) {
    const u = {};
    if (hasKey(SLOT, kind)) u[SLOT[kind]] = null;
    if (Object.keys(u).length) return false;
  }
  const u2 = {}; if (hasKey(SLOT, 'cardback')) u2[SLOT.cardback] = null;
  return Object.keys(u2).length === 1;                       // 정상 값은 그대로 동작
})());
// 예약어는 아이디·닉으로도 못 쓴다
ok('예약어 아이디·닉 차단', /const RESERVED_KEY = \/\^\(__proto__\|constructor\|prototype/.test(acc));

console.log('\n⑤ 재화는 서버가 정한다');
ok('토너먼트 상금은 서버 계산값', /const amount = TOUR\.prizeFor\(rank\);/.test(srv)
   && /accounts\.tourPrize\(st\.token, tour\.id, rank, amount\)/.test(srv));
ok('미니게임 참가비도 서버 계산값', /Math\.min\(MINI_BUY_COIN, Math\.max\(0, \(have && have\.coins\) \|\| 0\)\)/.test(srv));
ok('상점·보상·쿠폰·미션에 락이 걸려 있다',
   /shopLocks|buyLocks/.test(acc) && /misLocks/.test(acc) && /miniLocks/.test(acc));

console.log('\n⑥ 관리자 통로');
ok('관리자 라우트는 전부 키를 본다', (() => {
  const lines = srv.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^app\.(get|post)\('\/api\/admin/.test(lines[i])) continue;
    const blk = lines.slice(i, i + 4).join('\n');
    if (!/adminOk\(req, res\)/.test(blk)) return false;
  }
  return true;
})());
// ADMIN_KEY(계정·쿠폰·임시계정을 건드리는 키)는 본문으로만 받는다.
// /stats · /reports 는 브라우저로 여는 화면이라 STATS_KEY 를 주소에서 받는데,
// 그건 다른 키이고 Referrer-Policy·no-store 로 따로 막아 둔다.
ok('ADMIN_KEY 는 본문으로만 받는다',
   /if \(!req\.body \|\| !keyEq\(req\.body\.key, KEY\)\)/.test(srv)
   && !/ADMIN_KEY[\s\S]{0,200}req\.query/.test(srv));
// 비교는 상수 시간으로. 문자열 !== 는 앞자리가 어디서 틀렸는지가 시간에 드러나서,
// 이론상 한 글자씩 맞춰 나갈 수 있다. 코인 발행 권한이 걸린 키라 여기까지 막는다.
ok('관리자 키 비교는 상수 시간이다', /function keyEq\(/.test(srv) && /crypto\.timingSafeEqual/.test(srv));
ok('약한 관리자 키는 뜰 때 경고한다', /ADMIN_KEY 가 약합니다/.test(srv));
ok('주소로 받는 화면은 리퍼러·캐시를 막는다', (() => {
  for (const path of ['/stats', '/reports']) {
    const at = srv.indexOf(`app.get('${path}'`);
    if (at < 0) return false;
    const blk = srv.slice(at, at + 500);
    if (!/Referrer-Policy', 'no-referrer'/.test(blk) || !/Cache-Control', 'no-store'/.test(blk)) return false;
  }
  return true;
})());
ok('임시 계정 코드는 해시로만 보관', /scrypt/.test(acc) && !/plainCode|rawCode/.test(acc));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
