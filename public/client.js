const socket = io();
let state = null, myIndex = null, selectedBidCard = null;
let isVsBot = false, prevPhase = null, difficulty = 'hard';
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
socket.on('connect', () => {
  setConn('서버 연결됨', 'ok');
  setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400);
  // 재접속 or 초대 링크 처리
  const sess = localStorage.getItem('ff_sess');
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (sess)          socket.emit('rejoin', { roomId: sess, pid: PID });
  else if (urlRoom)  socket.emit('join_room', { roomId: urlRoom.toUpperCase(), pid: PID });
});
socket.on('disconnect', () => setConn('연결 끊김 — 재접속 중…', 'bad'));
socket.on('connect_error', (e) => { setConn('서버 연결 실패', 'bad'); console.error('socket connect_error:', e && e.message); });
socket.on('rejoin_failed', () => { clearSession(); });
socket.on('opp_disconnected', () => setConn('상대 연결 끊김 — 재접속 대기 중…', 'bad'));
socket.on('opp_reconnected', () => { setConn('상대 재접속됨', 'ok'); setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400); });

// ── 난이도 선택 ─────────────────────────────────────────────
document.getElementById('diffRow').addEventListener('click', e => {
  const b = e.target.closest('.diff-btn'); if (!b) return;
  document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  difficulty = b.dataset.diff;
});

