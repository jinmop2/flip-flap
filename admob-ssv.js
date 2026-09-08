// AdMob 보상형 광고의 서버 검증(SSV).
//
// 웹 광고에는 없고 앱 광고에만 있는 것이다. 이용자가 광고를 끝까지 보면
// 구글이 우리 서버로 직접 한 번 찔러 준다 — 화면을 거치지 않으므로,
// "봤다" 를 클라이언트가 말하는 게 아니라 구글이 말한다.
//
// 그 요청에는 서명이 붙어 있다. 서명을 확인해야 의미가 있다 — 안 하면
// 누구나 그 주소를 직접 불러 코인을 받아 갈 수 있다.
//
//   구글이 부르는 주소:  /api/admob-ssv?...&user_id=<표>&signature=..&key_id=..
//   서명 대상:            물음표 뒤 전체에서 &signature= 앞까지
const crypto = require('crypto');
const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

let keys = null;              // key_id → base64 공개키
let keysAt = 0;
const KEYS_TTL = 6 * 3600 * 1000;

async function loadKeys(force = false) {
  if (!force && keys && Date.now() - keysAt < KEYS_TTL) return keys;
  const r = await fetch(KEYS_URL);
  if (!r.ok) throw new Error('열쇠를 못 받았다: ' + r.status);
  const j = await r.json();
  const m = {};
  for (const k of j.keys || []) m[String(k.keyId)] = k.pem || k.base64;
  if (!Object.keys(m).length) throw new Error('열쇠 목록이 비어 있다');
  keys = m; keysAt = Date.now();
  return keys;
}

// base64 로 온 열쇠는 DER(SubjectPublicKeyInfo) 이다 — PEM 이면 그대로 쓴다.
function toKey(v) {
  const s = String(v || '');
  if (s.includes('BEGIN PUBLIC KEY')) return crypto.createPublicKey(s);
  return crypto.createPublicKey({ key: Buffer.from(s, 'base64'), format: 'der', type: 'spki' });
}

// rawQuery 는 '?' 를 뺀 질의 문자열 그대로여야 한다. express 가 parse 한 것을
// 다시 조립하면 순서와 인코딩이 달라져 서명이 안 맞는다.
async function verify(rawQuery) {
  const q = String(rawQuery || '');
  const cut = q.indexOf('&signature=');
  if (cut < 0) return { ok: false, why: '서명이 없다' };
  const signed = q.slice(0, cut);                       // 서명 대상
  const p = new URLSearchParams(q.slice(cut + 1));      // signature, key_id
  const sig = p.get('signature'), keyId = p.get('key_id');
  if (!sig || !keyId) return { ok: false, why: '서명이나 열쇠 번호가 없다' };

  let map = await loadKeys();
  let pem = map[keyId];
  if (!pem) { map = await loadKeys(true); pem = map[keyId]; }   // 열쇠가 돌았을 수 있다
  if (!pem) return { ok: false, why: '모르는 열쇠 번호' };

  // 서명은 base64url ECDSA(P-256, SHA-256) DER 이다
  const ok = crypto.verify('sha256', Buffer.from(signed, 'utf8'), toKey(pem),
                           Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  if (!ok) return { ok: false, why: '서명이 안 맞는다' };

  const all = new URLSearchParams(signed);
  return { ok: true, ticket: all.get('user_id') || '', adUnit: all.get('ad_unit') || '',
           amount: Number(all.get('reward_amount') || 0), txn: all.get('transaction_id') || '' };
}

module.exports = { verify, loadKeys };
