// FLIP FLAP 서비스워커 — 재방문 로딩 가속 + 설치(PWA) 요건
// 전략: 네트워크 우선(배포 즉시 반영), 실패 시 캐시 폴백. 소켓/API는 건드리지 않음.
// 판을 올리면 옛 캐시를 버린다. 안 올리면 깨어나는 동안 그물이 끊겨
// 캐시로 물러난 사람이 옛 화면을 계속 보게 된다.
const VER = 'ff-v5';
const CORE = ['/', '/client.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;                       // 카카오 SDK·폰트 등 외부는 브라우저에 맡김
  if (/^\/(socket\.io|api|auth|health)/.test(url.pathname)) return; // 실시간·API는 캐시 금지
  if (/\.(mp3|m4a)$/.test(url.pathname)) return;                    // 대용량 오디오는 브라우저 HTTP 캐시에 위임 (206 부분응답 캐시 오류 방지)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.status === 200) { const cp = res.clone(); caches.open(VER).then(c => c.put(e.request, cp)).catch(() => {}); }
        return res;
      })
      .then((res) => {
        // 서버가 깨어나는 중(503)이면 그 오류 화면을 보여 주느니 지난 판을 보여 준다
        if (!res || res.status >= 500) return caches.match(e.request, { ignoreSearch: url.pathname === '/' }).then((c) => c || res);
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: url.pathname === '/' }))
  );
});