// ── 사운드 (Web Audio) ──────────────────────────────────────
const AC = new (window.AudioContext || window.webkitAudioContext)();
function tone(freq, type, vol, dur, delay = 0) {
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
}
let soundOff = false;   // 마스터 음소거 (BGM + 효과음)
function playSound(n) {
  if (soundOff) return;
  try { AC.resume(); } catch(_) {}
  switch (n) {
    case 'select': tone(900,'sine',.06,.08); break;
    case 'place':  tone(320,'triangle',.12,.12); tone(240,'triangle',.08,.1,.06); break;
    case 'flip':   tone(520,'sine',.1,.1); tone(680,'sine',.08,.09,.08); break;
    case 'reveal': tone(440,'sawtooth',.06,.05); tone(660,'sine',.14,.18,.06); tone(880,'sine',.1,.2,.15); break;
    case 'special':[880,1180,1480,988].forEach((f,i)=>tone(f,'square',.1,.15,i*.09)); break;
    case 'victory':[523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',.2,.3,i*.08)); break;
    case 'defeat': [440,370,311,262].forEach((f,i)=>tone(f,'triangle',.14,.35,i*.12)); break;
    case 'deal':   tone(280,'sine',.05,.07); break;
    case 'bell':   [0,0.45].forEach(off => [1568,2093].forEach((f,i)=>tone(f,'sine',.2,1.2, off+i*.02))); break;
    case 'tick':   tone(1400,'square',.06,.05); break;
    case 'setwin': [523,659,784,1047,1319,1568].forEach((f,i)=>tone(f,'triangle',.16,.4,i*.07)); break;
    case 'ping':   tone(1046,'sine',.16,.16); tone(1568,'sine',.12,.22,.09); break;
    case 'emote':  tone(760,'sine',.1,.12); break;
  }
}

// ── 배경음악 (게임풍 시퀀서: 베이스 + 아르페지오 + 반짝임) ──
let bgmMaster = null, bgmOn = false;
let bgmSched = null, bgmStep = 0, bgmNextT = 0;
const BGM_VOL = 0.13;
const STEP = 0.15;                 // 8분음표 길이(초) ≈ 100bpm
// 코드 진행: Am – F – C – G (각 8스텝)
const BGM_PROG = [
  { root: 110.00, tones: [220.00, 261.63, 329.63] }, // Am
  { root:  87.31, tones: [174.61, 220.00, 261.63] }, // F
  { root: 130.81, tones: [261.63, 329.63, 392.00] }, // C
  { root:  98.00, tones: [196.00, 246.94, 293.66] }, // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];   // 8스텝 아르페지오 패턴

function pluck(freq, t, dur, vol, type = 'triangle') {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bgmMaster);
  o.start(t); o.stop(t + dur + 0.03);
}
function bgmScheduleStep(step, t) {
  const ch = BGM_PROG[Math.floor(step / 8) % BGM_PROG.length];
  const local = step % 8;
  // 베이스
  if (local === 0) pluck(ch.root, t, 0.55, 0.30, 'sine');
  if (local === 4) pluck(ch.root * 1.5, t, 0.35, 0.16, 'sine');   // 5도 살짝
  // 아르페지오
  const oct = local >= 4 ? 2 : 1;
  pluck(ch.tones[ARP[local] % ch.tones.length] * oct, t, 0.24, 0.11, 'triangle');
  // 반짝이는 리드
  if (local === 2 || local === 6) pluck(ch.tones[2] * 2, t, 0.16, 0.05, 'square');
}
function startBGM() {
  if (bgmOn) return;
  try { AC.resume(); } catch (_) {}
  bgmOn = true;
  bgmMaster = AC.createGain();
  bgmMaster.gain.value = soundOff ? 0 : BGM_VOL;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  bgmMaster.connect(lp); lp.connect(AC.destination);
  bgmStep = 0; bgmNextT = AC.currentTime + 0.1;
  bgmSched = setInterval(() => {
    while (bgmNextT < AC.currentTime + 0.12) {
      bgmScheduleStep(bgmStep, bgmNextT);
      bgmNextT += STEP; bgmStep++;
    }
  }, 25);
}
function toggleBGM() {   // 마스터 음소거 토글 (BGM + 효과음 전체)
  soundOff = !soundOff;
  if (bgmMaster) bgmMaster.gain.linearRampToValueAtTime(soundOff ? 0 : BGM_VOL, AC.currentTime + 0.25);
  const b = document.getElementById('bgmBtn');
  b.textContent = soundOff ? '🔇' : '🔊';
  b.title = soundOff ? '소리 켜기' : '소리 끄기';
  b.style.opacity = soundOff ? '.55' : '1';
}

// ── 게임 설명서 ─────────────────────────────────────────────
function toggleRules(show) {
  document.getElementById('rulesModal').style.display = show ? 'flex' : 'none';
}

// ── 이모트 ──────────────────────────────────────────────────
function toggleEmotes(force) {
  const p = document.getElementById('emotePicker');
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
}
function sendEmote(emoji) {
  socket.emit('emote', { emoji });
  showEmote(emoji, 'me');
  toggleEmotes(false);
}
socket.on('emote', ({ emoji }) => showEmote(emoji, 'opp'));
function showEmote(emoji, side) {
  playSound('emote');
  const anchor = document.getElementById(side === 'me' ? 'myHand' : 'oppHand');
  const b = document.createElement('div');
  b.className = 'emote-bubble'; b.textContent = emoji;
  let x = window.innerWidth / 2, y = side === 'me' ? window.innerHeight - 160 : 120;
  if (anchor) { const r = anchor.getBoundingClientRect(); if (r.width) { x = r.left + r.width / 2; y = side === 'me' ? r.top - 20 : r.bottom + 10; } }
  b.style.left = (x - 20) + 'px'; b.style.top = y + 'px';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1900);
}

// ── 나가기 / 재대결 ─────────────────────────────────────────
function goLobby() { clearSession(); location.href = location.origin + location.pathname; }
function exitGame() {
  if (!confirm('게임에서 나갈까요?')) return;
  socket.emit('leave_room');
  goLobby();
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
  titleBlink = setInterval(() => { document.title = (on = !on) ? '🔔 내 차례! — FLIP FLAP' : BASE_TITLE; }, 800);
}
function stopTitleBlink() { if (titleBlink) { clearInterval(titleBlink); titleBlink = null; } document.title = BASE_TITLE; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleBlink(); });
function isMyAction(s) {
  if (!s) return false;
  if (['draw', 'offer', 'choose_type'].includes(s.phase)) return s.auctioneer === s.myIndex;
  if (s.phase === 'bidding') return s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted);
  return false;
}
let prevMyAction = false;

