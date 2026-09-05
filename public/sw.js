// FLIP FLAP 서비스워커 — 재방문 로딩 가속 + 설치(PWA) 요건
// 전략: 네트워크 우선(배포 즉시 반영), 실패 시 캐시 폴백. 소켓/API는 건드리지 않음.
// 판을 올리면 옛 캐시를 버린다. 안 올리면 깨어나는 동안 그물이 끊겨
// 캐시로 물러난 사람이 옛 화면을 계속 보게 된다.
const VER = 'ff-v17';
// 그물이 아예 없는 채로 앱을 켜도 판이 열려야 한다. 그러려면 판을 굴리는 데
// 필요한 것이 미리 담겨 있어야 한다 — 한 번이라도 온라인으로 열어 본 뒤부터다.
// socket.io 가 빠지면 client.js 첫 줄에서 io 를 못 찾아 화면이 통째로 죽는다.
const CORE = ['/', '/client.js', '/client4.js', '/manifest.webmanifest',
              '/icon-192.png?v=2', '/icon-512.png?v=2',
              '/socket.io/socket.io.js',
              '/rules2.js', '/ai2.js', '/offline.js',
              // 트웰브·다인전도 그물 없이 두려면 엔진이 손에 있어야 한다
              '/twelve.js', '/game4.js', '/ai4.js', '/items.js', '/view4.js', '/items2.js',
              '/i18n.js', '/lang-ja.js', '/lang-zh.js', '/art.js', '/item-icons.js'];

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
  // 라이브러리 파일 하나만 예외다. 이게 없으면 화면이 아예 안 뜬다.
  if (url.pathname !== '/socket.io/socket.io.js'
      && /^\/(socket\.io|api|auth|health)/.test(url.pathname)) return; // 실시간·API는 캐시 금지
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

// ── 알림 ──────────────────────────────────────────────────────────────────
// 앱을 안 보고 있을 때 도전장 같은 것을 알린다. 보내는 쪽(서버)이 무엇을
// 넣었는지 믿지 않는다 — 글자는 잘라 쓰고, 여는 주소는 우리 것만 쓴다.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const cut = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, n);
  let title = 'FLIP FLAP';
  let body = '';
  let url = '/';
  if (d.kind === 'challenge') {
    title = '도전장이 왔어요';
    body = cut(d.from, 20) + ' 님이 한 판 하자고 합니다';
    if (typeof d.roomId === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(d.roomId)) url = '/?room=' + d.roomId;
  } else if (d.kind === 'turn') {
    title = '내 차례예요';
    body = cut(d.body, 60) || '판이 기다리고 있어요';
  } else {
    body = cut(d.body, 80);
    if (!body) return;                       // 무슨 말인지 모르면 아예 안 띄운다
  }
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icon-192.png?v=2', badge: '/icon-192.png?v=2',
    tag: d.kind || 'ff', renotify: false, data: { url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || '/';
  // 우리 쪽 주소로만 연다
  const url = new URL(raw, self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        c.navigate(url.href).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url.href);
  }));
});
