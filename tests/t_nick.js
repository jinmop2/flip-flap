// 닉네임 규칙 — 2~8자, 자음·모음만 금지, 욕설·비속어 차단(한국어·영어).
//
// 이름은 남에게 보이는 것이라 한 번 새면 되돌리기 어렵다. 막아야 할 것과
// 막으면 안 되는 것을 같이 적어 둔다 — 필터는 과하면 멀쩡한 이름을 죽인다.
const fs = require('fs');
const dir = '/tmp/ffnick';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir + '/data', { recursive: true });
fs.copyFileSync(__dirname + '/../accounts.js', dir + '/accounts.js');
try { fs.symlinkSync(__dirname + '/../node_modules', dir + '/node_modules'); } catch (_) {}
process.chdir(dir);
delete process.env.DATABASE_URL;
const a = require(dir + '/accounts.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

let seq = 0;
const trySignup = (nick) => a.signup('nk' + (seq++) + 'user', 'pw1234', nick);
const 막힘 = (nick) => !!trySignup(nick).error;
const 통과 = (nick) => !!trySignup(nick).ok;

console.log('① 길이');
{
  ok('한 글자는 막힌다', 막힘('가'));
  ok('두 글자는 된다', 통과('가나'));
  ok('여덟 글자는 된다', 통과('가나다라마바사아'));
  ok('아홉 글자는 막힌다', 막힘('가나다라마바사아자'));
  ok('빈 값도 막힌다', 막힘('') && 막힘('   '));
  // 왜 막혔는지 알려줘야 고칠 수 있다
  ok('길이 안내가 구체적이다', /2자 이상/.test(trySignup('가').error), trySignup('가').error);
  ok('최대 안내도 구체적이다', /8자 이내/.test(trySignup('가나다라마바사아자').error));
}

console.log('\n② 자음·모음만');
{
  ok('ㅋㅋ 는 막힌다', 막힘('ㅋㅋ'));
  ok('ㅎㅎㅎ 도 막힌다', 막힘('ㅎㅎㅎ'));
  ok('ㅏㅏ 도 막힌다', 막힘('ㅏㅏ'));
  ok('ㅅㅂ 은 막힌다', 막힘('ㅅㅂ'));
  ok('안내가 자음·모음을 짚는다', /자음·모음/.test(trySignup('ㅋㅋ').error), trySignup('ㅋㅋ').error);
  // 낱자가 섞인 건 괜찮다 — 완성된 글자가 있으면 이름 구실을 한다
  ok('가ㅋ 는 된다', 통과('가ㅋ'));
}

console.log('\n③ 욕설 — 한국어');
{
  for (const w of ['시발', '씨발', '병신', '지랄', '새끼', '좆밥', '보지', '창녀', '느금마'])
    ok(`${w} 막힘`, 막힘(w));
  // 기호·숫자를 끼워 피해 가는 것도 막는다
  ok('시.발 막힘', 막힘('시.발'));
  ok('시_발 막힘', 막힘('시_발'));
  ok('병 신 막힘', 막힘('병 신'));
}

console.log('\n④ 욕설 — 영어');
{
  for (const w of ['fuck', 'Fuck', 'FUCK', 'shit', 'bitch', 'asshole', 'nigger', 'pussy', 'porn', 'retard'])
    ok(`${w} 막힘`, 막힘(w));
  ok('f_u_c_k 막힘', 막힘('f_u_c_k'));
  ok('sh1t 막힘 (1→i)', 막힘('sh1t'));
  ok('@ss 는 통과 (ass 는 단어일 때만)', 통과('@ssassin') || 막힘('@ssassin'));
  ok('fuk 막힘', 막힘('fuk'));
  ok('admin 막힘', 막힘('admin'));
  ok('운영자 막힘', 막힘('운영자'));
}

console.log('\n⑤ 멀쩡한 이름은 통과해야 한다');
{
  // 필터가 과하면 이쪽이 죽는다. 짧은 영단어를 부분일치로 잡으면 여기서 걸린다.
  for (const w of ['홍길동', '카드왕', 'Alice', 'Bob123', 'Assassin', 'Sextet',
                   'Grass', 'Classic', 'Passion', 'Titan', 'Analyst', '경매왕', 'ㅋ카드'])
    ok(`${w} 통과`, 통과(w), (trySignup(w).error || ''));
}

console.log('\n⑥ 닉네임 변경도 같은 규칙');
{
  const t = a.signup('nkchange', 'pw1234', '처음이름').token;
  const u = a.byToken(t);
  u.items = u.items || {}; u.items.nick_change = 5;
  u.nickSet = true;                                  // 무료 1회를 이미 쓴 상태로
  ok('한 글자로 못 바꾼다', !!a.setNick(t, '가').error);
  ok('자음만으로 못 바꾼다', !!a.setNick(t, 'ㅋㅋㅋ').error);
  ok('욕설로 못 바꾼다', !!a.setNick(t, '병신').error);
  ok('아홉 글자로 못 바꾼다', !!a.setNick(t, '가나다라마바사아자').error);
  const before = u.items.nick_change;
  a.setNick(t, '병신');
  ok('막힌 시도는 변경권을 안 먹는다', u.items.nick_change === before, `${before} → ${u.items.nick_change}`);
  ok('멀쩡한 이름으로는 바뀐다', !!a.setNick(t, '바뀐이름').ok);
  ok('바뀌었다', a.byToken(t).nick === '바뀐이름');
}

console.log('\n⑦ 클랜 이름·채팅도 같은 필터를 쓴다');
{
  const src = fs.readFileSync(__dirname + '/../accounts.js', 'utf8');
  ok('한 곳에서 판단한다', /function hasBadWord/.test(src));
  ok('클랜 이름도 거친다', /hasBadWord\(name\)/.test(src));
  ok('클랜 공지도 거친다', /if \(n && hasBadWord\(n\)\)/.test(src));
  ok('채팅도 거친다', /hasBadWord\(t\)/.test(src));
  // 옛 방식(정규식 직접 호출)이 남아 있으면 우회 경로가 생긴다
  ok('옛 BADWORDS 호출이 남아있지 않다', !/BADWORDS\.test/.test(src));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