// ── 방 ──────────────────────────────────────────────────────
function createRoom(vsBot) { isVsBot = vsBot; socket.emit('create_room', { vsBot, difficulty, pid: PID }); }
function joinRoom() {
  const id = document.getElementById('roomInput').value.trim().toUpperCase();
  if (id) socket.emit('join_room', { roomId: id, pid: PID });
}
let sharedCode = '';
socket.on('room_created', ({ roomId }) => {
  sharedCode = roomId;
  document.getElementById('lobbyMain').style.display = 'none';
  document.getElementById('waitCard').style.display = 'flex';
  document.getElementById('waitCode').textContent = roomId;
});
function copyText(text, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = '✓ 복사됨'; setTimeout(() => btn.textContent = o, 1400); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => prompt('복사하세요:', text));
  else prompt('복사하세요:', text);
}
function copyCode(btn) { copyText(sharedCode, btn); }
function copyLink(btn) { copyText(`${location.origin}${location.pathname}?room=${sharedCode}`, btn); }
function cancelWait() { clearSession(); location.href = location.origin + location.pathname; }

socket.on('error', msg => alert(msg));
socket.on('game_start', ({ vsBot, difficulty: diff, roomId }) => {
  isVsBot = vsBot;
  if (roomId) saveSession(roomId);
  // 재대결 대비 초기화
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('rematchNote').textContent = '';
  const rb = document.getElementById('rematchBtn'); if (rb) { rb.disabled = false; rb.style.opacity = '1'; }
  prevPhase = null; selectedBidCard = null; prevMyAction = false; stopTitleBlink();
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  if (vsBot) {
    document.getElementById('cpuTag').style.display = '';
    const dl = { easy:'쉬움', normal:'보통', hard:'어려움', expert:'전문가' }[diff] || diff;
    const de = document.getElementById('cpuDiff');
    de.style.display = ''; de.textContent = dl;
  }
  playSound('deal');
  startBGM();
});
let drewNow = false;
socket.on('state_update', s => {
  const prev = prevPhase;
  const changed = s.phase !== prevPhase;
  drewNow = prev === 'draw' && s.phase === 'offer';
  prevPhase = s.phase; state = s; myIndex = s.myIndex;
  render(changed);
  if (changed && s.phase === 'reveal') playSound('reveal');
  if (drewNow) playSound('deal');
  // 내 차례 알림 (탭이 숨겨져 있을 때)
  const mine = isMyAction(s);
  if (mine && !prevMyAction && document.hidden) { startTitleBlink(); playSound('ping'); }
  if (!mine) stopTitleBlink();
  prevMyAction = mine;
});
socket.on('special', () => {
  playSound('special');
  const t = document.getElementById('specialToast');
  t.style.display = 'block';
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  setTimeout(() => { t.style.display = 'none'; }, 2600);
});
socket.on('game_over', ({ winner, setKind, timeout, byProgress, myIndex: mi }) => {
  clearSession(); stopTitleBlink();
  const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
  let delay = 500;
  if (winner === 0) {
    title.textContent = '무승부'; title.style.color = '#888';
    desc.textContent = '세트 근접도가 완전히 같아요!';
  } else if (winner === mi) {
    title.textContent = '🏆 승리!'; title.style.color = '#c8a000';
    desc.textContent = timeout ? '상대 시간 초과!'
      : byProgress ? `세트 근접 승리! (${setKind}짜리에 가장 가까웠어요)`
      : `${setKind}짜리 세트 완성!`;
    playSound('victory');
    if (setKind && !byProgress) { celebrateSet('myAcq', setKind); playSound('setwin'); delay = 1400; }
    else animateWinCards();
  } else {
    title.textContent = '패배...'; title.style.color = '#6a5a70';
    desc.textContent = timeout ? '시간 초과...'
      : byProgress ? '상대가 세트에 더 가까웠어요.'
      : `상대가 ${setKind}짜리 세트를 완성했어요.`;
    playSound('defeat');
    if (setKind && !byProgress) { celebrateSet('oppAcq', setKind); delay = 1400; }
  }
  renderGameOverStats(winner, byProgress ? null : setKind, mi);
  setTimeout(() => document.getElementById('gameOver').style.display = 'flex', delay);
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
socket.on('opponent_left', () => { clearSession(); alert('상대가 나갔어요.'); location.href = location.origin + location.pathname; });

// 세트 완성 카드 특수효과
function celebrateSet(containerId, kind) {
  const cards = document.querySelectorAll(`#${containerId} .pile-group[data-kind="${kind}"] .card`);
  cards.forEach((c, i) => setTimeout(() => c.classList.add('set-win'), i * 70));
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
function resultReason(my, opp) {
  if ((is610(my) && is21(opp)) || (is610(opp) && is21(my))) return '⚔ 졸개의 배신!';
  if (my.kind !== opp.kind) return `종류 ${my.kind} vs ${opp.kind} → 작은 쪽 승리`;
  return `등급 ${my.grade} vs ${opp.grade} → 낮은 쪽 승리`;
}

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
    mk.textContent = is21(card) ? '👑' : '⚔';
    top.appendChild(mk);
  }

  const num = document.createElement('div');
  num.className = 'c-num'; num.textContent = card.kind;   // 가운데 큰 숫자 = 종류

  el.appendChild(top); el.appendChild(num);

  if (opts.draw)          el.classList.add('anim-draw');
  else if (opts.animate)  el.classList.add('anim-deal');
  if (opts.reveal)   el.classList.add('anim-reveal');
  if (opts.selected) el.classList.add('selected');
  if (opts.selectable) {
    el.classList.add('selectable');
    el.addEventListener('click', () => { playSound('select'); opts.onClick(card); });
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
  if (s.time) updateClocks(s.time[1], s.time[2], s.active);

  // 배팅 순서: 진행자 먼저 → 내가 배팅할 차례인지
  const myTurnToBid = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);

  const think = t => `<span class="thinking-dots">${t}<span>.</span><span>.</span><span>.</span></span>`;
  const biddingMsg = () => {
    if (a?.myBid) return (isVsBot && !a.oppBidSubmitted) ? think('AI 배팅 중') : '배팅 완료 — 대기 중...';
    if (myTurnToBid) return '배팅 카드를 손패에서 선택하세요';
    return isVsBot ? think('진행자(AI) 먼저 배팅 중') : '진행자가 먼저 배팅합니다 — 대기 중';
  };
  const msgs = {
    draw:        mine ? '🂠 중앙덱을 클릭해 카드를 뽑으세요' : (isVsBot ? think('AI가 뽑는 중') : '상대가 카드를 뽑는 중...'),
    offer:       mine ? '중앙 카드 공개 — 출품할 카드를 선택하세요' : (isVsBot ? think('AI 생각 중') : '상대가 출품 중...'),
    choose_type: mine ? '경매 방식 선택 — 출품카드는 다른 손패 클릭 시 교체돼요' : (isVsBot ? think('AI 생각 중') : '상대가 방식 선택 중...'),
    bidding:     biddingMsg(),
    reveal: '결과 공개!', game_over: '게임 종료',
  };
  const bar = document.getElementById('statusBar');
  if (changed) { bar.style.opacity = '0'; setTimeout(() => { bar.innerHTML = msgs[s.phase] ?? s.phase; bar.style.opacity = '1'; }, 180); }
  else bar.innerHTML = msgs[s.phase] ?? s.phase;

  document.getElementById('oppHandLen').textContent = `· 손패 ${s.oppHandLen}장`;
  renderDeck();
  renderOppHand(s.oppHandLen);
  renderPile('oppAcq', s.oppAcq);
  renderPile('myAcq', s.myAcq);
  renderAuction(changed);
  renderHand();
}

// 중앙덱 스택
function drawCard() {
  const s = state;
  if (!s || s.phase !== 'draw' || s.auctioneer !== s.myIndex) return;
  playSound('place');
  socket.emit('draw_card');
}
function renderDeck() {
  const s = state, el = document.getElementById('deckStack');
  const n = s.centerDeckSize;
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
  el.classList.toggle('drawable', s.phase === 'draw' && s.auctioneer === s.myIndex);
}

// 상대 손패 = 뒷면 카드 부채꼴
function renderOppHand(n) {
  const el = document.getElementById('oppHand'); el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(makeCard(null));
    el.appendChild(slot);
  }
  fanRow(el, true);
}

