// 앱 알림(FCM).
//
// 웹푸시는 서비스워커 위에서 돈다. 앱에는 서비스워커를 안 까니 그 길이 없어서,
// 앱에는 파이어베이스로 따로 보낸다. 받는 쪽 화면과 문구는 웹과 같다 —
// 다른 것은 '무엇을 타고 가느냐' 뿐이다.
//
// 설정은 환경변수로만 받는다. 서비스 계정 열쇠가 저장소에 들어가면 그걸로
// 누구나 이 앱 이름으로 알림을 쏠 수 있다.
//
//   FCM_SERVICE_ACCOUNT   파이어베이스 콘솔에서 받은 서비스 계정 JSON 통째로
//   (또는) FCM_PROJECT_ID · FCM_CLIENT_EMAIL · FCM_PRIVATE_KEY
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function loadKey() {
  const raw = process.env.FCM_SERVICE_ACCOUNT || '';
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j.project_id && j.client_email && j.private_key) return j;
      console.error('[FCM] 서비스 계정 JSON 에 project_id·client_email·private_key 가 있어야 합니다.');
      return null;
    } catch (_) { console.error('[FCM] 서비스 계정 JSON 을 못 읽었습니다.'); return null; }
  }
  const id = process.env.FCM_PROJECT_ID, mail = process.env.FCM_CLIENT_EMAIL;
  let key = process.env.FCM_PRIVATE_KEY || '';
  // 환경변수 칸에 여러 줄을 못 넣는 곳이 많아서 \n 을 글자로 적어 두는 일이 흔하다
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  if (id && mail && key) return { project_id: id, client_email: mail, private_key: key };
  return null;
}
const KEY = loadKey();
const ON = !!KEY;

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached = null;              // { token, exp }
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;       // 만료 1분 전까지 쓴다
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: KEY.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), KEY.private_key));
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('토큰을 못 받았다: ' + JSON.stringify(j).slice(0, 200));
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}

// 한 기기에 보낸다. 돌려주는 값:
//   'ok'    보냈다
//   'gone'  그 기기는 이제 없다 — 부르는 쪽이 토큰을 지워야 한다
//   'fail'  그 밖의 실패 (잠시 뒤 다시)
async function sendTo(fcmToken, { title, body, data }) {
  if (!ON) return 'fail';
  const at = await accessToken();
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${KEY.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        // 눌렀을 때 어디로 갈지는 화면이 정한다 — 값은 전부 문자열이어야 한다
        data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high', notification: { channel_id: 'flipflap', sound: 'default' } },
      },
    }),
  });
  if (r.ok) return 'ok';
  // 지워진 앱·바뀐 토큰은 404(UNREGISTERED) 나 400(INVALID_ARGUMENT) 로 온다
  let why = '';
  try { why = JSON.stringify(await r.json()).slice(0, 300); } catch (_) {}
  if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(why)) return 'gone';
  console.error('[FCM] 보내기 실패', r.status, why);
  return 'fail';
}

module.exports = { ON, sendTo, projectId: KEY ? KEY.project_id : null };
