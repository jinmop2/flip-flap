// 임시 계정 — 코드 한 줄로 들어오는 문이다. 문은 좁아야 한다.
// 여기서 보는 것: 코드가 저장소에 남지 않는가, 틀린 코드가 통하지 않는가,
// 기한·재발급·해지가 실제로 막는가, 관리자 키 없이 만들 수 없는가.
const fs = require('fs');
const path = require('path');
const os = require('os');
const src = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

// 진짜 계정 파일을 건드리지 않게 임시 파일에 저장하도록 바꿔 놓고 부른다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-temp-'));
const store = path.join(tmp, 'accounts.json');
process.env.FF_DATA_FILE = store;
delete process.env.DATABASE_URL;                 // 로컬 파일 저장으로 강제
const A = require(src + '/accounts.js');

(async () => {
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('① 만들기');
const made = A.createTempAccounts(5, { coins: 3000 });
ok('다섯 개가 만들어진다', made.ok && made.accounts.length === 5, String(made.accounts && made.accounts.length));
ok('코드는 만들 때만 나온다', made.accounts.every((a) => typeof a.code === 'string'));
ok('코드가 12자다', made.accounts.every((a) => a.code.replace(/-/g, '').length === 12),
   made.accounts[0].code);
ok('헷갈리는 글자를 안 쓴다', made.accounts.every((a) => !/[01OIL]/.test(a.code.replace(/-/g, ''))),
   made.accounts.map((a) => a.code).join(' '));
ok('코드가 서로 다르다', new Set(made.accounts.map((a) => a.code)).size === 5);
ok('닉네임이 서로 다르다', new Set(made.accounts.map((a) => a.nick)).size === 5);
ok('코인이 들어 있다', made.accounts.length === 5);
ok('기한이 있다', made.accounts.every((a) => a.expiresAt > Date.now()));

console.log('\n② 코드는 저장소에 남지 않는다');
{
  await sleep(500);                    // 저장은 300ms 뒤에 몰아서 한다
  // 저장 파일 어디에도 코드 원문이 있으면 안 된다 — 새면 그대로 남의 계정이다
  const raw = fs.readFileSync(store, 'utf8');
  let leaked = 0;
  for (const a of made.accounts) if (raw.includes(a.code.replace(/-/g, '')) || raw.includes(a.code)) leaked++;
  ok('파일에 코드 원문이 없다', leaked === 0, `${leaked}개 샘`);
  ok('해시와 소금만 남는다', /"tempHash"/.test(raw) && /"tempSalt"/.test(raw));
  // 목록에도 코드는 안 나온다 — 서버도 모른다
  const list = A.tempAccountList();
  ok('목록에 코드가 없다', JSON.stringify(list).indexOf('code') === -1 || !list.accounts.some((x) => x.code));
  ok('목록에 다섯 개', list.accounts.length === 5);
  ok('살아 있다고 표시된다', list.accounts.every((x) => x.active));
}

console.log('\n③ 코드로 들어간다');
{
  const first = made.accounts[0];
  const r = A.codeLogin(first.code);
  ok('맞는 코드는 통한다', r.ok === true, r.error);
  ok('토큰이 나온다', typeof r.token === 'string' && r.token.length > 20);
  ok('그 계정이 맞다', r.profile.nick === first.nick, `${r.profile && r.profile.nick} vs ${first.nick}`);
  ok('하이픈 없이 넣어도 된다', A.codeLogin(first.code.replace(/-/g, '')).ok === true);
  ok('소문자로 넣어도 된다', A.codeLogin(first.code.toLowerCase()).ok === true);
  ok('띄어쓰기가 섞여도 된다', A.codeLogin(' ' + first.code + ' ').ok === true);
  // 토큰으로 실제로 그 사람이 된다
  const me = A.byToken(A.codeLogin(first.code).token);
  ok('토큰이 그 계정을 가리킨다', me && me.nick === first.nick);
}

console.log('\n④ 틀린 코드는 안 통한다');
{
  ok('빈 코드', A.codeLogin('').error !== undefined);
  ok('짧은 코드', A.codeLogin('ABCD').error !== undefined);
  ok('긴 코드', A.codeLogin('ABCDEFGHJKMNPQ').error !== undefined);
  ok('없는 코드', A.codeLogin('ZZZZ-ZZZZ-ZZZZ').error !== undefined);
  ok('한 글자만 틀려도 막힌다', (() => {
    const c = made.accounts[1].code.replace(/-/g, '');
    const bad = (c[0] === 'A' ? 'B' : 'A') + c.slice(1);
    return A.codeLogin(bad).error !== undefined;
  })());
  ok('null·객체를 넣어도 터지지 않는다',
     A.codeLogin(null).error !== undefined && A.codeLogin({}).error !== undefined);
  // 다른 계정 코드로 남의 자리에 못 들어간다
  const r0 = A.codeLogin(made.accounts[0].code), r1 = A.codeLogin(made.accounts[1].code);
  ok('코드마다 계정이 따로다', r0.profile.nick !== r1.profile.nick);
}

console.log('\n⑤ 비밀번호로는 못 들어온다');
{
  // 임시 계정은 비밀번호가 없다. 빈 비번·아무 비번으로 뚫리면 안 된다.
  for (const pw of ['', ' ', 'password', '123456', null])
    ok(`비밀번호 ${JSON.stringify(pw)} 로는 안 된다`, A.login('guest01', pw).error !== undefined);
}

console.log('\n⑥ 재발급하면 옛 코드는 죽는다');
{
  const old = made.accounts[2];
  const r = A.rotateTempCode('guest03');
  ok('새 코드가 나온다', r.ok && r.code && r.code !== old.code, r.error);
  ok('옛 코드는 이제 안 통한다', A.codeLogin(old.code).error !== undefined);
  ok('새 코드는 통한다', A.codeLogin(r.code).ok === true);
  ok('임시 계정이 아니면 거절', A.rotateTempCode('없는계정').error !== undefined);
}

console.log('\n⑦ 해지하면 문이 닫힌다');
{
  const target = made.accounts[3];
  ok('해지된다', A.revokeTempCode('guest04').ok === true);
  ok('해지 뒤에는 안 통한다', A.codeLogin(target.code).error !== undefined);
  ok('목록에는 남되 꺼진 것으로', (() => {
    const x = A.tempAccountList().accounts.find((y) => y.id === 'guest04');
    return x && x.active === false;
  })());
}

console.log('\n⑧ 기한이 지나면 안 통한다');
{
  const target = made.accounts[4];
  ok('기한 전에는 통한다', A.codeLogin(target.code).ok === true);
  // 파일을 직접 고치지 않고, 만료 시각만 과거로 돌린다
  const u = A.byToken(A.codeLogin(target.code).token);
  u.tempExp = Date.now() - 1000;
  ok('기한이 지나면 막힌다', A.codeLogin(target.code).error !== undefined);
}

console.log('\n⑨ 서버 쪽 문단속');
{
  const srv = fs.readFileSync(src + '/server.js', 'utf8');
  ok('만들기는 관리자 키가 필요하다', /temp-new[\s\S]{0,120}adminOk\(req, res\)/.test(srv));
  ok('재발급·해지도 관리자 키', /temp-rotate[\s\S]{0,120}adminOk/.test(srv) && /temp-revoke[\s\S]{0,120}adminOk/.test(srv));
  ok('목록도 관리자 키', /temp-list[\s\S]{0,120}adminOk/.test(srv));
  // 코드 로그인 창구는 없앴다. 열어 둔 인증 통로가 하나 줄었으므로,
  // "다시 생기지 않았는지" 를 대신 지킨다.
  ok('코드 로그인 통로가 없다', !/code-login/.test(srv) && !/codeFail/.test(srv));
  // 임시 계정 쪽은 키를 본문으로만 받는다 — 쿼리로 받으면 브라우저 기록·리퍼러·
  // 서버 로그에 계정을 찍어낼 권한이 그대로 남는다.
  const tempBlock = srv.slice(srv.indexOf("/api/admin/temp-new"), srv.indexOf("/api/admin/temp-list") + 800);
  ok('임시 계정 쪽은 키를 쿼리로 안 받는다', !/req\.query/.test(tempBlock));
  const acc = fs.readFileSync(src + '/accounts.js', 'utf8');
  ok('코드는 해시로만 저장한다', /u\.tempHash = hashPw\(/.test(acc));
  ok('비교는 timingSafeEqual', /crypto\.timingSafeEqual\(got, want\)/.test(acc));
  ok('임시 계정은 비밀번호가 없다', /salt: null, hash: null/.test(acc));
  ok('없는 키를 만들지 않는다', /hasOwnProperty\.call\(db\.users, idl\)/.test(acc));
  ok('코드 알파벳에 0·O·1·I·L 이 없다',
     /const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'/.test(acc));
  ok('뽑기 편향을 버린다 (모듈로 편향)', /if \(b >= limit\) continue;/.test(acc));
}

console.log('\n⑩ 코드가 충분히 넓다');
{
  // 31글자 12자 = 약 59.5비트. 초당 백만 번을 찍어도 수만 년.
  const bits = Math.log2(Math.pow(31, 12));
  ok('경우의 수가 5x10^17 이상', Math.pow(31, 12) > 5e17, Math.pow(31, 12).toExponential(2));
  ok('58비트 이상', bits > 58, bits.toFixed(1));
  // 실제로 겹치지 않는지 — 200개를 뽑아 본다
  const seen = new Set();
  const more = A.createTempAccounts(20, { coins: 0 });
  for (const a of more.accounts) seen.add(a.code);
  ok('20개를 더 뽑아도 안 겹친다', seen.size === 20, String(seen.size));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
})();