// 획득 카드 = 종류별로 겹쳐 쌓은 더미 (세트 진행도 표시)
const SET_REQ = { 2:2, 3:3, 4:4, 6:6 };
function renderPile(id, cards) {
  const el = document.getElementById(id); el.innerHTML = '';
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
    wrap.className = 'pile-group' + (reach ? ' reach' : '');
    wrap.dataset.kind = kind;
    g.forEach(c => wrap.appendChild(makeCard(c)));
    const cnt = document.createElement('span');
    cnt.className = 'pile-count' + (done ? ' done' : reach ? ' reach' : '');
    cnt.textContent = reach ? `${g.length}/${req} 리치!` : `${g.length}/${req}`;
    wrap.appendChild(cnt);
    el.appendChild(wrap);
  }
}

// 부채꼴 배치: 각 카드 회전 + 중앙이 위로 솟는 아치
function fanRow(container, isTop) {
  const slots = [...container.children];
  const n = slots.length; if (!n) return;
  const stepMax = 6.5;
  const spread = Math.min((n - 1) * stepMax, 36);
  const step = n > 1 ? spread / (n - 1) : 0;
  const mid = (n - 1) / 2;
  slots.forEach((slot, i) => {
    const ang = (-spread / 2 + i * step) * (isTop ? -1 : 1);
    const dist = Math.abs(i - mid);
    const lift = (mid - dist) * 5;                 // 중앙 카드가 더 솟음
    const y = isTop ? lift : -lift;
    slot.style.transformOrigin = isTop ? 'center top' : 'center bottom';
    slot.style.transform = `rotate(${ang}deg) translateY(${y}px)`;
    slot.style.zIndex = String(20 - Math.round(dist));
    slot.style.margin = '0 -7px';
  });
}
function renderAuction(changed) {
  const s = state;
  const items = document.getElementById('auctionItems');
  const action = document.getElementById('actionArea'), badge = document.getElementById('auctionTypeBadge');
  items.innerHTML = ''; action.innerHTML = '';
  renderBids();
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

  if (s.phase === 'choose_type' && mine) {
    const row = document.createElement('div'); row.className = 'btn-row';
    const bo = document.createElement('button'); bo.className = 'btn btn-gold btn-sm'; bo.textContent = '오픈 경매';
    bo.title = '경매품 공개 · 배팅 비공개'; bo.onclick = () => { playSound('flip'); socket.emit('choose_auction', { type: 'open' }); };
    const bc = document.createElement('button'); bc.className = 'btn btn-ink btn-sm'; bc.textContent = '클로즈 경매';
    bc.title = '경매품 비공개 · 배팅 공개'; bc.onclick = () => { playSound('flip'); socket.emit('choose_auction', { type: 'closed' }); };
    row.appendChild(bo); row.appendChild(bc); action.appendChild(row);
  }

  const myTurnToBid = s.phase === 'bidding' && !a.myBid && (mine || a.oppBidSubmitted);
  if (myTurnToBid) {
    if (selectedBidCard) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-gold btn-sm'; btn.style.marginTop = '10px';
      btn.textContent = `${selectedBidCard.kind}번 (${selectedBidCard.grade}등급) 배팅 확정`;
      btn.onclick = () => { playSound('place'); socket.emit('submit_bid', { cardId: selectedBidCard.id }); selectedBidCard = null; };
      action.appendChild(btn);
    } else {
      const h = document.createElement('p'); h.className = 'hint-text';
      h.textContent = atype === 'closed' ? '클로즈 · 공개 배팅 — 손패에서 카드를 선택하세요' : '오픈 · 비공개 배팅 — 손패에서 카드를 선택하세요';
      action.appendChild(h);
    }
  } else if (s.phase === 'bidding' && !a.myBid) {
    const h = document.createElement('p'); h.className = 'hint-text';
    h.textContent = '진행자가 먼저 배팅합니다 — 잠시 대기';
    action.appendChild(h);
  }

  // reveal: 경매 결과 안내 (낙찰/패배 + 이유)
  if (isReveal && a.myBid && a.oppBid) {
    const win = myBidWins(a.myBid, a.oppBid);
    const rb = document.createElement('div');
    rb.className = 'result-banner ' + (win ? 'win' : 'lose');
    rb.innerHTML = `<b>${win ? '낙찰! 🏆' : '패배'}</b> <span>${resultReason(a.myBid, a.oppBid)}</span>`;
    action.appendChild(rb);
  }
}
// 배팅 카드를 각자 앞에 배치
function bidSlot(label, card, { back = false, reveal = false } = {}) {
  const w = document.createElement('div'); w.className = 'bid-slot';
  const l = document.createElement('div'); l.className = 'bid-lbl'; l.textContent = label;
  w.appendChild(l);
  if (card)       w.appendChild(makeCard(card, { reveal }));
  else if (back)  w.appendChild(makeCard(null));
  else { const e = document.createElement('div'); e.className = 'bid-empty'; w.appendChild(e); }
  return w;
}
function renderBids() {
  const s = state, a = s.auction;
  const my = document.getElementById('myBid'), opp = document.getElementById('oppBid');
  my.innerHTML = ''; opp.innerHTML = '';
  if (!a || (s.phase !== 'bidding' && s.phase !== 'reveal')) return;
  const isReveal = s.phase === 'reveal';

  // 내 배팅 (내 앞) — 항상 나에게 보임
  my.appendChild(bidSlot('내 배팅', a.myBid ?? null, { reveal: isReveal && !!a.myBid }));

  // 상대 배팅 (상대 앞) — 서버가 공개 여부 결정 (클로즈=즉시 / 오픈=reveal)
  const ol = `상대 배팅${a.oppBidSubmitted ? ' ✓' : ''}`;
  if (a.oppBid)            opp.appendChild(bidSlot(ol, a.oppBid, { reveal: isReveal }));
  else if (a.oppBidSubmitted) opp.appendChild(bidSlot(ol, null, { back: true }));
  else                    opp.appendChild(bidSlot('상대 배팅', null));
}

