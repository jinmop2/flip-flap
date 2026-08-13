const socket = io({ transports: ['websocket', 'polling'] });   // 웹소켓 우선 — 폴링 왕복 생략, 연결 빨라짐

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
  });
}
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
// 로딩 스플래시 — 최소 1.8초는 로고를 보여준 뒤 부드럽게 사라짐 (실패해도 8초 후 숨김)
// 단, 게임 나가기 등 내부 이동으로 돌아온 경우엔 즉시 스킵
const SPLASH_START = Date.now(), SPLASH_MIN = 1800;
let splashHidden = false;
if (sessionStorage.getItem('ff_skipsplash')) {
  sessionStorage.removeItem('ff_skipsplash');
  splashHidden = true;
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
}
// 내부 이동(나가기 등)·게스트·로그인 세션이면 타이틀 화면을 처음부터 숨김 (깜빡임 방지)
if (sessionStorage.getItem('ff_guest') || localStorage.getItem('ff_auth')) {
  const t = document.getElementById('title'); if (t) { t.classList.add('hide'); t.style.display = 'none'; }
}
function hideSplash() {
  if (splashHidden) return; splashHidden = true;
  const s = document.getElementById('splash'); if (!s) return;
  const wait = Math.max(0, SPLASH_MIN - (Date.now() - SPLASH_START));
  setTimeout(() => { s.classList.add('hide'); setTimeout(() => { s.style.display = 'none'; }, 700); }, wait);   // 페이드 후 완전 제거 — 숨은 무한 스피너 정지
}
setTimeout(hideSplash, 8000);
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
  // 재접속 or 초대 링크 or 로비 목록
  const sess = localStorage.getItem('ff_sess');
  const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  // 초대 링크가 옛 세션과 다른 방이면 초대가 우선 (안 그러면 초대 링크가 무시됨)
  if (urlRoom && urlRoom !== sess) {
    localStorage.removeItem('ff_sess');
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
});
socket.on('dup_login', () => {   // 다른 기기에서 같은 계정 로그인 → 이 세션 종료
  clearSession();
  alert('다른 기기(또는 창)에서 같은 계정으로 접속했어요.\n이 창의 연결을 종료합니다.');
  location.href = location.origin + location.pathname;
});
socket.on('disconnect', () => setConn('연결 끊김 — 재접속 중…', 'bad'));
socket.on('connect_error', (e) => { setConn('서버 연결 실패', 'bad'); console.error('socket connect_error:', e && e.message); });
socket.on('rejoin_failed', () => { clearSession(); toast('⚠️ 이전 게임이 끝나 로비로 돌아가요', 2400); setTimeout(fastReload, 1500); });
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
  try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
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

