// Sign in with Apple — 남의 토큰으로 남의 계정에 못 들어오는가.
// 서명·발급자·대상·만료·nonce 다섯 중 하나만 빠뜨려도 뚫린다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const src = path.join(__dirname, '..');
const A = require(src + '/apple-auth.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

// 애플 대신 우리가 열쇠를 만들어 서명한다 — 확인 절차 자체가 도는지를 본다
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const KID = 'testkid';
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const make = (body, kid = KID, alg = 'RS256') => {
  const h = b64u({ alg, kid }), p = b64u(body);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return h + '.' + p + '.' + sig;
};
const now = Math.floor(Date.now() / 1000);
const good = { iss: 'https://appleid.apple.com', aud: 'com.mongdung.flipflap.web',
               sub: '000123.abc', exp: now + 600, iat: now, nonce: 'N1', email: 'a@b.com' };

(async () => {
  const g = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }) });

  console.log('① 바른 토큰');
  {
    const v = await A.verifyIdToken(make(good), good.aud, 'N1');
    ok('통과한다', v.ok === true, JSON.stringify(v));
    ok('사용자 번호를 꺼낸다', v.sub === '000123.abc', v.sub);
    ok('메일도 꺼낸다', v.email === 'a@b.com', v.email);
  }

  console.log('\n② 막아야 하는 것들');
  {
    const bad = async (label, tok, aud, nonce) => {
      const v = await A.verifyIdToken(tok, aud === undefined ? good.aud : aud, nonce === undefined ? 'N1' : nonce);
      ok(label, v.ok === false, JSON.stringify(v));
    };
    // 서명을 바꿔치기 — 다른 열쇠로 서명한 토큰
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const h = b64u({ alg: 'RS256', kid: KID }), p = b64u(good);
    const forged = h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), other.privateKey)
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await bad('서명이 다르면 막힌다', forged);
    await bad('발급자가 다르면 막힌다', make({ ...good, iss: 'https://evil.example' }));
    await bad('다른 서비스의 토큰은 막힌다', make({ ...good, aud: 'com.someone.else' }));
    await bad('만료된 토큰은 막힌다', make({ ...good, exp: now - 10 }));
    await bad('nonce 가 다르면 막힌다', make(good), undefined, 'N2');
    await bad('모르는 열쇠는 막힌다', make(good, 'otherkid'));
    await bad('alg 를 none 으로 바꿔도 막힌다', make(good, KID, 'none'));
    await bad('모양이 아니면 막힌다', 'not.a.token.at.all');
    await bad('빈 값도 막힌다', '');
  }
  global.fetch = g;

  console.log('\n③ 서버가 제대로 물려 있는가');
  {
    const s = fs.readFileSync(src + '/server.js', 'utf8');
    ok('설정이 없으면 버튼도 안 준다', /apple: !!APPLE_ID/.test(s));
    ok('애플만 POST 로 받는다', /app\.post\('\/auth\/apple\/callback'/.test(s));
    ok('form 형식을 따로 읽는다', /express\.urlencoded\(\{ extended: false, limit: '8kb' \}\)/.test(s));
    ok('nonce 를 만들어 보낸다', /nonce: n,/.test(s));
    ok('nonce 는 한 번 쓰면 버린다', /appleNonces\.delete\(nonce\)/.test(s));
    ok('앱에서 왔는지를 state 로 되살린다', /st\.startsWith\('app:'\)/.test(s));
    ok('앱이면 앱 주소로 돌아간다', /\$\{APP_SCHEME\}:\/\/auth\$\{hash\}/.test(s));
    ok('이름은 첫 로그인 때만 온다는 걸 안다', /req\.body && req\.body\.user/.test(s));
  }

  console.log('\n④ 화면');
  {
    const h = fs.readFileSync(src + '/public/index.html', 'utf8');
    const c = fs.readFileSync(src + '/public/client.js', 'utf8');
    ok('버튼이 있다', /id="titleApple"[^>]*onclick="socialLogin\('apple'\)"/.test(h));
    ok('규정이 정한 색을 쓴다', /\.social-btn\.apple \{ background:#fff/.test(h));
    ok('설정됐을 때만 보인다', /if \(d\.apple\)/.test(c));
    const a2 = fs.readFileSync(src + '/accounts.js', 'utf8');
    ok('계정이 provider 로 갈린다', /socialLogin\('apple', appleSub/.test(a2));
  }

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