function renderHand() {
  const s = state, a = s.auction, el = document.getElementById('myHand'); el.innerHTML = '';
  const mine = s.auctioneer === s.myIndex;
  // 방식 선택 전(offer/choose_type)이면 손패 클릭으로 출품카드 교체 가능
  const offer = (s.phase === 'offer' || s.phase === 'choose_type') && mine;
  // 진행자 먼저 배팅
  const bidding = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);
  // 등급순 정렬로 손에 든 느낌
  const hand = [...s.myHand].sort((a, b) => a.kind - b.kind || a.grade - b.grade);
  hand.forEach(card => {
    let cardEl;
    if (offer)
      cardEl = makeCard(card, { selectable: true, onClick: c => { playSound('place'); socket.emit('offer_card', { cardId: c.id }); } });
    else if (bidding)
      cardEl = makeCard(card, { selectable: true, selected: selectedBidCard?.id === card.id, onClick: c => { selectedBidCard = selectedBidCard?.id === c.id ? null : c; render(); } });
    else
      cardEl = makeCard(card);
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(cardEl); el.appendChild(slot);
  });
  fanRow(el, false);
}
function animateWinCards() {
  document.querySelectorAll('#myAcq .card').forEach((c, i) => {
    setTimeout(() => { c.classList.remove('anim-win'); void c.offsetWidth; c.classList.add('anim-win'); }, i * 80);
  });
}