async function restoreSession() {
  const tk = localStorage.getItem('ff_auth'); if (!tk) return;
  const r = await apiPost('/api/me', { token: tk });
  if (r.ok) { myAccount = r.profile; renderAccount(); claimDaily(); }
  else if (r.netFail) { toast('⚠️ 서버 연결이 늦어지고 있어요 — 잠시 후 새로고침해 주세요', 3200); }   // 콜드스타트/오프라인: 유효 토큰 지키기
  else localStorage.removeItem('ff_auth');   // 서버가 명시적으로 거부한 경우만 로그아웃
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
const ncClass = c => c ? ' nc-' + c : '';   // 닉네임 염색 클래스
const NP_CLASS = { np_wood: 'np-wood', np_neon: 'np-neon', np_gold: 'np-gold', np_daily: 'np-daily', np_lv50: 'np-lv50', np_ruby: 'np-ruby', np_crystal: 'np-crystal', np_obsidian: 'np-obsidian', np_hanji: 'np-hanji', np_shard: 'np-shard' };
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
  if (myAccount) {
    const p = myAccount;
    const total = p.wins + p.losses;
    body.innerHTML = `
      <span class="pb-lv">Lv.${p.level}</span>
      <div class="pb-ava" style="color:${p.rankColor}">${faceOf(p)}</div>
      <div class="pb-mid">
        <div class="pb-nickrow"><span class="pb-nick${ncClass(p.nickColor)}${npClass(p.plate)}" onclick="event.stopPropagation();openPlate()" title="명패 고르기">${esc(p.nick)}</span>${titleTag(p.titleInfo)}</div>
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
        <div class="mi-nick${ncClass(p.nickColor)}">${esc(p.nick)} ${canNick ? '<button class="pc-icon" onclick="closeMyInfo();openNickModal()" title="닉네임 바꾸기">✏️</button>' : ''}</div>
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
    row.innerHTML = `<span class="hist-res ${res.c}">${res.t}</span>
      <span class="hist-vs">vs ${esc(m.vs)}</span>
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
function hideTitle() { const t = document.getElementById('title'); if (t) t.classList.add('hide'); }
function showTitle() { sessionStorage.removeItem('ff_guest'); const t = document.getElementById('title'); if (t) { t.style.display = ''; t.classList.remove('hide'); } }
function startAsGuest() { sessionStorage.setItem('ff_guest', '1'); hideTitle(); }   // 게스트 선택 기억
const cameFromOAuth = kakaoFirstLogin || location.href.includes('ktoken');   // 방금 로그인하고 돌아온 경우

renderAccount();   // 게스트 상태로 하단 바 먼저 렌더
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
function quickMatch(itemMode) {
  closeModePanels();
  isItemMode = !!itemMode;
  socket.emit('quick_match', { pid: PID, nick: getNick(), itemMode: !!itemMode });
  const m = document.getElementById('matchModal');
  m.classList.add('show');
  const t = document.getElementById('matchTitle');
  if (t) t.textContent = itemMode ? '🎪 아이템전 빠른플레이' : '⚡ 빠른 대전';
}
function cancelMatch() {
  socket.emit('cancel_match');
  document.getElementById('matchModal').classList.remove('show');
}
socket.on('queued', () => document.getElementById('matchModal').classList.add('show'));
socket.on('unqueued', () => document.getElementById('matchModal').classList.remove('show'));

// ── 랭킹 ────────────────────────────────────────────────────
async function openLeaderboard() {
  const modal = document.getElementById('lbModal'), list = document.getElementById('lbList');
  list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  modal.classList.add('show');
  try {
    const r = await fetch('/api/leaderboard').then(x => x.json());
    if (!r.ok || !r.players.length) { list.innerHTML = '<div class="lb-empty">아직 랭킹이 없어요. 첫 플레이어가 되어보세요!</div>'; return; }
    const myNick = myAccount && myAccount.nick;
    list.innerHTML = '';
    r.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (myNick && p.nick === myNick ? ' me' : '');
      row.innerHTML = `<span class="lb-no${p.no <= 3 ? ' top' : ''}">${p.no <= 3 ? rankIco(['🥇','🥈','🥉'][p.no-1]) : p.no}</span>
        <span class="lb-rank" style="color:${p.rankColor}">${faceOf(p)}</span>
        <span class="lb-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</span>
        <span class="lb-wl">${p.wins}승 ${p.losses}패</span>
        <span class="lb-rp">${p.rp} RP</span>`;
      list.appendChild(row);
    });
    // 내 순위가 톱20 밖이면 하단에 별도 표시
    if (myAccount) {
      const inTop = r.players.some(p => p.nick === myNick);
      const mr = await apiPost('/api/myrank', { token: localStorage.getItem('ff_auth') });
      if (!inTop && mr.me && mr.me.no) {
        const me = mr.me;
        const row = document.createElement('div'); row.className = 'lb-row me lb-mine';
        row.innerHTML = `<span class="lb-no">${me.no}</span>
          <span class="lb-rank" style="color:${me.rankColor}">${faceOf(me)}</span>
          <span class="lb-nick${ncClass(me.nickColor)}">${esc(me.nick)}</span>
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
// #missionDot)을 여기서 켠다.
async function refreshMissionDot() {
  const dot = document.getElementById('missionDot');
  if (!dot) return;
  if (!myAccount) { dot.style.display = 'none'; return; }
  const r = await apiPost('/api/missions', { token: localStorage.getItem('ff_auth') });
  const ready = !r.error && (r.list || []).some((m) => m.done && !m.claimed);
  dot.style.display = ready ? '' : 'none';
}
async function openMissions() {
  if (!myAccount) { alert('미션은 로그인하면 이용할 수 있어요!'); openAuth('login'); return; }
  const list = document.getElementById('missionList');
  list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  document.getElementById('missionModal').classList.add('show');
  const r = await apiPost('/api/missions', { token: localStorage.getItem('ff_auth') });
  if (r.error || !r.list) { list.innerHTML = '<div class="lb-empty">불러오기 실패</div>'; return; }
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
  hourglass:  { name: '모래시계',     icon: '⏳', tier: 'common', desc: '상대의 남은 시간을 30초 깎는다' },
  swap:       { name: '손바꿈',       icon: '🔀', tier: 'common', desc: '내 손패 1장을 덱의 카드와 바꾼다', needsCard: true },
  smoke:      { name: '연막탄',       icon: '💨', tier: 'rare',   desc: '이번 경매품을 상대에게만 가린다' },
  flip:       { name: '뒤집개',       icon: '🔄', tier: 'rare',   desc: '이번 경매만 약한 카드가 이긴다' },
  pickpocket: { name: '소매치기',     icon: '🪝', tier: 'rare',   desc: '상대 손패 1장을 뺏고 내 카드 1장을 넘긴다' },
  discount:   { name: '에누리',       icon: '💰', tier: 'rare',   desc: '이겨도 배팅 카드를 뺏기지 않는다' },
  redo:       { name: '재경매',       icon: '📢', tier: 'rare',   desc: '진 경매를 무효로 하고 다시 배팅한다' },
  steal:      { name: '도둑고양이',   icon: '🐈', tier: 'legend', desc: '상대가 낙찰받은 카드 1장을 훔친다' },
  copy:       { name: '복사기',       icon: '🖨️', tier: 'legend', desc: '내가 낙찰받은 카드 1장을 복제한다' },
  tyrant:     { name: '폭군',         icon: '👑', tier: 'legend', desc: '이번 턴 진행자 권한을 뺏는다' },
  dice:       { name: '운명의 주사위', icon: '🎲', tier: 'legend', desc: '경매품 2장을 새로 뽑아 바꾼다' },
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
window.startItemGame = function () {
  closeModePanels();
  isVsBot = true; isItemMode = true;
  socket.emit('create_room', { vsBot: true, difficulty: 'normal', pid: PID, nick: getNick(), itemMode: true });
};

// 슬롯 3칸 렌더 — 지금 쓸 수 있는 것만 밝게
function renderItems(s) {
  const bar = document.getElementById('itemBar');
  const badge = document.getElementById('oppItemBadge');
  if (!bar) return;
  if (!s || !s.itemMode) { bar.style.display = 'none'; badge.style.display = 'none'; hideFxBanner(); return; }
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
    // 못 쓰는 슬롯도 눌리게 둔다 — 아무 반응이 없으면 뭘 가진 건지조차 알 수 없다
    html += `<div class="ib-slot ${it.tier} ${usable ? 'ready' : 'locked'}" title="${esc(it.name)}"
                  onclick="${usable ? `openItemUse('${id}')` : `explainItem('${id}')`}">${itemArt(id)}</div>`;
  }
  slots.innerHTML = html;
  renderFxBanner(s);
}

// 클라이언트 쪽 사용 가능 판단 (서버가 최종 판정 — 여기선 버튼을 흐리게 할 뿐)
function itemUsableNow(id, s) {
  if (!s || s.itemUsed) return false;
  const PRE = ['draw', 'offer', 'choose_type', 'bidding'];
  const phases = id === 'redo' ? ['reveal']
               : id === 'tyrant' ? ['draw']
               : id === 'dice' ? ['choose_type', 'bidding']
               : id === 'smoke' ? ['offer', 'choose_type', 'bidding']
               : PRE;
  if (!phases.includes(s.phase)) return false;
  if (s.phase === 'bidding' && s.auction && s.auction.myBid) return false;   // 배팅 낸 뒤엔 불가
  if (id === 'tyrant' && s.auctioneer === s.myIndex) return false;
  return true;
}

function renderFxBanner(s) {
  const el = document.getElementById('fxBanner');
  if (!el) return;
  const f = s.fx || {};
  const msgs = [];
  if (f.reverse) msgs.push('🔄 반전 — 약한 카드가 이긴다');
  if (f.smokedMe) msgs.push('💨 연막 — 경매품이 안 보인다');
  if (f.smokedOpp) msgs.push('💨 상대 시야를 가림');
  if (f.noSwapMe) msgs.push('💰 에누리 — 배팅 카드를 지킨다');
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
  dice:   '경매 방식이 정해진 뒤부터 배팅 전까지',
  smoke:  '경매품이 나온 뒤부터 배팅 전까지',
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

socket.on('item_get', it => showItemGet(it));
socket.on('item_fail', msg => toast('⚠️ ' + esc(msg || '지금은 쓸 수 없어요.')));
socket.on('item_used', u => {
  playItemFx(u);
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
  if (which === 'find') setTimeout(() => document.getElementById('friendNickInput').focus(), 60);
}

async function loadFriends() {
  const box = document.getElementById('friendListBox');
  box.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/friends', { token: authToken() });
  if (!r.ok) { box.innerHTML = `<div class="soc-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  _friendData = r;
  renderFriends();
  updateSocialBadges();
}

// 친구 한 줄 — 온라인이면 초록 점 + 도전장 버튼
function friendRow(f, kind) {
  const clan = f.clan ? `<span class="soc-clan">[${esc(f.clan.tag)}]</span>` : '';
  const acts = {
    friend: `${f.online && !f.ingame ? `<button class="soc-btn good" onclick="challengeFriendInApp('${esc(f.idl)}')">도전장</button>` : ''}
             <button class="soc-btn bad" onclick="confirmRemoveFriend('${esc(f.idl)}','${esc(f.nick)}')">삭제</button>`,
    in:     `<button class="soc-btn good" onclick="respondFriend('${esc(f.idl)}',true)">수락</button>
             <button class="soc-btn bad" onclick="respondFriend('${esc(f.idl)}',false)">거절</button>`,
    out:    `<button class="soc-btn bad" onclick="cancelFriend('${esc(f.idl)}')">취소</button>`,
  }[kind];
  return `<div class="soc-item">
    ${kind === 'friend' ? `<span class="soc-dot ${f.ingame ? 'busy' : (f.online ? 'on' : '')}"></span>` : ''}
    <div class="soc-info">
      <div class="soc-nick">${clan}${esc(f.nick)}</div>
      <div class="soc-meta">Lv.${f.level} · ${rankIco(f.rankIcon)} ${esc(f.rank)} · ${f.rp} RP${
        kind === 'friend' ? (f.ingame ? ' · <b style="color:#ffab5e">게임 중</b>' : (f.online ? ' · 접속 중' : '')) : ''}</div>
    </div>
    <div class="soc-acts">${acts}</div>
  </div>`;
}

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
  loadFriends();
}

async function respondFriend(idl, accept) {
  const r = await apiPost(accept ? '/api/friend-accept' : '/api/friend-decline', { token: authToken(), idl });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (accept) toast(`🎉 ${esc(r.nick || '')}님과 친구가 되었어요!`);
  loadFriends();
}
async function cancelFriend(idl) {
  await apiPost('/api/friend-cancel', { token: authToken(), idl });
  loadFriends();
}
function confirmRemoveFriend(idl, nick) {
  askConfirm({ icon: '👋', title: `${nick}님을 삭제할까요?`, desc: '친구 목록에서 서로 사라져요.', yes: '삭제', no: '취소' },
    async () => { await apiPost('/api/friend-remove', { token: authToken(), idl }); loadFriends(); });
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

async function loadClan() {
  const body = document.getElementById('clanBody');
  body.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/clan', { token: authToken() });
  if (!r.ok) { body.innerHTML = `<div class="soc-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  if (r.clan) renderMyClan(r.clan);
  else renderClanBrowse(r);
  updateSocialBadges();
}

function renderMyClan(c) {
  const memberRow = m => `<div class="soc-item">
    <div class="soc-info">
      <div class="soc-nick">${m.isOwner ? '👑' : m.isVice ? '🛡' : ''}${esc(m.nick)}${
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
      <div class="soc-nick">${esc(m.nick)}</div>
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
    </div>`;
  if (_clanView === 'chat') loadClanChat();
}

// ── 클랜 채팅 ──────────────────────────────────────────────
let _clanView = 'chat';        // 클랜 모달에서 채팅/클랜원 중 무엇을 보고 있나
let _chatUnread = 0;           // 모달이 닫혀 있을 때 쌓인 새 메시지
let _chatMsgs = [];

function clanViewTab(which) {
  _clanView = which;
  document.getElementById('clanPaneChat').style.display = which === 'chat' ? '' : 'none';
  document.getElementById('clanPaneInfo').style.display = which === 'info' ? '' : 'none';
  document.querySelectorAll('#clanBody .soc-tabs .soc-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0) === (which === 'chat')));
  if (which === 'chat') { loadClanChat(); setTimeout(() => document.getElementById('chatInput')?.focus(), 60); }
}

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
      ${m.mine ? '' : `<div class="chat-who">${esc(m.nick || '')}</div>`}
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
  const cb = document.getElementById('clanBadge');
  if (cb && _chatUnread > 0 && cb.style.display === 'none') {   // 로비 버튼에도 표시
    cb.textContent = _chatUnread > 99 ? '99+' : _chatUnread;
    cb.style.display = '';
  }
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

  const r = await apiPost('/api/clan-list', { token: authToken() });
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
  loadClan();
}

async function clanApply(clanId) {
  const r = await apiPost('/api/clan-apply', { token: authToken(), clanId });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  toast(`✅ ${esc(r.clanName || '')} 클랜에 가입을 신청했어요.`);
  loadClan();
}
async function clanCancelApply(clanId) {
  await apiPost('/api/clan-cancel-apply', { token: authToken(), clanId });
  loadClan();
}
async function clanDecide(idl, accept) {
  const r = await apiPost('/api/clan-decide', { token: authToken(), idl, accept });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (r.accepted) toast(`🎉 ${esc(r.nick || '')}님이 클랜에 합류했어요!`);
  loadClan();
}
function clanKick(idl, nick) {
  askConfirm({ icon: '⚠️', title: `${nick}님을 추방할까요?`, desc: '클랜에서 즉시 제외됩니다.', yes: '추방', no: '취소' },
    async () => { const r = await apiPost('/api/clan-kick', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.')); loadClan(); });
}
function clanTransfer(idl, nick) {
  askConfirm({ icon: '👑', title: `${nick}님에게 클랜장을 넘길까요?`, desc: '이후에는 클랜을 관리할 수 없게 됩니다.', yes: '위임', no: '취소' },
    async () => { const r = await apiPost('/api/clan-transfer', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
      toast(`👑 ${esc(nick)}님이 새 클랜장이 되었어요.`); loadClan(); });
}
function clanEditNotice() {
  const cur = (document.querySelector('.clan-notice')?.textContent || '').replace(/^📢\s*/, '');
  const n = prompt('클랜 공지 (최대 60자)', cur);
  if (n === null) return;
  apiPost('/api/clan-notice', { token: authToken(), notice: n }).then(r => {
    if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
    loadClan();
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
      _clanTab = 'my'; loadClan();
    });
}

// 로비 버튼의 알림 배지 (받은 친구요청 / 클랜 가입신청)
async function updateSocialBadges() {
  if (!myAccount) {
    for (const id of ['friendBadge', 'clanBadge']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    return;
  }
  const setBadge = (id, n) => {
    const e = document.getElementById(id); if (!e) return;
    e.textContent = n > 99 ? '99+' : n;
    e.style.display = n > 0 ? '' : 'none';
  };
  const [f, c] = await Promise.all([
    apiPost('/api/friends', { token: authToken() }),
    apiPost('/api/clan', { token: authToken() }),
  ]);
  const nIn = f.ok ? f.reqIn.length : 0;
  setBadge('friendBadge', nIn);
  const tb = document.getElementById('ftabBadge');
  if (tb) { tb.textContent = nIn; tb.style.display = nIn > 0 ? '' : 'none'; }
  const applicants = (c.ok && c.clan && c.clan.isOwner) ? c.clan.applicantCount : 0;
  setBadge('clanBadge', applicants + _chatUnread);   // 가입 신청 + 안 읽은 채팅
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
  const sc = document.getElementById('shopCoins');
  if (sc) sc.textContent = '🪙 ' + (res.profile.coins ?? 0);
  playSound('setwin');
}

// ── 상점 ────────────────────────────────────────────────────
const DYE_NAMES = { red:'빨강', blue:'파랑', green:'초록', orange:'주황', purple:'보라', cyan:'청록', pink:'핑크', lime:'라임', gold:'✨골드✨', rainbow:'🌈무지개🌈' };
let shopItems = null;
async function openShop() {
  if (!myAccount) { alert('상점은 로그인하면 이용할 수 있어요!\n게임에서 이기면 🪙 코인을 모을 수 있어요.'); openAuth('login'); return; }
  document.getElementById('shopMsg').textContent = '';
  document.getElementById('shopModal').classList.add('show');
  if (!shopItems) {
    try { shopItems = (await fetch('/api/shop').then(r => r.json())).items; } catch (_) { shopItems = null; }
  }
  renderShop();
}
function closeShop() { document.getElementById('shopModal').classList.remove('show'); }
const CBP = { back_night: 'cb-night', back_gold: 'cb-gold', back_obang: 'cb-obang', back_ruby: 'cb-ruby', back_galaxy: 'cb-galaxy',
              back_crystal: 'cb-crystal', back_obsidian: 'cb-obsidian', back_hanji: 'cb-hanji' , back_shard: 'cb-shard' };
const TBLP = { tbl_blue: 'tp-blue', tbl_purple: 'tp-purple', tbl_gold: 'tp-gold', tbl_forest: 'tp-forest', tbl_crystal: 'tp-crystal', tbl_obsidian: 'tp-obsidian', tbl_hanji: 'tp-hanji', tbl_shard: 'tp-shard' };
const CFP  = { face_neon: 'cfp-neon', face_classic: 'cfp-classic', face_gold: 'cfp-gold', face_crystal: 'cfp-crystal', face_obsidian: 'cfp-obsidian', face_hanji: 'cfp-hanji', face_shard: 'cfp-shard' };
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
  { name: '꾸미기·기타', types: ['dye', 'dye_rare', 'ticket'] },
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
const STAMP_CLS = { stamp_win: 'st-win', stamp_seal: 'st-seal', stamp_star: 'st-star', stamp_crown: 'st-crown' };
const STAMP_TEXT = { stamp_win: 'WIN', stamp_seal: '落札', stamp_star: '★', stamp_crown: '♔' };
const stampLabel = (id) => STAMP_TEXT[id] || 'WIN';
// 카드 놓을 때 파티클 · 승리 연출
const PLACE_CLS = { place_dust: 'pf-dust', place_spark: 'pf-spark', place_ember: 'pf-ember' };
const VFX_CLS = { vfx_confetti: 'vx-confetti', vfx_coinrain: 'vx-coin', vfx_thunder: 'vx-thunder', vfx_firework: 'vx-firework', vfx_shard: 'vx-shard' };

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
function renderShop() {
  document.getElementById('shopCoins').textContent = `🪙 ${myAccount ? myAccount.coins : 0}`;
  const list = document.getElementById('shopList');
  const vis = shopVisible();
  if (!vis.length) { list.innerHTML = '<div class="lb-empty">상점을 불러오지 못했어요. 잠시 후 다시 열어주세요.</div>'; return; }
  if (!shopSelId || !vis.some(x => x.id === shopSelId)) shopSelId = vis[0].id;
  list.innerHTML = '';
  // 종류별로 묶어 순서대로 놓는다. 예전엔 카탈로그에 적은 순서 그대로라
  // 카드백과 명패가 뒤섞여 뭘 고르는 화면인지 알기 어려웠다.
  const ordered = [];
  for (const g of SHOP_GROUPS) {
    const items = vis.filter((x) => g.types.includes(x.type));
    if (!items.length) continue;
    ordered.push({ head: g.name, count: items.length });
    for (const it of items) ordered.push(it);
  }
  // 어느 묶음에도 안 걸린 게 있으면 맨 뒤에 (새 종류를 넣고 분류를 깜빡했을 때)
  const known = new Set(SHOP_GROUPS.flatMap((g) => g.types));
  const rest = vis.filter((x) => !known.has(x.type));
  if (rest.length) { ordered.push({ head: '그 밖에', count: rest.length }); ordered.push(...rest); }

  ordered.forEach(it => {
    if (it.head) {
      const h = document.createElement('div');
      h.className = 'shop-head';
      h.textContent = it.head;
      list.appendChild(h);
      return;
    }
    const owned = myAccount.items && myAccount.items[it.id];
    const tile = document.createElement('div');
    tile.className = 'shop-tile' + (shopSelId === it.id ? ' sel' : '');
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
  if (r.dye) { renderShop(); dyeRoll(r.dye); }   // 염색약은 뽑기 연출
  else { renderShop(); msg.textContent = '✅ 구매 완료!'; playSound && playSound('setwin'); }
}
// 염색약 뽑기 연출 — 색이 촤르륵 지나가다 결과에 멈춤
const DYE_KEYS = ['red','orange','lime','green','cyan','blue','purple','pink','gold','rainbow'];
function dyeRoll(result) {
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
  const spin = setInterval(() => {
    const k = DYE_KEYS[i % DYE_KEYS.length]; i++;
    name.className = 'nc-' + k; name.textContent = DYE_NAMES[k] || k;
    playSound && playSound('flip');
    if (i >= ticks) {
      clearInterval(spin);
      name.className = 'nc-' + result; name.textContent = DYE_NAMES[result] || result;
      sub.innerHTML = rare ? '🎉 <b style="color:#ffd94a">대박!</b> 희귀 색이에요!' : '닉네임에 바로 적용됐어요!';
      if (rare) { name.classList.add('dye-pop'); playSound && playSound('victory'); }
      else playSound && playSound('setwin');
      setTimeout(() => ov.classList.remove('show'), rare ? 2600 : 1700);
    }
  }, 70);
  ov.onclick = () => { clearInterval(spin); ov.classList.remove('show'); };
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
};
// data-ico="🎒" 같은 표식을 직접 그린 아이콘으로 채운다
// ── 카드 딜 연출 ────────────────────────────────────────────────────────────
// 덱에서 한 장씩 날아와 자리에 앉는다. 시작 위치를 덱의 실제 화면 좌표로 잡아야
// "덱에서 나왔다"는 느낌이 나고, 고정 오프셋일 때처럼 뚝뚝 끊겨 보이지 않는다.
// 카드가 이미 최종 위치에 놓인 뒤에 불러야 한다(부채꼴 transform 반영 후).
function dealFromDeck(deckEl, cardEls, opts) {
  const o = opts || {};
  const stagger = o.stagger === undefined ? 85 : o.stagger;
  const dur = o.duration === undefined ? 460 : o.duration;
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
    el.style.animationDelay = (i * stagger) + 'ms';
    el.style.animationDuration = dur + 'ms';
    el.classList.add('dealing');
    el.addEventListener('animationend', () => {
      // 끝나면 정리 — 합성 레이어를 계속 붙들고 있으면 이후 렌더가 무거워진다
      el.classList.remove('dealing');
      el.style.animationDelay = ''; el.style.animationDuration = '';
      el.style.removeProperty('--dx'); el.style.removeProperty('--dy');
    }, { once: true });
  });
  return (cards.length - 1) * stagger + dur;
}

// ── 하단 탭바 ──────────────────────────────────────────────────────────────
// 미션·상점·친구·클랜을 로비 본문에서 빼내 여기로 모았다. 각 탭은 기존 모달을
// 그대로 연다 — 화면을 새로 만들지 않아 동작이 바뀌지 않는다.
const NAV_ACTIONS = {
  home:    () => { closeAllNavModals(); },
  mission: () => openMissions(),
  shop:    () => openShop(),
  gacha:   () => openGacha(),
  friends: () => openFriends(),
  clan:    () => openClan(),
  // 설정은 원래 게임 안에서만 열렸다. 언어를 바꾸려고 판을 시작해야 했다.
  settings: () => { document.body.classList.add('lobby-settings'); toggleSettings(true); },
};
function closeAllNavModals() {
  try { closeGacha(); } catch (_) {}
  try { closeMissions(); } catch (_) {}
  try { closeShop(); } catch (_) {}
  try { closeFriends(); } catch (_) {}
  try { closeClan(); } catch (_) {}
  try { toggleSettings(false); document.body.classList.remove('lobby-settings'); } catch (_) {}
}
function navGo(key) {
  const act = Object.prototype.hasOwnProperty.call(NAV_ACTIONS, key) ? NAV_ACTIONS[key] : null;
  if (!act) return;
  if (key !== 'home') closeAllNavModals();   // 탭끼리 겹쳐 열리지 않게
  act();
  navSync(key);
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
  for (const id of ['missionModal', 'shopModal', 'friendsModal', 'clanModal', 'gachaModal', 'settingsPanel']) {
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
function gachaTab(which) {
  const roll = which === 'roll';
  document.getElementById('gcTabRoll').classList.toggle('active', roll);
  document.getElementById('gcTabExch').classList.toggle('active', !roll);
  document.getElementById('gcPaneRoll').style.display = roll ? '' : 'none';
  document.getElementById('gcPaneExch').style.display = roll ? 'none' : '';
  if (!roll) renderExchange();
}

function renderExchange() {
  const box = document.getElementById('gcShop');
  if (!box) return;
  if (!_gachaInfo || !_gachaInfo.pool) { box.innerHTML = '<div class="gc-hint">목록을 불러오는 중…</div>'; return; }
  gachaWallet();
  const have = myAccount ? myAccount.shards || 0 : 0;
  const mine = (myAccount && myAccount.items) || {};
  // 살 수 있는 것 → 파편이 모자란 것 → 이미 가진 것 순. 목표가 눈에 먼저 들어오게.
  // 파편 전용품이 맨 앞. 여기서만 얻을 수 있으니 제일 먼저 보여야 한다.
  const rank = (p) => (mine[p.id] ? 4 : p.only ? 0 : have >= p.cost ? 1 : 2);
  const pool = _gachaInfo.pool.slice().sort((a, b) =>
    rank(a) - rank(b) || b.cost - a.cost || a.name.localeCompare(b.name));

  let html = '', lastSect = null;
  for (const p of pool) {
    const owned = !!mine[p.id], poor = !owned && have < p.cost;
    const sect = owned ? '이미 가진 것'
      : p.only ? '파편으로만 얻는 것'
      : poor ? '파편이 더 필요해요' : '지금 바꿀 수 있어요';
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
      toast(`«${esc(r.name)}» 을 얻었어요!`);
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
function openCreate() { closeModePanels(); document.getElementById('createModal').classList.add('show'); document.getElementById('roomNameInput').focus(); }
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
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

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
  } else if (p.guest) {
    body.innerHTML = `<span class="gp-rank">👤</span><span class="gp-nick">${esc(p.nick)}</span>`;
    if (stats) stats.innerHTML = `게스트 (기록 없음)`;
  } else {
    body.innerHTML = `<span class="gp-rank gp-art" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</span><span class="gp-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</span><span class="gp-lv">Lv.${p.level}</span>`;
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
        <div class="op-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</div>
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
      item.innerHTML = `<div class="rl-info"><div class="rl-name">${lock}${esc(r.name)}</div><div class="rl-host">👤 ${esc(r.host)}</div></div>`;
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
loadSample('cardPlace', '/card-place.mp3?v=1');
function playSample(key, vol = 0.9, rate = 1) {
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
function jcym(delay, freq, dur, vol) {   // 심벌 크래시/히트
  const t = AC.currentTime + delay;
  const n = Math.floor(AC.sampleRate * 0.5), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(); s.buffer = b;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.7;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
}
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
    case 'victory':[440,523,659,784].forEach((f,i)=>jbrass(f,i*.1,.16,.12));
                   jbrass(880,.4,.7,.16); [440,554,659,740].forEach(f=>tone(f,'sine',.08,.6,.42)); break;
    // 패배 — 뮤트 트럼펫 하강 + 마지막 음 처지는 벤드 (원래 버전)
    case 'defeat': jbrass(392,0,.4,.12); jbrass(349,.28,.4,.12); jbrass(294,.56,.9,.13,220); break;
    case 'deal':   tone(280,'sine',.05,.07); break;
    case 'bell':   [0,0.45].forEach(off => [1568,2093].forEach((f,i)=>tone(f,'sine',.2,1.2, off+i*.02))); break;
    case 'tick':   tone(1400,'square',.06,.05); break;
    // 세트 완성 — 재즈 6th로 마무리하는 밝은 상행
    case 'setwin': [523,659,784,880].forEach((f,i)=>jbrass(f,i*.08,.14,.11));
                   jbrass(1047,.32,.5,.14); [523,659,784,880].forEach(f=>tone(f,'sine',.06,.5,.34)); break;
    case 'ping':   tone(1046,'sine',.16,.16); tone(1568,'sine',.12,.22,.09); break;
    case 'emote':  tone(760,'sine',.1,.12); break;
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
function startBGM() {
  if (bgmOn) return;
  bgmOn = true;
  // AAC(m4a, 절반 용량) 우선 — 미지원 브라우저만 mp3 폴백. ?v 갱신 = 캐시 우회
  const canM4a = document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"');
  bgmAudio = new Audio(canM4a ? '/bgm.m4a?v=3' : '/bgm.mp3?v=2');   // v3 = 80kbps 재인코딩
  bgmAudio.loop = true;
  bgmAudio.crossOrigin = 'anonymous';
  try {
    AC.resume();
    const src = AC.createMediaElementSource(bgmAudio);
    bgmGain = AC.createGain();
    bgmGain.gain.value = bgmOff ? 0 : BGM_VOL;
    src.connect(bgmGain); bgmGain.connect(AC.destination);
  } catch (e) { bgmAudio.volume = bgmOff ? 0 : BGM_VOL; }   // 폴백: 엘리먼트 볼륨
  const tryPlay = () => bgmAudio.play().catch(() => {});
  tryPlay();
  if (bgmAudio.paused) {   // 자동재생 차단 → 첫 상호작용에서 재생
    const kick = () => { try { AC.resume(); } catch (_) {} tryPlay(); document.removeEventListener('pointerdown', kick); };
    document.addEventListener('pointerdown', kick, { once: true });
  }
}
// 배경음악을 멈춘다. 2인전은 나갈 때 페이지를 통째로 새로고침해서 저절로
// 꺼졌는데, 다인전은 화면만 숨기므로 로비로 돌아가도 계속 흘렀다.
function stopBGM() {
  if (!bgmAudio) { bgmOn = false; return; }
  try { bgmAudio.pause(); bgmAudio.currentTime = 0; } catch (_) {}
  try { if (bgmGain) bgmGain.disconnect(); } catch (_) {}
  bgmAudio = null; bgmGain = null; bgmOn = false;
}

// ── 인게임 설정 패널 (배경음악 / 효과음 / 가이드) ──
let guideOff = localStorage.getItem('ff_guide') === 'off';
function applySettings() {   // 저장된 상태를 화면·오디오에 반영
  setBgmVolume(bgmOff ? 0 : BGM_VOL);
  const sb = document.getElementById('statusBar'); if (sb) sb.style.display = guideOff ? 'none' : '';
  const set = (id, on) => { const t = document.getElementById(id); if (t) t.classList.toggle('on', on); };
  set('togBgm', !bgmOff); set('togSfx', !sfxOff); set('togGuide', !guideOff);
  const cur = (window.FF && FF.lang()) || 'ko';
  document.querySelectorAll('.sp-segb[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === cur));
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


// 칩 — 숫자만 띄우면 판이 얼마나 큰지 눈에 안 들어온다.
// 큰 단위부터 헐어서 무더기로 만든다. 무더기 하나가 요소 하나다(4인 × 여러 단위라
// 칩마다 요소를 만들면 금세 수백 개가 되고, 매 상태마다 다시 그린다).
const CHIP_UNITS = [500, 100, 50, 10, 1];
function chipPiles(amount) {
  let left = Math.max(0, Math.floor(amount || 0));
  const out = [];
  for (const v of CHIP_UNITS) {
    if (left < v) continue;
    const n = Math.floor(left / v);
    left -= n * v;
    out.push({ v, n });
  }
  return out;
}
function chipsEl(amount, cls) {
  const box = document.createElement('div');
  box.className = 'chips' + (cls ? ' ' + cls : '');
  for (const { v, n } of chipPiles(amount)) {
    const c = document.createElement('div');
    c.className = 'chip' + (n > 1 ? ' s' + Math.min(4, n) : '');
    c.dataset.v = v;
    c.textContent = n > 1 ? '×' + n : '';
    c.title = `${v} × ${n}`;
    box.appendChild(c);
  }
  return box;
}

// 족보 사다리 — 이름만 띄우면 세다는 건지 약하다는 건지 알 수 없다.
// 앞자리 합으로 정해지는 8칸 중 몇 번째인지를 칸으로 보여준다.
const MINI_TIERS = [
  { sum: 4,  name: '지배자' }, { sum: 5,  name: '최고급' },
  { sum: 6,  name: '중간계' }, { sum: 7,  name: '중간계' },
  { sum: 8,  name: '중간계' }, { sum: 9,  name: '중간계' },
  { sum: 10, name: '최하위' }, { sum: 12, name: '꼴찌' },
];

function miniEvalBox(ev, round) {
  if (!ev) {
    return '<div class="mn-ev-hint" style="text-align:center">'
         + (round === 1 ? '아직 한 장 — 두 번째 장을 받아야 족보가 나옵니다.' : '') + '</div>';
  }
  // 왼쪽이 강한 쪽. 스나이퍼는 자기 자리가 아니라 "잡아먹는 자리"를 칠한다 —
  // 스나이퍼의 세기는 자기 합이 아니라 누구를 잡느냐로 정해지기 때문이다.
  const beats = ev.sniper === 2 ? [0, 1] : ev.sniper === 1 ? [1] : [];
  const rungs = MINI_TIERS.map((_, i) => {
    const cls = ev.sniper > 0 ? (beats.includes(i) ? 'snipe' : '') : (i === ev.tier ? 'on' : '');
    return `<span class="mn-rung ${cls}"></span>`;
  }).join('');
  const hint = ev.sniper === 2
    ? '거울쌍 10 — 지배자·최고급을 모두 잡습니다. (칠한 자리를 잡아먹어요)'
    : ev.sniper === 1
      ? '10-10 스나이퍼 — 최고급만 잡습니다. 지배자에게는 집니다.'
      : `← 강함 · 여덟 자리 중 ${ev.tier + 1}번째 · 약함 →`;
  return `<div class="mn-ev-top"><span class="mn-ev-name">${esc(ev.name)}</span>`
       + `<span class="mn-ev-sum">앞자리 합 ${ev.frontSum} · 뒷자리 합 ${ev.backSum}</span></div>`
       + `<div class="mn-ladder">${rungs}</div>`
       + `<div class="mn-ev-hint">${esc(hint)}</div>`;
}

// 버튼에 붙는 이름과 금액. 금액은 서버가 계산해 보낸 값을 그대로 보여만 준다.
const MINI_LABEL = {
  check: ['체크', 'out'], ping: ['삥', ''], quarter: ['쿼터', ''], half: ['하프', ''],
  ttadang: ['따당', ''], allin: ['올인', 'big'], call: ['콜', 'go'], die: ['다이', 'out'],
};
const MINI_ORDER = ['check', 'ping', 'quarter', 'half', 'ttadang', 'call', 'allin', 'die'];
const MINI_ACT_KO = { check: '체크', ping: '삥', quarter: '쿼터', half: '하프',
  ttadang: '따당', allin: '올인', call: '콜', die: '다이' };

function miniPaint(v) {
  miniState = v;
  const box = document.getElementById('mini');
  if (!box.classList.contains('on')) { box.classList.add('on'); box.style.display = 'flex'; }

  // 남들 — 내 자리(0)는 아래에 따로 그린다
  const top = document.getElementById('mnSeats');
  top.innerHTML = '';
  for (let i = 1; i < v.n; i++) {
    const st = v.seats[i];
    const d = document.createElement('div');
    d.className = 'mn-seat2' + (st.turn && !v.over ? ' turn' : '') + (st.alive ? '' : ' dead')
                + (v.over && v.winner === i ? ' win' : '');
    const nm = document.createElement('div');
    nm.className = 'mn-nm';
    nm.innerHTML = `${esc((v.names && v.names[i]) || '상대')}`
                 + (st.first ? '<span class="mn-first">선</span>' : '');
    const cards = document.createElement('div');
    cards.className = 'mn-cards';
    if (st.cards) st.cards.forEach((c) => { const e = makeCard(c); e.classList.add('anim-reveal'); cards.appendChild(e); });
    else for (let k = 0; k < st.count; k++) cards.appendChild(makeCard(null));
    const stk = document.createElement('div');
    stk.className = 'mn-stk';
    stk.textContent = st.alive ? `🪙 ${st.stack}` : '다이';
    const chip = document.createElement('div');
    chip.className = 'mn-chip' + (st.roundBet > 0 && st.alive ? ' on' : '');
    chip.textContent = `🪙 ${st.roundBet}`;
    const stack = chipsEl(st.alive ? st.roundBet : 0, 'mini');
    const tag = document.createElement('div');
    tag.className = 'mn-act-tag';
    tag.textContent = st.eval ? st.eval.name : '';
    d.append(nm, cards, stk, stack, chip, tag);
    top.appendChild(d);
  }

  document.getElementById('mnPotBig').textContent = `🪙 ${v.pot}`;
  // 판돈이 늘었을 때만 떨어지는 연출을 준다 — 매번 튀면 눈이 아프다
  const potBox = document.getElementById('mnPotChips');
  const grew = v.pot > (miniPrevPot || 0);
  potBox.innerHTML = '';
  const pile = chipsEl(v.pot, 'big');
  if (grew) for (const c of pile.children) c.classList.add('drop');
  potBox.appendChild(pile);
  miniPrevPot = v.pot;
  document.getElementById('mnRound').textContent =
    v.round === 1 ? '첫 번째 배팅' : '두 번째 배팅';

  const me = v.seats[v.me];
  const plate = document.getElementById('mnMePlate');
  plate.className = 'mn-meplate' + (v.turn === v.me && !v.over ? ' turn' : '');
  plate.innerHTML = `<b>${esc((v.names && v.names[v.me]) || '나')}</b>`
    + (me.first ? '<span class="mn-first">선</span>' : '')
    + `<span class="mn-stk">🪙 ${me.stack}</span>`
    + (me.roundBet > 0 ? `<span class="mn-chip on">🪙 ${me.roundBet}</span>` : '');
  if (me.roundBet > 0) plate.appendChild(chipsEl(me.roundBet, 'mini'));
  const my = document.getElementById('mnMyCards');
  my.innerHTML = '';
  (me.cards || []).forEach((c) => my.appendChild(makeCard(c)));
  document.getElementById('mnEval').innerHTML = miniEvalBox(v.myEval, v.round);

  const st0 = document.getElementById('mnStatus');
  if (v.over) st0.textContent = v.reason === 'fold' ? '남은 사람이 가져갑니다.' : '공개!';
  else if (v.turn === v.me) st0.textContent = `내 차례 · 내 밑천 🪙${me.stack}${v.toCall ? ` · 받을 돈 🪙${v.toCall}` : ''}`;
  else st0.textContent = `${esc((v.names && v.names[v.turn]) || '상대')} 님이 고민하고 있어요…`;

  // 내 차례 제한 시간 — 서버가 넘겨주는 시각까지 센다
  clearInterval(miniClock); miniClock = null;
  if (!v.over && v.turn === v.me && v.deadline) {
    const tick = () => {
      const left = Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000));
      const el = document.getElementById('mnStatus');
      if (!el || !miniState || miniState.turn !== miniState.me) { clearInterval(miniClock); return; }
      el.textContent = `내 차례 · ${left}초 · 내 밑천 🪙${me.stack}`
        + (v.toCall ? ` · 받을 돈 🪙${v.toCall}` : '');
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
    b.innerHTML = `${label}${amt ? `<small>🪙 ${amt}</small>` : ''}`;
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
window.miniNext = function () {
  document.getElementById('miniOverModal').classList.remove('show');
  socket.emit('mini_next');
};
window.miniStand = function () {
  document.getElementById('miniOverModal').classList.remove('show');
  socket.emit('mini_leave');
};
function miniHide() {
  clearInterval(miniClock); miniClock = null; miniPrevPot = 0;
  document.getElementById('miniOverModal').classList.remove('show');
  const box = document.getElementById('mini');
  box.classList.remove('on'); box.style.display = 'none';
  miniState = null; miniSitting = false;
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
  }
  document.getElementById('miniOverModal').classList.remove('show');
  miniPaint(v);
});
socket.on('mini_error', (m) => toast('⚠️ ' + esc(m || '')));

socket.on('mini_over', (r) => {
  // 마지막 수와 동시에 까면 뭘 보고 졌는지 눈이 못 따라온다 — 한 박자 두고 뒤집는다
  const showRes = () => {
    miniPaint(r.view);
    const res = document.getElementById('mnRes');
    res.textContent = r.won ? '승리!' : '패배';
    res.className = 'mn-res ' + (r.won ? 'win' : 'lose');
    document.getElementById('mnNet').textContent =
      r.net > 0 ? `🪙 +${r.net}` : r.net < 0 ? `🪙 ${r.net}` : '🪙 0';
    document.getElementById('mnOverWhy').textContent =
      r.view.reason === 'fold' ? '모두 죽어서 끝난 판입니다. 패는 안 깝니다.' : '';
    document.getElementById('mnNextBtn').style.display =
      (r.canGo && r.view.mode === 'solo') ? '' : 'none';
    document.getElementById('mnOverWhy').textContent =
      (r.view.mode === 'solo' ? '' : (r.canGo ? '곧 다음 판이 시작됩니다.' : '밑천이 떨어졌어요.'))
      || (r.view.reason === 'fold' ? '모두 죽어서 끝난 판입니다. 패는 안 깝니다.' : '');
    document.getElementById('miniOverModal').classList.add('show');
  };
  if (r.view.reason === 'showdown') { miniPaint(r.view); setTimeout(showRes, 900); }
  else showRes();
});

socket.on('mini_stood', (r) => {
  miniHide();
  document.getElementById('mnStoodNet').textContent =
    `🪙 ${r.back} 회수 (${r.net > 0 ? '+' : ''}${r.net})`;
  document.getElementById('mnStoodWhy').textContent = r.why || '';
  document.getElementById('miniStoodModal').classList.add('show');
  if (myAccount && typeof r.coins === 'number') { myAccount.coins = r.coins; renderAccount(); }
});

// 족보표 — 지금 쥔 패가 어디쯤인지 표에서 바로 짚어 준다
window.miniRank = function (show) {
  const box = document.getElementById('miniRankModal');
  if (!show) return box.classList.remove('show');
  const ev = miniState && miniState.myEval;
  const rows = MINI_TIERS.map((t, i) => {
    const me = ev && ev.sniper === 0 && ev.tier === i;
    // "지금 내 패" 를 문장에 이어 붙이면 사전 열쇠가 즉석 문자열이 되어 번역이 끊긴다.
    // 통째로 열쇠가 될 수 있게 따로 떼어 둔다.
    return `<div class="mn-tr ${me ? 'me' : ''}"><i>${i + 1}</i><b>${esc(t.name)}</b>`
         + `<em>앞자리 합 ${t.sum}</em>${me ? '<em class="mn-now">지금 내 패</em>' : ''}</div>`;
  });
  const sn = ev && ev.sniper > 0;
  rows.push(`<div class="mn-tr sn ${sn ? 'me' : ''}"><i>🎯</i><b>스나이퍼</b>`
          + `<em>앞·뒤 합이 모두 10</em>${sn ? '<em class="mn-now">지금 내 패</em>' : ''}</div>`);
  document.getElementById('mnTable').innerHTML = rows.join('');
  box.classList.add('show');
};

window.toggleRulesMini = function (show) {
  document.getElementById('rulesMiniModal').style.display = show ? 'flex' : 'none';
};

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
  // 아직 참가 전이면 안내 화면에 다음 개최 시각만 적어 준다
  if (!d.joined) {
    tourFace('intro');
    const note = document.getElementById('tourNextAt');
    if (note) note.textContent = d.running
      ? '지금은 대회가 진행 중이에요. 다음 회차는 ' + tourClock(d.startAt) + ' 시작'
      : '다음 대회는 ' + tourClock(d.startAt) + ' 시작 (' + tourLeftText(d.leftMs) + ' 뒤)';
    return;
  }
  tourFace('wait');
  tourLeftMs = d.leftMs;
  const paint = () => {
    document.getElementById('tourLeft').textContent = tourLeftText(tourLeftMs);
    tourLeftMs -= 250;
  };
  clearInterval(tourTick); paint(); tourTick = setInterval(paint, 250);

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
  document.getElementById('tourWaitNote').textContent =
    `${d.count}/${d.size}명 · 시작할 때 빈 자리는 AI 가 채워요`;
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
window.toggleGameChat = function (force) {
  const p = document.getElementById('gameChat'); if (!p) return;
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
  if (!show) return;
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
    return `<button class="gc-frow" onclick="gcOpenTalk('${esc(f.idl)}')">${esc(f.nick)}${tail}</button>`;
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
  const box = document.getElementById('gcClanMsgs');
  box.innerHTML = '<div class="gc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/clan-chat', { token: authToken() });
  if (!r || r.error) { box.innerHTML = `<div class="gc-empty">${esc((r && r.error) || '불러오기 실패')}</div>`; return; }
  gcPaint(box, r.messages, true);
}

// 메시지 그리기. 클랜은 누가 썼는지 이름이 필요하고, 1:1 은 필요 없다.
function gcPaint(box, msgs, showName) {
  if (!msgs || !msgs.length) { box.innerHTML = '<div class="gc-empty">아직 대화가 없어요</div>'; return; }
  box.innerHTML = msgs.map((m) =>
    `<div class="gc-m${m.mine ? ' mine' : ''}">` +
    (showName && !m.mine ? `<span class="gc-who">${esc(m.nick)}</span>` : '') +
    `${esc(m.text)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

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
  const box = document.getElementById(clan ? 'gcClanMsgs' : 'gcFriendMsgs');
  const empty = box.querySelector('.gc-empty'); if (empty) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', `<div class="gc-m mine">${esc(text)}</div>`);
  box.scrollTop = box.scrollHeight;
};

// 안 읽음 — 버튼의 점과 친구 목록 배지에 쓴다
async function gcRefreshUnread() {
  if (!myAccount) { gcUnread = {}; gcPaintDot(); return; }
  const r = await apiPost('/api/dm-unread', { token: authToken() });
  gcUnread = (r && r.ok && r.by) ? r.by : {};
  gcPaintDot();
}
function gcPaintDot() {
  const on = Object.keys(gcUnread).length > 0;
  for (const id of ['chatDot', 'chatDot4']) {
    const d = document.getElementById(id); if (d) d.style.display = on ? '' : 'none';
  }
}
// 새 1:1 메시지가 도착
socket.on('dm', ({ from, msg }) => {
  if (gameChatOpen() && gcTab === 'friend' && gcWith === from) {
    const box = document.getElementById('gcFriendMsgs');
    const empty = box.querySelector('.gc-empty'); if (empty) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', `<div class="gc-m">${esc(msg.text)}</div>`);
    box.scrollTop = box.scrollHeight;
    apiPost('/api/dm', { token: authToken(), idl: from });   // 읽음 처리
    return;
  }
  gcUnread[from] = (gcUnread[from] || 0) + 1;
  gcPaintDot();
  if (gameChatOpen() && gcTab === 'friend' && !gcWith) gcLoadFriends();
});
// 클랜 메시지도 열려 있으면 바로 붙인다
socket.on('clan_chat', ({ msg }) => {
  if (!gameChatOpen() || gcTab !== 'clan') return;
  const box = document.getElementById('gcClanMsgs');
  const empty = box.querySelector('.gc-empty'); if (empty) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend',
    `<div class="gc-m"><span class="gc-who">${esc(msg.nick)}</span>${esc(msg.text)}</div>`);
  box.scrollTop = box.scrollHeight;
});

// ── 게임 설명서 ─────────────────────────────────────────────
// 다인전은 덱·분배·클로즈가 달라 설명서를 따로 둔다. 판을 보고 알아서 고른다 —
// 다인전 화면에서 2인전 설명이 뜨면 "내가 보는 판" 과 안 맞아 더 헷갈린다.
function toggleRules(show) {
  if (show && document.body.classList.contains('quad4')) return toggleRules4(true);
  document.getElementById('rulesModal').style.display = show ? 'flex' : 'none';
}
function toggleRules4(show) {
  document.getElementById('rules4Modal').style.display = show ? 'flex' : 'none';
}

// ── ESC 로 닫기 ─────────────────────────────────────────────
// 배경 클릭으로는 닫히는데 ESC 는 어디서도 안 먹어 일관성이 없었다.
// 각 모달의 전용 닫기 함수를 부른다 — 매칭 취소처럼 뒷정리가 필요한 게 있어서
// 단순히 show 클래스만 떼면 서버 상태와 어긋난다.
const ESC_TARGETS = [
  ['rulesModal',   () => toggleRules(false)],
  ['rules4Modal',  () => toggleRules4(false)],
  ['rulesMiniModal', () => toggleRulesMini(false)],
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
  ['createModal',  () => closeCreate()],
  ['codeModal',    () => closeCode()],
  ['itemUseModal', () => closeItemUse()],
  ['matchModal',   () => cancelMatch()],       // 대기열에서도 빼야 한다
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
  const anchor = side === 'me'
    ? document.getElementById('emoteBtn')
    : document.getElementById('oppProfile');   // 상대 것도 프로필 쪽 사이드에 (중앙 X)
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
  document.getElementById('cfNo').textContent = no;
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
  askConfirm({ icon: '🚪', title: '게임에서 나갈까요?', desc: isVsBot ? 'AI 대전은 언제든 다시 시작할 수 있어요.' : '진행 중인 게임은 몰수패로 처리될 수 있어요.', yes: '나가기', no: '계속하기' },
    () => { socket.emit('leave_room'); goLobby(); });
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
  document.getElementById(m === 'solo' ? 'soloModal' : 'multiModal').classList.add('show');
}
function closeModePanels() {
  document.getElementById('soloModal').classList.remove('show');
  document.getElementById('multiModal').classList.remove('show');
}
function soloPlay(d) { closeModePanels(); difficulty = d; createRoom(true); }

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
        <div>5️⃣ 이렇게 <b>낙찰받은 카드로만</b> 세트 완성 (손패는 세트 불인정!)</div>
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
  difficulty = 'easy';
  createRoom(true);
}
// 읽는 도중 다음 설명이 밀고 들어오지 않게 — 열려 있으면 큐에 쌓고, '알겠어요' 후 표시
let tutQueue = [], tutOpen = false;
function tutTick() {
  if (!tutorial || !state) return;
  for (const st of TUT_STEPS) {
    if (tutSeen[st.id]) continue;
    if (st.when(state)) {
      tutSeen[st.id] = true;
      if (tutOpen) { tutQueue.push(st); tutGlowFor(st); }   // 글씨는 기다리되, 반짝임은 바로 (막히지 않게)
      else tutShow(st);
      return;
    }
  }
}
function tutShow(st) {
  const box = document.getElementById('tutBox');
  // 튜토리얼은 한 문장 안에 <b> 가 섞여 있어, 글자 조각마다 번역하면 어순이 깨진다.
  // 문장을 통째로 바꾼 뒤 넣는다(사전에 문장 전체가 들어 있다).
  const T = (x) => (window.FF ? FF.t(x) : x);
  const text = T(typeof st.text === 'function' ? st.text(state) : st.text);
  document.getElementById('tutText').innerHTML = text
    + T(st.cards || '')
    + (st.act ? `<div class="tut-do">👉 ${T(st.act)}</div>` : '');
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
  if (tutQueue.length) return tutShow(tutQueue.shift());   // 밀린 설명이 있으면 이어서 (보류 유지)
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
let sharedCode = '';
socket.on('room_created', ({ roomId, name }) => {
  sharedCode = roomId;
  closeCreate();
  document.getElementById('lobbyMain').style.display = 'none';
  document.getElementById('waitCard').style.display = 'flex';
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
function cancelWait() { clearSession(); fastReload(); }

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
socket.on('game_start', ({ vsBot, difficulty: diff, roomId, nicks, profiles, spectate, itemMode, tour }) => {
  isTourMatch = !!tour;          // 대회 경기면 끝난 뒤 대진표로 돌아간다
  isVsBot = vsBot;
  isSpec = !!spectate;
  isItemMode = !!itemMode;
  document.body.classList.toggle('item-mode', isItemMode);   // 아이템전 전용 톤
  gameNicks = nicks || null;
  gameProfiles = profiles || null;
  if (roomId && !isSpec) saveSession(roomId);   // 관전은 재접속 세션 저장 안 함
  // 관전 모드: 이모트 숨김 + 관전 배너
  const ew = document.getElementById('emoteWrap'); if (ew) ew.style.display = isSpec ? 'none' : '';
  // 재대결/매칭/재접속 대비 초기화
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('matchModal').classList.remove('show');
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
  startBGM();
});
let drewNow = false;
socket.on('state_update', s => {
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
  if (mine && !prevMyAction && document.hidden) { startTitleBlink(); playSound('ping'); }
  if (!mine) stopTitleBlink();
  prevMyAction = mine;
});
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
socket.on('game_over', ({ winner, setKind, timeout, byProgress, forfeit, myIndex: mi, spec, nicks }) => {
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
    playSound('victory');
    if (setKind && !byProgress && !forfeit) { celebrateSet('myAcq', setKind); playSound('setwin'); delay = 1400; }
    else animateWinCards();
  } else {
    title.textContent = '패배...'; title.style.color = '#9a8a90'; title.style.textShadow = 'none';
    desc.textContent = forfeit ? '접속이 끊겨 몰수패 처리됐어요.'
      : timeout ? '시간 초과...'
      : byProgress ? '상대가 세트에 더 가까웠어요.'
      : `상대가 ${setKind}짜리 세트를 완성했어요.`;
    playSound('defeat');
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
  if (isTourMatch && goBtns) {
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
  }
  setTimeout(() => { document.getElementById('gameOver').style.display = 'flex'; showRewards(); }, delay);
});

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
  if (player === myIndex) playSound('bell');
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
const TABLE_CLS = { tbl_blue: 'tbl-blue', tbl_purple: 'tbl-purple', tbl_gold: 'tbl-gold', tbl_forest: 'tbl-forest', tbl_crystal: 'tbl-crystal', tbl_obsidian: 'tbl-obsidian', tbl_hanji: 'tbl-hanji', tbl_shard: 'tbl-shard' };
const FACE_CLS  = { face_neon: 'cf-neon', face_classic: 'cf-classic', face_gold: 'cf-gold', face_crystal: 'cf-crystal', face_obsidian: 'cf-obsidian', face_hanji: 'cf-hanji', face_shard: 'cf-shard' };
function applyMySkins() {
  // 경기장이 여럿이다(2인전·미니게임). 하나만 칠하면 미니게임만 맨 테이블이 된다.
  for (const id of ['game', 'mini']) {
    const g = document.getElementById(id); if (!g) continue;
    // 벗길 목록을 손으로 적으면 새 스킨을 넣을 때마다 빠뜨린다 —
    // 실제로 파편 테이블·앞면이 여기서 누락돼 갈아입어도 예전 스킨이 남았다.
    // 표에서 그대로 끌어오면 추가만 해도 자동으로 따라온다.
    g.classList.remove(...Object.values(TABLE_CLS), ...Object.values(FACE_CLS));
    const p = myAccount;
    if (p && TABLE_CLS[p.table]) g.classList.add(TABLE_CLS[p.table]);
    if (p && FACE_CLS[p.cardFace]) g.classList.add(FACE_CLS[p.cardFace]);
  }
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
const TAP_SLOP = 12;
function onTap(el, fn) {
  let sx = 0, sy = 0, live = false;
  el.style.touchAction = 'manipulation';
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;   // 오른쪽 버튼 무시
    live = true; sx = e.clientX; sy = e.clientY;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  el.addEventListener('pointercancel', () => { live = false; });
  el.addEventListener('pointerup', (e) => {
    if (!live) return;
    live = false;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_SLOP) return;   // 끌었으면 탭이 아니다
    e.preventDefault();
    fn(e);
  });
  // 포인터 이벤트가 없는 옛 브라우저용
  if (!window.PointerEvent) el.addEventListener('click', fn);
}
window.onTap = onTap;   // 다인전(client4)도 같은 처리를 쓴다

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
  rank.className = 'c-rank';
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
    onTap(el, () => { playSound('select'); opts.onClick(card, el); });
  }
  return el;
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
    if (a?.myBid) return (isVsBot && !a.oppBidSubmitted) ? think('AI 배팅 중') : '배팅 완료 — 대기 중...';
    if (myTurnToBid) return (a && a.auctionType === 'closed' ? '🙈 클로즈(배팅 공개)' : '👁 오픈(배팅 비밀)') + ' — 손패에서 배팅 카드 선택!';
    return isVsBot ? think('진행자(AI) 먼저 배팅 중') : '진행자가 먼저 배팅합니다 — 대기 중';
  };
  const firstNick = () => (gameNicks && gameNicks[s.auctioneer - 1]) || (s.auctioneer === s.myIndex ? '나' : '상대');
  const msgs = {
    pick:        s.pick && s.pick.myChoice != null ? (isVsBot ? '' : '상대가 고르는 중...') : '🃏 카드를 골라 선공을 정하세요!',
    pick_reveal: `⚡ ${firstNick()} 선공!`,
    draw:        mine ? '🂠 중앙덱을 클릭해 카드를 뽑으세요' : (isVsBot ? think('AI가 뽑는 중') : '상대가 카드를 뽑는 중...'),
    offer:       mine ? '중앙 카드 공개 — 출품할 카드를 선택하세요' : (isVsBot ? think('AI 생각 중') : '상대가 출품 중...'),
    choose_type: mine ? '경매 방식 선택 — 출품카드는 다른 손패 클릭 시 교체돼요' : (isVsBot ? think('AI 생각 중') : '상대가 방식 선택 중...'),
    bidding:     biddingMsg(),
    showdown: '⚔️ 배팅 완료 — 곧 공개!', reveal: '결과 공개!', settled: '카드 정산 중…', game_over: '게임 종료',
  };
  const bar = document.getElementById('statusBar');
  let msg = msgs[s.phase] ?? s.phase;
  if (isSpec) {   // 관전 문구 (중립 시점)
    const an = (gameNicks && gameNicks[s.auctioneer - 1]) || '진행자';
    msg = ({ pick: '👁 선공 뽑는 중…', pick_reveal: `⚡ ${an} 선공!`, draw: `👁 ${an} 카드 뽑는 중`,
      offer: `👁 ${an} 출품 중`, choose_type: `👁 ${an} 경매 방식 선택 중`, bidding: '👁 배팅 중…',
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
  for (let i = 0; i < layers; i++) {
    const b = makeCard(null); b.classList.add('deck-layer');
    b.style.transform = `translate(${i * 2}px, ${-i * 2}px)`;
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
        cardEl.addEventListener('click', () => { playSound('flip'); socket.emit('pick_card', { slot }); });
      }
      if (isMine) cardEl.style.outline = '2px solid var(--gold)';
      wrap.appendChild(cardEl);
      items.appendChild(wrap);
    });
    return;
  }

  if (!s.auction) { badge.textContent = ''; badge.className = ''; return; }

  const a = s.auction, mine = s.auctioneer === s.myIndex, atype = a.auctionType, isReveal = s.phase === 'reveal';
  if (atype === 'open')   { badge.textContent = '오픈';   badge.className = 'type-badge open'; }
  else if (atype === 'closed') { badge.textContent = '클로즈'; badge.className = 'type-badge closed'; }
  else { badge.textContent = ''; badge.className = ''; }

  // 'draw' 단계엔 중앙 카드 미공개 (덱 스택이 초점)
  if (s.phase === 'draw') return;

  items.appendChild(slotEl('중앙 카드', a.centerCard, { animate: drewNow, draw: drewNow }));
  if (s.phase !== 'offer') {
    const plus = document.createElement('span'); plus.className = 'vs-tag'; plus.textContent = '+';
    items.appendChild(plus);
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
    const bo = document.createElement('button'); bo.className = 'btn btn-gold btn-sm'; bo.textContent = '오픈 경매';
    bo.title = '경매품 공개 · 배팅 비공개'; bo.onclick = () => { playSound('card'); socket.emit('choose_auction', { type: 'open' }); };
    const bc = document.createElement('button'); bc.className = 'btn btn-ink btn-sm'; bc.textContent = '클로즈 경매';
    bc.title = '경매품 비공개 · 배팅 공개'; bc.onclick = () => { playSound('card'); socket.emit('choose_auction', { type: 'closed' }); };
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
  }
  btn.textContent = `${selectedBidCard.kind}번 (${selectedBidCard.grade}등급) 배팅 확정`;
  btn.onclick = () => {
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
  const sig = hand.map(c => c.id).join(',') + '|' + (offer ? 'o' : '') + (bidding ? 'b' : '');
  if (lastSig.hand === sig) { paintBidSel(); return; } lastSig.hand = sig;
  const deal = needsDeal && hand.length >= 6;   // 첫 손패 완성 시 딜 모션
  el.innerHTML = '';
  hand.forEach((card, i) => {
    let cardEl;
    if (offer)
      cardEl = makeCard(card, { selectable: true, onClick: (c, el) => {
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
      cardEl = makeCard(card, { selectable: true, selected: selectedBidCard?.id === card.id, onClick: c => { selectedBidCard = selectedBidCard?.id === c.id ? null : c; paintBidSel(); } });
    else
      cardEl = makeCard(card);
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(cardEl); el.appendChild(slot);
  });
  fanRow(el, false);
  if (deal) {
    needsDeal = false;
    // 부채꼴을 잡은 뒤에 딜을 건다 — 그래야 각 카드의 최종 위치를 알 수 있다
    const STAGGER = 85;
    dealFromDeck(document.getElementById('deckStack'), el.querySelectorAll('.card'), { stagger: STAGGER });
    // 사운드도 같은 간격으로 — 예전엔 75ms 라 화면(70ms)과 조금씩 어긋났다
    for (let i = 0; i < hand.length; i++) setTimeout(() => playSound('deal'), 40 + i * STAGGER);
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
