// io 가 없으면 여기서 터지고 아래가 통째로 안 돈다 — 로딩 화면이 영영 안 걷힌다.
// 캐시가 비었거나 첫 실행이 오프라인이면 실제로 그렇게 된다. 그럴 땐 붙지 않는
// 가짜 소켓으로 화면을 띄우고, 그물이 돌아오면 그때 제대로 다시 읽는다.
const socket = (typeof io === 'function')
  ? io({ transports: ['websocket', 'polling'] })   // 웹소켓 우선 — 폴링 왕복 생략, 연결 빨라짐
  : (() => {
      // 듣는 것만은 진짜로 받아 둔다. 그래야 그물 없이 두는 판이 서버 대신
      // 같은 자리로 상태를 건넬 수 있다 — 화면 코드는 하나로 끝난다.
      const L = {};
      const noop = () => {};
      const s = {
        connected: false, id: null,
        on(ev, fn) { (L[ev] || (L[ev] = [])).push(fn); return this; },
        off(ev, fn) { if (L[ev]) L[ev] = fn ? L[ev].filter((f) => f !== fn) : []; return this; },
        once(ev, fn) { const one = (d) => { s.off(ev, one); fn(d); }; return s.on(ev, one); },
        emit: noop, connect: noop, disconnect: noop,
        io: { reconnection: noop, opts: {} },
        listeners(ev) { return (L[ev] || []).slice(); },
      };
      // 그물이 돌아오면 한 번만 다시 읽는다. 그래야 온라인으로 이어서 할 수 있다.
      window.addEventListener('online', () => { if (typeof io !== 'function') location.reload(); }, { once: true });
      return s;
    })();

// ── 그물 없이 두는 판 ─────────────────────────────────────────────────────
// 오프라인 판이 돌고 있으면 판 신호를 서버로 안 보내고 화면이 직접 처리한다.
// 부르는 쪽은 socket.emit 그대로 쓴다 — 여기서만 갈라진다.
const _emit = socket.emit.bind(socket);
socket.emit = function (ev, data) {
  if (window.OFFLINE && OFFLINE.handle(ev, data)) return;
  return _emit(ev, data);
};
// 오프라인 판이 서버 노릇을 할 때, 상태를 socket.on 으로 달아 둔 그 자리로
// 건넨다. 온라인이든 아니든 화면을 그리는 코드는 하나뿐이다.
window.FFONLINE = () => !!socket.connected;
window.FFDELIVER = function (ev, data) {
  const ls = typeof socket.listeners === 'function' ? socket.listeners(ev) : [];
  for (const fn of ls) { try { fn(data); } catch (e) { console.error('[오프라인] ' + ev, e); } }
};

// ── 화면 높이 동기화 ──────────────────────────────────────
// 모바일 브라우저는 주소창이 떠 있어도 100vh 를 "주소창 숨김 기준"으로 계산한다.
// 그러면 게임판이 화면보다 커져 하단(내 손패·프로필)이 잘린다.
// dvh 를 못 쓰는 구형 iOS·카톡 인앱 브라우저까지 덮으려면 실제 보이는 높이를 직접 넣는 수밖에 없다.
// visualViewport 가 있으면 그쪽이 가장 정확하다(키보드·주소창 반영).
let _appHRaf = 0;
function syncAppHeight() {
  if (_appHRaf) return;                                   // 리사이즈 폭주 방지 — 프레임당 한 번만
  _appHRaf = requestAnimationFrame(() => {
    _appHRaf = 0;
    const h = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
    if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
    // 판 높이는 이 값에 매여 있다 — 값이 바뀌었으면 테이블도 다시 재야 한다
    if (typeof scheduleRelayout === 'function') scheduleRelayout();
  });
}
// 화면 아래쪽을 연달아 두 번 두드리면, iOS 는 보이는 영역(visual viewport)을
// 아래로 밀어 놓고 그대로 굳어 버린다 — 화면이 내려간 채 안 돌아오는 그것.
// 글자를 넣는 중(키보드가 밀어 올린 경우)이 아니면 제자리로 되돌린다.
function pinViewport() {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;   // 키보드가 올린 것은 정상이다
  const vv = window.visualViewport;
  const off = vv ? vv.offsetTop : 0;
  if (off > 0 || window.scrollY !== 0) {
    // 판이 열려 있으면 스크롤이 있을 이유가 없다. 로비는 스크롤을 건드리지 않고
    // 밀린 만큼만 되돌린다.
    const ingame = document.body.classList.contains('ingame')
                || document.body.classList.contains('quad4');
    if (ingame) window.scrollTo(0, 0);
    else if (off > 0) window.scrollTo(0, window.scrollY);
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('scroll', pinViewport);
  window.visualViewport.addEventListener('resize', pinViewport);
}


// ── 판 크기 맞추기 ────────────────────────────────────────
// 폰 세로는 원래 이 비율로 만든 화면이라 손대지 않는다(각 기기 폭에 맞춰
// 반응형 규칙이 이미 잡아 준다). 컴퓨터나 가로 화면에서는 설계 크기를
// 화면에 꽉 차게 배율만 준다 — 폭만 늘리면 카드·글씨 비율이 어긋난다.
const BOARD_W = 780, BOARD_H = 920;     // 세로 배치의 설계 크기
const LAND_W = 940, LAND_H = 520;       // 가로 배치의 설계 크기
function fitBoard() {
  const vw = window.innerWidth;
  const vh = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
  const root = document.documentElement;
  const body = document.body;

  // 손에 쥔 세로 화면 = 원래 판. 그대로 둔다(기기 폭에 맞춘 반응형이 이미 잡는다).
  if (vw <= 700 && vh > vw) {
    body.classList.remove('board-zoom', 'land');
    root.style.removeProperty('--board-zoom');
    scheduleRelayout();   // 가로에서 돌아온 길이다 — 판을 다시 재야 한다
    return;
  }

  // 가로 전용 배치(화면 전체가 펠트)는 눕힌 폰처럼 높이가 정말 없을 때만 쓴다.
  //
  // 예전 기준은 "높이 760 미만" 이었는데, 노트북 창이 대부분 그 아래로 들어온다
  // (1366×660, 1440×760…). 그래서 노트북에서 타원 테이블이 사라지고 화면 전체가
  // 펠트인 큰 판이 떴다 — 카드가 좌우로 흩어져 어디를 봐야 할지 모르게 된다.
  // 노트북은 높이가 넉넉하니 폰과 같은 세로 판(타원 테이블)을 그대로 키운다.
  const land = vw > vh * 1.15 && vh < 560;
  const W = land ? LAND_W : BOARD_W, H = land ? LAND_H : BOARD_H;
  const z = Math.min((vw - 16) / W, (vh - 8) / H);
  root.style.setProperty('--board-w', W + 'px');
  root.style.setProperty('--board-h', H + 'px');
  root.style.setProperty('--board-zoom', String(Math.max(0.42, Math.min(1.9, z))));
  body.classList.add('board-zoom');
  body.classList.toggle('land', land);
  scheduleRelayout();
}
// 화면이 바뀌면 카드 크기도 자리도 바뀐다 — 테이블을 다시 잰다.
// 세로↔가로는 배치가 통째로 갈리므로(.land) 반드시 그 뒤에 불려야 한다.
function relayoutBoards() {
  try {
    if (document.body.classList.contains('twelve')) tvAlignRow();
    else if (document.body.classList.contains('quad4')) quadLayTable();
    else gameLayTable();
  } catch (_) {}
}

// 다인전도 2인전·트웰브와 같은 판 위에서 논다. 다만 사람이 셋·넷이라
// 자리가 위아래가 아니라 판을 둘러 앉는다 — 판은 그 자리들을 다 품을 만큼 잡는다.
window.quadLayTable = quadLayTable;
function quadLayTable() {
  const table = document.getElementById('quad-table');
  const host = document.getElementById('game4');
  if (!table || !host) return;
  if (document.body.classList.contains('land')) { table.classList.remove('on'); return; }
  const r = (id) => { const el = document.getElementById(id); const b = el && el.getBoundingClientRect();
    return b && b.width ? b : null; };
  const mat = r('q-mat');
  if (!mat) { table.classList.remove('on'); return; }
  const h = host.getBoundingClientRect();
  const RAIL = 25;
  // 사람은 레일에 걸터앉는다 — 2인전에서 프로필이 판 가장자리에 반쯤 올라앉는
  // 그 모양이다. 그래서 판의 네 변은 네 사람의 한가운데를 지난다.
  const mid = (el, axis) => {
    const b = el && el.getBoundingClientRect();
    if (!b || !b.width) return null;
    return axis === 'x' ? b.left + b.width / 2 : b.top + b.height / 2;
  };
  const q = (sel) => document.querySelector(sel);
  const left0 = mid(q('.q-opp.at-l'), 'x');
  const right0 = mid(q('.q-opp.at-r'), 'x');
  const top0 = mid(q('.q-opp.at-t'), 'y');
  const me0 = mid(document.getElementById('q-mebar'), 'y');
  const myhand = r('q-myhand');

  // 셋이 붙는 판은 왼쪽에만 사람이 앉는다. 빈 변을 경매대에서 뽑으면 판이
  // 앉은 쪽으로 기울고, 경매대가 판 한가운데에서 밀려 보인다(재 보니 15px).
  // 빈 변은 앉은 쪽을 경매대 기준으로 되비쳐 잡는다 — 판이 대칭이 된다.
  const matMid = (mat.left + mat.right) / 2;
  let left = left0 != null ? left0
           : right0 != null ? 2 * matMid - right0 : mat.left - RAIL;
  let right = right0 != null ? right0
            : left0 != null ? 2 * matMid - left0 : mat.right + RAIL;
  // 셋이 붙는 판은 위에 아무도 안 앉는다. 그렇다고 윗변을 경매대에서 뽑으면
  // 경매대가 늘 판 꼭대기에 붙는다 — 윗변이 경매대를 따라다니기 때문이다.
  // (경매대를 내리면 판도 같이 내려가 제자리걸음이 된다.)
  // 그래서 옆에 앉은 사람에게서 뽑는다. 다른 변이 사람에게서 나오는 것과 같다.
  const sideTop = (() => {
    const a = q('.q-opp.at-l'), b2 = q('.q-opp.at-r');
    const t = [a, b2].map((e) => { const r = e && e.getBoundingClientRect(); return r && r.height ? r.top : null; })
                     .filter((x) => x != null);
    return t.length ? Math.min(...t) : null;
  })();
  let top = top0 != null ? top0
          : sideTop != null ? Math.min(sideTop - RAIL, mat.top - 10)
          : mat.top - RAIL - 8;
  // 아래 변은 내가 앉은 자리를 지난다. 손패는 판 밖이다(손에 들고 있는 것이니까).
  let bottom = me0 != null ? me0 : (myhand ? myhand.top - 6 : mat.bottom + RAIL);

  left = Math.max(left, h.left + RAIL + 2);
  right = Math.min(right, h.right - RAIL - 2);
  top = Math.max(top, h.top + RAIL + 2);
  bottom = Math.min(bottom, h.bottom - RAIL - 2);
  if (right - left < 60 || bottom - top < 60) { table.classList.remove('on'); return; }
  table.style.left = Math.round(left - h.left) + 'px';
  table.style.top = Math.round(top - h.top) + 'px';
  table.style.width = Math.round(right - left) + 'px';
  table.style.height = Math.round(bottom - top) + 'px';
  table.classList.add('on');

  // 옆 사람이 딴 카드와 낸 카드는 경매대 바로 아래에 놓인다. 자리를 숫자로 박아
  // 두면 경매대가 조금만 움직여도(안내 문구 길이·방식 버튼) 카드가 경매대를
  // 파고든다 — 실제로 그랬다. 경매대를 재서 그 아래로 붙인다.
  const gap = 6;
  host.style.setProperty('--q-side-acq', Math.round(mat.bottom - h.top + gap) + 'px');
  host.style.setProperty('--q-side-bid', Math.round(mat.bottom - h.top + gap + 78) + 'px');
}

// 그 자리에서 바로 재면 안 된다. 판 높이는 --app-h 에 매여 있고 그 값은 다른
// 리사이즈 처리에서 뒤늦게 들어온다 — 가로에서 세로로 돌아오면 아직 가로 높이가
// 박혀 있어 자리가 다 눌린 채로 잡힌다(테이블이 82px 로 납작해졌다).
// 한 프레임 뒤와, 값이 늦게 확정되는 기기를 위해 한 박자 더 뒤에 잰다.
let _relayRaf = 0, _relayTo = 0;
function scheduleRelayout() {
  if (!_relayRaf) _relayRaf = requestAnimationFrame(() => { _relayRaf = 0; relayoutBoards(); });
  clearTimeout(_relayTo);
  _relayTo = setTimeout(relayoutBoards, 260);
}
fitBoard();
addEventListener('resize', fitBoard);
// 회전은 값이 늦게 확정된다. 한 번만 재면 돌리기 전 크기로 잡혀 판이 그대로
// 남는다 — 여러 번 나눠 다시 잰다.
addEventListener('orientationchange', () => {
  for (const t of [50, 250, 600]) setTimeout(fitBoard, t);
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitBoard);

syncAppHeight();
addEventListener('resize', syncAppHeight);
addEventListener('orientationchange', () => setTimeout(syncAppHeight, 250));   // 회전은 값이 늦게 확정된다
if (window.visualViewport) window.visualViewport.addEventListener('resize', syncAppHeight);

document.addEventListener('dragstart', e => e.preventDefault());   // 카드·이미지 드래그 차단
document.addEventListener('contextmenu', e => { if (e.target.closest('#game')) e.preventDefault(); });   // 게임 중 길게눌러 메뉴 방지
let state = null, myIndex = null, selectedBidCard = null;
let isVsBot = false, isSpec = false, prevPhase = null, difficulty = 'hard';
let myRoomId = null;

// 영구 플레이어 ID (재접속 식별용)
const PID = (() => {
  let v = localStorage.getItem('ff_pid');
  if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('ff_pid', v); }
  return v;
})();
const saveSession = (roomId) => { myRoomId = roomId; if (roomId) localStorage.setItem('ff_sess', roomId); };
const clearSession = () => { myRoomId = null; localStorage.removeItem('ff_sess'); };

// ── 서버 연결 상태 표시 ─────────────────────────────────────
function setConn(text, cls) {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.textContent = text; el.className = cls || '';
}
// 로딩 스플래시 — 로고를 잠깐만 보여주고 곧바로 사라진다(실패해도 8초 후 숨김).
// 예전엔 최소 1.8초 + 0.7초 페이드라, 이미 다 준비된 화면을 2.5초나 가리고 있었다.
// 단, 게임 나가기 등 내부 이동으로 돌아온 경우엔 즉시 스킵
const SPLASH_START = Date.now(), SPLASH_MIN = 450;
let splashHidden = false;
if (sessionStorage.getItem('ff_skipsplash')) {
  sessionStorage.removeItem('ff_skipsplash');
  splashHidden = true;
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.documentElement.classList.remove('booting');   // 건너뛴 경우엔 곧바로 보여 준다
}
// 무슨 일이 있어도 8초 뒤에는 화면이 보여야 한다 (로고가 안 걷히는 사고 대비)
setTimeout(() => document.documentElement.classList.remove('booting'), 8000);
// 내부 이동(나가기 등)·게스트·로그인 세션이면 타이틀 화면을 처음부터 숨김 (깜빡임 방지)
if (sessionStorage.getItem('ff_guest') || localStorage.getItem('ff_auth')) {
  const t = document.getElementById('title'); if (t) { t.classList.add('hide'); t.style.display = 'none'; }
}
function hideSplash() {
  if (splashHidden) return; splashHidden = true;
  const s = document.getElementById('splash'); if (!s) return;
  const wait = Math.max(0, SPLASH_MIN - (Date.now() - SPLASH_START));
  setTimeout(() => {
    // 로고가 걷히기 시작할 때 아래 것들을 다시 보이게 한다 — 같이 밝아진다
    document.documentElement.classList.remove('booting');
    s.classList.add('hide');
    setTimeout(() => { s.style.display = 'none'; }, 260);
  }, wait);   // 페이드 후 완전 제거 — 숨은 무한 스피너 정지
}
setTimeout(hideSplash, 8000);
// 그물이 없으면 붙기를 기다릴 이유가 없다. 못 붙는 걸 알면서 8초 동안 로고만
// 보여 주면 앱이 고장 난 것처럼 보인다 — 실제로 그렇게 보였다.
// 못 붙는다는 걸 아는 순간 걷고, 혼자 둘 수 있다고 말해 준다.
function offlineBoot() {
  hideSplash();
  // 정말 그물이 없을 때만 그렇게 말한다. 잠깐 실패한 것뿐이면 곧 붙으므로,
  // 괜히 "그물이 없어요" 라고 하면 거짓말이 된다.
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    setConn('📴 인터넷이 끊겼어요 — 혼자 두기는 됩니다', 'warn');
}
if (typeof navigator !== 'undefined' && navigator.onLine === false) setTimeout(offlineBoot, 250);
socket.on('connect_error', () => setTimeout(offlineBoot, 600));
// 내부 이동용 새로고침 (스플래시 없이)
function fastReload() {
  sessionStorage.setItem('ff_skipsplash', '1');
  location.href = location.origin + location.pathname;
}

socket.on('connect', () => {
  hideSplash();
  setConn('서버 연결됨', 'ok');
  setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400);
  const tk = localStorage.getItem('ff_auth');
  if (tk) socket.emit('auth', { token: tk });   // 로그인 세션 연결
  // 하던 솔로 대회가 있으면 되찾는다. 판이 끝나고 로비로 돌아오는 길이
  // 새로고침이라, 이게 없으면 대회가 화면에서만 사라져 끊긴 것처럼 보인다.
  if (localStorage.getItem('ff_stour')) socket.emit('stour_resume', { pid: PID });
  // 재접속 or 초대 링크 or 로비 목록
  const sess = localStorage.getItem('ff_sess');
  const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  // 초대 링크가 옛 세션과 다른 방이면 초대가 우선 (안 그러면 초대 링크가 무시됨)
  if (urlRoom && urlRoom !== sess) {
    localStorage.removeItem('ff_sess');
    // 초대로 온 사람은 타이틀 화면을 건너뛴다 — 링크를 눌렀는데 "게스트로 시작" 을
    // 한 번 더 눌러야 하면 초대를 받은 것 같지가 않다.
    sessionStorage.setItem('ff_guest', '1');
    hideTitle();
    socket.emit('join_room', { roomId: urlRoom, pid: PID, nick: getNick() });
  }
  else if (sess) socket.emit('rejoin', { roomId: sess, pid: PID });
  else           socket.emit('enter_lobby');
});
socket.on('auth_ok', ({ profile }) => {
  myAccount = profile; renderAccount();
  if (typeof updateSocialBadges === 'function') updateSocialBadges();   // 친구요청·가입신청 알림 표시
  refreshMissionDot();                                                  // 받아 갈 미션 보상 표시
  if (typeof gcRefreshUnread === 'function') gcRefreshUnread();          // 안 읽은 1:1 메시지 표시
  prefetchTabs();                                                       // 탭 내용 미리 받아 두기
});
socket.on('dup_login', () => {   // 다른 기기에서 같은 계정 로그인 → 이 세션 종료
  clearSession();
  alert('다른 기기(또는 창)에서 같은 계정으로 접속했어요.\n이 창의 연결을 종료합니다.');
  location.href = location.origin + location.pathname;
});
let dcLeft = 60, dcTimer = null, dcTries = 0;
function dcShow(left) {
  const ov = document.getElementById('dcOverlay'); if (!ov) return;
  dcLeft = Math.max(0, left);
  ov.classList.add('show');
  const paint = () => {
    const n = document.getElementById('dcCount'); if (n) n.textContent = dcLeft;
    const s = document.getElementById('dcSub');
    if (s) s.textContent = dcLeft > 0
      ? '이 안에 돌아오면 판을 이어서 합니다'
      : '시간이 지났어요. 로비로 나가 주세요.';
  };
  paint();
  if (dcTimer) clearInterval(dcTimer);
  dcTimer = setInterval(() => {
    dcLeft--; paint();
    if (dcLeft <= 0) { clearInterval(dcTimer); dcTimer = null; }
    else if (!socket.connected && dcLeft % 5 === 0) tryReconnect(true);   // 5초마다 조용히 재시도
  }, 1000);
}
function dcHide() {
  const ov = document.getElementById('dcOverlay'); if (ov) ov.classList.remove('show');
  if (dcTimer) { clearInterval(dcTimer); dcTimer = null; }
  dcTries = 0;
  const b = document.getElementById('dcBtn'); if (b) { b.disabled = false; b.textContent = '다시 연결'; }
}
// 손으로 누르는 재접속. 소켓이 스스로 포기했을 때 사람이 돌아올 유일한 길이다.
window.tryReconnect = function (quiet) {
  const b = document.getElementById('dcBtn');
  if (!quiet && b) { b.disabled = true; b.textContent = '연결 중…'; }
  dcTries++;
  try {
    if (!socket.connected) socket.connect();
    // 이미 붙어 있는데 방에 못 들어간 경우 — 곧장 다시 청한다
    else {
      const s = localStorage.getItem('ff_sess');
      if (s) socket.emit('rejoin', { roomId: s, pid: PID });
      // 다인전은 방·자리를 따로 적어 둔다 — 2인전과 열쇠가 다르다
      let q4 = null;
      try { q4 = JSON.parse(localStorage.getItem('ff_q4') || 'null'); } catch (_) {}
      if (q4 && q4.room) socket.emit('g4_resume', { roomId: q4.room, seat: q4.seat || 0 });
    }
  } catch (_) {}
  if (!quiet) setTimeout(() => { if (b) { b.disabled = false; b.textContent = '다시 연결'; } }, 2500);
};
window.dcGiveUp = function () {
  dcHide(); clearSession();
  location.href = location.origin + location.pathname;
};

// 판이 돌아가던 중인가 — 2인전·다인전·트웰브를 다 본다.
// 예전엔 ff_sess(2인전만 쓰는 열쇠)로 판단해서, 다인전에서 끊기면 아무것도
// 안 뜨고 화면만 멈춰 있었다. 눌러 볼 것조차 없는 게 "재접속이 안 된다" 였다.
function inLiveGame() {
  // 그물 없이 두는 판에는 돌아갈 서버가 없다. 여기서 true 를 주면 판 위에
  // "다시 잇는 중…" 덮개가 올라와, 멀쩡히 돌아가는 판을 가린다.
  if (window.OFFLINE && OFFLINE.live()) return false;
  if (localStorage.getItem('ff_sess')) return true;          // 2인전·트웰브
  try { if (JSON.parse(localStorage.getItem('ff_q4') || 'null')) return true; } catch (_) {}   // 다인전
  const c = document.body.classList;
  return c.contains('ingame') || c.contains('quad4') || c.contains('twelve');
}
socket.on('disconnect', () => {
  setConn('연결 끊김 — 재접속 중…', 'bad');
  // 판이 돌아가던 중에 끊겼으면 큰 창을 띄운다. 로비에서 끊긴 건 작은 글씨로 충분하다.
  if (inLiveGame()) dcShow(dcLeft);
});
// 앱을 다시 보면 곧바로 확인한다 — 폰은 화면을 끄면 소켓을 재우고,
// 다시 켜도 스스로 못 깨어나는 때가 있다. "자꾸 끊긴다" 의 큰 몫이 이것이다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!socket.connected && inLiveGame()) tryReconnect(true);
});
window.addEventListener('online', () => { if (!socket.connected) tryReconnect(true); });
socket.on('connect_error', (e) => {
  // 그물이 없는 것과 서버가 안 받는 것은 다르다. 둘 다 같은 칸에 쓰므로
  // 여기서 갈라 놓지 않으면 문구가 번갈아 뜬다 — 실제로 그랬다.
  const 그물없음 = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!그물없음) setConn('서버 연결 실패', 'bad');
  console.error('socket connect_error:', e && e.message);
});
socket.on('rejoin_failed', ({ why } = {}) => {
  dcHide(); clearSession();
  const msg = why === 'notmine' ? '⚠️ 그 방의 자리가 아니에요'
            : why === 'gone'    ? '⚠️ 방이 사라졌어요'
            :                     '⚠️ 이전 게임이 끝나 로비로 돌아가요';
  toast(msg, 2400);
  setTimeout(fastReload, 1500);
});
function showGrace(left) {
  document.getElementById('graceCount').textContent = Math.max(0, left ?? 60);
  document.getElementById('graceOverlay').classList.add('show');
}
function hideGrace() { document.getElementById('graceOverlay').classList.remove('show'); }
socket.on('opp_disconnected', ({ left } = {}) => showGrace(left));
socket.on('grace_tick', ({ left } = {}) => showGrace(left));
socket.on('opp_reconnected', () => { hideGrace(); setConn('상대 재접속됨', 'ok'); setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400); });

// ── 닉네임 (게스트) — 랜덤 게스트+4자리, 설정 불필요 ────────
(function initNick() {
  let n = localStorage.getItem('ff_nick');
  if (!n || !/^게스트\d{4}$/.test(n)) { n = '게스트' + Math.floor(1000 + Math.random() * 9000); localStorage.setItem('ff_nick', n); }
  const el = document.getElementById('guestNickText'); if (el) el.textContent = n;
})();
function getNick() { return myAccount ? myAccount.nick : (localStorage.getItem('ff_nick') || '게스트'); }

// ── 회원 계정 ────────────────────────────────────────────────
let myAccount = null;   // 로그인 프로필 (null=게스트)
async function apiPost(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    // 200 이 아니면 '서버가 그렇게 판단했다' 가 아니라 '지금은 못 물어봤다' 로 본다.
    // 503(준비 중)·429(너무 잦음)·5xx 를 답으로 믿으면, 멀쩡한 로그인을 지우게 된다.
    if (!r.ok) { j.httpFail = true; j.status = r.status; }
    return j;
  }
  catch (_) { return { error: '서버 연결 실패', netFail: true }; }
}
// 로그인 요청 → 타이틀 화면(구글/카카오/게스트)로 통일.
// 아이디/비번 로그인은 353fe8d 에서 제거됐고, 그때 남은 폼·핸들러는 정리했다.
function openAuth() { if (typeof showTitle === 'function') showTitle(); }
// 최초 이용자 튜토리얼 유도 (가입·소셜 첫 로그인 공통) — 1회만
function offerTutorial() {
  if (localStorage.getItem('ff_tut_offered')) return;
  localStorage.setItem('ff_tut_offered', '1');
  setTimeout(() => askConfirm(
    { icon: '🎓', title: 'FLIP FLAP에 오신 걸 환영해요!', desc: '30초면 규칙을 다 배워요. 튜토리얼을 해볼까요? (완료하면 🪙100 보상!)',
      yes: '🎓 튜토리얼 하기', no: '건너뛰기 (Skip)' },
    () => startTutorial()),
  350);
}
function logout() {
  localStorage.removeItem('ff_auth'); myAccount = null;
  socket.emit('auth', { token: null }); renderAccount();
  if (typeof showTitle === 'function') showTitle();   // 로그아웃 → 타이틀 화면으로
}
// 계정 영구 삭제 — 구글플레이 정책상 앱 내 삭제 수단 필수.
// 실수 방지를 위해 2단계 확인, 비번 계정은 비밀번호 재확인까지 거침.
function askDeleteAccount() {
  const token = localStorage.getItem('ff_auth');
  if (!token || !myAccount) { toast('로그인 상태에서만 삭제할 수 있어요.'); return; }
  askConfirm(
    { icon: '⚠️', title: '정말 계정을 삭제할까요?',
      desc: '전적·레벨·코인·아이템·칭호가 모두 영구 삭제되며 복구할 수 없어요.',
      yes: '삭제하기', no: '취소' },
    () => setTimeout(() => askConfirm(
      { icon: '🗑️', title: '마지막 확인이에요', desc: '이 작업은 되돌릴 수 없습니다. 정말 진행할까요?',
        yes: '영구 삭제', no: '돌아가기' },
      () => doDeleteAccount(token)), 250));
}
async function doDeleteAccount(token, password) {
  const r = await apiPost('/api/delete-account', { token, password });
  if (r && r.needPw) {   // 아이디/비번 계정 — 본인 확인
    const pw = prompt('본인 확인을 위해 비밀번호를 입력해주세요.');
    if (pw) doDeleteAccount(token, pw);
    return;
  }
  if (!r || !r.ok) { toast('⚠️ ' + ((r && r.error) || '삭제에 실패했어요.')); return; }
  closeMyInfo();
  localStorage.removeItem('ff_auth'); myAccount = null;
  socket.emit('auth', { token: null }); renderAccount();
  toast('계정이 삭제됐어요. 이용해주셔서 감사합니다.');
  if (typeof showTitle === 'function') showTitle();
}
// 범용 토스트 (화면 상단 중앙에 잠깐 떴다 사라짐)
let toastTimer = null;
function toast(html, ms = 2600) {
  let t = document.getElementById('ffToast');
  if (!t) { t = document.createElement('div'); t.id = 'ffToast'; document.body.appendChild(t); }
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// 로그인 되살리기.
//
// 로그인을 지우는 것은 되돌릴 수 없는 일이라, "서버가 이 토큰은 무효라고
// 분명히 말했을 때" 에만 한다. 연결 실패·준비 중(503)·너무 잦음(429)·서버 오류는
// 전부 '지금은 모른다' 이지 '무효다' 가 아니다.
//
// 렌더 무료 요금제는 놀다가 깨어나므로, 깨어나는 동안 들어온 첫 물음이
// 준비 전에 닿는 일이 잦다. 그 한 번을 답으로 믿어 로그인을 지우는 바람에
// 접속할 때마다 다시 로그인해야 했다. 이제 몇 번 더 물어본다.
async function restoreSession() {
  const tk = localStorage.getItem('ff_auth'); if (!tk) return;
  const naps = [0, 700, 1500, 3000];
  for (let i = 0; i < naps.length; i++) {
    if (naps[i]) await new Promise((go) => setTimeout(go, naps[i]));
    const r = await apiPost('/api/me', { token: tk });
    if (r.ok) {
      myAccount = r.profile; renderAccount(); claimDaily();
      // 소켓 쪽 인사가 준비 전에 닿았을 수 있다 — 계정을 다시 붙여 둔다
      if (socket.connected) socket.emit('auth', { token: tk });
      showNotices();                      // 안 읽은 운영 쪽지가 있으면 보여 준다
      refreshBonus();                     // 오늘 남은 보너스가 있으면 버튼을 띄운다
      return;
    }
    if (!(r.netFail || r.httpFail)) { localStorage.removeItem('ff_auth'); return; }   // 진짜로 무효
  }
  toast('⚠️ 서버 연결이 늦어지고 있어요 — 잠시 후 새로고침해 주세요', 3200);   // 토큰은 지키고 물러난다
}
// 운영 쪽지 — 한 사람에게든 전체 공지든 같은 통로로 온다
socket.on('admin_notice', ({ text } = {}) => {
  if (!text) return;
  askConfirm({ icon: '📢', title: '운영자 알림', desc: String(text).slice(0, 500),
               yes: '확인', no: null }, () => {});
});
// 정지됐다 — 지금 보고 있는 화면을 덮고 왜 막혔는지 알려 준다.
// 이유를 안 알려 주면 문의만 늘고, 고칠 기회도 없다.
socket.on('banned', (b) => {
  const when = b && b.until
    ? new Date(b.until).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' 까지'
    : '무기한';
  localStorage.removeItem('ff_auth');
  askConfirm({ icon: '🚫', title: '이용이 제한됐어요',
               desc: (b && b.reason ? '사유: ' + b.reason + '\n' : '') + '제한 기간: ' + when,
               yes: '확인', no: null },
             () => { try { location.reload(); } catch (_) {} });
});

// 서버가 "아직 계정을 읽는 중" 이라고 하면 잠시 뒤 다시 인사한다
socket.on('auth_retry', () => {
  setTimeout(() => {
    const tk = localStorage.getItem('ff_auth');
    if (tk && socket.connected) socket.emit('auth', { token: tk });
  }, 1200);
});
// ── 알림 ──────────────────────────────────────────────────────────────────
// 앱을 안 보고 있을 때 도전장을 알린다.
// 아이폰은 두 가지가 다 맞아야 온다 — iOS 16.4 이상 + 홈 화면에 추가한 상태.
// 사파리 탭에서는 구독 자체가 안 되므로, 그 경우엔 켜는 자리를 안 보여 준다.
const pushCan = () => !!(window.isSecureContext && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window);
// 홈 화면에 추가한 상태인가 (아이폰에서 알림이 오는 유일한 조건)
const standalone = () => !!(window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone);

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function pushState() {
  if (!pushCan() || !myAccount) return { can: false };
  if (isIOS() && !standalone()) return { can: false, needHome: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { can: true, on: !!sub, perm: Notification.permission };
  } catch (_) { return { can: false }; }
}

window.togglePush = async function () {
  const st = await pushState();
  if (!st.can) return;
  const reg = await navigator.serviceWorker.ready;
  const cur = await reg.pushManager.getSubscription();
  if (cur) {                                    // 끄기
    const endpoint = cur.endpoint;
    try { await cur.unsubscribe(); } catch (_) {}
    await apiPost('/api/push-off', { token: authToken(), endpoint });
    toast('알림을 껐어요.', 1800);
    return applySettings();
  }
  // 켜기 — 권한은 반드시 사람이 누른 자리에서 물어야 한다
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (_) {} }
  if (perm !== 'granted') { toast('⚠️ 기기 설정에서 알림을 허용해 주세요.', 2600); return applySettings(); }
  const { key } = await fetch('/api/push-key').then((r) => r.json()).catch(() => ({}));
  if (!key) { toast('⚠️ 지금은 알림을 켤 수 없어요.', 2400); return applySettings(); }
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    const r = await apiPost('/api/push-on', { token: authToken(), sub: sub.toJSON() });
    if (r && r.error) { try { await sub.unsubscribe(); } catch (_) {} toast('⚠️ ' + esc(r.error), 2400); }
    else toast('🔔 알림을 켰어요. 도전장이 오면 알려 드릴게요.', 2600);
  } catch (_) { toast('⚠️ 알림을 켜지 못했어요.', 2400); }
  applySettings();
};

// ── 보너스 ────────────────────────────────────────────────────────────────
// 지금은 광고 없이 그냥 준다(하루 3회 × 30). 광고망 승인이 나면 서버에서
// AD_MODE=ad 로 켜고, 여기 '표를 받고 → 광고를 보고 → 표를 돌려준다' 사이에
// 광고 재생만 끼우면 된다. 금액도 횟수도 서버가 정하므로 화면은 손댈 게 없다.
let _bonusBusy = false;
let _bonusState = null;      // 창을 그릴 때 다시 물어보지 않으려고 들고 있는다

async function refreshBonus() {
  const b = document.getElementById('bonusBtn');
  if (!b) return;
  const hide = () => { b.style.display = 'none'; };
  if (!myAccount) { _bonusState = null; return hide(); }
  const r = await apiPost('/api/bonus', { token: authToken() });
  // 다 받았어도 상태는 들고 있는다 — 마지막 한 번을 창 안에서 받았을 때
  // 그 창이 "오늘 0번 남음" 을 계속 보여 줘야 한다.
  _bonusState = (r && !r.error) ? r : null;
  if (!_bonusState || !_bonusState.left) return hide();
  b.style.display = '';
  b.disabled = false;
  b.title = `${r.ad ? '광고 보고' : '무료'} 🪙 +${r.coins} — 오늘 ${r.left}번 남음`;
}

// 버튼은 창을 열기만 한다. 받는 건 창 안의 '보상 받기' 다 —
// 광고를 붙이면 그 사이에 광고가 들어갈 자리다.
window.doBonus = function () {
  const m = document.getElementById('bonusModal');
  if (!m) return;
  m.classList.add('show');
  drawBonus();
};
window.closeBonus = function () {
  const m = document.getElementById('bonusModal');
  if (m) m.classList.remove('show');
};

function drawBonus(msg) {
  const body = document.getElementById('bnBody');
  const btn = document.getElementById('bnClaim');
  const note = document.getElementById('bnMsg');
  if (!body || !btn || !note) return;
  const s = _bonusState;
  if (!s) {
    body.innerHTML = '<div class="bn-how">로그인하면 받을 수 있어요.</div>';
    btn.style.display = 'none'; note.innerHTML = msg || ''; return;
  }
  body.innerHTML =
    `<div class="bn-amt">${ico('🪙')} +${s.coins}</div>` +
    `<div class="bn-how">${s.ad
      ? `광고를 <b>${s.minSec}초</b> 이상 보면 코인을 받아요.`
      : '오늘 그냥 드리는 보너스예요.'}</div>` +
    `<div class="bn-cnt">오늘 <b>${s.left}</b>번 남음 · 하루 ${s.perDay}번</div>`;
  btn.style.display = s.left ? '' : 'none';
  btn.disabled = !s.left || _bonusBusy;
  btn.textContent = _bonusBusy
    ? (s.ad ? '광고 보는 중…' : '받는 중…')
    : (s.ad ? '광고 보고 받기' : '보상 받기');
  note.innerHTML = msg || '';
}

window.claimBonus = async function () {
  if (_bonusBusy) return;
  _bonusBusy = true; drawBonus();
  let said = '';
  try {
    const st = await apiPost('/api/bonus-start', { token: authToken() });
    if (st.error) { said = `<span class="bn-err">${esc(st.error)}</span>`; return; }
    // 광고 모드면 여기서 광고를 보여 주고, 끝난 뒤에 표를 돌려준다.
    // 지금은 광고가 없으므로 바로 돌려준다 (서버의 최소 시간도 0 이다).
    if (st.minSec) await new Promise((go) => setTimeout(go, st.minSec * 1000 + 300));
    const got = await apiPost('/api/bonus-claim', { token: authToken(), ticket: st.ticket });
    if (got.error) { said = `<span class="bn-err">${esc(got.error)}</span>`; return; }
    myAccount = got.profile; renderAccount();
    playSound('setwin');
    said = `${ico('🪙')} <b>${got.amount}</b> 받았어요!`;
  } finally {
    _bonusBusy = false;
    await refreshBonus();
    drawBonus(said);
  }
};

// 안 읽은 운영 쪽지. 여럿이면 하나씩 차례로 보여 준다.
async function showNotices() {
  const r = await apiPost('/api/notices', { token: authToken() });
  const list = (r && r.list) || [];
  if (!list.length) return;
  let i = 0;
  const next = () => {
    if (i >= list.length) { apiPost('/api/notices-read', { token: authToken() }); return; }
    const m = list[i++];
    askConfirm({ icon: '📢', title: '운영자 알림', desc: String(m.text).slice(0, 500),
                 yes: '확인', no: null }, next);
  };
  setTimeout(next, 900);                  // 로비가 자리를 잡은 뒤에
}

// 1일 접속 보상 수령 (연속 출석 스택 표시)
async function claimDaily() {
  const d = await apiPost('/api/daily', { token: localStorage.getItem('ff_auth') });
  if (d && d.claimed) {
    myAccount = d.profile; renderAccount();
    const streakTxt = d.streak >= 2 ? ` <span style="color:#ff9a3c">🔥 ${d.streak}일 연속!</span>` : '';
    toast(`🎁 출석 보상 <b style="color:#ffd94a">🪙 +${d.amount}</b>${streakTxt}${d.plateBonus ? ' <span style="color:#4ade80">(🍀 명패 포함)</span>' : ''}`, 3200);
    (d.titles || []).forEach((t, i) => setTimeout(() => toast(`${t.icon} 칭호 획득! <b>${t.name}</b>`, 3000), 3400 + i * 3100));
  }
  claimReferral();   // 저장된 초대 코드가 있으면 자동 등록
}
// 친구 초대 보상 — ?ref= 링크로 들어와 가입하면 양쪽 +100
async function claimReferral() {
  const ref = localStorage.getItem('ff_ref');
  if (!ref || !myAccount || myAccount.guest) return;
  const r = await apiPost('/api/refer', { token: localStorage.getItem('ff_auth'), ref });
  localStorage.removeItem('ff_ref');   // 성공/실패 무관 1회 시도
  if (r && r.ok) {
    myAccount = r.profile; renderAccount();
    toast(`🤝 친구 초대 보상 <b style="color:#ffd94a">🪙 +${r.amount}</b>! 초대한 친구도 받았어요`, 3500);
  }
}
// 초대 링크(?ref=아이디)로 접속 시 코드 보관
try { const rp = new URLSearchParams(location.search).get('ref'); if (rp) localStorage.setItem('ff_ref', rp); } catch (_) {}
// 닉네임 염색 — 단색은 글자 색만 갈면 되니 이름 칸에 바로 건다.
// 무지개만 다르다. 글자에 그라디언트를 오려 붙이려면 background 를 써야 하는데
// 명패(.np-*)도 같은 칸을 쓴다. 한 요소에 둘을 얹으면 뒤에 오는 쪽이 이겨서
// 이름이 통째로 사라진다 — 그래서 무지개는 글자만 안쪽 <i> 로 감싼다.
// nc-on — "물감이 얹혔다" 는 표시. 밝은 명패에서 글자에 테를 두를 때 쓴다.
const ncClass = c => (c && c !== 'rainbow') ? ' nc-on nc-' + c : '';
// 염색된 이름 한 조각. 이름을 찍는 곳은 전부 이걸 거쳐야 물감이 빠짐없이 따라간다.
const nickHTML = (nick, color) => color === 'rainbow'
  ? `<i class="nc-rainbow">${esc(nick)}</i>`
  : esc(nick);
const NP_CLASS = { np_wood: 'np-wood', np_neon: 'np-neon', np_gold: 'np-gold', np_daily: 'np-daily', np_lv50: 'np-lv50', np_ruby: 'np-ruby', np_crystal: 'np-crystal', np_obsidian: 'np-obsidian', np_hanji: 'np-hanji', np_shard: 'np-shard', np_hwatu: 'np-hwatu', np_dawn: 'np-dawn', np_dragon: 'np-dragon' , np_tide: 'np-tide', np_frost: 'np-frost', np_najeon: 'np-najeon',
  np_storm: 'np-storm', np_pixel: 'np-pixel', np_firework: 'np-firework' };
const xpPct = p => Math.max(0, Math.min(100, Math.round((p.xpInLevel || 0) / (p.xpNeeded || 100) * 100)));
const npClass = p => p && NP_CLASS[p] ? ' ' + NP_CLASS[p] : '';   // 명패 클래스
// 이모지 → 직접 그린 SVG (art.js). 매핑에 없으면 원래 이모지 그대로.
const ico = (e, cls = 'g-ico') => {
  const a = (typeof iconArt === 'function') && iconArt(e);
  return a ? `<span class="${cls}">${a}</span>` : (e || '');
};
// 랭크 아이콘 — 직접 그린 SVG 우선, 매핑에 없으면 원래 이모지
const rankIco = e => {
  const a = (typeof rankArt === 'function') && rankArt(e);
  return a ? `<span class="rank-art">${a}</span>` : (e || '');
};
const titleTag = t => t ? `<span class="title-tag" style="color:${t.color}">${ico(t.icon, 'ti-ico')} ${esc(t.name)}</span>` : '';
// 프로필 그림 — 아바타를 끼웠으면 그걸, 아니면 지금까지처럼 랭크 아이콘.
// 아바타는 남의 프로필(랭킹·게임 화면)에서도 보이므로 프로필 객체로 받는다.
function faceOf(p) {
  if (!p) return '';
  const a = (typeof avatarArt === 'function') && avatarArt(p.avatar);
  if (a) return `<span class="ava-art">${a}</span>`;
  return rankIco(p.rankIcon);
}
// 시상대 전용 얼굴. 여기서는 급수 아이콘으로 되돌리지 않는다 —
// 급수는 바로 밑 줄에, 등수 메달은 그 밑에 이미 있어서, 아바타 자리까지
// 급수 아이콘이 들어가면 메달이 둘로 보인다(동메달 급수가 특히 그랬다).
function podFace(p) {
  if (!p) return '';
  const a = (typeof avatarArt === 'function') && avatarArt(p.avatar);
  if (a) return `<span class="ava-art">${a}</span>`;
  return `<span class="pod-letter">${esc((p.nick || '?').slice(0, 1).toUpperCase())}</span>`;
}


// ── 꾸미기 효과 발동 ────────────────────────────────────────────────────────
// 낙찰 도장 · 카드 놓을 때 파티클 · 이길 때 화면 연출.
// 전부 "장착한 사람" 기준이라 프로필에서 읽는다. 안 끼웠으면 기본값으로 돈다.

// 카드를 놓을 때 작은 파티클. 카드 요소 안에 잠깐 얹었다가 지운다.
function playPlaceFx(cardEl) {
  if (!cardEl) return;
  const id = (myAccount && myAccount.placeFx) || 'place_dust';
  const cls = PLACE_CLS[id]; if (!cls) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'place-fx ' + cls;
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('i');
    const ang = (Math.PI * 2 * i) / 7 + Math.random() * 0.5;
    const dist = 16 + Math.random() * 14;
    b.style.setProperty('--px', Math.round(Math.cos(ang) * dist) + 'px');
    b.style.setProperty('--py', Math.round(Math.sin(ang) * dist) + 'px');
    b.style.animationDelay = Math.round(Math.random() * 60) + 'ms';
    box.appendChild(b);
  }
  const pos = getComputedStyle(cardEl).position;
  if (pos === 'static') cardEl.style.position = 'relative';
  cardEl.appendChild(box);
  setTimeout(() => box.remove(), 700);
}

// 이길 때 화면 연출. 진 사람 화면에서는 돌지 않는다.
function playVictoryFx() {
  const host = document.getElementById('victoryFx'); if (!host) return;
  const id = (myAccount && myAccount.victoryFx) || null;
  const cls = id && VFX_CLS[id]; if (!cls) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  host.className = cls; host.innerHTML = '';
  if (cls === 'vx-thunder') {
    host.appendChild(document.createElement('b'));
  } else if (cls === 'vx-shard') {
    // 화면 한가운데가 깨져 조각이 사방으로 날아간다.
    // 조각마다 크기·회전·거리를 달리해야 유리처럼 보인다 — 똑같으면 색종이가 된다.
    for (let i = 0; i < 26; i++) {
      const b = document.createElement('i');
      const ang = (Math.PI * 2 * i) / 26 + (Math.random() - .5) * .3;
      const d = 90 + Math.random() * 130;
      const sz = 7 + Math.random() * 13;
      b.style.left = '50%'; b.style.top = '46%';
      b.style.width = sz + 'px'; b.style.height = (sz * (.5 + Math.random())) + 'px';
      b.style.setProperty('--fx', Math.round(Math.cos(ang) * d) + 'px');
      b.style.setProperty('--fy', Math.round(Math.sin(ang) * d) + 'px');
      b.style.setProperty('--spin', Math.round((Math.random() - .5) * 900) + 'deg');
      b.style.animationDelay = Math.round(Math.random() * 220) + 'ms';
      host.appendChild(b);
    }
  } else if (cls === 'vx-aurora') {
    // 오로라 — 파티클이 아니라 커튼이다. 폭이 다른 띠 넷을 겹쳐 느리게 흔든다.
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('i');
      b.style.left = (6 + i * 24 + Math.random() * 8) + '%';
      b.style.width = (90 + Math.random() * 80) + 'px';
      b.style.animationDelay = (i * 220) + 'ms';
      b.style.animationDuration = (2.4 + Math.random() * 0.9) + 's';
      host.appendChild(b);
    }
  } else if (cls === 'vx-firework') {
    // 세 군데에서 터진다
    for (let burst = 0; burst < 3; burst++) {
      const cx = 25 + Math.random() * 50, cy = 25 + Math.random() * 35;
      for (let i = 0; i < 18; i++) {
        const b = document.createElement('i');
        const ang = (Math.PI * 2 * i) / 18;
        const d = 70 + Math.random() * 60;
        b.style.left = cx + '%'; b.style.top = cy + '%';
        b.style.background = ['#ffd94a', '#ff7a6a', '#9fe8ff', '#c88bff', '#7cc45a'][i % 5];
        b.style.setProperty('--fx', Math.round(Math.cos(ang) * d) + 'px');
        b.style.setProperty('--fy', Math.round(Math.sin(ang) * d) + 'px');
        b.style.animationDelay = (burst * 260) + 'ms';
        host.appendChild(b);
      }
    }
  } else {
    const colors = ['#e8544a', '#ffd94a', '#5fbdd8', '#7cc45a', '#c88bff', '#ff8ac0'];
    for (let i = 0; i < 60; i++) {
      const b = document.createElement('i');
      b.style.left = Math.round(Math.random() * 100) + '%';
      b.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      b.style.animationDelay = Math.round(Math.random() * 700) + 'ms';
      b.style.setProperty('--spin', Math.round(360 + Math.random() * 720) + 'deg');
      if (cls === 'vx-confetti') b.style.background = colors[i % colors.length];
      host.appendChild(b);
    }
  }
  host.classList.add('show');
  clearTimeout(playVictoryFx._t);
  playVictoryFx._t = setTimeout(() => { host.classList.remove('show'); host.innerHTML = ''; }, 3200);
}

// 하단 고정 프로필 바 (클릭 → 내 정보)
function renderAccount() {
  const body = document.getElementById('pbBody');
  const fill = document.getElementById('pbXpFill');
  if (!body) return;
  // 계정이 바뀔 때마다 스킨도 맞춰 둔다. 판을 시작할 때만 걸어 두면
  // 로비·설명서에 보이는 카드가 기본 무늬로 남아 서로 달라 보인다.
  try { applyMySkins(); } catch (_) {}
  if (myAccount) {
    const p = myAccount;
    const total = p.wins + p.losses;
    body.innerHTML = `
      <div class="pb-avawrap">
        <div class="pb-ava" style="color:${p.rankColor}">${faceOf(p)}</div>
        <span class="pb-lv">Lv.${p.level}</span>
      </div>
      <div class="pb-mid">
        <div class="pb-nickrow"><span class="pb-nick${ncClass(p.nickColor)}${npClass(p.plate)}" onclick="event.stopPropagation();openPlate()" title="명패 고르기">${nickHTML(p.nick, p.nickColor)}</span>${titleTag(p.titleInfo)}</div>
        <div class="pb-stats">${p.wins}승 ${p.losses}패${total ? ` (${p.winRate}%)` : ''} · <span style="color:${p.rankColor}">${esc(p.rank)}</span></div>
      </div>
      <div class="pb-right">
        <span class="pb-badge pb-coin">🪙 ${p.coins || 0}</span>
        <span class="pb-badge pb-rp">${ico('🏆')} ${p.rp} RP</span>
      </div>`;
    if (fill) fill.style.width = xpPct(p) + '%';
  } else {
    body.innerHTML = `
      <div class="pb-ava">👤</div>
      <div class="pb-mid">
        <div class="pb-nick">${esc(getNick())}</div>
        <div class="pb-stats">게스트 · 기록이 저장되지 않아요</div>
      </div>
      <button class="pb-login" onclick="event.stopPropagation();openAuth('login')">로그인</button>`;
    if (fill) fill.style.width = '0%';
  }
  // 가진 이모트도 여기서 같이 맞춘다. 예전엔 부르는 자리를 따로 뒀는데
  // 로그인 경로가 빠져 있어, 산 이모트가 새로고침 한 번에 사라졌다.
  // 프로필이 바뀌면 반드시 여기를 지나므로 빠뜨릴 자리가 없다.
  try { refreshEmotes(); } catch (_) {}
}

// ── 내 정보 (프로필 · 인벤토리 · 전적) ──
async function openMyInfo() {
  if (!myAccount) { openAuth('login'); return; }
  const p = myAccount;
  const canNick = !p.nickLocked || ((p.items || {}).nick_change || 0) > 0;
  document.getElementById('miHeader').innerHTML = `
    <div class="mi-head">
      <div class="mi-ava" style="color:${p.rankColor}">${faceOf(p)}</div>
      <div class="mi-info">
        <div class="mi-nick${ncClass(p.nickColor)}">${nickHTML(p.nick, p.nickColor)} ${canNick ? '<button class="pc-icon" onclick="closeMyInfo();openNickModal()" title="닉네임 바꾸기">✏️</button>' : ''}</div>
        <div class="mi-line">Lv.<b>${p.level}</b> (XP ${p.xpInLevel}/${p.xpNeeded}) · <span style="color:${p.rankColor}">${esc(p.rank)}</span> <b>${p.rp} RP</b></div>
        <div class="mi-line"><b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%</div>
        <div class="mi-badges">
          <span class="pb-coin pb-badge">🪙 ${p.coins || 0}</span>
          ${p.streak >= 2 ? `<span style="background:rgba(255,120,60,.16);color:#ffab5e">🔥 ${p.streak}연승 중</span>` : ''}
        </div>
      </div>
    </div>`;
  renderMyInv();
  renderMyTitles();
  renderMiHist();
  miTab('inv');                       // 다시 열면 늘 인벤토리부터
  document.getElementById('myInfoModal').classList.add('show');
}
// ── 명패 고르기 ────────────────────────────────────────────────────────────
// 프로필 바의 이름을 누르면 열린다. 효과 문구는 서버가 실제 표에서 만들어
// 내려준다 — 화면에 따로 적어 두면 값을 손댈 때 어긋난다.
async function openPlate() {
  if (!myAccount) { openAuth('login'); return; }
  if (!shopItems) { try { shopItems = (await fetch('/api/shop').then((r) => r.json())).items; } catch (_) {} }
  renderPlateList();
  document.getElementById('plateModal').classList.add('show');
}
function closePlate() { document.getElementById('plateModal').classList.remove('show'); }
function renderPlateList() {
  const box = document.getElementById('plateList'); if (!box) return;
  const mine = (myAccount && myAccount.items) || {};
  const plates = (shopItems || []).filter((x) => x.type === 'plate');
  // 가진 것 먼저, 그 안에서는 효과 있는 것 먼저
  plates.sort((a, b) => (!!mine[b.id] - !!mine[a.id]) || (!!b.fxText - !!a.fxText));
  let html = `<button class="pl-row${myAccount.plate ? '' : ' on'}" onclick="pickPlate(null)">
      <span class="pl-mid"><span class="pl-nm">명패 없음</span>
      <span class="pl-fx none">이름만 보여요</span></span>
      ${myAccount.plate ? '' : '<span class="pl-state">사용 중</span>'}</button>`;
  for (const it of plates) {
    const own = !!mine[it.id], on = myAccount.plate === it.id;
    const cls = 'pl-row' + (on ? ' on' : '') + (own ? '' : ' locked');
    const click = own ? ` onclick="pickPlate('${it.id}')"` : '';
    html += `<button class="${cls}"${click}>
      <span class="${npClass(it.id).trim()}">${esc(myAccount.nick || '닉네임')}</span>
      <span class="pl-mid"><span class="pl-nm">${esc(it.name)}</span>
      <span class="pl-fx${it.fxText ? '' : ' none'}">${it.fxText ? esc(it.fxText) : '효과 없음 · 장식'}</span></span>
      <span class="pl-state">${on ? '사용 중' : own ? '' : '\uD83D\uDD12'}</span></button>`;
  }
  box.innerHTML = html;
  paintIcons(box);
}
async function pickPlate(id) {
  const r = await apiPost('/api/equip', { token: authToken(), itemId: id, kind: 'plate' });
  if (!r || r.error) { toast(esc((r && r.error) || '바꾸지 못했어요')); return; }
  myAccount = r.profile || myAccount;
  renderAccount(); renderPlateList();
  playSound('select');
}

function closeMyInfo() { document.getElementById('myInfoModal').classList.remove('show'); }
// 인벤토리 / 칭호 / 전적 — 한 번에 하나만 본다.
// 셋을 세로로 이어 붙였더니 스크롤이 길어 무엇이 있는지 안 읽혔다.
function miTab(which) {
  for (const [k, pane] of [['inv', 'miPaneInv'], ['title', 'miPaneTitle'], ['hist', 'miPaneHist']]) {
    const on = k === which;
    document.getElementById(pane).style.display = on ? '' : 'none';
    const b = document.querySelector(`.mi-tab[data-mi="${k}"]`);
    if (b) b.classList.toggle('active', on);
  }
}
async function renderMyInv() {
  const inv = document.getElementById('miInv');
  if (!shopItems) { try { shopItems = (await fetch('/api/shop').then(r => r.json())).items; } catch (_) {} }
  const items = myAccount.items || {};
  const owned = (shopItems || []).filter(it => items[it.id]);

  const tile = (it) => {
    const slot = EQUIP_SLOT[it.type];          // 장착 가능 아이템(카드백/명패/테이블/카드앞면)
    const on = slot && myAccount[slot] === it.id;
    const cnt = it.type === 'ticket' ? `<span class="cnt">x${items[it.id]}</span>` : '';
    return `<div class="mi-item${on ? ' equipped' : ''}" ${slot ? `onclick="invEquip('${it.id}', ${on}, '${it.type}')"` : ''} title="${it.name}">
      ${cnt}<span class="ico">${ico(it.icon, 'inv-ico')}</span><span class="nm">${it.name.replace(' 카드백','')}</span></div>`;
  };
  const head = (name, n) => `<div class="mi-cat">${name}<span class="n">${n}</span></div>`;

  // 상점과 같은 묶음·같은 순서로 놓는다(SHOP_GROUPS). 가진 게 늘수록 카드백과
  // 명패가 뒤섞여 뭘 갖고 있는지 안 읽혔다. 상점에서 본 자리 그대로여야 찾는다.
  let html = '';
  const shown = new Set();
  for (const g of SHOP_GROUPS) {
    const mine = owned.filter((x) => g.types.includes(x.type));
    // 염색은 아이템이 아니라 닉 색으로 남는다 — 상점에서 염색약이 있는 묶음에 붙인다.
    const dye = (myAccount.nickColor && g.types.includes('dye'))
      ? `<div class="mi-item"><span class="ico">🎨</span><span class="nm ${'nc-' + myAccount.nickColor}">${(DYE_NAMES[myAccount.nickColor] || myAccount.nickColor)} 염색</span></div>` : '';
    if (!mine.length && !dye) continue;
    html += head(g.name, mine.length + (dye ? 1 : 0)) + dye + mine.map(tile).join('');
    for (const x of mine) shown.add(x.id);
  }
  // 새 종류를 넣고 SHOP_GROUPS 에 분류를 깜빡하면 여기로 떨어진다 — 사라지지 않게.
  const rest = owned.filter((x) => !shown.has(x.id));
  if (rest.length) html += head('그 밖에', rest.length) + rest.map(tile).join('');

  inv.innerHTML = html || `<div class="mi-empty">아직 아이템이 없어요 — 상점 구경 가기 ${ico('🛒')}</div>`;
}
async function invEquip(itemId, isOn, kind) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId, kind });
  if (!r.error) { myAccount = r.profile; renderMyInv(); renderAccount(); applyMySkins(); }
}
function renderMiHist() {
  const list = document.getElementById('miHist');
  const h = (myAccount && myAccount.history) || [];
  list.innerHTML = h.length ? '' : '<div class="mi-empty">아직 전적이 없어요</div>';
  h.forEach(m => {
    const res = m.result === 'win' ? { t: '승', c: 'hist-win' } : m.result === 'loss' ? { t: '패', c: 'hist-loss' } : { t: '무', c: 'hist-draw' };
    const row = document.createElement('div'); row.className = 'hist-row';
    // RP 는 랭크게임에서만 붙는다. 없는 판(빠른 입장·AI전 등)은 자리를 비운다 —
    // 0 으로 적으면 "안 움직였다" 로 읽혀 랭크가 걸린 판처럼 보인다.
    const rp = (typeof m.rp === 'number')
      ? `<span class="hist-rp" style="color:${m.rp >= 0 ? '#8fe0a0' : '#ff9aa8'}">${m.rp > 0 ? '+' : ''}${m.rp} RP</span>`
      : '<span class="hist-rp none">—</span>';
    row.innerHTML = `<span class="hist-res ${res.c}">${res.t}</span>
      <span class="hist-vs">vs ${esc(m.vs)}</span>
      ${rp}
      <span class="hist-coin" style="color:${m.coins >= 0 ? '#ffd94a' : '#ff8a8a'}">🪙 ${m.coins > 0 ? '+' : ''}${m.coins}</span>`;
    list.appendChild(row);
  });
}
// 로그인 프로필이 게임 종료 등으로 갱신됨 + 보상 연출
let pendingRewards = null;
socket.on('profile', ({ profile, result, rewards }) => {
  myAccount = profile; renderAccount(); refreshEmotes();
  pendingRewards = rewards || null;   // 결과창이 뜬 뒤 showRewards()에서 연출
  refreshMissionDot();                // 판이 끝나며 미션이 찼을 수 있다
});
// 숫자 카운트업
function countUp(el, to, prefix = '', ms = 800) {
  const start = performance.now(), sign = to < 0 ? '-' : '+', abs = Math.abs(to);
  (function step(t) {
    const p = Math.min((t - start) / ms, 1);
    el.textContent = prefix + sign + Math.round(abs * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}
function showRewards() {
  const el = document.getElementById('goRewards');
  const r = pendingRewards;
  // 보상이 0이어도 차단 사유·진행도 바는 보여줌 (로그인 유저)
  const worth = r && ((r.coins || r.xp || r.rp) || r.blocked || (myAccount && !myAccount.guest));
  if (!el || !worth) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="rw-tiles">
      <div class="rw-tile t-coin"><span class="rw-ic">🪙</span><b id="rwCoin">0</b><small>코인</small></div>
      <div class="rw-tile t-xp"><span class="rw-ic">✨</span><b>+${r.xp}</b><small>경험치</small></div>
      ${r.rp ? `<div class="rw-tile t-rp"><span class="rw-ic">${r.rp > 0 ? ico('🏆') : ico('⚠')}</span><b>${r.rp > 0 ? '+' : ''}${r.rp}</b><small>랭크점수</small></div>` : ''}
    </div>
    <div id="rwBadges" class="rw-badges"></div>`;
  countUp(document.getElementById('rwCoin'), r.coins, '');
  const badges = document.getElementById('rwBadges');
  // html=true 면 직접 그린 아이콘(SVG)을 넣을 수 있게 innerHTML 로 채운다.
  // 텍스트는 항상 esc 로 넣으므로 사용자 입력이 섞일 여지는 없다.
  const add = (cls, txt, delay, html) => {
    const b = document.createElement('div');
    b.className = 'rw-badge ' + cls;
    if (html) b.innerHTML = txt; else b.textContent = txt;
    b.style.animationDelay = delay + 'ms';
    badges.appendChild(b);
  };
  let d = 400;
  if (r.firstWin) { add('bd-first', `${ico('🎯')} 하루 첫 승 보너스 +${r.firstWin}`, d, true); d += 250; }
  if (r.streak && r.streakCount >= 2) { add('bd-streak', `${ico('🔥')} ${r.streakCount}연승! +${r.streak}`, d, true); d += 250; playSound('setwin'); }
  if (r.plateCoin) { add('bd-clan', `${ico('🏅')} 명패 효과 +${r.plateCoin}`, d, true); d += 250; }
  if (r.plateXp) { add('bd-first', `${ico('⬆️')} 명패 효과 경험치 +${r.plateXp}`, d, true); d += 250; }
  if (r.setName) { add('bd-rank', `${ico('💠')} ${esc(r.setName)} 세트 완성 보너스`, d, true); d += 250; }
  if (r.clanBonus) { add('bd-clan', `${ico('🛡️')} 클랜 보너스 +${r.clanBonus}`, d, true); d += 250; }
  if (r.levelUp) { add('bd-level', `${ico('⬆️')} 레벨 업! Lv.${r.levelUp}${r.levelCoins ? ` (+${r.levelCoins})` : ''}`, d, true); d += 250; playSound('setwin'); }
  if (r.rankUp) { add('bd-rank', `${rankIco('👑')} 승급! ${esc(String(r.rankUp))}`, d, true); d += 250; playSound('setwin'); }
  // 승단전 — RP 가 아니라 5판 3승으로 오른다. 상태를 안 알려주면 "왜 RP 가 안 오르지" 가 된다.
  if (r.promo) {
    if (r.promo.started) { add('bd-rank', `${ico('🚩')} 승단전 시작! 5판 중 3승하면 승단`, d, true); d += 300; playSound('setwin'); }
    else if (r.promo.done && r.promo.passed) { add('bd-rank', `${ico('🎉')} 승단 성공!`, d, true); d += 300; playSound('setwin'); }
    else if (r.promo.done) { add('bd-warn', `${ico('⚠')} 승단 실패 — RP ${r.promo.penalty}`, d, true); d += 300; }
    else if (r.promo.wins !== undefined) { add('bd-first', `${ico('🚩')} 승단전 ${r.promo.wins}승 ${r.promo.losses}패 (${r.promo.need}승 필요)`, d, true); d += 250; }
  }
  // 코인은 이제 미션 창에서 직접 받는다 — "+30" 만 띄우면 이미 받은 줄 안다.
  (r.missions || []).forEach(m => { add('bd-first', `${ico('🎯')} 미션 완료: ${esc(m.name)} — 미션에서 ${ico('🪙')} ${m.reward} 수령`, d, true); d += 250; });
  (r.milestones || []).forEach(m => { add('bd-rank', `${m.icon} ${m.label}`, d); d += 250; playSound('setwin'); });
  (r.titles || []).forEach(t => { add('bd-rank', `${ico(t.icon)} 칭호 획득! ${esc(t.name)}`, d, true); d += 250; playSound('setwin'); });
  // 싸이클링 — 오늘 안에 2·3·4·6 세트로 각각 우승하면 완성 (일일퀘스트)
  if (r.cycle && r.cycle.done) {
    add('bd-rank', `${ico('🏁')} <b>오늘의 싸이클링 완성!</b> 2·3·4·6 제패 — 미션에서 ${ico('🪙')} ${r.cycle.amount} 수령`, d, true);
    d += 300; playSound('setwin');
  } else if (r.cycle && r.cycle.fresh) {
    const left = (r.cycle.progress || []).filter((x) => !x.done).map((x) => x.kind);
    add('bd-first', `${ico('🏁')} 싸이클링 ${r.cycle.kind} 세트 (${r.cycle.got}/4` +
        (left.length ? ` · 남은 건 ${left.join('·')}` : '') + ')', d, true);
    d += 250;
  }
  if (r.blocked) {
    const msg = r.reason === 'short' ? '너무 짧은 판 — 보상 없음'
              : r.reason === 'sameip' ? '같은 접속에서의 대전 — 보상 없음'
              : r.reason === 'friendly' ? '같은 접속·친선 대전 — 보상 없음'
              : r.reason === 'repeat' ? '같은 상대 반복 대전 — 보상 없음'
              : '보상 지급 제외';
    add('bd-warn', `${ico('⚠')} ${esc(msg)}`, d, true); d += 250;
  } else if (r.noRpFriendly) {
    // 코인·경험치는 나갔는데 RP 만 안 오른 이유를 알려준다
    add('bd-warn', `${ico('⚠')} 친선 대전 — 코인·경험치만, RP는 랭킹전에서`, d, true); d += 250;
  }
  // 진행도 노출 — 이전→이후 게이지 상승 모션 (scaleX = GPU 합성 전용, 리플로우 없음)
  if (myAccount && !myAccount.guest) {
    // 등급 구간은 서버가 rankInfo 로 내려준다. 예전엔 여기 표를 따로 적어 뒀는데,
    // 서버 등급표를 손대면 화면만 옛 구간을 그리는 사고가 난다.
    const need = myAccount.xpNeeded || 100;
    const xpAfter = Math.min(1, (myAccount.xpInLevel || 0) / need);
    const xpBefore = r.levelUp ? 0 : Math.max(0, ((myAccount.xpInLevel || 0) - (r.xp || 0)) / need);
    let html = `<div class="rw-prog">
      <div class="rwp-row"><span class="rwp-lbl">Lv.${myAccount.level}</span>
        <div class="rwp-bar"><div class="rwp-fill" id="rwpXp"></div></div>
        <span class="rwp-val">XP ${myAccount.xpInLevel}/${myAccount.xpNeeded}${r.xp ? ` <b style="color:#7dd87d">+${r.xp}</b>` : ''}</span></div>`;
    const rp = myAccount.rp || 0, rpBeforeTotal = rp - (r.rp || 0);
    const info = r.rankInfo || myAccount.rankInfo || null;
    const rpTag = r.rp ? ` <b style="color:${r.rp > 0 ? '#7dd87d' : '#ff8a8a'}">${r.rp > 0 ? '+' : ''}${r.rp}</b>` : '';
    const lbl = `<span class="rwp-lbl" style="color:${myAccount.rankColor}">${rankIco(myAccount.rankIcon)} ${esc(myAccount.rank)}</span>`;
    let rpAfter = 1, rpBefore = 1, drawBar = false;
    if (info && info.promo) {
      // 승단전 중 — RP 가 아니라 승단전 전적을 보여준다
      const w = info.promo.wins, l = info.promo.losses;
      rpAfter = Math.min(1, w / info.promo.need); rpBefore = rpAfter; drawBar = true;
      html += `<div class="rwp-row">${lbl}
        <div class="rwp-bar"><div class="rwp-fill rk" id="rwpRp"></div></div>
        <span class="rwp-val">승단전 ${w}승 ${l}패 (${info.promo.need}승 필요)</span></div>`;
    } else if (info && info.promoReady) {
      html += `<div class="rwp-row">${lbl}
        <div class="rwp-bar"><div class="rwp-fill rk" id="rwpRp"></div></div>
        <span class="rwp-val">승단전 준비 완료 — 다음 랭킹전${rpTag}</span></div>`;
      rpAfter = 1; rpBefore = 1; drawBar = true;
    } else if (info && info.tier === 'ace') {
      html += `<div class="rwp-row">${lbl}
        <div class="rwp-bar"><div class="rwp-fill rk" id="rwpRp"></div></div>
        <span class="rwp-val">ACE #${info.standing || '-'} / ${info.capacity}${rpTag}</span></div>`;
      rpAfter = 1; rpBefore = 1; drawBar = true;
    } else if (info && typeof info.need === 'number' && info.to > info.from) {
      const span = info.to - info.from;
      rpAfter = Math.max(0, Math.min(1, (rp - info.from) / span));
      rpBefore = r.rankUp ? 0 : Math.max(0, Math.min(1, (rpBeforeTotal - info.from) / span));
      drawBar = true;
      html += `<div class="rwp-row">${lbl}
        <div class="rwp-bar"><div class="rwp-fill rk" id="rwpRp"></div></div>
        <span class="rwp-val">${info.need} RP → ${esc(info.nextName || '')}${rpTag}</span></div>`;
    }
    const next = drawBar;
    // 재접속 유도 — 내일 출석 보상 예고 (연속 유지 시 금액)
    const nextDaily = 30 + Math.min((myAccount.loginStreak || 0) * 10, 70) + (myAccount.plate === 'np_daily' ? 50 : 0);
    html += `<div style="margin-top:8px;font-size:.72rem;color:#c8a86a">📅 내일 접속하면 출석 보상 <b style="color:#ffd94a">🪙 ${nextDaily}</b>${(myAccount.loginStreak || 0) >= 1 ? ` (🔥 ${(myAccount.loginStreak || 0) + 1}일 연속)` : ''}</div>`;
    html += '</div>';
    el.insertAdjacentHTML('beforeend', html);
    // 게이지 모션: 이전 값에서 시작 → 획득분만큼 차오름. 레벨업/승급은 꽉 채우고 반짝 → 새 게이지
    const gauge = (id, from, to, promoted) => {
      const f = document.getElementById(id); if (!f) return;
      f.style.transform = `scaleX(${from})`;
      setTimeout(() => {
        if (promoted) {
          f.style.transform = 'scaleX(1)'; f.classList.add('burst');
          setTimeout(() => {
            f.style.transition = 'none'; f.style.transform = 'scaleX(0)'; void f.offsetWidth;
            f.style.transition = ''; f.style.transform = `scaleX(${to})`;
            setTimeout(() => f.classList.remove('burst'), 700);
          }, 620);
        } else f.style.transform = `scaleX(${to})`;
      }, 420);
    };
    gauge('rwpXp', xpBefore, xpAfter, !!r.levelUp);
    gauge('rwpRp', rpBefore, rpAfter, !!r.rankUp);
  }
  pendingRewards = null;
}
// ── 닉네임 설정 모달 ──
function openNickModal() {
  document.getElementById('nickErr').textContent = '';
  const i = document.getElementById('nickNew');
  i.value = myAccount ? myAccount.nick : '';
  document.getElementById('nickModal').classList.add('show');
  // 모바일 키보드가 갑자기 튀지 않게 자동 포커스는 생략 (사용자가 직접 탭)
}
function closeNickModal() { document.getElementById('nickModal').classList.remove('show'); }
// '나중에' 눌러도 한 번 더 확인 (실수 방지)
function confirmSkipNick() {
  askConfirm({ icon: '✏️', title: '닉네임을 지금 안 정할까요?', desc: '나중에 바꾸려면 상점의 닉네임 변경권이 필요할 수 있어요.', yes: '나중에 할게요', no: '지금 정하기' },
    () => closeNickModal());
}
async function submitNick() {
  const nick = document.getElementById('nickNew').value.trim();
  const err = document.getElementById('nickErr');
  const tk = localStorage.getItem('ff_auth');
  const r = await apiPost('/api/nick', { token: tk, nick });
  if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderAccount(); closeNickModal();
  socket.emit('auth', { token: tk });   // 게임 서버에도 새 닉 반영
  if (kakaoFirstLogin) { kakaoFirstLogin = false; offerTutorial(); }   // 소셜 첫 로그인 → 닉 설정 후 튜토리얼 유도
}

// ── 카카오 로그인 콜백 처리 (#ktoken=… / #kerr=…) ──
let kakaoFirstLogin = false;
(function handleKakaoReturn() {
  const h = location.hash || '';
  if (h.startsWith('#ktoken=')) {
    const p = new URLSearchParams(h.slice(1));
    localStorage.setItem('ff_auth', p.get('ktoken'));
    kakaoFirstLogin = !!p.get('knew');
    history.replaceState(null, '', location.pathname + location.search);   // 토큰 흔적 제거
  } else if (h.startsWith('#kerr=')) {
    const msg = decodeURIComponent(h.slice(6));
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => alert('⚠️ ' + msg), 300);
  }
})();
// ── 타이틀 화면 (구글/카카오/게스트 선택) ──
function hideTitle() {
  const t = document.getElementById('title'); if (t) t.classList.add('hide');
  lobbyBGM();   // 로비에 들어왔다 — 라운지 곡
}
function showTitle() { sessionStorage.removeItem('ff_guest'); const t = document.getElementById('title'); if (t) { t.style.display = ''; t.classList.remove('hide'); } }

function startAsGuest() { sessionStorage.setItem('ff_guest', '1'); hideTitle(); }   // 게스트 선택 기억
const cameFromOAuth = kakaoFirstLogin || location.href.includes('ktoken');   // 방금 로그인하고 돌아온 경우

// 방에서 막 나온 참이면 멀티플레이 창을 다시 띄운다
if (sessionStorage.getItem('ff_openmulti')) {
  sessionStorage.removeItem('ff_openmulti');
  setTimeout(() => { try { hideTitle(); openMode('multi'); } catch (_) {} }, 120);
}

renderAccount();   // 게스트 상태로 하단 바 먼저 렌더
// 앱을 열면 바로 로비 곡. 브라우저가 자동재생을 막으면 첫 터치에서 시작된다.
try { lobbyBGM(); } catch (_) {}
restoreSession().then(() => {
  if (kakaoFirstLogin && myAccount) openNickModal();
  // 로그인돼 있거나, 게스트로 시작해 게임을 돌던 중(나가기·새로고침)이면 타이틀 건너뜀
  if (myAccount || sessionStorage.getItem('ff_guest')) hideTitle();
});
// 설정된 소셜 로그인 버튼만 타이틀에 노출
fetch('/api/auth-config').then(r => r.json()).then(d => {
  if (d.google) { const b = document.getElementById('titleGoogle'); if (b) b.style.display = 'flex'; }
  if (d.kakao)  { const b = document.getElementById('titleKakao');  if (b) b.style.display = 'flex'; }
}).catch(() => {});

// ── 빠른 대전 (자동 매칭) ───────────────────────────────────
// 랭크게임 — 무작위 매칭. RP 가 오가는 유일한 길이다.
// 랭크게임 — 무엇을 할지는 붙고 나서 서버가 정한다(클래식·아이템전·TWELVE).
// 여기서 모드를 보내지 않는 것이 핵심이다. 클라이언트가 고르면 그게 곧
// 모드 고르기가 되어 무작위의 뜻이 없어진다.
// 기다리는 동안 아무 표시가 없으면 "안 되는 것" 으로 보인다. 남은 초를 센다 —
// 10초 뒤에는 반드시 무슨 일이 일어난다는 걸 알면 기다림이 고장으로 안 읽힌다.
let _mmTick = 0;
function matchCountdown(sec, tail) {
  clearInterval(_mmTick);
  const h = document.getElementById('matchHint');
  let left = sec;
  const draw = () => { if (h) h.textContent = left > 0 ? `${left}초 안에 상대가 없으면 ${tail}` : tail; };
  draw();
  _mmTick = setInterval(() => { left -= 1; if (left < 0) { clearInterval(_mmTick); return; } draw(); }, 1000);
}
function matchCountdownStop() { clearInterval(_mmTick); }

function quickMatch() {
  closeModePanels();
  isItemMode = false;
  socket.emit('quick_match', { pid: PID, nick: getNick() });
  document.getElementById('matchModal').classList.add('show');
  const t = document.getElementById('matchTitle');
  if (t) t.textContent = '🏆 랭크게임';
  const h = document.getElementById('matchHint');
  if (h) h.textContent = '';
  rankSpinStart();
}

// ⚡ 빠른대전 — 모드를 안 가리고 지금 가장 빨리 시작될 방으로.
// 등급(RP)은 안 걸린다. 고르지 않는 대신 걸지도 않는 자리다.
window.quickAny = function () {
  closeModePanels();
  isItemMode = false;
  socket.emit('quick_any', { pid: PID, nick: getNick() });
  const t = document.getElementById('matchTitle');
  if (t) t.textContent = '⚡ 빠른대전';
  const h = document.getElementById('matchHint');
  if (h) h.textContent = '';
};
// 방에 바로 들어간 경우 — 대기 창은 띄우지 않는다(이미 방 대기실이 열린다)
socket.on('quick_any_found', () => {
  const m = document.getElementById('matchModal'); if (m) m.classList.remove('show');
});
// 랭크에서 무엇이 걸렸는지 — 판이 열리기 전에 한 박자 알려 준다.
// 글자만 바뀌면 "처음부터 정해져 있었나" 싶다. 룰렛처럼 돌리다 멈춰야
// 지금 뽑혔다는 게 보인다.
const RANK_LABEL = { classic: '클래식', item: '아이템전', twelve: 'TWELVE' };
const RANK_ICO = { classic: '🃏', item: '🎪', twelve: '🔵' };
const RANK_ORDER = ['classic', 'item', 'twelve'];
const SLOT_H = 46;          // .rk-slot 높이와 같아야 한다
const RK_LOOPS = 6;         // 몇 바퀴 돌고 멈출까
// 위 곡선에서 칸이 넘어가는 시각(ms).
// 앞쪽 대여섯 칸은 40ms 간격으로 흐릿하게 지나가 소리로 셀 수 없다. 그렇다고
// 띄엄띄엄 골라 빼면 남은 간격이 도로 좁아져, 눈은 늦어지는데 귀는 한 번 다시
// 빨라진다 — 그래서 앞을 통째로 자르고 꼬리만 남긴다. 간격이 49 → 410ms 로
// 한 번도 좁아지지 않고 벌어진다.
const RK_TICKS = [235, 284, 338, 396, 462, 535, 618, 715, 830, 969, 1146, 1390, 1800];

// 룰렛은 기다리는 내내 돈다. 상대를 찾는 동안 계속 돌다가, 정해지는 순간
// 그 자리에서 멈춘다 — 기다림 자체가 "무엇이 걸릴까" 로 읽힌다.
const rkSlot = (m) => `<div class="rk-slot m-${m}"><i>${RANK_ICO[m]}</i>${RANK_LABEL[m]}</div>`;

// 대기 시작 — 끝없이 굴린다. 도는 것은 CSS 가 한다.
function rankSpinStart() {
  const box = document.getElementById('rkRoulette');
  const reel = document.getElementById('rkReel');
  const win = box ? box.querySelector('.rk-window') : null;
  if (!box || !reel) return;
  rankSpinStop();
  // 한 바퀴 + 한 칸. 마지막 칸이 첫 칸과 같아서 되돌아가는 자리가 안 보인다.
  reel.innerHTML = RANK_ORDER.map(rkSlot).join('') + rkSlot(RANK_ORDER[0]);
  box.classList.add('on');
  win.classList.remove('landed');
  reel.style.transition = 'none';
  reel.style.transform = '';
  reel.style.setProperty('--rk-loop', `-${RANK_ORDER.length * SLOT_H}px`);
  reel.classList.add('idle');
}
function rankSpinStop() {
  const reel = document.getElementById('rkReel');
  if (reel) reel.classList.remove('idle');
}

// 정해졌다 — 돌던 것을 그 모드에서 멈춘다
function rankRoulette(mode, done) {
  const box = document.getElementById('rkRoulette');
  const reel = document.getElementById('rkReel');
  const win = box ? box.querySelector('.rk-window') : null;
  if (!box || !reel) { done(); return; }
  // 지금 눈에 보이는 자리를 먼저 붙잡는다 — 그 자리에서 이어 돌아야 튀지 않는다
  const now = getComputedStyle(reel).transform;
  const m6 = now && now !== 'none' ? now.match(/matrix\(.*,\s*(-?[\d.]+)\)$/) : null;
  const cur = m6 ? Math.abs(parseFloat(m6[1])) / SLOT_H : 0;
  rankSpinStop();
  let html = '';
  for (let i = 0; i < RK_LOOPS; i++) for (const m of RANK_ORDER) html += rkSlot(m);
  html += rkSlot(mode);
  reel.innerHTML = html;
  box.classList.add('on');
  win.classList.remove('landed');
  reel.style.transition = 'none';
  reel.style.transform = `translateY(-${Math.round(cur * SLOT_H)}px)`;
  void reel.offsetWidth;
  const end = (RK_LOOPS * RANK_ORDER.length) * SLOT_H;
  // 룰렛이 도는 결 — 처음이 가장 빠르고 갈수록 눈에 띄게 늦어져야 한다.
  //
  // 표준 ease-out(0,0,.58,1)은 18칸을 2.9·2.7·2.5·2.3·2.0·1.8·1.5·1.2·0.8·0.3 로
  // 지나간다. 거의 등속이라 "늦어진다" 가 안 보였다. 그렇다고 (0,.5,.22,1) 처럼
  // 확 앞으로 몰면 첫 10% 에 9칸이 지나가고 나머지 60% 는 한 칸도 안 지나가
  // 멈춘 것처럼 보인다 — 빠른 게 아니라 고장 난 것으로 읽힌다.
  //
  // 구간마다 속도가 0.75배씩 줄어드는 결을 목표로 곡선을 맞췄다:
  //   4.8 · 3.6 · 2.7 · 2.0 · 1.5 · 1.1 · 0.9 · 0.6 · 0.5 · 0.4 칸
  // 처음이 마지막의 열두 배지만, 끝까지 한 칸씩은 계속 넘어간다.
  const dur = 1800;
  reel.style.transition = `transform ${dur}ms cubic-bezier(.18, .53, .39, .9)`;
  reel.style.transform = `translateY(-${end}px)`;
  // 딸깍은 칸이 실제로 넘어가는 순간에 울린다. 간격이 일정하면 눈은 늦어지는데
  // 귀는 안 늦어져 따로 논다. 위 곡선으로 18칸의 경계 시각을 미리 풀어 둔 값이고,
  // 앞쪽 너무 촘촘한 것(60ms 미만)은 소리로 못 알아들으므로 뺐다.
  // 끝의 네 간격이 139·177·244·410ms — 늦어지는 게 귀로 들린다.
  for (const at of RK_TICKS) setTimeout(() => playSound('tick'), at);
  setTimeout(() => {
    win.classList.add('landed');
    playSound('bell');
    setTimeout(done, 340);                                // 멈춘 걸 볼 한 박자
  }, dur + 40);
}

// 상대를 찾았고 무엇을 할지도 정해졌다 — 여기서부터 매칭 창은 할 일이 끝났다.
// 룰렛이 서고 한 박자 뒤 창을 걷는다. 남겨 두면 판이 이미 깔린 뒤에도
// "찾는 중" 창이 위에 떠 있어, 무엇을 기다리는 화면인지 알 수 없다.
// 뽑힌 모드는 토스트로 남으니 창이 사라져도 못 보고 지나칠 일은 없다.
function matchDone(label) {
  const m = document.getElementById('matchModal');
  if (m) m.classList.remove('show');
  rkHide(); matchCountdownStop();
  toast(`🎲 <b>${esc(label)}</b>`, 1800);
}
socket.on('ranked_mode', ({ mode, bot, room }) => {
  isItemMode = mode === 'item';
  const label = RANK_LABEL[mode] || mode;
  // 방에서 '랜덤' 으로 시작한 경우 — 매칭 창이 아니라 대기실 위에서 돌린다
  if (room) {
    const m = document.getElementById('matchModal');
    if (m) m.classList.add('show');
    const t0 = document.getElementById('matchTitle');
    if (t0) t0.textContent = '🎲 랜덤';
    const h0 = document.getElementById('matchHint');
    if (h0) h0.textContent = '무엇을 할지 지금 정합니다…';
    rankRoulette(mode, () => matchDone(label));
    return;
  }
  matchCountdownStop();
  const h = document.getElementById('matchHint');
  if (h) h.textContent = '';
  const t = document.getElementById('matchTitle');
  if (t) t.textContent = '🏆 랭크게임';
  rankRoulette(mode, () => matchDone(label));
});
// 판이 열리면 룰렛은 걷는다 — 다음에 다시 열 때 지난 결과가 남아 있으면 안 된다
function rkHide() { rankSpinStop(); const b = document.getElementById('rkRoulette'); if (b) b.classList.remove('on'); }

// 빠른 입장 — 그 모드로 열린 방이 있으면 바로 들어가고, 없으면 하나 열고 기다린다.
// 랭크가 안 걸리므로 편하게 붙는 자리다.
window.quickJoin = function (mode) {
  closeModePanels();
  // 다인전도 다른 모드와 같은 길로 간다 — 대기실에 앉아서 사람을 기다린다.
  // 예전엔 여기서만 곧장 판 화면으로 들어가 버려 결이 달랐다.
  isItemMode = mode === 'item';
  socket.emit('quick_join', { mode, pid: PID, nick: getNick() });
};
function cancelMatch() {
  matchCountdownStop();
  socket.emit('cancel_match');
  document.getElementById('matchModal').classList.remove('show');
  rkHide();
}
socket.on('queued', () => document.getElementById('matchModal').classList.add('show'));
socket.on('unqueued', () => { document.getElementById('matchModal').classList.remove('show'); rkHide(); matchCountdownStop(); });

// ── 랭킹 ────────────────────────────────────────────────────
function openLeaderboard() {
  const modal = document.getElementById('lbModal'), list = document.getElementById('lbList');
  if (!cacheGet('lb')) list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  modal.classList.add('show');
  return showThenRefresh('lb',
    () => fetch('/api/leaderboard').then((x) => x.json()), renderLeaderboard);
}
async function renderLeaderboard(r) {
  const list = document.getElementById('lbList');
  try {
    if (!r || !r.ok || !r.players.length) { list.innerHTML = '<div class="lb-empty">아직 랭킹이 없어요. 첫 플레이어가 되어보세요!</div>'; return; }
    const myNick = myAccount && myAccount.nick;
    list.innerHTML = '';

    // 시즌 표시 — 달이 바뀌면 단·ACE 가 한 단계 내려간다. 말없이 내려가면
    // 유저는 자기가 진 줄 안다.
    const sEl = document.getElementById('lbSeason');
    if (sEl && r.season) sEl.textContent = `시즌 ${r.season.no}`;

    // ── 1·2·3등 시상대 ────────────────────────────────────────────
    // 목록 첫 세 줄로만 보여 주면 1등이 그저 맨 윗줄일 뿐이다.
    // 2등 왼쪽 · 1등 가운데(높게) · 3등 오른쪽으로 세워 한눈에 보이게 한다.
    const top = r.players.slice(0, 3);
    const podBox = document.getElementById('lbPodium');
    if (podBox) {
      // 화면 순서는 2 · 1 · 3 이지만 등수는 그대로다
      const order = [top[1], top[0], top[2]].filter(Boolean);
      podBox.innerHTML = order.length ? `<div class="lb-podium">${order.map((p) => `
        <div class="pod pod-${p.no}${myNick && p.nick === myNick ? ' me' : ''}">
          <div class="pod-ava" style="color:${p.rankColor}">${podFace(p)}</div>
          <div class="pod-stand">
            <div class="pod-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${nickHTML(p.nick, p.nickColor)}</div>
            <div class="pod-title">${titleTag(p.titleInfo) || ''}</div>
            <div class="pod-grade" style="color:${p.rankColor}">${esc(p.rank)}</div>
            <div class="pod-rp">${p.rp} RP</div>
            <div class="pod-medal">${rankIco(['🥇', '🥈', '🥉'][p.no - 1])}</div>
          </div>
        </div>`).join('')}</div>` : '';
    }

    // 시상대에 올린 셋은 목록에서 뺀다 — 같은 사람이 두 번 나올 이유가 없다
    r.players.slice(3).forEach(p => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (myNick && p.nick === myNick ? ' me' : '');
      row.innerHTML = `<span class="lb-no${p.no <= 3 ? ' top' : ''}">${p.no <= 3 ? rankIco(['🥇','🥈','🥉'][p.no-1]) : p.no}</span>
        <span class="lb-rank" style="color:${p.rankColor}">${faceOf(p)}</span>
        <span class="lb-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${nickHTML(p.nick, p.nickColor)}</span>
        <span class="lb-title">${titleTag(p.titleInfo)}</span>
        <span class="lb-wl">${p.wins}승 ${p.losses}패</span>
        <span class="lb-rp">${p.rp} RP</span>`;
      list.appendChild(row);
    });
    // 내 순위가 톱20 밖이면 하단에 별도 표시
    if (myAccount) {
      const inTop = r.players.some(p => p.nick === myNick);
      // 내 순위도 담아 둔다 — 랭킹을 열 때마다 두 번 다녀오지 않게
      const mr = cacheGet('myrank')
        || await fetchInto('myrank', () => apiPost('/api/myrank', { token: authToken() }));
      if (!inTop && mr.me && mr.me.no) {
        const me = mr.me;
        const row = document.createElement('div'); row.className = 'lb-row me lb-mine';
        row.innerHTML = `<span class="lb-no">${me.no}</span>
          <span class="lb-rank" style="color:${me.rankColor}">${faceOf(me)}</span>
          <span class="lb-nick${ncClass(me.nickColor)}">${nickHTML(me.nick, me.nickColor)}</span>
          <span class="lb-title">${titleTag(me.titleInfo)}</span>
          <span class="lb-wl">${me.wins}승 ${me.losses}패</span>
          <span class="lb-rp">${me.rp} RP</span>`;
        const div = document.createElement('div'); div.className = 'lb-mydiv'; div.textContent = `⋯ 내 순위 (${me.no}위 / ${me.total}명) ⋯`;
        list.appendChild(div); list.appendChild(row);
      }
    }
  } catch (_) { list.innerHTML = '<div class="lb-empty">불러오기 실패</div>'; }
}
function closeLb() { document.getElementById('lbModal').classList.remove('show'); }

// ── 일일 미션 ──
// 수령식으로 바꾸면서 "받을 게 있다" 를 어딘가 알려야 한다 — 안 그러면
// 미션 창을 열어 보기 전엔 모른다. 탭바의 점(마크업만 있고 아무도 안 켜던
// 아래 탭에 켠다.
async function refreshMissionDot() {
  if (!myAccount) return navMark('mission', 0);
  const r = await fetchInto('missions', () => apiPost('/api/missions', { token: authToken() }), 15000);
  const ready = r && !r.error ? (r.list || []).filter((m) => m.done && !m.claimed).length : 0;
  navMark('mission', ready);
}

// ── 아래 탭 알림 ────────────────────────────────────────────────────────
// 새로 생긴 일이 있으면 탭에 빨간 표를 띄우고, 그 탭을 눌러 보고 나면 끈다.
// "봤다" 를 그때의 개수로 기억한다 — 그래서 새 일이 하나 더 생기면 다시 뜨고,
// 처리해서 줄어들면 기준도 같이 내려간다.
const navCount = {};      // 탭 → 지금 몇 건인가
const navSeenAt = {};     // 탭 → 마지막으로 보고 나갔을 때의 건수
function navMark(key, n) {
  n = Math.max(0, Number(n) || 0);
  navCount[key] = n;
  if (n < (navSeenAt[key] || 0)) navSeenAt[key] = n;   // 처리해서 줄었으면 기준도 내린다
  paintNavBadge(key);
}
function navSeen(key) { navSeenAt[key] = navCount[key] || 0; paintNavBadge(key); }
function paintNavBadge(key) {
  const item = document.querySelector(`#navBar [data-nav="${key}"]`);
  if (!item) return;
  const left = (navCount[key] || 0) - (navSeenAt[key] || 0);
  let b = item.querySelector('.nav-badge');
  if (left <= 0) { if (b) b.style.display = 'none'; return; }
  if (!b) { b = document.createElement('i'); b.className = 'nav-badge'; item.appendChild(b); }
  b.textContent = left > 99 ? '99+' : String(left);
  b.style.display = '';
}

// ── 탭 내용 미리 받아 두기 ──────────────────────────────────────────────
//
// 미션·친구·클랜·랭킹은 누를 때마다 서버에 한 번 다녀온다. 서버가 하는 일은
// 1ms 도 안 되는데, 오가는 데만 200~400ms 가 든다(Render 가 멀다). 그래서
// 누르고 나서 잠깐 비어 있는 화면을 보게 된다.
//
// 고칠 방법은 두 가지다. 지난번에 받은 것을 먼저 그려 놓고 뒤에서 조용히
// 새로 받아 오는 것(그러면 두 번째부터는 기다림이 없다), 그리고 로그인
// 직후에 미리 한 번 받아 두는 것(그러면 첫 번째도 기다림이 없다).
const _cache = new Map();          // 열쇠 → 마지막 응답
const _inflight = new Map();       // 같은 것을 두 번 부르지 않게

function cacheGet(key) { return _cache.get(key); }
function cacheDrop(key) { _cache.delete(key); _cacheAt.delete(key); }
// 받아 와서 담아 둔다. 이미 부르는 중이면 그 약속을 같이 쓴다.
// maxAge — 이만큼 안 지난 값이 있으면 그걸 그대로 준다.
// 예전엔 미리 받아 두고도 배지 갱신이 같은 것을 또 쏘아, 켤 때마다
// /api/friends · /api/clan · /api/missions 가 두 번씩 나갔다.
const _cacheAt = new Map();
function fetchInto(key, fetcher, maxAge) {
  if (maxAge) {
    const at = _cacheAt.get(key);
    if (at && Date.now() - at < maxAge && _cache.has(key)) return Promise.resolve(_cache.get(key));
  }
  const going = _inflight.get(key);
  if (going) return going;
  const p = Promise.resolve().then(fetcher)
    .then((r) => { if (r && !r.error) { _cache.set(key, r); _cacheAt.set(key, Date.now()); } return r; })
    .finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}
// 지난 값이 있으면 그걸로 먼저 그리고, 새 값이 오면 다시 그린다.
function showThenRefresh(key, fetcher, render) {
  const had = _cache.get(key);
  if (had) render(had);
  const p = fetchInto(key, fetcher);
  if (!had) return p.then(render);
  p.then((r) => { if (r && !r.error) render(r); });   // 조용히 갈아 끼운다
  return p;
}
// 로그인 직후 미리 받아 둔다. 한꺼번에 쏘지 않고 조금씩 흘린다 —
// 켜자마자 네 개를 동시에 던지면 정작 급한 로비 화면이 늦어진다.
function prefetchTabs() {
  if (!myAccount) return;
  // 배지 갱신이 먼저 받아 둔 게 있으면 건너뛴다. 미리받기는 400ms 뒤에
  // 시작하는데, 그 사이 배지가 이미 같은 것을 받아 온다 — 그대로 두면
  // 켤 때마다 세 개가 두 번씩 나간다.
  const FRESH = 15000;
  const jobs = [
    () => fetchInto('missions', () => apiPost('/api/missions', { token: authToken() }), FRESH),
    () => fetchInto('friends',  () => apiPost('/api/friends',  { token: authToken() }), FRESH),
    () => fetchInto('clan',     () => apiPost('/api/clan',     { token: authToken() }), FRESH),
    () => fetchInto('lb',       () => fetch('/api/leaderboard').then((x) => x.json()), FRESH),
    () => fetchInto('clanlist', () => apiPost('/api/clan-list', { token: authToken() }), FRESH),
  ];
  jobs.forEach((j, i) => setTimeout(() => { try { j(); } catch (_) {} }, 400 + i * 250));
}

function openMissions() {
  if (!myAccount) { alert('미션은 로그인하면 이용할 수 있어요!'); openAuth('login'); return; }
  const list = document.getElementById('missionList');
  if (!cacheGet('missions')) list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  document.getElementById('missionModal').classList.add('show');
  return showThenRefresh('missions',
    () => fetchInto('missions', () => apiPost('/api/missions', { token: authToken() })), renderMissions);
}
function renderMissions(r) {
  const list = document.getElementById('missionList');
  if (!r || r.error || !r.list) { list.innerHTML = '<div class="lb-empty">불러오기 실패</div>'; return; }
  // 받을 게 있는 것부터 위로. 아래로 내려야 보이면 받는 걸 놓친다.
  const rank = (m) => (m.done && !m.claimed ? 0 : m.claimed ? 2 : 1);
  list.innerHTML = '';
  r.list.slice().sort((a, b) => rank(a) - rank(b)).forEach(m => {
    const row = document.createElement('div');
    row.className = 'mis-row' + (m.claimed ? ' done' : (m.done ? ' ready' : ''));
    // 싸이클링은 "3/4" 만으로는 어느 종류가 남았는지 알 수 없다 —
    // 2·3·4·6 을 하나씩 보여줘야 "이번엔 6 으로 이겨야지" 가 된다.
    const detail = m.cycle
      ? `<div class="mis-cyc">${m.cycle.map((c) =>
          `<span class="mis-cyc-k${c.done ? ' on' : ''}">${c.kind}</span>`).join('')}</div>`
      : `<div class="mis-prog">${m.prog}/${m.goal}</div>`;
    // 다 채웠으면 수령 버튼, 받았으면 완료, 아니면 액수만.
    const right = m.claimed
      ? `<div class="mis-reward">완료!</div>`
      : m.done
        ? `<button class="mis-claim" onclick="claimMission('${m.id}')">${ico('🪙')} ${m.reward} 수령</button>`
        : `<div class="mis-reward">${ico('🪙')} ${m.reward}</div>`;
    row.innerHTML = `
      <div class="mis-info">
        <div class="mis-name">${m.claimed ? ico('✅') : ico(m.cycle ? '🏁' : '🎯')} ${esc(m.name)}</div>
        <div class="mis-bar"><div class="mis-fill" style="width:${Math.round(m.prog / m.goal * 100)}%"></div></div>
        ${detail}
      </div>
      ${right}`;
    list.appendChild(row);
  });
}
// 수령. 금액은 서버가 정한다 — 여기서는 어느 미션인지만 보낸다.
let misClaiming = false;
async function claimMission(id) {
  if (misClaiming) return;                       // 연타로 두 번 보내지 않게
  misClaiming = true;
  try {
    const r = await apiPost('/api/mission-claim', { token: localStorage.getItem('ff_auth'), id });
    if (r.error) { toast(esc(r.error)); return; }
    myAccount = r.profile || myAccount;
    renderAccount();
    playSound('setwin');
    toast(`🪙 ${r.amount} 코인을 받았어요!`);
    cacheDrop('missions');
    await openMissions();                        // 목록 다시 그려 상태 맞춤
  } finally { misClaiming = false; }
}
function closeMissions() { document.getElementById('missionModal').classList.remove('show'); }

// ══════════════════════════════════════════════════════════
//  아이템전 (이벤트 모드) — AI 대전 전용
// ══════════════════════════════════════════════════════════
// 카탈로그는 서버 items.js와 같은 내용을 표시용으로만 들고 있는다.
// 실제 효과·검증은 전부 서버가 하므로 여기 값을 고쳐도 게임에 영향은 없다.
const ITEM_INFO = {
  magnify:    { name: '돋보기',       icon: '🔍', tier: 'common', desc: '상대 손패 2장을 훔쳐본다' },
  scan:       { name: '눈금자',       icon: '📏', tier: 'common', desc: '이번 경매품이 상대에게 얼마나 쓸모 있는지 본다' },
  swap:       { name: '손바꿈',       icon: '🔀', tier: 'common', desc: '내 손패 1장을 덱의 카드와 바꾼다', needsCard: true },
  smoke:      { name: '연막탄',       icon: '💨', tier: 'legend', desc: '이번 경매품을 상대에게만 가린다' },
  flip:       { name: '뒤집개',       icon: '🔄', tier: 'rare',   desc: '이번 경매만 약한 카드가 이긴다' },
  trade:      { name: '교환권',       icon: '🔁', tier: 'rare',   desc: '내가 딴 카드 1장과 상대가 딴 카드 1장을 맞바꾼다' },
  bomb:       { name: '폭탄',         icon: '💣', tier: 'rare',   desc: '경매품에 폭탄을 얹는다 — 먹는 쪽이 손패 1장을 버린다' },
  ward:       { name: '부적',         icon: '🧿', tier: 'rare',   desc: '상대의 다음 아이템 1개를 이번 턴 동안 막는다' },
  redo:       { name: '재경매',       icon: '📢', tier: 'legend', desc: '진 경매를 무효로 하고 다시 배팅한다 — 방금 낸 카드는 둘 다 못 쓴다' },
  steal:      { name: '도둑고양이',   icon: '🐈', tier: 'legend', desc: '상대가 낙찰받은 카드 1장을 덱으로 되돌린다' },
  copy:       { name: '복사기',       icon: '🖨️', tier: 'legend', desc: '내가 낙찰받은 카드 1장을 복제한다' },
  tyrant:     { name: '폭군',         icon: '👑', tier: 'legend', desc: '이번 턴 진행자 권한을 뺏는다' },
  pick3:      { name: '고르기',       icon: '🎴', tier: 'legend', desc: '덱 맨 위 3장 중 하나를 이번 중앙 카드로 고른다' },
};
const TIER_LABEL = { common: '일반', rare: '희귀', legend: '전설' };
// 직접 그린 SVG 아이콘 (item-icons.js). 못 불러오면 이모지로 대체.
const itemArt = id => (typeof ITEM_ICONS !== 'undefined' && ITEM_ICONS[id]) || (ITEM_INFO[id] ? ITEM_INFO[id].icon : '❓');
let isItemMode = false;
let _iuItem = null, _iuCard = null;

// 로비 → 아이템전: 솔로(AI) / 빠른플레이(유저 매칭) 선택
// 아이템전 진입은 솔로·멀티 팝업 안으로 옮겼다. 전에는 로비에 따로 버튼이
// 있고 거기서 다시 "솔로 / 빠른플레이" 를 물었는데, AI전은 솔로 안에,
// 온라인 매칭은 멀티 안에 있는 게 찾기 쉽다 — 한 번 덜 묻는다.
window.startItemGame = function (diff) {
  closeModePanels();
  isVsBot = true; isItemMode = true;
  // 난이도를 고를 수 있다. 예전엔 '보통' 으로만 붙어서, 클래식에서는 고르는데
  // 아이템전만 못 고르는 게 이상했다.
  difficulty = ['easy', 'hard', 'expert'].includes(diff) ? diff : 'normal';
  // 그물이 끊겨 있으면 화면이 혼자 굴린다 — 아이템 효과도 서버가 쓰는 그 파일이 낸다
  if (!socket.connected && window.OFFLINE && OFFLINE.can('item'))
    return offlineStart(difficulty, true);
  socket.emit('create_room', { vsBot: true, difficulty, pid: PID, nick: getNick(), itemMode: true });
};

// 슬롯 3칸 렌더 — 지금 쓸 수 있는 것만 밝게
function renderItems(s) {
  const bar = document.getElementById('itemBar');
  const badge = document.getElementById('oppItemBadge');
  if (!bar) return;
  if (!s || !s.itemMode) { bar.style.display = 'none'; badge.style.display = 'none'; hideFxBanner(); return; }
  // 새로 들어와도(새로고침·재접속) 고를 차례면 다시 띄운다 — 안 그러면 판이 멈춘 채로 보인다
  if (s.bombPick && !_bombOn) openBombPick(s.myHand || []);
  bar.style.display = '';
  badge.style.display = '';
  document.getElementById('oppItemCount').textContent = s.oppItemCount || 0;

  const slots = document.getElementById('itemSlots');
  const held = s.myItems || [];
  let html = '';
  for (let i = 0; i < 3; i++) {
    const id = held[i];
    if (!id) { html += '<div class="ib-slot empty"></div>'; continue; }
    const it = ITEM_INFO[id] || { name: id, icon: '❓', tier: 'common' };
    const usable = itemUsableNow(id, s);
    // 못 쓰는 슬롯도 눌리게 둔다 — 아무 반응이 없으면 뭘 가진 건지조차 알 수 없다.
    // 길게 누르면 어떤 물건인지 알려 준다. 폰에는 마우스를 얹는다는 게 없어서
    // title 속성은 아무 소용이 없다 — 쓸 수 있는 물건도 눌러 보기 전에 확인할 길이 없었다.
    html += `<div class="ib-slot ${it.tier} ${usable ? 'ready' : 'locked'}" title="${esc(it.name)}"
                  data-item="${esc(id)}"
                  onclick="${usable ? `openItemUse('${id}')` : `explainItem('${id}')`}">${itemArt(id)}</div>`;
  }
  slots.innerHTML = html;
  slots.querySelectorAll('.ib-slot[data-item]').forEach(bindLongPress);
  renderFxBanner(s);
}

// 길게 누르면 설명, 짧게 누르면 원래 하던 일.
//
// 손가락은 조금씩 떨리므로 10px 까지는 누른 것으로 친다. 길게 눌러 설명이 뜬 뒤에는
// 손을 뗄 때 딸려 오는 click 을 한 번 삼킨다 — 안 그러면 설명을 보려다 물건을 쓴다.
const LONG_PRESS_MS = 420;
// show 를 안 주면 el.dataset.item 의 물건을 설명한다 (내 아이템 칸).
// 경매판에 얹힌 카드처럼 설명이 달라야 하는 자리는 show 를 따로 준다.
function bindLongPress(el, show) {
  const tell = show || (() => explainItem(el.dataset.item));
  let timer = null, fired = false, sx = 0, sy = 0;
  const stop = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    fired = false; sx = e.clientX; sy = e.clientY;
    stop();
    timer = setTimeout(() => {
      fired = true; timer = null;
      tell();
      vibe('turn');                     // 길게 눌렸다는 걸 손으로도 알린다
      el.classList.remove('lp-hold');
    }, LONG_PRESS_MS);
    el.classList.add('lp-hold');
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) { stop(); el.classList.remove('lp-hold'); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    el.addEventListener(ev, () => { stop(); el.classList.remove('lp-hold'); });
  }
  // 설명을 띄웠으면 뒤따라오는 click 은 없던 일로 한다
  el.addEventListener('click', (e) => {
    if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; }
  }, true);
  // 폰에서 꾹 누르면 뜨는 '복사/공유' 메뉴를 막는다
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// 클라이언트 쪽 사용 가능 판단 (서버가 최종 판정 — 여기선 버튼을 흐리게 할 뿐)
function itemUsableNow(id, s) {
  if (!s || s.itemUsed) return false;
  const PRE = ['draw', 'offer', 'choose_type', 'bidding'];
  const phases = id === 'redo' ? ['reveal']
               : id === 'tyrant' ? ['draw']
               : id === 'pick3' ? ['choose_type', 'bidding']
               : (id === 'smoke' || id === 'bomb') ? ['offer', 'choose_type', 'bidding']
               : PRE;
  if (!phases.includes(s.phase)) return false;
  if (s.phase === 'bidding' && s.auction && s.auction.myBid) return false;   // 배팅 낸 뒤엔 불가
  if (id === 'tyrant' && s.auctioneer === s.myIndex) return false;
  // 부적은 막을 것이 있어야 건다 — 서버가 최종 판정하지만, 여기서 미리 흐리게 해 준다
  if (id === 'ward') {
    if (s.fx && s.fx.wardMe) return false;
    if (!s.oppItemCount) return false;
  }
  return true;
}

function renderFxBanner(s) {
  const el = document.getElementById('fxBanner');
  if (!el) return;
  const f = s.fx || {};
  const msgs = [];
  if (f.reverse) msgs.push('🔄 반전 — 약한 카드가 이긴다');
  if (f.wardMe) msgs.push('🧿 부적 — 상대의 다음 아이템을 막는다');
  if (f.smokedMe) msgs.push('💨 연막 — 경매품이 안 보인다');
  if (f.smokedOpp) msgs.push('💨 상대 시야를 가림');
  if (f.bomb) msgs.push('💣 폭탄 — 먹는 쪽이 손패 1장을 버린다');
  if (f.banned) msgs.push('📢 방금 낸 카드는 못 낸다');
  if (f.scan != null) msgs.push(['📏 상대에겐 별 쓸모 없다', '📏 상대에게 쓸 만하다', '📏 상대가 간절히 원한다'][f.scan]);
  let peekHtml = '';
  if (f.peek && f.peek.length) {
    peekHtml = ' 🔍 ' + f.peek.map(c =>
      `<span style="display:inline-block;padding:0 5px;margin:0 1px;border-radius:5px;background:rgba(255,255,255,.22)">${c.kind}<small style="opacity:.75">-${c.grade}</small></span>`).join('');
  }
  if (!msgs.length && !peekHtml) { el.style.display = 'none'; return; }
  el.innerHTML = esc(msgs.join('  ·  ')) + peekHtml;
  el.style.display = '';
}
function hideFxBanner() { const el = document.getElementById('fxBanner'); if (el) el.style.display = 'none'; }

// 지금 못 쓰는 아이템을 눌렀을 때 — 무엇이고 언제 쓸 수 있는지 알려준다
const WHEN_TEXT = {
  redo:   '경매 결과가 공개된 뒤, 진 쪽만',
  tyrant: '진행자가 카드를 뽑기 전에 (손패 2장 이상)',
  pick3:  '경매 방식이 정해진 뒤부터 배팅 전까지',
  smoke:  '경매품이 나온 뒤부터 배팅 전까지',
  bomb:   '경매품이 나온 뒤부터 배팅 전까지',
};
function explainItem(id) {
  const it = ITEM_INFO[id]; if (!it) return;
  const when = WHEN_TEXT[id] || '내 차례에, 배팅을 내기 전까지';
  const why = (state && state.itemUsed) ? '이번 턴엔 이미 아이템을 썼어요.' : `사용 시점: ${when}`;
  toast(`<b>${esc(it.name)}</b> — ${esc(it.desc)}<br><span style="opacity:.75;font-size:.9em">${esc(why)}</span>`, 3200);
  playSound('select');
}

// 사용 확인 모달 (손바꿈만 카드 선택 필요)
function openItemUse(id) {
  const it = ITEM_INFO[id]; if (!it) return;
  _iuItem = id; _iuCard = null;
  document.getElementById('iuTitle').textContent = it.name;
  document.getElementById('iuIcon').innerHTML = itemArt(id);
  document.getElementById('iuDesc').textContent = it.desc;
  const handBox = document.getElementById('iuHand');
  if (it.needsCard) {
    const hand = (state && state.myHand) || [];
    handBox.innerHTML = '<div style="width:100%;font-size:.7rem;color:#a08a70;text-align:center;margin-bottom:2px">바꿀 카드를 고르세요</div>';
    // 카드 id는 숫자다(kind*100+grade). onclick 속성에 넣으면 문자열이 되어
    // 서버의 엄격 비교(c.id === arg)에서 201 === '201' 로 어긋난다. 값을 그대로 넘긴다.
    hand.forEach(c => {
      const el = document.createElement('div');
      el.className = 'iu-c';
      el.innerHTML = `${c.kind}<small>${c.grade}등급</small>`;
      el.addEventListener('click', () => pickIuCard(el, c.id));
      handBox.appendChild(el);
    });
    document.getElementById('iuGo').disabled = true;
  } else {
    handBox.innerHTML = '';
    document.getElementById('iuGo').disabled = false;
  }
  document.getElementById('itemUseModal').classList.add('show');
}
function pickIuCard(el, cardId) {
  _iuCard = cardId;
  document.querySelectorAll('#iuHand .iu-c').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('iuGo').disabled = false;
}
function closeItemUse() { document.getElementById('itemUseModal').classList.remove('show'); _iuItem = null; _iuCard = null; }

// ── 폭탄 ──────────────────────────────────────────────────────────────
// 낙찰받은 쪽이 손패 1장을 버린다. 무엇을 버릴지는 본인이 고른다 —
// 자동으로 버려 주면 "왜 저게 없어졌지" 가 되고, 고르게 하면 그것 자체가 한 수다.
// 닫을 수 없는 창이다. 고르기 전에는 판이 안 넘어간다.
let _bombOn = false;
function openBombPick(hand) {
  if (_bombOn) return;
  _bombOn = true;
  const it = { name: '폭탄이 터졌다', desc: '버릴 카드를 고르세요 — 되돌릴 수 없어요' };
  document.getElementById('iuTitle').textContent = it.name;
  document.getElementById('iuIcon').innerHTML = itemArt('bomb');
  document.getElementById('iuDesc').textContent = it.desc;
  const box = document.getElementById('iuHand');
  box.innerHTML = '';
  (hand || []).forEach((c) => {
    const el = document.createElement('div');
    el.className = 'iu-c';
    el.innerHTML = `${c.kind}<small>${c.grade}등급</small>`;
    el.addEventListener('click', () => {
      socket.emit('bomb_discard', { cardId: c.id });
      _bombOn = false;
      const g2 = document.getElementById('iuGo'); if (g2) g2.style.display = '';
      const n2 = document.getElementById('iuNo'); if (n2) n2.style.display = '';
      document.getElementById('itemUseModal').classList.remove('show', 'no-close');
    });
    box.appendChild(el);
  });
  // 고르는 것 말고는 길이 없다 — 사용·취소 버튼을 둘 다 숨긴다.
  // 취소가 남아 있으면 강제 선택을 빠져나가 판이 멈춘 채로 남는다.
  const go = document.getElementById('iuGo'); if (go) go.style.display = 'none';
  const no = document.getElementById('iuNo'); if (no) no.style.display = 'none';
  const modal = document.getElementById('itemUseModal');
  modal.classList.add('show', 'no-close');
  playSound('bell');
}
socket.on('bomb_pick', ({ hand }) => openBombPick(hand));
// 보너스 카드 — 상대가 뒤집어 얻었다. 무엇을 얻었는지는 둘 다 안다.
// 🎁 보너스는 경매에 안 올라간다 — 뒤집은 그 자리에서 그 사람 것이 된다.
// 그러니 판 가운데 놓였다가 사라지는 게 아니라, 덱에서 그 사람 쪽으로 날아가야
// "저 사람이 방금 하나 챙겼다" 가 보인다. 화투에서 패를 걷어 가는 그 동작이다.
socket.on('bonus_card', ({ seat, item }) => {
  const mine = !!(state && seat === state.myIndex);
  const ms = flyBonusCard(item, mine);
  if (mine) setTimeout(() => showItemGet(item), ms);
  else setTimeout(() => toast(`🎁 상대가 보너스 카드로 <b>${esc(item.name)}</b> 를 얻었어요`, 2600), ms);
});

// 덱에서 아이템 칸으로 날아가는 카드 한 장. 도착까지 걸리는 시간을 돌려준다 —
// 팝업·알림이 카드보다 먼저 뜨면 무엇이 어디서 왔는지가 안 읽힌다.
const BONUS_FLY_MS = 620;
function flyBonusCard(item, mine) {
  const deck = document.getElementById('deckStack');
  const dest = document.getElementById(mine ? 'itemSlots' : 'oppItemBadge');
  if (!deck || !dest || document.hidden) return 120;
  const from = deck.getBoundingClientRect(), to = dest.getBoundingClientRect();
  if (!from.width || !to.width) return 120;
  const ghost = makeItemCard({ kind: 'bonus', itemId: item.id, name: item.name, tier: item.tier });
  ghost.classList.add('fly-card', 'fly-bonus');
  ghost.style.left = from.left + 'px'; ghost.style.top = from.top + 'px';
  ghost.style.width = from.width + 'px'; ghost.style.height = from.height + 'px';
  document.body.appendChild(ghost);
  void ghost.offsetWidth;                       // 시작 위치 확정
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.35) rotate(${mine ? -8 : 8}deg)`;
  ghost.style.opacity = '0';
  playSound('deal');
  setTimeout(() => { try { ghost.remove(); } catch (_) {} }, BONUS_FLY_MS + 120);
  // 도착 지점이 한 번 튀어 "여기 들어왔다" 를 알린다
  setTimeout(() => {
    dest.classList.add('got-item');
    setTimeout(() => dest.classList.remove('got-item'), 420);
  }, BONUS_FLY_MS - 120);
  return BONUS_FLY_MS;
}
// 덤은 판 위에 앞면으로 놓여 있다가 진 쪽에게 간다. 그 경로를 보여 준다 —
// 보너스는 덱에서 나오지만 덤은 이미 판에 있으므로 출발점이 다르다.
socket.on('tip_card', ({ seat, item }) => {
  const mine = !!(state && seat === state.myIndex);
  const ms = flyTipCard(item, mine);
  if (mine) setTimeout(() => showItemGet(item), ms);
  else setTimeout(() => toast(`${ico('🏷')} 상대가 덤으로 <b>${esc(item.name)}</b> 를 얻었어요`, 2600), ms);
});
let _tipEl = null;    // 판에 놓인 덤 카드
function flyTipCard(item, mine) {
  // 출발점은 판에 놓인 덤 카드. 정산 신호가 올 때쯤이면 판이 다시 그려져
  // 그 마디가 사라졌거나 크기가 0 일 수 있어서, 실제로 잴 수 있는 것을 고른다.
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width > 2 && r.height > 2) ? r : null;
  };
  const from = rectOf(_tipEl)
            || rectOf(document.querySelector('#auctionItems .item-card'))
            || rectOf(document.getElementById('auctionItems'))
            || rectOf(document.getElementById('deckStack'));
  const dest = document.getElementById(mine ? 'itemSlots' : 'oppItemBadge');
  const to = rectOf(dest) || rectOf(document.getElementById(mine ? 'itemBar' : 'oppbar'));
  if (!from || !to || !dest || document.hidden) return 120;
  const ghost = makeItemCard({ kind: 'tip', itemId: item.id, name: item.name, tier: item.tier });
  ghost.classList.add('fly-card', 'fly-bonus');
  ghost.style.left = from.left + 'px'; ghost.style.top = from.top + 'px';
  ghost.style.width = from.width + 'px'; ghost.style.height = from.height + 'px';
  document.body.appendChild(ghost);
  void ghost.offsetWidth;
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.35) rotate(${mine ? -8 : 8}deg)`;
  ghost.style.opacity = '0';
  playSound('deal');
  setTimeout(() => { try { ghost.remove(); } catch (_) {} }, BONUS_FLY_MS + 120);
  setTimeout(() => {
    dest.classList.add('got-item');
    playSound('select');                       // 도착 — 들어왔다는 소리
    if (mine) vibe('got');                     // 그리고 손으로도
    setTimeout(() => dest.classList.remove('got-item'), 420);
  }, BONUS_FLY_MS - 120);
  return BONUS_FLY_MS;
}
socket.on('bomb_blew', ({ seat, card }) => {
  _bombOn = false;
  const go = document.getElementById('iuGo'); if (go) go.style.display = '';
  const no = document.getElementById('iuNo'); if (no) no.style.display = '';
  const m = document.getElementById('itemUseModal'); if (m) m.classList.remove('no-close');
  const who = (state && seat === state.myIndex) ? '내' : '상대';
  toast(`💣 ${who} 손패에서 ${card.kind}-${card.grade} 가 날아갔어요`, 2400);
  screenFx('shake');
});
function confirmUseItem() {
  if (!_iuItem) return;
  socket.emit('use_item', { itemId: _iuItem, cardId: _iuCard ?? undefined });
  closeItemUse();
}

// 아이템 획득 연출
function showItemGet(it) {
  const box = document.getElementById('itemGetFx');
  document.getElementById('igTier').textContent = TIER_LABEL[it.tier] || '';
  document.getElementById('igIcon').innerHTML = itemArt(it.id);
  document.getElementById('igName').textContent = it.name;
  document.getElementById('igDesc').textContent = it.desc || '';
  box.style.display = 'flex';
  // 티어별로 획득감 차등 — 전설은 링·파편까지 터뜨린다
  const card = box.querySelector('.ig-card');
  if (card) { card.className = 'ig-card ' + it.tier; }
  playSound(it.tier === 'legend' ? 'setwin' : 'bell');
  if (it.tier !== 'common') {
    fxAdd(`<div class="ifx-ring ${it.tier === 'legend' ? '' : 'r2'}"></div>`, 1000);
    setTimeout(() => playSound('special'), 120);
  }
  if (it.tier === 'legend') {
    shakeGame('m');
    const colors = ['#ffd479', '#e06a5a', '#fff6e0'];
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const d = 110 + Math.random() * 80;
      fxAdd(`<div class="ifx-spark" style="--dx:${(Math.cos(a)*d).toFixed(1)}px;--dy:${(Math.sin(a)*d).toFixed(1)}px;background:${colors[i%3]}"></div>`, 1100);
    }
  }
  setTimeout(() => { box.style.display = 'none'; }, it.tier === 'legend' ? 2100 : 1400);
}

// ── 아이템 사용 연출 ──────────────────────────────────────
// 티어가 높을수록 세게, 아이템 성격에 맞는 전용 연출을 얹는다.
// 모든 요소는 애니메이션이 끝나면 제거해 잔여물이 남지 않게 한다.
let _itemFxEl = null;
function itemFxLayer() {
  if (!_itemFxEl || !_itemFxEl.isConnected) {
    _itemFxEl = document.createElement('div');
    _itemFxEl.id = 'itemFx';
    document.body.appendChild(_itemFxEl);
  }
  return _itemFxEl;
}
function fxAdd(html, ms) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const node = wrap.firstElementChild;
  itemFxLayer().appendChild(node);
  setTimeout(() => node.remove(), ms);
  return node;
}
function shakeGame(level) {
  const g = document.getElementById('game');
  if (!g) return;
  const cls = 'ifx-shake-' + level;
  g.classList.remove('ifx-shake-s', 'ifx-shake-m', 'ifx-shake-l');
  void g.offsetWidth;                                   // 리플로우로 애니메이션 재시작
  g.classList.add(cls);
  setTimeout(() => g.classList.remove(cls), 900);
}

const TIER_SHAKE = { common: 's', rare: 'm', legend: 'l' };
const TIER_MS    = { common: 1100, rare: 1300, legend: 1700 };

function playItemFx(u) {
  const tier = (ITEM_INFO[u.itemId] || {}).tier || 'common';
  const mine = !!u.byMe;

  // 1) 화면 플래시 + 충격파 링 (티어가 높을수록 여러 겹)
  fxAdd(`<div class="ifx-flash ${tier}"></div>`, 900);
  const rings = tier === 'legend' ? 3 : tier === 'rare' ? 2 : 1;
  for (let i = 0; i < rings; i++) {
    fxAdd(`<div class="ifx-ring ${i ? 'r' + (i + 1) : ''} ${mine ? '' : 'opp'}"></div>`, 1000);
  }

  // 2) 아이콘이 화면에 꽂히는 임팩트 (상대 것은 붉은 테두리로 구분)
  fxAdd(`<div class="ifx-slam ${tier} ${mine ? 'me' : 'opp'}">
      ${itemArt(u.itemId)}
      <div class="ifx-name">${mine ? '' : '상대 '}${esc(u.name)}</div>
      <div class="ifx-msg">${esc(u.msg || '')}</div>
    </div>`, TIER_MS[tier]);

  // 3) 전설은 파편까지 흩뿌린다
  if (tier === 'legend') {
    const colors = ['#ffd479', '#e06a5a', '#fff6e0', '#b98fe0'];
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const d = 130 + Math.random() * 110;
      fxAdd(`<div class="ifx-spark" style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;background:${colors[i % colors.length]};animation-delay:${(i % 5) * 0.03}s"></div>`, 1100);
    }
  }

  shakeGame(TIER_SHAKE[tier]);

  // 4) 아이템별 성격 연출
  switch (u.itemId) {
    case 'smoke':
      fxAdd('<div class="ifx-smoke"></div>', 2700);
      break;
    case 'flip': {
      const g = document.getElementById('game');
      if (g) { g.classList.add('ifx-flipboard'); setTimeout(() => g.classList.remove('ifx-flipboard'), 900); }
      break;
    }
    case 'tyrant':
      fxAdd('<div class="ifx-press"></div>', 1100);
      break;
    case 'steal':
      fxAdd('<div class="ifx-snatch"></div>', 1100);
      break;
    case 'hourglass': {
      const t = document.getElementById(mine ? 'oppTimer' : 'myTimer');   // 시간이 깎이는 쪽
      if (t) { t.classList.add('ifx-drain'); setTimeout(() => t.classList.remove('ifx-drain'), 1900); }
      break;
    }
  }

  // 5) 소리 — 티어별로 두껍게 겹친다
  playSound(mine ? 'place' : 'flip');
  if (tier !== 'common') setTimeout(() => playSound('special'), 90);
  if (tier === 'legend') { setTimeout(() => playSound('setwin'), 200); setTimeout(() => playSound('bell'), 340); }
}

// ── 아이템이 실제로 무엇을 바꿨는지 그 자리에서 보여 준다 ──────────────
// 번쩍임과 아이콘만으로는 "뭔가 일어났다" 까지다. 카드가 오갔으면 그 카드가
// 오가는 것이 보여야 무엇을 당했는지 알 수 있다. 아래는 전부 실제 DOM 을
// 잡아 움직인다 — 화면에 없는 것(감춰진 손패 등)은 흉내 내지 않는다.

// 임의의 두 지점 사이로 카드 한 장을 날린다. captureSettleFlight 의 그것과
// 같은 방식(고스트 + transform)이라 무게도 같다.
function flyBetween(fromRect, toRect, cardEl, o = {}) {
  if (!fromRect || !toRect || !fromRect.width || !toRect.width) return 0;
  const dur = o.duration || 520;
  cardEl.classList.add('fly-card');
  cardEl.style.transition = `transform ${dur}ms cubic-bezier(.4,.05,.35,1), opacity ${dur}ms ease`;
  cardEl.style.left = fromRect.left + 'px'; cardEl.style.top = fromRect.top + 'px';
  cardEl.style.width = fromRect.width + 'px'; cardEl.style.height = fromRect.height + 'px';
  if (o.delay) cardEl.style.transitionDelay = o.delay + 'ms';
  document.body.appendChild(cardEl);
  void cardEl.offsetWidth;
  const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
  const dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
  const sc = o.scale === undefined ? Math.max(toRect.width / fromRect.width, .3) : o.scale;
  cardEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${o.spin || 0}deg)`;
  if (o.fade) cardEl.style.opacity = '0';
  const total = dur + (o.delay || 0);
  setTimeout(() => { try { cardEl.remove(); } catch (_) {} }, total + 90);
  return total;
}
const rectOfEl = (sel) => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
const cardRect = (pileSel, card) => card && rectOfEl(`${pileSel} .card[data-id="${card.id}"]`);
// 한 번 반짝이고 마는 강조 — 어디가 바뀌었는지 눈이 따라가게
function pulse(sel, cls = 'fx-pulse', ms = 700) {
  const e = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!e) return;
  e.classList.add(cls);
  setTimeout(() => e.classList.remove(cls), ms);
}
// 자리(프로필) 위에 딱지를 얹는다 — 부적·폭군처럼 '사람' 에게 붙는 효과용
function stampSeat(seatSel, html, ms = 1600) {
  const seat = document.querySelector(seatSel); if (!seat) return;
  const r = seat.getBoundingClientRect(); if (!r.width) return;
  const el = document.createElement('div');
  el.className = 'fx-stamp';
  el.style.left = (r.left + r.width / 2) + 'px';
  el.style.top = (r.top + r.height / 2) + 'px';
  el.innerHTML = html;
  document.body.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (_) {} }, ms);
}

function playItemChangeFx(u) {
  const f = u.fx; if (!f || document.hidden) return;
  const mine = !!u.byMe;
  const myPile = '#myAcq', opPile = '#oppAcq';
  // 내 자리에서 본 '쓴 사람' 더미와 '당한 사람' 더미
  const actorPile = mine ? myPile : opPile, targetPile = mine ? opPile : myPile;

  switch (f.kind) {
    // 🔀 손바꿈 — 버린 카드가 덱으로, 새 카드가 덱에서. 무엇인지는 쓴 사람만 안다.
    case 'swapHand': {
      const deck = rectOfEl('#deckStack');
      const hand = rectOfEl(mine ? '#myHand' : '#oppHand');
      if (!deck || !hand) return;
      const out = makeCard(null); out.classList.add('fx-dim');
      flyBetween(hand, deck, out, { duration: 380, spin: 14, fade: true });
      const inc = makeCard(null);
      flyBetween(deck, hand, inc, { duration: 420, delay: 300, spin: -10 });
      setTimeout(() => pulse(mine ? '#myHand' : '#oppHand', 'fx-handswap', 700), 700);
      break;
    }
    // 🔁 교환권 — 두 더미 사이로 카드 두 장이 엇갈려 날아간다 (양쪽 다 공개된 카드다)
    case 'tradeAcq': {
      const gave = mine ? f.mine : f.theirs;      // 쓴 사람이 내놓은 카드
      const took = mine ? f.theirs : f.mine;
      const a = rectOfEl(actorPile), b = rectOfEl(targetPile);
      if (!a || !b) return;
      if (gave) flyBetween(a, b, makeCard(gave), { duration: 560, spin: 10 });
      if (took) flyBetween(b, a, makeCard(took), { duration: 560, delay: 90, spin: -10 });
      setTimeout(() => { pulse(actorPile, 'fx-pile', 800); pulse(targetPile, 'fx-pile', 800); }, 560);
      break;
    }
    // 🐈 도둑고양이 — 당한 사람 더미에서 카드가 덱으로 끌려간다
    case 'stealAcq': {
      const from = cardRect(targetPile, f.card) || rectOfEl(targetPile);
      const deck = rectOfEl('#deckStack');
      if (!from || !deck) return;
      flyBetween(from, deck, makeCard(f.card), { duration: 600, spin: -22, fade: true });
      pulse(targetPile, 'fx-loss', 900);
      break;
    }
    // 📄 복사기 — 그 카드가 둘로 갈라져 한 장이 더 얹힌다
    case 'copyAcq': {
      const at = cardRect(actorPile, f.card) || rectOfEl(actorPile);
      if (!at) return;
      const ghost = makeCard(f.card);
      const to = { left: at.left + at.width * 0.7, top: at.top - 14, width: at.width, height: at.height };
      flyBetween(at, to, ghost, { duration: 520, scale: 1, spin: 8 });
      setTimeout(() => pulse(actorPile, 'fx-gain', 900), 400);
      break;
    }
    // 🃏 고르기 — 중앙 카드가 갈리는 것이 보인다. 옛 카드는 덱으로, 새 카드가 내려앉는다.
    case 'pickCenter': {
      const slot = rectOfEl('#auctionItems .a-slot .card') || rectOfEl('#auctionItems');
      const deck = rectOfEl('#deckStack');
      if (!slot || !deck) return;
      if (f.oldCard) flyBetween(slot, deck, makeCard(f.oldCard), { duration: 420, spin: 18, fade: true });
      if (f.card) flyBetween(deck, slot, makeCard(f.card), { duration: 480, delay: 340, spin: -8, scale: 1 });
      setTimeout(() => pulse('#auctionItems', 'fx-pile', 800), 820);
      break;
    }
    // 💣 폭탄 — 경매품에 붙는다. 붙었다는 것이 경매품 위에 남아야 한다(fxBanner 가 이어받는다)
    case 'bombLot':
      stampSeat('#auctionMat', '<span class="fx-bomb">💣</span>', 1500);
      pulse('#auctionItems', 'fx-shakeit', 900);
      break;
    // 🧿 부적 — 건 사람 자리에 방패가 걸린다
    case 'wardSeat':
      stampSeat(mine ? '#mySeat' : '#oppSeat', '<span class="fx-shield">🧿</span>', 1500);
      pulse(mine ? '#mySeat' : '#oppSeat', 'fx-ward', 1400);
      break;
    // 👑 폭군 — 진행자 표시가 옮겨 앉는다
    case 'tyrantSeat': {
      const from = rectOfEl(mine ? '#oppSeat' : '#mySeat'), to = rectOfEl(mine ? '#mySeat' : '#oppSeat');
      if (from && to) {
        const crown = document.createElement('div');
        crown.className = 'fx-stamp fx-crown'; crown.textContent = '👑';
        crown.style.left = (from.left + from.width / 2) + 'px';
        crown.style.top = (from.top + from.height / 2) + 'px';
        document.body.appendChild(crown);
        void crown.offsetWidth;
        crown.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px)`;
        setTimeout(() => { try { crown.remove(); } catch (_) {} }, 1100);
      }
      break;
    }
    // 📢 재경매 — 냈던 카드 두 장이 각자 손으로 돌아가고, 그 카드에 금지 딱지가 붙는다
    case 'redoBids': {
      const myCard = mine ? f.p1 : f.p2, opCard = mine ? f.p2 : f.p1;
      const myBidR = rectOfEl('#myBid .card'), opBidR = rectOfEl('#oppBid .card');
      const myHandR = rectOfEl('#myHand'), opHandR = rectOfEl('#oppHand');
      if (myBidR && myHandR) flyBetween(myBidR, myHandR, makeCard(myCard || null), { duration: 520, spin: -12 });
      if (opBidR && opHandR) flyBetween(opBidR, opHandR, makeCard(opCard || null), { duration: 520, delay: 80, spin: 12 });
      setTimeout(() => stampSeat('#auctionMat', '<span class="fx-ban">🚫</span>', 1300), 420);
      break;
    }
    // 🔍 돋보기 — 본 사람 화면에서만 상대 손패가 밝아진다(카드 자체는 renderOppHand 가 연다)
    case 'peekHand':
      if (mine) setTimeout(() => pulse('#oppHand', 'fx-peek', 1400), 260);
      break;
    // 📏 눈금자 — 경매품을 훑는 선이 지나간다
    case 'scanLot':
      pulse('#auctionItems', 'fx-scan', 1100);
      break;
    // 💨 연막 — 가려진 쪽에서만 자욱하다
    case 'smokeLot':
      if (!mine) pulse('#auctionItems', 'fx-smoked', 1600);
      break;
    // 🔄 뒤집개 — 경매품이 통째로 한 바퀴 돈다
    case 'flipBoard':
      pulse('#auctionItems', 'fx-flipit', 900);
      break;
  }
}

socket.on('item_fail', msg => toast('⚠️ ' + esc(msg || '지금은 쓸 수 없어요.')));
socket.on('item_used', u => {
  playItemFx(u);
  // 번쩍임이 지나간 뒤에 '무엇이 바뀌었는지' 를 그 자리에서 보여 준다.
  // 겹쳐 틀면 화면이 시끄러워 정작 카드가 어디로 갔는지가 안 보인다.
  if (!u.blocked) setTimeout(() => { try { playItemChangeFx(u); } catch (_) {} }, 520);
  const tier = (ITEM_INFO[u.itemId] || {}).tier || 'common';
  // 연출이 지나간 뒤 무슨 일이 있었는지 글로 한 번 더 (뭘 당했는지 모르면 억울하다)
  setTimeout(() => toast(`${u.byMe ? '' : '상대가 '}<b>${esc(u.name)}</b> — ${esc(u.msg || '')}`, 2400), TIER_MS[tier] - 300);
  if (u.reveal) showItemReveal(u);
});

// 내가 쓴 아이템의 결과(엿본 카드·뺏은 카드 등)를 잠깐 보여준다
function showItemReveal(u) {
  const r = u.reveal;
  const cardTag = c => `<span style="display:inline-block;padding:2px 7px;margin:0 2px;border-radius:6px;background:rgba(255,212,121,.2);border:1px solid #ffd479;font-weight:800">${c.kind}<small style="opacity:.7"> ${c.grade}</small></span>`;
  let html = '';
  if (r.got && r.gave) html = `얻음 ${cardTag(r.got)} / 넘김 ${cardTag(r.gave)}`;
  else if (r.got) html = `얻음 ${cardTag(r.got)}`;
  else if (r.prize) html = `새 경매품 ${r.prize.map(cardTag).join('')}`;
  if (html) setTimeout(() => toast(html, 2800), 700);
}

// ══════════════════════════════════════════════════════════
//  친구
// ══════════════════════════════════════════════════════════
let _friendData = { friends: [], reqIn: [], reqOut: [] };

function needLogin(what) {
  if (myAccount) return false;
  alert(what + '은(는) 로그인하면 이용할 수 있어요!');
  openAuth('login');
  return true;
}
const authToken = () => localStorage.getItem('ff_auth');

function openFriends() {
  if (needLogin('친구')) return;
  document.getElementById('friendsModal').classList.add('show');
  friendTab('list');
  loadFriends();
}
function closeFriends() { document.getElementById('friendsModal').classList.remove('show'); }

function friendTab(which) {
  for (const t of ['list', 'req', 'find']) {
    document.getElementById('ftab-' + t).classList.toggle('active', t === which);
    document.getElementById('fpane-' + t).style.display = t === which ? '' : 'none';
  }
  // 대화 칸은 탭이 아니다 — 다른 탭으로 가면 접는다
  const talk = document.getElementById('fpane-talk');
  if (talk) talk.style.display = 'none';
  if (which === 'find') setTimeout(() => document.getElementById('friendNickInput').focus(), 60);
}

// ── 친구와 1:1 대화 (친구 탭 안) ─────────────────────────────
// 판 안의 채팅 칸과 같은 통로(/api/dm)를 쓴다. 로비에서도 말을 걸 수 있어야
// 친구 목록이 목록으로만 끝나지 않는다.
let ftalkWith = null;
window.friendTalk = async function (idl, nick) {
  ftalkWith = idl;
  document.getElementById('fpane-list').style.display = 'none';
  document.getElementById('fpane-talk').style.display = 'flex';
  document.getElementById('ftalkNick').textContent = nick || '친구';
  const box = document.getElementById('ftalkMsgs');
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/dm', { token: authToken(), idl });
  if (!r || r.error) { box.innerHTML = `<div class="gc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  gcPaint(box, r.messages, false);
  delete gcUnread[idl]; gcPaintDot();          // 봤으니 안 읽음에서 뺀다
  setTimeout(() => document.getElementById('ftalkInput').focus(), 60);
};
window.friendTalkBack = function () {
  ftalkWith = null;
  document.getElementById('fpane-talk').style.display = 'none';
  document.getElementById('fpane-list').style.display = '';
  renderFriends();                              // 안 읽음 표시를 다시 그린다
};
window.friendTalkSend = async function () {
  const input = document.getElementById('ftalkInput');
  const text = input.value.trim();
  if (!text || !ftalkWith) return;
  input.value = '';
  const r = await apiPost('/api/dm-send', { token: authToken(), idl: ftalkWith, text });
  if (!r || r.error) { toast(esc((r && r.error) || '보내지 못했어요')); input.value = text; return; }
  // 보낸 건 바로 붙인다 — 서버를 한 번 더 다녀오면 느리게 느껴진다
  gcAppendMine(document.getElementById('ftalkMsgs'), text);
};

function loadFriends() {
  const box = document.getElementById('friendListBox');
  if (!cacheGet('friends')) box.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  return showThenRefresh('friends',
    () => apiPost('/api/friends', { token: authToken() }),
    (r) => {
      if (!r || !r.ok) { box.innerHTML = `<div class="soc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
      _friendData = r;
      renderFriends();
      updateSocialBadges();
    });
}

// 친구 한 줄 — 온라인이면 초록 점 + 도전장 버튼
function friendRow(f, kind) {
  const clan = f.clan ? `<span class="soc-clan">[${esc(f.clan.tag)}]</span>` : '';
  const acts = {
    friend: `<button class="soc-btn" onclick="friendTalk('${esc(f.idl)}','${esc(f.nick)}')">대화${
               gcUnread[f.idl] ? ` <b>${gcUnread[f.idl]}</b>` : ''}</button>
             ${f.online && !f.ingame ? `<button class="soc-btn good" onclick="challengeFriendInApp('${esc(f.idl)}')">도전장</button>` : ''}
             ${f.watch ? `<button class="soc-btn" onclick="watchFriend('${esc(f.watch)}',${f.watchQuad ? 'true' : 'false'})">관전</button>` : ''}
             <button class="soc-btn bad" onclick="confirmRemoveFriend('${esc(f.idl)}','${esc(f.nick)}')">삭제</button>`,
    in:     `<button class="soc-btn good" onclick="respondFriend('${esc(f.idl)}',true)">수락</button>
             <button class="soc-btn bad" onclick="respondFriend('${esc(f.idl)}',false)">거절</button>`,
    out:    `<button class="soc-btn bad" onclick="cancelFriend('${esc(f.idl)}')">취소</button>`,
  }[kind];
  return `<div class="soc-item">
    ${kind === 'friend' ? `<span class="soc-dot ${f.ingame ? 'busy' : (f.online ? 'on' : '')}"></span>` : ''}
    <div class="soc-info">
      <div class="soc-nick">${clan}<span class="${ncClass(f.nickColor).trim()}">${nickHTML(f.nick, f.nickColor)}</span></div>
      <div class="soc-meta">Lv.${f.level} · ${rankIco(f.rankIcon)} ${esc(f.rank)} · ${f.rp} RP${
        kind === 'friend' ? (f.ingame ? ' · <b style="color:#ffab5e">게임 중</b>' : (f.online ? ' · 접속 중' : '')) : ''}</div>
    </div>
    <div class="soc-acts">${acts}</div>
  </div>`;
}


// 친구가 하는 판을 보러 간다. 서버가 관전자로 붙여 준다(패는 안 보인다).
window.watchFriend = function (roomId, quad) {
  if (!roomId) return;
  closeFriends();
  // 2인전과 다인전은 엔진이 달라 문도 다르다
  if (quad) socket.emit('g4_spectate', { roomId });
  else socket.emit('spectate', { roomId });
};

function renderFriends() {
  const { friends, reqIn, reqOut } = _friendData;
  const box = document.getElementById('friendListBox');
  box.innerHTML = friends.length
    ? friends.slice().sort((a, b) => {
        // 지금 부를 수 있는 사람이 맨 위 — 접속 중 > 게임 중 > 오프라인
        const rank = (x) => (x.online ? (x.ingame ? 1 : 0) : 2);
        return (rank(a) - rank(b)) || (b.rp - a.rp);
      }).map(f => friendRow(f, 'friend')).join('')
    : '<div class="soc-empty">아직 친구가 없어요.<br>「친구찾기」에서 닉네임으로 추가해보세요!</div>';
  document.getElementById('friendReqIn').innerHTML = reqIn.length
    ? reqIn.map(f => friendRow(f, 'in')).join('') : '<div class="soc-empty">받은 요청이 없어요.</div>';
  document.getElementById('friendReqOut').innerHTML = reqOut.length
    ? reqOut.map(f => friendRow(f, 'out')).join('') : '<div class="soc-empty">보낸 요청이 없어요.</div>';
}

async function submitFriendAdd() {
  const input = document.getElementById('friendNickInput');
  const msg = document.getElementById('friendAddMsg');
  const nick = input.value.trim();
  if (!nick) { msg.textContent = '닉네임을 입력해주세요.'; return; }
  msg.textContent = '요청 중…';
  const r = await apiPost('/api/friend-add', { token: authToken(), nick });
  if (!r.ok) { msg.innerHTML = `⚠️ ${esc(r.error || '실패했어요.')}`; return; }
  input.value = '';
  msg.innerHTML = r.friendIdl
    ? `🎉 <b>${esc(nick)}</b>님과 친구가 되었어요!`   // 상대도 나를 요청한 상태였음
    : `✅ <b>${esc(nick)}</b>님에게 요청을 보냈어요.`;
  cacheDrop('friends'); loadFriends();
}

async function respondFriend(idl, accept) {
  const r = await apiPost(accept ? '/api/friend-accept' : '/api/friend-decline', { token: authToken(), idl });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (accept) toast(`🎉 ${esc(r.nick || '')}님과 친구가 되었어요!`);
  cacheDrop('friends'); loadFriends();
}
async function cancelFriend(idl) {
  await apiPost('/api/friend-cancel', { token: authToken(), idl });
  cacheDrop('friends'); loadFriends();
}
function confirmRemoveFriend(idl, nick) {
  askConfirm({ icon: '👋', title: `${nick}님을 삭제할까요?`, desc: '친구 목록에서 서로 사라져요.', yes: '삭제', no: '취소' },
    async () => { await apiPost('/api/friend-remove', { token: authToken(), idl }); cacheDrop('friends'); loadFriends(); });
}

// 도전장 — 목록에 안 뜨는 방(secret, 비번 없음)을 만들고 방 코드를 친구에게 실시간 전송.
// 방이 실제로 만들어진 뒤(room_created)에 보내야 하므로 대상만 기억해둔다.
// ※ 이름 주의: 카카오 공유용 challengeFriend()가 이 파일 아래쪽에 이미 있다. 겹치면 덮어써진다.
let _pendingChallenge = null;
function challengeFriendInApp(idl) {
  closeFriends();
  _pendingChallenge = idl;
  isVsBot = false;
  toast('방을 만드는 중…', 1200);
  socket.emit('create_room', { vsBot: false, pid: PID, nick: getNick(), name: '친구 대전', secret: true, password: '' });
}

// ══════════════════════════════════════════════════════════
//  클랜
// ══════════════════════════════════════════════════════════
let _clanTab = 'my';

function openClan() {
  if (needLogin('클랜')) return;
  document.getElementById('clanModal').classList.add('show');
  loadClan();
}
function closeClan() { document.getElementById('clanModal').classList.remove('show'); closeChatMenu(); }

function loadClan() {
  const body = document.getElementById('clanBody');
  if (!cacheGet('clan')) body.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  return showThenRefresh('clan',
    () => apiPost('/api/clan', { token: authToken() }), renderClanData);
}
function renderClanData(r) {
  const body = document.getElementById('clanBody');
  if (!r || !r.ok) { body.innerHTML = `<div class="soc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  if (r.clan) renderMyClan(r.clan);
  else renderClanBrowse(r);
  updateSocialBadges();
}

function renderMyClan(c) {
  const memberRow = m => `<div class="soc-item">
    <div class="soc-info">
      <div class="soc-nick">${m.isOwner ? '👑' : m.isVice ? '🛡' : ''}<span class="${ncClass(m.nickColor).trim()}">${nickHTML(m.nick, m.nickColor)}</span>${
        m.isOwner ? '<span class="soc-role owner">클랜장</span>'
        : m.isVice ? '<span class="soc-role vice">부클랜장</span>' : ''}</div>
      <div class="soc-meta">Lv.${m.level} · ${rankIco(m.rankIcon)} ${esc(m.rank)} · ${m.rp} RP${
        m.isOwner || m.isVice ? ' · 코인 +10%' : ' · 코인 +5%'}</div>
    </div>
    ${c.isOwner && !m.isOwner ? `<div class="soc-acts">
      <button class="soc-btn" onclick="clanTransfer('${esc(m.idl)}','${esc(m.nick)}')">위임</button>
      <button class="soc-btn bad" onclick="clanKick('${esc(m.idl)}','${esc(m.nick)}')">추방</button>
    </div>` : ''}
  </div>`;
  const applicantRow = m => `<div class="soc-item">
    <div class="soc-info">
      <div class="soc-nick"><span class="${ncClass(m.nickColor).trim()}">${nickHTML(m.nick, m.nickColor)}</span></div>
      <div class="soc-meta">Lv.${m.level} · ${rankIco(m.rankIcon)} ${esc(m.rank)} · ${m.rp} RP</div>
    </div>
    <div class="soc-acts">
      <button class="soc-btn good" onclick="clanDecide('${esc(m.idl)}',true)">수락</button>
      <button class="soc-btn bad" onclick="clanDecide('${esc(m.idl)}',false)">거절</button>
    </div>
  </div>`;

  document.getElementById('clanBody').innerHTML = `
    <div class="clan-head">
      <div class="clan-name"><span class="clan-tag">${esc(c.tag)}</span>${esc(c.name)}</div>
      <div class="clan-stats">
        <div class="clan-stat"><b>${c.memberCount}/${c.max}</b><span>클랜원</span></div>
        <div class="clan-stat"><b>${c.totalRp}</b><span>총 RP</span></div>
        <div class="clan-stat"><b>${c.totalWins}</b><span>총 승리</span></div>
      </div>
      ${c.notice ? `<div class="clan-notice">📢 ${esc(c.notice)}</div>` : ''}
    </div>
    <div class="soc-tabs">
      <button class="soc-tab ${_clanView === 'chat' ? 'active' : ''}" onclick="clanViewTab('chat')">
        💬 채팅<span class="tl-badge sm" id="clanChatBadge" style="display:none">0</span>
      </button>
      <button class="soc-tab ${_clanView === 'info' ? 'active' : ''}" onclick="clanViewTab('info')">
        클랜원${c.isOwner && c.applicantCount ? `<span class="tl-badge sm">${c.applicantCount}</span>` : ''}
      </button>
      <button class="soc-tab ${_clanView === 'browse' ? 'active' : ''}" onclick="clanViewTab('browse')">
        다른 클랜
      </button>
    </div>
    <div id="clanPaneChat" style="display:${_clanView === 'chat' ? '' : 'none'}">
      <div class="chat-list" id="chatList"><div class="chat-empty">불러오는 중…</div></div>
      <div class="chat-form" style="margin-top:8px">
        <input id="chatInput" class="chat-input" maxlength="100" placeholder="클랜원에게 메시지…"
               autocomplete="off" onkeydown="if(event.key==='Enter')sendClanChat()">
        <button class="chat-send" onclick="sendClanChat()">보내기</button>
      </div>
      <div class="chat-note">클랜원만 볼 수 있어요 · 메시지를 누르면 신고·차단</div>
    </div>
    <div id="clanPaneInfo" style="display:${_clanView === 'info' ? '' : 'none'}">
      ${c.isOwner && c.applicants.length ? `<div class="soc-sec">가입 신청 ${c.applicants.length}건</div>
        <div class="soc-list">${c.applicants.map(applicantRow).join('')}</div>` : ''}
      <div class="soc-sec">클랜원</div>
      <div class="soc-list">${c.members.map(memberRow).join('')}</div>
      <div class="soc-row" style="margin-top:12px">
        ${c.isOwner ? `<button class="soc-btn" style="flex:1" onclick="clanEditNotice()">공지 수정</button>` : ''}
        <button class="soc-btn bad" style="flex:1" onclick="clanLeave(${c.isOwner})">${c.isOwner && c.memberCount > 1 ? '탈퇴(위임)' : '탈퇴'}</button>
      </div>
    </div>
    <!-- 클랜에 들었어도 다른 클랜을 둘러볼 수 있다. 어떤 클랜이 있는지 안 보이면
         우리 클랜이 몇 등인지도, 옮길 곳이 있는지도 알 수 없다. -->
    <div id="clanPaneBrowse" style="display:${_clanView === 'browse' ? '' : 'none'}">
      <div class="soc-empty">불러오는 중…</div>
    </div>`;
  _myClanId = c.id || null;
  if (_clanView === 'chat') loadClanChat();
  if (_clanView === 'browse') loadClanBrowseList(_myClanId);
}

// 다른 클랜 목록 — 이미 클랜에 든 사람에게 보여 준다(가입 신청 버튼은 없다).
async function loadClanBrowseList(myClanId) {
  const pane = document.getElementById('clanPaneBrowse');
  if (!pane) return;
  const paint = (r) => {
    if (document.getElementById('clanPaneBrowse') !== pane) return;   // 그새 다시 그려졌다
    if (!r || !r.ok || !r.clans.length) { pane.innerHTML = '<div class="soc-empty">아직 만들어진 클랜이 없어요.</div>'; return; }
    pane.innerHTML = `<div class="soc-list">${r.clans.map((c, i) => `
      <div class="soc-item">
        <div class="soc-info">
          <div class="soc-nick"><span class="soc-clan">#${i + 1}</span><span class="clan-tag">${esc(c.tag)}</span>${esc(c.name)}${
            c.id === myClanId ? '<span class="soc-role owner">우리 클랜</span>' : ''}</div>
          <div class="soc-meta">${c.memberCount}/${c.max}명 · ${c.totalRp} RP · 클랜장 ${esc(c.ownerNick || '-')}</div>
        </div>
      </div>`).join('')}</div>`;
  };
  const had = cacheGet('clanlist');
  if (had) paint(had);
  paint(await fetchInto('clanlist', () => apiPost('/api/clan-list', { token: authToken() })));
}

// ── 클랜 채팅 ──────────────────────────────────────────────
let _clanView = 'chat';        // 클랜 모달에서 채팅/클랜원 중 무엇을 보고 있나
let _chatUnread = 0;           // 모달이 닫혀 있을 때 쌓인 새 메시지
let _chatMsgs = [];

function clanViewTab(which) {
  _clanView = which;
  const PANES = { chat: 'clanPaneChat', info: 'clanPaneInfo', browse: 'clanPaneBrowse' };
  for (const [k, id] of Object.entries(PANES)) {
    const el = document.getElementById(id);
    if (el) el.style.display = k === which ? '' : 'none';
  }
  // 탭 순서(채팅 · 클랜원 · 다른 클랜)와 같은 순서로 칠한다.
  // 예전엔 두 개뿐이라 "첫 칸이면 채팅" 으로 눌러 뒀는데, 셋이 되면서 어긋났다.
  const order = ['chat', 'info', 'browse'];
  document.querySelectorAll('#clanBody .soc-tabs .soc-tab').forEach((t, i) =>
    t.classList.toggle('active', order[i] === which));
  if (which === 'chat') { loadClanChat(); setTimeout(() => document.getElementById('chatInput')?.focus(), 60); }
  if (which === 'browse') loadClanBrowseList(_myClanId);
}
let _myClanId = null;

const chatOpen = () => document.getElementById('clanModal')?.classList.contains('show') && _clanView === 'chat';

async function loadClanChat() {
  const box = document.getElementById('chatList'); if (!box) return;
  const r = await apiPost('/api/clan-chat', { token: authToken() });
  if (!r.ok) { box.innerHTML = `<div class="chat-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  _chatMsgs = r.messages;
  _chatUnread = 0; updateChatBadge();
  renderChat(true);
}

function chatTime(ts) {
  const d = new Date(ts), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function renderChat(toBottom) {
  const box = document.getElementById('chatList'); if (!box) return;
  if (!_chatMsgs.length) {
    box.innerHTML = '<div class="chat-empty">아직 대화가 없어요.<br>첫 메시지를 남겨보세요!</div>';
    return;
  }
  box.innerHTML = _chatMsgs.map(m => `
    <div class="chat-row ${m.mine ? 'mine' : ''}">
      ${m.mine ? '' : `<div class="chat-who${ncClass(m.nickColor)}">${nickHTML(m.nick || '', m.nickColor)}</div>`}
      <div class="chat-bubble" ${m.mine ? '' : `onclick="chatMenu(event,'${esc(m.id)}','${esc(m.idl)}','${esc(m.nick || '')}')"`}>${esc(m.text)}</div>
      <div class="chat-time">${chatTime(m.at)}</div>
    </div>`).join('');
  if (toBottom !== false) box.scrollTop = box.scrollHeight;
}

async function sendClanChat() {
  const input = document.getElementById('chatInput'); if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const btn = document.querySelector('.chat-send');
  if (btn) btn.disabled = true;                       // 연타 방지
  const r = await apiPost('/api/clan-chat-send', { token: authToken(), text });
  if (btn) btn.disabled = false;
  if (!r.ok) { toast('⚠️ ' + esc(r.error || '보내지 못했어요.')); return; }
  input.value = '';
  _chatMsgs.push({ ...r.msg, mine: true });
  renderChat();
  input.focus();
}

// 남의 메시지를 누르면 신고·차단 메뉴
let _chatMenuEl = null;
function closeChatMenu() { if (_chatMenuEl) { _chatMenuEl.remove(); _chatMenuEl = null; } }
function chatMenu(ev, msgId, idl, nick) {
  ev.stopPropagation();
  closeChatMenu();
  const el = document.createElement('div');
  el.className = 'chat-menu';
  el.innerHTML = `
    <button onclick="reportChat('${esc(msgId)}','${esc(nick)}')">🚩 신고하기</button>
    <button class="bad" onclick="blockChatUser('${esc(idl)}','${esc(nick)}')">🚫 ${esc(nick)} 차단</button>`;
  document.body.appendChild(el);
  const r = ev.currentTarget.getBoundingClientRect();
  el.style.left = Math.min(r.left, innerWidth - el.offsetWidth - 12) + 'px';
  el.style.top = Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 12) + 'px';
  _chatMenuEl = el;
  setTimeout(() => document.addEventListener('click', closeChatMenu, { once: true }), 0);
}
function reportChat(msgId, nick) {
  closeChatMenu();
  askConfirm({ icon: '🚩', title: '이 메시지를 신고할까요?', desc: `${nick}님의 메시지가 운영자에게 전달돼요.`, yes: '신고', no: '취소' },
    async () => {
      const r = await apiPost('/api/chat-report', { token: authToken(), msgId, reason: '부적절한 내용' });
      toast(r.ok ? '🚩 신고했어요. 확인 후 조치할게요.' : '⚠️ ' + esc(r.error || '실패했어요.'));
    });
}
function blockChatUser(idl, nick) {
  closeChatMenu();
  askConfirm({ icon: '🚫', title: `${nick}님을 차단할까요?`, desc: '이 사람의 메시지가 보이지 않게 돼요. 언제든 해제할 수 있어요.', yes: '차단', no: '취소' },
    async () => {
      const r = await apiPost('/api/chat-block', { token: authToken(), idl, on: true });
      if (!r.ok) return toast('⚠️ ' + esc(r.error || '실패했어요.'));
      toast(`🚫 ${esc(nick)}님을 차단했어요.`);
      loadClanChat();
    });
}

function updateChatBadge() {
  const b = document.getElementById('clanChatBadge');
  if (b) { b.textContent = _chatUnread > 99 ? '99+' : _chatUnread; b.style.display = _chatUnread > 0 ? '' : 'none'; }
  try { paintSocialBadges(); } catch (_) {}   // 아래 탭 표시도 같이
}

// 실시간 수신
socket.on('clan_chat', ({ msg }) => {
  if (!msg) return;
  _chatMsgs.push({ ...msg, mine: false });
  if (_chatMsgs.length > 80) _chatMsgs.shift();
  if (chatOpen()) { renderChat(); }
  else { _chatUnread++; updateChatBadge(); playSound('ping'); toast(`💬 <b>${esc(msg.nick || '')}</b> — ${esc(msg.text)}`, 2600); }
});
socket.on('clan_report', ({ nick }) => toast(`🚩 클랜 채팅 신고가 접수됐어요 (${esc(nick || '')})`, 3200));

async function renderClanBrowse(meta) {
  const { cost = 1000, coins = 0, minLevel = 5, myLevel = 1 } = meta || {};
  const body = document.getElementById('clanBody');
  body.innerHTML = `
    <div class="soc-tabs">
      <button class="soc-tab ${_clanTab === 'my' ? 'active' : ''}" onclick="clanSwitch('my')">클랜 찾기</button>
      <button class="soc-tab ${_clanTab === 'new' ? 'active' : ''}" onclick="clanSwitch('new')">클랜 만들기</button>
    </div>
    <div id="clanPane" style="margin-top:10px"><div class="soc-empty">불러오는 중…</div></div>`;
  const pane = document.getElementById('clanPane');

  if (_clanTab === 'new') {
    pane.innerHTML = `
      <p class="auth-hint" style="margin:0 0 9px">클랜을 만들면 클랜장이 됩니다. 클랜원은 최대 30명이에요.</p>
      <div class="soc-row" style="margin-bottom:7px">
        <input id="clanNameInput" class="soc-input" maxlength="12" placeholder="클랜 이름 (2~12자)" autocomplete="off">
      </div>
      <div class="soc-row">
        <input id="clanTagInput" class="soc-input" maxlength="4" placeholder="태그 (영문·숫자 2~4자)" autocomplete="off" style="text-transform:uppercase">
        <button class="btn btn-gold btn-sm" onclick="submitClanCreate()"
                ${(myLevel < minLevel || coins < cost) ? 'disabled style="opacity:.5"' : ''}>만들기</button>
      </div>
      <div class="clan-cost">
        레벨 ${minLevel} 이상 · 창설 비용 🪙${cost}<br>
        <span style="opacity:.8">현재 Lv.${myLevel} · 보유 🪙${coins}</span>
        ${myLevel < minLevel ? `<div style="color:#e08a8a;margin-top:5px">레벨 ${minLevel}이 되면 만들 수 있어요</div>`
          : coins < cost ? `<div style="color:#e08a8a;margin-top:5px">코인이 ${cost - coins} 모자라요</div>` : ''}
      </div>
      <p class="auth-hint" id="clanCreateMsg" style="margin:8px 0 0"></p>`;
    return;
  }

  // 클랜 목록도 담아 둔다 — 클랜에 안 든 사람은 이 창을 열 때마다 두 번 다녀왔다
  const had = cacheGet('clanlist');
  if (had) paintClanList(pane, had);
  const r = had || await fetchInto('clanlist', () => apiPost('/api/clan-list', { token: authToken() }));
  if (had) fetchInto('clanlist', () => apiPost('/api/clan-list', { token: authToken() }))
    .then((fresh) => { if (fresh && fresh.ok && document.getElementById('clanPane') === pane) paintClanList(pane, fresh); });
  paintClanList(pane, r);
}
function paintClanList(pane, r) {
  if (!r.ok || !r.clans.length) {
    pane.innerHTML = '<div class="soc-empty">아직 만들어진 클랜이 없어요.<br>첫 번째 클랜을 만들어보세요!</div>';
    return;
  }
  pane.innerHTML = `<div class="soc-list">${r.clans.map((c, i) => `
    <div class="soc-item">
      <div class="soc-info">
        <div class="soc-nick"><span class="soc-clan">#${i + 1}</span><span class="clan-tag">${esc(c.tag)}</span>${esc(c.name)}</div>
        <div class="soc-meta">${c.memberCount}/${c.max}명 · ${c.totalRp} RP · 클랜장 ${esc(c.ownerNick || '-')}</div>
      </div>
      <div class="soc-acts">${c.applied
        ? `<button class="soc-btn bad" onclick="clanCancelApply('${esc(c.id)}')">신청취소</button>`
        : `<button class="soc-btn good" onclick="clanApply('${esc(c.id)}')">가입신청</button>`}</div>
    </div>`).join('')}</div>`;
}

function clanSwitch(tab) { _clanTab = tab; loadClan(); }

async function submitClanCreate() {
  const name = document.getElementById('clanNameInput').value.trim();
  const tag = document.getElementById('clanTagInput').value.trim().toUpperCase();
  const msg = document.getElementById('clanCreateMsg');
  msg.textContent = '만드는 중…';
  const r = await apiPost('/api/clan-create', { token: authToken(), name, tag });
  if (!r.ok) { msg.innerHTML = `⚠️ ${esc(r.error || '실패했어요.')}`; return; }
  toast(`🛡️ [${esc(tag)}] ${esc(name)} 클랜을 만들었어요!`);
  if (myAccount) myAccount.coins = r.coins;
  renderAccount();
  cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
}

async function clanApply(clanId) {
  const r = await apiPost('/api/clan-apply', { token: authToken(), clanId });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  toast(`✅ ${esc(r.clanName || '')} 클랜에 가입을 신청했어요.`);
  cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
}
async function clanCancelApply(clanId) {
  await apiPost('/api/clan-cancel-apply', { token: authToken(), clanId });
  cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
}
async function clanDecide(idl, accept) {
  const r = await apiPost('/api/clan-decide', { token: authToken(), idl, accept });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (r.accepted) toast(`🎉 ${esc(r.nick || '')}님이 클랜에 합류했어요!`);
  cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
}
function clanKick(idl, nick) {
  askConfirm({ icon: '⚠️', title: `${nick}님을 추방할까요?`, desc: '클랜에서 즉시 제외됩니다.', yes: '추방', no: '취소' },
    async () => { const r = await apiPost('/api/clan-kick', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.')); cacheDrop('clan'); cacheDrop('clanlist'); loadClan(); });
}
function clanTransfer(idl, nick) {
  askConfirm({ icon: '👑', title: `${nick}님에게 클랜장을 넘길까요?`, desc: '이후에는 클랜을 관리할 수 없게 됩니다.', yes: '위임', no: '취소' },
    async () => { const r = await apiPost('/api/clan-transfer', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
      toast(`👑 ${esc(nick)}님이 새 클랜장이 되었어요.`); cacheDrop('clan'); cacheDrop('clanlist'); loadClan(); });
}
function clanEditNotice() {
  const cur = (document.querySelector('.clan-notice')?.textContent || '').replace(/^📢\s*/, '');
  const n = prompt('클랜 공지 (최대 60자)', cur);
  if (n === null) return;
  apiPost('/api/clan-notice', { token: authToken(), notice: n }).then(r => {
    if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
    cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
  });
}
function clanLeave(isOwner) {
  askConfirm({ icon: '🚪', title: '클랜에서 탈퇴할까요?',
    desc: isOwner ? '클랜장 자리는 남은 클랜원 중 RP가 가장 높은 사람에게 넘어가요. 혼자라면 클랜이 해체됩니다.' : '언제든 다시 가입 신청할 수 있어요.',
    yes: '탈퇴', no: '취소' },
    async () => {
      const r = await apiPost('/api/clan-leave', { token: authToken() });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
      toast(r.disbanded ? '클랜이 해체되었어요.' : '클랜에서 탈퇴했어요.');
      _clanTab = 'my'; cacheDrop('clan'); cacheDrop('clanlist'); loadClan();
    });
}

// 로비 버튼의 알림 배지 (받은 친구요청 / 클랜 가입신청)
async function updateSocialBadges() {
  if (!myAccount) {
    _badgeBase = { friend: 0, clan: 0 };
    navMark('friends', 0); navMark('clan', 0); navMark('mission', 0);
    return;
  }
  const setBadge = (id, n) => {
    const e = document.getElementById(id); if (!e) return;
    e.textContent = n > 99 ? '99+' : n;
    e.style.display = n > 0 ? '' : 'none';
  };
  // 미리 받아 둔 게 있으면 그걸 쓴다 — 배지 때문에 같은 것을 또 쏠 이유가 없다
  const [f, c] = await Promise.all([
    fetchInto('friends', () => apiPost('/api/friends', { token: authToken() }), 15000),
    fetchInto('clan',    () => apiPost('/api/clan',    { token: authToken() }), 15000),
  ]);
  const nIn = f.ok ? f.reqIn.length : 0;
  const tb = document.getElementById('ftabBadge');
  if (tb) { tb.textContent = nIn; tb.style.display = nIn > 0 ? '' : 'none'; }
  _badgeBase.friend = nIn;
  _badgeBase.clan = (c.ok && c.clan && c.clan.isOwner) ? c.clan.applicantCount : 0;
  paintSocialBadges();
}
// 로비 탭바 배지 — 친구요청·가입신청에 "안 읽은 메시지" 를 얹는다.
// 예전엔 로비를 열 때 한 번만 셌다. 그래서 로비에 앉아 있는 동안 메시지가
// 와도 아무 표시가 없었다 — 판 안의 채팅 버튼에만 점이 켜졌다.
let _badgeBase = { friend: 0, clan: 0 };
function paintSocialBadges() {
  let dm = 0;
  for (const k in gcUnread) if (Object.prototype.hasOwnProperty.call(gcUnread, k)) dm += gcUnread[k] || 0;
  navMark('friends', _badgeBase.friend + dm);
  navMark('clan', _badgeBase.clan + _chatUnread + gcClanUnread);
}

// ── 칭호 (내 정보에서 관리) ──
async function renderMyTitles() {
  const box = document.getElementById('miTitles'); if (!box) return;
  const r = await apiPost('/api/titles', { token: localStorage.getItem('ff_auth') });
  if (r.error || !r.list) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  r.list.forEach(t => {
    const on = r.equipped === t.id;
    const el = document.createElement('div');
    el.className = 'title-row' + (t.owned ? '' : ' locked') + (on ? ' on' : '');
    el.innerHTML = `<span class="tr-ico">${ico(t.icon, 'tr-art')}</span>
      <div class="tr-info"><div class="tr-name" style="color:${t.owned ? t.color : '#6a5a70'}">${esc(t.name)}</div>
      <div class="tr-cond">${esc(t.cond)}${t.owned ? '' : ` (${t.prog}/${t.goal})`}</div></div>
      <span class="tr-state">${on ? '장착 중 ' + ico('✅') : t.owned ? '장착' : ico('🔒')}</span>`;
    if (t.owned) el.onclick = async () => {
      const res = await apiPost('/api/equip-title', { token: localStorage.getItem('ff_auth'), titleId: on ? null : t.id });
      if (!res.error) { myAccount = res.profile; renderAccount(); renderMyTitles(); }
    };
    box.appendChild(el);
  });
}

// ── 최근 전적 ──

// ── 쿠폰 등록 ───────────────────────────────────────────────
// ── 쿠폰 — 작은 창으로 뺐다 ──
// 예전엔 상점 맨 위에 입력칸이 늘 한 줄을 먹고 있었다. 쿠폰은 어쩌다 한 번
// 쓰는 것이라, 물건 칸을 그만큼 밀어내면서까지 늘 펼쳐 둘 이유가 없다.
window.openCoupon = function () {
  const m = document.getElementById('cpnModal'); if (!m) return;
  const msg = document.getElementById('cpnMsg'); if (msg) { msg.textContent = ''; msg.className = 'cpn-msg'; }
  m.classList.add('show');
  // 폰에서 자판이 바로 올라오면 창이 가려진다 — 한 박자 두고 focus
  setTimeout(() => { const i = document.getElementById('cpnInput'); if (i) i.focus(); }, 120);
};
window.closeCoupon = function () {
  const m = document.getElementById('cpnModal'); if (m) m.classList.remove('show');
};
// 파편상점 — 자기 창을 가진다. 예전엔 뽑기 창의 '교환소' 탭이었는데,
// 상점의 파편상점 버튼과 같은 곳이라 같은 것이 두 이름으로 있었다.
window.openShardShop = async function () {
  closeShop();
  document.getElementById('shardModal').classList.add('show');
  if (!_gachaInfo) {
    try { _gachaInfo = await fetchInto('gacha', () => apiPost('/api/gacha', { token: authToken() })); } catch (_) {}
  }
  renderExchange();
};
window.closeShardShop = function () {
  const m = document.getElementById('shardModal'); if (m) m.classList.remove('show');
};

async function submitCoupon() {
  const inp = document.getElementById('cpnInput');
  const msg = document.getElementById('cpnMsg');
  const code = (inp.value || '').trim();
  if (!code) { msg.className = 'cpn-msg err'; msg.textContent = '쿠폰 번호를 입력해주세요.'; return; }
  if (!myAccount) { msg.className = 'cpn-msg err'; msg.textContent = '로그인하면 쿠폰을 쓸 수 있어요.'; return; }
  msg.className = 'cpn-msg'; msg.textContent = '확인 중…';
  const res = await apiPost('/api/coupon', { token: localStorage.getItem('ff_auth'), code });
  if (res.error) { msg.className = 'cpn-msg err'; msg.textContent = '⚠️ ' + res.error; return; }
  // 칭호만 주는 쿠폰은 코인이 0 이다. 그냥 두면 "🪙 0 코인을 받았어요" 가 뜬다.
  msg.className = 'cpn-msg ok';
  const got = [];
  if (res.amount) got.push(`🪙 ${res.amount} 코인`);
  if (res.title) got.push(`${res.title.icon} <b style="color:${res.title.color}">${esc(res.title.name)}</b> 칭호`);
  msg.innerHTML = got.length ? got.join(' + ') + '을(를) 받았어요!' : '쿠폰을 사용했어요!';
  inp.value = '';
  myAccount = res.profile;          // 서버가 계산한 잔액으로 갱신 (클라이언트 값은 신뢰하지 않는다)
  renderAccount();
  shopWallet();
  playSound('setwin');
  // 받은 것을 보여 준 뒤 창을 접는다 — 열어 둔 채로 두면 뭘 더 해야 하나 싶다
  setTimeout(() => closeCoupon(), 1800);
}

// ── 상점 ────────────────────────────────────────────────────
const DYE_NAMES = { red:'빨강', blue:'파랑', green:'초록', orange:'주황', purple:'보라', cyan:'청록', pink:'핑크', lime:'라임', gold:'✨골드✨', rainbow:'🌈무지개🌈' };
let shopItems = null;
async function openShop() {
  if (!myAccount) { alert('상점은 로그인하면 이용할 수 있어요!\n게임에서 이기면 🪙 코인을 모을 수 있어요.'); openAuth('login'); return; }
  document.getElementById('shopMsg').textContent = '';
  document.getElementById('shopModal').classList.add('show');
  if (!shopItems) {
    // 지난번에 받아 둔 표가 있으면 그걸로 먼저 그린다 (물건 목록은 자주 안 바뀐다)
    try { shopItems = JSON.parse(localStorage.getItem('ff_shop') || 'null'); } catch (_) {}
    if (shopItems) renderShop();
    try {
      const got = (await fetch('/api/shop').then((r) => r.json())).items;
      if (got) { shopItems = got; localStorage.setItem('ff_shop', JSON.stringify(got)); }
    } catch (_) { /* 못 받아도 담아 둔 표로 버틴다 */ }
  }
  renderShop();
}
function closeShop() { document.getElementById('shopModal').classList.remove('show'); }
const CBP = { back_night: 'cb-night', back_gold: 'cb-gold', back_obang: 'cb-obang', back_ruby: 'cb-ruby', back_galaxy: 'cb-galaxy',
              back_crystal: 'cb-crystal', back_obsidian: 'cb-obsidian', back_hanji: 'cb-hanji' , back_shard: 'cb-shard', back_hwatu: 'cb-hwatu',
              back_dawn: 'cb-dawn', back_dragon: 'cb-dragon',
              back_tide: 'cb-tide', back_frost: 'cb-frost', back_najeon: 'cb-najeon', back_lantern: 'cb-lantern',
              back_storm: 'cb-storm', back_origami: 'cb-origami', back_jelly: 'cb-jelly',
              back_pixel: 'cb-pixel', back_haetae: 'cb-haetae' };
const TBLP = { tbl_blue: 'tp-blue', tbl_purple: 'tp-purple', tbl_gold: 'tp-gold', tbl_forest: 'tp-forest', tbl_crystal: 'tp-crystal', tbl_obsidian: 'tp-obsidian', tbl_hanji: 'tp-hanji', tbl_shard: 'tp-shard', tbl_hwatu: 'tp-hwatu', tbl_dawn: 'tp-dawn', tbl_dragon: 'tp-dragon' , tbl_tide: 'tp-tide', tbl_frost: 'tp-frost', tbl_najeon: 'tp-najeon', tbl_lantern: 'tp-lantern',
               tbl_storm: 'tp-storm', tbl_jelly: 'tp-jelly', tbl_firework: 'tp-firework' };
const CFP  = { face_neon: 'cfp-neon', face_classic: 'cfp-classic', face_gold: 'cfp-gold', face_crystal: 'cfp-crystal', face_obsidian: 'cfp-obsidian', face_hanji: 'cfp-hanji', face_shard: 'cfp-shard', face_hwatu: 'cfp-hwatu', face_dragon: 'cfp-dragon' , face_tide: 'cfp-tide', face_frost: 'cfp-frost',
               face_origami: 'cfp-origami', face_pixel: 'cfp-pixel', face_storm: 'cfp-storm' };
// 상점 아이콘 = 게임 안 실물 미리보기 (카드백/테이블/카드앞면/명패/이모트/염색)
const shopIcon = it => {
  if (CBP[it.id])  return `<div class="shop-cbprev card back ${CBP[it.id]}"><span class="bf flip">FLIP</span><span class="bf flap">FLAP</span></div>`;
  if (TBLP[it.id]) return `<div class="shop-tblprev ${TBLP[it.id]}"></div>`;
  if (CFP[it.id])  return `<div class="shop-cfprev ${CFP[it.id]}"><i>1</i>6</div>`;
  if (it.type === 'plate' && NP_CLASS[it.id]) return `<span class="shop-npprev ${NP_CLASS[it.id]}">${it.id === 'np_daily' ? ico('🍀', 'np-clover') : ''}닉네임</span>`;
  if (it.type === 'emotes' && EMOTE_PACKS[it.id]) {
    // 미리보기 3종. emoteArt 가 있으면 그린 그림, 없으면 이모지 그대로.
    const prev = EMOTE_PACKS[it.id].slice(0, 3).map((e) => {
      const a = (typeof emoteArt === 'function') && emoteArt(e);
      const cls = 'em-one' + (e === '🫖' ? ' em-teabag' : '');
      return a ? `<span class="${cls}">${a}</span>` : `<span class="${cls}">${e}</span>`;
    }).join('');
    return `<span class="shop-emprev">${prev}</span>`;
  }
  if (it.type === 'avatar') { const a = (typeof avatarArt === 'function') && avatarArt(it.id);
    if (a) return `<span class="shop-avaprev">${a}</span>`; }
  if (it.type === 'stamp')   return `<span class="shop-stampprev ${STAMP_CLS[it.id] || ''}">${stampLabel(it.id)}</span>`;
  if (it.type === 'place')   return `<span class="shop-placeprev ${PLACE_CLS[it.id] || ''}"></span>`;
  if (it.type === 'victory') return `<span class="shop-vfxprev ${VFX_CLS[it.id] || ''}"></span>`;
  if (it.type === 'dye')      return `<div class="shop-dyeprev"></div>`;
  if (it.type === 'dye_rare') return `<div class="shop-dyeprev rare"></div>`;
  return ico(it.icon, 'shop-ico');
};
// 장착 슬롯: 상점 타입 → 프로필 필드
// 상점 진열 순서 — 위에서부터 이 차례로 묶어 보여준다
// 상점과 인벤토리가 같이 쓴다 — 한쪽만 고치면 같은 물건이 서로 다른 칸에 앉는다.
// 여기에 없는 종류는 "그 밖에" 로 떨어진다. 실제로 아바타·승리 연출·도장·놓기
// 연출 넉 줄이 그렇게 한 덩어리로 뭉쳐 있었다.
const SHOP_GROUPS = [
  { name: '꾸미기·기타', types: ['dye', 'dye_rare', 'pipette', 'ticket'] },
  { name: '카드 뒷면', types: ['cardback'] },
  { name: '카드 앞면', types: ['cardface'] },
  { name: '테이블',   types: ['table'] },
  { name: '명패',     types: ['plate'] },
  { name: '아바타',   types: ['avatar'] },
  { name: '이모트',   types: ['emotes'] },
  { name: '승리 연출', types: ['victory'] },
  { name: '낙찰 도장', types: ['stamp'] },
  { name: '카드 놓기 연출', types: ['place'] },
];
// 서버(accounts.js SLOT)와 짝이 맞아야 한다. 한쪽만 고치면 장착이 안 된다.
// 낙찰 도장 — 모양마다 다른 클래스와 글자를 쓴다
const STAMP_CLS = { stamp_win: 'st-win', stamp_seal: 'st-seal', stamp_star: 'st-star', stamp_crown: 'st-crown', stamp_flame: 'st-flame' , stamp_plum: 'st-plum', stamp_ink: 'st-ink', stamp_crane: 'st-crane' };
const STAMP_TEXT = { stamp_win: 'WIN', stamp_seal: '落札', stamp_star: '★', stamp_crown: '♔', stamp_flame: '🔥' , stamp_plum: '梅', stamp_ink: '落', stamp_crane: '鶴' };
const stampLabel = (id) => STAMP_TEXT[id] || 'WIN';
// 카드 놓을 때 파티클 · 승리 연출
const PLACE_CLS = { place_dust: 'pf-dust', place_spark: 'pf-spark', place_ember: 'pf-ember', place_petal: 'pf-petal',
                    place_stamp: 'pf-stamp', place_ripple: 'pf-ripple' };
const VFX_CLS = { vfx_confetti: 'vx-confetti', vfx_coinrain: 'vx-coin', vfx_thunder: 'vx-thunder', vfx_firework: 'vx-firework', vfx_shard: 'vx-shard', vfx_aurora: 'vx-aurora' , vfx_petal: 'vx-petal', vfx_firefly: 'vx-firefly' };

const EQUIP_SLOT = {
  cardback: 'cardBack', plate: 'plate', table: 'table', cardface: 'cardFace',
  victory: 'victoryFx', avatar: 'avatar', stamp: 'winStamp', place: 'placeFx',
};
let shopSelId = null;
// 마일스톤 아이템은 보유/티켓 있을 때만 상점에 노출
function shopVisible() {
  const items = (myAccount && myAccount.items) || {};
  return (shopItems || []).filter(it => {
    if (it.id === 'np_lv50') return !!items.np_lv50;
    if (it.id === 'dye_rare') return (items.dye_rare_ticket || 0) > 0;
    return true;
  });
}
// 등급은 값에서 뽑는다. 물건마다 등급을 따로 적어 두면 새로 넣을 때마다
// 두 군데를 고쳐야 하고, 그러다 한쪽만 고쳐진 채 남는다.
// 정렬용 값. 파편 전용품은 코인 값이 0 이라 그대로 비교하면 공짜처럼 맨 앞에 온다 —
// 파편을 코인으로 환산해 같은 자에 놓는다(shopTier 와 같은 환산).
function shopPrice(it) { return it.shard > 0 ? it.shard * 2.2 : (it.price || 0); }

function shopTier(it) {
  const v = it.shard > 0 ? it.shard * 2.2 : it.price;   // 파편은 코인보다 귀하다
  // 문턱은 실제 값 분포에서 골랐다 — 24 / 25 / 27 로 고르게 갈린다.
  // 700 에서 자르면 전설이 서른다섯 개가 되어 '전설' 이 흔해진다.
  return v >= 1800 ? 3 : v >= 1000 ? 2 : 1;
}

// 지갑 — 코인과 파편. 파편 전용품이 있는데 파편이 안 보이면
// 왜 못 사는지, 얼마나 모아야 하는지 알 길이 없다.
function shopWallet() {
  const c = document.getElementById('shopCoins');
  const d = document.getElementById('shopShards');
  if (c) c.textContent = '🪙 ' + ((myAccount && myAccount.coins) || 0);
  // 파편은 파편상점 버튼이 인다 — 지갑에 또 두면 같은 숫자가 두 번 보인다
  if (d) d.textContent = String((myAccount && myAccount.shards) || 0);
}

function renderShop() {
  shopWallet();
  const list = document.getElementById('shopList');
  const vis = shopVisible();
  if (!vis.length) { list.innerHTML = '<div class="lb-empty">상점을 불러오지 못했어요. 잠시 후 다시 열어주세요.</div>'; return; }
  if (!shopSelId || !vis.some(x => x.id === shopSelId)) shopSelId = vis[0].id;
  list.innerHTML = '';
  // 종류별로 묶어 순서대로 놓는다. 예전엔 카탈로그에 적은 순서 그대로라
  // 카드백과 명패가 뒤섞여 뭘 고르는 화면인지 알기 어려웠다.
  const ordered = [];
  for (const g of SHOP_GROUPS) {
    // 묶음 안에서는 희귀도 순으로 놓는다 (일반 → 희귀 → 전설).
    // 카탈로그에 적은 순서 그대로면 2600짜리 옆에 400짜리가 붙어, 무엇이
    // 귀한 물건인지가 값을 하나하나 읽어야 보였다. 같은 등급끼리는 싼 것부터 —
    // 살 수 있는 것이 먼저 눈에 들어오는 편이 고르기 쉽다.
    const items = vis.filter((x) => g.types.includes(x.type))
      .sort((a, b) => shopTier(a) - shopTier(b) || shopPrice(a) - shopPrice(b) || a.name.localeCompare(b.name));
    if (!items.length) continue;
    ordered.push({ head: g.name, count: items.length });
    // 뽑기는 '꾸미기·기타' 맨 앞에 둔다. 사는 것들 사이에 같이 있어야
    // 상점의 일부로 보인다 — 버튼으로 빼 두면 별개의 것처럼 보였다.
    if (g.types.includes('ticket')) ordered.push({ gacha: true });
    for (const it of items) ordered.push(it);
  }
  // 어느 묶음에도 안 걸린 게 있으면 맨 뒤에 (새 종류를 넣고 분류를 깜빡했을 때)
  const known = new Set(SHOP_GROUPS.flatMap((g) => g.types));
  const rest = vis.filter((x) => !known.has(x.type));
  if (rest.length) { ordered.push({ head: '그 밖에', count: rest.length }); ordered.push(...rest); }

  ordered.forEach(it => {
    if (it.gacha) {
      const tile = document.createElement('div');
      tile.className = 'shop-tile r-3 tile-gacha';
      tile.innerHTML = `<span class="ico">${ico('🎁')}</span><span class="nm">뽑기</span>` +
                       `<span class="pr">코인·파편으로</span>`;
      tile.onclick = () => openGacha();
      list.appendChild(tile);
      return;
    }
    if (it.head) {
      const h = document.createElement('div');
      h.className = 'shop-head';
      h.textContent = it.head;
      list.appendChild(h);
      return;
    }
    const owned = myAccount.items && myAccount.items[it.id];
    const tile = document.createElement('div');
    tile.className = 'shop-tile r-' + shopTier(it) + (shopSelId === it.id ? ' sel' : '')
                   + (owned ? ' have' : '');
    let pr;
    if (it.type === 'dye_rare') pr = `<span class="pr own">확정권 x${(myAccount.items || {}).dye_rare_ticket || 0}</span>`;
    else if (EQUIP_SLOT[it.type] && owned) pr = `<span class="pr own">${myAccount[EQUIP_SLOT[it.type]] === it.id ? '장착 중' : '보유'}</span>`;
    else if (it.type === 'emotes' && owned) pr = `<span class="pr own">보유</span>`;
    // 파편 전용품은 코인 값이 0 이라 그냥 두면 "🪙 0" 으로 떠서 공짜처럼 보인다.
    // 실제로 누르면 거절당하니, 어디서 얼마에 얻는지를 대신 적는다.
    else if (it.shard > 0) pr = `<span class="pr shard">🔷 ${it.shard} 파편</span>`;
    else pr = `<span class="pr">🪙 ${it.price}</span>${it.type === 'ticket' && owned ? `<span class="pr own">x${owned}</span>` : ''}`;
    tile.dataset.id = it.id;
    tile.innerHTML = `<span class="ico">${shopIcon(it)}</span><span class="nm">${it.name}</span>${pr}`;
    tile.onclick = () => shopSelect(it.id);
    list.appendChild(tile);
  });
  shopSelect(shopSelId, true);
}
// 타일 선택 → 상단 상세 패널 갱신
function shopSelect(id, keep) {
  shopSelId = id;
  if (!keep) renderShopTiles();
  const it = (shopItems || []).find(x => x.id === id); if (!it) return;
  const owned = myAccount.items && myAccount.items[it.id];
  document.getElementById('ssIco').innerHTML = shopIcon(it);
  document.getElementById('ssName').textContent = it.name;
  document.getElementById('ssDesc').textContent = it.desc;
  const btn = document.getElementById('ssBtn');
  btn.style.display = '';
  btn.disabled = false; btn.className = 'shop-buy';
  if (it.type === 'dye_rare') {
    const n = (myAccount.items || {}).dye_rare_ticket || 0;
    btn.textContent = `사용하기 (확정권 x${n})`;
    btn.onclick = () => buyShopItem(it.id);
  } else if (EQUIP_SLOT[it.type] && owned) {
    const on = myAccount[EQUIP_SLOT[it.type]] === it.id;
    btn.textContent = on ? '장착 해제' : '장착하기';
    btn.onclick = () => equipBack(it.id, on, it.type);
  } else if (it.type === 'emotes' && owned) {
    btn.textContent = '보유 중 ✓'; btn.disabled = true; btn.className = 'shop-buy owned';
  } else if (it.shard > 0) {
    // 파편 전용 — 여기서 코인으로 사는 게 아니라 교환소로 보낸다.
    // 그냥 두면 "구매 🪙 0" 이 떠서 눌렀다가 거절당한다.
    btn.textContent = `교환소에서 🔷 ${it.shard} 파편`;
    btn.onclick = () => { closeShop(); openGacha().then(() => gachaTab('exch')); };
  } else {
    btn.textContent = `구매 🪙 ${it.price}`;
    btn.onclick = () => buyShopItem(it.id);
  }
}
function renderShopTiles() {   // 선택 표시만 갱신 (전체 재생성 없이)
  document.querySelectorAll('.shop-tile').forEach(t => t.classList.toggle('sel', t.dataset.id === shopSelId));
}
async function buyShopItem(itemId) {
  const msg = document.getElementById('shopMsg');
  const btn = document.getElementById('ssBtn'); if (btn) btn.disabled = true;   // 연타 방지
  const r = await apiPost('/api/buy', { token: localStorage.getItem('ff_auth'), itemId });
  if (btn) btn.disabled = false;
  if (r.error) { msg.textContent = '⚠️ ' + r.error; return; }
  msg.textContent = '';
  myAccount = r.profile; renderAccount(); refreshEmotes();
  if (r.dye) { renderShop(); dyeRoll(r.dye); }   // 염색약은 뽑기 연출 (앞 연출은 dyeRoll 이 접는다)
  else { renderShop(); msg.textContent = '✅ 구매 완료!'; playSound && playSound('setwin'); }
}
// 염색약 뽑기 연출 — 색이 촤르륵 지나가다 결과에 멈춤
//
// 여러 번 이어 사면 중간중간 끊겼다. 창은 하나뿐인데 살 때마다 새 타이머가
// 붙어서, 앞 판의 "이제 닫아라" 타이머가 다음 판이 돌아가는 도중에 터졌기
// 때문이다. 새로 시작할 때 앞의 타이머를 반드시 걷어낸다.
const DYE_KEYS = ['red','orange','lime','green','cyan','blue','purple','pink','gold','rainbow'];
let dyeSpin = null, dyeHide = null;
function dyeStop() { clearInterval(dyeSpin); clearTimeout(dyeHide); dyeSpin = null; dyeHide = null; }
function dyeRoll(result) {
  dyeStop();
  let ov = document.getElementById('dyeRoll');
  if (!ov) { ov = document.createElement('div'); ov.id = 'dyeRoll'; document.body.appendChild(ov); }
  const rare = result === 'gold' || result === 'rainbow';
  ov.innerHTML = `<div class="dye-box">
      <div class="dye-title">🎨 염색약 개봉!</div>
      <div class="dye-spin"><b id="dyeName" class="nc-red">???</b></div>
      <div class="dye-sub" id="dyeSub">두구두구…</div>
    </div>`;
  ov.classList.add('show');
  const name = document.getElementById('dyeName'), sub = document.getElementById('dyeSub');
  let i = 0, ticks = 26 + Math.floor(Math.random() * 6);
  const spin = dyeSpin = setInterval(() => {
    const k = DYE_KEYS[i % DYE_KEYS.length]; i++;
    name.className = 'nc-' + k; name.textContent = DYE_NAMES[k] || k;
    playSound && playSound('flip');
    if (i >= ticks) {
      clearInterval(spin); dyeSpin = null;
      name.className = 'nc-' + result; name.textContent = DYE_NAMES[result] || result;
      sub.innerHTML = rare ? '🎉 <b style="color:#ffd94a">대박!</b> 희귀 색이에요!' : '닉네임에 바로 적용됐어요!';
      if (rare) { name.classList.add('dye-pop'); playSound && playSound('victory'); }
      else playSound && playSound('setwin');
      dyeHide = setTimeout(() => { ov.classList.remove('show'); dyeStop(); }, rare ? 2600 : 1700);
    }
  }, 70);
  // 눌러서 건너뛰기 — 이어서 살 때는 이게 제일 빠르다
  ov.onclick = () => { dyeStop(); ov.classList.remove('show'); };
}
async function equipBack(itemId, isOn, kind) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId, kind: kind || 'cardback' });
  if (r.error) { document.getElementById('shopMsg').textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderShop(); renderAccount(); applyMySkins();   // 테이블/카드앞면 즉시 반영
}
// 파티 이모트 팩 — 보유 시 피커에 추가
const EMOTE_PACKS = {
  emote_party:  ['🤡','😈','💀','🎉','👑','🍀','💢','🫠'],
  emote_battle: ['⚔️','🛡️','😤','🤯','🥶','🎲','🎯','🏆'],
  emote_animal: ['🐶','🐱','🐷','🐸','🦊','🐻','🐤','🦄'],
  // 도발 팩 — 약을 올리되 선은 넘지 않게. 티백은 위아래로 흔들린다.
  emote_taunt:  ['🫖','👏','🥱','👎','🙄','👋','⌚','🤏'],
  // 이 게임은 이모지를 직접 그린 그림으로 바꿔 쓴다(art.js). 그림이 없는 이모지를
  // 넣으면 기기 글꼴대로 제각각 나와 결이 깨진다 — 그려 둔 것 안에서 고른다.
  emote_night:  ['🌙','🌌','⭐','✨','🌑','🔮','💠','🧊'],
  emote_luck:   ['🍀','🎲','🔮','💎','✨','🎩','🏆','⭐'],
};
// data-ico="🎒" 같은 표식을 직접 그린 아이콘으로 채운다
// ── 카드 딜 연출 ────────────────────────────────────────────────────────────
// 덱에서 한 장씩 날아와 자리에 앉는다. 시작 위치를 덱의 실제 화면 좌표로 잡아야
// "덱에서 나왔다"는 느낌이 나고, 고정 오프셋일 때처럼 뚝뚝 끊겨 보이지 않는다.
// 카드가 이미 최종 위치에 놓인 뒤에 불러야 한다(부채꼴 transform 반영 후).
// 덱에서 카드가 날아와 자리에 앉는 모션.
// offset·step 은 두 사람에게 번갈아 돌리려고 있다 — 화투나 포커처럼 한 장씩
// 오가야 '나눠 주는' 것으로 보인다. 한쪽 여섯 장을 몰아서 뿌리면 그냥 펼쳐지는
// 것처럼 보일 뿐이다. offset=1, step=2 면 1·3·5·7… 박자에 들어간다.
function dealFromDeck(deckEl, cardEls, opts) {
  const o = opts || {};
  const stagger = o.stagger === undefined ? 85 : o.stagger;
  const dur = o.duration === undefined ? 460 : o.duration;
  const offset = o.offset || 0, step = o.step || 1;
  const cards = [...cardEls].filter(Boolean);
  if (!cards.length) return 0;
  let sx = null, sy = null;
  if (deckEl) {
    const d = deckEl.getBoundingClientRect();
    if (d.width) { sx = d.left + d.width / 2; sy = d.top + d.height / 2; }
  }
  cards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width && sx !== null) {
      el.style.setProperty('--dx', Math.round(sx - (r.left + r.width / 2)) + 'px');
      el.style.setProperty('--dy', Math.round(sy - (r.top + r.height / 2)) + 'px');
    }
    el.style.animationDelay = ((offset + i * step) * stagger) + 'ms';
    el.style.animationDuration = dur + 'ms';
    el.classList.add('dealing');
    el.addEventListener('animationend', () => {
      // 끝나면 정리 — 합성 레이어를 계속 붙들고 있으면 이후 렌더가 무거워진다
      el.classList.remove('dealing');
      el.style.animationDelay = ''; el.style.animationDuration = '';
      el.style.removeProperty('--dx'); el.style.removeProperty('--dy');
    }, { once: true });
  });
  return (offset + (cards.length - 1) * step) * stagger + dur;
}

// 딜은 진행자가 돌린다 — 화투·포커와 같이 자기는 맨 나중에 받는다.
// 그래서 '누가 먼저 받는가' 는 이번 판 진행자가 누구냐로 갈린다.
const DEAL_STAGGER = 85;
function dealOrder() {
  const s = state;
  const iDeal = !!(s && s.auctioneer === s.myIndex);   // 내가 진행자면 내가 나중
  return { me: iDeal ? 1 : 0, opp: iDeal ? 0 : 1, step: 2, stagger: DEAL_STAGGER };
}

// ── 하단 탭바 ──────────────────────────────────────────────────────────────
// 미션·상점·친구·클랜을 로비 본문에서 빼내 여기로 모았다. 각 탭은 기존 모달을
// 그대로 연다 — 화면을 새로 만들지 않아 동작이 바뀌지 않는다.
const NAV_ACTIONS = {
  // 홈은 "무조건 홈" 이다. 방을 만들어 놓고 기다리는 중이라면 그 방에서
  // 나가는 것까지가 홈이다 — 예전엔 창만 닫혀서, 홈을 눌렀는데 대기실에
  // 그대로 남아 갇힌 것처럼 보였다.
  home:    () => { closeAllNavModals(); if (document.body.classList.contains('waiting')) cancelWait(true); },
  mission: () => openMissions(),
  shop:    () => openShop(),
  gacha:   () => openGacha(),
  friends: () => openFriends(),
  clan:    () => openClan(),
  rank:    () => openLeaderboard(),
  // 설정은 원래 게임 안에서만 열렸다. 언어를 바꾸려고 판을 시작해야 했다.
  settings: () => { document.body.classList.add('lobby-settings'); toggleSettings(true); },
};
// 홈은 "무조건 홈" 이어야 한다. 탭 창만 닫고 모드 고르는 창이나 설명서가
// 남아 있으면, 홈을 눌렀는데 홈이 아닌 셈이다.
function closeAllNavModals() {
  try { closeModePanels(); } catch (_) {}
  try { rulesClose(); } catch (_) {}
  try { closeMyInfo(); } catch (_) {}
  try { closePlate(); } catch (_) {}
  try { closeGacha(); } catch (_) {}
  try { closeLb(); } catch (_) {}
  try { closeMissions(); } catch (_) {}
  try { closeShop(); } catch (_) {}
  try { closeFriends(); } catch (_) {}
  try { closeClan(); } catch (_) {}
  try { toggleSettings(false); document.body.classList.remove('lobby-settings'); } catch (_) {}
}
// 한 번 덮었다 걷는다. 창이 통째로 갈리는 순간을 가려 주면 같은 전환도
// 툭 끊기지 않고 이어진 동작으로 읽힌다. 덮은 동안은 손가락도 막아
// 두 번 눌려 엉키는 일이 없다.
let veilBusy = false;
function veil(fn) {
  const v = document.getElementById('fadeVeil');
  if (!v) { fn(); return; }
  if (veilBusy) { fn(); return; }            // 이미 넘어가는 중이면 그냥 처리
  veilBusy = true;
  v.classList.add('on');
  setTimeout(() => {
    try { fn(); } finally {
      // 새 화면이 한 번 그려진 뒤에 걷는다 — 걷고 나서 그리면 다시 깜빡인다
      requestAnimationFrame(() => requestAnimationFrame(() => {
        v.classList.remove('on');
        setTimeout(() => { veilBusy = false; }, 90);
      }));
    }
  }, 85);
}
// 탭마다 다른 음. 다섯음 음계(도·레·미·솔·라)라 어느 둘을 눌러도 어울린다 —
// 반음이 섞이면 빨리 훑을 때 귀에 걸린다.
const NAV_NOTES = { home: 523.25, mission: 587.33, shop: 659.25, gacha: 698.46,
                    friends: 783.99, clan: 880, rank: 987.77 };
function playNav(key) {
  NAV_PITCH = NAV_NOTES[key] || 587.33;
  playSound('nav');
}
function navGo(key) {
  const act = Object.prototype.hasOwnProperty.call(NAV_ACTIONS, key) ? NAV_ACTIONS[key] : null;
  if (!act) return;
  playNav(key);
  veil(() => {
    if (key !== 'home') closeAllNavModals();   // 탭끼리 겹쳐 열리지 않게
    act();
    navSync(key);
    navSeen(key);                              // 보고 나면 그 탭의 빨간 표는 끈다
  });
}
// 어떤 탭이 켜져 있는지 표시. 모달을 ESC·닫기로 끄면 다시 '홈'으로 돌아온다.
function navSync(key) {
  document.querySelectorAll('#navBar .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === (key || 'home'));
  });
}
function navRefresh() {
  const open = (id) => { const e = document.getElementById(id); return e && e.classList.contains('show'); };
  const sp = document.getElementById('settingsPanel');
  const setOpen = !!sp && sp.classList.contains('show') && document.body.classList.contains('lobby-settings');
  navSync(open('missionModal') ? 'mission' : open('shopModal') ? 'shop'
        : open('friendsModal') ? 'friends' : open('clanModal') ? 'clan'
        : open('lbModal') ? 'rank'
        : setOpen ? 'settings' : 'home');
}
// 모달은 여러 경로(ESC·바깥 클릭·닫기 버튼)로 닫히므로 상태를 맞춰 줘야 한다.
// 예전엔 0.4초마다 계속 훑었다 — 아무 일이 없어도 초당 2.5번 깨어나 폰이
// 쉬지를 못했다. 창이 열리고 닫히는 건 class 가 바뀌는 일이니, 그걸 지켜본다.
(function watchModals() {
  const obs = new MutationObserver(() => {
    // 한 번의 변화로 여러 번 부르지 않게 한 번만 미뤄 부른다.
    // rAF 는 안 된다 — 탭이 화면에 없으면 아예 안 불려서 탭 표시가 굳는다.
    // (i18n 에서 같은 이유로 이미 한 번 데였다.)
    if (watchModals.q) return;
    watchModals.q = true;
    const run = () => { watchModals.q = false; navRefresh(); };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else Promise.resolve().then(run);
  });
  for (const id of ['missionModal', 'shopModal', 'friendsModal', 'clanModal', 'gachaModal', 'lbModal', 'settingsPanel']) {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  navRefresh();
})();

function paintIcons(root) {
  (root || document).querySelectorAll('[data-ico]').forEach(el => {
    if (el.dataset.done) return;
    const a = (typeof iconArt === 'function') && iconArt(el.dataset.ico);
    if (a) { el.innerHTML = a; el.classList.add('lbl-ico'); el.dataset.done = '1'; }
    else el.textContent = el.dataset.ico;
  });
}
function paintEmoteButtons() {
  document.querySelectorAll('#emotePicker .emo-b').forEach(b => {
    const e = b.dataset.e;
    const art = (typeof emoteArt === 'function') && emoteArt(e);
    b.innerHTML = art || e;
  });
}
function refreshEmotes() {
  const picker = document.getElementById('emotePicker'); if (!picker) return;
  paintEmoteButtons();
  picker.querySelectorAll('.emote-extra').forEach(b => b.remove());
  if (!myAccount || !myAccount.items) return;
  for (const [pack, emojis] of Object.entries(EMOTE_PACKS)) {
    if (!myAccount.items[pack]) continue;
    emojis.forEach(e => {
      // 기본 이모트와 같은 클래스를 준다 — 안 그러면 팩 이모트만 원시 이모지로 뜨고,
      // 정작 보낼 때는 그림이 날아가서 "누르기 전 그림과 실제가 다르다" 가 된다.
      const b = document.createElement('button');
      b.className = 'emo-b emote-extra';
      b.dataset.e = e;
      b.onclick = () => sendEmote(e);
      picker.appendChild(b);
    });
  }
  paintEmoteButtons();   // 새로 붙인 팩 버튼까지 그림으로 채운다
}


// ── 뽑기 ───────────────────────────────────────────────────────────────────
// 결과는 전부 서버가 정한다. 여기서는 보여주기만 한다.
// 확률표도 서버가 준 값을 그대로 찍는다 — 화면과 실제가 어긋날 여지를 없앤다.
let _gachaInfo = null;
const TIER_KO = { common: '일반', rare: '고급', epic: '희귀', legend: '전설' };

async function openGacha() {
  if (!myAccount) { openAuth('login'); return; }
  closeAllNavModals();
  document.getElementById('gachaModal').classList.add('show');
  gachaTab('roll');            // 다시 열면 늘 뽑기부터 (교환소가 열린 채 남지 않게)
  gachaWallet();
  document.getElementById('gcStage').innerHTML = '<div class="gc-hint">아래 버튼을 눌러 뽑아보세요</div>';
  if (!_gachaInfo) {
    try {
      const r = await (await fetch('/api/gacha')).json();
      if (r && r.ok) _gachaInfo = r.info;
    } catch (_) {}
  }
  renderGachaInfo();
  gachaWallet();               // 목록을 받은 뒤라야 최저 교환가를 적을 수 있다
}
function closeGacha() {
  skipGachaReveal();                 // 돌던 연출을 끊는다 (닫은 뒤 번쩍이지 않게)
  document.getElementById('gachaModal').classList.remove('show');
}

// 파편상점 창의 지갑
function shardWallet() {
  const c = document.getElementById('sdCoins'), d = document.getElementById('sdShards');
  if (c) c.innerHTML = `${ico('🪙')} ${(myAccount && myAccount.coins) || 0}`;
  if (d) d.textContent = String((myAccount && myAccount.shards) || 0);
}

function gachaWallet() {
  document.getElementById('gcCoins').innerHTML = `${ico('🪙')} ${myAccount ? myAccount.coins || 0 : 0}`;
  document.getElementById('gcShards').textContent = myAccount ? myAccount.shards || 0 : 0;
  const info = _gachaInfo;
  const one = document.getElementById('gcOne'), ten = document.getElementById('gcTen');
  if (info && one && ten) {
    one.textContent = `1회 ${info.cost}`;
    ten.textContent = `10연 ${info.cost10}`;
  }
  const have = myAccount ? myAccount.shards || 0 : 0;
  const ex = document.getElementById('gcExch');
  if (ex && info) {
    const lo = Math.min(...info.rates.map((r) => r.cost));
    ex.innerHTML = `중복은 파편이 됩니다 · <b style="color:#9fe8ff">${lo}</b>파편부터 원하는 것을 확정으로 바꿀 수 있어요 — 위 <b style="color:#ffd94a">교환소</b> 탭 (지금 ${have}개)`;
  }
  const top = document.getElementById('gcExchTop');
  if (top) top.innerHTML = `가진 파편 <b style="color:#9fe8ff">${have}</b>개 · 누르면 그 자리에서 확정으로 바뀝니다`;
}

// ── 교환소 ─────────────────────────────────────────────────
// 중복으로 쌓인 파편을 원하는 것과 바꾼다. 값은 서버가 등급에서 정하고
// 여기서는 서버가 준 목록을 그리기만 한다.
// 뽑기 창은 이제 탭이 없다(교환소는 파편상점으로 나갔다).
// 남아 있을지 모르는 호출이 터지지 않게 자리만 지킨다.
function gachaTab(which) {
  if (which === 'exch') { closeGacha(); openShardShop(); }
}

function renderExchange() {
  const box = document.getElementById('gcShop');
  if (!box) return;
  shardWallet();
  if (!_gachaInfo || !_gachaInfo.pool) { box.innerHTML = '<div class="gc-hint">목록을 불러오는 중…</div>'; return; }
  const have = myAccount ? myAccount.shards || 0 : 0;
  const mine = (myAccount && myAccount.items) || {};
  // 살 수 있는 것 → 파편이 모자란 것 → 이미 가진 것 순. 목표가 눈에 먼저 들어오게.
  // 파편 전용품이 맨 앞. 여기서만 얻을 수 있으니 제일 먼저 보여야 한다.
  const rank = (p) => (mine[p.id] ? 4 : p.only ? 0 : have >= p.cost ? 1 : 2);
  const pool = _gachaInfo.pool.slice().sort((a, b) =>
    rank(a) - rank(b) || b.cost - a.cost || a.name.localeCompare(b.name));

  // 스포이드는 쓰면 없어지는 물건이라 "이미 가진 것" 으로 밀어 두면 안 된다.
  // 담아 둔 색과 남은 개수를 맨 위에 보여 주고, 거기서 바로 되돌린다.
  let html = '';
  if (myAccount && (myAccount.pipettes > 0) && myAccount.dyeSaved) {
    const same = myAccount.nickColor === myAccount.dyeSaved;
    html += `<div class="gc-sect">담아 둔 색</div>`
      + `<div class="pip-row">`
      + `<span class="pip-swatch nc-${esc(myAccount.dyeSaved)}">${esc(DYE_NAMES[myAccount.dyeSaved] || myAccount.dyeSaved)}</span>`
      + `<span class="pip-n">🧪 ${myAccount.pipettes}개</span>`
      + `<button class="soc-btn" ${same ? 'disabled' : ''} onclick="usePipette()">${same ? '지금 그 색' : '이 색으로'}</button>`
      + `</div>`;
  }
  let lastSect = null;
  for (const p of pool) {
    const consumable = p.id === 'dye_pipette';
    const owned = !consumable && !!mine[p.id], poor = !owned && have < p.cost;
    const sect = owned ? '이미 가진 것'
      : p.only ? '파편으로만 얻는 것'
      : poor ? '파편이 더 필요해요' : '지금 바꿀 수 있어요';
    // (스포이드는 소모품이라 사도 '이미 가진 것' 으로 안 내려간다)
    if (sect !== lastSect) { html += `<div class="gc-sect">${sect}</div>`; lastSect = sect; }
    const cls = `gc-buy t-${p.tier}` + (owned ? ' owned' : poor ? ' poor' : '');
    const click = owned || poor ? '' : ` onclick="doExchange('${p.id}')"`;
    html += `<div class="${cls}"${click}>` +
      `<span class="gi-ico">${shopArtFor(p.id, p.icon)}</span>` +
      `<span class="gi-nm">${esc(p.name)}</span>` +
      `<span class="gi-cost">${owned ? '보유' : p.cost + ' 파편'}</span></div>`;
  }
  box.innerHTML = html || '<div class="gc-hint">교환할 수 있는 게 없어요</div>';
  paintIcons(box);
}

// 담아 둔 색으로 되돌린다 (스포이드 한 개 소모)
window.usePipette = async function () {
  if (!myAccount || !myAccount.dyeSaved) return;
  const name = DYE_NAMES[myAccount.dyeSaved] || myAccount.dyeSaved;
  askConfirm({ icon: '🧪', title: `«${name}» 로 되돌릴까요?`,
               desc: `스포이드 한 개를 씁니다 (남은 ${myAccount.pipettes}개)`,
               yes: '되돌리기', no: '취소' }, async () => {
    const r = await apiPost('/api/pipette', { token: authToken() });
    if (!r || r.error) { toast(esc((r && r.error) || '되돌리지 못했어요')); return; }
    myAccount = r.profile || myAccount;
    renderAccount(); renderExchange();
    if (typeof renderShop === 'function') { try { renderShop(); } catch (_) {} }
    toast(`🧪 «${esc(DYE_NAMES[r.dye] || r.dye)}» 로 되돌렸어요`);
    playSound('setwin');
  });
};

let _exchBusy = false;
function doExchange(itemId) {
  if (_exchBusy || !myAccount || !_gachaInfo) return;
  const p = _gachaInfo.pool.find((x) => x.id === itemId);
  if (!p) return;
  const have = myAccount.shards || 0;
  askConfirm({
    icon: '🎁', title: `«${p.name}» 로 바꿀까요?`,
    desc: `파편 ${p.cost}개를 씁니다 (보유 ${have} → ${have - p.cost})`,
    yes: '교환', no: '취소',
  }, async () => {
    if (_exchBusy) return;
    _exchBusy = true;
    try {
      const r = await apiPost('/api/gacha/exchange', { token: authToken(), itemId });
      if (!r || r.error) { toast(esc((r && r.error) || '교환에 실패했어요')); return; }
      myAccount = r.profile || myAccount;
      renderAccount();
      renderExchange();
      if (typeof renderShop === 'function') { try { renderShop(); } catch (_) {} }
      if (r.saved) toast(`🧪 지금 색(${esc(DYE_NAMES[r.saved] || r.saved)})을 담았어요! 언제든 한 번 되돌릴 수 있어요`, 3200);
      else toast(`«${esc(r.name)}» 을 얻었어요!`);
      playSound('setwin');
    } finally { _exchBusy = false; }
  });
}

function renderGachaInfo() {
  const box = document.getElementById('gcInfo'); if (!box || !_gachaInfo) return;
  const i = _gachaInfo;
  box.innerHTML = i.rates.map((r) =>
    `<div class="gi-row"><span>${TIER_KO[r.tier] || r.tier} · ${r.count}종</span>` +
    `<span><b>${(r.rate * 100).toFixed(2)}%</b> · 중복 +${r.shard}파편 · 교환 ${r.cost}파편</span></div>`
  ).join('') +
    `<div class="gi-row" style="margin-top:6px;border-top:1px solid rgba(200,160,0,.2);padding-top:6px">` +
    `<span>천장</span><span><b>${i.pity}회</b> 안에 전설 확정</span></div>` +
    `<div style="margin-top:4px;color:#8a7a80">표시된 확률은 천장까지 반영한 실제 값입니다.</div>`;
}
function toggleGachaInfo() { document.getElementById('gcInfo').classList.toggle('show'); }

// ── 뽑기 연출 ──────────────────────────────────────────────
// 결과를 알기 전의 긴장이 뽑는 맛이다. 그래서 순서를 이렇게 둔다.
//   ① 구슬이 돈다 — 이번 판의 최고 등급 색으로 미리 물든다 ("뭔가 온다")
//   ② 카드가 뒷면으로 깔린다
//   ③ 한 장씩 뒤집힌다 — 등급은 이때 처음 드러나고, 높을수록 크게 터진다
// 아무 데나 누르면 즉시 다 보여 준다. 10연을 매번 끝까지 보게 하면 물린다.
const TIER_RANK = { common: 0, rare: 1, epic: 2, legend: 3 };
const gcWait = (ms) => new Promise((r) => setTimeout(r, ms));

let _skipReveal = false;
function skipGachaReveal(e) {
  // 카드를 누른 건 "그 한 장만 열어 달라" 는 뜻이다. 여기서 전부 넘겨 버리면
  // 한 장 열기가 아무 소용이 없어진다 — 빈 곳을 눌렀을 때만 전부 넘긴다.
  if (e && e.target && e.target.closest && e.target.closest('.gc-item')) return;
  _skipReveal = true;
}
function gachaOpen() { return document.getElementById('gachaModal').classList.contains('show'); }

function gcCardHtml(g) {
  const badge = g.dup
    ? `<span class="gi-dup">+${g.shard} 파편</span>`
    : `<span class="gi-dup" style="color:#7dd87d">NEW</span>`;
  return `<div class="gc-inner">` +
    `<div class="gc-face gc-back"></div>` +
    `<div class="gc-face gc-front"><span class="gi-ico">${shopArtFor(g.id, g.icon)}</span>` +
    `<span class="gi-nm">${esc(g.name)}</span>${badge}</div>` +
    `</div><div class="gc-aura"></div>`;
}

function gcFlash() {
  const f = document.createElement('div');
  f.className = 'gc-flash';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

// 뽑기 연출.
//
// 예전 흐름의 문제 둘:
//   ① 기다리는 구슬이 처음부터 최고 등급 색으로 물들어, 뽑기도 전에 결과를
//      알려 줬다. 기대할 시간이 없다.
//   ② 뒤집는 순서가 서버가 준 순서 그대로였다. 첫 장에 전설이 나오면 남은
//      아홉 장은 소화 경기가 된다.
//
// 그래서 구슬은 밑에서부터 한 단계씩 "승급" 하고(올라갈 때마다 소리·크기),
// 뒤집기는 좋은 것을 뒤로 미룬다. 나오는 물건은 그대로다 — 보여 주는 차례만
// 바꾼다.
const TIER_NAME = { common: '노멀', rare: '레어', epic: '에픽', legend: '전설' };
const TIER_ORDER = ['common', 'rare', 'epic', 'legend'];

function gcQuake(ms) {
  const box = document.querySelector('#gachaModal .lb-box') || document.body;
  box.classList.add('gc-quake');
  setTimeout(() => box.classList.remove('gc-quake'), ms || 500);
}
function gcRay() {
  const r = document.createElement('div');
  r.className = 'gc-ray';
  const st = document.getElementById('gcStage');
  (st || document.body).appendChild(r);
  setTimeout(() => r.remove(), 900);
}

// 구슬이 한 단계씩 올라간다. 최고 등급이 높을수록 계단이 길어져 저절로 뜸이 든다.
async function gcCharge(stage, top) {
  stage.innerHTML =
    '<div class="gc-charge"><div class="gc-orb"></div>' +
    '<div class="gc-charge-t">뽑는 중…</div></div>';
  const orb = stage.querySelector('.gc-orb');
  const label = stage.querySelector('.gc-charge-t');

  for (let step = 0; step <= top; step++) {
    if (_skipReveal || !gachaOpen()) return;
    const name = TIER_ORDER[step];
    orb.classList.remove('hint-rare', 'hint-epic', 'hint-legend');
    if (step >= 1) orb.classList.add('hint-' + name);
    if (step > 0) {
      orb.classList.remove('gc-step'); void orb.offsetWidth;   // 애니메이션 다시 태우기
      orb.classList.add('gc-step');
      playSound(step >= 3 ? 'setwin' : step >= 2 ? 'reveal' : 'ping');
      label.textContent = step >= 3 ? '무언가 온다…' : `${TIER_NAME[name]} 확정!`;
      if (step >= 3) { gcFlash(); gcQuake(600); }
    }
    // 마지막 계단은 길게 끈다 — 여기가 제일 두근거리는 구간이다
    const hold = step === top ? (top >= 3 ? 900 : 520) : 420;
    for (let t = 0, gap = 200; t < hold && !_skipReveal && gachaOpen(); t += gap, gap = Math.max(80, gap - 40)) {
      playSound('tick'); await gcWait(Math.min(gap, hold - t));
    }
  }
}

// 좋은 것을 뒤로. 같은 등급끼리는 원래 순서를 지킨다(안 그러면 매번 뒤죽박죽).
function gcRevealOrder(results) {
  return results
    .map((g, i) => ({ g, i, r: TIER_RANK[g.tier] || 0 }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.g);
}

function gcSummary(results) {
  const cnt = {};
  for (const g of results) cnt[g.tier] = (cnt[g.tier] || 0) + 1;
  const parts = TIER_ORDER.slice().reverse()
    .filter((t) => cnt[t]).map((t) => `<b class="s-${t}">${TIER_NAME[t]} ${cnt[t]}</b>`);
  const shard = results.reduce((n, g) => n + (g.dup ? (g.shard || 0) : 0), 0);
  const nw = results.filter((g) => !g.dup).length;
  return `<div class="gc-sum">${parts.join('<span class="s-dot">·</span>')}` +
    (nw ? `<span class="s-new">NEW ${nw}</span>` : '') +
    (shard ? `<span class="s-shard">🔷 +${shard}</span>` : '') + '</div>';
}

// 한 장 뒤집기. 저절로 뒤집히는 차례에도, 손으로 눌렀을 때도 같은 길을 쓴다 —
// 두 벌로 나누면 소리나 연출이 한쪽에만 붙는다. 이미 뒤집힌 건 아무 일도 안 한다.
function gcFlipOne(el, g, quiet) {
  if (!el || el.classList.contains('flipped')) return false;
  el.classList.add('flipped');
  el.onclick = null;
  el.classList.remove('gc-tap');
  if (quiet || _skipReveal || !gachaOpen()) return true;
  const rank = TIER_RANK[g.tier] || 0;
  if (rank >= 1) el.classList.add('lit', 'pop-' + g.tier);
  if (rank >= 3) { gcFlash(); gcRay(); gcQuake(700); }
  playSound(rank >= 3 ? 'setwin' : rank >= 2 ? 'reveal' : rank >= 1 ? 'ping' : 'flip');
  return true;
}

async function revealGacha(stage, results) {
  const top = results.reduce((m, g) => Math.max(m, TIER_RANK[g.tier] || 0), 0);

  // ① 기다림 — 밑에서부터 한 단계씩 올라온다
  await gcCharge(stage, top);

  // ② 뒷면으로 깔린다 (좋은 것이 뒤에 오도록 순서를 바꿔 둔다)
  const shown = gcRevealOrder(results);
  stage.innerHTML = '';
  const els = shown.map((g, i) => {
    const el = document.createElement('div');
    el.className = 'gc-item t-' + g.tier + (_skipReveal ? '' : ' gc-tap');
    el.style.animationDelay = (_skipReveal ? 0 : i * 55) + 'ms';
    el.innerHTML = gcCardHtml(g);
    // 궁금한 걸 먼저 열어 볼 수 있게. 순서를 기다리는 게 답답하다는 얘기가 있었다.
    el.onclick = () => gcFlipOne(el, g);
    stage.appendChild(el);
    return el;
  });
  if (shown.length > 1 && !_skipReveal) {
    stage.insertAdjacentHTML('beforeend',
      '<div class="gc-skip">카드를 누르면 먼저 열려요 · 빈 곳을 누르면 전부</div>');
  }
  if (!_skipReveal) { playSound('deal'); await gcWait(shown.length * 55 + 260); }

  // ③ 한 장씩 뒤집힌다 — 등급이 높을수록 오래 머문다.
  //    손으로 이미 연 건 건너뛴다(gcFlipOne 이 false 를 준다).
  for (let i = 0; i < els.length; i++) {
    const g = shown[i], el = els[i];
    if (!gcFlipOne(el, g)) continue;
    if (_skipReveal || !gachaOpen()) continue;
    const rank = TIER_RANK[g.tier] || 0;
    await gcWait(rank >= 3 ? 1000 : rank >= 2 ? 420 : 165);
  }
  // 넘기기로 들어왔으면 남은 건 조용히 다 뒤집는다
  for (let i = 0; i < els.length; i++) gcFlipOne(els[i], shown[i], true);
  const skip = stage.querySelector('.gc-skip');
  if (skip) skip.remove();

  // ④ 한 줄 정리 — 열 장을 다 훑지 않아도 뭘 얻었는지 보인다
  if (gachaOpen() && !stage.querySelector('.gc-sum'))
    stage.insertAdjacentHTML('beforeend', gcSummary(results));
}

let _gachaBusy = false;
async function doGacha(count) {
  if (_gachaBusy || !myAccount) return;
  _gachaBusy = true;
  _skipReveal = false;
  const one = document.getElementById('gcOne'), ten = document.getElementById('gcTen');
  one.disabled = ten.disabled = true;
  const stage = document.getElementById('gcStage');
  stage.innerHTML = '<div class="gc-hint">뽑는 중…</div>';
  const modal = document.getElementById('gachaModal');
  modal.addEventListener('pointerdown', skipGachaReveal);
  try {
    const r = await apiPost('/api/gacha/roll', { token: authToken(), count });
    if (!r || r.error) { stage.innerHTML = `<div class="gc-hint">${esc((r && r.error) || '뽑기에 실패했어요')}</div>`; return; }
    myAccount = r.profile || myAccount;
    renderAccount(); gachaWallet();
    await revealGacha(stage, r.results);
  } finally {
    modal.removeEventListener('pointerdown', skipGachaReveal);
    _gachaBusy = false;
    one.disabled = ten.disabled = false;
  }
}

// 뽑기 결과에 보여줄 그림 — 상점 미리보기와 같은 걸 쓴다
function shopArtFor(id, icon) {
  const it = (shopItems || []).find((x) => x.id === id);
  if (it) { try { return shopIcon(it); } catch (_) {} }
  return ico(icon || '🎁');
}

// ── 로비 다이얼로그 ─────────────────────────────────────────
function openCreate() {
  closeModePanels();
  const el = document.getElementById('roomNameInput');
  // 기본 이름을 채워 둔다 — 안 고치면 이대로 간다. 빈칸이면 뭘 적어야 하나 망설이게 된다.
  el.value = `${(typeof getNick === 'function' ? getNick() : '나')}의 방`;
  document.getElementById('createModal').classList.add('show');
  el.focus(); el.select();
}
function closeCreate() { document.getElementById('createModal').classList.remove('show'); }
function openCode()   { closeModePanels(); document.getElementById('codeModal').classList.add('show'); document.getElementById('roomInput').focus(); }
function closeCode()  { document.getElementById('codeModal').classList.remove('show'); }

// ── 공개/비밀 방 토글 ───────────────────────────────────────
let roomSecret = false;
document.getElementById('visRow').addEventListener('click', e => {
  const b = e.target.closest('.vis-btn'); if (!b) return;
  document.querySelectorAll('.vis-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  roomSecret = b.dataset.vis === 'secret';
  document.getElementById('roomPwInput').style.display = roomSecret ? '' : 'none';
});

// ── 방 목록 ─────────────────────────────────────────────────
let gameNicks = null, gameProfiles = null;
let lastSig = {};   // 섹션별 변경 감지(불필요한 DOM 재생성 방지 → 렉↓)
// 남이 쓴 글자를 화면에 넣기 전에 막는다.
// textContent → innerHTML 은 & < > 만 바꾸고 따옴표는 그대로 둔다. 그런데
// 이 결과가 onclick="fn('...')" 처럼 속성 안 자바스크립트 문자열로도 들어간다 —
// 닉네임에 작은따옴표가 하나 있으면 그 문자열을 깨고 나올 수 있었다.
// 따옴표와 백슬래시까지 막는다. 글자로 보일 때는 그대로 ' 와 " 로 보인다.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\\/g, '&#92;');
}

// 인게임 프로필 카드 (컴팩트 — 클릭하면 전적 펼침)
function renderGameProfile(elId, p) {
  const wrap = document.getElementById(elId); if (!wrap) return;
  const body = wrap.querySelector('.pc-body'), stats = wrap.querySelector('.pc-stats');
  if (!body) return;
  if (!p) { body.innerHTML = ''; if (stats) stats.innerHTML = ''; return; }
  if (p.bot) {
    const bot = (typeof AI_AVATAR !== 'undefined') ? AI_AVATAR : '🤖';
    body.innerHTML = `<span class="gp-rank gp-art">${bot}</span><span class="gp-nick">AI</span>`;
    if (stats) stats.innerHTML = `컴퓨터`;
  } else if (p.cpuDiff) {
    // TWELVE 의 AI — 누구와 두는지, 어느 급인지가 한눈에 보여야 한다
    const bot = (typeof AI_AVATAR !== 'undefined') ? AI_AVATAR : '🤖';
    body.innerHTML = `<span class="gp-rank gp-art">${bot}</span><span class="gp-nick">${esc(p.nick)}</span>`;
    if (stats) stats.innerHTML = `컴퓨터 · ${esc(p.cpuDiff)}`;
  } else if (p.guest) {
    body.innerHTML = `<span class="gp-rank">👤</span><span class="gp-nick">${esc(p.nick)}</span>`;
    if (stats) stats.innerHTML = `게스트 (기록 없음)`;
  } else {
    body.innerHTML = `<span class="gp-rank gp-art" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</span><span class="gp-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${nickHTML(p.nick, p.nickColor)}</span><span class="gp-lv">Lv.${p.level}</span>`;
    // 닉네임을 누르면 상대 정보 — 전적을 펼치는 것과 따로 논다
    const nk = body.querySelector('.gp-nick');
    if (nk) { nk.style.cursor = 'pointer'; nk.title = '상대 정보';
      nk.onclick = (e) => { e.stopPropagation(); openOppInfo(p); }; }
    if (stats) stats.innerHTML = (p.titleInfo ? titleTag(p.titleInfo) + ' · ' : '') + `<span style="color:${p.rankColor}">${esc(p.rank)}</span> · <b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%`;
  }
}
// ── 상대 정보 ──────────────────────────────────────────────────────────────
// 판에서 상대 닉네임을 누르면 열린다. 프로필은 이미 받아 둔 걸 쓰므로
// 서버를 다시 부르지 않는다.
let _oppShown = null;
function openOppInfo(p) {
  if (!p) return;
  _oppShown = p;
  const body = document.getElementById('oppBody');
  const act = document.getElementById('oppAct');
  if (p.bot) {
    body.innerHTML = `<div class="op-head"><span class="op-ava">${(typeof AI_AVATAR !== 'undefined') ? AI_AVATAR : ''}</span>
      <span class="op-mid"><div class="op-nick">AI</div><div class="op-line">컴퓨터와의 대전이에요</div></span></div>`;
    act.innerHTML = '';
  } else if (p.guest) {
    body.innerHTML = `<div class="op-head"><span class="op-ava">${ico('👤')}</span>
      <span class="op-mid"><div class="op-nick">${esc(p.nick)}</div>
      <div class="op-line">게스트 — 기록이 남지 않아요</div></span></div>`;
    act.innerHTML = '<div class="op-note">게스트에게는 친구 신청을 보낼 수 없어요.</div>';
  } else {
    body.innerHTML = `<div class="op-head">
      <span class="op-ava" style="color:${p.rankColor}">${faceOf(p)}</span>
      <span class="op-mid">
        <div class="op-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${nickHTML(p.nick, p.nickColor)}</div>
        <div class="op-line">Lv.<b>${p.level}</b> · <span style="color:${p.rankColor}">${esc(p.rank)}</span> <b>${p.rp || 0} RP</b></div>
        <div class="op-line"><b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%</div>
        ${p.titleInfo ? `<div class="op-line">${titleTag(p.titleInfo)}</div>` : ''}
      </span></div>`;
    const me = myAccount && myAccount.nick;
    act.innerHTML = !me
      ? '<div class="op-note">로그인하면 친구 신청을 보낼 수 있어요.</div>'
      : me === p.nick
        ? '<div class="op-note">나예요.</div>'
        : `<button class="btn btn-gold" onclick="addOppFriend()">친구 신청</button>`;
  }
  document.getElementById('oppModal').classList.add('show');
}
function closeOppInfo() { document.getElementById('oppModal').classList.remove('show'); }
async function addOppFriend() {
  if (!_oppShown || !_oppShown.nick) return;
  const r = await apiPost('/api/friend-add', { token: authToken(), nick: _oppShown.nick });
  const act = document.getElementById('oppAct');
  if (!r || r.error) { act.innerHTML = `<div class="op-note">${esc((r && r.error) || '보내지 못했어요')}</div>`; return; }
  act.innerHTML = `<div class="op-note">${r.accepted ? '친구가 됐어요!' : '친구 신청을 보냈어요.'}</div>`;
  playSound('setwin');
}

function toggleStats(el) { el.classList.toggle('show-stats'); }
// 바깥 클릭 시 프로필 전적 / 이모트 피커 자동 닫기
document.addEventListener('click', (e) => {
  if (!e.target.closest('.game-pcard')) document.querySelectorAll('.game-pcard.show-stats').forEach(c => c.classList.remove('show-stats'));
  if (!e.target.closest('#emoteWrap')) { const p = document.getElementById('emotePicker'); if (p) p.classList.remove('show'); }
});
function refreshRooms() { socket.emit('enter_lobby'); }
function joinRoomById(id, secret) {
  if (secret) {
    const pw = prompt('🔒 비밀방입니다. 비밀번호를 입력하세요');
    if (pw == null) return;
    socket.emit('join_room', { roomId: id, pid: PID, nick: getNick(), password: pw });
  } else {
    socket.emit('join_room', { roomId: id, pid: PID, nick: getNick() });
  }
}
// 코드 참가 등에서 비밀번호가 필요할 때
socket.on('need_password', ({ roomId, wrong }) => {
  const pw = prompt(wrong ? '❌ 비밀번호가 틀렸어요. 다시 입력하세요' : '🔒 비밀방입니다. 비밀번호를 입력하세요');
  if (pw == null) return;
  socket.emit('join_room', { roomId, pid: PID, nick: getNick(), password: pw });
});
socket.on('rooms', renderRoomList);
socket.on('online', n => { const el = document.getElementById('onlineCount'); if (el) el.textContent = n; });
function renderRoomList(list) {
  const el = document.getElementById('roomList'); if (!el) return;
  el.innerHTML = '';
  if (!list || !list.length) { el.innerHTML = '<div class="rl-empty">열린 방이 없어요. 방을 만들어보세요!</div>'; return; }
  list.forEach(r => {
    const item = document.createElement('div'); item.className = 'rl-item' + (r.live ? ' rl-live' : '');
    if (r.live) {
      // 진행 중인 게임 → 관전
      item.innerHTML = `<div class="rl-info"><div class="rl-name">🔴 ${esc(r.name)}</div><div class="rl-host">턴 ${r.turn}${r.specs ? ` · 👁 ${r.specs}` : ''}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn btn-outline rl-join'; b.textContent = '👁 관전';
      b.onclick = () => socket.emit('spectate', { roomId: r.id });
      item.appendChild(b);
    } else {
      const lock = r.secret ? '<span class="rl-lock">🔒</span>' : '';
      // 모드가 넷이 됐다 — 들어가기 전에 무슨 판인지는 보여야 한다
      const mode = r.mode && r.mode !== 'classic'
        ? `<span class="rl-mode m-${esc(r.mode)}">${esc(MODE_NAME[r.mode] || r.mode)}</span>` : '';
      item.innerHTML = `<div class="rl-info"><div class="rl-name">${lock}${esc(r.name)}${mode}</div><div class="rl-host">👤 <span class="${ncClass(r.hostColor).trim()}">${nickHTML(r.host, r.hostColor)}</span></div></div>`;
      const b = document.createElement('button'); b.className = 'btn btn-gold rl-join'; b.textContent = '참가';
      b.onclick = () => joinRoomById(r.id, r.secret);
      item.appendChild(b);
    }
    el.appendChild(item);
  });
}

// ── 사운드 (Web Audio) ──────────────────────────────────────
const AC = new (window.AudioContext || window.webkitAudioContext)();
// 효과음 마스터 볼륨 (전체적으로 한 단계 낮춤)
const sfxGain = AC.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(AC.destination);
// mp3 원샷 샘플 (카드 내는 소리 등) — 디코드해서 낮은 지연으로 재생
const samples = {};
function loadSample(key, url) {
  fetch(url).then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b))
    .then(buf => { samples[key] = buf; }).catch(() => {});
}
// 효과음도 손짓 뒤에 받는다. 어차피 브라우저는 사람이 건드리기 전엔 소리를
// 안 내주므로, 먼저 받아 봐야 70KB 를 못 쓰고 버리는 셈이다. 첫 카드 소리가
// 나기까지는 한참 남아 있어 늦지 않다.
function loadSamplesOnce() {
  loadSample('cardPlace', '/card-place.mp3?v=1');
  loadSample('chips', '/chips.mp3?v=1');    // 트웰브 — 칩이 쌓이고 오가는 소리
}
if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) {
  for (const t of ['pointerdown', 'keydown', 'touchend'])
    window.addEventListener(t, loadSamplesOnce, { once: true, capture: true });
} else loadSamplesOnce();
function playSample(key, vol = 0.9, rate = 1) {
  if (keepOtherAudio) return true;   // 다른 앱 음악 유지 중 — 소리를 내지 않는다
  const buf = samples[key]; if (!buf) return false;
  try {
    const s = AC.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate + (Math.random() * 0.06 - 0.03);   // 살짝 랜덤 — 반복 시 기계적이지 않게
    const g = AC.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(sfxGain); s.start();
    return true;
  } catch (_) { return false; }
}
function tone(freq, type, vol, dur, delay = 0) {
  if (keepOtherAudio) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur);
}
// 사운드 설정 — BGM·효과음 개별 (기존 ff_sound=off는 둘 다 끈 것으로 마이그레이션)
const _legacyOff = localStorage.getItem('ff_sound') === 'off';
let bgmOff = localStorage.getItem('ff_bgm') != null ? localStorage.getItem('ff_bgm') === 'off' : _legacyOff;
let sfxOff = localStorage.getItem('ff_sfx') != null ? localStorage.getItem('ff_sfx') === 'off' : _legacyOff;
// 재즈 징글용 헬퍼 (BGM과 독립적으로 AC.destination에 바로 출력)
function jbrass(freq, delay, dur, vol, bendTo) {   // 뮤트 트럼펫 (원하면 끝에 피치 벤드)
  if (keepOtherAudio) return;   // 밖의 음악에 양보 중 — tone() 만 지키고 있었다
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
  if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t + dur);
  lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 1;
  const lfo = AC.createOscillator(), lg = AC.createGain();
  lfo.frequency.value = 5.5; lg.gain.value = freq * 0.012; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
}
// 저음 — 화음에 무게를 준다. 트럼펫만 쌓으면 얇게 들려 "이겼다" 가 안 남는다.
function jbass(freq, delay, dur, vol) {
  if (keepOtherAudio) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
  o.type = 'triangle'; o.frequency.setValueAtTime(freq, t);
  lp.type = 'lowpass'; lp.frequency.value = 820;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.025);
  g.gain.setValueAtTime(vol, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
}
// 반짝임 — 종소리 몇 알을 화음 위에 얹어 끝맛을 만든다
function jspark(notes, delay, vol) {
  notes.forEach((f, i) => tone(f, 'sine', vol, 0.85, delay + i * 0.055));
}

function jcym(delay, freq, dur, vol) {   // 심벌 크래시/히트
  if (keepOtherAudio) return;
  const t = AC.currentTime + delay;
  const n = Math.floor(AC.sampleRate * 0.5), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(); s.buffer = b;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.7;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
}
// 메뉴바 소리의 높이. 누른 탭에 따라 바뀐다 — 아래에서 playNav 가 정한다.
let NAV_PITCH = 587.33;
function playSound(n) {
  if (sfxOff) return;
  try { AC.resume(); } catch(_) {}
  switch (n) {
    case 'select': tone(900,'sine',.06,.08); break;
    case 'place':  tone(320,'triangle',.12,.12); tone(240,'triangle',.08,.1,.06); break;   // 원래 카드 놓는 신스음
    case 'flip':   tone(520,'sine',.1,.1); tone(680,'sine',.08,.09,.08); break;
    case 'card':   if (!playSample('cardPlace', .9)) { tone(320,'triangle',.12,.12); } break;   // 실제 카드 mp3 — 경매 방식 선택 시
    case 'reveal': tone(440,'sawtooth',.06,.05); tone(660,'sine',.14,.18,.06); tone(880,'sine',.1,.2,.15); break;
    // 졸개의 배신 — 살금살금 크로매틱 워크 + 날카로운 스탭 ("걸렸어" 느낌)
    case 'special':[110,116.5,123.5,130.8].forEach((f,i)=>tone(f,'triangle',.14,.1,i*.08));
                   jbrass(587.33,.34,.5,.16); jcym(.34,6000,.35,.06); break;
    // 승리 — 블루지 상행 릭 + 밝은 6/9 스탭 (원래 버전)
    // 우승 — 픽업 두 음 → 화음 한 방 → 위로 반짝이며 남는 꼬리.
    // 예전엔 짧은 아르페지오 하나로 끝나 "이겼다" 가 안 남았다.
    case 'victory':
      [392,493.88].forEach((f,i)=>jbrass(f, i*.08, .11, .09));                 // 들이쉬는 두 음
      [523.25,659.25,783.99,1046.5].forEach((f,i)=>jbrass(f, .17, .62, .125-i*.012));  // C·E·G·C
      jbass(130.81, .17, .95, .17);                                            // 낮은 C — 무게
      jcym(.17, 5200, .55, .085);
      jspark([1046.5,1318.5,1568,2093], .46, .05);                             // 위로 반짝
      jbrass(1046.5, .64, .9, .095); break;                                    // 길게 남는 마무리
    // 패배 — 힘이 빠지는 하강. 낮은 음이 깔린 채로 세 음이 내려가고,
    // 마지막 음만 아래로 처지며 끊긴다. 예전엔 트럼펫 셋뿐이라 가벼웠다.
    case 'defeat':
      jbass(98, 0, 1.15, .12);                                                 // 바닥에 깔리는 저음
      [349.23,311.13,261.63].forEach((f,i)=>jbrass(f, i*.21, .33, .105));      // F·E♭·C
      jbrass(233.08, .64, 1.0, .115, 185);                                     // 마지막 — 아래로 처진다
      jcym(.02, 2200, .55, .045);                                              // 먼지 같은 소리
      tone(174.61, 'sine', .055, 1.15, .64); break;
    case 'deal':   tone(280,'sine',.05,.07); break;
    // 아래 메뉴바 — 나무 두드리는 듯한 짧은 소리. 탭마다 음이 반음씩 올라가
    // 왼쪽에서 오른쪽으로 훑으면 음계로 들린다.
    case 'nav':    tone(NAV_PITCH, 'sine', .07, .1); tone(NAV_PITCH*1.5, 'sine', .03, .07, .03);
                   tone(NAV_PITCH/2, 'triangle', .045, .12); break;
    case 'bell':   [0,0.45].forEach(off => [1568,2093].forEach((f,i)=>tone(f,'sine',.2,1.2, off+i*.02))); break;
    case 'tick':   tone(1400,'square',.06,.05); break;
    // 세트 완성 — 재즈 6th로 마무리하는 밝은 상행
    case 'setwin': [523,659,784,880].forEach((f,i)=>jbrass(f,i*.08,.14,.11));
                   jbrass(1047,.32,.5,.14); [523,659,784,880].forEach(f=>tone(f,'sine',.06,.5,.34)); break;
    case 'ping':   tone(1046,'sine',.16,.16); tone(1568,'sine',.12,.22,.09); break;
    case 'emote':  tone(760,'sine',.1,.12); break;
    // 칩 — 실제 카지노 칩 소리. 값을 부를 때는 짧고 가볍게, 은행으로 쓸릴 때는 크게.
    case 'chip':   if (!playSample('chips', .5, 1.35)) { tone(900,'sine',.06,.08); } break;
    case 'chips':  if (!playSample('chips', .85, 0.95)) { tone(880,'triangle',.1,.2); } break;
  }
}

// ── 배경음악 (카지노 재즈 mp3 루프) ──
// Web Audio 그래프로 라우팅 → GainNode로 볼륨 제어 (iOS에서 audio.volume이 안 먹는 문제 해결)
// + 효과음보다 낮게 밸런스
const BGM_VOL = 0.20;
let bgmAudio = null, bgmOn = false, bgmGain = null;
function setBgmVolume(v, ramp = 0.2) {
  if (bgmGain) bgmGain.gain.linearRampToValueAtTime(v, AC.currentTime + ramp);
  else if (bgmAudio) bgmAudio.volume = v;   // Web Audio 연결 실패 시 폴백
}
// 곡이 둘이다 — 로비는 라운지 곡, 판에 들어가면 원래 곡.
// 어느 곡이 돌고 있는지 들고 있어야 "같은 곡이면 그대로 두기" 를 할 수 있다.
// (판을 오갈 때마다 처음부터 다시 틀면 뚝뚝 끊긴다)
const BGM_SRC = { lobby: '/lobby.m4a?v=3', game: '/bgm.m4a?v=3' };
// 음악이 실제로 흐르는지 밖에서 확인할 창구 (테스트·문제 확인용, 화면에는 안 쓴다)
window.__bgm = () => ({ on: bgmOn, track: bgmTrack, off: bgmOff,
  playing: !!(bgmAudio && !bgmAudio.paused && bgmAudio.currentTime > 0),
  t: bgmAudio ? Math.round(bgmAudio.currentTime * 10) / 10 : null,
  ready: bgmAudio ? bgmAudio.readyState : null, preload: bgmAudio ? bgmAudio.preload : null });
let bgmTrack = null;
function startBGM(track = 'game') {
  if (bgmOn && bgmTrack === track) return;      // 같은 곡이 이미 돌고 있다
  if (bgmOn) stopBGM();                          // 다른 곡이면 갈아 끼운다
  // 다른 앱 음악을 듣는 중이면 우리 음악을 아예 안 켠다.
  // 웹에서는 "섞어서 재생" 을 지시할 방법이 없어서, 켜는 순간 상대 음악이 끊긴다.
  if (keepOtherAudio) return;
  // 음악을 끈 사람에게는 아예 만들지 않는다. 예전엔 만들어 두고 볼륨만 0으로
  // 뒀는데, 그러면 안 들을 곡을 2.5MB 받는다(로비 곡). 켜면 그때 시작한다.
  if (bgmOff) return;
  bgmOn = true; bgmTrack = track;
  // AAC(m4a) 한 벌만 쓴다. 지금 쓰는 브라우저는 전부 AAC 를 재생한다.
  bgmAudio = new Audio();
  // preload='none' 이 핵심이다. src 만 걸어 두면 브라우저가 곧바로 받기
  // 시작하는데, 첫 방문은 대개 자동재생이 막혀 "받아 놓고 못 트는" 상태가 된다.
  // 로비 곡 2.5MB 가 그렇게 통째로 낭비됐다. 실제로 play() 가 통할 때 받는다.
  bgmAudio.preload = 'none';
  bgmAudio.src = BGM_SRC[track] || BGM_SRC.game;
  bgmAudio.loop = true;
  bgmAudio.crossOrigin = 'anonymous';
  try {
    AC.resume();
    const src = AC.createMediaElementSource(bgmAudio);
    bgmGain = AC.createGain();
    bgmGain.gain.value = bgmOff ? 0 : BGM_VOL;
    src.connect(bgmGain); bgmGain.connect(AC.destination);
  } catch (e) { bgmAudio.volume = bgmOff ? 0 : BGM_VOL; }   // 폴백: 엘리먼트 볼륨
  const el = bgmAudio;
  let played = false;
  el.addEventListener('playing', () => { played = true; });
  // 한 번 잘 나오던 곡이 우리가 시키지도 않았는데 멈췄다 = 다른 앱이 소리를
  // 가져갔다. 그때만 자리를 내준다. 한 번도 못 나온 것은 그냥 자동재생 차단이라,
  // 여기서 접어 버리면 음악이 영영 안 나온다(그게 "음악이 아예 안 나오던" 이유).
  el.addEventListener('pause', () => {
    if (played && bgmOn && bgmAudio === el && !el.ended && !stoppingBGM) yieldToOtherAudio();
  });

  // 자동재생은 대개 막힌다. 막히면 다음 손짓마다 다시 시도한다 —
  // 한 번 실패하고 포기하면 그 뒤로는 아무리 눌러도 소리가 안 났다.
  const tryPlay = () => el.play().then(() => { armKick(false); }).catch(() => { armKick(true); });
  let kickArmed = false;
  function armKick(on) {
    if (on === kickArmed) return;
    kickArmed = on;
    for (const t of ['pointerdown', 'keydown', 'touchend'])
      on ? document.addEventListener(t, kick, true) : document.removeEventListener(t, kick, true);
  }
  function kick() {
    if (bgmAudio !== el) return armKick(false);      // 이미 다른 곡으로 갈아탔다
    try { AC.resume(); } catch (_) {}
    tryPlay();
  }
  // 아직 아무도 화면을 안 건드렸으면 play() 를 부르지 않는다.
  // preload='none' 을 걸어 둬도 play() 를 부르는 순간 브라우저가 받기 시작하는데,
  // 첫 방문은 대개 자동재생이 막혀 "받아 놓고 못 트는" 상태가 된다 — 로비 곡
  // 2.5MB 가 통째로 버려진다. 손짓을 기다렸다가 그때 부르면 한 바이트도 안 쓴다.
  const ua = navigator.userActivation;
  if (ua && ua.hasBeenActive === false) armKick(true);
  else tryPlay();
}
// 배경음악을 멈춘다. 2인전은 나갈 때 페이지를 통째로 새로고침해서 저절로
// 꺼졌는데, 다인전은 화면만 숨기므로 로비로 돌아가도 계속 흘렀다.
let stoppingBGM = false;
function stopBGM() {
  if (!bgmAudio) { bgmOn = false; return; }
  stoppingBGM = true;
  try { bgmAudio.pause(); bgmAudio.currentTime = 0; } catch (_) {}
  setTimeout(() => { stoppingBGM = false; }, 0);
  try { if (bgmGain) bgmGain.disconnect(); } catch (_) {}
  bgmAudio = null; bgmGain = null; bgmOn = false; bgmTrack = null;
}

// 지금 판 안인가 — 어느 곡을 틀지 정할 때 쓴다
function inGameNow() {
  return document.body.classList.contains('ingame')
      || document.body.classList.contains('quad4');
}
// 로비 음악을 켠다. 자동재생이 막혀 있으면 첫 터치에서 시작된다(startBGM 안에 처리).
function lobbyBGM() { startBGM('lobby'); }

// ── 밖에서 듣던 음악은 그대로 둔다 ────────────────────────────
// 설정 항목이 아니라 기본 동작이다. 켜고 끄는 버튼이 있을 이유가 없다 —
// 밖에서 노래를 틀어 둔 사람은 그걸 계속 듣고 싶은 것이지, 우리 곡을
// 들으려고 온 게 아니다.
//
// 웹은 오디오 세션을 "섞어서" 로 지정할 수 없어서, 우리가 소리를 내는 순간
// 상대 음악이 끊긴다. 대신 브라우저가 주는 신호로 알아챌 수는 있다:
// 다른 앱이 소리를 잡고 있으면 자동재생이 거부되거나, 재생하던 오디오가
// 우리가 시키지도 않았는데 멈춘다. 그때는 우리 음악을 접는다.
// (앱으로 감쌀 때는 네이티브에서 ambient/mixWithOthers 로 진짜로 섞는다)
// 이 화면이 살아 있는 동안만 기억한다. 예전엔 sessionStorage 에 적어 둬서,
// 한 번 잘못 접히면 새로고침을 해도 계속 따라다녔다 — 게임에서 나와 로비로
// 돌아왔을 때 음악이 안 나오던 이유.
let keepOtherAudio = false;
function yieldToOtherAudio() {
  if (keepOtherAudio) return;
  keepOtherAudio = true;
  stopBGM();
  try { AC.suspend(); } catch (_) {}
}

// ── 인게임 설정 패널 (배경음악 / 효과음 / 가이드) ──
let guideOff = localStorage.getItem('ff_guide') === 'off';
// 진동은 기본 켜짐. 되는 기기(안드로이드)에서만 실제로 울린다.
let vibeOff = localStorage.getItem('ff_vibe') === 'off';
const canVibe = () => !!(navigator && navigator.vibrate);
function applySettings() {   // 저장된 상태를 화면·오디오에 반영
  setBgmVolume(bgmOff ? 0 : BGM_VOL);
  // 안내 문구는 모드마다 다른 칸에 뜬다. 2인전 것만 끄면 다른 판에서는
  // 껐는데도 그대로 남아 있다 — 판마다 있는 안내 칸을 다 같이 끈다.
  // 다인전(q-status)과 미니게임(mnStatus)이 빠져 있어, 껐는데도 거기서만
  // 계속 나왔다.
  for (const id of ['statusBar', 'tv-status', 'q-status', 'mnStatus']) {
    const sb = document.getElementById(id); if (sb) sb.style.display = guideOff ? 'none' : '';
  }
  const set = (id, on) => { const t = document.getElementById(id); if (t) t.classList.toggle('on', on); };
  set('togBgm', !bgmOff); set('togSfx', !sfxOff); set('togGuide', !guideOff); set('togVibe', !vibeOff);
  // 진동이 없는 기기(아이폰 사파리 등)에서는 줄 자체를 감춘다 —
  // 눌러도 아무 일이 없는 스위치는 고장으로 보인다.
  const vr = document.getElementById('spVibeRow');
  if (vr) vr.style.display = canVibe() ? '' : 'none';
  const cur = (window.FF && FF.lang()) || 'ko';
  document.querySelectorAll('.sp-segb[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === cur));
  // 알림 — 물어보는 데 시간이 걸려서(서비스워커 준비 대기) 따로 떼어 둔다
  pushState().then((st) => {
    const row = document.getElementById('spPushRow');
    const note = document.getElementById('spPushNote');
    if (!row || !note) return;
    row.style.display = st.can ? '' : 'none';
    // 아이폰에서 사파리 탭으로 들어온 사람에게는 왜 못 켜는지 알려 준다
    note.style.display = st.needHome ? '' : 'none';
    set('togPush', !!st.on);
  }).catch(() => {});
}
// 언어를 바꾸면 이미 그려진 화면을 그 자리에서 다시 칠한다.
// 새로고침을 시키면 진행 중인 판이 끊긴다.
function pickLang(l) {
  if (!window.FF) return;
  if (FF.lang() === l) return;
  FF.setLang(l);
  playSound('select');
  applySettings();
}
function toggleSettings(force) {
  const p = document.getElementById('settingsPanel'); if (!p) return;
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
  if (show) applySettings();
  else {
    document.body.classList.remove('lobby-settings');   // 로비 자리 표시도 같이 뗀다
    if (typeof navRefresh === 'function') navRefresh();  // 탭 표시를 '홈' 으로 되돌린다
  }
}
function toggleBgm() {
  bgmOff = !bgmOff; localStorage.setItem('ff_bgm', bgmOff ? 'off' : 'on');
  // 꺼져 있는 동안은 곡을 아예 안 만들어 두므로(내려받지 않는다),
  // 켤 때 지금 화면에 맞는 곡으로 새로 시작해 준다.
  if (bgmOff) stopBGM();
  else if (!bgmOn) startBGM(inGameNow() ? 'game' : 'lobby');
  setBgmVolume(bgmOff ? 0 : BGM_VOL); applySettings();
}
function toggleSfx() {
  sfxOff = !sfxOff; localStorage.setItem('ff_sfx', sfxOff ? 'off' : 'on');
  applySettings(); if (!sfxOff) playSound('select');   // 켤 때 미리듣기
}
function toggleGuide() {
  guideOff = !guideOff; localStorage.setItem('ff_guide', guideOff ? 'off' : 'on');
  applySettings();
}
// ── 진동 ───────────────────────────────────────────────────────────────────
// 안드로이드(플레이 앱 포함)에서만 된다. 아이폰 사파리에는 이 통로 자체가 없다 —
// 그래서 "안 되는 기기에서는 조용히 아무 일도 안 일어난다" 로 둔다.
// 짧고 드물게. 매 손짓마다 울리면 그 순간부터 성가신 기능이 된다.
const VIBE = {
  tap: 8,                       // 내가 무언가를 놓았다
  pick: 5,                      // 카드를 고르는 중 — 아주 가볍게
  place: [0, 11, 28, 16],       // 카드를 확정해서 놓았다 — 두 번 톡
  turn: [0, 14],                // 내 차례가 왔다
  win: [0, 18, 60, 26, 60, 40], // 이겼다
  lose: [0, 40, 90, 40],        // 졌다
  got: [0, 12, 45, 20],         // 낙찰 — 무언가를 가져왔다
  warn: [0, 10, 60, 10],        // 시간이 얼마 없다
};
// 브라우저는 사람이 한 번이라도 화면을 건드리기 전의 진동을 막고, 막을 때마다
// 콘솔에 오류를 남긴다 — try/catch 로는 안 잡힌다(호출 자체가 거부되는 거라서).
// 진짜 오류를 그 소음에 묻지 않으려면 애초에 부르지 않는 게 맞다. 사람이 손대기
// 전의 진동은 어차피 뜻도 없다.
let userTouched = false;
for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
  window.addEventListener(ev, () => { userTouched = true; }, { once: true, capture: true });
}
function vibe(kind) {
  if (vibeOff || !userTouched) return;
  if (!Object.prototype.hasOwnProperty.call(VIBE, kind)) return;
  const p = VIBE[kind]; if (!p) return;
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {}
}
function toggleVibe() {
  vibeOff = !vibeOff; localStorage.setItem('ff_vibe', vibeOff ? 'off' : 'on');
  applySettings(); if (!vibeOff) vibe('tap');   // 켤 때 한 번 느껴 보라고
}
// 패널 바깥 클릭 시 닫기.
// 로비 탭(설정)도 예외로 둔다 — 안 그러면 누르는 순간 pointerdown 이 먼저 닫고
// 곧이어 click 이 다시 여는 깜빡임이 생긴다.
document.addEventListener('pointerdown', e => {
  const p = document.getElementById('settingsPanel');
  if (!p || !p.classList.contains('show')) return;
  if (e.target.closest('#settingsPanel') || e.target.closest('#settingsBtn')
      || e.target.closest('[data-nav="settings"]')) return;
  toggleSettings(false);
  document.body.classList.remove('lobby-settings');
});
window.addEventListener('DOMContentLoaded', applySettings);   // 저장된 상태 반영
window.addEventListener('DOMContentLoaded', () => { try { paintEmoteButtons(); paintIcons(); } catch (_) {} });   // 기본 이모트·라벨 아이콘

// ── 미니게임 (두 장 승부 · 2~4인) ────────────────────────────
// 판은 전부 서버에 있다. 여기서는 서버가 준 view 를 그리고, 누른 행동만 올린다.
// 코인 계산은 하지 않는다 — 화면이 셈한 금액을 서버가 믿게 두면 그게 곧 구멍이다.
let miniState = null, miniSeats = 2, miniSitting = false, miniPrevPot = 0, miniClock = null;


// 달(판에서 쓰는 돈) — 숫자만 띄우면 판이 얼마나 큰지 눈에 안 들어온다.
// 큰 단위부터 헐어서 무더기로 만든다. 무더기 하나가 요소 하나다(4인 × 여러 단위라
// 한 닢마다 요소를 만들면 금세 수백 개가 되고, 매 상태마다 다시 그린다).
const MOON_UNITS = [500, 100, 50, 10, 1];
function moonPiles(amount) {
  let left = Math.max(0, Math.floor(amount || 0));
  const out = [];
  for (const v of MOON_UNITS) {
    if (left < v) continue;
    const n = Math.floor(left / v);
    left -= n * v;
    out.push({ v, n });
  }
  return out;
}
function moonsEl(amount, cls) {
  const box = document.createElement('div');
  box.className = 'moons' + (cls ? ' ' + cls : '');
  for (const { v, n } of moonPiles(amount)) {
    const c = document.createElement('div');
    c.className = 'moon' + (n > 1 ? ' s' + Math.min(4, n) : '');
    c.dataset.v = v;
    c.textContent = n > 1 ? '×' + n : '';
    c.title = `${v} × ${n}`;
    box.appendChild(c);
  }
  return box;
}

// 족보 사다리 — 이름만 띄우면 세다는 건지 약하다는 건지 알 수 없다.
// 앞자리 합으로 정해지는 8칸 중 몇 번째인지를 칸으로 보여준다.
// 족보 사다리 — 위가 강하다. 서버(sutda.js)의 서열과 같은 순서여야 한다.
//   땡(같은 종류) → 짝(같은 등급) → 끗(종류 합)
const MINI_TIERS = [
  { key: 'ttang2', name: '2땡',  note: '같은 2 두 장',  ex: [[2, 1], [2, 2]] },
  { key: 'ttang3', name: '3땡',  note: '같은 3 두 장',  ex: [[3, 1], [3, 2]] },
  { key: 'ttang4', name: '4땡',  note: '같은 4 두 장',  ex: [[4, 1], [4, 2]] },
  { key: 'ttang6', name: '6땡',  note: '같은 6 두 장',  ex: [[6, 1], [6, 2]] },
  { key: 'jjak',   name: '짝',   note: '등급이 같은 두 장 · 등급이 낮을수록 강함', ex: [[3, 2], [4, 2]] },
  { key: 'g5',     name: '5끗',  note: '2 + 3',  ex: [[2, 1], [3, 2]] },
  { key: 'g6',     name: '6끗',  note: '2 + 4',  ex: [[2, 1], [4, 2]] },
  { key: 'g7',     name: '7끗',  note: '3 + 4',  ex: [[3, 1], [4, 2]] },
  { key: 'g8',     name: '8끗',  note: '2 + 6',  ex: [[2, 1], [6, 2]] },
  { key: 'g9',     name: '9끗',  note: '3 + 6',  ex: [[3, 1], [6, 2]] },
  { key: 'g10',    name: '10끗', note: '4 + 6',  ex: [[4, 1], [6, 2]] },
];
// 지금 내 패가 사다리의 몇 번째 칸인가
function miniRungOf(ev) {
  if (!ev) return -1;
  if (ev.jol) return -1;                                   // 졸개는 자기 칸이 없다
  if (ev.type === 0) return { 2: 0, 3: 1, 4: 2, 6: 3 }[ev.kind];
  if (ev.type === 1) return 4;
  return 5 + (ev.sum - 5);
}


// 나눠주는 모션 — 어느 카드가 "새로 온" 것인지 화면이 스스로 알아야 한다.
// 서버는 상태를 통째로 보내므로, 자리마다 몇 장이었는지 기억해 두고 늘어난 만큼만
// 날려 준다. 판이 새로 서면(장수가 줄면) 기억을 지워 전부 다시 날린다.
let miniSeen = [];
// 내가 눌러서 깐 카드 (판마다 비운다). miniShown 은 뒤집기 연출을 한 번만 주려고 둔다.
let miniPeeked = new Set(), miniShown = new Set(), miniJustFlipped = new Set();
function miniDealtCount(seat, count) {
  const had = miniSeen[seat] || 0;
  if (count < had) {                                    // 새 판 — 전부 새 카드
    miniSeen = [];
    miniPeeked = new Set(); miniShown = new Set(); miniJustFlipped = new Set();
    miniSeen[seat] = count;                             // 기억을 안 남기면 매번 다시 날린다
    return count;
  }
  miniSeen[seat] = count;
  return Math.max(0, count - had);
}

function miniEvalBox(ev, round) {
  if (!ev) {
    return '<div class="mn-ev-hint" style="text-align:center">'
         + (round === 1 ? '아직 한 장 — 두 번째 장을 받아야 족보가 나옵니다.' : '') + '</div>';
  }
  // 왼쪽이 강한 쪽. 졸개는 자기 칸이 아니라 "잡아먹는 칸"(땡 넷)을 칠한다 —
  // 졸개의 세기는 자기 서열이 아니라 누구를 잡느냐로 정해지기 때문이다.
  const my = miniRungOf(ev);
  const rungs = MINI_TIERS.map((_, i) => {
    const cls = ev.jol ? (i <= 3 ? 'snipe' : '') : (i === my ? 'on' : '');
    return `<span class="mn-rung ${cls}"></span>`;
  }).join('');
  const hint = ev.jol
    ? '졸개의 배신 — 땡은 전부 잡습니다. 땡이 아니면 가장 약한 패예요.'
    : `← 강함 · ${MINI_TIERS.length}칸 중 ${my + 1}번째 · 약함 →`;
  return `<div class="mn-ev-top"><span class="mn-ev-name">${esc(ev.name)}</span>`
       + `<span class="mn-ev-sum">종류 합 ${ev.sum} · 등급 합 ${ev.backSum}</span></div>`
       + `<div class="mn-ladder">${rungs}</div>`
       + `<div class="mn-ev-hint">${esc(hint)}</div>`;
}

// 버튼에 붙는 이름과 금액. 금액은 서버가 계산해 보낸 값을 그대로 보여만 준다.
// 규칙은 섯다지만 말은 경매장 말을 쓴다. 삥·하프·쿼터·따당·올인·콜·다이는
// 도박판 말이라 이 게임 분위기와 안 맞고, 처음 보는 사람은 뜻도 모른다.
// 속 이름(ping·half…)은 그대로 두었다 — 규칙 코드까지 갈아엎을 일이 아니다.
const MINI_LABEL = {
  check: ['넘기기', 'out'], ping: ['판 열기', ''], quarter: ['살짝 올림', ''],
  half: ['크게 올림', ''], ttadang: ['두 배 올림', ''], allin: ['전부 걸기', 'big'],
  call: ['맞추기', 'go'], die: ['접기', 'out'],
};
const MINI_ORDER = ['check', 'ping', 'quarter', 'half', 'ttadang', 'call', 'allin', 'die'];
const MINI_ACT_KO = { check: '넘기기', ping: '판 열기', quarter: '살짝 올림',
  half: '크게 올림', ttadang: '두 배 올림', allin: '전부 걸기', call: '맞추기', die: '접기' };

function miniPaint(v) {
  miniState = v;
  tutTickWith(v);            // 실전 튜토리얼
  const box = document.getElementById('mini');
  if (!box.classList.contains('on')) { box.classList.add('on'); box.style.display = 'flex'; }

  // 남들 — 내 자리는 아래에 따로 그린다.
  // 예전엔 "내가 0번" 이라고 못 박아 두었는데, 온라인에서는 1·2·3번에 앉을 수도 있다.
  // 그러면 내 자리가 위에 상대로 그려지고 진짜 상대는 아예 안 그려졌다
  // (상대 이름이 내 닉네임으로 보이고 패가 뒤죽박죽이던 원인).
  const top = document.getElementById('mnSeats');
  top.innerHTML = '';
  for (let i = 0; i < v.n; i++) {
    if (i === v.me) continue;
    const st = v.seats[i];
    const d = document.createElement('div');
    d.className = 'mn-seat2' + (st.turn && !v.over ? ' turn' : '') + (st.alive ? '' : ' dead')
                + (v.over && v.winner === i ? ' win' : '')
                + (v.over && v.winner !== i && st.alive ? ' lost' : '');
    const nm = document.createElement('div');
    nm.className = 'mn-nm';
    nm.innerHTML = `${esc((v.names && v.names[i]) || '상대')}`
                 + (st.first ? '<span class="mn-first">선</span>' : '');
    const cards = document.createElement('div');
    cards.className = 'mn-cards';
    const fresh = miniDealtCount(i, st.count);
    if (st.cards) st.cards.forEach((c) => { const e = makeCard(c); e.classList.add('anim-reveal'); cards.appendChild(e); });
    else for (let k = 0; k < st.count; k++) {
      const e = makeCard(null);
      // 뒷면은 내가 낀 카드백으로 — 내 테이블이니 내 취향이 보이는 게 맞다
      const cb = myAccount && CB_CLASS[myAccount.cardBack];
      if (cb) e.classList.add(cb);
      // 뒤에서부터 fresh 장이 새로 온 카드다. 자리마다 조금씩 늦춰 한 바퀴 돌듯 보이게.
      if (k >= st.count - fresh) {
        e.classList.add('mn-deal');
        e.style.animationDelay = `${(i * 90) + (k - (st.count - fresh)) * 60}ms`;
      }
      cards.appendChild(e);
    }
    const stk = document.createElement('div');
    stk.className = 'mn-stk';
    stk.textContent = st.alive ? `${st.stack} 달` : '접음';
    const chip = document.createElement('div');
    chip.className = 'mn-chip' + (st.roundBet > 0 && st.alive ? ' on' : '');
    chip.textContent = `${st.roundBet} 달`;
    const stack = moonsEl(st.alive ? st.roundBet : 0, 'mini');
    const tag = document.createElement('div');
    tag.className = 'mn-act-tag';
    // 진행 중에는 "방금 뭘 했는지", 끝나면 족보. 남이 뭘 했는지 안 보이면
    // 읽을 것이 아무것도 없는 게임이 된다.
    tag.textContent = st.eval ? st.eval.name
      : (!v.over && st.alive && st.lastAct ? (MINI_ACT_KO[st.lastAct] || '') : '');
    if (!st.eval && st.lastAct) tag.classList.add('act');
    if (v.over && v.winner === i) {
      const w = document.createElement('div'); w.className = 'mn-winbadge'; w.textContent = '이 판 승';
      d.appendChild(w);
    }
    d.append(nm, cards, stk, stack, chip, tag);
    top.appendChild(d);
  }

  document.getElementById('mnPotBig').textContent = `${v.pot} 달`;
  // 판돈이 늘었을 때만 떨어지는 연출을 준다 — 매번 튀면 눈이 아프다
  const potBox = document.getElementById('mnPotMoons');
  const grew = v.pot > (miniPrevPot || 0);
  potBox.innerHTML = '';
  const pile = moonsEl(v.pot, 'big');
  if (grew) for (const c of pile.children) c.classList.add('drop');
  potBox.appendChild(pile);
  miniPrevPot = v.pot;
  document.getElementById('mnRound').textContent =
    v.round === 1 ? '첫 번째 걸기' : '두 번째 걸기';

  const me = v.seats[v.me];
  const plate = document.getElementById('mnMePlate');
  plate.className = 'mn-meplate' + (v.turn === v.me && !v.over ? ' turn' : '');
  plate.innerHTML = `<b>${esc((v.names && v.names[v.me]) || '나')}</b>`
    + (me.first ? '<span class="mn-first">선</span>' : '')
    + `<span class="mn-stk">${me.stack} 달</span>`
    + (me.roundBet > 0 ? `<span class="mn-chip on">${me.roundBet} 달</span>` : '');
  if (me.roundBet > 0) plate.appendChild(moonsEl(me.roundBet, 'mini'));
  const my = document.getElementById('mnMyCards');
  my.innerHTML = '';
  const cards = me.cards || [];
  const myFresh = miniDealtCount(v.me, cards.length);
  cards.forEach((c, k) => {
    // 판이 끝나면 다 까 준다. 그전에는 내가 눌러야 열린다 —
    // 받자마자 다 보이면 "패를 까 보는" 맛이 없다.
    const open = v.over || miniPeeked.has(c.id);
    const e = open ? makeCard(c) : makeCard(null);
    if (!open) {
      const cb = myAccount && CB_CLASS[myAccount.cardBack];
      if (cb) e.classList.add(cb);
      e.classList.add('mn-hidden');
      onTap(e, () => {
        miniPeeked.add(c.id);
        if (miniState) miniPaint(miniState);
        playSound && playSound('flip');
      });
    }
    if (k >= (cards.length - myFresh)) {
      e.classList.add('mn-deal');
      e.style.animationDelay = `${(v.me * 70) + (k - (cards.length - myFresh)) * 70}ms`;
    } else if (open && miniJustFlipped.has(c.id)) {
      e.classList.add('anim-reveal');                 // 방금 뒤집은 것만 뒤집기 연출
    }
    my.appendChild(e);
  });
  // 다음 그리기부터는 뒤집기 연출을 안 한다 (매번 뒤집히면 눈이 아프다)
  miniJustFlipped = new Set([...miniPeeked].filter((id) => !miniShown.has(id)));
  for (const id of miniPeeked) miniShown.add(id);
  // 족보는 내가 두 장을 다 깠을 때만 알려 준다 — 안 깐 패의 족보를 먼저 알려주면
  // 눌러서 까는 뜻이 없다.
  const allOpen = cards.length === 2 && (v.over || cards.every((c) => miniPeeked.has(c.id)));
  const shownEval = allOpen ? v.myEval : null;
  const evBox = document.getElementById('mnEval');
  evBox.className = 'mn-eval' + (shownEval ? '' : ' plain');
  evBox.innerHTML = shownEval ? miniEvalBox(shownEval, v.round)
    : `<div class="mn-ev-hint" style="text-align:center">${cards.length < 2
        ? '아직 한 장 — 두 번째 장을 받아야 족보가 나옵니다.'
        : '카드를 눌러 확인하세요.'}</div>`;

  const st0 = document.getElementById('mnStatus');
  if (v.over) st0.textContent = v.reason === 'fold' ? '남은 사람이 가져갑니다.' : '공개!';
  else if (v.turn === v.me) st0.textContent = `내 차례 · 소지금 ${me.stack}달${v.toCall ? ` · 맞출 돈 ${v.toCall}달` : ''}`;
  else st0.textContent = `${esc((v.names && v.names[v.turn]) || '상대')} 님이 고민하고 있어요…`;

  // 내 차례 제한 시간 — 서버가 넘겨주는 시각까지 센다
  clearInterval(miniClock); miniClock = null;
  if (!v.over && v.turn === v.me && v.deadline) {
    const tick = () => {
      const left = Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000));
      const el = document.getElementById('mnStatus');
      if (!el || !miniState || miniState.turn !== miniState.me) { clearInterval(miniClock); return; }
      el.textContent = `내 차례 · ${left}초 · 소지금 ${me.stack}달`
        + (v.toCall ? ` · 맞출 돈 ${v.toCall}달` : '');
      if (left <= 0) clearInterval(miniClock);
    };
    tick(); miniClock = setInterval(tick, 500);
  }

  const btns = document.getElementById('mnBtns');
  btns.innerHTML = '';
  if (v.over || v.turn !== v.me) return;
  for (const a of MINI_ORDER) {
    if (!(v.actions || []).includes(a)) continue;
    const [label, cls] = MINI_LABEL[a];
    const b = document.createElement('button');
    b.className = 'mn-b ' + cls;
    const amt = v.amounts[a];
    b.innerHTML = `${label}${amt ? `<small>${amt} 달</small>` : ''}`;
    b.onclick = () => miniAct(a);
    btns.appendChild(b);
  }
}

window.miniPickSeats = function (n) {
  miniSeats = n;
  for (const b of document.querySelectorAll('#mnSeatSeg .sp-segb'))
    b.classList.toggle('on', Number(b.dataset.seats) === n);
};
window.miniOpen = function () {
  if (!myAccount) { alert('미니게임은 로그인하면 즐길 수 있어요!'); openAuth('login'); return; }
  closeModePanels();
  document.getElementById('miniModal').classList.add('show');
};
// 솔로·멀티 패널에서 바로 앉는다. 예전엔 로비에 미니게임 카드를 따로 두고
// 그 안에서 다시 "AI와 / 온라인" 을 골랐는데, 카드만 보고는 어느 쪽인지 알 수
// 없었다. 이제 어디서 눌렀는지가 곧 답이다 — 인원만 고르면 된다.
window.miniGo = function (seats, online) {
  if (!myAccount) { alert('미니게임은 로그인하면 즐길 수 있어요!'); openAuth('login'); return; }
  miniPickSeats(seats);
  closeModePanels();
  if (online) {
    document.getElementById('mnQCount').textContent = '1';
    document.getElementById('mnQNeed').textContent = `/ ${seats}`;
    document.getElementById('miniWaitModal').classList.add('show');
    socket.emit('mini_quick', { seats });
  } else {
    socket.emit('mini_sit', { seats });
  }
};
window.miniClose = function () { document.getElementById('miniModal').classList.remove('show'); };
window.miniSit = function () {
  document.getElementById('miniModal').classList.remove('show');
  socket.emit('mini_sit', { seats: miniSeats });
};
window.miniQuick = function () {
  document.getElementById('miniModal').classList.remove('show');
  document.getElementById('mnQCount').textContent = '1';
  document.getElementById('mnQNeed').textContent = `/ ${miniSeats}`;
  document.getElementById('miniWaitModal').classList.add('show');
  socket.emit('mini_quick', { seats: miniSeats });
};
window.miniCancelQueue = function () {
  document.getElementById('miniWaitModal').classList.remove('show');
  socket.emit('mini_cancel');
};
socket.on('mini_queue', (q) => {
  if (q.cancelled) return document.getElementById('miniWaitModal').classList.remove('show');
  document.getElementById('mnQCount').textContent = String(q.seats || 1);
  document.getElementById('mnQNeed').textContent = `/ ${q.need || miniSeats}`;
});
window.miniAct = function (a) {
  if (!miniState || miniState.over || miniState.turn !== miniState.me) return;
  miniState.turn = null;                     // 두 번 눌러 두 수가 나가는 것 방지
  document.getElementById('mnBtns').innerHTML = '';
  socket.emit('mini_act', { action: a });
};
function miniHideOver() {
  clearInterval(miniNextTick); miniNextTick = null;
  document.getElementById('miniOver').classList.remove('on');
}
window.miniNext = function () {
  // 여럿이면 남이 누를 때까지 기다린다 — 결과창은 그대로 두고 버튼만 잠근다
  const multi = miniState && miniState.mode !== 'solo';
  if (multi) {
    const nb = document.getElementById('mnNextBtn');
    nb.disabled = true; nb.textContent = '기다리는 중…';
  } else miniHideOver();
  socket.emit('mini_next');
};
socket.on('mini_ready', (r) => {
  const nb = document.getElementById('mnNextBtn');
  if (!nb) return;
  nb.disabled = !!r.me;
  nb.textContent = r.me ? `기다리는 중 ${r.ready}/${r.need}` : `다음 판 (${r.ready}/${r.need})`;
});
window.miniStand = function () { miniHideOver(); socket.emit('mini_leave'); };
function miniHide() {
  clearInterval(miniClock); miniClock = null; miniPrevPot = 0;
  try { startBGM('lobby'); } catch (_) {}      // 자리에서 일어났다 — 로비 곡으로
  miniHideOver();
  const box = document.getElementById('mini');
  box.classList.remove('on'); box.style.display = 'none';
  miniState = null; miniSitting = false; miniSeen = [];
  miniPeeked = new Set(); miniShown = new Set(); miniJustFlipped = new Set();
  document.getElementById('lobby').style.display = 'flex';
  document.body.classList.remove('ingame');
}
window.miniStoodClose = function () {
  document.getElementById('miniStoodModal').classList.remove('show');
};

socket.on('mini_state', (v) => {
  document.getElementById('miniWaitModal').classList.remove('show');
  if (!miniSitting) {                       // 처음 앉을 때 로비를 접는다
    miniSitting = true;
    document.getElementById('lobby').style.display = 'none';
    document.body.classList.add('ingame');   // 화면 스크롤 잠금 — 본 게임과 같다
    applyMySkins();                          // 내 테이블·카드 스킨을 미니게임에도
    try { startBGM('game'); } catch (_) {}
  tvSfx('deal');
  }
  miniHideOver();                            // 다음 판이 오면 결과를 걷는다
  miniPaint(v);
});
socket.on('mini_error', (m) => toast('⚠️ ' + esc(m || '')));

// 왜 그 패가 이겼는지 — 판정은 서버(sutda)가 하고, 여기서는 문장으로만 옮긴다.
// "졌다" 만 뜨면 다음 판에 배우는 게 없다. 어느 규칙에서 갈렸는지가 이 게임의 핵심이다.
function miniVerdictText(r) {
  const v = r.view, verdict = r.verdict;
  if (!v) return '';
  if (v.reason === 'fold') return '<b>모두 접었습니다</b> — 남은 사람이 가져갑니다.';
  if (!verdict || !verdict.vs.length) return '';
  const nameOf = (i) => esc((v.names && v.names[i]) || '상대');
  const win = verdict.winner === v.me ? '내 패' : nameOf(verdict.winner);
  const line = (x) => {
    const lose = x.seat === v.me ? '내 패' : nameOf(x.seat);
    switch (x.rule) {
      case 'snipe':  return `<b>${esc(x.win)}</b>이 ${lose}(${esc(x.lose)})를 <b>잡았습니다</b>`;
      case 'jokbo':  return `<b>${esc(x.win)}</b> vs ${lose}(${esc(x.lose)}) — 족보가 높아서 이깁니다`;
      case 'front':  return `같은 족보 — <b>${x.a}</b> vs ${x.b} 로 갈렸습니다`;
      case 'back':   return `여기까지 같아 <b>등급 합 ${x.a}</b> vs ${x.b} 로 갈렸습니다`;
      case 'card':   return `합이 모두 같아 <b>더 강한 카드 ${esc(x.a)}</b> vs ${esc(x.b)} 로 갈렸습니다`;
      default:       return '완전히 같은 패입니다';
    }
  };
  return `<b>${win}</b> 승 — ` + verdict.vs.map(line).join('<br>');
}

let miniNextTick = null;
socket.on('mini_over', (r) => {
  // 마지막 수와 동시에 결과를 띄우면 남의 패를 볼 새가 없다.
  // 먼저 패만 까 두고, 한 박자 뒤에 결과를 얹는다.
  const showRes = () => {
    miniPaint(r.view);
    const res = document.getElementById('mnRes');
    res.textContent = r.won ? '승리!' : '패배';
    res.className = 'mn-res ' + (r.won ? 'win' : 'lose');
    document.getElementById('mnNet').textContent =
      r.net > 0 ? `+${r.net} 달` : r.net < 0 ? `${r.net} 달` : '±0 달';
    // 왜 그렇게 됐는지 — 이게 없으면 "졌다" 만 뜨고 배우는 게 없다
    document.getElementById('mnVerdict').innerHTML = miniVerdictText(r);
    const nb = document.getElementById('mnNextBtn');
    nb.style.display = r.canGo ? '' : 'none';       // 혼자든 여럿이든 눌러서 이어 간다
    nb.disabled = false;
    nb.textContent = '다음 판';

    // 멀티는 시계대로 넘어간다 — 몇 초 남았는지 보여준다. 갑자기 바뀌면 놀란다.
    const why = document.getElementById('mnOverWhy');
    clearInterval(miniNextTick); miniNextTick = null;
    if (!r.canGo) why.textContent = '소지금이 떨어졌어요.';
    else if (r.view.mode !== 'solo' && r.nextIn > 0) {
      const at = Date.now() + r.nextIn;
      const tick = () => {
        const left = Math.max(0, Math.ceil((at - Date.now()) / 1000));
        why.textContent = `${left}초 뒤 다음 판`;
        if (left <= 0) { clearInterval(miniNextTick); miniNextTick = null; }
      };
      tick(); miniNextTick = setInterval(tick, 500);
    } else if (r.view.reason === 'fold') {
      why.textContent = '모두 접어서 끝난 판입니다. 패는 안 깝니다.';
    } else why.textContent = '';

    document.getElementById('miniOver').classList.add('on');
  };
  // 공개로 끝난 판은 패를 먼저 보여 준다. 접어서 끝난 판은 볼 게 없으니 바로.
  if (r.view.reason === 'showdown') { miniPaint(r.view); setTimeout(showRes, 1600); }
  else showRes();
});

socket.on('mini_stood', (r) => {
  miniHide();
  document.getElementById('mnStoodNet').innerHTML =
    `${r.chips} 달 → <b>🪙 ${r.back}</b> 회수 (${r.net > 0 ? '+' : ''}${r.net})`;
  document.getElementById('mnStoodWhy').textContent = r.why || '';
  document.getElementById('miniStoodModal').classList.add('show');
  if (myAccount && typeof r.coins === 'number') { myAccount.coins = r.coins; renderAccount(); }
});

// 족보표 — 글자만 늘어놓으면 "합 7" 이 어떤 패인지 머릿속에서 다시 그려야 한다.
// 실제 카드 두 장을 놓아 눈으로 바로 알아보게 한다.
// 예시는 실제로 나올 수 있는 조합에서 고른다(없는 패를 그려 놓으면 거짓말이다) — MINI_TIERS.ex
const miniCardOf = ([kind, grade]) => ({ kind, grade, id: kind * 100 + grade });

window.miniRank = function (show) {
  const box = document.getElementById('miniRankModal');
  if (!show) return box.classList.remove('show');
  const ev = miniState && miniState.myEval;
  const tbl = document.getElementById('mnTable');
  tbl.innerHTML = '';

  const row = (cards, no, name, note, cls) => {
    const d = document.createElement('div');
    d.className = 'mn-tr' + (cls ? ' ' + cls : '');
    const i = document.createElement('i'); i.textContent = no;
    const cw = document.createElement('div'); cw.className = 'mn-trcards';
    for (const c of cards) cw.appendChild(makeCard(c));
    const b = document.createElement('b'); b.textContent = name;
    const em = document.createElement('em'); em.textContent = note;
    d.append(i, cw, b, em);
    return d;
  };

  const myRung = miniRungOf(ev);
  MINI_TIERS.forEach((t, idx) => {
    const mine = ev && !ev.jol && myRung === idx;
    const d = row(t.ex.map(miniCardOf), idx + 1, t.name, t.note, mine ? 'me' : '');
    if (mine) { const now = document.createElement('em'); now.className = 'mn-now'; now.textContent = '지금 내 패'; d.appendChild(now); }
    tbl.appendChild(d);
  });
  // 졸개의 배신 — 덱에서 가장 약한 두 장이 땡을 전부 잡는다
  const sn = ev && ev.jol;
  const d = row([miniCardOf([4, 6]), miniCardOf([6, 8])], '🎯', '졸개의 배신',
                '가장 약한 두 장 · 땡을 전부 잡는다', 'sn' + (sn ? ' me' : ''));
  if (sn) { const now = document.createElement('em'); now.className = 'mn-now'; now.textContent = '지금 내 패'; d.appendChild(now); }
  tbl.appendChild(d);
  box.classList.add('show');
};

// 미니게임을 뺀 동안 이 설명서도 없다 — 부르면 클래식으로 보낸다
window.toggleRulesMini = function (show) { show ? rulesTab('2') : rulesClose(); };

// ── 토너먼트 (8강 · 2인전) ───────────────────────────────────
// 화면은 네 모습을 오간다: 참가 안내 → 대기(30초) → 대진표 → 결과.
// 어느 것을 보여줄지는 서버가 보내는 상태가 정한다 — 화면이 스스로 정하면 어긋난다.
let tourTick = null, tourLeftMs = 0;
// 30분마다 열리므로 남은 시간이 분 단위로 길어진다 — 초만 세면 읽기 힘들다
function tourLeftText(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return sec >= 60 ? `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초` : `${sec}초`;
}
function tourClock(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function tourFace(which) {
  for (const [id, on] of [['tourIntro', which === 'intro'], ['tourWait', which === 'wait'],
                          ['tourBoard', which === 'board'], ['tourResult', which === 'result']]) {
    const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none';
  }
}
window.tourOpen = function () {
  if (!myAccount) { alert('토너먼트는 로그인하면 참가할 수 있어요!'); openAuth('login'); return; }
  closeModePanels();
  document.getElementById('tourErr').textContent = '';
  tourFace('intro');
  document.getElementById('tourModal').classList.add('show');
  socket.emit('tour_peek');
};
window.tourClose = function () {
  document.getElementById('tourModal').classList.remove('show');
  clearInterval(tourTick); tourTick = null;
};
window.tourJoin = function () {
  document.getElementById('tourErr').textContent = '';
  socket.emit('tour_join');
};
window.tourLeave = function () { socket.emit('tour_leave'); };

socket.on('tour_error', (m) => {
  const box = document.getElementById('tourErr');
  if (box) box.textContent = m;
  else toast(esc(m));
  tourFace('intro');
});
socket.on('tour_left', () => { clearInterval(tourTick); tourTick = null; tourFace('intro'); });

// 대기 — 남은 시간은 서버가 준 값에서 시작해 화면에서 센다
socket.on('tour_lobby', (d) => {
  if (!d || !d.open) { tourFace('intro'); return; }
  document.getElementById('tourModal').classList.add('show');
  // 아직 참가 전이면 지금 몇 명이 기다리는지를 적어 준다.
  // 시각이 아니라 사람이 모이면 열리므로, 알려 줄 것은 시계가 아니라 인원이다.
  if (!d.joined) {
    tourFace('intro');
    const note = document.getElementById('tourNextAt');
    if (note) note.textContent = d.running
      ? '지금은 대회가 진행 중이에요. 곧 다음 대회가 열려요.'
      : d.count >= d.min
        ? `${d.count}명 대기 중 — 곧 시작해요!`
        : `${d.count}/${d.min}명 대기 중 — ${d.min}명이 모이면 열려요`;
    return;
  }
  tourFace('wait');
  tourLeftMs = d.leftMs;
  const lbl = document.getElementById('tourLeftLbl');
  const counting = d.leftMs > 0;
  if (lbl) lbl.textContent = counting ? '뒤 시작' : `명 더 모이면 시작`;
  const paint = () => {
    // 최소 인원이 안 찼으면 시계 대신 남은 사람 수를 센다 — 0 이 흐르면
    // "곧 열린다" 로 읽히는데 실제로는 아무 일도 안 일어난다.
    document.getElementById('tourLeft').textContent =
      counting ? tourLeftText(tourLeftMs) : String(Math.max(0, d.min - d.count));
    tourLeftMs -= 250;
  };
  clearInterval(tourTick); paint();
  if (counting) tourTick = setInterval(paint, 250);

  const box = document.getElementById('tourSlots');
  const me = myAccount ? myAccount.nick : null;
  let html = '';
  for (let i = 0; i < d.size; i++) {
    const nick = d.nicks[i];
    html += nick
      ? `<div class="tw-slot${nick === me ? ' me' : ''}">${esc(nick)}</div>`
      : '<div class="tw-slot empty">빈 자리</div>';
  }
  box.innerHTML = html;
  document.getElementById('tourWaitNote').textContent = counting
    ? `${d.count}명 · ${d.size}강으로 열려요 · 빈 자리는 AI 가 채워요`
    : `${d.count}/${d.min}명 · ${d.min}명이 모이면 시작해요`;
});

// 대진표.
// 내 판이 열려 있으면 띄우지 않는다 — 대회 창이 판을 덮으면 자기 경기를 못 본다.
let tourPending = null;                 // 판이 끝나면 보여줄 대진표
function tourInGame() {
  const g = document.getElementById('game');
  return !!g && getComputedStyle(g).display !== 'none';
}
socket.on('tour_state', (v) => {
  clearInterval(tourTick); tourTick = null;
  if (tourInGame()) { tourPending = v; document.getElementById('tourModal').classList.remove('show'); return; }
  tourPending = null;
  tourPaintBoard(v);
});

// 대진표 그리기 — 새 상태가 올 때와 판이 끝난 뒤 두 곳에서 쓴다
function tourRenderBoard(v) {
  document.getElementById('tourRoundName').textContent = v.roundName;
  const nameOf = (i) => { const s = v.seats[i]; return s.isBot ? 'AI' : (s.nick || '?'); };
  document.getElementById('tourBracket').innerHTML = v.rounds.map((r) => `
    <div class="tb-r"><div class="tb-rn">${esc(r.name)}</div>` +
    r.matches.map((m) => {
      const cls = (seat) => 'tb-p'
        + (m.winner === null ? '' : (m.winner === seat ? ' win' : ' lose'))
        + (v.mySeat === seat ? ' me' : '');
      // 3판 2선승은 점수를 보여줘야 몇 판째인지 안다
      const sc = m.bestOf > 1
        ? `<span class="tb-vs">${(m.score || {})[m.a] || 0}:${(m.score || {})[m.b] || 0}</span>`
        : '<span class="tb-vs">VS</span>';
      return `<div class="tb-m"><span class="${cls(m.a)}">${esc(nameOf(m.a))}</span>` + sc +
             `<span class="${cls(m.b)}">${esc(nameOf(m.b))}</span></div>`;
    }).join('') + '</div>').join('');
  document.getElementById('tourNote').textContent = v.myRank
    ? `탈락했어요 — 최종 ${v.myRank}위. 남은 경기를 지켜보세요.`
    : '내 경기가 시작되면 자동으로 판이 열려요.';
}

// 결과
let tourOverPending = null;
socket.on('tour_over', (d) => {
  clearInterval(tourTick); tourTick = null;
  if (tourInGame()) { tourOverPending = d; return; }   // 판이 끝난 뒤에 보여준다
  tourShowOver(d);
});
function tourShowOver(d) {
  document.getElementById('tourModal').classList.add('show');
  tourFace('result');
  const label = d.rank === 1 ? '🏆 우승!' : d.rank === 2 ? '🥈 준우승' : `${d.rank}위`;
  document.getElementById('tourRank').textContent = label;
  document.getElementById('tourPrize').innerHTML = d.amount > 0
    ? `상금 ${ico('🪙')} <b>${d.amount}</b>`
    : '아쉽지만 상금은 없어요. 다음 대회에서 만나요!';
  if (d.profile) { myAccount = d.profile; renderAccount(); }
  if (d.rank === 1) playSound('setwin');
}

// 대회 경기가 시작되면 대회 창을 접는다 (판을 가리면 안 된다)
socket.on('game_start', (d) => { if (d && d.tour) document.getElementById('tourModal').classList.remove('show'); });
let isTourMatch = false;
// 대회 경기가 끝났을 때 — 로비로 "돌아가되" 새로고침은 하지 않는다.
// goLobby() 는 fastReload 를 부르는데, 새로고침하면 소켓 id 가 바뀌어
// 대진표가 가리키던 자리를 잃는다(그 자리는 부전패 처리된다).
window.tourBackToBracket = function () {
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('game').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
  document.body.classList.remove('ingame');
  isTourMatch = false;
  try { clearSession(); } catch (_) {}
  tourAfterGame();
};
// 판이 끝나면 미뤄 둔 대진표·결과를 보여준다
function tourAfterGame() {
  if (tourOverPending) { const d = tourOverPending; tourOverPending = null; tourPending = null; tourShowOver(d); return; }
  // tour_peek 을 부르면 안 된다. 대회가 이미 시작돼 대기실이 닫혔으므로
  // { open:false } 가 돌아오고, 그 핸들러가 화면을 참가 안내로 되돌린다.
  if (tourPending) { const v = tourPending; tourPending = null; tourPaintBoard(v); }
}
function tourPaintBoard(v) {
  document.getElementById('tourModal').classList.add('show');
  tourFace('board');
  tourRenderBoard(v);
}


// ── 인게임 채팅 (친구 1:1 · 클랜) ────────────────────────────
// 판을 나가지 않고도 얘기할 수 있게. 목록·대화 그리기는 여기 한 곳에서만 한다.
let gcTab = 'friend', gcWith = null;      // 지금 보고 있는 탭 / 대화 중인 친구 idl
let gcUnread = {};                        // idl → 안 읽은 수

function gameChatOpen() { const p = document.getElementById('gameChat'); return !!p && p.classList.contains('show'); }

// ── 채팅창 옮기기 ─────────────────────────────────────────────────────────
// 판 위에 떠 있는 창이라 카드를 가린다. 손잡이를 잡고 끌어 옮길 수 있게 한다.
// 옮긴 자리는 기억해 두되, 화면 밖으로는 못 나가게 매번 다시 가둔다 —
// 폰을 돌리거나 작은 기기로 바꾸면 기억한 자리가 화면 밖일 수 있다.
function gcClamp(el, x, y) {
  const w = el.offsetWidth, h = el.offsetHeight;
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}
function gcPlace(x, y) {
  const el = document.getElementById('gameChat'); if (!el) return;
  const p = gcClamp(el, x, y);
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.style.right = 'auto'; el.style.bottom = 'auto';
  try { localStorage.setItem('ff_chatpos', JSON.stringify(p)); } catch (_) {}
}
// 열 때마다 기억한 자리로. 없으면 원래 자리를 그대로 쓴다.
function gcRestorePos() {
  const el = document.getElementById('gameChat'); if (!el) return;
  let p = null;
  try { p = JSON.parse(localStorage.getItem('ff_chatpos') || 'null'); } catch (_) {}
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
  const c = gcClamp(el, p.x, p.y);
  el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
  el.style.right = 'auto'; el.style.bottom = 'auto';
}
(function initChatDrag() {
  const grip = document.querySelector('#gameChat .gcx-grip');
  const el = document.getElementById('gameChat');
  if (!grip || !el) return;
  let dx = 0, dy = 0, on = false;
  const down = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const r = el.getBoundingClientRect();
    dx = t.clientX - r.left; dy = t.clientY - r.top;
    on = true; el.classList.add('dragging');
    e.preventDefault();
  };
  const move = (e) => {
    if (!on) return;
    const t = e.touches ? e.touches[0] : e;
    gcPlace(t.clientX - dx, t.clientY - dy);
    e.preventDefault();
  };
  const up = () => { if (!on) return; on = false; el.classList.remove('dragging'); };
  grip.addEventListener('mousedown', down);
  grip.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up);
  window.addEventListener('touchend', up);
  // 화면이 바뀌면 기억한 자리가 밖일 수 있다 — 다시 가둔다
  window.addEventListener('resize', () => { if (gameChatOpen()) gcRestorePos(); });
})();
window.toggleGameChat = function (force) {
  const p = document.getElementById('gameChat'); if (!p) return;
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
  if (!show) return;
  gcRestorePos();   // 지난번에 옮겨 둔 자리로
  p.classList.add('intro');                       // 열 때 한 번만 미끄러져 들어온다
  setTimeout(() => p.classList.remove('intro'), 260);
  if (!myAccount) { document.getElementById('gcFriendList').innerHTML =
      '<div class="gc-empty">로그인하면 채팅할 수 있어요</div>'; return; }
  gameChatTab(gcTab);
};
window.gameChatTab = function (which) {
  gcTab = which;
  document.querySelectorAll('.gcx-tab').forEach((b) => b.classList.toggle('active', b.dataset.gct === which));
  document.getElementById('gcFriendPane').style.display = which === 'friend' ? 'flex' : 'none';
  document.getElementById('gcClanPane').style.display = which === 'clan' ? 'flex' : 'none';
  if (which === 'friend') { gcWith ? gcLoadTalk(gcWith) : gcLoadFriends(); }
  else gcLoadClan();
};
window.gameChatBack = function () { gcWith = null; gcLoadFriends(); };

async function gcLoadFriends() {
  document.getElementById('gcFriendTalk').style.display = 'none';
  const box = document.getElementById('gcFriendList');
  box.style.display = '';
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/friends', { token: authToken() });
  if (!r || r.error || !r.friends) { box.innerHTML = `<div class="gc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  if (!r.friends.length) { box.innerHTML = '<div class="gc-empty">아직 친구가 없어요</div>'; return; }
  await gcRefreshUnread();
  // 안 읽은 게 있는 사람부터, 그다음 접속 중인 사람
  const rank = (f) => (gcUnread[f.idl] ? 0 : f.online ? 1 : 2);
  box.innerHTML = r.friends.slice().sort((a, b) => rank(a) - rank(b)).map((f) => {
    const un = gcUnread[f.idl];
    const tail = un ? `<span class="gc-un">${un}</span>`
                    : `<span class="gc-off">${f.ingame ? '게임 중' : f.online ? '접속 중' : '오프라인'}</span>`;
    return `<button class="gc-frow" onclick="gcOpenTalk('${esc(f.idl)}')"><span class="${ncClass(f.nickColor).trim()}">${nickHTML(f.nick, f.nickColor)}</span>${tail}</button>`;
  }).join('');
}
window.gcOpenTalk = function (idl) { gcWith = idl; gcLoadTalk(idl); };

async function gcLoadTalk(idl) {
  document.getElementById('gcFriendList').style.display = 'none';
  document.getElementById('gcFriendTalk').style.display = 'flex';
  const box = document.getElementById('gcFriendMsgs');
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/dm', { token: authToken(), idl });
  if (!r || r.error) { box.innerHTML = `<div class="gc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  gcPaint(box, r.messages, false);
  delete gcUnread[idl]; gcPaintDot();
}

async function gcLoadClan() {
  gcClanUnread = 0; gcPaintDot();   // 봤으니 점을 끈다
  const box = document.getElementById('gcClanMsgs');
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/clan-chat', { token: authToken() });
  if (!r || r.error) { box.innerHTML = `<div class="gc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  gcPaint(box, r.messages, true);
}

// ── 메시지 그리기 ─────────────────────────────────────────────────────────
// 말풍선을 한 줄에 하나씩 쌓기만 하면, 대화가 길어질수록 누가 언제 무슨 말을
// 했는지가 안 읽힌다. 그래서 세 가지를 넣었다.
//   · 날짜가 바뀌면 가운데 구분선
//   · 같은 사람이 같은 분에 이어서 쓰면 하나로 묶는다 — 이름·꼬리는 처음에만,
//     시각은 마지막에만. 세 줄 쓰면 시각이 세 번 찍히는 게 제일 지저분했다.
//   · 시각은 말풍선 밖 아래쪽에 붙인다. 안에 넣으면 글이 밀린다.
const gcTime = (t) => {
  const d = new Date(t || Date.now());
  const h = d.getHours();
  return (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
};
const gcDay = (t) => {
  const d = new Date(t || Date.now());
  const W = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${W}요일`;
};
const gcSameDay = (a, b) => new Date(a || 0).toDateString() === new Date(b || 0).toDateString();
// 같은 사람이 같은 분에 이어서 쓴 것인가
const gcRun = (a, b) => !!a && !!b && a.mine === b.mine && (a.idl || '') === (b.idl || '')
  && Math.abs((a.at || 0) - (b.at || 0)) < 60000
  && new Date(a.at || 0).getMinutes() === new Date(b.at || 0).getMinutes();

function gcPaint(box, msgs, showName) {
  box._msgs = msgs || [];
  box._showName = !!showName;
  if (!box._msgs.length) { box.innerHTML = '<div class="gc-empty">아직 대화가 없어요</div>'; return; }
  const L = box._msgs;
  let html = '', lastAt = 0;
  for (let i = 0; i < L.length; i++) {
    const m = L[i], prev = L[i - 1], next = L[i + 1];
    if (!gcSameDay(m.at, lastAt)) html += `<div class="gc-day"><span>${esc(gcDay(m.at))}</span></div>`;
    lastAt = m.at;
    const head = !gcRun(prev, m);        // 묶음의 첫 줄 — 이름과 꼬리는 여기만
    const tail = !gcRun(m, next);        // 묶음의 마지막 줄 — 시각은 여기만
    html += `<div class="gc-row${m.mine ? ' mine' : ''}${head ? ' head' : ''}">`;
    if (showName && !m.mine) {
      // 얼굴 대신 첫 글자. 이름을 두 번 적는 것보다 눈이 덜 피곤하다.
      html += head ? `<span class="gc-av">${esc((m.nick || '?').slice(0, 1))}</span>`
                   : '<span class="gc-av blank"></span>';
    }
    html += '<div class="gc-col">';
    if (showName && !m.mine && head)
      html += `<span class="gc-who${ncClass(m.nickColor)}">${nickHTML(m.nick, m.nickColor)}</span>`;
    html += `<div class="gc-line"><div class="gc-m${head ? ' tip' : ''}">${esc(m.text)}</div>`
          + (tail ? `<span class="gc-t">${esc(gcTime(m.at))}</span>` : '')
          + '</div></div></div>';
  }
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}
// 방금 보낸 것을 그 자리에 붙인다 — 서버를 한 번 더 다녀오면 느리게 느껴진다.
// 통째로 다시 그리는 건 묶음과 날짜 구분선을 손으로 이어 붙이면 반드시 어긋나기
// 때문이다. 대화 한 자락은 짧아서 다시 그려도 티가 안 난다.
function gcAppend(box, m) {
  if (!Array.isArray(box._msgs)) box._msgs = [];
  box._msgs.push(m);
  gcPaint(box, box._msgs, box._showName);
}
const gcAppendMine = (box, text) => gcAppend(box, { mine: true, text, at: Date.now(), idl: '', nick: '' });

window.gameChatSend = async function () {
  const clan = gcTab === 'clan';
  const input = document.getElementById(clan ? 'gcClanInput' : 'gcFriendInput');
  const text = input.value.trim(); if (!text) return;
  if (!clan && !gcWith) return;
  input.value = '';
  const r = clan
    ? await apiPost('/api/clan-chat-send', { token: authToken(), text })
    : await apiPost('/api/dm-send', { token: authToken(), idl: gcWith, text });
  if (!r || r.error) { toast(esc((r && r.error) || '보내지 못했어요')); input.value = text; return; }
  // 보낸 건 바로 붙인다 — 서버를 한 번 더 다녀오면 느리게 느껴진다
  gcAppendMine(document.getElementById(clan ? 'gcClanMsgs' : 'gcFriendMsgs'), text);
};

// 안 읽음 — 버튼의 점과 친구 목록 배지에 쓴다
async function gcRefreshUnread() {
  if (!myAccount) { gcUnread = {}; gcPaintDot(); return; }
  const r = await apiPost('/api/dm-unread', { token: authToken() });
  gcUnread = (r && r.ok && r.by) ? r.by : {};
  gcPaintDot();
}
let gcClanUnread = 0;
function gcPaintDot() {
  const on = Object.keys(gcUnread).length > 0 || gcClanUnread > 0;
  for (const id of ['chatDot', 'chatDotG', 'chatDot4', 'chatDot4M', 'chatDotTv', 'chatDotTvM']) {
    const d = document.getElementById(id); if (d) d.style.display = on ? '' : 'none';
  }
  // 로비에 있을 때도 보여야 한다 — 판 안의 채팅 버튼은 로비에서 안 보인다
  try { paintSocialBadges(); } catch (_) {}
}
// 새 1:1 메시지가 도착
socket.on('dm', ({ from, msg }) => {
  // 친구 탭에서 그 사람과 대화 중이면 거기에 바로 붙인다
  const ftalk = document.getElementById('fpane-talk');
  if (ftalkWith === from && ftalk && ftalk.style.display !== 'none') {
    gcAppend(document.getElementById('ftalkMsgs'),
             { mine: false, text: msg.text, at: msg.at || Date.now(), idl: from, nick: msg.nick });
    apiPost('/api/dm', { token: authToken(), idl: from });   // 읽음 처리
    return;
  }
  if (gameChatOpen() && gcTab === 'friend' && gcWith === from) {
    gcAppend(document.getElementById('gcFriendMsgs'),
             { mine: false, text: msg.text, at: msg.at || Date.now(), idl: from, nick: msg.nick });
    apiPost('/api/dm', { token: authToken(), idl: from });   // 읽음 처리
    return;
  }
  gcUnread[from] = (gcUnread[from] || 0) + 1;
  gcPaintDot();
  if (gameChatOpen() && gcTab === 'friend' && !gcWith) gcLoadFriends();
});
// 클랜 메시지도 열려 있으면 바로 붙인다.
// 닫혀 있으면 그냥 흘려보냈는데, 그러면 판에서 말을 걸어도 아무도 모른다 — 점을 켠다.
socket.on('clan_chat', ({ msg }) => {
  if (!gameChatOpen() || gcTab !== 'clan') {
    gcClanUnread++;
    gcPaintDot();
    return;
  }
  gcAppend(document.getElementById('gcClanMsgs'),
           { mine: false, text: msg.text, at: msg.at || Date.now(),
             idl: msg.idl || msg.nick, nick: msg.nick, nickColor: msg.nickColor });
});

// ── 게임 설명서 ─────────────────────────────────────────────
// 모드마다 규칙이 달라 설명서가 여러 벌인데, 예전엔 들어가는 문이 따로따로여서
// "다인전 규칙이 어디 있지" 를 찾아다녀야 했다. 이제 한 창에서 탭으로 오간다.
//
// 3인용·4인용은 규칙이 같고 손패·덱 장수만 다르다. 그래서 상자는 하나를 같이 쓰고,
// 다른 숫자만 탭 아래 한 줄로 띄운다 — 같은 글을 두 벌로 두면 한쪽만 고치게 된다.
// 3인용·4인용을 '다인전' 한 칸으로 합쳤다 — 규칙이 같고 손패·덱 수만 달라서
// 탭을 둘로 나눌 값어치가 없었다. 판 안에서 부르는 옛 이름('3','4')도 받는다.
const RULES_MODALS = { '2': 'rulesModal', '3': 'rules4Modal', '4': 'rules4Modal', quad: 'rules4Modal',
  item: 'rulesItemModal', twelve: 'rulesTwelveModal', etc: 'rulesEtcModal' };
const RULES_N = { '3': { hand: 7, deck: 17 }, '4': { hand: 6, deck: 14 } };
let rulesCur = '2';

window.rulesTab = function (name) {
  const id = RULES_MODALS[name] || RULES_MODALS['2'];
  rulesCur = name;
  for (const mid of new Set(Object.values(RULES_MODALS))) {
    const el = document.getElementById(mid);
    if (el) el.style.display = mid === id ? 'flex' : 'none';
  }
  // 지금 보이는 창의 탭만 칠한다 (창마다 같은 탭 줄을 갖고 있다)
  const box = document.getElementById(id);
  // '3'·'4' 로 들어와도 칠해지는 칸은 '다인전' 하나다
  const lit = (name === '3' || name === '4') ? 'quad' : name;
  if (box) for (const b of box.querySelectorAll('.rt')) b.classList.toggle('on', b.dataset.rt === lit);
  const note = document.getElementById('rules4Note');
  if (note) {
    const n = RULES_N[name];
    note.style.display = (lit === 'quad') ? '' : 'none';
    // 판 안에서 열면 지금 인원의 수치를, 로비에서 열면 둘 다 보여 준다
    note.innerHTML = n
      ? `지금은 <b>${name}인전</b> — 손패 <b>${n.hand}장</b> · 중앙 덱 <b>${n.deck}장</b>`
      : '3인전 — 손패 <b>7장</b> · 덱 <b>17장</b>　·　4인전 — 손패 <b>6장</b> · 덱 <b>14장</b>';
  }
};
function rulesClose() {
  for (const mid of new Set(Object.values(RULES_MODALS))) {
    const el = document.getElementById(mid); if (el) el.style.display = 'none';
  }
}
// 판을 보고 알맞은 탭으로 연다 — 다인전 화면에서 2인전 설명이 뜨면 더 헷갈린다
// 지금 앉아 있는 판이 어느 모드인가 — 설명서는 늘 이 탭부터 연다.
// 트웰브를 하다 설명을 눌렀는데 클래식 규칙이 뜨면 아무 소용이 없다.
function currentMode() {
  const c = document.body.classList;
  if (c.contains('twelve')) return 'twelve';
  if (c.contains('quad4')) return c.contains('q-n3') ? '3' : '4';
  if (c.contains('item-mode')) return 'item';
  return '2';
}
function toggleRules(show) {
  if (!show) return rulesClose();
  rulesTab(currentMode());
}

function toggleRules4(show) { show ? rulesTab(document.body.classList.contains('q-n3') ? '3' : '4') : rulesClose(); }
window.toggleRulesItem = function (show) { show ? rulesTab('item') : rulesClose(); };

// ── ESC 로 닫기 ─────────────────────────────────────────────
// 배경 클릭으로는 닫히는데 ESC 는 어디서도 안 먹어 일관성이 없었다.
// 각 모달의 전용 닫기 함수를 부른다 — 매칭 취소처럼 뒷정리가 필요한 게 있어서
// 단순히 show 클래스만 떼면 서버 상태와 어긋난다.
const ESC_TARGETS = [
  ['rulesModal',   () => rulesClose()],
  ['rules4Modal',  () => rulesClose()],
  ['rulesItemModal', () => rulesClose()],
  ['rulesMiniModal', () => rulesClose()],
  ['miniRankModal', () => miniRank(false)],
  ['miniModal',    () => miniClose()],
  ['miniStoodModal', () => miniStoodClose()],
  ['lbModal',      () => closeLb()],
  ['shopModal',    () => closeShop()],
  ['missionModal', () => closeMissions()],
  ['myInfoModal',  () => closeMyInfo()],
  ['friendsModal', () => closeFriends()],
  ['clanModal',    () => closeClan()],
  ['soloModal',    () => closeModePanels()],
  ['multiModal',   () => closeModePanels()],
  ['quadModal',    () => (typeof q4Close === 'function') && q4Close()],
  ['gachaModal',   () => closeGacha()],
  ['shardModal',   () => closeShardShop()],
  ['bonusModal',   () => closeBonus()],
  ['createModal',  () => closeCreate()],
  ['codeModal',    () => closeCode()],
  // 폭탄으로 버릴 카드를 고르는 중이면 못 닫는다 — 고를 때까지 판이 기다린다
  ['itemUseModal', () => { if (!_bombOn) closeItemUse(); }],
  ['matchModal',   () => cancelMatch()],       // 대기열에서도 빼야 한다
  ['cpnModal',     () => closeCoupon()],       // 상점 위에 뜨므로 상점보다 뒤에
  ['confirmModal', () => confirmClose(false)], // 확인창은 대개 가장 위에 뜬다
  // nickModal 은 일부러 제외 — 닉네임을 정해야 넘어가는 단계라 ESC 로 건너뛰면 안 된다
];
const escIsOpen = (el) => !!el && (el.classList.contains('show') ||
  (el.style.display && el.style.display !== 'none'));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // 4인전 화면이면 그쪽 패널을 먼저 처리
  if (document.body.classList.contains('quad4')) {
    const p = document.getElementById('q-leftPanel');
    if (p && p.classList.contains('show')) { p.classList.remove('show'); e.preventDefault(); return; }
  }
  // 여러 개가 겹쳐 있으면 목록 뒤쪽(=위에 뜨는 것)을 먼저 닫는다
  let close = null;
  for (const [id, fn] of ESC_TARGETS) if (escIsOpen(document.getElementById(id))) close = fn;
  if (close) { close(); e.preventDefault(); }
});

// ── 이모트 ──────────────────────────────────────────────────
function toggleEmotes(force) {
  const p = document.getElementById('emotePicker');
  const show = force === undefined ? !p.classList.contains('show') : force;
  // 열 때마다 지금 가진 것으로 다시 그린다. 프로필이 바뀌는 자리가 스무 곳이
  // 넘어서, 어느 한 곳이 부르는 걸 빠뜨리면 산 이모트가 안 보인다 —
  // 여기서 한 번 보면 빠뜨릴 자리가 없다.
  if (show) { try { refreshEmotes(); } catch (_) {} }
  p.classList.toggle('show', show);
}
let emoteMuted = false;              // 상대 이모트 차단
let lastEmoteSent = 0;               // 로컬 쿨타임(서버와 동일 3초)
function toggleEmoteMute() {
  emoteMuted = !emoteMuted;
  const b = document.getElementById('emoteMuteBtn');
  if (b) { b.classList.toggle('muted', emoteMuted); b.textContent = emoteMuted ? '🔇 상대 차단됨' : '🔔 상대 이모트'; }
  toast(emoteMuted ? '🔇 상대 이모트를 차단했어요' : '🔔 상대 이모트를 다시 봐요', 1600);
}
function sendEmote(emoji) {
  const now = Date.now();
  if (now - lastEmoteSent < 3000) { toast('⏳ 이모트는 3초에 한 번만 보낼 수 있어요', 1400); return; }
  lastEmoteSent = now;
  socket.emit('emote', { emoji });
  showEmote(emoji, 'me');
  toggleEmotes(false);
}
socket.on('emote', ({ emoji }) => { if (!emoteMuted) showEmote(emoji, 'opp'); });
socket.on('emote_cooldown', () => { lastEmoteSent = Date.now(); });   // 서버 쿨타임 동기화
function showEmote(emoji, side) {
  playSound('emote');
  const b = document.createElement('div');
  b.className = 'emote-bubble';
  const art = (typeof emoteArt === 'function') && emoteArt(emoji);
  if (art) b.innerHTML = art; else b.textContent = emoji;   // 상점 팩 등 매핑 없는 건 이모지 그대로
  // 티백은 위아래로 담갔다 뺀다 — 그게 이 이모트의 전부다.
  // 예전엔 상점 미리보기와 피커 버튼에만 붙어 있어서, 정작 판에서 보내면
  // 가만히 있는 주전자가 떴다("티배깅 작동 안 됨").
  if (emoji === '🫖') b.classList.add('em-teabag');
  let x = window.innerWidth / 2, y = side === 'me' ? window.innerHeight - 160 : 120;
  // 내 이모티콘은 이모트 버튼 바로 위에서 뜸 (중앙 X). 상대 것은 상대 손패 근처
  // 이모트는 그 사람 이름 위에서 뜬다. 예전엔 내 것만 이모트 버튼 위에서 떴는데,
  // 버튼이 화면 구석으로 옮겨 간 뒤로는 누가 보낸 것인지 읽히지 않았다.
  const tv = document.body.classList.contains('twelve');
  const anchor = side === 'me'
    ? document.getElementById(tv ? 'tv-myProfile' : 'myProfile') || document.getElementById('emoteBtn')
    : document.getElementById(tv ? 'tv-oppProfile' : 'oppProfile');
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (r.width) { x = r.left + r.width / 2; y = side === 'me' ? r.top - 44 : r.bottom + 8; }
  }
  b.style.left = (x - 20) + 'px'; b.style.top = y + 'px';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3100);
}

// ── 나가기 / 재대결 ─────────────────────────────────────────
function goLobby() { clearSession(); fastReload(); }
// 예쁜 확인 다이얼로그 (기본 confirm 대체)
let _confirmCb = null;
let _confirmNoCb = null;
function askConfirm({ icon = '❓', title, desc = '', yes = '확인', no = '취소' }, cb, noCb) {
  _confirmNoCb = noCb || null;
  // 대화상자 아이콘도 우리가 그린 그림으로. 예전엔 textContent 라 시스템 이모지가
  // 그대로 떴다 — 나가기 문이 유독 밋밋해 보이던 게 이것 때문이다.
  const cf = document.getElementById('cfIcon');
  const art = (typeof iconArt === 'function') && iconArt(icon);
  if (art) { cf.innerHTML = art; cf.classList.add('cf-art'); }
  else { cf.textContent = icon; cf.classList.remove('cf-art'); }
  document.getElementById('cfTitle').textContent = title;
  document.getElementById('cfDesc').textContent = desc;
  document.getElementById('cfYes').textContent = yes;
  // no 를 안 주면(알림처럼 확인만 받는 창) 취소 버튼을 감춘다.
  // 예전엔 그대로 찍어서 'null' 이라고 적힌 버튼이 떴다.
  const cfNo = document.getElementById('cfNo');
  if (no == null) { cfNo.style.display = 'none'; }
  else { cfNo.style.display = ''; cfNo.textContent = no; }
  _confirmCb = cb;
  document.getElementById('confirmModal').classList.add('show');
}
function confirmClose(ok) {
  document.getElementById('confirmModal').classList.remove('show');
  const cb = _confirmCb, ncb = _confirmNoCb; _confirmCb = null; _confirmNoCb = null;
  if (ok && cb) cb();
  else if (!ok && ncb) ncb();
}
function exitGame() {
  gMenu(false);
  askConfirm({ icon: '🚪', title: '게임에서 나갈까요?', desc: isVsBot ? 'AI 대전은 언제든 다시 시작할 수 있어요.' : '진행 중인 게임은 몰수패로 처리될 수 있어요.', yes: '나가기', no: '계속하기' },
    // 물러설 수도 있으니 판은 정말 나갈 때만 치운다
    () => { const gt = document.getElementById('game-table'); if (gt) gt.classList.remove('on'); socket.emit('leave_room'); goLobby(); });
}
function rematch(btn) {
  socket.emit('rematch');
  if (!isVsBot && btn) {
    btn.disabled = true; btn.style.opacity = '.5';
    document.getElementById('rematchNote').textContent = '상대에게 재대결 신청 — 대기 중…';
  }
}
socket.on('rematch_wanted', () => {
  document.getElementById('rematchNote').innerHTML = '💬 상대가 <b>재대결</b>을 원해요! 재대결 버튼을 누르세요';
});

// ── 내 차례 알림 (탭 제목 깜빡임 + 소리) ───────────────────
let titleBlink = null;
const BASE_TITLE = 'FLIP FLAP';
function startTitleBlink() {
  if (titleBlink) return;
  let on = false;
  // 탭 제목은 화면 밖이라 훑기 대상이 아니다 — 여기서 직접 바꾼다
  const alert = () => (window.FF ? FF.t('🔔 내 차례! — FLIP FLAP') : '🔔 내 차례! — FLIP FLAP');
  titleBlink = setInterval(() => { document.title = (on = !on) ? alert() : BASE_TITLE; }, 800);
}
function stopTitleBlink() { if (titleBlink) { clearInterval(titleBlink); titleBlink = null; } document.title = BASE_TITLE; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleBlink(); });
function isMyAction(s) {
  if (!s || isSpec) return false;
  if (s.phase === 'pick') return s.pick && s.pick.myChoice == null;
  if (['draw', 'offer', 'choose_type'].includes(s.phase)) return s.auctioneer === s.myIndex;
  if (s.phase === 'bidding') return s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted);
  return false;
}
let prevMyAction = false;

// ── 로비 모드 선택 (솔로/멀티) — 카드 위 팝업으로 표시 ──────
function openMode(m) {
  // 랭크게임 칸에 내 등급·RP 를 띄운다 — 무엇을 걸고 붙는지가 눌러 보기 전에 보인다
  if (m !== 'solo') {
    const side = document.getElementById('mmRank');
    if (side) side.innerHTML = myAccount
      ? `<b>${esc(myAccount.rank)}</b>${myAccount.rp} RP`
      : '<b>게스트</b>기록 안 됨';
  }
  document.getElementById(m === 'solo' ? 'soloModal' : 'multiModal').classList.add('show');
}
function closeModePanels() {
  document.getElementById('soloModal').classList.remove('show');
  document.getElementById('multiModal').classList.remove('show');
  window.dispatchEvent(new Event('ff:panelclose'));
}
function soloPlay(d) {
  closeModePanels(); difficulty = d;
  // 그물이 끊겨 있으면 화면이 혼자 굴린다. 규칙도 상대도 서버가 쓰는 그 파일이라
  // 판정은 온라인과 같다 — 다만 코인·전적은 안 남는다(서버만 줄 수 있다).
  if (!socket.connected && window.OFFLINE && OFFLINE.ready) return offlineStart(d);
  createRoom(true);
}
// 오프라인 판 시작 — game_start / state_update / game_over 를 화면에 그대로 흘려
// 넣는다. 화면은 서버에서 온 것인지 아닌지 알 필요가 없다.
function offlineStart(d, itemMode) {
  clearSession();
  onGameStart({ vsBot: true, difficulty: d, roomId: null, itemMode: !!itemMode,
                nicks: [getNick(), 'AI'], profiles: null });
  toast('📴 인터넷 없이 두는 판이에요. 코인·전적은 안 쌓여요.', 3400);
  OFFLINE.start(d, { onState: onStateUpdate, onOver: onGameOver }, !!itemMode);
}

// ── 튜토리얼 — 쉬움 AI와 실전 + 단계별 코치 ─────────────────
// 원칙: 한 번에 한 가지만, 짧게, "지금 뭘 클릭할지"를 반짝임으로 표시
let tutorial = false, tutSeen = {}, tutTarget = null;
const TUT_STEPS = [
  // ── 1부: 게임 소개 (대형 안내 — 화면 중앙) ──
  { id: 'intro', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">FLIP FLAP에 온 걸 환영해요! ${ico('🎩', 'tut-ico')}</div>
      <b>경매</b>로 카드를 모아 <b>세트</b>를 먼저 완성하면 승리하는 게임이에요.`,
    cards: `<div class="tut-cards" style="margin-top:14px"><span class="tcard k3"><i>1</i>3</span><span class="tcard k3"><i>2</i>3</span><span class="tcard k3"><i>4</i>3</span><span class="tvs">=</span><span class="twin">3짜리 3장 모으면 승리! ${ico('🏆', 'tut-ico')}</span></div>` },
  { id: 'cards1', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">카드 읽는 법 🃏</div>`,
    cards: `<div class="tut-arrows">
      <span class="ta-card">
        <span class="tcard k6 big"><i>1</i>6</span>
        <span class="ta-note ta-grade"><span class="ta-txt"><b>작은 숫자 = 등급</b><small>1등급이 최강</small></span></span>
        <span class="ta-note ta-kind"><span class="ta-txt"><b>큰 숫자 = 종류</b><small>이만큼 모으면 승리!</small></span></span>
      </span></div>` },
  { id: 'cards2', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">카드는 4종류, 총 24장 🗂</div>
      숫자가 <b>작을수록 강하고 희귀</b>해요. 2짜리는 단 2장만 모으면 이기지만, 세상에 2장뿐!`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2장</span><span style="margin-left:18px">5장</span><span style="margin-left:18px">7장</span><span style="margin-left:18px">10장</span></div>
      <div class="tut-cards" style="margin-top:8px"><span class="tcard k2"><i>1</i>2</span><span class="tvs">&gt;</span><span class="tcard k6"><i>1</i>6</span><span class="twin">배팅에선 2가 6을 이겨요</span></div>` },
  { id: 'flow', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">게임은 이렇게 흘러가요 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ <b>진행자</b>가 중앙덱에서 카드 1장 공개</div>
        <div>2️⃣ 진행자가 손패 1장을 추가로 출품 → <b>경매품 2장</b></div>
        <div>3️⃣ 두 사람 모두 손패에서 1장씩 <b>배팅</b></div>
        <div>4️⃣ 더 <b>강한 카드</b>를 낸 사람이 경매품을 다 가져감!</div>
        <div>5️⃣ 배팅에 쓴 카드는 <b>서로 맞바꿔</b> 상대 손으로 건너감</div>
        <div>6️⃣ 이렇게 <b>낙찰받은 카드로만</b> 세트 완성 (손패는 세트 불인정!)</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">직접 해보면 금방 알아요. 시작!</div>` },
  // ── 2부: 실전 연계 (액션 안내) ──
  { id: 'pick', when: s => s.phase === 'pick' && s.pick && s.pick.myChoice == null,
    pos: 'bot', target: '#auctionItems',
    text: '먼저 <b>선공 뽑기</b>!',
    act:  '반짝이는 두 장 중 <b>한 장을 탭</b>하세요 — 강한 카드를 뽑으면 선공!' },
  { id: 'pickr', when: s => s.phase === 'pick_reveal',
    pos: 'bot',
    text: '카드 공개! 강한 카드를 뽑은 쪽이 첫 <b>경매 진행자</b>가 돼요. (진행자는 매 턴 교대)' },
  { id: 'draw_me', when: s => s.phase === 'draw' && s.auctioneer === s.myIndex,
    pos: 'bot', target: '#deckStack',
    text: '이번 턴 진행자는 <b>나</b>! 경매품부터 공개해볼까요?',
    act:  '왼쪽 <b>덱을 탭</b>!' },
  { id: 'offer_me', when: s => s.phase === 'offer' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#myHand',
    text: '중앙 카드가 공개됐어요! 이제 <b>내 손패 1장</b>을 추가로 출품 — 이 2장이 경매품이 돼요.',
    act:  '아래 손패에서 <b>내놓을 카드를 탭</b>하세요' },
  { id: 'type_big', when: s => s.phase === 'choose_type' && s.auctioneer === s.myIndex, big: true,
    text: `<div class="tut-h">경매 방식을 골라요 🎭</div>
      <div class="tut-two">
        <div class="tt-p"><b>👁 오픈</b><br>경매품 <b>공개</b><br>배팅 <b>비밀</b><br><small>서로 얼마 낼지 몰라 눈치싸움</small></div>
        <div class="tt-p"><b>🙈 클로즈</b><br>출품카드 <b>비밀</b><br>배팅 <b>공개</b><br><small>뭐가 걸렸는지 몰라 도박</small></div>
      </div>` },
  { id: 'type_me', when: s => s.phase === 'choose_type' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#actionArea',
    act:  '원하는 방식을 <b>탭</b>하세요', text: '' },
  { id: 'bid_me', when: s => s.phase === 'bidding' && s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted),
    pos: 'top', target: '#myHand',
    text: '<b>배팅!</b> 강한 카드를 낸 사람이 경매품 2장을 다 가져가요. ⚠️ 배팅한 카드는 <b>서로 교환</b>돼요.',
    act:  '손패에서 카드 탭 → <b>배팅 확정</b>' },
  { id: 'reveal', when: s => s.phase === 'reveal',
    pos: 'top',
    text: '두구두구… 결과 공개! 이긴 쪽이 경매품을 <b>자기 앞에</b> 깔아요.' },
  // 이 게임에서 제일 자주 놓치는 규칙. 낸 카드가 사라진다고 생각하면
  // "센 카드를 아끼자" 라는 잘못된 감각이 자리잡는다. 방금 낸 두 장을
  // 그대로 집어 보여 준다 — 예시 카드로는 실감이 안 난다.
  { id: 'swap_rule',
    when: s => s.phase === 'reveal' && s.auction && s.auction.myBid && s.auction.oppBid,
    big: true,
    text: s => {
      const a = (s && s.auction) || {};
      if (!a.myBid || !a.oppBid) return `<div class="tut-h">낸 카드는 어디로 갈까요? 🔁</div>배팅에 쓴 카드는 버려지지 않아요. 두 사람이 낸 카드를 <b>서로 맞바꿔</b> 각자 상대 손으로 건너갑니다.`;
      const c = (x) => `<span class="tcard k${x.kind}"><i>${x.grade}</i>${x.kind}</span>`;
      return `<div class="tut-h">낸 카드는 어디로 갈까요? 🔁</div>
        방금 두 사람이 낸 배팅 카드는 <b>버려지지 않아요</b>.
        <div class="tut-swap">
          <div class="ts-row"><span class="ts-lbl">내가 낸</span>${c(a.myBid)}
            <span class="ts-arw">→</span><span class="ts-dst">상대 손패로</span></div>
          <div class="ts-row"><span class="ts-lbl">상대가 낸</span>${c(a.oppBid)}
            <span class="ts-arw">→</span><span class="ts-dst mine">내 손패로</span></div>
        </div>
        <div class="tut-note">서로 <b>맞바꿉니다.</b> 그래서 센 카드를 내면 이기기는 쉬워도 <b>그 카드를 상대에게 쥐여 주는</b> 셈이에요.</div>`;
    } },
  // 손과 앞의 차이 — 위 규칙과 붙여 놓아야 "왜 맞바꿔도 괜찮은가" 가 이어진다
  { id: 'where_rule', when: s => tutSeen.swap_rule, big: true,
    text: `<div class="tut-h">카드가 놓이는 자리는 두 곳 🗺</div>
      <div class="tut-two">
        <div class="tt-p"><b>🖐 손패</b><br>배팅에 쓰는 카드<br>
          <small>맞바꿔 오간다<br><b>세트로 안 쳐 줍니다</b></small></div>
        <div class="tt-p"><b>🏅 내 앞</b><br>낙찰받은 경매품<br>
          <small>여기 쌓인 것만<br><b>세트가 됩니다</b></small></div>
      </div>
      <div class="tut-note">손에 3짜리를 세 장 들고 있어도 이기지 못해요. <b>경매로 따내야</b> 합니다.</div>` },
  { id: 'acquired', when: s => tutSeen.reveal && ((s.myAcq || []).length > 0 || (s.oppAcq || []).length > 0) && s.phase !== 'reveal',
    pos: 'top',
    text: '🎯 방금 딴 카드가 <b>테이블 앞에</b> 깔렸죠? <b>이렇게 깔린 카드로만</b> 세트를 만들 수 있어요 — 손에 든 카드는 세트가 안 돼요!' },
  { id: 'draw_opp', when: s => s.phase === 'draw' && s.auctioneer !== s.myIndex,
    pos: 'bot',
    text: '이번 턴 진행자는 <b>상대</b>예요. 곧 배팅 차례가 오니 잠깐만 ☕' },
  // ── 3부: 비밀 병기 (마지막 규칙) ──
  { id: 'betray_rule', when: s => tutSeen.reveal && s.turn >= 2, big: true,
    text: `<div class="tut-h">마지막 비밀 하나 ⚔️</div>
      가장 약한 <b>6-10</b>이 딱 하나, 가장 강한 <b>2-1</b>만은 이겨요.<br>이름하여 <b>졸개의 배신</b>!`,
    cards: `<div class="tut-cards" style="margin-top:12px"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 승리!</span></div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">상대가 에이스를 낼 타이밍에 노려보세요 😏</div>` },
  { id: 'betray',   // 실제로 6-10이나 2-1이 내 손에 들어온 순간 리마인드
    when: s => tutSeen.betray_rule && (s.myHand || []).some(c => (c.kind === 6 && c.grade === 10) || (c.kind === 2 && c.grade === 1)),
    pos: 'top',
    text: (s => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 지금 손에 <b>6-10</b>이 있어요 — 상대가 2-1을 낼 것 같으면 <b>배신</b>을 노려보세요!'
      : '👀 지금 손에 <b>2-1</b>이 있어요 — 최강이지만 <b>6-10</b>한테만 져요. 조심!') },
];
function startTutorial() {
  tutorial = true; tutSeen = {};
  tutSteps = TUT_STEPS;
  difficulty = 'easy';
  createRoom(true);
}

// ── 모드별 실전 튜토리얼 ────────────────────────────────────────────────
// 넘겨 보는 안내는 읽고 나면 남는 게 없다. 클래식이 그랬듯 나머지도 실제 판을
// 두면서 배운다 — 판이 그 상황에 닿는 순간 그 자리를 짚어 준다.
// 엔진마다 상태 모양이 달라서 단계 목록만 따로 두고, 재는 방식은 같다.
let tutSteps = TUT_STEPS;

// 🎪 아이템전 — 엔진은 클래식과 같다. 아이템이 끼는 대목만 얹는다.
const TUT_ITEM = [
  { id: 'i_intro', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">아이템전에 온 걸 환영해요! ${ico('🎪', 'tut-ico')}</div>
      규칙은 <b>클래식과 똑같아요</b> — 경매로 카드를 모아 세트를 먼저 완성하면 승리.<br>
      달라지는 건 <b>아이템</b>이 끼어든다는 것 하나예요.` },
  // 무엇이 있는지를 먼저 보여 준다. 판에서 하나씩 만나기를 기다리면
  // 열세 가지 중 두어 개만 보고 튜토리얼이 끝난다.
  { id: 'i_kinds', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">아이템은 13가지, 크게 세 갈래 🧰</div>
      <div class="tut-kinds">
        <div class="tk-row"><span class="tk-h">👀 엿보기</span>
          <span class="tk-i">🔍 돋보기</span><span class="tk-i">📏 눈금자</span>
          <span class="tk-d">상대 손패나 배팅을 미리 본다</span></div>
        <div class="tk-row"><span class="tk-h">🌀 뒤흔들기</span>
          <span class="tk-i">🔄 뒤집개</span><span class="tk-i">💨 연막탄</span>
          <span class="tk-i">💣 폭탄</span><span class="tk-i">🧿 부적</span>
          <span class="tk-d">이번 경매의 규칙 자체를 바꾼다</span></div>
        <div class="tk-row"><span class="tk-h">💥 빼앗기</span>
          <span class="tk-i">🐈 도둑고양이</span><span class="tk-i">👑 폭군</span>
          <span class="tk-i">🖨️ 복사기</span><span class="tk-i">🎴 고르기</span>
          <span class="tk-d">따 놓은 카드를 직접 건드린다</span></div>
      </div>
      <div class="tut-note">지금 다 외울 필요 없어요. 손에 들어오면 <b>탭해서 설명을 볼 수 있습니다.</b></div>` },
  { id: 'i_cards', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">아이템은 덱에서 카드로 들어와요 🃏</div>
      중앙 덱에 <b>아이템 카드 넉 장</b>이 섞여 있어요.<br>
      뽑히면 그 자리에서 <b>한 장 더</b> 뽑아 경매를 이어갑니다.
      <div class="tut-two" style="margin-top:10px">
        <div class="tt-p"><b>🎁 보너스</b><br>뒤집은 <b>진행자</b>가<br>바로 가져간다
          <small>덱에서 손으로 날아감</small></div>
        <div class="tt-p"><b>🏷 덤</b><br>그 경매에서 <b>진 쪽</b>이<br>가져간다
          <small>앞면으로 공개돼 걸려 있음</small></div>
      </div>
      <div class="tut-note">둘 다 곧 나옵니다 — 직접 보면 금방 알아요.</div>` },
  { id: 'i_draw', when: s => s.phase === 'draw' && s.auctioneer === s.myIndex,
    pos: 'bot', target: '#deckStack',
    text: '첫 턴 진행자는 <b>나</b>. 덱을 뒤집어 볼까요?',
    act: '왼쪽 <b>덱을 탭</b>!' },
  // 각본상 첫 장이 보너스다(server: createGame 의 tutorial 덱). 그래서 이 둘은 반드시 뜬다.
  { id: 'i_bonus', when: s => s.auction && s.auction.bonusCard, big: true,
    text: `<div class="tut-h">🎁 보너스가 나왔어요!</div>
      덱을 뒤집은 <b>진행자</b>가 그 자리에서 가져갑니다.<br>
      진행자는 턴마다 번갈아 맡으니, 공짜라도 한쪽으로만 기울지 않아요.` },
  { id: 'i_got', when: s => (s.myItems || []).length > 0,
    pos: 'bot', target: '#itemSlots',
    text: s => {
      const first = (s.myItems || [])[0];
      const known = { magnify: ['🔍 돋보기', '상대 손패 두 장을 몰래 본다'],
                      scan: ['📏 눈금자', '상대가 낸 배팅 카드의 세기를 잰다'] };
      const k = first && known[typeof first === 'string' ? first : first.id];
      return k
        ? `🎉 <b>${k[0]}</b> 이(가) 손에 들어왔어요 — <i>${k[1]}</i>.<br>
           아이템은 아래 칸에 쌓입니다. <b>최대 3개</b>까지 들고, 한 턴에 <b>1개</b>만 써요.`
        : `🎉 <b>아이템이 들어왔어요!</b> 아래 칸에 쌓입니다.<br>최대 <b>3개</b>까지 들고, 한 턴에 <b>1개</b>만 써요.`;
    },
    act: '아이템을 <b>탭</b>하면 무엇인지, 언제 쓸 수 있는지 나와요' },
  { id: 'i_offer', when: s => s.phase === 'offer' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#myHand',
    text: '클래식과 같아요 — <b>내 손패 1장</b>을 얹어 경매품 2장을 만듭니다.',
    act: '내놓을 카드를 <b>탭</b>하세요' },
  { id: 'i_use', when: s => (s.myItems || []).length > 0 && s.phase === 'bidding' && s.auction && !s.auction.myBid,
    pos: 'bot', target: '#itemSlots',
    text: '지금이 <b>아이템을 쓸 수 있는 순간</b>이에요. 배팅 카드를 내기 전에만 씁니다 — 결과를 보고 무르는 건 안 돼요.',
    act: '써 보고 싶으면 아이템을 <b>탭</b>, 아니면 그냥 배팅하세요' },
  { id: 'i_bid', when: s => tutSeen.i_use && s.phase === 'bidding' && s.auction && !s.auction.myBid,
    pos: 'top', target: '#myHand',
    text: '<b>배팅!</b> 낸 카드를 서로 맞바꾸는 것도 클래식과 똑같습니다.',
    act: '카드 탭 → <b>배팅 확정</b>' },
  // 각본상 둘째 턴에 덤이 걸린다
  { id: 'i_tip', when: s => s.auction && s.auction.tipCard, big: true,
    text: `<div class="tut-h">🏷 이번엔 덤이 걸렸어요!</div>
      보너스와 반대예요 — 이 경매에서 <b>진 쪽</b>이 저 아이템을 가져갑니다.<br>
      무엇인지 <b>앞면으로 보이니까</b>, "저걸 받으려고 이 판은 져 줄까?" 를 저울질하게 돼요.
      <div class="tut-note">아이템전이 클래식과 갈리는 지점이 여기예요.
      <b>지는 것이 이득일 때가 생깁니다.</b></div>` },
  { id: 'i_wrap', when: s => tutSeen.i_tip && s.turn >= 3, big: true,
    text: `<div class="tut-h">여기까지! 🎪</div>
      아이템은 <b>세기보다 순서</b>예요 — 언제 쓰느냐가 무엇을 쓰느냐보다 큽니다.<br>
      남은 판은 직접 해 보세요. 아이템 설명은 언제든 탭해서 볼 수 있어요.` },
];

// 🔵 TWELVE — 상태 모양이 다르다(tvView). 칩 경제가 핵심이라 거기에 집중한다.
const TUT_TV = [
  { id: 't_intro', when: v => v.turn === 1 && v.phase === 'draw', big: true,
    text: `<div class="tut-h">TWELVE 에 온 걸 환영해요! ${ico('🔵', 'tut-ico')}</div>
      카드는 클래식과 같아요. 다른 건 <b>무엇으로 사느냐</b>예요 —<br>손패 대신 <b>칩 20개</b>로 값을 부릅니다.` },
  { id: 't_burn', when: v => v.turn === 1 && v.phase === 'draw', big: true,
    text: `<div class="tut-h">지기만 해도 칩이 녹아요 💧</div>
      여기가 핵심이에요. 클래식은 낸 카드가 상대에게 넘어가지만,<br>TWELVE 에서는 칩이 <b>은행으로 사라집니다</b>.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>이긴 쪽</b><br>부른 값 <b>전부</b><small>대신 경매품 두 장을 다 가져갑니다</small></div>
        <div class="tt-p"><b>진 쪽</b><br>부른 값의 <b>절반</b><small>카드는 못 받고 칩만 반 잃어요</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">그래서 <b>언제 물러설지</b>가 곧 실력입니다</div>` },
  { id: 't_draw', when: v => v.phase === 'draw' && v.auctioneer === v.me,
    pos: 'bot', target: '#tv-deck',
    text: '내가 진행자예요. 중앙 덱에서 한 장 뒤집어 봅시다.',
    act: '<b>덱을 탭</b>!' },
  { id: 't_offer', when: v => v.phase === 'offer' && v.auctioneer === v.me,
    pos: 'top', target: '#tv-myHand',
    text: '손패에서 <b>한 장을 더</b> 얹어요 — 이 둘이 경매품입니다.',
    act: '내놓을 카드를 <b>탭</b>' },
  { id: 't_type', when: v => v.phase === 'choose' && v.auctioneer === v.me, big: true,
    text: `<div class="tut-h">오픈과 클로즈 🎭</div>`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>👁 오픈</b><br>값을 <b>서로 보이며</b> 번갈아 올려요<small>한 명이 물러설 때까지 계속</small></div>
        <div class="tt-p"><b>🙈 클로즈</b><br><b>짝수</b>를 한 번 부릅니다<small>값은 보이지만 출품 카드는 가려져요</small></div>
      </div>` },
  { id: 't_bid', when: v => v.phase === 'bid' && v.lot && v.lot.turnToAct === v.me,
    pos: 'top', target: '#tv-actions',
    text: '값을 부를 차례예요. 앞사람보다 많이 부르거나 <b>물러섭니다</b>.',
    act: '아래에서 <b>부르기</b> 또는 <b>물러서기</b>' },
  // 클로즈에서 값을 부른 뒤가 이 모드에서 제일 헷갈리는 대목이다. 값만 부르고
  // 끝나는 게 아니라, 가려져 있던 출품 카드를 그때 보고 살지 말지 고른다.
  { id: 't_close', when: v => v.phase === 'close', big: true,
    text: `<div class="tut-h">가려진 걸 보고 정합니다 🙈</div>
      클로즈에서는 값을 먼저 부르고, <b>그다음에</b> 출품 카드가 열려요.
      열린 걸 보고 <b>살지 말지</b> 지금 고릅니다.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>내고 사기</b><br>부른 값을 <b>전부</b> 냅니다<small>경매품 두 장을 다 가져와요</small></div>
        <div class="tt-p"><b>안 사기</b><br>부른 값의 <b>절반</b>만<small>카드는 못 받아요</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">값을 크게 부르면 안 사기도 비쌉니다</div>` },
  { id: 't_settle', when: v => v.phase === 'settled' && v.turn === 1, big: true,
    text: `<div class="tut-h">칩은 은행으로 갑니다 🏦</div>
      방금 낸 칩은 상대에게 가는 게 아니라 <b>판에서 사라져요</b>.
      그래서 둘 다 크게 부르면 둘 다 가난해집니다 — 이 판의 긴장이 거기 있어요.` },
  { id: 't_chips', when: v => v.chips && v.chips.me < 20,
    pos: 'top', target: '#tv-rail',
    text: '💧 칩이 줄었죠? <b>이긴 쪽도 진 쪽도</b> 냅니다.<br>칩이 <b>0</b>이 되면 그 자리에서 져요 — 아껴 쓰세요.' },
  // 값 부르기는 t_bid 에서 이미 배웠다. 두 번째 차례에 물러서기를 짚는다 —
  // 이길 수 없는 판에서 빠지는 게 이 모드의 절반이다.
  { id: 't_fold', when: v => v.phase === 'bid' && v.lot && v.lot.turnToAct === v.me && v.lot.canFold,
    pos: 'top', target: '#tv-actions',
    text: '이 경매, 꼭 이겨야 할까요? <b>물러서면</b> 부른 값의 절반만 잃고 빠집니다.<br>못 이길 판에서 빠지는 것도 수예요.',
    act: '값이 아깝다 싶으면 <b>물러서기</b>' },
];

// 👥 다인전 — 사람이 늘면서 달라지는 것만. 역순 회수가 이 판의 심장이다.
const TUT_Q4 = [
  { id: 'q_intro', when: s => s.turn === 1 && s.phase === 'draw', big: true,
    text: `<div class="tut-h">다인전에 온 걸 환영해요! ${ico('👥', 'tut-ico')}</div>
      기본은 2인전과 같아요 — <b>세트를 먼저 완성</b>하면 승리.<br>사람이 늘면서 달라지는 것만 짚어 볼게요.` },
  { id: 'q_all', when: s => s.turn === 1 && s.phase === 'draw', big: true,
    text: `<div class="tut-h">진행자도 같이 배팅해요</div>
      2인전과 다른 첫 번째. 진행자는 출품만 하고 빠지는 게 아니라<br><b>자기도 배팅 카드를 냅니다</b>.` },
  { id: 'q_rev', when: s => s.turn === 1 && s.phase === 'draw', big: true,
    text: `<div class="tut-h">배팅 카드는 역순으로 돌아와요 ♻️</div>
      여기가 이 판의 심장입니다. 낸 카드는 버려지지 않고 <b>서로 바꿔 갖습니다</b>.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>1위로 부름</b><br>경매품 2장 획득<small>대신 가장 약한 배팅 카드를 받아요</small></div>
        <div class="tt-p"><b>꼴등</b><br>경매품은 못 받음<small>대신 가장 강한 배팅 카드를 받아요</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">그래서 <b>지는 것도 수가 됩니다</b></div>` },
  // 덱이 커지니 "모아야 하는 장수도 늘겠지" 하고 넘겨짚기 쉽다. 안 는다.
  { id: 'q_deck', when: s => s.turn === 1 && s.phase === 'draw', big: true,
    text: s => `<div class="tut-h">덱은 커지고, 목표는 그대로 🗂</div>
      ${s && s.n === 3 ? '셋이면 30장' : '넷이면 38장'} — 사람이 늘어난 만큼 카드도 늘어요.
      하지만 <b>모아야 하는 장수는 2인전과 같습니다</b>.`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2장</span><span style="margin-left:18px">3장</span><span style="margin-left:18px">4장</span><span style="margin-left:18px">6장</span></div>
      <div class="tut-note">숫자가 곧 모아야 할 장수예요 — 사람이 몇이든 똑같습니다.</div>` },
  { id: 'q_bid', when: s => s.phase === 'bidding' && !s.seats[s.me].bidded && s.bidders.includes(s.me),
    pos: 'top', target: '#q-myhand',
    text: '배팅할 차례예요. 이길지, 일부러 져서 <b>강한 카드를 챙길지</b> 고르세요.',
    act: '카드 탭 → <b>배팅 확정</b>' },
  { id: 'q_seq', when: s => s.phase === 'bidding' && s.auction && s.auction.closed,
    pos: 'bot',
    text: '🙈 클로즈는 <b>순서대로 한 명씩</b> 공개하며 냅니다.<br>뒤에 내는 사람은 앞사람 카드를 다 보고 정해요.' },
  { id: 'q_got', when: s => (s.seats[s.me].acq || []).length > 0,
    pos: 'top', target: '#q-myacq',
    text: '🎯 딴 카드는 <b>내 앞에</b> 깔립니다. <b>이렇게 깔린 카드로만</b> 세트를 만들어요.' },
  // 진행자가 돌아간다는 걸 모르면 "왜 나만 계속 뽑지" 로 읽힌다
  { id: 'q_turn', when: s => s.turn >= 2 && s.phase === 'draw',
    pos: 'bot',
    text: '🔄 진행자는 <b>턴마다 한 자리씩</b> 옮겨 가요. 곧 다시 내 차례가 옵니다.' },
];

// 🎴 미니게임 — 경매가 아니라 배팅. 족보와 읽기 싸움만 짚는다.
const TUT_MN = [
  { id: 'm_intro', when: v => v.round === 1, big: true,
    text: `<div class="tut-h">두 장 승부에 온 걸 환영해요! ${ico('🎴', 'tut-ico')}</div>
      본 게임과 규칙이 아예 달라요. 경매가 아니라 <b>섯다식 배팅</b>입니다.<br>
      카드 두 장을 <b>서로 안 보이게</b> 쥐고 돈을 겁니다.` },
  { id: 'm_flow', when: v => v.round === 1, big: true,
    text: `<div class="tut-h">한 판의 흐름 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ 모두 <b>40달</b>을 걸고 카드를 <b>한 장</b>씩</div>
        <div>2️⃣ 한 명 빼고 다 맞추거나 접으면 라운드가 닫혀요</div>
        <div>3️⃣ 둘 이상 남으면 <b>한 장 더</b> 받고 두 번째 배팅</div>
        <div>4️⃣ 패를 열고 <b>족보</b>로 가릅니다</div>
      </div>` },
  { id: 'm_act', when: v => v.turn === v.me && v.actions && v.actions.length,
    pos: 'top', target: '#mnBtns',
    text: '내 차례예요. 보이는 카드가 하나도 없죠? 읽을 것은 <b>남이 얼마를 언제 거는가</b> 뿐입니다.',
    act: '아래에서 <b>걸기·맞추기·접기</b>를 고르세요' },
  { id: 'm_two', when: v => v.round === 2, big: true,
    text: `<div class="tut-h">족보는 세 갈래 🎴</div>
      <div class="tut-steps">
        <div>🔥 <b>땡</b> — 같은 종류 두 장 · 2땡 &gt; 3땡 &gt; 4땡 &gt; 6땡</div>
        <div>🎯 <b>짝</b> — 등급이 같은 두 장 · 등급이 낮을수록 강함</div>
        <div>🃏 <b>끗</b> — 나머지 · 종류 합이 <b>작을수록</b> 강함</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">땡은 어떤 짝보다, 짝은 어떤 끗보다 강합니다</div>` },
  { id: 'm_jol', when: v => v.myEval && v.myEval.jol, big: true,
    text: `<div class="tut-h">졸개의 배신! ⚔️</div>
      지금 쥔 <b>4-6 + 6-8</b> 은 덱에서 가장 약한 두 장인데,<br>이 조합만은 <b>땡을 전부 잡습니다</b>. 190가지 중 딱 하나예요.` },
];

// ── 튜토리얼 일본어판 ────────────────────────────────────────────
// TUT_EN 과 같은 열쇠를 쓴다. when 판정은 한 벌만 유지되고(판정이 갈라지면
// 언어에 따라 안내가 다른 순간에 뜬다), 글만 갈아 끼운다.
const TUT_JA = {
  // ── 클래식 ──
  intro: { text: `<div class="tut-h">FLIP FLAP へようこそ！ ${ico('🎩', 'tut-ico')}</div>
      <b>競り</b>で札を集め、先に<b>セット</b>を揃えたほうが勝ちです。`,
    cards: `<div class="tut-cards" style="margin-top:14px"><span class="tcard k3"><i>1</i>3</span><span class="tcard k3"><i>2</i>3</span><span class="tcard k3"><i>4</i>3</span><span class="tvs">=</span><span class="twin">3 を3枚そろえれば勝ち！ ${ico('🏆', 'tut-ico')}</span></div>` },
  cards1: { text: `<div class="tut-h">札の読みかた 🃏</div>`,
    cards: `<div class="tut-arrows">
      <span class="ta-card">
        <span class="tcard k6 big"><i>1</i>6</span>
        <span class="ta-note ta-grade"><span class="ta-txt"><b>小さい数字＝等級</b><small>1等級がいちばん強い</small></span></span>
        <span class="ta-note ta-kind"><span class="ta-txt"><b>大きい数字＝種類</b><small>この枚数そろえれば勝ち！</small></span></span>
      </span></div>` },
  cards2: { text: `<div class="tut-h">札は4種類、全部で24枚 🗂</div>
      数字が<b>小さいほど強く、そして少ない</b>。2 は2枚そろえれば勝ちですが、世に2枚しかありません。`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2枚</span><span style="margin-left:18px">5</span><span style="margin-left:18px">7</span><span style="margin-left:18px">10</span></div>
      <div class="tut-cards" style="margin-top:8px"><span class="tcard k2"><i>1</i>2</span><span class="tvs">&gt;</span><span class="tcard k6"><i>1</i>6</span><span class="twin">入札では 2 が 6 に勝ちます</span></div>` },
  flow: { text: `<div class="tut-h">一手の流れ 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ <b>親</b>が山札から1枚めくる</div>
        <div>2️⃣ 親が手札から1枚を足す → <b>競り札2枚</b></div>
        <div>3️⃣ ふたりとも手札から1枚<b>入札</b></div>
        <div>4️⃣ <b>強い札</b>を出したほうが競り札を全部取る！</div>
        <div>5️⃣ 入札した2枚は<b>そのまま交換</b>され、相手の手札へ渡る</div>
        <div>6️⃣ セットになるのは<b>落札した札だけ</b>（手札は数えません）</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">打てばすぐ分かります。はじめましょう！</div>` },
  pick: { text: 'まずは<b>先手決め</b>！',
    act: '光っている2枚から<b>1枚をタップ</b> — 強い札を引いたほうが先手です！' },
  pickr: { text: '公開！ 強い札を引いたほうが最初の<b>親</b>になります。（親はターンごとに交代）' },
  draw_me: { text: 'このターンの親は<b>自分</b>です。まずは競り札を開きましょう。',
    act: '左の<b>山札をタップ</b>！' },
  offer_me: { text: '場札が開きました！ ここに<b>手札から1枚</b>を足します — この2枚が競り札になります。',
    act: '下の手札から<b>出す札をタップ</b>してください' },
  type_big: { text: `<div class="tut-h">競りの方式を選びます 🎭</div>
      <div class="tut-two">
        <div class="tt-p"><b>👁 オープン</b><br>競り札は<b>公開</b><br>入札は<b>秘密</b><br><small>相手がいくら出すか分からない読み合い</small></div>
        <div class="tt-p"><b>🙈 クローズ</b><br>出し札は<b>秘密</b><br>入札は<b>公開</b><br><small>中身が分からないまま賭ける</small></div>
      </div>` },
  type_me: { act: '好きな方式を<b>タップ</b>してください', text: '' },
  bid_me: { text: '<b>入札！</b> 強い札を出したほうが競り札2枚をすべて取ります。⚠️ 入札した札は<b>お互いに交換</b>されます。',
    act: '手札をタップ →<b>入札を確定</b>' },
  reveal: { text: 'ドコドコ…結果発表！ 勝ったほうが競り札を<b>自分の前</b>に並べます。' },
  swap_rule: { text: (s) => {
      const a = (s && s.auction) || {};
      if (!a.myBid || !a.oppBid) return `<div class="tut-h">出した札はどこへ行く？ 🔁</div>入札した札は捨てられません。ふたりが出した札は<b>そのまま交換</b>され、それぞれ相手の手札へ渡ります。`;
      const c = (x) => `<span class="tcard k${x.kind}"><i>${x.grade}</i>${x.kind}</span>`;
      return `<div class="tut-h">出した札はどこへ行く？ 🔁</div>
        いまふたりが出した入札の札は<b>捨てられません</b>。
        <div class="tut-swap">
          <div class="ts-row"><span class="ts-lbl">自分が出した</span>${c(a.myBid)}
            <span class="ts-arw">→</span><span class="ts-dst">相手の手札へ</span></div>
          <div class="ts-row"><span class="ts-lbl">相手が出した</span>${c(a.oppBid)}
            <span class="ts-arw">→</span><span class="ts-dst mine">自分の手札へ</span></div>
        </div>
        <div class="tut-note">お互いに<b>交換します。</b>だから強い札を出せば勝ちやすい代わりに、<b>その札を相手に握らせる</b>ことになります。</div>`;
    } },
  where_rule: { text: `<div class="tut-h">札が置かれる場所はふたつ 🗺</div>
      <div class="tut-two">
        <div class="tt-p"><b>🖐 手札</b><br>入札に使う札<br>
          <small>交換で行き来する<br><b>セットには数えません</b></small></div>
        <div class="tt-p"><b>🏅 自分の前</b><br>落札した競り札<br>
          <small>ここに積まれたものだけが<br><b>セットになります</b></small></div>
      </div>
      <div class="tut-note">手札に 3 を3枚持っていても勝てません。<b>競りで取る</b>必要があります。</div>` },
  acquired: { text: '🎯 いま取った札が<b>自分の前</b>に並びましたね。セットになるのは<b>そこに並んだ札だけ</b>です — 手札は数えません！' },
  draw_opp: { text: 'このターンの親は<b>相手</b>です。まもなく入札の番が来ます ☕' },
  betray_rule: { text: `<div class="tut-h">最後にひとつ秘密を ⚔️</div>
      いちばん弱い<b>6-10</b>が、ただひとつ、いちばん強い<b>2-1</b>にだけ勝ちます。<br>名づけて<b>下っ端の裏切り</b>！`,
    cards: `<div class="tut-cards" style="margin-top:12px"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 の勝ち！</span></div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">相手がエースを出しそうな瞬間を狙ってみてください 😏</div>` },
  betray: { text: (s) => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 いま手札に<b>6-10</b>があります — 相手が 2-1 を出しそうなら<b>裏切り</b>を狙いましょう！'
      : '👀 いま手札に<b>2-1</b>があります — 最強ですが<b>6-10</b>にだけ負けます。ご注意を！' },

  // ── 아이템전 ──
  i_intro: { text: `<div class="tut-h">アイテム戦へようこそ！ ${ico('🎪', 'tut-ico')}</div>
      ルールは<b>クラシックとまったく同じ</b>です — 競りで札を取り、先にセットを揃える。<br>
      違うのは<b>アイテム</b>が絡むことだけ。` },
  i_kinds: { text: `<div class="tut-h">アイテムは13種、三つの系統 🧰</div>
      <div class="tut-kinds">
        <div class="tk-row"><span class="tk-h">👀 のぞく</span>
          <span class="tk-i">🔍 虫めがね</span><span class="tk-i">📏 ものさし</span>
          <span class="tk-d">決める前に相手の手札や入札を見る</span></div>
        <div class="tk-row"><span class="tk-h">🌀 かき乱す</span>
          <span class="tk-i">🔄 反転</span><span class="tk-i">💨 煙幕</span>
          <span class="tk-i">💣 爆弾</span><span class="tk-i">🧿 お守り</span>
          <span class="tk-d">この競りだけルールを変える</span></div>
        <div class="tk-row"><span class="tk-h">💥 奪う</span>
          <span class="tk-i">🐈 ドロボウネコ</span><span class="tk-i">👑 暴君</span>
          <span class="tk-i">🖨️ コピー機</span><span class="tk-i">🎴 選び取り</span>
          <span class="tk-d">すでに落札された札にまで手を伸ばす</span></div>
      </div>
      <div class="tut-note">覚える必要はありません。手に入ったら<b>タップして効果を読めます。</b></div>` },
  i_cards: { text: `<div class="tut-h">アイテムは山札から札として出ます 🃏</div>
      山札には<b>アイテム札が4枚</b>混ぜてあります。<br>
      出てきたらすぐ次の札をめくり、競りはそのまま続きます。
      <div class="tut-two" style="margin-top:10px">
        <div class="tt-p"><b>🎁 ボーナス</b><br>めくった<b>親</b>が<br>その場でもらう
          <small>山札から手元へ飛んできます</small></div>
        <div class="tt-p"><b>🏷 おまけ</b><br>その競りに<b>負けた</b><br>ほうがもらう
          <small>競り札の上に表向きで載ります</small></div>
      </div>
      <div class="tut-note">どちらもこのあと出てきます — 実際に見てみましょう。</div>` },
  i_draw: { text: '最初のターンの親は自分です。山札をめくってみましょうか。',
    act: '左の<b>山札をタップ</b>！' },
  i_bonus: { text: `<div class="tut-h">🎁 ボーナスが出ました！</div>
      めくった<b>親</b>がその場で受け取ります。<br>
      親はターンごとに交代するので、ただでもらえても片方に偏りません。` },
  i_got: { text: (s) => {
      const first = (s.myItems || [])[0];
      const known = { magnify: ['🔍 虫めがね', '相手の手札を2枚のぞき見る'],
                      scan: ['📏 ものさし', '相手の入札の強さを測る'] };
      const k = first && known[typeof first === 'string' ? first : first.id];
      return k
        ? `🎉 <b>${k[0]}</b>が手に入りました — <i>${k[1]}</i>。<br>
           アイテムは下の枠に溜まります。持てるのは<b>3つ</b>、1ターンに使えるのは<b>1つ</b>です。`
        : `🎉 <b>アイテム！</b> 下の枠に溜まります。<br>持てるのは<b>3つ</b>、1ターンに使えるのは<b>1つ</b>です。`;
    },
    act: '<b>アイテムをタップ</b>すると、効果と使える場面が読めます' },
  i_offer: { text: 'クラシックと同じ — <b>手札から1枚</b>足して競り札2枚にします。',
    act: '出す札を<b>タップ</b>' },
  i_use: { text: 'ここが<b>アイテムを使う場面</b>です。入札する前だけ — 結果を見てから取り消すことはできません。',
    act: 'アイテムをタップして使うか、そのまま入札してください' },
  i_bid: { text: '<b>入札！</b> ここでも入札した札は、クラシックとまったく同じように交換されます。',
    act: '手札をタップ →<b>入札を確定</b>' },
  i_tip: { text: `<div class="tut-h">🏷 今回はおまけが懸かっています！</div>
      ボーナスとは逆で、この競りに<b>負けた</b>ほうがそのアイテムを取ります。<br>
      中身は<b>はっきり見えている</b>ので、「これはわざと譲る価値があるか？」と考え始めることになります。
      <div class="tut-note">ここがアイテム戦とクラシックの分かれ道です。
      <b>負けたほうが得な場面もあります。</b></div>` },
  i_wrap: { text: `<div class="tut-h">ひととおり出ました！ 🎪</div>
      アイテムは<b>強さより間合い</b>です — どれを使うかより、いつ使うかが効きます。<br>
      あとは自分で打ってみてください。アイテムはいつでもタップして読めます。` },

  // ── TWELVE ──
  t_intro: { text: `<div class="tut-h">TWELVE へようこそ！ ${ico('🔵', 'tut-ico')}</div>
      札はクラシックと同じ。違うのは<b>何で買うか</b>です —<br>手札ではなく<b>チップ20枚</b>で値をつけます。` },
  t_burn: { text: `<div class="tut-h">負けてもチップは溶けます 💧</div>
      ここが肝です。クラシックでは出した札が相手に渡りますが、<br>TWELVE ではチップが<b>バンクへ消えます</b>。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>勝ったほう</b><br>つけた値を<b>全額</b><small>代わりに競り札2枚をすべて取ります</small></div>
        <div class="tt-p"><b>負けたほう</b><br>つけた値の<b>半分</b><small>札はもらえず、チップだけ半分減ります</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">だから<b>いつ降りるか</b>がそのまま腕前です</div>` },
  t_draw: { text: '自分が親です。山札から1枚めくってみましょう。',
    act: '<b>山札をタップ</b>！' },
  t_offer: { text: '手札から<b>もう1枚</b>足します — この2枚が競り札です。',
    act: '出す札を<b>タップ</b>' },
  t_type: { text: `<div class="tut-h">オープンとクローズ 🎭</div>`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>👁 オープン</b><br>値を<b>見せ合って</b>交互に上げます<small>どちらかが降りるまで</small></div>
        <div class="tt-p"><b>🙈 クローズ</b><br><b>偶数</b>で一度だけ値をつけます<small>値は見えますが出し札は隠れています</small></div>
      </div>` },
  t_bid: { text: '値をつける番です。前の値より高くつけるか、<b>降ります</b>。',
    act: '下から<b>値をつける</b>か<b>降りる</b>' },
  t_close: { text: `<div class="tut-h">開けてから決めます 🙈</div>
      クローズでは先に値をつけ、出し札は<b>そのあと</b>で開きます。
      開いたものを見てから<b>買うか買わないか</b>を選びます。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>買う</b><br>つけた値を<b>全額</b>払います<small>競り札2枚をすべて取ります</small></div>
        <div class="tt-p"><b>買わない</b><br>つけた値の<b>半分</b>だけ<small>札はもらえません</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">大きくつけると、買わないのも高くつきます</div>` },
  t_settle: { text: `<div class="tut-h">チップはバンクへ行きます 🏦</div>
      いま払ったチップは相手に渡るのではなく、<b>盤面から消えます</b>。
      だから両方が大きくつければ両方が貧しくなる — この対局の緊張はそこにあります。` },
  t_chips: { text: '💧 チップが減りましたね。<b>勝ったほうも負けたほうも</b>払います。<br>チップが<b>0</b>になるとその場で負けです — 大事に使ってください。' },
  t_fold: { text: 'この競り、本当に取る必要がありますか？ <b>降りれば</b>つけた値の半分だけで済みます。<br>勝てない競りから抜けるのも一手です。',
    act: '値が惜しければ<b>降りる</b>' },

  // ── 다인전 ──
  q_intro: { text: `<div class="tut-h">多人数戦へようこそ！ ${ico('👥', 'tut-ico')}</div>
      基本は1対1と同じ — <b>先にセットを揃えれば</b>勝ちです。<br>人が増えて変わるところだけ見ていきましょう。` },
  q_all: { text: `<div class="tut-h">親も一緒に入札します</div>
      1対1との最初の違い。親は札を出して引っ込むのではなく、<br><b>自分も入札の札を出します</b>。` },
  q_rev: { text: `<div class="tut-h">入札した札は逆順で戻ります ♻️</div>
      ここがこの対局の心臓です。出した札は捨てられず、<b>お互いに取り合います</b>。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>いちばん強く入札</b><br>競り札2枚を獲得<small>代わりにいちばん弱い入札札を受け取ります</small></div>
        <div class="tt-p"><b>いちばん弱く入札</b><br>競り札はもらえない<small>代わりにいちばん強い入札札を受け取ります</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">だから<b>負けることも手になります</b></div>` },
  q_deck: { text: (s) => `<div class="tut-h">山札は大きく、目標はそのまま 🗂</div>
      ${s && s.n === 3 ? '3人なら30枚' : '4人なら38枚'} — 人が増えた分だけ札も増えます。
      でも<b>そろえる枚数は1対1と同じ</b>です。`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2</span><span style="margin-left:18px">3</span><span style="margin-left:18px">4</span><span style="margin-left:18px">6</span></div>
      <div class="tut-note">札の数字がそのまま必要な枚数です — 何人でも変わりません。</div>` },
  q_bid: { text: '入札の番です。勝ちにいくか、わざと負けて<b>強い札をもらう</b>か選んでください。',
    act: '手札をタップ →<b>入札を確定</b>' },
  q_seq: { text: '🙈 クローズでは<b>順番にひとりずつ</b>公開しながら出します。<br>あとに出す人は前の人の札をすべて見てから決められます。' },
  q_got: { text: '🎯 取った札は<b>自分の前</b>に並びます。<b>そこに並んだ札だけ</b>がセットになります。' },
  q_turn: { text: '🔄 親は<b>ターンごとに一席ずつ</b>移ります。すぐにまた自分の番が来ます。' },

  // ── 미니게임 ──
  m_intro: { text: `<div class="tut-h">2枚勝負へようこそ！ ${ico('🎴', 'tut-ico')}</div>
      本編とはまったく別のルールです。競りではなく<b>ソッタ風のベット</b>。<br>
      札を2枚、<b>だれにも見せずに</b>握って賭けます。` },
  m_flow: { text: `<div class="tut-h">一局の流れ 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ 全員が<b>40</b>を出して札を<b>1枚</b>ずつ</div>
        <div>2️⃣ ひとりを残して全員がコールか降りたら、その回は閉じます</div>
        <div>3️⃣ ふたり以上残れば<b>もう1枚</b>受け取り、2回目のベット</div>
        <div>4️⃣ 手を開いて<b>役</b>で決めます</div>
      </div>` },
  m_act: { text: '自分の番です。見えている札は1枚もありませんね。読めるのは<b>だれがいくらを、いつ賭けたか</b>だけです。',
    act: '下から<b>ベット・コール・降りる</b>を選んでください' },
  m_two: { text: `<div class="tut-h">役は三つの系統 🎴</div>
      <div class="tut-steps">
        <div>🔥 <b>ゾロ目</b> — 同じ種類が2枚 · 2 &gt; 3 &gt; 4 &gt; 6</div>
        <div>🎯 <b>同格</b> — 等級が同じ2枚 · 等級が低いほど強い</div>
        <div>🃏 <b>点</b> — それ以外 · 種類の合計が<b>小さいほど</b>強い</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">ゾロ目はどの同格にも、同格はどの点にも勝ちます</div>` },
  m_jol: { text: `<div class="tut-h">下っ端の裏切り！ ⚔️</div>
      いま握っている<b>4-6 ＋ 6-8</b>は山でもっとも弱い2枚ですが、<br>
      この組み合わせだけは<b>ゾロ目をすべて破ります</b>。190通りのうちたったひとつです。` },
};

// ── 튜토리얼 중국어판 ────────────────────────────────────────────
const TUT_ZH = {
  // ── 클래식 ──
  intro: { text: `<div class="tut-h">欢迎来到 FLIP FLAP！ ${ico('🎩', 'tut-ico')}</div>
      靠<b>竞拍</b>收集牌，先凑齐一<b>套</b>的人获胜。`,
    cards: `<div class="tut-cards" style="margin-top:14px"><span class="tcard k3"><i>1</i>3</span><span class="tcard k3"><i>2</i>3</span><span class="tcard k3"><i>4</i>3</span><span class="tvs">=</span><span class="twin">凑齐三张 3 就赢！ ${ico('🏆', 'tut-ico')}</span></div>` },
  cards1: { text: `<div class="tut-h">怎么看一张牌 🃏</div>`,
    cards: `<div class="tut-arrows">
      <span class="ta-card">
        <span class="tcard k6 big"><i>1</i>6</span>
        <span class="ta-note ta-grade"><span class="ta-txt"><b>小数字＝等级</b><small>1 级最强</small></span></span>
        <span class="ta-note ta-kind"><span class="ta-txt"><b>大数字＝种类</b><small>凑够这么多就赢！</small></span></span>
      </span></div>` },
  cards2: { text: `<div class="tut-h">四个种类，一共 24 张 🗂</div>
      数字<b>越小越强，也越少</b>。2 只要两张就赢，可全世界只有两张！`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2 张</span><span style="margin-left:18px">5</span><span style="margin-left:18px">7</span><span style="margin-left:18px">10</span></div>
      <div class="tut-cards" style="margin-top:8px"><span class="tcard k2"><i>1</i>2</span><span class="tvs">&gt;</span><span class="tcard k6"><i>1</i>6</span><span class="twin">出价时 2 胜过 6</span></div>` },
  flow: { text: `<div class="tut-h">一个回合是这样走的 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ <b>庄家</b>从牌堆翻开一张</div>
        <div>2️⃣ 庄家再从手牌加一张 → <b>两张拍品</b></div>
        <div>3️⃣ 双方各从手牌出一张<b>出价</b></div>
        <div>4️⃣ 出<b>更强的牌</b>的人拿走全部拍品！</div>
        <div>5️⃣ 出价的两张牌<b>互相交换</b>，进对方手里</div>
        <div>6️⃣ 只有<b>拍到的牌</b>能凑成套（手牌不算！）</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">打一局就懂了。开始吧！</div>` },
  pick: { text: '先来<b>决定先手</b>！',
    act: '在发光的两张里<b>点一张</b> — 抽到更强的一方先手！' },
  pickr: { text: '揭晓！ 抽到更强的一方成为第一位<b>庄家</b>。（庄家每回合轮换）' },
  draw_me: { text: '这一回合的庄家是<b>你</b>。先把拍品翻开吧。',
    act: '点左边的<b>牌堆</b>！' },
  offer_me: { text: '场牌翻开了！ 再从<b>手牌里加一张</b> — 这两张就是拍品。',
    act: '在下面的手牌里<b>点一张要出的牌</b>' },
  type_big: { text: `<div class="tut-h">选择竞拍方式 🎭</div>
      <div class="tut-two">
        <div class="tt-p"><b>👁 明拍</b><br>拍品<b>公开</b><br>出价<b>保密</b><br><small>谁也不知道对方会出多大</small></div>
        <div class="tt-p"><b>🙈 暗拍</b><br>出品牌<b>保密</b><br>出价<b>公开</b><br><small>不知道里面是什么就得赌</small></div>
      </div>` },
  type_me: { act: '<b>点</b>你想用的方式', text: '' },
  bid_me: { text: '<b>出价！</b> 出更强牌的人拿走两张拍品。⚠️ 出价的牌之后会<b>互相交换</b>。',
    act: '点手牌 →<b>确定出价</b>' },
  reveal: { text: '咚咚咚…揭晓！ 赢的一方把拍品摆在<b>自己面前</b>。' },
  swap_rule: { text: (s) => {
      const a = (s && s.auction) || {};
      if (!a.myBid || !a.oppBid) return `<div class="tut-h">出价的牌去哪了？ 🔁</div>出价的牌不会被丢掉。两个人出的牌<b>互相交换</b>，各自进对方手里。`;
      const c = (x) => `<span class="tcard k${x.kind}"><i>${x.grade}</i>${x.kind}</span>`;
      return `<div class="tut-h">出价的牌去哪了？ 🔁</div>
        刚才两个人出的牌<b>不会被丢掉</b>。
        <div class="tut-swap">
          <div class="ts-row"><span class="ts-lbl">你出的</span>${c(a.myBid)}
            <span class="ts-arw">→</span><span class="ts-dst">进对手手里</span></div>
          <div class="ts-row"><span class="ts-lbl">对手出的</span>${c(a.oppBid)}
            <span class="ts-arw">→</span><span class="ts-dst mine">进你手里</span></div>
        </div>
        <div class="tut-note">两张<b>互相交换。</b>所以出强牌容易赢，却也等于<b>把那张强牌塞进对手手里</b>。</div>`;
    } },
  where_rule: { text: `<div class="tut-h">牌会待在两个地方 🗺</div>
      <div class="tut-two">
        <div class="tt-p"><b>🖐 手牌</b><br>用来出价的牌<br>
          <small>会来回交换<br><b>不算进套里</b></small></div>
        <div class="tt-p"><b>🏅 自己面前</b><br>拍到的拍品<br>
          <small>只有摆在这里的<br><b>才算一套</b></small></div>
      </div>
      <div class="tut-note">手上握着三张 3 也赢不了。必须<b>靠竞拍拿到手</b>。</div>` },
  acquired: { text: '🎯 刚拍到的牌摆在<b>你面前</b>了吧？ 只有<b>摆出来的这些</b>才能凑成套 — 手上的牌不算！' },
  draw_opp: { text: '这一回合的庄家是<b>对手</b>。马上就轮到你出价 ☕' },
  betray_rule: { text: `<div class="tut-h">最后再说一个秘密 ⚔️</div>
      最弱的<b>6-10</b>，偏偏只赢一样东西 — 最强的<b>2-1</b>。<br>这就叫<b>小卒的背叛</b>！`,
    cards: `<div class="tut-cards" style="margin-top:12px"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 获胜！</span></div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">盯准对手要掏王牌的那一刻 😏</div>` },
  betray: { text: (s) => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 你手上有<b>6-10</b> — 如果觉得对手会出 2-1，就等着<b>背叛</b>他！'
      : '👀 你手上有<b>2-1</b> — 它最强，但唯独输给<b>6-10</b>。当心！' },

  // ── 아이템전 ──
  i_intro: { text: `<div class="tut-h">欢迎来到道具战！ ${ico('🎪', 'tut-ico')}</div>
      规则<b>和经典完全一样</b> — 靠竞拍拿牌，先凑齐一套。<br>
      唯一的不同是多了<b>道具</b>。` },
  i_kinds: { text: `<div class="tut-h">13 种道具，分成三类 🧰</div>
      <div class="tut-kinds">
        <div class="tk-row"><span class="tk-h">👀 窥视</span>
          <span class="tk-i">🔍 放大镜</span><span class="tk-i">📏 标尺</span>
          <span class="tk-d">决定之前先看对手的手牌或出价</span></div>
        <div class="tk-row"><span class="tk-h">🌀 搅局</span>
          <span class="tk-i">🔄 反转器</span><span class="tk-i">💨 烟幕弹</span>
          <span class="tk-i">💣 炸弹</span><span class="tk-i">🧿 护符</span>
          <span class="tk-d">只改这一次竞拍的规则</span></div>
        <div class="tk-row"><span class="tk-h">💥 抢夺</span>
          <span class="tk-i">🐈 野猫</span><span class="tk-i">👑 暴君</span>
          <span class="tk-i">🖨️ 复制机</span><span class="tk-i">🎴 挑选</span>
          <span class="tk-d">把手伸到已经拍走的牌上</span></div>
      </div>
      <div class="tut-note">不用记。拿到手之后<b>点一下就能看它的效果。</b></div>` },
  i_cards: { text: `<div class="tut-h">道具是从牌堆里翻出来的 🃏</div>
      牌堆里混了<b>四张道具牌</b>。<br>
      翻到时会立刻再翻一张，竞拍照常继续。
      <div class="tut-two" style="margin-top:10px">
        <div class="tt-p"><b>🎁 奖励</b><br>翻到它的<b>庄家</b><br>当场拿走
          <small>从牌堆飞进手里</small></div>
        <div class="tt-p"><b>🏷 附赠</b><br>这次竞拍<b>输</b>的<br>一方拿走
          <small>正面朝上摆在拍品上</small></div>
      </div>
      <div class="tut-note">两种待会儿都会出现 — 你自己看一遍就懂。</div>` },
  i_draw: { text: '第一回合你是庄家。翻一张牌堆试试？',
    act: '点左边的<b>牌堆</b>！' },
  i_bonus: { text: `<div class="tut-h">🎁 翻出奖励了！</div>
      翻到它的<b>庄家</b>当场收下。<br>
      庄家每回合轮换，所以白拿也不会偏向某一边。` },
  i_got: { text: (s) => {
      const first = (s.myItems || [])[0];
      const known = { magnify: ['🔍 放大镜', '偷看对手两张手牌'],
                      scan: ['📏 标尺', '量一量对手出价的强度'] };
      const k = first && known[typeof first === 'string' ? first : first.id];
      return k
        ? `🎉 <b>${k[0]}</b>到手了 — <i>${k[1]}</i>。<br>
           道具会叠在下面的格子里。最多带<b>3 个</b>，每回合只能用<b>1 个</b>。`
        : `🎉 <b>拿到道具了！</b> 它会叠在下面的格子里。<br>最多带<b>3 个</b>，每回合只能用<b>1 个</b>。`;
    },
    act: '<b>点道具</b>就能看它的效果和可以用的时机' },
  i_offer: { text: '和经典一样 — 从<b>手牌加一张</b>，凑成两张拍品。',
    act: '<b>点</b>你想出的牌' },
  i_use: { text: '现在正是<b>用道具的时机</b>。只能在出价之前用 — 看到结果再反悔是不行的。',
    act: '点一个道具试试，或者直接出价' },
  i_bid: { text: '<b>出价！</b> 这里出价的牌也一样会互相交换，和经典完全相同。',
    act: '点手牌 →<b>确定出价</b>' },
  i_tip: { text: `<div class="tut-h">🏷 这次押上了一个附赠！</div>
      和奖励相反 — 这次竞拍<b>输</b>的一方拿走那个道具。<br>
      而且你能<b>清清楚楚看到是什么</b>，于是开始盘算：「这一局值不值得让？」
      <div class="tut-note">道具战和经典就是在这里分道扬镳。
      <b>有时候输才是更好的一步。</b></div>` },
  i_wrap: { text: `<div class="tut-h">该出的都出过了！ 🎪</div>
      道具讲的是<b>时机而不是威力</b> — 什么时候用，比用哪一个更要紧。<br>
      剩下的自己打吧。任何时候点道具都能看说明。` },

  // ── TWELVE ──
  t_intro: { text: `<div class="tut-h">欢迎来到 TWELVE！ ${ico('🔵', 'tut-ico')}</div>
      牌和经典一样。不一样的是<b>拿什么买</b> —<br>不是手牌，而是<b>20 枚筹码</b>。` },
  t_burn: { text: `<div class="tut-h">输了筹码也会化掉 💧</div>
      这是核心。经典里出的牌会转到对手手上；<br>TWELVE 里筹码是<b>消失进庄池</b>的。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>赢的一方</b><br>报价<b>全额</b>付<small>但拿走两张拍品</small></div>
        <div class="tt-p"><b>输的一方</b><br>付报价的<b>一半</b><small>拿不到牌，筹码还少一半</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">所以<b>什么时候弃牌</b>就是全部的功夫</div>` },
  t_draw: { text: '你是庄家。从牌堆翻一张吧。',
    act: '点<b>牌堆</b>！' },
  t_offer: { text: '从手牌<b>再加一张</b> — 这两张就是拍品。',
    act: '<b>点</b>你想出的牌' },
  t_type: { text: `<div class="tut-h">明拍和暗拍 🎭</div>`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>👁 明拍</b><br><b>互相看着</b>轮流加价<small>直到有一方弃牌</small></div>
        <div class="tt-p"><b>🙈 暗拍</b><br>报一次<b>偶数</b><small>价看得见，出品牌看不见</small></div>
      </div>` },
  t_bid: { text: '轮到你报价了。比上一家高，或者<b>弃牌</b>。',
    act: '在下面<b>加价</b>或<b>弃牌</b>' },
  t_close: { text: `<div class="tut-h">开出来之后再决定 🙈</div>
      暗拍是先报价，出品牌<b>之后</b>才开。
      看到开出来的东西，再选<b>买还是不买</b>。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>买</b><br>报价<b>全额</b>付<small>两张拍品都拿走</small></div>
        <div class="tt-p"><b>不买</b><br>只付报价的<b>一半</b><small>拿不到牌</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">报得高，不买也会很贵</div>` },
  t_settle: { text: `<div class="tut-h">筹码进的是庄池 🏦</div>
      刚才付出去的筹码不会到对手手上 — 它<b>离开了牌局</b>。
      两边都报大价，两边就都变穷 — 这局的紧张感就在这儿。` },
  t_chips: { text: '💧 筹码少了吧？ <b>赢的输的都要付。</b><br>筹码到<b>0</b>就当场输 — 省着点花。' },
  t_fold: { text: '这一局非拿不可吗？ <b>弃牌</b>只会损失报价的一半。<br>从赢不了的局里抽身，也是一步棋。',
    act: '觉得价太疼就<b>弃牌</b>' },

  // ── 다인전 ──
  q_intro: { text: `<div class="tut-h">欢迎来到多人对局！ ${ico('👥', 'tut-ico')}</div>
      基本和一对一一样 — <b>先凑齐一套</b>就赢。<br>这里只讲人多了以后有什么不同。` },
  q_all: { text: `<div class="tut-h">庄家也一起出价</div>
      和一对一的第一个不同。庄家不是出完牌就退开 —<br><b>他自己也要出一张出价牌</b>。` },
  q_rev: { text: `<div class="tut-h">出价的牌会倒着回来 ♻️</div>
      这是这局的心脏。出价的牌不会被丢掉 — <b>大家互相拿走</b>。`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>出价最高</b><br>拿走两张拍品<small>但收到最弱的那张出价牌</small></div>
        <div class="tt-p"><b>出价最低</b><br>拿不到拍品<small>但收到最强的那张出价牌</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">所以<b>输也是一步棋</b></div>` },
  q_deck: { text: (s) => `<div class="tut-h">牌堆变大，目标不变 🗂</div>
      ${s && s.n === 3 ? '三个人是 30 张' : '四个人是 38 张'} — 人多了，牌也多了。
      但<b>要凑的张数和一对一时一样</b>。`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2</span><span style="margin-left:18px">3</span><span style="margin-left:18px">4</span><span style="margin-left:18px">6</span></div>
      <div class="tut-note">牌上的数字就是要凑的张数 — 几个人玩都一样。</div>` },
  q_bid: { text: '轮到你出价了。是拿下它，还是故意输掉去<b>换那张强牌</b>？',
    act: '点手牌 →<b>确定出价</b>' },
  q_seq: { text: '🙈 暗拍时大家<b>按顺序一个一个</b>公开着出。<br>最后出的人，前面所有人的牌都看过了。' },
  q_got: { text: '🎯 拍到的牌摆在<b>你面前</b>。只有<b>摆在这里的</b>才能凑成套。' },
  q_turn: { text: '🔄 庄家<b>每回合往下挪一个座位</b>。很快又轮到你。' },

  // ── 미니게임 ──
  m_intro: { text: `<div class="tut-h">欢迎来到两张定胜负！ ${ico('🎴', 'tut-ico')}</div>
      这是完全不同的一套规则。不是竞拍，而是<b>韩式 Sutda 的下注</b>。<br>
      两张牌<b>谁也不给看</b>，扣在手里下注。` },
  m_flow: { text: `<div class="tut-h">一局怎么走 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ 每人先押<b>40</b>，各拿<b>一张</b>牌</div>
        <div>2️⃣ 除一人外都跟注或弃牌，这一轮就结束</div>
        <div>3️⃣ 还剩两人以上，就<b>再拿一张</b>，进行第二轮下注</div>
        <div>4️⃣ 亮牌，按<b>牌型</b>定胜负</div>
      </div>` },
  m_act: { text: '轮到你了。一张牌也看不见吧？ 你能读的只有<b>谁在什么时候押了多少</b>。',
    act: '在下面选<b>下注、跟注或弃牌</b>' },
  m_two: { text: `<div class="tut-h">牌型分三类 🎴</div>
      <div class="tut-steps">
        <div>🔥 <b>对子</b> — 同种两张 · 2 &gt; 3 &gt; 4 &gt; 6</div>
        <div>🎯 <b>同级</b> — 等级相同的两张 · 等级越低越强</div>
        <div>🃏 <b>点数</b> — 其余 · 种类之和<b>越小</b>越强</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">对子吃遍同级，同级吃遍点数</div>` },
  m_jol: { text: `<div class="tut-h">小卒的背叛！ ⚔️</div>
      你手上的<b>4-6 ＋ 6-8</b>是牌堆里最弱的两张，<br>
      可偏偏这一组<b>能吃掉所有对子</b>。190 种里就这一手。` },
};

// ── 튜토리얼 영문판 ──────────────────────────────────────────────
// 안내판은 한 문장 안에 <b> 와 카드 그림이 섞여 있어, 조각으로 나눠 번역하면
// 어순이 깨진다. 사전에 문장을 통째로 넣는 방법도 여러 줄 문자열과 안 맞았다.
// 그래서 단계 id 로 짝지은 영문 표를 따로 둔다 — when 판정은 한 벌만 유지되고
// (판정이 갈라지면 언어에 따라 안내가 다른 순간에 뜬다), 글만 갈아 끼운다.
const TUT_EN = {
  // ── 클래식 ──
  intro: { text: `<div class="tut-h">Welcome to FLIP FLAP! ${ico('🎩', 'tut-ico')}</div>
      Win cards at <b>auction</b>, and be first to complete a <b>set</b>.`,
    cards: `<div class="tut-cards" style="margin-top:14px"><span class="tcard k3"><i>1</i>3</span><span class="tcard k3"><i>2</i>3</span><span class="tcard k3"><i>4</i>3</span><span class="tvs">=</span><span class="twin">Three 3s wins the game! ${ico('🏆', 'tut-ico')}</span></div>` },
  cards1: { text: `<div class="tut-h">How to read a card 🃏</div>`,
    cards: `<div class="tut-arrows">
      <span class="ta-card">
        <span class="tcard k6 big"><i>1</i>6</span>
        <span class="ta-note ta-grade"><span class="ta-txt"><b>small number = grade</b><small>grade 1 is strongest</small></span></span>
        <span class="ta-note ta-kind"><span class="ta-txt"><b>big number = kind</b><small>collect this many to win!</small></span></span>
      </span></div>` },
  cards2: { text: `<div class="tut-h">Four kinds, 24 cards in all 🗂</div>
      The <b>smaller the number, the stronger and rarer</b>. A 2 needs only two cards to win — but only two exist in the world!`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2 cards</span><span style="margin-left:18px">5</span><span style="margin-left:18px">7</span><span style="margin-left:18px">10</span></div>
      <div class="tut-cards" style="margin-top:8px"><span class="tcard k2"><i>1</i>2</span><span class="tvs">&gt;</span><span class="tcard k6"><i>1</i>6</span><span class="twin">in a bid, a 2 beats a 6</span></div>` },
  flow: { text: `<div class="tut-h">How a turn goes 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ The <b>auctioneer</b> flips one card from the center deck</div>
        <div>2️⃣ They add one card from hand → <b>a lot of two</b></div>
        <div>3️⃣ Both players <b>bid</b> one card from hand</div>
        <div>4️⃣ The <b>stronger card</b> takes the whole lot!</div>
        <div>5️⃣ The two bid cards <b>trade places</b> and cross into the other hand</div>
        <div>6️⃣ <b>Only cards won at auction</b> count toward a set (never your hand!)</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">It clicks fast once you play. Let’s go!</div>` },
  pick: { text: 'First, the <b>draw for first move</b>!',
    act: '<b>Tap one</b> of the two glowing cards — the stronger card goes first!' },
  pickr: { text: 'Cards revealed! Whoever drew stronger becomes the first <b>auctioneer</b>. (It alternates each turn.)' },
  draw_me: { text: 'You are the <b>auctioneer</b> this turn. Let’s reveal the lot.',
    act: '<b>Tap the deck</b> on the left!' },
  offer_me: { text: 'The center card is out! Now add <b>one card from your hand</b> — those two become the lot.',
    act: '<b>Tap the card you want to offer</b> from your hand below' },
  type_big: { text: `<div class="tut-h">Pick the auction type 🎭</div>
      <div class="tut-two">
        <div class="tt-p"><b>👁 Open</b><br>the lot is <b>shown</b><br>bids are <b>hidden</b><br><small>neither knows what the other will pay</small></div>
        <div class="tt-p"><b>🙈 Closed</b><br>the offered card is <b>hidden</b><br>bids are <b>shown</b><br><small>you gamble on what is in there</small></div>
      </div>` },
  type_me: { act: '<b>Tap</b> the type you want', text: '' },
  bid_me: { text: '<b>Bid!</b> The stronger card takes both cards of the lot. ⚠️ The bid cards are then <b>swapped between you</b>.',
    act: 'Tap a card, then <b>Confirm bid</b>' },
  reveal: { text: 'And the reveal! The winner lays the lot <b>in front of them</b>.' },
  swap_rule: { text: (s) => {
      const a = (s && s.auction) || {};
      if (!a.myBid || !a.oppBid) return `<div class="tut-h">Where do the bid cards go? 🔁</div>Bid cards are not discarded. The two cards <b>trade places</b> and cross into each other’s hands.`;
      const c = (x) => `<span class="tcard k${x.kind}"><i>${x.grade}</i>${x.kind}</span>`;
      return `<div class="tut-h">Where do the bid cards go? 🔁</div>
        The two cards you just played are <b>not discarded</b>.
        <div class="tut-swap">
          <div class="ts-row"><span class="ts-lbl">you played</span>${c(a.myBid)}
            <span class="ts-arw">→</span><span class="ts-dst">to their hand</span></div>
          <div class="ts-row"><span class="ts-lbl">they played</span>${c(a.oppBid)}
            <span class="ts-arw">→</span><span class="ts-dst mine">to your hand</span></div>
        </div>
        <div class="tut-note">They <b>trade places.</b> So a strong bid wins the lot, but <b>hands that strong card to your opponent</b>.</div>`;
    } },
  where_rule: { text: `<div class="tut-h">Cards live in two places 🗺</div>
      <div class="tut-two">
        <div class="tt-p"><b>🖐 Your hand</b><br>what you bid with<br>
          <small>traded away each round<br><b>never counts as a set</b></small></div>
        <div class="tt-p"><b>🏅 In front of you</b><br>lots you have won<br>
          <small>only what is here<br><b>makes a set</b></small></div>
      </div>
      <div class="tut-note">Three 3s in hand still wins you nothing. You have to <b>win them at auction</b>.</div>` },
  acquired: { text: '🎯 See the cards you just won laid <b>in front of you</b>? <b>Only those</b> count toward a set — cards in hand do not!' },
  draw_opp: { text: 'Your <b>opponent</b> is auctioneer this turn. Your bid is coming up ☕' },
  betray_rule: { text: `<div class="tut-h">One last secret ⚔️</div>
      The weakest card, <b>6-10</b>, beats exactly one thing — the strongest card, <b>2-1</b>.<br>It is called <b>the pawn’s betrayal</b>!`,
    cards: `<div class="tut-cards" style="margin-top:12px"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 wins!</span></div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">Watch for the moment they reach for their ace 😏</div>` },
  betray: { text: (s) => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 You are holding <b>6-10</b> — if you think they will play 2-1, go for the <b>betrayal</b>!'
      : '👀 You are holding <b>2-1</b> — the strongest card, but <b>6-10</b> beats it. Careful!' },

  // ── 아이템전 ──
  i_intro: { text: `<div class="tut-h">Welcome to the Item Match! ${ico('🎪', 'tut-ico')}</div>
      The rules are <b>exactly the classic game</b> — win cards at auction, complete a set first.<br>
      The one difference is that <b>items</b> get involved.` },
  i_kinds: { text: `<div class="tut-h">13 items, in three families 🧰</div>
      <div class="tut-kinds">
        <div class="tk-row"><span class="tk-h">👀 Peek</span>
          <span class="tk-i">🔍 Magnifier</span><span class="tk-i">📏 Ruler</span>
          <span class="tk-d">See their hand or bid before you commit</span></div>
        <div class="tk-row"><span class="tk-h">🌀 Disrupt</span>
          <span class="tk-i">🔄 Flipper</span><span class="tk-i">💨 Smoke</span>
          <span class="tk-i">💣 Bomb</span><span class="tk-i">🧿 Charm</span>
          <span class="tk-d">Change the rules of this one auction</span></div>
        <div class="tk-row"><span class="tk-h">💥 Take</span>
          <span class="tk-i">🐈 Alley cat</span><span class="tk-i">👑 Tyrant</span>
          <span class="tk-i">🖨️ Copier</span><span class="tk-i">🎴 Cherry-pick</span>
          <span class="tk-d">Reach into the cards already won</span></div>
      </div>
      <div class="tut-note">No need to memorize. When one lands, <b>tap it to read what it does.</b></div>` },
  i_cards: { text: `<div class="tut-h">Items arrive as cards from the deck 🃏</div>
      <b>Four item cards</b> are shuffled into the center deck.<br>
      When one turns up, another card is drawn straight away and the auction carries on.
      <div class="tut-two" style="margin-top:10px">
        <div class="tt-p"><b>🎁 Bonus</b><br>the <b>auctioneer</b> who<br>flipped it keeps it
          <small>flies from deck to hand</small></div>
        <div class="tt-p"><b>🏷 Consolation</b><br>whoever <b>loses</b><br>this auction takes it
          <small>sits face up on the lot</small></div>
      </div>
      <div class="tut-note">Both are coming up — you will see them for yourself.</div>` },
  i_draw: { text: 'You are auctioneer for the first turn. Shall we flip the deck?',
    act: '<b>Tap the deck</b> on the left!' },
  i_bonus: { text: `<div class="tut-h">🎁 A bonus turned up!</div>
      The <b>auctioneer</b> who flipped it takes it on the spot.<br>
      The role alternates every turn, so a freebie never favors one side.` },
  i_got: { text: (s) => {
      const first = (s.myItems || [])[0];
      const known = { magnify: ['🔍 Magnifier', 'peek at two cards in their hand'],
                      scan: ['📏 Ruler', 'measure the strength of their bid'] };
      const k = first && known[typeof first === 'string' ? first : first.id];
      return k
        ? `🎉 <b>${k[0]}</b> landed in your hand — <i>${k[1]}</i>.<br>
           Items stack in the slots below. You may hold <b>3</b>, and use <b>1</b> per turn.`
        : `🎉 <b>An item!</b> It stacks in the slots below.<br>You may hold <b>3</b>, and use <b>1</b> per turn.`;
    },
    act: '<b>Tap an item</b> to read what it does and when you may use it' },
  i_offer: { text: 'Same as classic — add <b>one card from your hand</b> to make a lot of two.',
    act: '<b>Tap</b> the card you want to offer' },
  i_use: { text: 'This is <b>the moment to use an item</b>. Only before you commit a bid card — you cannot see the result and take it back.',
    act: 'Tap an item to try one, or just bid' },
  i_bid: { text: '<b>Bid!</b> The bid cards trade places here too, exactly as in classic.',
    act: 'Tap a card, then <b>Confirm bid</b>' },
  i_tip: { text: `<div class="tut-h">🏷 This time a consolation is on the line!</div>
      The opposite of a bonus — whoever <b>loses</b> this auction takes that item.<br>
      You can see <b>exactly what it is</b>, so you start weighing: "is that worth throwing this one?"
      <div class="tut-note">This is where the item match parts ways with classic.
      <b>Sometimes losing is the better move.</b></div>` },
  i_wrap: { text: `<div class="tut-h">That’s the lot! 🎪</div>
      Items are about <b>timing more than power</b> — when you use one matters more than which one.<br>
      Take the rest of the game yourself. You can tap any item to read it, any time.` },

  // ── TWELVE ──
  t_intro: { text: `<div class="tut-h">Welcome to TWELVE! ${ico('🔵', 'tut-ico')}</div>
      Same cards as classic. What changes is <b>what you pay with</b> —<br>not cards from hand, but <b>20 chips</b>.` },
  t_burn: { text: `<div class="tut-h">Chips burn even when you lose 💧</div>
      This is the heart of it. In classic your bid card crosses to your opponent;<br>in TWELVE the chips <b>vanish into the bank</b>.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>Winner</b><br>pays it <b>all</b><small>but takes both cards of the lot</small></div>
        <div class="tt-p"><b>Loser</b><br>pays <b>half</b><small>no cards, and half the chips gone</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">So <b>knowing when to fold</b> is the whole skill</div>` },
  t_draw: { text: 'You are the auctioneer. Let’s flip one from the center deck.',
    act: '<b>Tap the deck</b>!' },
  t_offer: { text: 'Add <b>one more</b> from your hand — those two are the lot.',
    act: '<b>Tap</b> the card you want to offer' },
  t_type: { text: `<div class="tut-h">Open and closed 🎭</div>`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>👁 Open</b><br>raise in turn, <b>bids in view</b><small>until one of you folds</small></div>
        <div class="tt-p"><b>🙈 Closed</b><br>one <b>even-numbered</b> call<small>the bid shows, the offered card does not</small></div>
      </div>` },
  t_bid: { text: 'Your call. Raise above the last bid, or <b>fold</b>.',
    act: '<b>Raise</b> or <b>fold</b> below' },
  t_close: { text: `<div class="tut-h">You decide after the reveal 🙈</div>
      In a closed auction you call first, and the offered card opens <b>after</b>.
      Then you choose whether to <b>buy it or not</b>.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>Buy</b><br>pay your call <b>in full</b><small>take both cards in the lot</small></div>
        <div class="tt-p"><b>Pass</b><br>pay <b>half</b> of it<small>take no cards</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">Call high and passing gets expensive too</div>` },
  t_settle: { text: `<div class="tut-h">Chips go to the bank 🏦</div>
      The chips you just paid do not go to your opponent — they <b>leave the game</b>.
      Bid big on both sides and you both end up poor. That is where the tension lives.` },
  t_chips: { text: '💧 See your chips drop? <b>Winner and loser both pay.</b><br>Hit <b>0</b> and you lose on the spot — spend carefully.' },
  t_fold: { text: 'Do you really need this one? <b>Fold</b> and you lose only half your call.<br>Stepping out of a lost auction is a move too.',
    act: 'If the price hurts, <b>fold</b>' },

  // ── 다인전 ──
  q_intro: { text: `<div class="tut-h">Welcome to the multiplayer match! ${ico('👥', 'tut-ico')}</div>
      The basics are the 1v1 game — <b>complete a set first</b> to win.<br>Here is only what changes with more players.` },
  q_all: { text: `<div class="tut-h">The auctioneer bids too</div>
      The first difference. The auctioneer does not just offer a card and step back —<br><b>they put in a bid card as well</b>.` },
  q_rev: { text: `<div class="tut-h">Bid cards come back in reverse ♻️</div>
      This is the heart of the game. Bid cards are not discarded — <b>you take each other’s</b>.`,
    cards: `<div class="tut-two">
        <div class="tt-p"><b>Highest bid</b><br>takes the two-card lot<small>but receives the weakest bid card</small></div>
        <div class="tt-p"><b>Lowest bid</b><br>takes no lot<small>but receives the strongest bid card</small></div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">Which makes <b>losing a move of its own</b></div>` },
  q_deck: { text: (s) => `<div class="tut-h">A bigger deck, the same goal 🗂</div>
      ${s && s.n === 3 ? '30 cards for three players' : '38 cards for four'} — more players, more cards.
      But <b>you still collect the same number</b> as in the 1v1 game.`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2</span><span style="margin-left:18px">3</span><span style="margin-left:18px">4</span><span style="margin-left:18px">6</span></div>
      <div class="tut-note">The number on the card is how many you need — whatever the player count.</div>` },
  q_bid: { text: 'Your bid. Win it — or lose on purpose and <b>collect the strong card</b>.',
    act: 'Tap a card, then <b>Confirm bid</b>' },
  q_seq: { text: '🙈 In a closed auction players reveal and commit <b>one at a time, in order</b>.<br>Whoever goes last has seen every card before theirs.' },
  q_got: { text: '🎯 Cards you win are laid <b>in front of you</b>. <b>Only those</b> can make a set.' },
  q_turn: { text: '🔄 The auctioneer moves <b>one seat every turn</b>. Your turn comes back around soon.' },

  // ── 미니게임 ──
  m_intro: { text: `<div class="tut-h">Welcome to the two-card showdown! ${ico('🎴', 'tut-ico')}</div>
      A completely different game. Not an auction — <b>betting, Sutda-style</b>.<br>
      You hold two cards <b>hidden from everyone</b> and bet on them.` },
  m_flow: { text: `<div class="tut-h">How a hand goes 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ Everyone antes <b>40</b> and takes <b>one</b> card</div>
        <div>2️⃣ The round closes once all but one have called or folded</div>
        <div>3️⃣ If two or more remain, take <b>one more</b> card and bet again</div>
        <div>4️⃣ Hands open and the <b>ranking</b> decides it</div>
      </div>` },
  m_act: { text: 'Your turn. Not a single card is visible, is it? All you can read is <b>who bets how much, and when</b>.',
    act: 'Choose <b>bet, call or fold</b> below' },
  m_two: { text: `<div class="tut-h">Three families of hands 🎴</div>
      <div class="tut-steps">
        <div>🔥 <b>Ttaeng</b> — two of the same kind · 2 &gt; 3 &gt; 4 &gt; 6</div>
        <div>🎯 <b>Pair</b> — two of the same grade · lower grade is stronger</div>
        <div>🃏 <b>Kkeut</b> — everything else · the <b>smaller</b> the sum of kinds, the stronger</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">Any ttaeng beats any pair; any pair beats any kkeut</div>` },
  m_jol: { text: `<div class="tut-h">The pawn’s betrayal! ⚔️</div>
      The <b>4-6 + 6-8</b> in your hand is the two weakest cards in the deck,<br>
      yet this one combination <b>beats every ttaeng</b>. One hand out of 190.` },
};

// ══════════════════════════════════════════════════════════
//  튜토리얼 고르기 · 모드별 차근차근 안내
// ══════════════════════════════════════════════════════════
// 클래식은 실제로 한 판을 두면서 배운다(TUT_STEPS). 나머지 넷은 엔진이 달라
// 같은 방식으로 끼워 넣을 수 없어서, 넘겨 보는 안내로 만들고 마지막에 그 모드를
// 바로 시작할 수 있게 했다 — 읽고 끝나면 남는 게 없다.
window.tutPickOpen = function () {
  closeModePanels();
  document.getElementById('tutPickModal').classList.add('show');
};
window.tutPickClose = function () { document.getElementById('tutPickModal').classList.remove('show'); };

// 다섯 모드 전부 실제 판을 두면서 배운다. 넘겨 보는 안내는 읽고 나면 남는 게
// 없어서, 판이 그 상황에 닿는 순간 그 자리를 짚어 주는 쪽으로 바꿨다.
const TUT_LAUNCH = {
  classic: { steps: () => TUT_STEPS, go: () => { difficulty = 'easy'; createRoom(true); } },
  item:    { steps: () => TUT_ITEM,  go: () => {
      // 각본 덱이 걸린 방이어야 아이템이 첫 턴에 나온다. startItemGame 은
      // 평범한 아이템전 방을 열어서, 아이템을 못 보고 끝나는 판이 있었다.
      closeModePanels();
      isVsBot = true; isItemMode = true; difficulty = 'easy';
      socket.emit('create_room', { vsBot: true, difficulty: 'easy', pid: PID,
                                   nick: getNick(), itemMode: true, tutorial: true });
    } },
  twelve:  { steps: () => TUT_TV,    go: () => tvSolo('easy') },
  quad:    { steps: () => TUT_Q4,    go: () => q4Start(3) },
  mini:    { steps: () => TUT_MN,    go: () => miniGo(3, false) },
};
window.tutStart = function (mode) {
  tutPickClose();
  const L = TUT_LAUNCH[mode]; if (!L) return;
  tutorial = true; tutSeen = {}; tutQueue = []; tutOpen = false;
  tutSteps = L.steps();
  L.go();
};
// 읽는 도중 다음 설명이 밀고 들어오지 않게 — 열려 있으면 큐에 쌓고, '알겠어요' 후 표시
let tutQueue = [], tutOpen = false;
// 모드마다 상태 모양이 달라서 무엇을 재느냐만 바꾼다 — 재는 방식은 하나다.
function tutTickWith(view) {
  if (!tutorial || !view) return;
  for (const st of tutSteps) {
    if (tutSeen[st.id]) continue;
    if (st.when(view)) {
      tutSeen[st.id] = true;
      if (tutOpen) { tutQueue.push({ st, view }); tutGlowFor(st); }
      else tutShow(st, view);
      return;
    }
  }
}
window.tutTickWith = tutTickWith;

function tutTick() {
  if (!tutorial || !state) return;
  for (const st of tutSteps) {
    if (tutSeen[st.id]) continue;
    if (st.when(state)) {
      tutSeen[st.id] = true;
      if (tutOpen) { tutQueue.push({ st, view: state }); tutGlowFor(st); }   // 글씨는 기다리되, 반짝임은 바로 (막히지 않게)
      else tutShow(st);
      return;
    }
  }
}
function tutShow(st, view) {
  const box = document.getElementById('tutBox');
  const _v = view || state;
  // 안내판은 한 문장 안에 <b> 와 카드 그림이 섞여 있어, 조각마다 번역하면
  // 어순이 깨진다. 영어일 때는 같은 id 의 영문 단계를 통째로 갈아 끼운다.
  // 없는 항목은 한국어 쪽을 그대로 쓴다 — 표에 빠진 게 있어도 안내가 사라지진 않는다.
  // 언어별 안내판. 없는 언어는 영어로 떨어지고, 영어에도 없으면 한국어를 쓴다 —
  // 표에 빠진 게 있어도 안내가 사라지진 않는다.
  const L = (window.FF && FF.lang()) || 'ko';
  const TUT_L = { ja: (typeof TUT_JA !== 'undefined' ? TUT_JA : null),
                  zh: (typeof TUT_ZH !== 'undefined' ? TUT_ZH : null) };
  const table = L === 'ko' ? null : (TUT_L[L] || TUT_EN);
  const en = (table && table[st.id]) || (L !== 'ko' && TUT_EN[st.id]) || null;
  const pick = (k) => (en && en[k] !== undefined ? en[k] : st[k]);
  const T = (x) => (window.FF ? FF.t(x) : x);
  const raw = pick('text');
  const cards = pick('cards');
  const act = pick('act');
  // 영문 단계를 쓴 경우엔 이미 영어다 — 사전을 한 번 더 태우지 않는다
  const T2 = en ? ((x) => x) : T;
  const text = T2(typeof raw === 'function' ? raw(_v) : raw);
  document.getElementById('tutText').innerHTML = text
    + T2(typeof cards === 'function' ? cards(_v) : (cards || ''))
    + (act ? `<div class="tut-do">👉 ${T2(act)}</div>` : '');
  // 어디쯤 왔는지. 단계는 판이 그 상황에 닿아야 뜨므로 "3/18" 은 거짓말이
  // 된다(안 뜨고 넘어가는 단계가 있다) — 숫자 대신 막대만 채운다.
  const fill = document.getElementById('tutBarFill');
  if (fill) {
    const i = tutSteps.findIndex((x) => x.id === st.id);
    fill.style.width = (i < 0 ? 0 : Math.round(((i + 1) / tutSteps.length) * 100)) + '%';
  }
  box.classList.remove('pos-top', 'pos-bot', 'pop', 'big');
  if (st.big) box.classList.add('big');
  else box.classList.add('pos-' + (st.pos || 'top'));
  box.style.display = 'block';
  void box.offsetWidth;           // 애니메이션 재시작
  box.classList.add('pop');
  tutOpen = true;
  tutGlowFor(st);
  // 체크포인트: 확인 누를 때까지 서버 진행 보류 + 게임 입력 차단
  socket.emit('tut_hold');
  tutBlock(true, !!st.big);
}
// 설명 읽는 동안 게임판 클릭 방지 (박스의 버튼은 눌림)
function tutBlock(on, dark) {
  let b = document.getElementById('tutBlocker');
  if (!b) {
    b = document.createElement('div'); b.id = 'tutBlocker';
    b.style.cssText = 'position:fixed;inset:0;z-index:50;cursor:pointer;transition:background .25s';
    b.onclick = () => tutConfirm();   // 아무 곳이나 탭해도 다음으로
    document.body.appendChild(b);
  }
  b.style.background = dark ? 'rgba(5,2,4,.6)' : 'rgba(0,0,0,.15)';   // 대형 안내는 배경 집중
  b.style.display = on ? 'block' : 'none';
}
function tutGlowFor(st) {
  tutClearGlow();
  if (st.target) {
    tutTarget = document.querySelector(st.target);
    if (tutTarget) tutTarget.classList.add('tut-glow');
  }
}
function tutClearGlow() {
  if (tutTarget) { tutTarget.classList.remove('tut-glow'); tutTarget = null; }
}
function tutConfirm() {
  if (!tutOpen) return;                                    // 중복 탭 방지
  tutOpen = false;
  // 밀린 설명이 있으면 이어서 (보류 유지). 담아 둔 판으로 그린다 — 지금 판을
  // 쓰면 경매가 이미 지나가 "방금 낸 카드" 를 못 집는다.
  if (tutQueue.length) { const q = tutQueue.shift(); return tutShow(q.st, q.view); }
  document.getElementById('tutBox').style.display = 'none';
  tutBlock(false);
  socket.emit('tut_release');   // 체크포인트 통과 → 게임 진행 재개
  tutTick();                    // 같은 화면에 이어질 다음 설명 (카드 읽기 → 목표 → 뽑기)
}
function endTutorial() {
  tutorial = false; tutQueue = []; tutOpen = false;
  document.getElementById('tutBox').style.display = 'none';
  tutClearGlow(); tutBlock(false);
  socket.emit('tut_release');
}

// ── 방 ──────────────────────────────────────────────────────
function createRoom(vsBot) {
  isVsBot = vsBot;
  const name = (document.getElementById('roomNameInput')?.value || '').trim();
  let secret = false, password = '';
  if (!vsBot && roomSecret) {
    password = (document.getElementById('roomPwInput')?.value || '').trim();
    if (!password) { alert('비밀방은 비밀번호를 입력해야 해요.'); return; }
    secret = true;
  }
  socket.emit('create_room', { vsBot, difficulty, pid: PID, nick: getNick(), name, secret, password, tutorial });
}
function joinRoom() {
  const id = document.getElementById('roomInput').value.trim().toUpperCase();
  if (id) socket.emit('join_room', { roomId: id, pid: PID, nick: getNick() });
}

// ── 방 안에서 모드 고르기 · 시작 ──────────────────────────────
// 예전엔 상대가 들어오는 순간 바로 시작해서 "무슨 판인지" 고를 새가 없었다.
// 방장이 고르고 눌러서 시작한다. 다인전은 엔진이 달라서 그쪽 대기방으로 넘긴다.
let roomModeCur = 'classic', roomIsHost = false, roomReady = false;
// 대기실을 거쳐 들어온 방인가. 판이 끝났을 때 '방으로' 를 내밀지 정한다 —
// 랭크·빠른대전으로 맺어진 자리에는 돌아갈 대기실이 없다.
let fromRoom = false;

window.roomMode = function (m) {
  if (!roomIsHost) return toast('방장만 고를 수 있어요.');
  // 다인전도 다른 모드와 똑같이 알리기만 한다. 자리가 넷으로 늘어날 뿐,
  // 화면은 대기실 그대로다 — 실제로 판이 열리는 건 시작을 눌렀을 때.

  roomModeCur = m;
  for (const b of document.querySelectorAll('#wcModes .wc-mode')) b.classList.toggle('on', b.dataset.m === m);
  socket.emit('room_mode', { mode: m });
};

window.roomStart = function () {
  if (!roomIsHost) return;
  socket.emit('room_start', { mode: roomModeCur });
};


// 빈자리에 친구를 부른다. 접속 중인 친구에게 방 코드가 담긴 도전장이 간다 —
// 남의 화면을 마음대로 끌어오지 않고, 받은 사람이 눌러야 들어온다.
window.roomInvite = async function () {
  if (!myAccount) return toast('로그인하면 친구를 부를 수 있어요.');
  if (!sharedCode) return;
  const box = document.getElementById('rInviteList');
  document.getElementById('roomInviteModal').classList.add('show');
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/friends', { token: authToken() });
  const on = ((r && r.friends) || []).filter((f) => f.online && !f.ingame);
  box.innerHTML = on.length
    ? on.map((f) => `<button class="gc-frow" onclick="roomInviteTo('${esc(f.idl)}')"><span class="${ncClass(f.nickColor).trim()}">${nickHTML(f.nick, f.nickColor)}</span><span class="gc-off">부르기</span></button>`).join('')
    : '<div class="gc-empty">지금 부를 수 있는 친구가 없어요.<br>코드를 공유해 보세요.</div>';
};
window.roomInviteTo = function (idl) {
  socket.emit('challenge_friend', { idl, roomId: sharedCode });
  document.getElementById('roomInviteModal').classList.remove('show');
};
window.closeRoomInvite = function () {
  document.getElementById('roomInviteModal').classList.remove('show');
};

// 대기실 상태 — 사람이 들어오고 나갈 때마다 온다.
// 방장·손님이 서로 다른 것을 봐야 해서 서버가 사람마다 따로 보낸다.
socket.on('room_lobby', (r) => {
  fromRoom = true;
  // 판을 하다 돌아온 것이면 판 화면부터 걷는다 — 새로고침 없이 대기실로 잇는다.
  // 새로고침하면 소켓이 바뀌어 방에서 튕기고, 화면도 통째로 깜빡인다.
  if (document.body.classList.contains('ingame')) leaveGameScreen();
  // 들어온 사람 모두 대기실 화면으로. 예전엔 방을 만든 사람만 이 화면을 봤다.
  // 팝업을 먼저 닫는다 — 예전엔 들어와도 방 목록 창이 위에 그대로 떠 있어서
  // 소리와 효과만 나고 "안 들어가진 것처럼" 보였다.
  if (typeof closeModePanels === 'function') closeModePanels();
  document.querySelectorAll('.lb-modal.show').forEach((m) => m.classList.remove('show'));
  document.getElementById('lobbyMain').style.display = 'none';
  document.getElementById('waitCard').style.display = 'flex';
  document.body.classList.add('waiting');   // 대기실 — 큰 로고를 접고 화면에 맞춘다
  roomIsHost = !!r.host;
  roomReady = !!r.ready;
  if (r.mode) {
    roomModeCur = r.mode;
    for (const b of document.querySelectorAll('#wcModes .wc-mode')) b.classList.toggle('on', b.dataset.m === r.mode);
  }
  if (r.name) document.getElementById('waitRoomName').textContent = r.name;
  if (r.code) { document.getElementById('waitCode').textContent = r.code; sharedCode = r.code; }

  // 자리 — 누가 들어와 있는지 그대로 보여준다
  _lastSeats = r.seats || null;
  const box = document.getElementById('wcSeats');
  if (box) {
    box.classList.toggle('four', (r.cap || 2) > 2);
    box.innerHTML = (r.seats || [null, null]).map((s2, i) => {
      // 빈자리를 누르면 친구를 부른다 — 코드를 따로 알려주지 않아도 되게
      if (!s2) return `<button class="wc-seat empty" onclick="roomInvite()"><div class="ws-face">＋</div>
        <div class="ws-nick">친구 초대</div><div class="ws-tag">눌러서 부르기</div></button>`;
      const face = (typeof faceOf === 'function' && s2.profile) ? faceOf(s2.profile) : '🙂';
      const lvl = s2.profile && s2.profile.level ? `Lv.${s2.profile.level}` : '게스트';
      // 방장은 남을 내보낼 수 있다. 자기 자리와 방장 자리에는 안 붙인다.
      const kick = (roomIsHost && !s2.host)
        ? `<button class="ws-kick" title="내보내기" onclick="event.stopPropagation();roomKick(${i})">×</button>` : '';
      return `<div class="wc-seat">${kick}<div class="ws-face">${face}</div>
        <div class="ws-nick${ncClass(s2.profile && s2.profile.nickColor)}">${nickHTML(s2.nick, s2.profile && s2.profile.nickColor)}</div>
        ${s2.host ? '<div class="ws-host">방장</div>' : `<div class="ws-tag">${esc(lvl)}</div>`}</div>`;
    }).join('');
  }

  const btn = document.getElementById('wcStart');
  const modes = document.getElementById('wcModes');
  const label = document.getElementById('wcModeLabel');
  // 손님에게는 고를 권한이 없다 — 버튼을 숨기고 지금 모드만 알려준다
  if (modes) modes.classList.toggle('locked', !roomIsHost);
  if (label) label.textContent = roomIsHost ? '모드' : `모드 — ${MODE_NAME[roomModeCur] || '클래식'}`;
  if (modes) modes.style.display = roomIsHost ? '' : 'none';
  if (btn) {
    btn.style.display = roomIsHost ? '' : 'none';
    btn.disabled = !roomReady;
    btn.textContent = roomReady ? '게임 시작'
      : (roomModeCur === 'quad' ? '세 명부터 시작할 수 있어요' : '상대를 기다려요');
    // 미니게임은 자리가 넷이어도 둘이면 선다 — 남은 자리는 AI 가 채운다.
    // 그걸 안 적어 두면 넷을 다 기다려야 하는 줄 안다.
    if (roomReady && roomModeCur === 'mini') btn.textContent = '게임 시작 (빈자리는 AI)';
  }
  const note = document.getElementById('wcGuestNote');
  if (note) note.style.display = roomIsHost ? 'none' : '';
});
// 판 화면을 걷는다 — 새로고침 없이. 대회(대진표)로 돌아갈 때 쓰던 것과 같은 길이다.
function leaveGameScreen() {
  const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
  const g = document.getElementById('game'); if (g) g.style.display = 'none';
  const gt = document.getElementById('game-table'); if (gt) gt.classList.remove('on');
  const tb = document.getElementById('tv-table'); if (tb) tb.classList.remove('on');
  document.body.classList.remove('ingame', 'twelve');
  const lb = document.getElementById('lobby'); if (lb) lb.style.display = 'flex';
  stopTitleBlink();
  try { clearSession(); } catch (_) {}
}
// 판이 끝났다 — 같은 사람들과 방에 돌아가 모드를 고르고 다시 한다
window.backToRoom = function () {
  socket.emit('back_to_room');
};

// 방장이 자리 하나를 비운다. 남의 화면을 마음대로 끄는 일이라 한 번 묻는다.
window.roomKick = function (seat) {
  const nick = (_lastSeats && _lastSeats[seat] && _lastSeats[seat].nick) || '이 사람';
  askConfirm({ icon: '🚪', title: `${nick} 님을 내보낼까요?`,
               desc: '대기실에서 나가고 로비로 돌아갑니다.', yes: '내보내기', no: '취소' },
    () => socket.emit('room_kick', { seat }));
};
let _lastSeats = null;
socket.on('room_kicked', () => {
  toast('방장이 내보냈어요.');
  setTimeout(() => cancelWait(), 500);
});

const MODE_NAME = { classic: '클래식', item: '아이템전', twelve: 'TWELVE', quad: '다인전', mini: '미니게임', random: '랜덤' };

let sharedCode = '';
socket.on('room_created', ({ roomId, name }) => {
  sharedCode = roomId;
  roomIsHost = true; roomReady = false; roomModeCur = 'classic';
  closeCreate();
  document.getElementById('lobbyMain').style.display = 'none';
  document.getElementById('waitCard').style.display = 'flex';
  document.body.classList.add('waiting');   // 대기실 — 큰 로고를 접고 화면에 맞춘다
  document.getElementById('waitCode').textContent = roomId;
  document.getElementById('waitRoomName').textContent = name || '내 방';
  // 친구에게 도전장을 보내려던 참이면 방 코드가 나온 지금 전송
  if (_pendingChallenge) {
    socket.emit('challenge_friend', { idl: _pendingChallenge, roomId });
    _pendingChallenge = null;
  }
});

// ── 친구·클랜 실시간 알림 ──
// ※ 이벤트명 주의: 'challenged'/'challenge_*'는 관전자→승자 도전이 이미 사용 중이라 friend_ 접두어로 분리했다.
socket.on('friend_challenge_sent', ({ nick }) => toast(`⚔️ ${esc(nick || '친구')}님에게 도전장을 보냈어요!`));
socket.on('friend_challenge_fail', msg => toast('⚠️ ' + esc(msg || '도전장을 보내지 못했어요.')));
socket.on('friend_challenge', ({ from, roomId, password }) => {
  playSound('ping');
  askConfirm(
    { icon: '⚔️', title: `${from}님의 도전장!`, desc: '친구가 대전을 신청했어요. 지금 바로 대결할까요?', yes: '수락하고 입장', no: '나중에' },
    () => socket.emit('join_room', { roomId, pid: PID, nick: getNick(), password: password || '' }));
});
socket.on('friend_req',   ({ nick }) => { toast(`👥 ${esc(nick || '')}님이 친구 요청을 보냈어요!`); updateSocialBadges(); });
socket.on('friend_added', ({ nick }) => { toast(`🎉 ${esc(nick || '')}님과 친구가 되었어요!`); updateSocialBadges(); });
socket.on('clan_apply',   ({ nick }) => { toast(`🛡️ ${esc(nick || '')}님이 클랜 가입을 신청했어요!`); updateSocialBadges(); });
socket.on('clan_joined',  ({ clan }) => { toast(`🎉 ${esc(clan || '')} 클랜에 가입되었어요!`); updateSocialBadges(); });
socket.on('clan_kicked',  ({ clan }) => { toast(`😢 ${esc(clan || '')} 클랜에서 추방되었어요.`); updateSocialBadges(); });
socket.on('clan_disbanded', () => { toast('클랜이 해체되었어요.'); updateSocialBadges(); });
function copyText(text, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = '✓ 복사됨'; setTimeout(() => btn.textContent = o, 1400); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => prompt('복사하세요:', text));
  else prompt('복사하세요:', text);
}
// 코드 옆 ⧉ 아이콘 — 누르면 코드 복사, 잠깐 ✓ 표시
function copyCodeIcon(btn) {
  const orig = btn.innerHTML;
  const done = () => { btn.innerHTML = '✓'; btn.classList.add('copied'); setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1200); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(sharedCode).then(done).catch(() => prompt('복사하세요:', sharedCode));
  else prompt('복사하세요:', sharedCode);
}
function inviteURL() { return `${location.origin}${location.pathname}?room=${sharedCode}`; }

// ── 카카오 SDK (JS 키는 공개용 — 도메인 등록으로 보호됨) ──
const KAKAO_JS_KEY = 'e57f8c530bfbde01a6f3a6ab8232c2df';
try { if (window.Kakao && !Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY); } catch (_) {}

// 카톡 친구/채팅방으로 초대 메시지 바로 보내기
function shareKakao(btn) {
  const url = inviteURL();
  if (!window.Kakao || !Kakao.isInitialized()) return shareInvite(btn);  // SDK 로드 실패 시 대체
  try {
    Kakao.Share.sendDefault({
      objectType: 'text',
      text: `🃏 FLIP FLAP 한 판 할래?\n경매·블러핑 심리전 보드게임!\n\n방 코드: ${sharedCode}`,
      link: { mobileWebUrl: url, webUrl: url },
      buttonTitle: '게임 참가하기',
    });
  } catch (e) { console.warn('카카오 공유 실패:', e); shareInvite(btn); }
}
// 로비 친구 초대 — 카톡(우선)/공유 시트로 사이트 링크 보내기 (내 초대 코드 포함 → 둘 다 +100)
function inviteFriend() {
  const refQ = myAccount && !myAccount.guest ? `?ref=${encodeURIComponent(myAccount.id)}` : '';
  const url = `${location.origin}${location.pathname}${refQ}`;
  const text = refQ
    ? '🃏 FLIP FLAP 같이 한 판 하자!\n내 초대 링크로 가입하면 우리 둘 다 🪙100 코인!'
    : '🃏 FLIP FLAP 같이 한 판 하자!\n경매·블러핑 심리전 카드 보드게임 🎴';
  if (window.Kakao && Kakao.isInitialized()) {
    try { Kakao.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '게임 하러 가기' }); return; }
    catch (e) { /* 폴백 */ }
  }
  if (navigator.share) navigator.share({ title: 'FLIP FLAP', text, url }).catch(() => {});
  else if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url); alert('링크를 복사했어요! 친구에게 붙여넣어 보내세요.'); }
  else prompt('복사하세요:', url);
}

// 게임 종료 후 도전장 — 사이트 링크를 카톡/공유 시트로
function challengeFriend() {
  const url = `${location.origin}${location.pathname}`;
  const nick = (myAccount && myAccount.nick) || getNick();
  const text = `🃏 ${nick}님이 FLIP FLAP 도전장을 보냈어요!\n경매·블러핑 심리전 보드게임 한 판 어때요?`;
  if (window.Kakao && Kakao.isInitialized()) {
    try { Kakao.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '도전 받기' }); return; }
    catch (e) { /* 폴백 */ }
  }
  if (navigator.share) navigator.share({ title: 'FLIP FLAP 도전장', text, url }).catch(() => {});
  else { copyText(url, { textContent: '', }); alert('링크를 복사했어요! 친구에게 붙여넣어 도전장을 보내세요.'); }
}
function copyLink(btn) { copyText(inviteURL(), btn); }
// 폰에서 누르면 카톡·문자·라인 등 설치된 앱 공유 시트가 뜸 (Web Share API)
function shareInvite(btn) {
  const url = inviteURL();
  const data = { title: 'FLIP FLAP 초대', text: `FLIP FLAP 한 판 할래? 방 코드: ${sharedCode}`, url };
  if (navigator.share) {
    navigator.share(data).catch(() => {});   // 사용자가 취소하면 조용히 무시
  } else {
    // 공유 미지원(주로 데스크톱) → 링크 복사로 대체
    copyText(url, btn);
    setTimeout(() => alert('공유를 지원하지 않는 브라우저예요. 링크를 복사했으니 카톡에 붙여넣어 보내세요!'), 100);
  }
}
// 대기실을 걷고 로비를 다시 보여 준다. 새로고침 없이 화면만 되돌린다.
function leaveWaitUI() {
  fromRoom = false;
  document.getElementById('waitCard').style.display = 'none';
  document.getElementById('lobbyMain').style.display = '';
  document.body.classList.remove('waiting');
  sharedCode = '';
  roomIsHost = false; roomReady = false; roomModeCur = 'classic';
  for (const b of document.querySelectorAll('#wcModes .wc-mode')) b.classList.toggle('on', b.dataset.m === 'classic');
}

// toHome=true 면 로비로만 나간다. '나가기' 로 나온 사람은 대개 다른 방을
// 고르려는 것이라 멀티 창을 다시 열어 주지만, '홈' 을 누른 사람은 홈을 보려는
// 것이다 — 거기서도 멀티 창이 뜨면 홈을 눌렀는데 홈이 아닌 셈이다.
function cancelWait(toHome) {
  socket.emit('leave_room');
  clearSession();
  // 홈으로 나갈 때는 새로고침하지 않는다. 페이지를 다시 읽으면 배경음악이
  // 처음부터 끊겼다 다시 시작하는데, 방을 하나 나왔을 뿐인 사람에게는
  // 화면이 통째로 갈리는 것으로 느껴진다. 화면만 되돌리면 노래는 그대로 흐른다.
  if (toHome) { leaveWaitUI(); return; }
  // '나가기' 는 곧이어 멀티 창을 열어야 해서 예전 길(새로고침)을 그대로 쓴다 —
  // 방을 만들다 만 상태가 남아 있을 수 있어 한 번 씻어 내는 편이 안전하다.
  roomIsHost = false; roomReady = false; roomModeCur = 'classic';
  sessionStorage.setItem('ff_openmulti', '1');
  fastReload();
}


// ── 관전자 도전 (관전 → 대전 전환) ──
function specChallenge(btn) {
  socket.emit('spec_challenge', { nick: getNick() });
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '⚔️ 도전장 전송 — 수락 대기…'; }
}
socket.on('challenged', ({ nick }) => {
  playSound('ping');
  askConfirm({ icon: '⚔️', title: `${nick}님의 도전장!`, desc: '관전하던 유저가 대전을 신청했어요. 받아들일까요?', yes: '받아들인다!', no: '거절' },
    () => socket.emit('challenge_accept'),
    () => socket.emit('challenge_decline'));
});
socket.on('spec_challenge_fail', () => {
  toast('😢 상대가 도전을 받지 않았어요', 2500);
  const b = document.querySelector('#goStats button'); if (b) { b.disabled = false; b.style.opacity = '1'; b.textContent = '⚔️ 승자에게 도전하기'; }
});

socket.on('error', msg => alert(msg));
// 서버에서 오든 오프라인 엔진에서 오든 이 세 길로만 들어온다.
// 화면이 둘을 구별할 필요가 없어야 오프라인이 "다른 게임" 이 되지 않는다.
function onGameStart({ vsBot, difficulty: diff, roomId, nicks, profiles, spectate, itemMode, tour, graceLeft }) {
  isTourMatch = !!tour;          // 대회 경기면 끝난 뒤 대진표로 돌아간다
  isVsBot = vsBot;
  isSpec = !!spectate;
  isItemMode = !!itemMode;
  document.body.classList.toggle('item-mode', isItemMode);   // 아이템전 전용 톤
  gameNicks = nicks || null;
  gameProfiles = profiles || null;
  if (roomId && !isSpec) saveSession(roomId);   // 관전은 재접속 세션 저장 안 함
  // 돌아왔다 — 끊김 창을 걷고, 서버가 알려 준 남은 유예로 맞춘다.
  // 화면이 세던 값은 어림이라 실제와 어긋날 수 있다.
  dcHide();
  if (typeof graceLeft === 'number') dcLeft = graceLeft;
  // 관전 모드: 이모트 숨김 + 관전 배너
  const ew = document.getElementById('emoteWrap'); if (ew) ew.style.display = isSpec ? 'none' : '';
  // 재대결/매칭/재접속 대비 초기화
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('matchModal').classList.remove('show');
  rkHide();            // 룰렛이 남아 있으면 다음 매칭에 지난 결과가 보인다
  matchCountdownStop();
  closeModePanels();   // 열려 있던 솔로/멀티 팝업 닫기 (관전 진입 등)
  hideGrace();
  document.getElementById('rematchNote').textContent = '';
  const gr = document.getElementById('goRewards'); if (gr) { gr.textContent = ''; gr.style.display = 'none'; }
  const rb = document.getElementById('rematchBtn'); if (rb) { rb.disabled = false; rb.style.opacity = '1'; }
  prevPhase = null; selectedBidCard = null; prevMyAction = false; stopTitleBlink();
  seenAcq.myAcq = new Set(); seenAcq.oppAcq = new Set(); boardCelebrated = false; lastSig = {};
  needsDeal = !isSpec;   // 게임 시작 시 손패를 한 장씩 나눠주는 딜 모션 (1회)
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  document.body.classList.add('ingame');   // 게임 중 화면 스크롤 잠금
  applyMySkins();   // 내 테이블/카드앞면 스킨 적용
  // AI면 프로필 아래 난이도 배지, 사람이면 숨김
  const de = document.getElementById('cpuDiff');
  if (vsBot) { de.style.display = ''; de.textContent = { easy:'쉬움', normal:'보통', hard:'어려움', expert:'전문가' }[diff] || diff; }
  else de.style.display = 'none';
  playSound('deal');
  startBGM('game');
  // 판을 열었으면 테이블을 재야 한다. 예전엔 리사이즈가 올 때만 쟀는데,
  // 폰은 판을 열 때 주소창이 접히며 리사이즈가 따라와서 우연히 맞았고
  // 컴퓨터에서는 그런 게 없어 타원 테이블이 아예 안 그려졌다 —
  // 카드가 맨바닥에 흩어진 것처럼 보인 이유다.
  scheduleRelayout();
}
let drewNow = false;
function onStateUpdate(s) {
  // 관전자 상태 → 플레이어 화면 형태로 변환 (아래=P1, 위=P2)
  if (s.spec) {
    s = {
      ...s, myIndex: 1,
      myHand: [], myAcq: s.p1Acq, oppAcq: s.p2Acq, oppHandLen: s.p2HandLen,
      auction: s.auction ? {
        centerCard: s.auction.centerCard, offeredCard: s.auction.offeredCard, auctionType: s.auction.auctionType,
        myBid: s.auction.p1Bid, oppBid: s.auction.p2Bid,
        myBidSubmitted: s.auction.p1Submitted, oppBidSubmitted: s.auction.p2Submitted,
      } : null,
      pick: s.pick ? { myChoice: s.pick.choices[0], oppChoice: s.pick.choices[1], cards: s.pick.cards } : null,
    };
  }
  const prev = prevPhase;
  const changed = s.phase !== prevPhase;
  drewNow = prev === 'draw' && s.phase === 'offer';
  // 정산 순간(reveal → 다음): 화면에 있는 카드들의 출발 위치를 렌더 전에 기록
  const flight = (prev === 'reveal' && s.phase !== 'reveal' && state && state.auction)
    ? captureSettleFlight(state) : null;
  prevPhase = s.phase; state = s; myIndex = s.myIndex;
  render(changed);
  renderItems(s);
  if (flight) playSettleFlight(flight);
  tutTick();
  if (changed && s.phase === 'reveal') { playSound('reveal'); if (!isSpec && s.auction) screenFx(myBidWins(s.auction.myBid, s.auction.oppBid) ? 'auc-win' : 'reveal'); }
  if (drewNow) playSound('deal');
  // 세트 완성이 보드에 나타나는 순간 강조 (결과창은 서버가 잠시 뒤 띄움)
  if (s.phase === 'game_over' && !boardCelebrated) {
    const mySet = localSet(s.myAcq), oppSet = localSet(s.oppAcq);
    if (mySet || oppSet) {
      boardCelebrated = true;
      playSound('setwin');
      celebrateSet(mySet ? 'myAcq' : 'oppAcq', mySet || oppSet);
    }
  }
  // 내 차례 알림 (탭이 숨겨져 있을 때)
  const mine = isMyAction(s);
  // 내 차례가 막 왔다 — 화면을 안 보고 있어도 알 수 있게 한 번 울린다
  if (mine && !prevMyAction) vibe('turn');
  if (mine && !prevMyAction && document.hidden) { startTitleBlink(); playSound('ping'); }
  if (!mine) stopTitleBlink();
  prevMyAction = mine;
}
let boardCelebrated = false;
let needsDeal = false;   // 게임 시작 딜 모션 1회 플래그
function localSet(acq) {
  if (!acq) return null;
  const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1;
  for (const k of [2, 3, 4, 6]) if ((c[k] || 0) >= k) return k;
  return null;
}

// ── 정산 카드 비행 — 2단계 연출: ① 낙찰품→승자 더미 ② 배팅 카드 교환 ──
function captureSettleFlight(old) {
  const a = old.auction;
  if (!a || !a.myBid || !a.oppBid) return null;
  const rectOf = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const iWin = myBidWins(a.myBid, a.oppBid);
  const legs = [];
  // 1단계 — 경매품 2장 (중앙 매트) → 승자 더미
  const prizeEls = document.querySelectorAll('#auctionItems .card');
  const prizeCards = [a.centerCard, a.offeredCard];
  prizeEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width && prizeCards[i]) legs.push({ kind: 'prize', card: prizeCards[i], from: r, destSel: `#${iWin ? 'myAcq' : 'oppAcq'} .card[data-id="${prizeCards[i].id}"]`, fallback: iWin ? '#myAcq' : '#oppAcq' });
  });
  // 2단계 — 배팅 카드 교환 (상대 배팅→내 손 / 내 배팅→상대 손)
  const oppR = rectOf('#oppBid .card'), myR = rectOf('#myBid .card');
  if (oppR) legs.push({ kind: 'bid', card: a.oppBid, from: oppR, destSel: `#myHand .card[data-id="${a.oppBid.id}"]`, fallback: '#myHand' });
  if (myR) legs.push({ kind: 'bid', card: a.myBid, from: myR, destSel: null, fallback: '#oppHand' });
  return legs.length ? legs : null;
}
let flightUntil = 0;   // 정산 비행이 끝나는 시각 — 세트 축하는 이 뒤에
function playSettleFlight(legs) {
  if (document.hidden) return;                        // 백그라운드 탭 — 연출 스킵 (최적화)
  flightUntil = Date.now() + 850;
  // 모든 고스트를 먼저 만들어 붙이고 (리플로우 1회) transition-delay로 순차 출발
  const active = [];
  let prizeN = 0;
  for (const leg of legs) {
    const destEl = leg.destSel && document.querySelector(leg.destSel);
    const target = destEl || document.querySelector(leg.fallback);
    if (!target) continue;
    const tr = target.getBoundingClientRect();
    if (!tr.width && !tr.height) continue;
    const ghost = makeCard(leg.card);
    ghost.classList.add('fly-card');
    ghost.style.left = leg.from.left + 'px'; ghost.style.top = leg.from.top + 'px';
    ghost.style.width = leg.from.width + 'px'; ghost.style.height = leg.from.height + 'px';
    document.body.appendChild(ghost);
    // 1박자: 낙찰품 2장 나란히(0·80ms, ~530ms 완료) → 완전히 끝난 뒤 2박자: 배팅 교환(620ms~)
    const delay = leg.kind === 'prize' ? (prizeN++) * 80 : 620;
    let dx = (tr.left + tr.width / 2) - (leg.from.left + leg.from.width / 2);
    let dy = (tr.top + tr.height / 2) - (leg.from.top + leg.from.height / 2);
    let scale = destEl ? Math.max(tr.width / leg.from.width, 0.4) : 0.8;
    const fade = !destEl;
    if (fade) { dx *= 0.45; dy *= 0.45; }             // 내 배팅: 상대 손 방향으로 밀려나며 페이드 — 화면 가로지르는 교차 제거
    if (destEl) {
      destEl.style.visibility = 'hidden';             // 도착 카드는 착지까지 숨김 (이중 표시 방지)
      destEl.style.animation = 'none';                // 자체 낙하·바운스(acquireIn) 취소 — 비행이 도착을 대신함
    }
    active.push({ ghost, destEl, delay, dx, dy, scale, fade });
  }
  if (!active.length) return;
  void document.body.offsetWidth;                     // 시작 위치 확정 (리플로우 1회)
  for (const f of active) {
    f.ghost.style.transitionDelay = `${f.delay}ms`;
    f.ghost.style.transform = `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`;
    if (f.fade) f.ghost.style.opacity = '0';
    // 비행이 끝나는 그 프레임에 실제 카드로 교체 — 멈칫거림 없이 이어짐
    let done = false;
    const finish = () => { if (done) return; done = true;
      if (f.destEl) {
        f.destEl.style.visibility = '';
        f.destEl.classList.remove('anim-acquire');   // 낙하 애니 클래스 제거 후
        f.destEl.style.animation = '';               // 인라인 none 해제 — 이게 남으면 .set-win 클래스 애니가 무시됨(세트 일부만 반짝이던 원인)
      }
      f.ghost.remove(); };
    f.ghost.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, f.delay + 700);                // 안전망 (탭 전환 등으로 이벤트 유실 시)
  }
  playSound('deal');
  setTimeout(() => playSound('deal'), 630);           // 교환 박자에 맞춰 한 번 더
}

// ── 전적 (localStorage) ─────────────────────────────────────
function getStats() { try { return JSON.parse(localStorage.getItem('ff_stats')) || { win:0, loss:0, draw:0 }; } catch (_) { return { win:0, loss:0, draw:0 }; } }
function recordResult(winner, mi) {
  const s = getStats();
  if (winner === 0) s.draw++; else if (winner === mi) s.win++; else s.loss++;
  if (winner === mi) { try { playVictoryFx(); } catch (_) {} }   // 내가 이긴 판만
  localStorage.setItem('ff_stats', JSON.stringify(s));
  renderLobbyStats();
}
function renderLobbyStats() {
  const el = document.getElementById('lobbyStats'); if (!el) return;
  // 전적은 로그인 계정에만 표시 (게스트는 기록 없음)
  if (!myAccount) { el.textContent = ''; return; }
  el.textContent = '';   // 계정 전적은 프로필 칩에 표시되므로 중복 제거
}
renderLobbyStats();
socket.on('special', () => {
  playSound('special');
  const t = document.getElementById('specialToast');
  t.style.display = 'block';
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  setTimeout(() => { t.style.display = 'none'; }, 2600);
});
socket.on('game_start',  onGameStart);
socket.on('state_update', onStateUpdate);
socket.on('game_over',    onGameOver);
function onGameOver({ winner, setKind, timeout, byProgress, forfeit, myIndex: mi, spec, nicks }) {
  if (spec) {   // 관전자: 중립 결과 화면
    const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
    title.textContent = '게임 종료'; title.style.color = '#c8a000';
    desc.textContent = winner === 0 ? '무승부!' : `🏆 ${(nicks && nicks[winner - 1]) || 'P' + winner} 승리!`;
    document.getElementById('goStats').innerHTML = winner !== 0
      ? `<button class="btn btn-gold" style="width:auto" onclick="specChallenge(this)">⚔️ 승자에게 도전하기</button>` : '';
    const rb = document.getElementById('rematchBtn'); if (rb) rb.style.display = 'none';
    setTimeout(() => document.getElementById('gameOver').style.display = 'flex', 800);
    return;
  }
  clearSession(); stopTitleBlink(); hideGrace(); recordResult(winner, mi);
  if (tutorial) {   // 튜토리얼 마무리 인사 + 완료 보상(코인 100, 최초 1회만)
    tutorial = false; tutQueue = []; tutOpen = false; tutClearGlow();
    const baseTip = '🎓 <b>튜토리얼 완료!</b> 이제 규칙을 다 배웠어요. 💡 덱이 다 떨어지면 <b>세트에 가장 가까운 사람</b>이 이겨요. 실전에서 친구와 붙어보세요!';
    tutShow({ pos: 'top', text: baseTip });   // 아무 곳이나 탭(블로커)·알겠어요 둘 다 tutConfirm으로 닫힘
    const tk = localStorage.getItem('ff_auth');
    if (tk) {
      apiPost('/api/tutorial-done', { token: tk }).then(r => {
        if (r && r.profile) { myAccount = r.profile; renderAccount(); }
        if (r && r.claimed) {   // 실제로 지급된 첫 완료에만 보상 안내 (재플레이 시엔 표시 안 함)
          const box = document.getElementById('tutText');
          if (box && tutOpen) box.innerHTML = baseTip + '<br><span style="color:#ffd94a">🎁 완료 보상 🪙 +' + r.amount + ' 지급!</span>';
          toast(`🎁 튜토리얼 완료 보상 <b style="color:#ffd94a">🪙 +${r.amount}</b>!`, 3500);
        }
      }).catch(() => {});
    }
  }
  const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
  let delay = 500;
  if (winner === 0) {
    title.textContent = '무승부'; title.style.color = '#c8a86a'; title.style.textShadow = 'none';
    desc.textContent = '세트 근접도가 완전히 같아요!';
  } else if (winner === mi) {
    title.textContent = '🏆 승리!'; title.style.color = '#ffd94a'; title.style.textShadow = '0 0 24px rgba(255,215,80,.45)';
    desc.textContent = forfeit ? '상대가 게임을 떠났어요 — 몰수승!'
      : timeout ? '상대 시간 초과!'
      : byProgress ? `세트 근접 승리! (${setKind}짜리에 가장 가까웠어요)`
      : `${setKind}짜리 세트 완성!`;
    playSound('victory'); vibe('win');
    if (setKind && !byProgress && !forfeit) { celebrateSet('myAcq', setKind); playSound('setwin'); delay = 1400; }
    else animateWinCards();
  } else {
    title.textContent = '패배…'; title.style.color = '#9a8a90'; title.style.textShadow = 'none';
    desc.textContent = forfeit ? '접속이 끊겨 몰수패 처리됐어요.'
      : timeout ? '시간 초과…'
      : byProgress ? '상대가 세트에 더 가까웠어요.'
      : `상대가 ${setKind}짜리 세트를 완성했어요.`;
    playSound('defeat'); vibe('lose');
    screenFx('lose');
    if (setKind && !byProgress && !forfeit) { celebrateSet('oppAcq', setKind); delay = 1400; }
  }
  renderGameOverStats(winner, byProgress ? null : setKind, mi);
  // 게스트가 이겼으면 회원 전환 유도
  if (!myAccount && winner === mi) {
    const lost = isVsBot ? (difficulty === 'expert' ? 40 : difficulty === 'easy' ? 5 : 15) : 60;
    setTimeout(() => toast(`💡 로그인했다면 <b style="color:#ffd94a">🪙 ${lost}</b>을 받았을 거예요!<br>가입하고 보상을 모아보세요`, 3600), delay + 700);
  }
  // 몰수 게임은 방이 사라져서 재대결 불가
  const rb = document.getElementById('rematchBtn');
  if (rb) rb.style.display = (forfeit && !isVsBot) ? 'none' : '';
  // 대회 경기는 재대결·로비 대신 대진표로 돌아간다.
  // 로비 버튼은 새로고침을 하는데, 새로고침하면 소켓이 바뀌어 자리를 잃는다.
  const goBtns = document.getElementById('goBtns');
  // 대기실을 거쳐 들어온 방이면 '방으로' 를 내민다.
  // 예전엔 '한 판 더'(같은 모드로 즉시)와 '로비로'(새로고침)뿐이라,
  // 같은 사람들과 다른 모드로 한 판 더 하려면 방을 다시 만들고 코드를 다시 나눠야 했다.
  roomBackBtn(goBtns, fromRoom && !isVsBot && !isStourMatch && !isTourMatch);
  // 솔로 대회도 같다 — '한 판 더' 는 대회 밖의 판을 열고, '로비로' 는 새로고침을 한다.
  // 둘 다 대회를 하던 흐름을 끊는다. 대진표로 돌아가는 길 하나만 남긴다.
  if (isStourMatch && goBtns) {
    if (rb) rb.style.display = 'none';
    stourOnlyBackBtn(goBtns);
  } else if (isTourMatch && goBtns) {
    if (rb) rb.style.display = 'none';
    let back = document.getElementById('tourBackBtn');
    if (!back) {
      back = document.createElement('button');
      back.id = 'tourBackBtn'; back.className = 'btn btn-gold';
      back.textContent = '🏆 대진표로';
      back.onclick = () => tourBackToBracket();
      goBtns.appendChild(back);
    }
    back.style.display = '';
    goBtns.querySelectorAll('button').forEach((b) => {
      if (b !== back) b.style.display = 'none';
    });
  } else {
    const back = document.getElementById('tourBackBtn'); if (back) back.style.display = 'none';
    const sback = document.getElementById('stourBackBtn'); if (sback) sback.style.display = 'none';
  }
  setTimeout(() => { document.getElementById('gameOver').style.display = 'flex'; showRewards(); }, delay);
}

// 결과창에 '방으로' 를 붙이거나 뗀다. 방이 살아 있는 판에서만 뜬다.
function roomBackBtn(goBtns, on) {
  if (!goBtns) return;
  let b = document.getElementById('roomBackBtn');
  if (!on) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'roomBackBtn'; b.className = 'btn btn-gold'; b.style.width = 'auto';
    b.innerHTML = '🚪 방으로';
    b.onclick = () => backToRoom();
    goBtns.insertBefore(b, goBtns.firstChild);
  }
  b.style.display = '';
  // '한 판 더' 는 같은 모드로 바로 다시 하는 길이라 그대로 둔다 —
  // 모드를 바꾸고 싶을 때만 방으로 간다.
}

// 결과창에 '대진표로' 하나만 남긴다 (솔로 대회 전용)
function stourOnlyBackBtn(goBtns) {
  let back = document.getElementById('stourBackBtn');
  if (!back) {
    back = document.createElement('button');
    back.id = 'stourBackBtn'; back.className = 'btn btn-gold'; back.style.width = 'auto';
    back.textContent = '🏆 대진표로';
    back.onclick = () => stourBackToBracket();
    goBtns.appendChild(back);
  }
  back.style.display = '';
  goBtns.querySelectorAll('button').forEach((b) => { if (b !== back) b.style.display = 'none'; });
  const chal = document.querySelector('#goBox .btn-kakao');
  if (chal) chal.style.display = 'none';
}

// 승리/패배 화면 통계 (완성 세트 + 획득 수)
function renderGameOverStats(winner, setKind, mi) {
  const box = document.getElementById('goStats');
  if (!box || !state) { if (box) box.innerHTML = ''; return; }
  box.innerHTML = '';
  if (winner !== 0 && setKind) {
    const winnerAcq = (winner === mi) ? state.myAcq : state.oppAcq;
    const setCards = (winnerAcq || []).filter(c => c.kind === setKind).sort((a, b) => a.grade - b.grade);
    const row = document.createElement('div'); row.className = 'go-set';
    setCards.forEach(c => {
      const rc = document.createElement('div'); rc.className = 'rc'; rc.dataset.kind = c.kind;
      rc.innerHTML = `<span class="rc-rank">${c.grade}</span><span class="rc-num">${c.kind}</span>`;
      row.appendChild(rc);
    });
    box.appendChild(row);
  }
  const myN = (state.myAcq || []).length, opN = (state.oppAcq || []).length;
  const line = document.createElement('div'); line.className = 'go-count';
  line.innerHTML = `획득 카드 — 나 <b>${myN}</b>장 · 상대 <b>${opN}</b>장`;
  box.appendChild(line);
}
socket.on('opponent_left', () => { clearSession(); alert('상대가 나갔어요.'); fastReload(); });

// 세트 완성 카드 특수효과
function celebrateSet(containerId, kind) {
  // 세트 카드가 전부 '착지해 보이는' 상태가 된 뒤 전체를 한 번에 반짝
  const need = { 2: 2, 3: 3, 4: 4, 6: 6 }[kind] || kind;
  let tries = 0;
  const poll = () => {
    const cards = [...document.querySelectorAll(`#${containerId} .pile-group[data-kind="${kind}"] .card`)];
    const landed = cards.filter(c => c.style.visibility !== 'hidden');   // 비행 중(숨김)인 카드는 아직
    if (landed.length >= need || tries >= 25) {
      cards.forEach((c, i) => {
        c.style.visibility = '';
        c.classList.remove('anim-acquire');
        c.style.animation = '';                     // 인라인 none 잔재 해제 (클래스 애니 차단 방지)
        if (!c.classList.contains('set-win')) setTimeout(() => c.classList.add('set-win'), i * 70);
      });
      return;
    }
    tries++; setTimeout(poll, 100);
  };
  poll();
}

// ── 체스 시계 표시 ──────────────────────────────────────────
let lastMyT = 999;
function fmt(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
function setTimerEl(id, secs, active) {
  const el = document.getElementById(id); if (!el || secs == null) return;
  el.textContent = fmt(secs);
  el.classList.toggle('active', !!active);
  el.classList.toggle('warn', secs <= 60);
}
function updateClocks(t1, t2, active) {
  if (t1 == null) return;
  const oppIdx = myIndex === 1 ? 2 : 1;
  setTimerEl('myTimer',  myIndex === 1 ? t1 : t2, active === myIndex);
  setTimerEl('oppTimer', myIndex === 1 ? t2 : t1, active === oppIdx);
}
socket.on('clock', ({ t1, t2, active }) => {
  // 캐시된 state.time도 동기화 — 카드 클릭 등 로컬 재렌더가 낡은 시간으로 되돌리는 버그 방지
  if (state && state.time) { state.time[1] = t1; state.time[2] = t2; }
  updateClocks(t1, t2, active);
  const myT = myIndex === 1 ? t1 : t2;
  if (myT <= 10 && myT > 0 && myT !== lastMyT) playSound('tick');
  lastMyT = myT;
});
socket.on('time_warning', ({ player }) => {
  if (player === myIndex) { playSound('bell'); vibe('warn'); }
});

// ── 카드 ────────────────────────────────────────────────────
const is21  = c => c && c.kind === 2 && c.grade === 1;
const is610 = c => c && c.kind === 6 && c.grade === 10;

// 배팅 승패(클라 판정, 서버와 동일 로직) — 결과 안내용
function myBidWins(my, opp) {
  if (is610(my) && is21(opp)) return true;
  if (is610(opp) && is21(my)) return false;
  return (my.kind * 100 + my.grade) < (opp.kind * 100 + opp.grade);
}
// 화면 전체 이펙트 — 승리(골드 플래시+반짝), 패배(어두워짐), 경매낙찰(짧은 플래시)
let _fxEl = null;
function screenFx(kind) {
  if (!_fxEl) { _fxEl = document.createElement('div'); _fxEl.id = 'screenFx'; document.body.appendChild(_fxEl); }
  const el = _fxEl;
  el.className = ''; void el.offsetWidth;
  el.className = 'fx-' + kind;
  const g = document.getElementById('game');
  if (g) { g.classList.remove('shake-win', 'shake-lose'); void g.offsetWidth; g.classList.add(kind === 'win' ? 'shake-win' : kind === 'lose' ? 'shake-lose' : 'shake-win'); setTimeout(() => g.classList.remove('shake-win', 'shake-lose'), 700); }
  setTimeout(() => { el.className = ''; }, kind === 'win' ? 1100 : 800);
}

// 내 테이블/카드앞면 스킨을 게임 화면에 적용 (내 시야 기준 코스메틱)
const TABLE_CLS = { tbl_blue: 'tbl-blue', tbl_purple: 'tbl-purple', tbl_gold: 'tbl-gold', tbl_forest: 'tbl-forest', tbl_crystal: 'tbl-crystal', tbl_obsidian: 'tbl-obsidian', tbl_hanji: 'tbl-hanji', tbl_shard: 'tbl-shard', tbl_hwatu: 'tbl-hwatu', tbl_dawn: 'tbl-dawn', tbl_dragon: 'tbl-dragon' , tbl_tide: 'tbl-tide', tbl_frost: 'tbl-frost', tbl_najeon: 'tbl-najeon', tbl_lantern: 'tbl-lantern',
                    tbl_storm: 'tbl-storm', tbl_jelly: 'tbl-jelly', tbl_firework: 'tbl-firework' };
const FACE_CLS  = { face_neon: 'cf-neon', face_classic: 'cf-classic', face_gold: 'cf-gold', face_crystal: 'cf-crystal', face_obsidian: 'cf-obsidian', face_hanji: 'cf-hanji', face_shard: 'cf-shard', face_hwatu: 'cf-hwatu', face_dragon: 'cf-dragon' , face_tide: 'cf-tide', face_frost: 'cf-frost',
                    face_origami: 'cf-origami', face_pixel: 'cf-pixel', face_storm: 'cf-storm' };
function applyMySkins() {
  // 경기장이 여럿이다(2인전·미니게임·트웰브). 하나만 칠하면 나머지가 맨 테이블이 된다.
  // 트웰브는 화면 전체가 아니라 가운데 테이블 판만 물든다(#tv.tbl-* #tv-table).
  for (const id of ['game', 'mini', 'tv']) {
    const g = document.getElementById(id); if (!g) continue;
    // 벗길 목록을 손으로 적으면 새 스킨을 넣을 때마다 빠뜨린다 —
    // 실제로 파편 테이블·앞면이 여기서 누락돼 갈아입어도 예전 스킨이 남았다.
    // 표에서 그대로 끌어오면 추가만 해도 자동으로 따라온다.
    g.classList.remove(...Object.values(TABLE_CLS), ...Object.values(FACE_CLS));
    const p = myAccount;
    if (p && TABLE_CLS[p.table]) g.classList.add(TABLE_CLS[p.table]);
    if (p && FACE_CLS[p.cardFace]) g.classList.add(FACE_CLS[p.cardFace]);
  }
  // 앞면 스킨은 body 에도 건다. 판 밖에서 만드는 카드가 있기 때문이다 —
  // 정산 때 날아가는 카드는 body 에 붙어서, 판 안에만 걸어 두면 그 순간만
  // 기본 무늬로 돌아갔다("중간중간 스킨이 풀린다"). 테이블 스킨은 판 것이라 안 건다.
  document.body.classList.remove(...Object.values(FACE_CLS));
  if (myAccount && FACE_CLS[myAccount.cardFace]) document.body.classList.add(FACE_CLS[myAccount.cardFace]);
}

// 탭 처리 — click 만 쓰면 폰에서 가끔 먹지 않는다.
//
// 두 가지가 겹쳐 있었다.
//   · 손가락이 몇 픽셀만 움직여도 브라우저가 스크롤로 보고 click 을 취소한다.
//     카드가 부채꼴로 겹쳐 있어 누르면서 살짝 미끄러지기 쉽다.
//   · 누르는 도중 서버 상태가 와서 손패를 다시 그리면, 누르던 요소가 사라져
//     click 이 아예 안 생긴다.
//
// 그래서 pointerdown 에서 자리를 기억하고 pointerup 에서 판단한다. 조금 움직인
// 건 탭으로 친다(12px). 그리고 pointerdown 순간의 카드 id 로 처리하므로,
// 그 사이 DOM 이 바뀌어도 누른 카드가 바뀌지 않는다.
const TAP_SLOP = 16;   // 손가락은 흐른다. 12 는 엄지로 누를 때 자주 넘겼다.
function onTap(el, fn) {
  let sx = 0, sy = 0, mx = 0, my = 0, live = false, doneAt = 0;
  // manipulation 은 '더블탭 확대만' 막는다 — 훑어 넘기기(pan)는 그대로 살아 있어서,
  // 아이폰이 손가락을 스크롤로 채 가면 pointerup 대신 pointercancel 만 오고 탭이
  // 통째로 사라진다(화면 아래쪽 버튼에서 특히 자주 났다). 누르는 자리에서는
  // 스크롤할 것이 없으니 아예 none 으로 잠근다.
  el.style.touchAction = 'none';
  const fire = (e) => { doneAt = Date.now(); fn(e); };
  const near = () => Math.hypot(mx - sx, my - sy) <= TAP_SLOP;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;   // 오른쪽 버튼 무시
    live = true; sx = mx = e.clientX; sy = my = e.clientY;
    // 손가락에는 캡처를 걸지 않는다. 웹킷에서 터치 포인터를 잡아 두면 뒤따르는
    // pointerup 이 엉뚱한 데로 가는 일이 있다. 마우스는 눌러 끌고 나갔다 돌아오는
    // 경우가 있어 캡처가 도움이 된다.
    if (e.pointerType === 'mouse') { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
  });
  el.addEventListener('pointermove', (e) => { if (live) { mx = e.clientX; my = e.clientY; } });
  // 채여 간 누름도 제자리에서 뗀 것이면 탭으로 친다 — 스크롤을 잠갔으니
  // 여기까지 오는 것은 대개 브라우저가 가로챈 '멀쩡한 탭' 이다.
  el.addEventListener('pointercancel', () => {
    if (!live) return;
    live = false;
    if (near()) fire();
  });
  el.addEventListener('pointerup', (e) => {
    if (!live) return;
    live = false;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_SLOP) return;   // 끌었으면 탭이 아니다
    e.preventDefault();
    fire(e);
  });
  // 마지막 보루 — 포인터 이벤트가 통째로 새어 나가도 click 은 대개 온다.
  // 방금 탭으로 처리했으면 무시한다. 안 그러면 한 번 누르고 두 번 먹는다.
  el.addEventListener('click', (e) => {
    if (Date.now() - doneAt < 700) return;
    live = false;
    fire(e);
  });
}
window.onTap = onTap;   // 다인전(client4)도 같은 처리를 쓴다

// 버튼용 — 눌림을 두 길(pointerup·click) 모두에서 받는다.
// 마우스에서는 둘 중 하나가 조용히 사라지는 일이 실제로 생긴다(포인터가 다른
// 요소에 잡혀 있거나, 눌린 요소가 그 사이 다시 그려지거나). 둘 다 듣고, 같은
// 누름은 한 번만 처리한다.
function onPress(el, fn) {
  let last = 0;
  const fire = (e) => {
    const now = Date.now();
    if (now - last < 350) return;   // 같은 누름에서 두 번 오는 것을 거른다
    last = now;
    fn(e);
  };
  // 버튼 위에서 훑어 넘길 일은 없다. manipulation 으로 두면 아이폰이 손가락을
  // 스크롤로 채 가면서 pointerup 도 click 도 없이 pointercancel 만 남기고
  // 누름이 통째로 사라진다 — 화면 아래쪽 버튼에서 특히 그랬다.
  el.style.touchAction = 'none';
  el.addEventListener('pointerup', (e) => { if (e.button === 0) fire(e); });
  el.addEventListener('pointercancel', fire);
  el.addEventListener('click', fire);
}
window.onPress = onPress;

function makeCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (!card) {
    el.classList.add('back');
    el.innerHTML = '<span class="bf flip">FLIP</span><span class="bf flap">FLAP</span>';
    if (opts.animate) el.classList.add('anim-deal');
    return el;
  }

  el.dataset.kind = card.kind;
  el.dataset.id = card.id;   // 정산 비행 애니메이션의 도착 지점 탐색용
  if (is21(card) || is610(card)) el.classList.add('special');

  const top = document.createElement('div');
  top.className = 'c-top';
  const rank = document.createElement('span');
  // 10 이상은 글자가 두 칸이라 좌우 여백을 줄여야 안 눌린다(6-10 이 대표)
  rank.className = 'c-rank' + (card.grade >= 10 ? ' two' : '');
  rank.textContent = card.grade;          // 좌상단 = 등급번호만
  top.appendChild(rank);
  if (is21(card) || is610(card)) {
    const mk = document.createElement('span');
    mk.className = 'c-mark';
    // 최강·최약 표식도 직접 그린 그림으로 (없으면 원래 문자로 되돌아간다)
    const art = is21(card) ? rankIco('👑') : ico('⚔️', 'c-mark-ico');
    if (art && art.indexOf('<') === 0) mk.innerHTML = art; else mk.textContent = is21(card) ? '👑' : '⚔';
    top.appendChild(mk);
  }

  const num = document.createElement('div');
  num.className = 'c-num'; num.textContent = card.kind;   // 가운데 큰 숫자 = 종류

  el.appendChild(top); el.appendChild(num);

  if (opts.draw)          el.classList.add('anim-draw');
  else if (opts.acquire)  el.classList.add('anim-acquire');
  else if (opts.animate)  el.classList.add('anim-deal');
  if (opts.reveal)   el.classList.add('anim-reveal');
  if (opts.selected) el.classList.add('selected');
  if (opts.selectable) {
    el.classList.add('selectable');
    // 두 번째 인자로 카드 요소도 넘긴다 — 그 자리에 파티클을 얹으려면 필요하다
    // tapOnSlot 이면 여기서 묶지 않는다. 손패는 카드가 들리면서 커서 밖으로
    // 빠져나가므로, 제자리에 있는 칸이 대신 누름을 받아야 한다(renderHand 참고).
    if (opts.tapOnSlot) el._tap = () => { playSound('select'); opts.onClick(card, el); };
    else onTap(el, () => { playSound('select'); opts.onClick(card, el); });
  }
  return el;
}
// 아이템 카드 — 세트에 쓰이는 카드가 아니라 따로 있는 카드다.
// 뒷면이 아니라 앞면이다. 무슨 아이템이 걸렸는지 보여야 "저것 때문에 져 줄까" 가
// 성립한다 — '덤' 이라고만 적혀 있으면 아무 판단도 못 한다.
function makeItemCard(card) {
  const kind = card.kind === 'bonus' ? 'bonus' : 'tip';
  const info = ITEM_INFO[card.itemId] || {};
  const el = document.createElement('div');
  el.className = 'card item-card ic-' + kind + ' t-' + (card.tier || info.tier || 'common');
  const art = document.createElement('div');
  art.className = 'ic-face';
  art.innerHTML = itemArt(card.itemId);
  const nm = document.createElement('div');
  nm.className = 'ic-name'; nm.textContent = card.name || info.name || '아이템';
  // 🎁/🏷 이모지는 이 게임에서 직접 그린 그림으로 갈아 끼워 왔는데 이 둘은
  // 대응 그림이 없어 글꼴에 따라 뭉개진다 — 글자로 적는다.
  const tag = document.createElement('div');
  tag.className = 'ic-tag'; tag.textContent = kind === 'bonus' ? '보너스' : '덤';
  el.append(tag, art, nm);
  el.title = (info.desc || '') + (kind === 'bonus' ? ' — 뒤집은 사람이 얻는다' : ' — 이 경매에서 진 쪽이 얻는다');
  // 꾹 누르면 무슨 물건인지 알려 준다.
  // 폰에는 마우스를 얹는다는 게 없어서 title 은 아무 소용이 없었다 —
  // 판에 덤이 떴는데 그게 뭔지 알 길이 없으면, 이겨야 할지 져야 할지도 못 정한다.
  el.classList.add('lp-able');
  bindLongPress(el, () => explainLotItem(card, kind));
  return el;
}

// 경매판에 얹힌 아이템 설명. 내 손의 물건과 말이 달라야 한다 —
// 아직 내 것이 아니고, 중요한 건 '언제 쓰나' 가 아니라 '누가 갖나' 다.
function explainLotItem(card, kind) {
  const info = ITEM_INFO[card.itemId] || {};
  const name = card.name || info.name || '아이템';
  const who = kind === 'bonus'
    ? '뒤집은 사람이 그 자리에서 가져요.'
    : '이 경매에서 <b>진 쪽</b>이 가져요.';
  toast(`<b>${esc(name)}</b> — ${esc(info.desc || '')}<br>` +
        `<span style="opacity:.75;font-size:.9em">${who}</span>`, 3400);
  playSound('select');
}
function slotEl(label, card, opts = {}) {
  const w = document.createElement('div'); w.className = 'a-slot';
  const l = document.createElement('div'); l.className = 'a-label'; l.textContent = label;
  w.appendChild(l); w.appendChild(makeCard(card, opts)); return w;
}

// ── 렌더 ────────────────────────────────────────────────────
function render(changed = false) {
  if (!state) return;
  const s = state, mine = s.auctioneer === s.myIndex, a = s.auction;
  // 판이 돌아가는 중이면 결과창이 떠 있을 이유가 없다. 어떤 이유로든(재대결이
  // 어긋났다거나 game_start 를 놓쳤다거나) 남아 있으면 inset:0 짜리 창이 판을
  // 통째로 덮어, 화면은 멀쩡한데 아무것도 안 눌린다. 여기서 못을 박아 둔다.
  if (s.phase !== 'game_over') {
    const go = document.getElementById('gameOver');
    if (go && go.style.display !== 'none') go.style.display = 'none';
  }
  document.getElementById('turnInfo').textContent = `턴 ${s.turn}`;
  document.getElementById('game').classList.toggle('showdown', s.phase === 'showdown');
  if (s.time) updateClocks(s.time[1], s.time[2], s.active);
  // 닉네임 + 프로필 표시
  if (gameNicks) {
    const oppN = gameNicks[s.myIndex === 1 ? 1 : 0], myN = gameNicks[s.myIndex === 1 ? 0 : 1];
    const oel = document.getElementById('oppNickLabel'); if (oel && oppN) oel.textContent = oppN;
    const mel = document.getElementById('myNickLabel'); if (mel && myN) mel.textContent = myN;
  }
  if (gameProfiles) {   // 프로필은 게임 중 안 바뀜 → 1회만 그림
    const psig = s.myIndex + '|' + JSON.stringify(gameProfiles);
    if (lastSig.prof !== psig) {
      lastSig.prof = psig;
      renderGameProfile('oppProfile', gameProfiles[s.myIndex === 1 ? 1 : 0]);
      renderGameProfile('myProfile',  gameProfiles[s.myIndex === 1 ? 0 : 1], true);
    }
  }

  // 배팅 순서: 진행자 먼저 → 내가 배팅할 차례인지
  const myTurnToBid = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);

  const think = t => `<span class="thinking-dots">${t}<span>.</span><span>.</span><span>.</span></span>`;
  const biddingMsg = () => {
    if (a?.myBid) return (isVsBot && !a.oppBidSubmitted) ? think('AI 배팅 중') : '배팅 완료 — 상대를 기다립니다…';
    if (myTurnToBid) return (a && a.auctionType === 'closed' ? '🙈 클로즈(배팅 공개)' : '👁 오픈(배팅 비밀)') + ' — 손패에서 배팅할 카드를 고르세요!';
    return isVsBot ? think('진행자(AI) 먼저 배팅 중') : '진행자가 먼저 배팅합니다 — 대기 중';
  };
  const firstNick = () => (gameNicks && gameNicks[s.auctioneer - 1]) || (s.auctioneer === s.myIndex ? '나' : '상대');
  const msgs = {
    pick:        s.pick && s.pick.myChoice != null ? (isVsBot ? '' : '상대가 고르는 중…') : '🃏 카드를 골라 선공을 정하세요!',
    pick_reveal: `⚡ ${firstNick()} 선공!`,
    draw:        mine ? '🂠 중앙덱을 탭해 카드를 뽑으세요' : (isVsBot ? think('AI가 뽑는 중') : '상대가 카드를 뽑는 중…'),
    offer:       mine ? '중앙 카드 공개 — 내놓을 카드를 고르세요' : (isVsBot ? think('AI 생각 중') : '상대가 내놓는 중…'),
    choose_type: mine ? '경매 방식을 고르세요 — 출품 카드는 다른 손패를 탭하면 바뀝니다' : (isVsBot ? think('AI 생각 중') : '상대가 방식을 고르는 중…'),
    bidding:     biddingMsg(),
    showdown: '⚔️ 배팅 완료 — 곧 공개!', reveal: '결과 공개!', settled: '카드 정산 중…', game_over: '게임 종료',
  };
  const bar = document.getElementById('statusBar');
  let msg = msgs[s.phase] ?? s.phase;
  if (isSpec) {   // 관전 문구 (중립 시점)
    const an = (gameNicks && gameNicks[s.auctioneer - 1]) || '진행자';
    msg = ({ pick: '👁 선공 뽑는 중…', pick_reveal: `⚡ ${an} 선공!`, draw: `👁 ${an} 카드 뽑는 중`,
      offer: `👁 ${an} 출품 중`, choose_type: `👁 ${an} 경매 방식 고르는 중`, bidding: '👁 배팅 중…',
      showdown: '⚔️ 배팅 완료 — 곧 공개!', reveal: '결과 공개!', game_over: '게임 종료' })[s.phase] || '👁 관전 중';
  }
  if (lastSig.status !== msg) {   // 같은 문구면 건드리지 않음 (깜빡임·리플로우 방지)
    lastSig.status = msg;
    if (changed) { bar.style.opacity = '0'; setTimeout(() => { bar.innerHTML = msg; bar.style.opacity = '1'; }, 150); }
    else bar.innerHTML = msg;
  }

  renderDeck();
  renderOppHand(s.oppHandLen, s.fx && s.fx.peek);
  renderPile('oppAcq', s.oppAcq);
  renderPile('myAcq', s.myAcq);
  renderAuction(changed);
  renderHand();
  // 판이 다 그려진 뒤라야 테이블이 제 자리를 잡는다 — 카드 크기가
  // 화면마다 달라 고정값으로는 어긋난다.
  requestAnimationFrame(gameLayTable);
}

// 중앙덱 스택
function drawCard() {
  const s = state;
  if (!s || isSpec || s.phase !== 'draw' || s.auctioneer !== s.myIndex) return;
  playSound('place');
  socket.emit('draw_card');
}
function renderDeck() {
  const s = state, el = document.getElementById('deckStack');
  const n = s.centerDeckSize;
  const drawable = s.phase === 'draw' && s.auctioneer === s.myIndex;
  const sig = n + '|' + drawable;
  if (lastSig.deck === sig) return; lastSig.deck = sig;   // 변경 없으면 재생성 안 함
  el.innerHTML = '';
  if (n <= 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const layers = Math.min(n, 5);
  // 쌓인 티는 가운데를 축으로 좌우로 벌려서 낸다. 예전엔 한쪽으로만 밀어(i*2)
  // 덱의 눈에 보이는 가운데가 칸 가운데에서 8px 밀렸다 — 위의 턴 표시와
  // 아래의 장수가 그만큼 어긋나 보이던 이유다.
  const mid = (layers - 1) / 2;
  for (let i = 0; i < layers; i++) {
    const b = makeCard(null); b.classList.add('deck-layer');
    const k = i - mid;
    b.style.transform = `translate(${(k * 2).toFixed(1)}px, ${(-k * 2).toFixed(1)}px)`;
    b.style.zIndex = String(i);
    el.appendChild(b);
  }
  const cnt = document.createElement('div');
  cnt.className = 'deck-count'; cnt.textContent = `덱 ${n}장`;
  el.appendChild(cnt);
  el.classList.toggle('drawable', !isSpec && s.phase === 'draw' && s.auctioneer === s.myIndex);
}

// 상대의 카드백 스킨 (프로필에 장착 정보가 실려옴).
// 표를 따로 두지 않고 상점용(CBP)을 그대로 쓴다 — 예전엔 두 벌이라
// 새 카드백을 상점에만 등록하고 인게임 표를 깜빡해서, 사 놓고도 판에서는
// 기본 뒷면이 나왔다.
const CB_CLASS = CBP;
function oppBackClass() {
  const p = gameProfiles && gameProfiles[myIndex === 1 ? 1 : 0];
  return (p && CB_CLASS[p.cardBack]) || null;
}
function makeOppBack() {
  const c = makeCard(null);
  const cls = oppBackClass(); if (cls) c.classList.add(cls);
  return c;
}
function makeMyBack() {   // 내 비공개 배팅(오픈 경매) — 내 카드백 스킨
  const c = makeCard(null);
  const p = gameProfiles && gameProfiles[myIndex - 1];
  const cls = p && CB_CLASS[p.cardBack]; if (cls) c.classList.add(cls);
  return c;
}

// 상대 손패 = 뒷면 카드 부채꼴 (내 패보다 작게)
// 돋보기로 엿본 카드가 있으면 앞쪽 몇 장을 반투명 앞면으로 바꿔, 뒷면 너머로 비쳐 보이게 한다.
function renderOppHand(n, peek) {
  const sig = n + '|' + (peek ? peek.map(c => c.id).join(',') : '');
  if (lastSig.oppHand === sig) return; lastSig.oppHand = sig;   // 장수·엿본 카드 그대로면 스킵
  const el = document.getElementById('oppHand'); el.innerHTML = '';
  const seen = (peek || []).slice(0, n);
  for (let i = 0; i < n; i++) {
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    if (seen[i]) {
      const c = makeCard(seen[i], { reveal: true });
      c.classList.add('peeked');
      slot.appendChild(c);
    } else {
      slot.appendChild(makeOppBack());
    }
    el.appendChild(slot);
  }
  fanRow(el, true);
  // 판이 열릴 때는 상대도 덱에서 한 장씩 받는다. 예전엔 내 쪽만 딜 모션이 있고
  // 상대 손패는 그냥 나타나서, 카드가 어디서 왔는지가 안 보였다.
  // needsDeal 은 여기서 지우지 않는다 — 뒤이어 도는 renderHand 가 지운다.
  if (needsDeal && n >= 6) {
    const d = dealOrder();
    dealFromDeck(document.getElementById('deckStack'), el.querySelectorAll('.card'),
                 { stagger: d.stagger, offset: d.opp, step: d.step });
  }
}

// 획득 카드 = 종류별로 겹쳐 쌓은 더미 (세트 진행도 표시)
const SET_REQ = { 2:2, 3:3, 4:4, 6:6 };
const seenAcq = { myAcq: new Set(), oppAcq: new Set() };  // 획득 애니메이션용
function renderPile(id, cards) {
  const sig = (cards || []).map(c => c.id).join(',');
  if (lastSig[id] === sig) return; lastSig[id] = sig;   // 획득 카드 그대로면 스킵
  const el = document.getElementById(id); el.innerHTML = '';
  const seen = seenAcq[id] || (seenAcq[id] = new Set());
  if (!cards?.length) { el.innerHTML = '<span class="pile-empty">획득 없음</span>'; return; }
  const groups = {};
  for (const c of cards) (groups[c.kind] ||= []).push(c);
  for (const kind of [2,3,4,6]) {
    const g = groups[kind]; if (!g) continue;
    g.sort((a,b) => a.grade - b.grade);
    const req = SET_REQ[kind];
    const done = g.length >= req;
    const reach = g.length === req - 1;   // 세트 1장 전 = 리치
    const wrap = document.createElement('div');
    wrap.className = 'pile-group' + (done ? ' complete' : reach ? ' reach' : '');
    wrap.dataset.kind = kind;
    g.forEach(c => {
      const isNew = c.id != null && !seen.has(c.id);
      if (c.id != null) seen.add(c.id);
      wrap.appendChild(makeCard(c, { acquire: isNew }));   // 새 카드는 날아드는 연출
    });
    const cnt = document.createElement('span');
    cnt.className = 'pile-count' + (done ? ' complete' : reach ? ' reach' : '');
    cnt.textContent = done ? `완성! ✓` : reach ? `${g.length}/${req} 리치!` : `${g.length}/${req}`;
    wrap.appendChild(cnt);
    el.appendChild(wrap);
  }
}

// 부채꼴 배치: 각 카드 회전 + 중앙이 위로 솟는 아치
function fanRow(container, isTop) {
  const slots = [...container.children];
  const n = slots.length; if (!n) return;
  // 상대(위) 손패는 더 촘촘하고 완만한 아치, 내(아래) 손패는 넓고 시원한 부채꼴
  const stepMax = isTop ? 5 : 6.5;
  const spreadCap = isTop ? 26 : 36;
  const liftUnit = isTop ? 3.4 : 5;
  const overlap = isTop ? -9 : -7;
  const spread = Math.min((n - 1) * stepMax, spreadCap);
  const step = n > 1 ? spread / (n - 1) : 0;
  const mid = (n - 1) / 2;
  slots.forEach((slot, i) => {
    const ang = (-spread / 2 + i * step) * (isTop ? -1 : 1);
    const dist = Math.abs(i - mid);
    const lift = (mid - dist) * liftUnit;          // 중앙 카드가 더 솟음
    const y = isTop ? lift : -lift;
    slot.style.transformOrigin = isTop ? 'center top' : 'center bottom';
    slot.style.transform = `rotate(${ang}deg) translateY(${y}px)`;
    slot.style.zIndex = String(i + 1);   // 오른쪽 카드가 항상 왼쪽 카드 위에 (자연스러운 손패 겹침)
    slot.style.margin = '0 ' + overlap + 'px';
  });
}
function renderAuction(changed) {
  const s = state;
  // 내용이 안 바뀌었으면 중앙 DOM 재생성 스킵 (끊김·깜빡임 방지)
  const sig = JSON.stringify([s.phase, s.auctioneer, s.pick, s.auction]);
  if (lastSig.auction === sig) { paintBidSel(); return; }
  lastSig.auction = sig;
  const items = document.getElementById('auctionItems');
  const action = document.getElementById('actionArea'), badge = document.getElementById('auctionTypeBadge');
  items.innerHTML = ''; action.innerHTML = '';
  renderBids();

  // ── 선공 뽑기 단계 ──
  if ((s.phase === 'pick' || s.phase === 'pick_reveal') && s.pick) {
    badge.textContent = '선공 결정'; badge.className = 'type-badge open';
    const p = s.pick;
    [0, 1].forEach(slot => {
      const revealed = s.phase === 'pick_reveal' && p.cards[slot];
      const isMine = p.myChoice === slot, isOpp = p.oppChoice === slot;
      const label = revealed
        ? (isMine ? '나' : isOpp ? '상대' : '')
        : (isMine ? '내 선택 ✓' : isOpp ? '상대 선택' : '');
      const wrap = document.createElement('div'); wrap.className = 'a-slot';
      const lbl = document.createElement('div'); lbl.className = 'a-label'; lbl.textContent = label || '?';
      wrap.appendChild(lbl);
      const cardEl = makeCard(revealed ? p.cards[slot] : null, { reveal: !!revealed });
      if (!isSpec && s.phase === 'pick' && p.myChoice == null && !isOpp) {
        cardEl.classList.add('selectable', 'pickable');
        cardEl.addEventListener('click', () => { playSound('flip'); vibe('place'); socket.emit('pick_card', { slot }); });
      }
      if (isMine) cardEl.style.outline = '2px solid var(--gold)';
      wrap.appendChild(cardEl);
      items.appendChild(wrap);
    });
    return;
  }

  if (!s.auction) { badge.textContent = ''; badge.className = ''; return; }

  const a = s.auction, mine = s.auctioneer === s.myIndex, atype = a.auctionType, isReveal = s.phase === 'reveal';
  // 이름은 모드를 가리지 않고 '오픈 경매'·'클로즈 경매' 하나로 쓴다.
  // 같은 것을 화면마다 다르게 부르면 처음 배우는 사람은 다른 규칙인 줄 안다.
  if (atype === 'open')   { badge.textContent = '오픈 경매';   badge.className = 'type-badge open'; }
  else if (atype === 'closed') { badge.textContent = '클로즈 경매'; badge.className = 'type-badge closed'; }
  else { badge.textContent = ''; badge.className = ''; }

  // 'draw' 단계엔 중앙 카드 미공개 (덱 스택이 초점)
  if (s.phase === 'draw') return;

  // 아이템 카드가 뽑힌 판은 경매품이 세 장이다 — 🏷 덤 + 중앙 + 출품.
  // 🎁 보너스는 여기 안 놓인다 — 뒤집는 순간 그 사람 아이템 칸으로 날아가므로
  // (bonus_card → flyBonusCard) 판 가운데에 남겨 두면 두 번 보여 주는 꼴이다.
  if (a.tipCard) {
    const w = document.createElement('div'); w.className = 'a-slot';
    const l = document.createElement('div'); l.className = 'a-label'; l.textContent = '덤 (진 쪽)';
    const tc = makeItemCard(a.tipCard);
    _tipEl = tc;                     // 정산 때 여기서 출발한다
    w.appendChild(l); w.appendChild(tc);
    items.appendChild(w);
  }
  items.appendChild(slotEl('중앙 카드', a.centerCard, { animate: drewNow, draw: drewNow }));
  if (s.phase !== 'offer') {
    // a.offeredCard 공개 여부는 서버가 결정 (choose_type엔 진행자만, 클로즈는 reveal 때 공개)
    const revealClosed = isReveal && atype === 'closed';
    const lbl = (s.phase === 'choose_type' && mine) ? '출품 (교체 가능)'
              : (atype === 'closed' && !isReveal) ? '출품 (비공개)' : '출품 카드';
    items.appendChild(slotEl(lbl, a.offeredCard ?? null, {
      animate: changed && atype === 'open', reveal: revealClosed,
    }));
  }

  if (s.phase === 'choose_type' && mine && !isSpec) {
    const row = document.createElement('div'); row.className = 'btn-row';
    // 손패 카드와 같은 길(onTap = pointerup)로 받는다. click 은 마우스에서
    // 가장 쉽게 사라지는 이벤트다 — 누르는 사이에 포인터가 잡혀 있거나 눌린
    // 요소가 다시 그려지면 click 만 조용히 없어진다. pointerup 은 늘 온다.
    const bo = document.createElement('button'); bo.className = 'btn btn-gold btn-sm'; bo.textContent = '오픈 경매';
    bo.title = '경매품 공개 · 배팅 비공개';
    onPress(bo, () => { playSound('card'); vibe('place'); socket.emit('choose_auction', { type: 'open' }); });
    const bc = document.createElement('button'); bc.className = 'btn btn-ink btn-sm'; bc.textContent = '클로즈 경매';
    bc.title = '경매품 비공개 · 배팅 공개';
    onPress(bc, () => { playSound('card'); vibe('place'); socket.emit('choose_auction', { type: 'closed' }); });
    row.appendChild(bo); row.appendChild(bc); action.appendChild(row);
  }

  // 확정 버튼은 고를 때마다 나타났다 사라진다. 자리를 미리 비워 두지 않으면
  // 버튼이 생길 때 아래가 밀려 판이 들썩인다.
  const slot = document.createElement('div');
  slot.className = 'bid-confirm-slot';
  action.appendChild(slot);
  paintBidSel();
}

// 고른 카드 표시 + 확정 버튼. DOM 을 새로 만들지 않고 여기서만 손댄다.
// 예전엔 카드를 누를 때마다 render() 를 통째로 불러 손패·매트·더미가 전부
// 다시 그려졌다. 누른 느낌이 한 박자 늦는 건 대개 이런 이유다.
function paintBidSel() {
  const s = state; if (!s) return;
  const a = s.auction || {};
  document.querySelectorAll('#myHand .card').forEach((el) => {
    const on = !!selectedBidCard && String(el.dataset.id) === String(selectedBidCard.id);
    el.classList.toggle('sel', on);
    if (el.parentElement) el.parentElement.classList.toggle('sel', on);
  });

  const slot = document.querySelector('.bid-confirm-slot');
  if (!slot) return;
  const isSpec = s.myIndex === null || s.myIndex === undefined;
  const mine = s.auctioneer === s.myIndex;
  const myTurnToBid = !isSpec && s.phase === 'bidding' && !a.myBid && (mine || a.oppBidSubmitted);
  if (!myTurnToBid || !selectedBidCard) { slot.innerHTML = ''; return; }

  let btn = slot.firstElementChild;
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'btn btn-gold btn-sm';
    slot.appendChild(btn);
    // 카드와 같은 길로 받는다(위 경매 방식 버튼과 같은 이유).
    // 버튼은 글자만 바뀌며 재사용되므로 여기서 한 번만 묶는다.
    onPress(btn, () => { if (btn._fire) btn._fire(); });
  }
  btn.textContent = `${selectedBidCard.kind}번 (${selectedBidCard.grade}등급) 배팅 확정`;
  btn._fire = () => {
    const card = selectedBidCard; if (!card) return;
    playSound('place');
    const el = document.querySelector('#myHand .card.sel');
    try { playPlaceFx(el); } catch (_) {}
    // 서버 응답을 기다리지 않고 먼저 손에서 뺀다. 왕복이 100ms 만 돼도
    // "눌렀는데 가만히 있는" 순간이 생긴다. 서버가 받아들이면 다음 상태가
    // 그대로 덮어쓰고, 거절하면 그 상태가 카드를 되돌려 놓는다.
    if (el && el.parentElement) el.parentElement.remove();
    selectedBidCard = null;
    slot.innerHTML = '';
    lastSig.hand = null;                    // 다음 상태에서 손패를 다시 맞춘다
    socket.emit('submit_bid', { cardId: card.id });
  };
}
// 배팅 카드를 각자 앞에 배치
function bidSlot(label, card, { back = false, reveal = false, mine = false } = {}) {
  const w = document.createElement('div'); w.className = 'bid-slot';
  const l = document.createElement('div'); l.className = 'bid-lbl'; l.textContent = label;
  w.appendChild(l);
  if (card)       w.appendChild(makeCard(card, { reveal }));
  else if (back)  w.appendChild(mine ? makeMyBack() : makeOppBack());   // 비공개 배팅 — 각자 카드백 스킨
  else { const e = document.createElement('div'); e.className = 'bid-empty'; w.appendChild(e); }
  return w;
}
function renderBids() {
  const s = state, a = s.auction;
  const my = document.getElementById('myBid'), opp = document.getElementById('oppBid');
  my.innerHTML = ''; opp.innerHTML = '';
  if (!a || (s.phase !== 'bidding' && s.phase !== 'showdown' && s.phase !== 'reveal')) return;
  const isReveal = s.phase === 'reveal';

  // 라벨: 관전이면 닉네임, 아니면 내/상대
  const myLbl = isSpec ? ((gameNicks && gameNicks[0]) || 'P1') + ' 배팅' : '내 배팅';
  const opLbl = isSpec ? ((gameNicks && gameNicks[1]) || 'P2') + ' 배팅' : '상대 배팅';

  // 내(아래) 배팅 — 오픈 경매는 뒤집어 내는 것: 확정 후엔 내 것도 뒷면, 리빌에서 앞면으로 뒤집힘
  const myTurnBid = !isSpec && s.phase === 'bidding' && !a.myBid && (s.auctioneer === s.myIndex || a.oppBidSubmitted);
  const hideMyBid = a.auctionType === 'open' && !isReveal && !isSpec;
  if (a.myBid && hideMyBid)    my.appendChild(bidSlot(myLbl + ' ✓', null, { back: true, mine: true }));
  else if (a.myBid)            my.appendChild(bidSlot(myLbl, a.myBid, { reveal: isReveal && !!a.myBid }));
  else if (myTurnBid && selectedBidCard) my.appendChild(bidSlot('내 배팅 (선택 중)', selectedBidCard, {}));
  else if (isSpec && a.myBidSubmitted) my.appendChild(bidSlot(myLbl + ' ✓', null, { back: true }));
  else                         my.appendChild(bidSlot(myLbl, null));

  // 상대(위) 배팅 — 서버가 공개 여부 결정 (클로즈=즉시 / 오픈=reveal)
  const ol = `${opLbl}${a.oppBidSubmitted ? ' ✓' : ''}`;
  if (a.oppBid)            opp.appendChild(bidSlot(ol, a.oppBid, { reveal: isReveal }));
  else if (a.oppBidSubmitted) opp.appendChild(bidSlot(ol, null, { back: true }));
  else                    opp.appendChild(bidSlot(opLbl, null));

  // 공개 시 이긴 쪽 배팅 카드에 WIN 스탬프
  if (isReveal && a.myBid && a.oppBid) {
    const iWin = myBidWins(a.myBid, a.oppBid);
    const slot = (iWin ? my : opp).querySelector('.bid-slot');
    if (slot) {
      slot.classList.add('bid-winner');
      // 도장 모양은 이긴 사람이 장착한 것으로 (남이 이겼으면 그 사람 것)
      const winnerProf = gameProfiles && gameProfiles[(iWin ? myIndex : (myIndex === 1 ? 2 : 1)) - 1];
      const stampId = (winnerProf && winnerProf.winStamp) || 'stamp_win';
      const st = document.createElement('span');
      st.className = 'win-stamp ' + (STAMP_CLS[stampId] || 'st-win');
      st.textContent = stampLabel(stampId);
      slot.appendChild(st);
    }
  }
}

function renderHand() {
  const s = state, a = s.auction, el = document.getElementById('myHand');
  // 관전: 아래(P1) 손패를 뒷면으로만 표시
  if (isSpec) {
    const n = s.p1HandLen || 0;
    if (lastSig.hand === 'spec' + n) return; lastSig.hand = 'spec' + n;
    el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const slot = document.createElement('div'); slot.className = 'fan-slot';
      slot.appendChild(makeCard(null)); el.appendChild(slot);
    }
    fanRow(el, false);
    return;
  }
  const mine = s.auctioneer === s.myIndex;
  // 방식 선택 전(offer/choose_type)이면 손패 클릭으로 출품카드 교체 가능
  const offer = (s.phase === 'offer' || s.phase === 'choose_type') && mine;
  // 진행자 먼저 배팅
  const bidding = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);
  // 등급순 정렬로 손에 든 느낌
  const hand = [...s.myHand].sort((a, b) => a.kind - b.kind || a.grade - b.grade);
  // 손패·상호작용이 그대로면 재생성 스킵.
  // 예전엔 여기에 "고른 카드" 까지 넣어서, 카드를 한 번 누를 때마다 손패 여섯 장을
  // 통째로 다시 만들고 부채꼴까지 다시 계산했다 — 그게 탭이 굼뜨게 느껴지던 이유다.
  // 고른 표시는 DOM 을 새로 만들 일이 아니라 클래스만 바꾸면 되는 일이다.
  // 배팅 단계인데 아직 내 차례가 아니면 손패를 잠근 티를 낸다.
  // 규칙상 진행자가 먼저 내는데, 그걸 모르면 "눌러도 아무 반응이 없다" 로만 보인다.
  const waiting = s.phase === 'bidding' && a && !a.myBid && !bidding;
  el.classList.toggle('locked', !!waiting);

  const sig = hand.map(c => c.id).join(',') + '|' + (offer ? 'o' : '') + (bidding ? 'b' : '');
  if (lastSig.hand === sig) { paintBidSel(); return; } lastSig.hand = sig;
  const deal = needsDeal && hand.length >= 6;   // 첫 손패 완성 시 딜 모션
  el.innerHTML = '';
  hand.forEach((card, i) => {
    let cardEl;
    if (offer)
      cardEl = makeCard(card, { selectable: true, tapOnSlot: true, onClick: (c, el) => {
        playSound('place');
        try { playPlaceFx(el); } catch (_) {}
        // 출품은 서버가 답할 때까지 손패가 그대로다. 왕복이 100ms 만 돼도
        // "눌렀는데 가만히 있는" 순간이 생긴다. 배팅처럼 미리 빼 버릴 수는 없다 —
        // 이미 낸 카드가 손으로 돌아오는 교체 단계라 판단을 화면이 흉내 내면 어긋난다.
        // 그래서 뺴지는 않고, 누른 그 카드만 "가는 중" 으로 띄워 둔다.
        el.classList.add('sending');
        socket.emit('offer_card', { cardId: c.id });
      } });
    else if (bidding)
      cardEl = makeCard(card, { selectable: true, tapOnSlot: true, selected: selectedBidCard?.id === card.id, onClick: c => { selectedBidCard = selectedBidCard?.id === c.id ? null : c; vibe('pick'); paintBidSel(); } });
    else
      cardEl = makeCard(card);
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(cardEl); el.appendChild(slot);
    // 카드가 들려 올라가면 그 아래에 빈 자리가 생긴다. 커서가 거기 있으면
    // 카드에는 닿지 않는다 — 칸이 대신 받는다. 칸은 움직이지 않는다.
    if (cardEl._tap) onTap(slot, cardEl._tap);
  });
  fanRow(el, false);
  if (deal) {
    needsDeal = false;
    // 부채꼴을 잡은 뒤에 딜을 건다 — 그래야 각 카드의 최종 위치를 알 수 있다
    const d = dealOrder();
    dealFromDeck(document.getElementById('deckStack'), el.querySelectorAll('.card'),
                 { stagger: d.stagger, offset: d.me, step: d.step });
    // 소리는 상대 것까지 합쳐 한 장마다 한 번 — 화면과 같은 박자로 12번 난다.
    // 한쪽 것만 울리면 상대에게 가는 카드가 소리 없이 날아가 어색하다.
    const beats = hand.length * 2;
    for (let i = 0; i < beats; i++) setTimeout(() => playSound('deal'), 40 + i * d.stagger);
  }
}
function animateWinCards() {
  document.querySelectorAll('#myAcq .card').forEach((c, i) => {
    setTimeout(() => { c.classList.remove('anim-win'); void c.offsetWidth; c.classList.add('anim-win'); }, i * 80);
  });
}

// ── PWA 서비스워커 등록 (재방문 로딩 가속 + 홈 화면 설치) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ── 앱 설치 버튼 ──
// 안드로이드 크롬: beforeinstallprompt를 잡아뒀다가 버튼 클릭 시 네이티브 설치창 표시
// 아이폰: 프로그래밍 설치 불가(애플 정책) → 버튼 누르면 방법 안내
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = () => /Android/.test(navigator.userAgent);
const isSamsung = () => /SamsungBrowser/.test(navigator.userAgent);
const showInstallBtn = () => { if (!isStandalone()) { const b = document.getElementById('installBtn'); if (b) b.style.display = ''; } };
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  showInstallBtn();
});
(function initInstallBtn() {
  // 설치 안 된 상태면 항상 버튼 노출 — 갤럭시(삼성인터넷)는 beforeinstallprompt가
  // 아예 안 오거나 늦게 와서, 이벤트만 기다리면 버튼이 영영 안 뜸
  if (!isStandalone()) showInstallBtn();
})();
async function installApp() {
  const b = document.getElementById('installBtn');
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (outcome === 'accepted' && b) b.style.display = 'none';
  } else if (isIOS()) {
    alert('아이폰 설치 방법 📲\n\n1. Safari 아래쪽 공유 버튼(⬆️)을 누르고\n2. "홈 화면에 추가"를 선택하세요!\n\n홈 화면에 FLIP FLAP 앱이 생겨요.');
  } else if (isSamsung()) {
    alert('갤럭시 설치 방법 📲\n\n1. 화면 아래 메뉴(≡) 버튼을 누르고\n2. "현재 페이지 추가" → "홈 화면"을 선택하세요!\n\n(또는 주소창 오른쪽 다운로드 아이콘을 눌러도 돼요)');
  } else if (isAndroid()) {
    alert('안드로이드 설치 방법 📲\n\n브라우저 메뉴(⋮)를 누르고\n"앱 설치" 또는 "홈 화면에 추가"를 선택하세요!');
  } else {
    alert('브라우저 메뉴에서 "앱 설치"를 눌러 설치할 수 있어요!');
  }
}
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  const b = document.getElementById('installBtn'); if (b) b.style.display = 'none';
});


// ══ TWELVE ════════════════════════════════════════════════════════
// 규칙은 서버(twelve.js)가 전부 쥔다. 여기서는 받은 상태를 그리고, 누른 것을
// 그대로 보낸다 — 값이나 승패를 화면에서 계산하지 않는다.
let tvView = null, tvMe = 0, tvBot = false, tvPrev = null;
let tvFlying = [];   // 지금 필드로 날아가는 중인 카드 id
let tvJustDrew = false;   // 이번 그리기가 '방금 뒤집은' 순간인가
let tvDiff = 'hard';  // 마지막으로 고른 AI 난이도 (한 판 더 에서 그대로 쓴다)

// 이모트 버튼은 2인전 것 하나뿐이다. 두 벌 만들면 쿨타임·차단 설정이
// 따로 놀기 시작한다 — 그래서 판이 열릴 때 자리만 옮긴다.
function tvMoveEmote(into) {
  const wrap = document.getElementById('emoteWrap');
  const slot = document.getElementById(into);
  if (wrap && slot && wrap.parentElement !== slot) slot.appendChild(wrap);
}
function tvOpen() {
  document.body.classList.add('twelve');
  const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
  tvMoveEmote('tv-emoteSlot');
  try { applyMySkins(); } catch (_) {}   // 장착한 테이블·카드앞면은 어느 모드에서나 그대로
  try { startBGM('game'); } catch (_) {}
  scheduleRelayout();                    // 판을 열었으면 테이블을 잰다
}
window.tvSolo = function (diff) {
  closeModePanels();
  tvBot = true;
  tvDiff = ['easy', 'hard', 'expert'].includes(diff) ? diff : 'hard';
  socket.emit('tv_solo', { pid: PID, nick: getNick(), diff: tvDiff });
};
window.tvQuit = function () {
  // 한 번 묻는다 — 판을 나가면 그대로 지는 것이라 실수로 눌리면 안 된다
  if (tvView && !tvView.over) {
    askConfirm({ icon: '🚪', title: '판을 나갈까요?', desc: '지금 나가면 이 판은 집니다.',
                 yes: '나가기', no: '계속하기' }, () => tvQuitNow());
    return;
  }
  tvQuitNow();
};
function tvQuitNow() {
  document.body.classList.remove('twelve');
  const tb = document.getElementById('tv-table'); if (tb) tb.classList.remove('on');
  tvMenu(false);
  tvMoveEmote('mebar');
  const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
  tvView = null;
  clearSession(); fastReload();
};
window.tvAgain = function (btn) {
  // 혼자 하기는 그 자리에서 다시 시작한다.
  if (tvBot) {
    const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
    socket.emit('leave_room');
    setTimeout(() => socket.emit('tv_solo', { pid: PID, nick: getNick(), diff: tvDiff }), 150);
    return;
  }
  // 온라인은 방금 그 사람에게 재대결을 건다. 예전엔 로비로 되돌려 보냈는데,
  // 버튼에 '한 판 더' 라고 적어 놓고 상대와 헤어지게 하는 건 말이 안 된다.
  // 둘 다 누르면 서버가 같은 방에서 새 판을 연다(restartGame).
  socket.emit('rematch');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  const note = document.getElementById('rematchNote');
  if (note) note.textContent = '상대에게 재대결 신청 — 대기 중…';
};
window.tvRules = function (show) { if (show) toggleRules(true); };
// 오른쪽 위 메뉴. 인자를 주면 그대로 열거나 닫고, 안 주면 뒤집는다.
function boardMenu(menuId, btnId, wrapSel, open) {
  const m = document.getElementById(menuId), b = document.getElementById(btnId);
  if (!m) return;
  const on = open === undefined ? !m.classList.contains('on') : !!open;
  m.classList.toggle('on', on);
  if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) playSound('ping');
}
window.tvMenu = (open) => boardMenu('tv-menu', 'tv-menuBtn', '#tv-menuWrap', open);
window.gMenu = (open) => boardMenu('g-menu', 'g-menuBtn', '#g-menuWrap', open);
window.qMenu = (open) => boardMenu('q-menu', 'q-menuBtn', '#q-menuWrap', open);
window.mnMenu = (open) => boardMenu('mn-menu', 'mn-menuBtn', '#mn-menuWrap', open);
// 판 아무 데나 누르면 닫힌다 — 열어 둔 채로 카드를 만지려다 메뉴에 막히면
// "안 눌린다" 로 느껴진다. 메뉴 안쪽 클릭은 자기 버튼이 처리한다.
document.addEventListener('pointerdown', (e) => {
  for (const [menuId, wrapSel, close] of [
    ['tv-menu', '#tv-menuWrap', tvMenu], ['g-menu', '#g-menuWrap', gMenu],
    ['q-menu', '#q-menuWrap', qMenu], ['mn-menu', '#mn-menuWrap', mnMenu],
  ]) {
    const m = document.getElementById(menuId);
    if (!m || !m.classList.contains('on')) continue;
    if (e.target.closest(wrapSel)) continue;
    close(false);
  }
}, true);
const tvAct = (act, extra) => socket.emit('tv_act', Object.assign({ act }, extra || {}));

socket.on('tv_begin', (d) => {
  tvMe = d.me; tvBot = !!d.vsBot; tvPrev = null;
  // 재대결로 새 판이 열릴 때 결과창이 남아 있으면 판을 통째로 덮는다 — 화면은
  // 멀쩡한데 아무것도 안 눌린다. 새 판이 시작되면 무조건 걷는다.
  const go = document.getElementById('gameOver');
  if (go) go.style.display = 'none';
  const note = document.getElementById('rematchNote'); if (note) note.textContent = '';
  // 카드백 스킨은 이 두 값을 보고 붙는다 — 안 넣어 두면 트웰브만 맨 뒷면이 된다
  gameProfiles = d.profiles || null; myIndex = d.me;
  tvOpen();
  // 내 프로필이 안 보이면 누구 자리인지가 안 읽힌다 — 클래식과 같은 카드를 쓴다
  const pr = d.profiles || [];
  const oppP = pr[d.me === 1 ? 1 : 0], myP = pr[d.me === 1 ? 0 : 1];
  try {
    renderGameProfile('tv-oppProfile', oppP || { nick: (d.nicks || [])[d.me === 1 ? 1 : 0] || '상대', guest: true });
    renderGameProfile('tv-myProfile', myP || myAccount || { nick: getNick(), guest: true }, true);
  } catch (_) {}
});
// 시계 — 서버가 1초마다 숫자만 보낸다. 판을 다시 그리지 않으니 화면이 안 흔들린다.
let tvTickAt = 0;
function tvFmt(t) { const m = Math.floor(t / 60), s2 = t % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; }
socket.on('tv_clock', ({ time, active, me }) => {
  const mine = time[me], opp = time[me === 1 ? 2 : 1];
  const mEl = document.getElementById('tv-myTimer'), oEl = document.getElementById('tv-oppTimer');
  if (!mEl || !oEl) return;
  mEl.textContent = tvFmt(mine); oEl.textContent = tvFmt(opp);
  mEl.classList.toggle('active', active === me); oEl.classList.toggle('active', active === (me === 1 ? 2 : 1));
  mEl.classList.toggle('low', mine <= 30); oEl.classList.toggle('low', opp <= 30);
  // 내 차례에 10초 아래로 내려가면 초읽기 소리 — 2인전과 같다
  if (active === me && mine <= 10 && mine > 0 && Date.now() - tvTickAt > 900) { tvTickAt = Date.now(); tvSfx('tick'); }
});
socket.on('tv_warn', ({ player }) => { if (player === tvMe) { tvSfx('hourglass'); vibe('warn'); } });

socket.on('tv_state', (v) => {
  // 방금 뒤집은 카드인지는 "직전 상태" 를 봐야 안다. tvPrev 를 갈아 끼운 뒤에
  // 보면 이미 새 상태라 늘 아니라고 나온다 — 여기서 미리 적어 둔다.
  tvJustDrew = !!(tvPrev && !tvPrev.lot && v.lot);
  // 내 차례가 막 왔다 — 화면을 안 보고 있어도 알 수 있게 한 번 울린다
  if (tvPrev && tvPrev.active !== v.me && v.active === v.me) vibe('turn');
  tvReact(tvPrev, v);      // 바뀐 대목을 말풍선·움직임으로 먼저 알린다
  tvPrev = v; tvView = v;
  tvRender(v);
  tutTickWith(v);            // 실전 튜토리얼 — 판이 그 상황에 닿으면 짚어 준다
  tvJustDrew = false;
});
socket.on('tv_over', ({ win, endBy, view }) => {
  if (view) { tvView = view; tvRender(view); }
  tvShowOver(win, endBy);
});

// 결과창은 2인전 것을 그대로 쓴다. 따로 만든 상자는 같은 승리인데도
// 다른 판처럼 보였다 — 보상 타일도, 완성한 세트를 보여 주는 자리도 없었다.
function tvShowOver(win, endBy) {
  const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
  const why = endBy === 'set' ? null
    : endBy === 'chips' ? (win ? '상대의 칩이 떨어졌어요!' : '칩이 다 떨어졌어요…')
    : endBy === 'time' ? (win ? '상대 시간 초과!' : '시간 초과…')
    : (win ? '덱 소진 — 세트에 더 가까웠어요!' : '덱 소진 — 상대가 세트에 더 가까웠어요.');
  let delay = 500;
  if (win) {
    vibe('win');
    title.textContent = '🏆 승리!'; title.style.color = '#ffd94a';
    title.style.textShadow = '0 0 24px rgba(255,215,80,.45)';
    desc.textContent = why || (tvSetKind(true) ? `${tvSetKind(true)}짜리 세트 완성!` : '세트 완성!');
    playSound('victory');
    if (endBy === 'set') { celebrateSet('tv-myAcq', tvSetKind(true)); playSound('setwin'); delay = 1400; }
    screenFx('win');
  } else {
    vibe('lose');
    title.textContent = '패배…'; title.style.color = '#9a8a90'; title.style.textShadow = 'none';
    desc.textContent = why || (tvSetKind(false) ? `상대가 ${tvSetKind(false)}짜리 세트를 완성했어요.`
                                                 : '상대가 세트를 완성했어요.');
    playSound('defeat');
    screenFx('lose');
    if (endBy === 'set') { celebrateSet('tv-oppAcq', tvSetKind(false)); delay = 1400; }
  }
  tvOverStats(win, endBy);
  // 버튼은 트웰브 것으로 갈아 끼운다 (2인전 재대결 통로와 다르다)
  const rb = document.getElementById('rematchBtn');
  if (rb) { rb.style.display = ''; rb.disabled = false; rb.style.opacity = '1'; rb.onclick = () => tvAgain(rb); }
  const btns = document.getElementById('goBtns');
  if (btns) {
    const lobby = [...btns.querySelectorAll('button')].find((b) => b !== rb);
    if (lobby) { lobby.style.display = ''; lobby.onclick = () => tvQuitNow(); }
  }
  const chal = document.querySelector('#goBox .btn-kakao');
  if (chal) chal.style.display = 'none';        // 트웰브는 도전장 통로가 없다
  const back = document.getElementById('tourBackBtn'); if (back) back.style.display = 'none';
  // 대회 중이면 '한 판 더'·'나가기' 대신 대진표로. 트웰브는 나가는 길이
  // 새로고침(tvQuitNow → fastReload)뿐이라, 대회에서 트웰브가 걸리면
  // 여기서 반드시 끊겼다 — "한 판 하면 끊긴다" 의 가장 잦은 경로였다.
  if (isStourMatch && btns) stourOnlyBackBtn(btns);
  else {
    const sb = document.getElementById('stourBackBtn'); if (sb) sb.style.display = 'none';
    roomBackBtn(btns, fromRoom && !tvBot);      // 트웰브도 방에서 왔으면 방으로 돌아간다
  }
  setTimeout(() => { document.getElementById('gameOver').style.display = 'flex'; showRewards(); }, delay);
}
// 완성한 세트의 종류 (없으면 0)
function tvSetKind(mine) {
  const acq = (tvView && (mine ? tvView.myAcq : tvView.oppAcq)) || [];
  const n = {};
  for (const c of acq) n[c.kind] = (n[c.kind] || 0) + 1;
  for (const k of [2, 3, 4, 6]) if ((n[k] || 0) >= k) return k;
  return 0;
}
// 결과창 가운데 — 완성한 세트 카드와 남은 칩
function tvOverStats(win, endBy) {
  const box = document.getElementById('goStats');
  if (!box) return;
  box.innerHTML = '';
  if (!tvView) return;
  const kind = endBy === 'set' ? tvSetKind(win) : 0;
  if (kind) {
    const acq = (win ? tvView.myAcq : tvView.oppAcq) || [];
    const row = document.createElement('div'); row.className = 'go-set';
    acq.filter((c) => c.kind === kind).forEach((c) => {
      const el = makeCard(c); el.style.width = '38px'; el.style.height = '53px';
      row.appendChild(el);
    });
    box.appendChild(row);
  }
  const line = document.createElement('div');
  line.className = 'go-line';
  line.innerHTML = `남은 칩 <b style="color:#ffe9a8">${tvView.chips.me}</b>`
    + ` · 상대 <b style="color:#8fd8ff">${tvView.chips.opp}</b>`
    + ` · 턴 <b>${tvView.turn}</b>`;
  box.appendChild(line);
}

// ── 무슨 일이 있었는지 보여 주기 ─────────────────────────────────────────
// 숫자만 조용히 바뀌면 판이 "확확" 넘어간 것처럼 느껴진다. 누가 얼마를 불렀고,
// 누가 물러섰고, 칩과 카드가 어디로 갔는지를 눈에 남긴다.
function tvSay(side, text, kind) {
  const box = document.getElementById(side === 'me' ? 'tv-mySay' : 'tv-oppSay');
  if (!box) return;
  box.innerHTML = '';
  const b = document.createElement('div');
  b.className = 'bub' + (kind ? ' ' + kind : '');
  b.innerHTML = text;
  box.appendChild(b);
  clearTimeout(box._t);
  box._t = setTimeout(() => { b.classList.add('go'); setTimeout(() => { if (b.parentElement === box) box.innerHTML = ''; }, 300); }, 3400);
}
const tvChipHtml = (n, mine) => `<i class="chip ${mine ? 'light' : 'dark'}"></i>${n}`;

// 가진 칩을 쌓아 그린다. 한 장이 두 개를 뜻하게 눌러 쌓아 20개도 자리를 안 넘긴다.
// 숫자만 있으면 "얼마 남았나" 를 매번 읽어야 하지만, 쌓여 있으면 눈에 바로 들어온다.
const CS_MAX = 8, CS_STEP = 4.2;
function tvStack(box, n, mine) {
  if (!box) return;
  const want = Math.max(0, Math.min(CS_MAX, Math.ceil(n / 2.5)));
  const have = box.querySelectorAll('.chip:not(.gone)').length;
  if (want === have) return;
  if (want < have) {
    // 줄어든 만큼 위에서부터 덜어 낸다 — 사라지는 게 보여야 낸 값이 실감 난다
    const all = [...box.querySelectorAll('.chip:not(.gone)')];
    for (const el of all.slice(want)) {
      el.classList.add('gone');
      setTimeout(() => el.remove(), 340);
    }
    return;
  }
  for (let i = have; i < want; i++) {
    const c = document.createElement('i');
    c.className = 'chip ' + (mine ? 'light' : 'dark');
    c.style.bottom = (i * CS_STEP) + 'px';
    c.style.zIndex = String(i);
    box.appendChild(c);
  }
}

// 오른쪽 레일의 배팅 더미. 얼마를 걸었는지가 숫자만이 아니라 높이로 보인다.
// 값을 모르는 클로즈에서는 물음표와 함께 몇 장만 상징으로 쌓는다.
const POT_MAX = 8, POT_STEP = 3.4;
function tvPot(box, n, mine, unknown) {
  if (!box) return;
  const st = box.querySelector('.pot-stack');
  const num = box.querySelector('b');
  // 물러선 쪽은 한 푼도 안 걸었을 수 있다. 그래도 도장은 보여야 한다.
  const show = n > 0 || unknown || box.classList.contains('passed');
  box.classList.toggle('hide', !show);
  num.textContent = unknown ? '?' : String(n);
  const want = unknown ? 3 : Math.max(0, Math.min(POT_MAX, Math.ceil(n / 1.5)));
  const have = st.querySelectorAll('.chip').length;
  if (want === have) return;
  if (want < have) {
    for (const el of [...st.querySelectorAll('.chip')].slice(want)) el.remove();
    return;
  }
  // 칩만 더한다 — PASS 도장(.pot-pass)은 이 더미 안에 같이 살고 있어서
  // 통째로 비우면 도장까지 날아간다
  for (let i = have; i < want; i++) {
    const c = document.createElement('i');
    c.className = 'chip ' + (mine ? 'light' : 'dark');
    c.style.bottom = (i * POT_STEP) + 'px';
    c.style.zIndex = String(i);
    st.appendChild(c);
  }
}

// 한 요소에서 다른 요소로 날려 보낸다
function tvFlyTo(node, from, to, cls) {
  const fx = document.getElementById('tv-fx'); if (!fx || !from || !to) return;
  const f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
  const host = fx.getBoundingClientRect();
  node.classList.add(cls || 'tv-fly');
  node.style.left = (f.left - host.left) + 'px';
  node.style.top = (f.top - host.top) + 'px';
  fx.appendChild(node);
  const dx = (t.left + t.width / 2) - (f.left + f.width / 2);
  const dy = (t.top + t.height / 2) - (f.top + f.height / 2);
  requestAnimationFrame(() => { node.style.transform = `translate(${dx}px, ${dy}px) scale(.85)`; });
  setTimeout(() => { node.style.opacity = '0'; }, 700);
  setTimeout(() => node.remove(), 1080);
}
// 칩 하나를 이쪽에서 저쪽으로. 곧게 가로지르면 미끄러지는 것처럼 보여서,
// 살짝 떠올랐다 내려앉게 한다 — 손으로 밀어 준 것처럼 읽힌다.
function tvTossChip(fromEl, toEl, mine, delay) {
  const fx = document.getElementById('tv-fx');
  if (!fx || !fromEl || !toEl) return;
  const f = fromEl.getBoundingClientRect(), t = toEl.getBoundingClientRect();
  const host = fx.getBoundingClientRect();
  if (!f.width || !t.width) return;
  const c = document.createElement('i');
  c.className = 'chip ' + (mine ? 'light' : 'dark') + ' tv-tossed';
  c.style.left = (f.left - host.left + f.width / 2 - 9) + 'px';
  c.style.top = (f.top - host.top + f.height / 2 - 9) + 'px';
  fx.appendChild(c);
  const dx = (t.left + t.width / 2) - (f.left + f.width / 2);
  const dy = (t.top + t.height / 2) - (f.top + f.height / 2);
  const lift = Math.min(38, 16 + Math.abs(dx) * 0.12);
  const anim = c.animate([
    { transform: 'translate(0,0) scale(.9)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.15)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.85)`, opacity: 1 },
  ], { duration: 480, delay: delay || 0, easing: 'cubic-bezier(.35,.02,.25,1)', fill: 'both' });
  anim.onfinish = () => c.remove();
  setTimeout(() => c.remove(), (delay || 0) + 700);
}

// 값을 부르면 내 자리에서 내 배팅 더미(오른쪽 레일)로 칩이 간다.
// 아직 은행에 낸 것은 아니다 — 정산 때 그 더미가 은행으로 쓸려 간다.
function tvBetChips(n, mine) {
  const from = document.getElementById(mine ? 'tv-myChips' : 'tv-oppChips');
  const pot = document.getElementById(mine ? 'tv-potMe' : 'tv-potOpp');
  const many = Math.max(1, Math.min(n, 5));
  for (let i = 0; i < many; i++) tvTossChip(from, pot, mine, i * 80);
}

// 걸었지만 안 낸 칩은 제자리로 돌아온다.
function tvBackChips(n, mine) {
  const pot = document.getElementById(mine ? 'tv-potMe' : 'tv-potOpp');
  const home = document.getElementById(mine ? 'tv-myChips' : 'tv-oppChips');
  const many = Math.min(Math.max(n, 1), 5);
  for (let i = 0; i < many; i++) tvTossChip(pot, home, mine, i * 80);
}

// 정산 — 걸어 둔 더미가 은행으로 쓸려 간다.
function tvFlyChips(n, mine) {
  const from = document.getElementById(mine ? 'tv-potMe' : 'tv-potOpp');
  const bank = document.getElementById('tv-bank');
  const many = Math.min(Math.max(n, 1), 6);
  for (let i = 0; i < many; i++) tvTossChip(from, bank, mine, i * 90);
  if (n > 0) {
    tvSfx('chips');   // 칩이 은행으로 쓸려 가는 소리
    if (bank) { bank.classList.remove('pop'); void bank.offsetWidth; bank.classList.add('pop'); }
  }
}

const tvSfx = (n) => { try { playSound(n); } catch (_) {} };

function tvReact(prev, v) {
  if (!prev || !v) return;
  const meSide = 'me', oppSide = 'opp';

  // 소리는 2인전에서 쓰던 것을 같은 뜻으로 쓴다 —
  // 뒤집으면 flip, 내려놓으면 place, 부르면 select, 정산은 reveal.
  if (v.centerLeft < prev.centerLeft) tvSfx('flip');
  if (v.lot && !prev.lot) tvSfx('card');
  if (v.lot && prev.lot && v.lot.hasOffer && !prev.lot.hasOffer) tvSfx('place');

  // 1) 누가 얼마를 불렀나 (오픈)
  if (v.lot && prev.lot && v.lot.type === 'open') {
    if ((v.lot.myBet || 0) > (prev.lot.myBet || 0)) {
      tvSay(meSide, tvChipHtml(v.lot.myBet, true)); tvSfx('chip');
      tvBetChips(v.lot.myBet - (prev.lot.myBet || 0), true);
    }
    if (v.lot.oppBet !== null && (v.lot.oppBet || 0) > (prev.lot.oppBet || 0)) {
      tvSay(oppSide, tvChipHtml(v.lot.oppBet, false)); tvSfx('chip');
      tvBetChips(v.lot.oppBet - (prev.lot.oppBet || 0), false);
    }
  }
  // 클로즈 — 진행자가 불렀다. 값은 서로 보인다(가려지는 건 출품 카드다).
  if (v.lot && prev.lot && v.lot.type === 'close' && v.lot.turnToAct !== prev.lot.turnToAct) {
    const bidder = prev.lot.turnToAct;
    if (bidder === v.auctioneer) {
      const amt = bidder === v.me ? v.lot.closeBetKnown : v.lot.oppBet;
      tvSay(bidder === v.me ? meSide : oppSide, tvChipHtml(amt, bidder === v.me));
      tvSfx('chip');
      tvBetChips(amt || 2, bidder === v.me);
    }
  }

  // 2) 판이 끝났다 — 누가 물러섰고, 무엇이 어디로 갔나
  if (v.phase === 'settled' && prev.phase !== 'settled' && v.last) {
    const l = v.last;
    const iWon = l.winner === v.me;
    if (l.folded) {
      const folderIsMe = l.folded === v.me;
      const word = l.type === 'close' ? '안 살래요' : '물러설게요';
      tvSay(folderIsMe ? meSide : oppSide, word, 'fold');
      tvSfx('back');
    } else if (l.type === 'close') {
      tvSay(iWon ? meSide : oppSide, tvChipHtml(iWon ? l.wBet : l.lBet, iWon) + ' 살게요');
      tvSfx('reveal');
    }
    // 칩이 은행으로
    const myPay = iWon ? l.wPay : l.lPay, opPay = iWon ? l.lPay : l.wPay;
    const myBet = iWon ? l.wBet : l.lBet, opBet = iWon ? l.lBet : l.wBet;
    if (myPay > 0) tvFlyChips(myPay, true);
    if (opPay > 0) setTimeout(() => tvFlyChips(opPay, false), 180);
    // 걸었지만 안 낸 만큼은 제자리로 — 진 쪽은 절반만 내므로 나머지가 돌아온다
    if (myBet - myPay > 0) setTimeout(() => tvBackChips(myBet - myPay, true), 420);
    if (opBet - opPay > 0) setTimeout(() => tvBackChips(opBet - opPay, false), 560);
    // 카드가 이긴 쪽으로. 경매대에 놓여 있던 그 카드가 그대로 떠오른다 —
    // 지웠다가 잠시 뒤 띄우면 한 번 사라졌다 나타나 보인다(그게 어색했다).
    // 판이 다시 그려진 다음 프레임에 곧바로 띄운다.
    if (iWon) vibe('got');
    tvFlying = (l.prize || []).map((c) => c.id);
    tvSettleLive = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      tvLand(l.prize || [], iWon);
      tvSfx('place');
    }));
  }
}

// 더미. 날아오는 중인 카드는 자리는 잡되 안 보이게 둔다 —
// 그래야 날아온 카드가 내려앉을 곳이 미리 정해진다.
function tvPile(box, cards, landingIds) {
  if (!box) return;
  box.innerHTML = '';
  const byKind = {};
  for (const c of cards) (byKind[c.kind] = byKind[c.kind] || []).push(c);
  for (const k of Object.keys(byKind)) {
    const g = document.createElement('div'); g.className = 'pile-group';
    for (const c of byKind[k]) {
      const el = makeCard(c);
      el.dataset.cid = String(c.id);
      if (landingIds && landingIds.includes(c.id)) el.classList.add('tv-landing');
      g.appendChild(el);
    }
    box.appendChild(g);
  }
}

// 테이블 자리 잡기 — 판 위에 놓이는 것들(상대 전리품·덱·경매대·은행·내 전리품)을
// 실제로 그려진 자리 그대로 감싼다. 손패와 프로필은 테이블 밖에 남는다.
// 화면 크기마다 카드가 줄어드는 판이라 고정값으로는 또 어긋난다.
function tvLayTable() {
  layTable({
    table: 'tv-table', host: 'tv', zone: 'tv-centerZone', mid: 'tv-center',
    wide: ['tv-deck', 'tv-mat', 'tv-rail'],
    mySeat: 'tv-mySeat', myHand: 'tv-myHand', oppSeat: 'tv-oppSeat', oppHand: 'tv-oppHand',
  });
}
// 2인전(클래식·아이템전)도 같은 판을 쓴다 — 이름만 다르다.
// 덱·턴 표시·배팅 레일을 경매품 카드와 한 줄에 맞춘다.
// 셋 다 가운데 칸의 50% 에 걸어 두었는데, 경매대 안에서는 카드가 딱지 아래에
// 놓이고 칸 아래에는 안내 문구가 자리를 먹어, 실제로 그려진 카드는 그 축에서
// 몇 픽셀 위에 있었다. 트웰브는 tvAlignRow 로 이미 이 일을 하고 있었는데
// 2인전에는 짝이 없어서 눈에 띄게 어긋나 있었다.
function gAlignRow() {
  const deck = document.getElementById('deckStack');
  const rail = document.getElementById('g-rail');
  const turn = document.getElementById('turnInfo');
  if (!deck) return;
  if (document.body.classList.contains('land')) {          // 가로는 배치가 통째로 다르다
    for (const el of [deck, rail, turn]) if (el) el.style.marginTop = '';
    return;
  }
  // 카드가 아직 없는 단계(덱을 뒤집기 전)에는 맞출 대상이 없다. 그때 빈 칸에
  // 맞춰 버리면 엉뚱한 값이 박히고, 카드가 나온 뒤에도 그대로 남는다 —
  // 지난 정렬을 그대로 두고 물러난다.
  const slot = document.querySelector('#auctionItems .a-slot');
  if (!slot) return;
  // 카드가 아니라 칸을 잰다. 카드는 딜·비행 중에 transform 으로 움직여서
  // 그때 재면 어긋난 값이 잡힌다. 칸과 이름표는 안 움직인다.
  const s = slot.getBoundingClientRect();
  if (!s.height) return;
  const lbl = slot.querySelector('.a-label');
  const lh = lbl ? lbl.getBoundingClientRect().height : 0;
  const cy = s.top + lh + (s.height - lh) / 2;             // 이름표를 뺀 카드 자리의 한가운데
  const fix = (el) => {
    if (!el) return;
    el.style.marginTop = '0px';
    const b = el.getBoundingClientRect();
    if (!b.height) return;
    el.style.marginTop = Math.round(cy - (b.top + b.height / 2)) + 'px';
  };
  fix(deck); fix(rail);
  // 턴 표시는 덱과 함께 움직인다 — 덱 위에 붙어 있어야 한 덩이로 읽힌다
  if (turn) turn.style.marginTop = deck.style.marginTop;
}

function gameLayTable() {
  if (!document.getElementById('game-table')) return;
  gAlignRow();   // 줄을 맞춘 뒤라야 테이블이 제 자리를 잡는다
  layTable({
    table: 'game-table', host: 'game', zone: 'centerZone', mid: 'auctionItems',
    wide: ['deckStack', 'auctionMat', 'g-rail'],
    mySeat: 'mySeat', myHand: 'myHand', oppSeat: 'oppSeat', oppHand: 'oppHand',
  });
}
function layTable(cfg) {
  const table = document.getElementById(cfg.table);
  const host = document.getElementById(cfg.host);
  if (!table || !host) return;
  // 가로 모드는 배치가 통째로 다르다 — 거기서는 화면 전체가 펠트라 잴 것이 없다.
  // 세로에서 밀어 둔 자리도 풀어야 한다. 안 그러면 돌린 뒤에도 판이 그만큼
  // 밀린 채로 남는다.
  if (document.body.classList.contains('land')) {
    table.classList.remove('on');
    const z = document.getElementById(cfg.zone); if (z) z.style.transform = '';
    return;
  }
  const rect = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
  const wide = cfg.wide.map(rect).filter((r) => r && r.width > 0);
  if (wide.length < 2) { table.classList.remove('on'); return; }
  const h = host.getBoundingClientRect();
  // 가죽 레일은 펠트 밖으로 뻗는다(box-shadow spread). 그만큼을 미리 비워 두지
  // 않으면 레일이 화면 밖으로 잘려 테이블이 잘린 판때기로 보인다.
  const RAIL = 25;
  const padX = 10;   // 좌우는 바짝 — 가로로 두꺼우면 판이 납작해 보인다
  let left = Math.min(...wide.map((r) => r.left)) - padX;
  let right = Math.max(...wide.map((r) => r.right)) + padX;
  // 사람은 가죽 레일에 걸터앉는다 — 프로필이 레일 위에 반쯤 올라앉는
  // 그 모양이다. 자리를 통째로 판 밖에 내보내면 그만큼 판이 짧아져
  // 가로로만 두꺼운 납작한 판때기가 된다. 손에 든 패는 여전히 판 밖이다.
  const seatMid = (id) => { const r = rect(id); return r && r.height ? r.top + r.height / 2 : null; };
  const handEdge = (id, key) => { const r = rect(id); return r && r.height ? r[key] : null; };
  const oppMid = seatMid(cfg.oppSeat), myMid = seatMid(cfg.mySeat);
  const oppHandB = handEdge(cfg.oppHand, 'bottom'), myHandT = handEdge(cfg.myHand, 'top');
  let top = oppMid != null ? oppMid : (oppHandB != null ? oppHandB + RAIL + 2 : h.top + RAIL + 2);
  let bottom = myMid != null ? myMid : (myHandT != null ? myHandT - RAIL - 2 : h.bottom - RAIL - 2);
  if (oppHandB != null) top = Math.max(top, oppHandB + 4);
  if (myHandT != null) bottom = Math.min(bottom, myHandT - 4);
  left = Math.max(left, h.left + RAIL + 2);
  right = Math.min(right, h.right - RAIL - 2);
  top = Math.max(top, h.top + RAIL + 2);
  bottom = Math.min(bottom, h.bottom - RAIL - 2);
  // 잰 것은 화면 픽셀인데, 판은 zoom 이 걸린 칸 안에 있다.
  // 그대로 쓰면 브라우저가 한 번 더 줄여서(×zoom) 판이 그만큼 작고 왼쪽으로 밀린다.
  // 화면이 넓을수록 zoom 이 1 에 가까워 티가 안 나다가, 좁은 폰에서는 0.68 까지
  // 내려가 판이 눈에 띄게 어긋났다 — PC 에서 레일이 판 밖으로 삐져나오던 것도 이것이다.
  // rect ÷ offsetWidth 로 실제 배율을 구해 되돌린다(중첩 zoom 도 이 비율에 다 들어 있다).
  const z = (h.width && host.offsetWidth) ? (h.width / host.offsetWidth) : 1;
  const un = (v) => Math.round(v / (z || 1));
  table.style.left = un(left - h.left) + 'px';
  table.style.top = un(top - h.top) + 'px';
  table.style.width = un(Math.max(60, right - left)) + 'px';
  table.style.height = un(Math.max(60, bottom - top)) + 'px';
  table.classList.add('on');
  centerBoard(cfg.zone, cfg.mid, top, bottom, z);
}

// 덱·경매대·레일을 테이블 한가운데로. 칸 배치만으로는 아래 문구·버튼 칸 때문에
// 위로 쏠리거나 아래로 처진다 — 테이블을 잡고 나서 그 한가운데에 맞춘다.
// 테이블 크기는 앉은 자리로 정해지므로 여기서 내용을 밀어도 다시 안 흔들린다.
function centerBoard(zoneId, midId, top, bottom, z) {
  const zone = document.getElementById(zoneId);
  // 경매대 상자가 아니라 카드가 앉는 칸을 기준으로 잡는다. 상자에는 이름표가
  // 붙어 있어 상자를 한가운데 두면 정작 카드는 그만큼 아래로 내려간다.
  const mat = document.getElementById(midId);
  if (!zone || !mat) return;
  zone.style.transform = 'translateY(0px)';
  const m = mat.getBoundingClientRect();
  if (!m.height) return;
  const want = (top + bottom) / 2, now = m.top + m.height / 2;
  // transform 도 zoom 이 걸린 칸 안의 길이다 — 화면 픽셀을 그대로 쓰면 그만큼 덜 움직인다
  zone.style.transform = `translateY(${Math.round((want - now) / (z || 1))}px)`;
}

// 덱·은행을 경매품 카드와 한 줄에 맞춘다.
// 둘 다 가운데 칸의 한가운데(50%)에 걸어 두었는데, 경매대 안에서는 카드가
// 딱지·이름표 아래에 놓여 그만큼 내려가 있다. 그래서 눈으로 보면 줄이 안 맞았다.
// 자리를 손으로 짚지 않고, 실제로 그려진 카드의 높이에 맞춘다.
function tvAlignRow() {
  // 카드 자체가 아니라 그 카드가 앉는 칸을 잰다 — 카드는 뽑히는 동안 움직이므로
  // 그때 재면 어긋난 값이 잡힌다.
  const card = document.getElementById('tv-center');
  const deck = document.getElementById('tv-deck');
  const stack = document.getElementById('tv-deckStack');
  const rail = document.getElementById('tv-rail');
  const bank = document.getElementById('tv-bank');
  if (!card || !deck || !stack) return;
  const cy = (() => { const b = card.getBoundingClientRect(); return b.height ? b.top + b.height / 2 : 0; })();
  if (!cy) return;
  const fix = (box, inner) => {
    if (!box || !inner) return;
    box.style.marginTop = '0px';
    const b = inner.getBoundingClientRect();
    if (!b.height) return;
    box.style.marginTop = Math.round(cy - (b.top + b.height / 2)) + 'px';
  };
  fix(deck, stack);
  fix(rail, bank);
  tvLayTable();   // 줄을 맞춘 뒤라야 테이블이 제 자리를 잡는다
}

// 덱에서 뽑아 경매대에 놓는 모습.
// 그냥 나타나면 "뽑았다" 는 느낌이 없다 — 덱 자리에서 뒷면으로 출발해
// 날아오면서 앞면으로 뒤집힌다.
function tvDealt(cardEl, deckEl) {
  if (!cardEl || !deckEl) return;
  const t = cardEl.getBoundingClientRect(), f = deckEl.getBoundingClientRect();
  if (!t.width || !f.width) return;
  const dx = (f.left + f.width / 2) - (t.left + t.width / 2);
  const dy = (f.top + f.height / 2) - (t.top + t.height / 2);
  cardEl.animate([
    { transform: `translate(${dx}px, ${dy}px) rotateY(180deg) scale(.85)`, opacity: .9 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 10}px) rotateY(96deg) scale(1.04)`, opacity: 1, offset: 0.5 },
    { transform: 'translate(0,0) rotateY(0deg) scale(1)', opacity: 1 },
  ], { duration: 520, easing: 'cubic-bezier(.3,.05,.25,1)' });
  // 덱도 한 장 떠나 보낸 티를 낸다
  const st = document.getElementById('tv-deckStack');
  if (st) st.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }],
                     { duration: 320, easing: 'ease-out' });
}

// 경매대에 놓인 그 카드가 그대로 떠올라 더미의 제 자리로 간다.
// 지우고 새로 띄우면 한 박자 비어 어색하다 — 있던 자리에서 출발한다.
// 낙찰 카드가 아직 중앙에 놓여 있어야 하는 동안만 참. 다 날아가 앉으면 거짓이 되고,
// 그 뒤로는 판을 다시 그려도 중앙에 카드를 놓지 않는다.
let tvSettleLive = false;
function tvLand(prize, iWon) {
  const fx = document.getElementById('tv-fx');
  const dest = document.getElementById(iWon ? 'tv-myAcq' : 'tv-oppAcq');
  if (!fx || !dest) { tvFlying = []; return; }
  const host = fx.getBoundingClientRect();
  const W = 70, H = 98;
  prize.forEach((card, i) => {
    const seat = dest.querySelector(`[data-cid="${card.id}"]`);
    const stay = document.querySelector(`#tv-mat [data-cid="${card.id}"]`);
    if (!seat) { tvFlyDone(card.id); return; }
    const t = seat.getBoundingClientRect();
    // 지금 화면에 있는 그 카드의 자리에서 출발한다
    const from = stay ? stay.getBoundingClientRect()
                      : document.getElementById('tv-mat').getBoundingClientRect();
    if (stay) stay.style.visibility = 'hidden';     // 원본은 같은 순간 자리만 남기고 숨는다
    const el = makeCard(card);
    el.classList.add('tv-fly');
    el.style.width = W + 'px'; el.style.height = H + 'px';
    el.style.left = (from.left - host.left + from.width / 2 - W / 2) + 'px';
    el.style.top = (from.top - host.top + from.height / 2 - H / 2) + 'px';
    fx.appendChild(el);
    const dx = (t.left + t.width / 2) - (from.left + from.width / 2);
    const dy = (t.top + t.height / 2) - (from.top + from.height / 2);
    const sc = t.width / W;
    requestAnimationFrame(() => { el.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`; });
    // 다 가서 자리에 앉으면, 그 자리의 카드를 켜고 날던 카드를 치운다
    setTimeout(() => { el.remove(); tvFlyDone(card.id); tvSfx('place'); }, 880);
  });
}
// 한 장이 다 내려앉았다 — 그 사이 판을 다시 그렸어도 켜지도록 더미를 다시 그린다
function tvFlyDone(id) {
  tvFlying = tvFlying.filter((x) => x !== id);
  if (!tvFlying.length) tvSettleLive = false;   // 다 앉았다 — 중앙은 이제 비워 둔다
  if (!tvView) return;
  tvPile(document.getElementById('tv-myAcq'), tvView.myAcq, tvFlying);
  tvPile(document.getElementById('tv-oppAcq'), tvView.oppAcq, tvFlying);
}

function tvRender(v) {
  const $ = (id) => document.getElementById(id);
  $('tv-turn').textContent = `턴 ${v.turn}`;
  // 건 칩은 이미 내 손을 떠난 것으로 보여 준다. 얼마를 더 지를 수 있는지가
  // 그래야 눈에 맞는다 — 실제 정산은 판이 끝날 때 하고, 안 낸 만큼은 돌아온다.
  const myHeld = v.chips.me - (v.lot ? (v.lot.myBet || 0) : 0);
  const opHeld = v.chips.opp - (v.lot && v.lot.oppBet !== null ? (v.lot.oppBet || 0) : 0);
  // 쌓인 칩은 다시 만들지 않는다 — 통째로 갈아 끼우면 덜어 내는 모습이 안 보인다
  $('tv-myChips').querySelector('b').textContent = myHeld;
  $('tv-oppChips').querySelector('b').textContent = opHeld;
  tvStack($('tv-myChips').querySelector('.cs-stack'), myHeld, true);
  tvStack($('tv-oppChips').querySelector('.cs-stack'), opHeld, false);
  $('tv-deckLeft').textContent = v.centerLeft;

  // 덱 — 남은 장수만큼 겹쳐 쌓고, 뽑을 수 있을 때만 눌린다
  const deck = $('tv-deck'), stack = $('tv-deckStack');
  const canDraw = !v.over && v.phase === 'draw' && v.auctioneer === v.me;
  const dsig = v.centerLeft + '|' + canDraw;
  if (stack.dataset.sig !== dsig) {
    stack.dataset.sig = dsig;
    stack.innerHTML = '';
    for (let i = 0; i < Math.min(v.centerLeft, 5); i++) {
      const c = makeCard(null);
      c.style.transform = `translate(${i * 2}px, ${-i * 2}px)`;
      c.style.zIndex = String(i);
      stack.appendChild(c);
    }
    stack.style.visibility = v.centerLeft ? '' : 'hidden';
  }
  deck.classList.toggle('on', canDraw);
  if (!deck._bound) { deck._bound = true; onTap(deck, () => { if (deck.classList.contains('on')) tvAct('draw'); }); }

  const c = $('tv-center'), o = $('tv-offer');
  c.innerHTML = ''; o.innerHTML = '';
  if (v.lot) {
    const cc = makeCard(v.lot.center);
    c.appendChild(cc);
    if (tvJustDrew) tvDealt(cc, $('tv-deck'));    // 덱에서 뽑혀 나오는 모습
    if (v.lot.offered) o.appendChild(makeCard(v.lot.offered));
    else if (v.lot.hasOffer) o.appendChild(v.auctioneer === v.me ? makeMyBack() : makeOppBack());   // 아직 안 열린 출품 카드
    $('tv-offerLbl').textContent = (v.lot.hasOffer && !v.lot.offered) ? '출품 (비공개)' : '출품 카드';
    $('tv-typeBadge').textContent = v.lot.type === 'open' ? '오픈 경매'
      : v.lot.type === 'close' ? '클로즈 경매' : '';
    // 2인전 경매대와 같은 알약 — 오픈은 초록, 클로즈는 보라
    $('tv-typeBadge').className = 'type-badge ' + (v.lot.type === 'close' ? 'closed' : 'open');
    // 오른쪽 레일 — 건 만큼 쌓인다. 값은 클로즈에서도 서로 보인다.
    tvPot($('tv-potMe'), v.lot.myBet, true, false);
    tvPot($('tv-potOpp'), v.lot.oppBet || 0, false, false);
    $('tv-potMe').classList.remove('passed'); $('tv-potOpp').classList.remove('passed');
  } else if (v.phase === 'settled' && v.last) {
    // 경매품은 그 자리에 그대로 둔다. 없앴다가 잠시 뒤 날아오르게 하면
    // 카드가 한 번 사라졌다 다시 나타나 보인다 — 그 빈 순간이 어색했다.
    // tvLand 가 이 카드를 그대로 집어 들고 날아간다.
    //
    // 다만 이미 날아가 앉은 뒤라면 도로 놓지 않는다. 정산 중에 판을 다시 그릴
    // 일이 생기면(예전엔 AI 쪽에서 헛푸시가 왔다) 낙찰된 카드가 중앙에 그대로
    // 남아 있는 것처럼 보였다 — 이번엔 아무도 그걸 집어 가지 않으니까.
    const pz = tvSettleLive ? (v.last.prize || []) : [];
    // 날고 있는 중에 다시 그려졌다면 자리만 잡고 숨는다 — 안 그러면 두 장으로 보인다
    const midFlight = !!document.querySelector('#tv-fx .tv-fly');
    const place = (card, box) => {
      const el = makeCard(card); el.dataset.cid = String(card.id);
      if (midFlight) el.style.visibility = 'hidden';
      box.appendChild(el);
    };
    if (pz[0]) place(pz[0], c);
    if (pz[1]) place(pz[1], o);
    $('tv-typeBadge').className = 'type-badge ' + (v.last.winner === v.me ? 'open' : 'closed');
    $('tv-typeBadge').textContent = v.last.winner === v.me ? '내가 낙찰' : '상대가 낙찰';
    // 정산 화면에서는 실제로 낸 값만큼만 남긴다 — 곧 은행으로 쓸려 간다
    const iWon = v.last.winner === v.me;
    // 도장을 먼저 찍는다 — 한 푼도 안 걸고 물러선 자리도 보여야 하니까
    $('tv-potMe').classList.toggle('passed', v.last.folded === v.me);
    $('tv-potOpp').classList.toggle('passed', !!v.last.folded && v.last.folded !== v.me);
    tvPot($('tv-potMe'), iWon ? v.last.wPay : v.last.lPay, true, false);
    tvPot($('tv-potOpp'), iWon ? v.last.lPay : v.last.wPay, false, false);
  } else {
    $('tv-typeBadge').textContent = ''; $('tv-typeBadge').className = 'type-badge';
    tvPot($('tv-potMe'), 0, true, false); tvPot($('tv-potOpp'), 0, false, false);
    $('tv-potMe').classList.remove('passed'); $('tv-potOpp').classList.remove('passed');
  }

  const mh = $('tv-myHand'); mh.innerHTML = '';
  // 방식을 고르기 전이면 출품 카드를 다시 고를 수 있다 — 아직 아무것도
  // 걸지 않았는데 한 번 눌렀다고 못 무르면 그건 그냥 오작동이다.
  const canOffer = (v.phase === 'offer' || v.phase === 'choose') && v.auctioneer === v.me;
  [...v.myHand].sort((a, b) => a.kind - b.kind || a.grade - b.grade).forEach((card) => {
    const el = makeCard(card, canOffer ? { selectable: true, tapOnSlot: true,
      onClick: (cc) => tvAct('offer', { cardId: cc.id }) } : {});
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(el); mh.appendChild(slot);
    if (el._tap) onTap(slot, el._tap);
  });
  if (typeof fanRow === 'function') fanRow(mh, false);
  const oh = $('tv-oppHand'); oh.innerHTML = '';
  for (let i = 0; i < v.oppHandLen; i++) {
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(makeOppBack()); oh.appendChild(slot);
  }
  if (typeof fanRow === 'function') fanRow(oh, true);
  // 날아오는 중인 카드는 자리만 잡고 아직 안 보인다 (tvLand 가 켠다)
  tvPile($('tv-myAcq'), v.myAcq, tvFlying);
  tvPile($('tv-oppAcq'), v.oppAcq, tvFlying);
  requestAnimationFrame(tvAlignRow);   // 그려진 뒤라야 실제 높이를 잰다
  tvActions(v);
}


// 배팅 액수 고르개. 숫자 입력칸의 작은 화살표는 손가락으로 못 누른다 —
// 46px 짜리 ─ / ＋ 두 개로 만든다. step 이 2 면 짝수만 나온다(클로즈).
function tvAmount(box, lo, hi, step, init) {
  const wrap = document.createElement('div'); wrap.className = 'tv-amt';
  const minus = document.createElement('button'); minus.className = 'tv-step'; minus.textContent = '\u2212';
  const num = document.createElement('div'); num.className = 'tv-num';
  const plus = document.createElement('button'); plus.className = 'tv-step'; plus.textContent = '+';
  wrap.append(minus, num, plus); box.appendChild(wrap);
  let v = Math.max(lo, Math.min(hi, init));
  const paint = () => {
    num.innerHTML = `<i class="chip light"></i>${v}`;
    minus.disabled = v - step < lo;
    plus.disabled = v + step > hi;
  };
  onPress(minus, () => { if (v - step >= lo) { v -= step; paint(); sfxTick(); } });
  onPress(plus,  () => { if (v + step <= hi) { v += step; paint(); sfxTick(); } });
  paint();
  return { get: () => v };
}
function sfxTick() { try { playSound(document.body.classList.contains('twelve') ? 'chip' : 'select'); } catch (_) {} }

function tvActions(v) {
  const st = document.getElementById('tv-status');
  const box = document.getElementById('tv-actions');
  box.innerHTML = '';
  const mine = v.auctioneer === v.me;
  const btn = (label, fn, ghost) => {
    const b = document.createElement('button');
    b.className = 'tv-btn' + (ghost ? ' ghost' : '');
    // 2인전 버튼과 같은 길(onPress)로 받는다. 여기만 onTap 이라 아이폰에서
    // 오픈·클로즈 경매가 안 눌린다는 말이 나왔다.
    b.textContent = label; onPress(b, fn); box.appendChild(b); return b;
  };

  if (v.over) { st.textContent = '판 종료'; return; }
  if (v.phase === 'draw') {
    // 덱 자체가 버튼이다 — 같은 일을 하는 버튼을 하나 더 두면 어디를 눌러야
    // 하는지가 흐려진다.
    st.textContent = mine ? '덱을 눌러 카드를 뒤집으세요' : '상대가 카드를 뒤집는 중…';
    return;
  }
  if (v.phase === 'offer') {
    st.textContent = mine ? '손패에서 한 장을 내놓으세요' : '상대가 출품하는 중…';
    return;
  }
  if (v.phase === 'choose') {
    st.textContent = mine ? '경매 방식을 고르세요' : '상대가 방식을 고르는 중…';
    if (mine) {
      btn('오픈 경매', () => tvAct('choose', { type: 'open' }));
      const b = btn('클로즈 경매', () => tvAct('choose', { type: 'close' }), true);
      if (v.lot && v.lot.canClose === false) { b.disabled = true; b.title = '칩이 2개 이상 있어야 해요'; }
    }
    return;
  }
  if (v.phase === 'bid') {
    const myTurn = v.lot && v.lot.turnToAct === v.me;
    if (!myTurn) { st.textContent = '상대가 부르는 중…'; return; }
    const lo = v.lot.minRaise, hi = v.chips.me;
    if (lo > hi) { st.textContent = '칩이 모자라요 — 물러서야 해요'; btn('물러서기', () => tvAct('fold'), true); return; }
    // 아무도 안 건 판에서는 물러설 수 없다 — 먼저 부르는 사람은 1 이상을 건다
    st.textContent = v.lot.canFold ? `내 차례 — ${lo} 이상 부르거나 물러서요`
                                   : `먼저 부르는 자리예요 — ${lo} 이상 거세요`;
    const amt = tvAmount(box, lo, hi, 1, lo);
    btn('부르기', () => tvAct('raise', { amount: amt.get() }));
    if (v.lot.canFold) btn('물러서기', () => tvAct('fold'), true);
    return;
  }
  if (v.phase === 'close') {
    const myTurn = v.lot && v.lot.turnToAct === v.me;
    if (mine) {
      if (!myTurn) { st.textContent = '상대가 살지 고르는 중…'; return; }
      const hi = v.chips.me - (v.chips.me % 2);
      st.textContent = '짝수 개를 부르세요 (상대는 무엇인지 모른 채 삽니다)';
      const amt = tvAmount(box, 2, hi, 2, 2);
      btn('부르기', () => tvAct('closeBet', { amount: amt.get() }));
      return;
    }
    if (!myTurn) { st.textContent = '상대가 부르는 중…'; return; }
    // 낼 값은 알려준다 — 하나를 더 얹어 사는 것이 규칙이니 값은 알 수밖에 없다.
    // 가려지는 것은 값이 아니라 출품 카드다.
    const cost = v.lot.takeCost;
    st.textContent = `${cost} 을 내고 살까요? (무엇을 사는지는 안 보여요)`;
    const b = btn(`${cost} 내고 사기`, () => tvAct('take'));
    if (v.lot.canTake === false) { b.disabled = true; b.title = '칩이 모자라요'; }
    btn('안 사기', () => tvAct('decline'), true);
    return;
  }
  if (v.phase === 'settled') {
    const l = v.last;
    if (l) {
      const iWon = l.winner === v.me;
      const mine = iWon ? l.wPay : l.lPay, theirs = iWon ? l.lPay : l.wPay;
      st.innerHTML = `${iWon ? '내가' : '상대가'} 가져갔어요 · 나 <b>-${mine}</b> · 상대 <b>-${theirs}</b>`;
    } else st.textContent = '정산 중…';
    // 다음 턴은 서버가 알아서 넘긴다. 볼 것은 이미 다 보여줬는데
    // 매번 버튼을 한 번 더 누르게 하면 그것대로 흐름이 끊긴다.
  }
}

// ── 솔로 토너먼트 ────────────────────────────────────────────
// 혼자 여는 8강. 세 판을 이기면 우승이고, 매 경기 모드가 바뀐다.
// 대진표·상금은 전부 서버가 쥐고 있고 여기서는 받아 그리기만 한다 —
// 여기서 계산하면 우승을 만들어 낼 수 있다.
let stour = null;                    // 서버가 내려준 마지막 view
const ST_MODE_NAME = { classic: '🃏 클래식', item: '🎪 아이템전', twelve: '🔵 TWELVE' };
const ST_DIFF_NAME = { easy: '쉬움', hard: '보통', expert: '전문가' };

window.stourStart = function (diff) {
  closeModePanels();
  localStorage.setItem('ff_stour', '1');       // 새로고침해도 하던 대회를 다시 찾는다
  socket.emit('stour_start', { diff, nick: getNick(), pid: PID });
};
// 대회 경기 중인가 — 판이 끝났을 때 '로비로' 대신 '대진표로' 를 내밀기 위한 깃발.
// 로비로는 새로고침을 하는데, 예전엔 그 새로고침에 대회가 통째로 날아갔다.
// 지금은 서버가 대회를 사람(토큰·기기 id)에 붙여 두므로 날아가지는 않지만,
// 판마다 화면이 통째로 갈리면 대회를 하는 느낌이 끊긴다.
let isStourMatch = false;
window.stourClose = function () {
  const m = document.getElementById('stourModal');
  if (m) m.classList.remove('show');
};
// 대회를 접는다 — 진행 중이면 서버 쪽도 버린다
window.stourGiveUp = function () {
  socket.emit('stour_quit');
  localStorage.removeItem('ff_stour');
  stour = null; isStourMatch = false; stourClose();
};
// 판이 끝나고 대진표로 — 새로고침 없이 화면만 되돌린다
window.stourBackToBracket = function () {
  document.getElementById('gameOver').style.display = 'none';
  const g = document.getElementById('game'); if (g) g.style.display = 'none';
  const gt = document.getElementById('game-table'); if (gt) gt.classList.remove('on');
  const tb = document.getElementById('tv-table'); if (tb) tb.classList.remove('on');
  document.body.classList.remove('ingame', 'twelve');
  const lb = document.getElementById('lobby'); if (lb) lb.style.display = 'flex';
  isStourMatch = false;
  try { clearSession(); } catch (_) {}
  if (stour) { stourShow(); }
};


function stourShow() {
  const m = document.getElementById('stourModal');
  if (m) m.classList.add('show');
}

// 대진표를 그린다. 세 라운드를 가로로, 마지막에 우승컵.
function stourRender(v, flash) {
  if (!v) return;
  const nameOf = (i) => {
    const s = v.seats[i]; if (!s) return '—';
    return s.me ? (s.nick || '나') : (s.nick || 'AI');
  };
  const rd = document.getElementById('stRound');
  if (rd) rd.textContent = v.over ? '대회 종료' : v.roundName;

  // 남은 판수 — 세 개를 채우면 우승
  const pips = document.getElementById('stPips');
  if (pips) pips.innerHTML = [0, 1, 2].map(i => `<div class="st-pip${i < v.wins ? ' on' : ''}"></div>`).join('');

  const cols = document.getElementById('stCols');
  if (!cols) return;
  let html = '';
  for (let r = 0; r < 3; r++) {
    const rr = v.rounds[r];
    html += `<div class="st-col"><h6>${['8강', '4강', '결승'][r]}</h6>`;
    // 아직 안 열린 라운드도 빈 칸으로 그린다 — 안 그리면 대진표가 한 줄로 보여
    // "여기서 몇 번을 더 이겨야 하는가" 가 안 잡힌다.
    if (!rr) {
      for (let k = 0; k < [4, 2, 1][r]; k++)
        html += '<div class="st-m tbd"><div class="st-p"><span class="sp-n">?</span></div>' +
                '<div class="st-p"><span class="sp-n">?</span></div></div>';
      html += '</div>'; continue;
    }
    for (const m of rr.matches) {
      const mine = m.a === v.mySeat || m.b === v.mySeat;
      const live = mine && m.winner === null && r === v.round && !v.over;
      html += `<div class="st-m${live ? ' live' : ''}">`;
      for (const seat of [m.a, m.b]) {
        const cls = [];
        if (seat === v.mySeat) cls.push('me');
        if (m.winner !== null) cls.push(m.winner === seat ? 'win' : 'lose');
        if (flash && flash.some(f => f.round === r && (f.winner === seat || f.loser === seat))) cls.push('flash');
        html += `<div class="st-p ${cls.join(' ')}"><span class="sp-n">${esc(nameOf(seat))}</span></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
  }
  const champ = v.over && v.myRank === 1;
  html += `<div class="st-col"><h6>우승</h6><div class="st-cup${champ ? ' won' : ''}">🏆</div></div>`;
  cols.innerHTML = html;
}

// 아래쪽 — 다음에 할 일
function stourNextUI(html) {
  const n = document.getElementById('stNext');
  if (n) n.innerHTML = html;
}

socket.on('stour_state', (v) => {
  stour = v; stourRender(v); stourShow();
  if (v.done) return;
  const foe = stourFoeName(v);
  stourNextUI(
    `<div class="st-foe">다음 상대 · <b style="color:#ffeec0">${esc(foe)}</b>` +
    ` <span style="opacity:.6">(${ST_DIFF_NAME[v.diff] || v.diff})</span></div>` +
    `<button class="btn btn-gold" onclick="stourGo()">경기 시작</button>` +
    `<button class="btn btn-outline btn-sm" onclick="stourGiveUp()">대회 포기</button>`
  );
});

function stourFoeName(v) {
  const rr = v.rounds[v.round]; if (!rr) return 'AI';
  const m = rr.matches.find(x => x.winner === null && (x.a === v.mySeat || x.b === v.mySeat));
  if (!m) return 'AI';
  const foe = m.a === v.mySeat ? m.b : m.a;
  const s = v.seats[foe];
  return (s && s.nick) || 'AI';
}

// 모드를 뽑아 달라고 한다. 무엇이 나올지는 서버가 정한다.
window.stourGo = function () {
  stourNextUI(`<div class="st-mode">🎲 모드를 뽑는 중…</div>`);
  socket.emit('stour_next');
};

socket.on('stour_go', (d) => {
  stourNextUI(`<div class="st-mode pop">${ST_MODE_NAME[d.mode] || d.mode}</div>`);
  playSound('bell');
  isStourMatch = true;
  // 뽑힌 것을 보여 준 뒤에 판으로 넘어간다 — 바로 넘기면 무엇이 걸렸는지 못 본다
  setTimeout(() => {
    stourClose();
    difficulty = d.diff;
    if (d.mode === 'twelve') {
      tvBot = true; tvDiff = d.diff;
      socket.emit('tv_solo', { pid: PID, nick: getNick(), diff: d.diff, stour: true });
    } else {
      // 화면 전환에 쓰이는 깃발들 — createRoom·startItemGame 이 하던 것과 같아야
      // 판이 열려도 로비에 남아 있는 일이 없다.
      isVsBot = true; isItemMode = d.mode === 'item';
      socket.emit('create_room', { vsBot: true, difficulty: d.diff, pid: PID, nick: getNick(),
                                   itemMode: d.mode === 'item', stour: true });
    }
  }, 1100);
});

// 한 경기가 끝났다 — 대진표를 채우며 보여 준다
socket.on('stour_none', () => { localStorage.removeItem('ff_stour'); });

socket.on('stour_result', (d) => {
  stour = d.view;
  isStourMatch = false;
  stourShow();
  stourRender(d.view, d.fills);
  playSound(d.won ? 'setwin' : 'tick');
  if (!d.view.over) {
    stourNextUI(
      `<div class="st-foe">${d.won ? '올라갔어요!' : ''}</div>` +
      (d.roundPrize ? `<div class="st-prize">🪙${d.roundPrize} 획득</div>` : '') +
      (d.guest && d.roundPrize ? `<div class="st-foe">로그인하면 받을 수 있어요</div>` : '') +
      `<div class="st-foe">다음 상대 · <b style="color:#ffeec0">${esc(stourFoeName(d.view))}</b></div>` +
      `<button class="btn btn-gold" onclick="stourGo()">다음 경기</button>` +
      `<button class="btn btn-outline btn-sm" onclick="stourGiveUp()">대회 포기</button>`
    );
    if (d.profile) { myAccount = d.profile; renderAccount(); }
    return;
  }
  // 끝났다
  const rank = d.rank;
  const label = rank === 1 ? '🏆 우승!' : rank === 2 ? '🥈 준우승' : rank === 3 ? '4강 탈락' : '8강 탈락';
  stourNextUI(
    `<div class="st-prize">${esc(label)}</div>` +
    (d.prize ? `<div class="st-foe">상금 <b style="color:#ffd94a">🪙${d.prize}</b></div>` : '') +
    (d.guest ? `<div class="st-foe">로그인하면 상금을 받을 수 있어요</div>` : '') +
    `<button class="btn btn-gold" onclick="stourGiveUp()">확인</button>`
  );
  playSound(rank === 1 ? 'victory' : 'defeat');
  localStorage.removeItem('ff_stour');
  if (d.profile) { myAccount = d.profile; renderAccount(); }
});
