// Sign in with Apple.
//
// 애플 심사 규정 4.8 — 카카오·구글 같은 제3자 로그인을 쓰면 애플 로그인도
// 같이 내놔야 한다. 선택이 아니라 통과 조건이다.
//
// 구글·카카오와 다른 점이 셋이다.
//   ① 애플은 결과를 GET 이 아니라 POST(form_post)로 돌려준다.
//   ② 그 안에 id_token(JWT)이 들어 있어, 코드를 다시 교환하지 않아도 된다 —
//      서명만 확인하면 누구인지 알 수 있다. 그래서 .p8 비밀키가 로그인에는
//      필요 없다(회원 탈퇴 연동에는 필요하다).
//   ③ 이름은 첫 로그인 때 딱 한 번만 온다. 그때 안 받아 두면 다시는 못 받는다.
//
// 확인하는 것: 서명 · 발급자 · 대상(우리 서비스 ID) · 만료 · nonce.
// 하나라도 빠뜨리면 남의 토큰으로 남의 계정에 들어올 수 있다.
const crypto = require('crypto');

const KEYS_URL = 'https://appleid.apple.com/auth/keys';
const ISS = 'https://appleid.apple.com';

let keys = null, keysAt = 0;
const KEYS_TTL = 6 * 3600 * 1000;

async function loadKeys(force = false) {
  if (!force && keys && Date.now() - keysAt < KEYS_TTL) return keys;
  const r = await fetch(KEYS_URL);
  if (!r.ok) throw new Error('애플 열쇠를 못 받았다: ' + r.status);
  const j = await r.json();
  const m = {};
  for (const k of j.keys || []) m[k.kid] = k;
  if (!Object.keys(m).length) throw new Error('애플 열쇠 목록이 비어 있다');
  keys = m; keysAt = Date.now();
  return keys;
}

const b64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// JWK(RSA) → 확인에 쓸 열쇠
function jwkToKey(jwk) {
  return crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
}

// id_token 을 열어 본다. 통과하면 { sub, email } 을 돌려준다.
async function verifyIdToken(idToken, clientId, nonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return { ok: false, why: '토큰 모양이 아니다' };
  let head, body;
  try {
    head = JSON.parse(b64u(parts[0]).toString('utf8'));
    body = JSON.parse(b64u(parts[1]).toString('utf8'));
  } catch (_) { return { ok: false, why: '토큰을 못 읽었다' }; }
  if (head.alg !== 'RS256') return { ok: false, why: '모르는 서명 방식: ' + head.alg };

  let map = await loadKeys();
  let jwk = map[head.kid];
  if (!jwk) { map = await loadKeys(true); jwk = map[head.kid]; }   // 열쇠가 돌았을 수 있다
  if (!jwk) return { ok: false, why: '모르는 열쇠 번호' };

  const signed = parts[0] + '.' + parts[1];
  const ok = crypto.verify('RSA-SHA256', Buffer.from(signed, 'utf8'), jwkToKey(jwk), b64u(parts[2]));
  if (!ok) return { ok: false, why: '서명이 안 맞는다' };

  if (body.iss !== ISS) return { ok: false, why: '발급자가 다르다' };
  // aud 는 문자열이거나 배열이다
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (!clientId || !aud.includes(clientId)) return { ok: false, why: '우리에게 온 토큰이 아니다' };
  const now = Math.floor(Date.now() / 1000);
  if (!body.exp || body.exp < now) return { ok: false, why: '만료됐다' };
  if (body.iat && body.iat > now + 300) return { ok: false, why: '미래에 발급됐다' };
  // nonce — 되돌려 쓰기(replay)를 막는다. 우리가 보낸 것과 같아야 한다.
  if (nonce && body.nonce !== nonce) return { ok: false, why: 'nonce 가 다르다' };
  if (!body.sub) return { ok: false, why: '사용자 번호가 없다' };

  return { ok: true, sub: String(body.sub), email: body.email || '' };
}

module.exports = { verifyIdToken, loadKeys };
