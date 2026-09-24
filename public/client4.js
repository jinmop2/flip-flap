// ── 4인전 클라이언트 ──────────────────────────────────────────────────────
// 기존 2인 화면(#game)과 완전히 분리된 #game4 화면을 그린다.
// 서버와는 g4_* 이벤트로만 통신하므로 클래식·아이템전 흐름에 영향이 없다.

(function () {
  let q4 = null;         // 최신 상태
  let q4Live = false;    // 4인전 화면에 있는가
  let q4Room = null;     // 재접속해서 이어하기 위한 방 번호
  let q4WasMulti = false;   // 방금 판이 사람들과 한 판이었나
  let q4RematchOn = false;  // 내가 이미 눌렀나
  let lastRecv = 0;      // 마지막으로 상태를 받은 시각
  let prevPhase = null, prevTurn = 0;   // 효과음을 단계가 바뀔 때만 울리려고
  let mySeat = 0;        // 내 좌석 — 멀티에서는 0이 아닐 수 있다
  let oppSeats = [1, 2, 3];   // 내 다음 자리부터 시계방향 상대들 (3인이면 2명)
  let seatCount = 4;
  const $ = (id) => document.getElementById(id);
  // 소리는 부가 요소다. 아직 초기화 전이거나 재생이 막혀도 게임 진행을 막으면 안 된다.
  const sfx = (n) => { try { if (typeof playSound === 'function') playSound(n); } catch (_) {} };

  // 카드는 종류만 있다(등급 없음). 특수 카드 셋은 문자열 종류다.
  const G4 = window.GAME4;
  const SP_NAME = { V: '금고', W6: '더블6', D46: '쌍둥이 4/6' };
  const isSp = (k) => typeof k === 'string';
  const cardName = (c) => (isSp(c.kind) ? SP_NAME[c.kind] : `${c.kind}짜리`);
  const coin = (cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-coin"/></svg>`;
  // 손패·더미를 늘 같은 차례로 — 세트 카드 먼저, 특수 카드는 뒤에
  const KORDER = { 2: 0, 3: 1, 4: 2, 6: 3, D46: 4, W6: 5, V: 6 };
  const byKind = (x, y) => (KORDER[x.kind] - KORDER[y.kind]) || (x.id - y.id);

  // 내 카드백 클래스 (상점에서 산 것). 2인전과 같은 표를 쓴다.
  function myBackClass() {
    try {
      const p = (typeof myAccount !== 'undefined') && myAccount;
      return (p && typeof CB_CLASS !== 'undefined' && CB_CLASS[p.cardBack]) || null;
    } catch (_) { return null; }
  }
  // 테이블·카드앞면 스킨을 다인전 화면에도 입힌다
  function applySkins4() {
    const g = document.getElementById('game4'); if (!g) return;
    try {
      if (typeof TABLE_CLS !== 'undefined') g.classList.remove(...Object.values(TABLE_CLS));
      if (typeof FACE_CLS !== 'undefined') g.classList.remove(...Object.values(FACE_CLS));
      const p = (typeof myAccount !== 'undefined') && myAccount; if (!p) return;
      if (typeof TABLE_CLS !== 'undefined' && TABLE_CLS[p.table]) g.classList.add(TABLE_CLS[p.table]);
      if (typeof FACE_CLS !== 'undefined' && FACE_CLS[p.cardFace]) g.classList.add(FACE_CLS[p.cardFace]);
      // 판 밖에서 만드는 카드(정산 때 날아가는 것 등)까지 덮으려면 body 에도 걸어야 한다
      if (typeof FACE_CLS !== 'undefined') {
        document.body.classList.remove(...Object.values(FACE_CLS));
        if (FACE_CLS[p.cardFace]) document.body.classList.add(FACE_CLS[p.cardFace]);
      }
    } catch (_) {}
  }

  // ── 친구 초대 ────────────────────────────────────────────────────────────
  // 빈자리의 + 를 누르면 친구 목록에서 고른다. 접속 중인 친구만 부를 수 있다 —
  // 초대는 알림이라 상대가 접속해 있어야 닿는다.
  window.q4CloseInvite = function () { $('q-inviteModal').classList.remove('show'); };
  async function openInvite() {
    const box = $('q-inviteList');
    $('q-inviteModal').classList.add('show');
    box.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
    let r = null;
    try {
      r = await (typeof apiPost === 'function'
        ? apiPost('/api/friends', { token: localStorage.getItem('ff_auth') })
        : null);
    } catch (_) {}
    if (!r || r.error || !r.friends) {
      box.innerHTML = `<div class="lb-empty">${(r && r.error) || '로그인하면 친구를 초대할 수 있어요'}</div>`;
      return;
    }
    if (!r.friends.length) { box.innerHTML = '<div class="lb-empty">아직 친구가 없어요</div>'; return; }
    // 지금 부를 수 있는 사람이 위로
    const rank = (x) => (x.online ? (x.ingame ? 1 : 0) : 2);
    box.innerHTML = r.friends.slice().sort((a, b) => rank(a) - rank(b)).map((f) => {
      const can = !!f.online && !f.ingame;
      const label = f.ingame ? '게임 중' : (f.online ? '초대' : '접속 중 아님');
      return `<button class="q-invrow${can ? '' : ' off'}"${can ? ` onclick="q4Invite('${f.idl}')"` : ''}>
        <span class="q-invnm${typeof ncClass === 'function' ? ncClass(f.nickColor) : ''}">${typeof esc === 'function' ? esc(f.nick) : f.nick}</span>
        <span class="q-invst${f.ingame ? ' busy' : ''}">${label}</span></button>`;
    }).join('');
  }
  window.q4Invite = function (idl) {
    socket.emit('g4_invite', { idl });
    $('q-inviteList').innerHTML = '<div class="lb-empty">보내는 중…</div>';
  };

  // 내 시계. 상태가 올 때만 그리면 초가 안 흐르므로, 서버가 매초 보내는
  // 가벼운 신호(g4_clock)로도 같은 함수를 부른다.
  function paintClock(clock, waiting) {
    const tm = $('q-timer'); if (!tm) return;
    if (!clock) { tm.style.display = 'none'; return; }
    const left = Math.max(0, clock[mySeat] || 0);
    tm.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    tm.classList.toggle('active', waiting === mySeat);
    tm.classList.toggle('warn', left <= 30);
    tm.style.display = '';
  }

  // 덱 더미 — 남은 장수만큼 겹쳐 쌓고, 뽑을 수 있을 때만 빛난다
  function renderDeck4(n) {
    const el = $('q-deckstack'); if (!el) return;
    const sig = n + '|' + (myBackClass() || '');
    if (fx.deckSig !== sig) {
      fx.deckSig = sig;
      el.innerHTML = '';
      if (n > 0) {
        const layers = Math.min(n, 5);
        for (let i = 0; i < layers; i++) {
          const b = card4(null);
          b.style.transform = `translate(${i * 2}px, ${-i * 2}px)`;
          b.style.zIndex = String(i);
          el.appendChild(b);
        }
        const c = document.createElement('div');
        c.className = 'q-dcount'; c.textContent = `덱 ${n}장`;
        el.appendChild(c);
      }
    }
    el.style.display = n > 0 ? '' : 'none';
  }

  // 고른 카드에 테두리를 주고, 확정 버튼 문구를 맞춘다
  let curPick = null;      // 지금 무엇을 고르는 중인가 ('offer' | null)
  let q4Spec = false;      // 관전 중인가 — 남의 판을 보기만 한다
  function paintSel() {
    const hand = $('q-myhand'); if (!hand) return;
    hand.querySelectorAll('.card').forEach((el) => {
      const on = !!sel4 && String(el.dataset.id) === String(sel4.id);
      el.classList.toggle('sel', on);
      // 부채꼴 회전은 카드 자체 transform 에 걸려 있다. 들어 올리는 건 칸에 준다.
      if (el.parentElement) el.parentElement.classList.toggle('sel', on);
    });
    // 고른 카드를 내 앞에 미리 올린다 — 무엇을 내놓으려는지 판에서 보이게
    const mb = $('q-mybid');
    if (mb) {
      mb.classList.remove('picking');
      const prev = mb.querySelector('.q-pick-prev');
      if (prev) prev.remove();
      if (sel4 && curPick) {
        const wrap = document.createElement('div');
        wrap.className = 'q-pick-prev';
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';
        wrap.appendChild(card4(sel4));
        const l = document.createElement('div');
        l.className = 'q-mylabel'; l.textContent = '출품 선택 중';
        wrap.appendChild(l);
        mb.appendChild(wrap);
        mb.classList.add('picking');
      }
    }
    const btn = $('q-confirm'); if (!btn) return;
    const on = !!(curPick && sel4);
    btn.classList.toggle('show', on);
    if (on) btn.textContent = `${cardName(sel4)} 출품 확정`;
  }
  // ── 보낸 행동이 먹혔는지 확인하고, 안 먹혔으면 되살린다 ────────────────────
  //
  // 서버는 못 받아들인 행동을 조용히 버리고 상태만 다시 보낸다. 그래서 화면에는
  // 아무 일도 안 일어나고, 왜 안 되는지도 안 나온다. 폰에서는 화면 잠금·앱 전환
  // 만으로 소켓이 다시 붙는데, 그때 자리 연결이 끊긴 채면 내가 뭘 눌러도 전부
  // 버려진다 — 3분을 다 쓰고 AI 에게 넘어갈 때까지.
  //
  // 그래서 보낸 걸 기억해 두고, 판이 안 움직이면 자리를 다시 잇고 한 번 더 보낸다.
  let pendAct = null;                        // { payload, at, sig, tries }
  // 올리기·빠지기·답하기는 단계도 손패도 그대로다 — 경매가 어디까지 왔는지도 같이 본다
  const stateSig = () => {
    if (!q4) return '';
    const a = q4.auction || {};
    return [q4.turn, q4.phase, (q4.myHand || []).map((c) => c.id).join(','),
            a.price, a.high, (a.out || []).length, a.turnSeat, (a.answered || []).length, a.closeP].join('|');
  };
  function sendAct(payload) {
    pendAct = { payload, at: Date.now(), sig: stateSig(), tries: 0 };
    socket.emit('g4_act', payload);
    watchPend();
  }
  // 상태가 실제로 바뀌었으면 먹힌 것이다
  function noteState() {
    if (pendAct && stateSig() !== pendAct.sig) { pendAct = null; watchPend(); }
  }
  // 보낸 게 있을 때만 깨어난다. 계속 도는 타이머는 아무 일이 없어도 폰을 깨운다.
  let pendTimer = null;
  function watchPend() {
    clearInterval(pendTimer);
    pendTimer = pendAct ? setInterval(checkPend, 700) : null;
  }
  function checkPend() {
    if (!pendAct || !q4Live || !q4Room) return watchPend();
    if (Date.now() - pendAct.at < 1800) return;
    if (pendAct.tries >= 2) {                // 두 번 더 해 보고도 안 되면 솔직히 말한다
      $('q-status').textContent = '서버가 응답하지 않아요 — 잠시 후 다시 눌러주세요';
      pendAct = null; return watchPend();
    }
    pendAct.tries++; pendAct.at = Date.now();
    resume();                                // 자리부터 다시 잇고
    setTimeout(() => { if (pendAct) socket.emit('g4_act', pendAct.payload); }, 300);
  }

  // 출품 확정 — 여기서만 서버로 나간다
  window.q4Confirm = function () {
    if (curPick !== 'offer' || !sel4) return;
    const id = sel4.id;
    sel4 = null; curPick = null;              // 연타로 두 번 나가지 않게 먼저 비운다
    paintSel();
    sfx('place');
    sendAct({ type: 'offer', cardId: id });
  };

  // 빈 자리. 카드와 똑같은 크기를 차지해야 카드가 놓일 때 화면이 안 밀린다.
  function slotHole() {
    const el = document.createElement('div');
    el.className = 'q-hole';
    return el;
  }

  function card4(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    if (!card) {
      el.classList.add('back');
      // 산 카드백을 판에서도 쓴다
      if (opts.backOf !== undefined) { if (opts.backOf) el.classList.add(opts.backOf); }
      else { const c = myBackClass(); if (c) el.classList.add(c); }
      el.innerHTML = '<span class="bf flip">FLIP</span><span class="bf flap">FLAP</span>';
      return el;
    }
    el.dataset.kind = card.kind;
    el.dataset.id = card.id;
    const top = document.createElement('div'); top.className = 'c-top';
    const num = document.createElement('div'); num.className = 'c-num';
    el.appendChild(top); el.appendChild(num);
    if (card.kind === 'V') {                 // 금고 — 동전 그림. 세트에는 안 든다
      el.classList.add('q-sp');
      num.innerHTML = coin('q-vico');
      const t = document.createElement('span'); t.className = 'c-sub'; t.textContent = '금고';
      el.appendChild(t);
    } else if (card.kind === 'W6') {         // 더블6 — 6종 두 장으로 친다
      el.classList.add('q-sp');
      num.textContent = '6';
      const m = document.createElement('span'); m.className = 'c-x2'; m.textContent = '×2';
      top.appendChild(m);
    } else if (card.kind === 'D46') {        // 쌍둥이 — 4종에도 6종에도 친다
      el.classList.add('q-sp');
      num.classList.add('c-twin'); num.innerHTML = '<i>4</i><i>6</i>';
    } else {
      num.textContent = card.kind;
    }
    if (opts.ghost) el.classList.add('q-ghost');
    if (opts.pick) {
      el.classList.add('pick');
      // 2인전과 같은 탭 처리 — click 만 쓰면 손가락이 조금 움직였을 때 먹지 않는다
      if (typeof onTap === 'function') onTap(el, () => opts.onPick(card));
      else el.addEventListener('click', () => opts.onPick(card));
    }
    return el;
  }

  // 획득 더미가 칸을 넘으면 잘라내지 말고 줄여서 넣는다.
  //
  // 예전엔 칸 높이를 고정하고 overflow:hidden 으로 덮어 뒀는데, 3인전에서 칸이
  // 30px 인데 카드가 50px 이라 아래가 잘려 나갔다(가로도 열한 장이면 넘쳤다).
  // 카드 크기를 CSS 로 일일이 맞추면 인원·화면 크기 조합마다 또 어긋난다 —
  // 그리고 나서 실제로 재 보고, 넘치는 만큼만 축소한다.
  function fitAcq(box) {
    const inner = box.querySelector('.q-acqin');
    if (!inner) return;
    inner.style.transform = 'none';
    const w = box.clientWidth - (box.dataset.pad ? Number(box.dataset.pad) : 0);
    const h = box.clientHeight;
    const sw = inner.scrollWidth, sh = inner.scrollHeight;
    if (!sw || !sh || !w || !h) return;
    const k = Math.min(1, w / sw, h / sh);
    // 아주 조금 넘치는 건 눈에 안 띄니 그냥 둔다 (매번 미세하게 줄었다 폈다 하면 어지럽다)
    inner.style.transform = k < 0.985 ? `scale(${k.toFixed(3)})` : '';
  }

  // 획득 더미 — 세트마다 묶는다. 몇 장째인지는 특수 카드까지 쳐서 센다
  // (더블6 은 6종 두 장, 쌍둥이는 4종·6종 둘 다). 쌍둥이는 두 묶음에 다 놓되
  // 두 번째는 흐리게 — "한 장이 두 군데 친다" 가 눈에 보여야 한다.
  // 금고는 따로 묶고 매 턴 버는 칩을 적는다.
  function acqPile(acq) {
    const out = [], cnt = G4.counts(acq);
    for (const kind of [2, 3, 4, 6]) {
      const cards = acq.filter((c) => G4.addOf(c.kind)[kind]).sort(byKind);
      if (!cards.length) continue;
      const need = G4.NEED[kind], have = cnt[kind];
      const done = have >= need, reach = have === need - 1;
      const wrap = document.createElement('div');
      wrap.className = 'q-pg' + (done ? ' done' : reach ? ' reach' : '');
      wrap.dataset.k = kind;
      for (const c of cards) wrap.appendChild(card4(c, { ghost: c.kind === 'D46' && kind === 6 }));
      const n = document.createElement('span');
      n.className = 'q-pn' + (done ? ' done' : reach ? ' reach' : '');
      n.textContent = done ? '완성!' : `${have}/${need}`;
      wrap.appendChild(n);
      out.push(wrap);
    }
    const vs = acq.filter((c) => c.kind === 'V');
    if (vs.length) {
      const wrap = document.createElement('div');
      wrap.className = 'q-pg q-vg';
      for (const c of vs) wrap.appendChild(card4(c));
      const n = document.createElement('span');
      n.className = 'q-pn vault'; n.textContent = `+${G4.income(vs.length)}/턴`;
      wrap.appendChild(n);
      out.push(wrap);
    }
    return out;
  }

  // 시작 전 대기방 — 게임 화면에 앉은 채로 자리가 차는 걸 본다
  let q4Pend = null;
  function renderPending() {
    const p = q4Pend; if (!p) return;
    document.body.classList.toggle('q-n3', p.willBe === 3);
    // 판이 열리기 전에는 경매대가 숨어 있어(그 안에 턴이 있다) 턴바에 적는다
    $('q-wait').textContent = `대기 중 · ${p.count}명 입장`;

    // 상대 자리 — 나를 뺀 3칸. 아직 안 온 자리는 "빈 자리"
    const opps = $('q-opps'); opps.innerHTML = '';
    for (let k = 1; k <= 3; k++) {
      const seat = (p.me + k) % 4;
      const who = p.seats[seat];
      const d = document.createElement('div');
      d.className = 'q-seat ' + seatAt(3, k - 1) + (who ? '' : ' empty');
      // 판이 열리기 전에도 자리 모양은 같다 — 명패가 놓이고 앞은 비어 있다.
      const bar = document.createElement('div'); bar.className = 'q-sbar';
      const plate = document.createElement('div'); plate.className = 'game-pcard q-splate';
      const body = document.createElement('div'); body.className = 'pc-body';
      const face = document.createElement('span'); face.className = 'gp-rank gp-art';
      face.textContent = who ? '👤' : '🪑';
      const nick = document.createElement('span'); nick.className = 'gp-nick';
      nick.textContent = who ? who.name : '빈 자리';
      const lv = document.createElement('span'); lv.className = 'gp-lv';
      lv.textContent = who ? '준비 완료' : '기다리는 중…';
      body.appendChild(face); body.appendChild(nick); body.appendChild(lv);
      plate.appendChild(body); bar.appendChild(plate);
      d.appendChild(bar);
      // 빈자리는 눌러서 친구를 부른다
      if (!who) {
        const plus = document.createElement('button');
        plus.className = 'q-invite';
        plus.textContent = '+';
        plus.title = '친구 초대';
        plus.onclick = (e) => { e.stopPropagation(); openInvite(); };
        d.appendChild(plus);
      }
      opps.appendChild(d);
    }
    $('q-mybid').innerHTML = ''; $('q-mybid').className = '';
    $('q-myacq').innerHTML = '';
    $('q-myhand').innerHTML = '';
    try { if (window.quadLayTable) window.quadLayTable(); } catch (_) {}
    $('q-center').innerHTML = ''; $('q-offer').innerHTML = '';
    $('q-typeTag').textContent = '';
    $('q-typeBtns').classList.remove('show');
    $('q-status').textContent = p.count >= 4
      ? '곧 시작합니다…'
      : `사람이 더 오면 함께해요. 지금 시작하면 ${p.willBe}인전 (사람 ${p.count}명 · AI ${p.willBe - p.count}명)`;
    document.body.classList.add('q-waiting');
    $('q-startPanel').classList.add('show');
    $('q-startBtn').textContent = `${p.willBe}인전 시작`;
  }

  // ── 연출 ────────────────────────────────────────────────────────────────
  // render() 는 매 상태마다 DOM 을 통째로 다시 그린다. 그래서 "지금 막 바뀐 것"만
  // 골라 연출하려면 직전 상태를 따로 기억해야 한다. 안 그러면 같은 카드가 매번
  // 다시 뒤집히고, 딜이 계속 반복된다.
  const fx = { dealt: false, centerId: null, offerId: null, revealed: false,
               settledTurn: null, acqSeen: new Set(), handSig: null, deckSig: null,
               // 뒤집기가 끝났는가. 안 끝났으면 결과(금테·낙찰·도장)를 아직 안 붙인다.
               shown: true, showTimer: null };
  // 고른 카드 (아직 안 낸 것). 서버 상태가 와도 유지된다.
  let sel4 = null;
  function resetFx() {
    fx.dealt = false; fx.centerId = null; fx.offerId = null;
    fx.revealed = false; fx.settledTurn = null; fx.acqSeen = new Set();
    fx.incomeTurn = null; fx.bidSig = null;
  }
  // 이번에 새로 들어온 카드만 날아들게 한다 (매 렌더마다 전부 튀면 정신없다).
  // acqPile 은 종류별 묶음을 주므로 그 안의 카드를 훑어야 한다.
  function markNewCards(group, who) {
    let i = 0;
    for (const c of group.querySelectorAll('.card')) {
      const id = c.dataset && c.dataset.id; if (!id) continue;
      const key = who + ':' + id;
      if (fx.acqSeen.has(key)) continue;
      fx.acqSeen.add(key);
      c.classList.add('anim-acquire');
      c.style.animationDelay = (i++ * 90) + 'ms';
    }
  }
  const play = (el, cls) => {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  };

  // ── 렌더 ────────────────────────────────────────────────────────────────
  function render() {
    if (!q4) return;
    const s = q4, a = s.auction;
    const fitBoxes = [];                 // 다 그린 뒤에 한 번에 재고 줄인다
    mySeat = (s.me === undefined || s.me === null) ? 0 : s.me;
    seatCount = s.n || s.seats.length || 4;
    document.body.classList.toggle('q-n3', seatCount === 3);
    // 내 다음 자리부터 시계방향. 3인이면 상대가 2명뿐이다.
    oppSeats = Array.from({ length: seatCount - 1 }, (_, k) => (mySeat + k + 1) % seatCount);

    q4Pend = null;
    document.body.classList.remove('q-waiting');
    $('q-startPanel').classList.remove('show');
    // 내 프로필 — 2인전처럼 판에서도 내가 누군지 보인다
    try {
      if (typeof renderGameProfile === 'function' && typeof myAccount !== 'undefined')
        renderGameProfile('q-meProfile', myAccount || { guest: true, nick: (typeof getNick === 'function' ? getNick() : '나') });
    } catch (_) {}
    paintClock(s.clock, s.waitSeat);
    // 턴은 덱 위 이름표 자리에. 덱 장수는 덱 아래에 이미 적혀 있다.
    $('q-turn').textContent = `${s.turn}턴`;
    $('q-wait').textContent = '';

    // ── 상대 자리 ────────────────────────────────────────────────────────
    // 한 사람의 것이 한 덩어리다: 시계·명패가 판 가장자리에, 그 앞에 딴 카드와
    // 낸 카드가 놓인다. 예전엔 겹이 셋(자리 상자·딴 카드·낸 카드) 이라 저마다
    // top 을 재서 맞춰야 했고, 경매대가 조금만 움직여도 남의 자리로 넘어갔다.
    // 옆자리는 이 덩어리째 90도 돌린다 — 그래야 정말 그 변에 앉아 보인다.
    const winner = (s.result && fx.shown) ? s.result.winner : -1;
    const nm = (i) => (i === mySeat && !s.watching ? '나' : s.seats[i].name);

    // 자리마다 이번 경매에서의 모습 — 부른 값 / 포기 / 답함 / 낙찰.
    // 칩 경매라 낸 카드가 없다. 대신 그 칸에 "이 사람이 지금 어디까지 왔나" 를 적는다.
    const bidBadge = (seat) => {
      if (!a) return null;
      const el = document.createElement('div'); el.className = 'q-bid';
      const put = (cls, main, sub) => {
        if (cls) el.classList.add(cls);
        const b = document.createElement('b'); b.innerHTML = main; el.appendChild(b);
        if (sub) { const t = document.createElement('span'); t.textContent = sub; el.appendChild(t); }
        return el;
      };
      const isAuc = seat === s.auctioneer;
      if (a.winner === seat && fx.shown) return put('win', a.paid ? coin() + a.paid : '무료', '낙찰');
      if (a.type === 'close' && !a.tiebreak) {
        if (isAuc) return a.closeP ? put('auc', coin() + a.closeP, '클로즈') : null;
        if (a.buyers) return a.buyers.includes(seat) ? put('yes', '산다') : put('no', '안 삼');
        if (seat === mySeat && a.myAnswer !== null && a.myAnswer !== undefined)
          return a.myAnswer ? put('yes', '산다', '몰래 답함') : put('no', '안 삼', '몰래 답함');
        if (a.answered.includes(seat)) return put('done', '✓', '답함');
        return s.phase === 'answer' ? put('think', '…', '고민 중') : null;
      }
      if (a.tiebreak && isAuc) return put('auc', coin() + a.closeP, '클로즈');
      if (a.tiebreak && a.buyers && !a.buyers.includes(seat)) return put('no', '안 삼');
      if (a.high === seat) return put('high', coin() + a.price, '최고가');
      if (a.out.includes(seat)) return put('out', '포기');
      if (a.bids[seat] !== undefined) return put('old', coin() + a.bids[seat]);
      if (a.turnSeat === seat) return put('think', '…', '차례');
      return null;
    };
    // 칩 — 트웰브의 칩 딱지와 같은 모양. 자리가 좁아 쌓기는 빼고 칩 한 개와 수만.
    const chipTag = (n, mine) => {
      const t = document.createElement('div'); t.className = 'tv-chips mini q-chips' + (mine ? ' mine' : '');
      const c = document.createElement('i'); c.className = 'chip ' + (mine ? 'light' : 'dark'); t.appendChild(c);
      const b = document.createElement('b'); b.textContent = n; t.appendChild(b);
      return t;
    };
    // 금고 수입 — 매 턴 처음에 "+N" 이 떠오른다. 턴마다 한 번만.
    const incomeNow = s.phase === 'offer' && s.income && fx.incomeTurn !== s.turn;
    if (incomeNow) fx.incomeTurn = s.turn;
    const floatIncome = (box, seat) => {
      const v = s.income && s.income[seat];
      if (!incomeNow || !v || !box) return;
      const f = document.createElement('span'); f.className = 'q-incfly'; f.textContent = '+' + v;
      box.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    };

    const opps = $('q-opps'); opps.innerHTML = '';
    for (const i of oppSeats) {
      const p = s.seats[i];
      const where = seatAt(oppSeats.length, oppSeats.indexOf(i));
      const d = document.createElement('div');
      const acting = (a && a.turnSeat === i) || (s.phase === 'answer' && a && i !== s.auctioneer && !a.answered.includes(i));
      d.className = 'q-seat ' + where + (s.auctioneer === i ? ' auc' : '')
        + (acting ? ' turn' : '') + (i === winner ? ' win' : '');

      // ① 가장자리 — 시계와 명패. 내 자리(#q-mebar)와 같은 차림이라야
      //    "저 사람도 나처럼 앉아 있다" 로 읽힌다.
      const bar = document.createElement('div'); bar.className = 'q-sbar';
      const tm = document.createElement('div');
      tm.className = 'timer pc-timer q-stime';
      if (s.clock) {
        const left = Math.max(0, s.clock[i] || 0);
        tm.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (s.waitSeat === i) tm.classList.add('active');
        if (left <= 30) tm.classList.add('warn');
      } else tm.style.display = 'none';

      const plate = document.createElement('div'); plate.className = 'game-pcard q-splate';
      const body = document.createElement('div'); body.className = 'pc-body';
      if (s.auctioneer === i) { const b = document.createElement('span'); b.className = 'q-obadge'; b.textContent = '진행'; body.appendChild(b); }
      // 얼굴 — 사람은 등급 문장, AI 는 로봇. 내 명패와 같은 자리에 온다.
      const face = document.createElement('span');
      face.className = 'gp-rank gp-art';
      if (p.isBot) face.innerHTML = (typeof AI_AVATAR !== 'undefined') ? AI_AVATAR : '🤖';
      else if (p.profile && typeof rankIco === 'function') {
        face.innerHTML = rankIco(p.profile.rankIcon); face.style.color = p.profile.rankColor;
      } else face.textContent = '👤';
      body.appendChild(face);
      const nick = document.createElement('span');
      nick.className = 'gp-nick';
      // 산 명패·닉네임 색은 상대에게도 입힌다 — 로비·2인전과 같은 모습이라야
      // "저 사람 명패 좋네" 가 판에서도 보인다.
      if (p.profile) {
        const cls = (typeof ncClass === 'function' ? ncClass(p.profile.nickColor) : '') +
                    (typeof npClass === 'function' ? npClass(p.profile.plate) : '');
        if (cls.trim()) nick.className += cls;
      }
      nick.textContent = p.name;
      if (!p.isBot) {
        nick.style.cursor = 'pointer'; nick.title = '상대 정보';
        nick.onclick = (e) => {
          e.stopPropagation();
          if (typeof openOppInfo === 'function') openOppInfo(p.profile || { nick: p.name, guest: true });
        };
      }
      body.appendChild(nick);
      // 누구인지 한 줄 더 — AI 인지, 몇 레벨인지. 이름만으로는 안 보였다.
      const lv = document.createElement('span'); lv.className = 'gp-lv';
      lv.textContent = p.isBot ? 'AI' : (p.profile ? 'Lv.' + p.profile.level : '게스트');
      body.appendChild(lv);
      // 칭호 — 산 꾸밈이 판에서 안 보이면 살 이유가 없다
      if (p.profile && p.profile.titleInfo && typeof titleTag === 'function') {
        const t = document.createElement('span'); t.className = 'q-stitle';
        t.innerHTML = titleTag(p.profile.titleInfo);
        body.appendChild(t);
      }
      plate.appendChild(body);
      // 가진 칩 — 값을 부르려면 남이 얼마나 쥐었는지가 제일 먼저 보여야 한다
      const ch = chipTag(p.chips, false);
      if (p.income) { const inc = document.createElement('span'); inc.className = 'q-inc'; inc.textContent = `+${p.income}`; inc.title = '금고 — 매 턴 받는 칩'; ch.appendChild(inc); }
      floatIncome(ch, i);
      bar.appendChild(tm); bar.appendChild(plate); bar.appendChild(ch);

      // ② 그 사람 앞 — 딴 카드와 이번 경매에서의 모습
      const front = document.createElement('div'); front.className = 'q-sfront';
      const acq = document.createElement('div'); acq.className = 'q-oacq';
      if (p.acq.length >= 7) acq.classList.add('tight');
      const oin = document.createElement('div'); oin.className = 'q-acqin';
      for (const g of acqPile(p.acq)) { markNewCards(g, i); oin.appendChild(g); }
      acq.appendChild(oin);
      fitBoxes.push(acq);
      const bid = document.createElement('div'); bid.className = 'q-bslot' + (i === winner ? ' win' : '');
      const badge = bidBadge(i);
      if (badge) bid.appendChild(badge);
      front.appendChild(acq); front.appendChild(bid);

      d.appendChild(bar); d.appendChild(front);
      opps.appendChild(d);
    }

    // 경매 매트
    const me = s.seats[mySeat];
    const iAmAuc = s.auctioneer === mySeat;
    $('q-center').innerHTML = ''; $('q-offer').innerHTML = '';
    if (a) {
      // 빈 자리와 뒷면을 구분한다 — 아직 아무것도 없는데 뒷면이 깔려 있으면
      // "이미 카드가 놓였다" 로 잘못 읽힌다.
      $('q-center').appendChild(a.center ? card4(a.center) : slotHole());
      $('q-offer').appendChild(a.offered ? card4(a.offered) : slotHole());
      // 덱 카드·출품 카드가 "방금" 공개된 순간에만 뒤집기 연출을 준다
      const cid = a.center ? a.center.id : null;
      const oid = a.offered ? a.offered.id : null;
      if (cid && cid !== fx.centerId) { play($('q-center').firstElementChild, 'anim-reveal'); sfx('flip'); }
      if (oid && oid !== fx.offerId) play($('q-offer').firstElementChild, 'anim-reveal');
      fx.centerId = cid; fx.offerId = oid;

      // 경매 방식은 턴바에. 이름은 2인전·트웰브와 같게 쓴다 ('오픈 경매'·'클로즈 경매')
      const tag = a.tiebreak ? ['⚔️', '동점 경쟁']
                : a.type === 'open' ? ['👁', '오픈 경매']
                : a.type === 'close' ? ['🙈', `클로즈 경매 · ${a.closeP}칩`] : null;
      if (tag) $('q-typeTag').innerHTML = (typeof ico === 'function' ? ico(tag[0]) : tag[0]) + ' ' + tag[1];
      else $('q-typeTag').textContent = '';
    } else {
      $('q-center').appendChild(slotHole());
      $('q-offer').appendChild(slotHole());
      $('q-typeTag').textContent = '';
    }
    // 지금 값 — 경매대 오른쪽. 누가 쥐고 있는지도 같이.
    const pr = $('q-price');
    if (pr) {
      let big = '–', sub = '';
      if (a && (s.phase === 'open' || (s.phase === 'settled' && a.type === 'open') || a.tiebreak)) {
        big = a.price ? coin() + a.price : coin() + '0';
        sub = a.high !== null && a.high !== undefined ? nm(a.high) : '부른 사람 없음';
      } else if (a && a.type === 'close') { big = coin() + a.closeP; sub = '진행자가 부른 값'; }
      if ((s.phase === 'settled' || s.phase === 'game_over') && s.result && a) { big = s.result.price ? coin() + s.result.price : '무료'; sub = nm(s.result.winner) + ' 낙찰'; }
      const sig = big + '|' + sub;
      if (pr.dataset.sig !== sig) {
        const bumped = pr.dataset.sig && a && a.price && pr.dataset.price !== String(a.price);
        pr.dataset.sig = sig; pr.dataset.price = String(a ? a.price : '');
        pr.innerHTML = `<b>${big}</b><span>${typeof esc === 'function' ? esc(sub) : sub}</span>`;
        if (bumped) play(pr, 'bump');
      }
    }

    // 내 자리 앞 — 고르는 중인 출품 카드, 또는 이번 경매에서의 내 모습
    const mb = $('q-mybid'); mb.innerHTML = '';
    mb.className = (winner === mySeat ? 'win' : '');
    const myBadge = s.watching ? null : bidBadge(mySeat);
    if (myBadge) mb.appendChild(myBadge);

    if (winner >= 0 && fx.settledTurn !== s.turn) {
      fx.settledTurn = s.turn;
      const box = winner === mySeat ? mb
        : (opps.children[oppSeats.indexOf(winner)] || null);
      const slot = box && (box === mb ? mb : box.querySelector('.q-bslot'));
      if (slot) {
        const st = document.createElement('div');
        st.className = 'q-winstamp'; st.textContent = 'WIN';
        slot.appendChild(st);
      }
      sfx('chips');   // 칩이 은행으로 쓸려 간다
    }

    // 내 획득 더미 — 상대들과 같은 형식으로 보여준다
    const my = $('q-myacq'); my.innerHTML = '';
    const meLabel = document.createElement('span');
    meLabel.className = 'q-melabel';
    if (iAmAuc) meLabel.innerHTML = (typeof rankIco === 'function' ? rankIco('👑') : '👑') + ' 나 (진행자)';
    else meLabel.textContent = '나';
    my.appendChild(meLabel);
    const myChips = chipTag(me.chips, true);
    if (me.income) { const inc = document.createElement('span'); inc.className = 'q-inc'; inc.textContent = `+${me.income}`; inc.title = '금고 — 매 턴 받는 칩'; myChips.appendChild(inc); }
    floatIncome(myChips, mySeat);
    my.appendChild(myChips);
    const myin = document.createElement('div'); myin.className = 'q-acqin';
    for (const g of acqPile(me.acq)) { markNewCards(g, 'me'); myin.appendChild(g); }
    my.appendChild(myin);
    // 이름표·칩이 먹는 폭은 카드 자리가 아니다 — 빼고 재야 제대로 줄어든다
    my.dataset.pad = String(Math.ceil(meLabel.getBoundingClientRect().width + myChips.getBoundingClientRect().width) + 14);
    fitBoxes.push(my);
    if (incomeNow && s.income && s.income.some((v) => v > 0)) sfx('chip');

    // 상태 문구 + 누를 수 있는 것
    let msg = '', pickMode = null, act = null, head = '', tail = '';
    const iAmSpec = q4Spec || s.watching;
    const aucName = s.seats[s.auctioneer].name;
    if (s.phase === 'round') msg = `${s.turn}턴 — 덱에서 카드를 공개합니다`;
    else if (s.phase === 'offer') {
      if (iAmAuc) {
        msg = s.turn === 1 ? '내가 진행자! 첫 경매는 오픈이에요. 내놓을 카드를 고르세요'
                           : '내가 진행자! 공개 카드와 함께 내놓을 카드를 고르세요';
        pickMode = 'offer';
      } else msg = `${aucName} 님이 출품하는 중…`;
    }
    else if (s.phase === 'choose_type') {
      if (iAmAuc) { msg = s.canClose ? '경매 방식을 고르세요' : '칩이 2개 안 돼 오픈 경매만 열 수 있어요'; act = 'type'; }
      else msg = `${aucName} 님이 방식을 고르는 중…`;
    }
    else if (s.phase === 'open' && a) {
      if (a.tiebreak) head = '동점 경쟁';
      if (a.turnSeat === mySeat) {
        msg = a.high === null ? '내 차례 — 먼저 값을 불러 보세요'
                              : `내 차례 — ${nm(a.high)} ${a.price}칩. 더 부를까요?`;
        act = 'raise';
      } else {
        msg = `${nm(a.turnSeat)} 차례` + (a.high === null ? ' · 아직 아무도 안 불렀어요' : ` · 지금 ${a.price}칩 (${nm(a.high)})`);
        if (a.out.includes(mySeat) && (!a.tiebreak || (a.buyers || []).includes(mySeat))) tail = '(나는 포기)';
      }
    }
    else if (s.phase === 'answer' && a) {
      const P = a.closeP;
      if (iAmAuc) msg = `${P}칩 클로즈 — 상대들이 몰래 답하는 중… (${a.answered.length}/${s.n - 1})`;
      else if (a.myAnswer === null || a.myAnswer === undefined) {
        msg = `${aucName} 님이 ${P}칩을 불렀어요. ${P + 1}칩에 살까요? (다른 사람 답은 안 보여요)`;
        act = 'answer';
      }
      else if (!a.myAnswer && me.chips < P + 1) msg = `칩이 모자라 이번엔 못 사요 — 기다리는 중…`;
      else msg = `답했어요 — 다른 사람을 기다리는 중… (${a.answered.length}/${s.n - 1})`;
    }
    else if (s.phase === 'settled' && s.result) {
      const r = s.result;
      const who = r.winner === mySeat && !s.watching ? '내가' : s.seats[r.winner].name + ' 님이';
      // 번역 짝을 맞추려고 문장 틀은 셋뿐이다 — '내가 …' / '○○ 님이 …'
      if (r.free) msg = `아무도 안 불러서 ${who} 공짜로 가져가요!`;
      else if (r.type === 'close' && !r.tiebreak && r.winner === s.auctioneer)
        msg = `아무도 안 사서 ${who} ${r.price}칩에 가져가요`;
      else msg = `${who} ${r.price}칩에 낙찰!`;
    }
    else if (s.phase === 'game_over') msg = '게임 끝!';
    // 남의 차례를 기다리는 중이면 남은 시간을 같이 보여준다.
    // 예전엔 이게 없어서 "왜 안 넘어가지" 하고 멈춘 줄 알았다.
    // 문구는 조각으로 나눠 붙인다(머리 · 본문 · 꼬리 · 남은 초). 한 줄로 이으면
    // 조합마다 번역 틀이 따로 있어야 해서, 하나라도 빠지면 한국어로 남는다.
    let secs = '';
    if (s.waitSeat !== null && s.waitSeat !== undefined && s.waitSeat !== mySeat
        && typeof s.waitLeft === 'number' && s.waitLeft <= 20 && !s.over) secs = `(${s.waitLeft}초)`;
    // 칸이 flex 라 조각을 바로 넣으면 저마다 기둥이 된다 — 한 줄 안에 담는다
    const box = $('q-status'); box.textContent = '';
    const stEl = document.createElement('span'); box.appendChild(stEl);
    const bit = (cls, t) => { const e = document.createElement('span'); e.className = cls; e.textContent = t; stEl.appendChild(e); };
    if (head) bit('q-shead', head);
    stEl.appendChild(document.createTextNode(msg));
    if (tail) bit('q-stail', tail);
    if (secs) bit('q-ssecs', secs);
    if (iAmSpec) { pickMode = null; act = null; }
    paintActs(act);


    // ── 내 손패 ──
    // 고르기와 내기를 나눴다. 예전엔 카드를 누르는 순간 바로 나가서,
    // 잘못 눌러도 되돌릴 수 없고 서버 상태가 도착해 손패가 다시 그려지는
    // 순간에 탭이 통째로 사라졌다 ("카드가 안 내진다").
    //
    // 손패를 매번 다시 만들지도 않는다. 상태는 자주 오는데 그때마다 DOM 을
    // 갈아엎으면 누르는 도중에 대상이 사라진다. 내용이 바뀔 때만 다시 만든다.
    curPick = pickMode;            // 확정 버튼이 무엇을 낼지 알아야 한다
    const hand = $('q-myhand');
    const sorted = [...s.myHand].sort(byKind);
    const handSig = sorted.map((c) => c.id).join(',') + '|' + (pickMode || '');
    if (fx.handSig !== handSig) {
      fx.handSig = handSig;
      hand.innerHTML = '';
      for (const c of sorted) {
        const el = card4(c, {
          pick: !!pickMode,
          onPick: (card) => {
            if (!pickMode) return;
            sel4 = (sel4 && sel4.id === card.id) ? null : card;   // 다시 누르면 해제
            sfx('select');
            paintSel();
          },
        });
        // 2인전과 같은 부채꼴 — 카드를 칸에 담아야 회전·겹침이 카드 자체 transform 과 안 부딪힌다
        const slot = document.createElement('div');
        slot.className = 'fan-slot';
        slot.appendChild(el);
        hand.appendChild(slot);
      }
      if (typeof fanRow === 'function') fanRow(hand, false);
    }
    // 고른 카드가 손패에서 사라졌으면(냈거나 판이 바뀌었으면) 선택도 푼다
    if (sel4 && !sorted.some((c) => String(c.id) === String(sel4.id))) sel4 = null;
    if (!pickMode) sel4 = null;
    paintSel();
    // 첫 손패는 덱에서 한 장씩 날아오게 — 2인전과 같은 연출.
    // 예전엔 가운데 '공개 카드' 칸에서 나오고 내 몫만 날아왔다. 카드는 덱에서
    // 나오는 것이고, 나눠준다면 다 같이 받아야 "나눠준다" 로 읽힌다.
    if (!fx.dealt && sorted.length >= G4.HAND && s.turn <= 1) {
      fx.dealt = true;
      const STAGGER = 55;
      const deck = $('q-deckstack');
      const seats = [...document.querySelectorAll('#q-opps .q-seat')];
      const players = seats.length + 1;
      // 화투·포커처럼 한 바퀴씩 돈다 — 한 사람에게 몰아주지 않는다.
      // 나는 맨 끝에 받는다(진행자가 자기 것을 마지막에 놓는 그 순서).
      if (typeof dealFromDeck === 'function')
        dealFromDeck(deck, hand.querySelectorAll('.card'),
                     { stagger: STAGGER, offset: seats.length, step: players });
      q4DealGhosts(deck, seats, { count: sorted.length, players, stagger: STAGGER });
      // 소리는 네 사람 몫을 다 울린다 — 내 것만 울리면 남에게 가는 카드가 조용하다
      for (let i = 0; i < sorted.length * players; i++)
        setTimeout(() => sfx('deal'), 30 + i * STAGGER);
    }

    // ── 덱 ── 턴마다 저절로 한 장 공개된다 (누를 것 없음)
    renderDeck4(s.deckLeft);

    // 남은 카드 패널이 열려 있으면 같이 갱신
    if ($('q-leftPanel').classList.contains('show')) renderLeft();

    // 획득 더미 줄이기 — 다 그린 다음에 재야 폭·높이가 확정돼 있다.
    // (그리는 도중에 재면 아직 붙지 않은 형제 때문에 값이 틀어진다)
    for (const box of fitBoxes) fitAcq(box);

    // 효과음 — 값이 오르면 칩 소리, 누가 빠지면 똑딱, 몰래 답하면 카드 놓는 소리
    if (a) {
      const bs = { turn: s.turn, price: a.price, high: a.high, out: a.out.length, ans: a.answered.length };
      const o = fx.bidSig;
      if (o && o.turn === bs.turn) {
        if (bs.price > o.price || (bs.high !== o.high && bs.high !== null)) sfx('chip');
        else if (bs.out > o.out) sfx('tick');
        else if (bs.ans > o.ans) sfx('place');
      }
      fx.bidSig = bs;
    }
    if (s.phase !== prevPhase || s.turn !== prevTurn) {
      if (s.phase === 'choose_type' && iAmAuc) sfx('select');
      prevPhase = s.phase; prevTurn = s.turn;
    }
    // 자리·경매대를 다 그린 뒤라야 판이 그것들을 품는 크기로 잡힌다
    try { if (window.quadLayTable) window.quadLayTable(); } catch (_) {}
    try { if (window.tutTickWith) window.tutTickWith(s); } catch (_) {}   // 실전 튜토리얼
  }

  // 아직 안 나온 카드 — 내 손패·모든 획득 더미·공개된 경매품을 빼고 남은 것.
  // 전부 내가 화면에서 볼 수 있는 정보라 따로 세어주는 것뿐이고, 남의 손패를 보여주는 게 아니다.
  function renderLeft() {
    const box = $('q-left'); if (!box || !q4) return;
    // 카드에 등급이 없어 한 장 한 장을 가릴 수 없다 — 종류마다 몇 장이 어디 있는지 센다.
    // 내가 쥔 카드와 이미 나온 카드는 뜻이 달라서 따로 표시한다.
    const tally = (list) => { const m = {}; for (const c of list) m[c.kind] = (m[c.kind] || 0) + 1; return m; };
    const shown = [];
    for (const st of q4.seats) shown.push(...st.acq);
    const a = q4.auction;
    if (a && a.winner === null) { if (a.center) shown.push(a.center); if (a.offered) shown.push(a.offered); }
    const gone = tally(shown), mine = tally(q4.myHand);
    const spec = (G4.SPECS[q4.n] || G4.SPECS[4]).cards;
    box.innerHTML = '';
    for (const [kind, max] of spec) {
      const row = document.createElement('div'); row.className = 'q-lrow';
      const kk = document.createElement('b'); kk.className = 'q-ck'; kk.dataset.k = kind;
      kk.textContent = isSp(kind) ? { V: '금고', W6: '6×2', D46: '4/6' }[kind] : kind;
      row.appendChild(kk);
      const gs = document.createElement('div'); gs.className = 'q-lgs';
      const g = gone[kind] || 0, m = mine[kind] || 0;
      for (let k = 0; k < max; k++) {
        const el = document.createElement('span');
        el.className = 'q-lg' + (k < g ? ' gone' : k < g + m ? ' mine' : '');
        gs.appendChild(el);
      }
      const left = document.createElement('span'); left.className = 'q-lleft';
      left.textContent = `${max - g - m}장`;
      gs.appendChild(left);
      row.appendChild(gs);
      box.appendChild(row);
    }
  }
  window.q4ToggleLeft = function () {
    const p = $('q-leftPanel');
    p.classList.toggle('show');
    if (p.classList.contains('show')) renderLeft();
  };

  // 시간을 다 써서 지는 자리. 서버가 주는 순위표가 없으므로(그 판은 남은
  // 사람들끼리 계속 돈다) 짧게 사실만 적는다.
  function showTimeoutOver() {
    { const lp = $('q-leftPanel'); if (lp) lp.classList.remove('show'); }
    q4Live = false;
    try { localStorage.removeItem('ff_q4'); } catch (_) {}
    $('q-status').textContent = '';
    $('q-otitle').textContent = '시간 초과 — 몰수패';
    const rk = $('q-orank'); rk.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'q-rrow me';
    row.textContent = '제한 시간을 다 써서 이 판은 졌어요.';
    rk.appendChild(row);
    const note = $('q-rpnote');
    if (note) { note.textContent = '남은 판은 다른 자리끼리 계속됩니다.'; note.style.display = ''; }
    sfx('defeat');
    $('q-over').classList.add('show');
  }

  function showOver(s) {
    // 남은 카드 표가 열려 있으면 결과창을 덮는다 — 판이 끝나면 걷는다
    { const lp = $('q-leftPanel'); if (lp) lp.classList.remove('show'); }
    const order = (s.over.order && s.over.order.length) ? s.over.order : null;
    const rank = order || [s.over.winner, ...s.seats.map((_, i) => i).filter((i) => i !== s.over.winner)];
    // 세트로 끝났나, 덱이 떨어져 끝났나 — 어떻게 끝났는지가 한 줄 있어야 결과가 읽힌다
    const how = s.over.reason === 'set'
      ? `${s.seats[s.over.winner].name} 세트 완성!`
      : '덱이 떨어졌어요 — 세트에 가장 가까운 사람이 이겨요';
    if (s.over.winner === mySeat)
      $('q-otitle').innerHTML = (typeof ico === 'function' ? ico('🏆') : '🏆') + ' 승리!';
    else $('q-otitle').textContent = '아쉽네요…';
    const hw = document.createElement('div'); hw.className = 'q-ohow'; hw.textContent = how;
    $('q-otitle').appendChild(hw);
    const rk = $('q-orank'); rk.innerHTML = '';
    rank.forEach((seat, idx) => {
      const p = s.seats[seat];
      const row = document.createElement('div');
      row.className = 'q-rrow' + (seat === mySeat ? ' me' : '');
      const pos = document.createElement('span');
      pos.className = 'q-rpos';
      const medal = ['🥇', '🥈', '🥉'][idx];
      const mArt = medal && typeof rankIco === 'function' && rankIco(medal);
      if (mArt && mArt.indexOf('<') === 0) pos.innerHTML = mArt;
      else pos.textContent = medal || String(idx + 1);
      const nm = document.createElement('span'); nm.style.flex = '1'; nm.style.textAlign = 'left';
      nm.textContent = p.name;
      const info = document.createElement('span');
      info.className = 'q-rinfo';
      info.innerHTML = `<span>${p.need <= 0 ? '세트 완성' : `완성까지 ${p.need}장`}</span> · ${coin()}${p.chips}`;
      row.appendChild(pos); row.appendChild(nm); row.appendChild(info);
      // 온라인 멀티에서만 RP가 움직인다 (AI 자리는 애초에 계산에서 빠진다)
      const rp = s.rp && s.rp[seat];
      if (rp) {
        const d = document.createElement('span');
        d.className = 'q-rp ' + (rp.delta > 0 ? 'up' : rp.delta < 0 ? 'down' : 'flat');
        d.textContent = (rp.delta > 0 ? '+' : '') + rp.delta + ' RP';
        row.appendChild(d);
      }
      rk.appendChild(row);
    });
    const note = $('q-rpnote');
    if (note) {
      note.textContent = s.rp ? '' : '※ 사람 2명 이상인 온라인 멀티에서만 RP가 반영돼요';
      note.style.display = s.rp ? 'none' : '';
    }
    sfx(s.over.winner === mySeat ? 'victory' : 'defeat');
    $('q-over').classList.add('show');
  }

  // ── 진입 / 종료 ─────────────────────────────────────────────────────────
  window.q4Open = function () {
    if (typeof closeModePanels === 'function') closeModePanels();
    const m = document.getElementById('quadModal');
    if (m) m.classList.add('show');
  };
  window.q4Close = function () {
    const m = document.getElementById('quadModal');
    if (m) m.classList.remove('show');
  };

  // ── 빠른대전 — 곧바로 게임 화면에 앉아서 기다린다 ────────────────────────
  // 대기 화면 켜기 — 빠른대전과 초대 수락이 같이 쓴다.
  // 예전엔 이 절차가 q4Quick 안에만 있어서, 초대를 수락해도 화면이 안 열렸다
  // (q4Open 은 모드 고르는 창만 연다).
  function enterWaiting() {
    if (typeof closeModePanels === 'function') closeModePanels();
    window.q4Close();
    $('q-over').classList.remove('show');
    q4Live = true; q4 = null; q4Room = null; q4Pend = null;
    lastRecv = Date.now(); prevPhase = null; prevTurn = 0;
    document.body.classList.add('quad4', 'q-waiting');
    applySkins4();
    $('q-wait').textContent = '대기 중';
    $('q-status').textContent = '자리에 앉는 중…';
    sfx('deal');
    try { if (typeof startBGM === 'function') startBGM('game'); } catch (_) {}
  }

  window.q4Quick = function () {
    enterWaiting();
    socket.emit('g4_quick', { nick: typeof getNick === 'function' ? getNick() : '나' });
  };
  // 방 안에서 시작 — 지금 앉아 있는 인원으로 몇 인전인지 결정된다
  window.q4StartNow = function () { sfx('select'); socket.emit('g4_startnow'); };

  // 솔로. n 을 안 주면 직전에 하던 인원으로 (결과창의 "한 판 더!" 가 이걸 쓴다)
  let lastSoloN = 4;

  // 상대가 판 둘레 어디에 앉는가. 나는 늘 아래라, 나머지를 왼쪽부터 시계 방향으로
  // 좌 → 상 → 우 에 앉힌다.
  // 셋이 붙는 판은 좌·상 을 쓴다 — 한 사람은 왼쪽, 한 사람은 맞은편이다.
  // 예전엔 좌·우로 앉혀 마주 보는 사람이 아무도 없었다.
  const SEAT_AT = { 2: ['at-l', 'at-t'], 3: ['at-l', 'at-t', 'at-r'] };
  const seatAt = (n, i) => (SEAT_AT[n] || SEAT_AT[3])[i] || 'at-t';

  // 상대에게 가는 카드. 상대는 손패를 안 보여 주므로 날아가는 카드만 잠깐
  // 그렸다 지운다 — 남는 요소가 없어야 판이 무거워지지 않는다.
  function q4DealGhosts(deckEl, seats, o) {
    if (!deckEl || !seats.length) return;
    const d = deckEl.getBoundingClientRect();
    if (!d.width) return;
    const cx = d.left + d.width / 2, cy = d.top + d.height / 2;
    for (let p = 0; p < seats.length; p++) {
      const r = seats[p].getBoundingClientRect();
      if (!r.width) continue;
      const tx = Math.round(r.left + r.width / 2 - cx);
      const ty = Math.round(r.top + r.height / 2 - cy);
      for (let i = 0; i < o.count; i++) {
        const g = document.createElement('div');
        g.className = 'q-deal-ghost';
        g.style.left = Math.round(cx - 15) + 'px';
        g.style.top = Math.round(cy - 21) + 'px';
        document.body.appendChild(g);
        const delay = (i * o.players + p) * o.stagger;
        setTimeout(() => { g.style.transform = `translate(${tx}px, ${ty}px) scale(.55)`; g.style.opacity = '0'; }, delay);
        setTimeout(() => g.remove(), delay + 560);
      }
    }
  }

  // 이모트 버튼은 한 벌뿐이다. 화면을 옮길 때 통째로 데려간다 —
  // 두 벌을 두면 하나가 로비에 남아 판 위에 겹친다.
  function q4MoveEmote(into) {
    const wrap = document.getElementById('emoteWrap');
    const slot = document.getElementById(into);
    if (wrap && slot && wrap.parentElement !== slot) slot.appendChild(wrap);
  }

  // 결과창의 "한 판 더!". 사람들과 한 판이었으면 그 자리 그대로 다시 하자고
  // 말한다 — 예전에는 무조건 솔로를 열어서 같이 하던 사람들과 헤어졌다.
  window.q4Again = function () {
    if (!q4WasMulti) return window.q4Start();
    if (q4RematchOn) return;
    q4RematchOn = true;
    sfx('select');
    socket.emit('g4_rematch');
    markRematch(0, 0, '기다리는 중…');
  };
  // 몇 명이 눌렀는지를 단추에 적는다. 2인전의 그 표시와 같은 결이다.
  function markRematch(ready, of, msg) {
    const b = $('q-again'); if (!b) return;
    b.classList.toggle('wanted', !!(ready || msg));
    b.textContent = msg ? '한 판 더 — ' + msg
                   : (of ? `한 판 더! (${ready}/${of})` : '한 판 더!');
  }
  window.q4Start = function (n) {
    lastSoloN = (Number(n) === 3) ? 3 : (Number(n) === 4 ? 4 : lastSoloN);
    if (typeof closeModePanels === 'function') closeModePanels();
    window.q4Close();
    $('q-over').classList.remove('show');
    document.body.classList.add('quad4');
    applySkins4();
    q4Live = true; q4Room = null; lastRecv = Date.now(); prevPhase = null; prevTurn = 0;
    $('q-status').textContent = '자리 배치 중…';
    sfx('deal');
    try { if (typeof startBGM === 'function') startBGM('game'); } catch (_) {}   // 2인전과 같은 배경음악
    q4MoveEmote('q-emoteSlot');   // 왼쪽 아래 — 2인전과 같은 자리
    if (typeof scheduleRelayout === 'function') scheduleRelayout();   // 판을 열었으면 테이블을 잰다
    socket.emit('g4_start', { nick: typeof getNick === 'function' ? getNick() : '나', n: lastSoloN });
  };

  // 나가기는 한 번 묻는다. 예전엔 누르는 즉시 나가서, 잘못 눌러도 판이 끝났다.
  // 진행 중이면 자리가 AI 로 넘어간다는 것도 알려 준다.
  window.q4AskQuit = function () {
    const playing = !!(q4 && !q4.over);
    if (typeof askConfirm !== 'function') { window.q4Quit(); return; }
    askConfirm({
      icon: '\uD83D\uDEAA', title: '게임에서 나갈까요?',
      desc: playing ? '진행 중인 판은 내 자리를 AI 가 이어받아요.' : '로비로 돌아갑니다.',
      yes: '나가기', no: '계속하기',
    }, () => window.q4Quit());
  };

  window.q4Quit = function () {
    // 다인전은 새로고침 없이 화면만 숨긴다 — 판이 통째로 갈리는 순간을
    // 막으로 덮어 준다. 2인전은 fastReload 가 같은 일을 한다.
    if (typeof veil === 'function') { veil(() => q4QuitNow()); return; }
    q4QuitNow();
  };
  function q4QuitNow() {
    if (q4Spec) socket.emit('g4_spec_leave'); else socket.emit('g4_leave');
    q4Spec = false; document.body.classList.remove('q-spec');
    // 2인전은 나갈 때 페이지를 새로고침해서 저절로 로비 곡으로 돌아간다.
    // 다인전은 화면만 숨기므로 직접 로비 곡으로 바꿔 준다.
    try { if (typeof startBGM === 'function') startBGM('lobby'); } catch (_) {}
    q4MoveEmote('game');   // 2인전 화면이 제자리다 — 안 돌려주면 거기서 사라진다
    q4Live = false; q4 = null; q4Room = null; q4Pend = null;
    try { localStorage.removeItem('ff_q4'); } catch (_) {}
    $('q-startPanel').classList.remove('show');
    document.body.classList.remove('quad4', 'q-n3', 'q-waiting');
    $('q-over').classList.remove('show');
  }

  // ── 누를 것들 ─────────────────────────────────────────────────────────
  // 손패 아래 한 줄(#q-actions)에 지금 누를 것만 띄운다. 한 번 누르면 상태가
  // 바뀔 때까지 단추를 걷는다 — 연타로 두 번 올리는 일이 없게.
  let closePick = null;    // 클로즈 값을 고르는 중이면 그 값
  let sentSig = null;      // 이 상태에서 이미 하나 보냈다
  function sendOnce(payload) {
    sentSig = stateSig();
    paintActs(null);
    sendAct(payload);
  }
  function paintActs(act) {
    if (act && sentSig && sentSig === stateSig()) act = null;
    const s = q4, a = s && s.auction, me = s && s.seats[mySeat];
    const show = (id, on) => { const el = $(id); if (el) el.classList.toggle('show', !!on); };
    if (act !== 'type') closePick = null;
    show('q-typeBtns', act === 'type' && closePick === null);
    show('q-closePick', act === 'type' && closePick !== null);
    show('q-raiseBtns', act === 'raise');
    show('q-ansBtns', act === 'answer');
    if (act === 'type') {
      const cb = $('q-closeBtn'); if (cb) cb.disabled = !s.canClose;
      if (closePick !== null) {
        $('q-closeP').innerHTML = coin() + closePick;
        $('q-closeDn').disabled = closePick <= 2;
        $('q-closeUp').disabled = closePick + 2 > me.chips;
        $('q-closeHint').textContent = `상대는 ${closePick + 1}칩에 살 수 있어요`;
      }
    }
    if (act === 'raise') {
      const box = $('q-raiseBtns'); box.innerHTML = '';
      for (const k of [1, 2, 5]) {
        const to = a.price + k;
        const b = document.createElement('button');
        b.className = 'q-tbtn q-raise';
        b.innerHTML = coin() + to;
        b.disabled = to > me.chips;
        b.onclick = () => { if (!b.disabled) { sfx('chip'); sendOnce({ type: 'raise', to }); } };
        box.appendChild(b);
      }
      const ps = document.createElement('button');
      ps.className = 'q-tbtn q-pass'; ps.textContent = '포기';
      ps.onclick = () => { sfx('tick'); sendOnce({ type: 'pass' }); };
      box.appendChild(ps);
    }
    if (act === 'answer') {
      const P = a.closeP, bb = $('q-buyBtn');
      bb.innerHTML = `${coin()}${P + 1} 에 산다`;
      bb.disabled = me.chips < P + 1;
    }
  }
  window.q4Type = function (t) {
    // 내 자리는 0번이 아닐 수 있다(멀티). 0 으로 박아 두면 1·2·3번 자리 사람은
    // 진행자가 돼도 방식을 고를 수 없다.
    if (!q4 || q4.phase !== 'choose_type' || q4.auctioneer !== mySeat) return;
    if (t === 'close') {
      if (!q4.canClose) return;
      // 처음 값은 2 — 싸게 부를수록 남이 사 가기 쉽다. 고르고 확정해야 나간다.
      const chips = q4.seats[mySeat].chips;
      closePick = Math.min(Math.max(2, closePick || 2), chips - (chips % 2));
      sfx('select');
      return paintActs('type');
    }
    sfx('select');
    sendOnce({ type: 'auctionType', val: 'open' });
  };
  window.q4CloseStep = function (d) {
    if (closePick === null || !q4) return;
    const chips = q4.seats[mySeat].chips;
    const v = closePick + d;
    if (v < 2 || v > chips) return;
    closePick = v; sfx('tick'); paintActs('type');
  };
  window.q4CloseBack = function () { closePick = null; paintActs('type'); };
  window.q4CloseGo = function () {
    if (closePick === null || !q4 || q4.phase !== 'choose_type') return;
    const price = closePick;
    sfx('place');
    sendOnce({ type: 'auctionType', val: 'close', price });
  };
  window.q4Answer = function (buy) {
    if (!q4 || q4.phase !== 'answer') return;
    sfx(buy ? 'chip' : 'tick');
    sendOnce({ type: 'answer', buy: !!buy });
  };

  // ── 소켓 ────────────────────────────────────────────────────────────────
  // 모바일에서 화면을 잠그거나 네트워크가 깜빡이면 소켓이 끊긴다.
  // 서버가 판을 잠시 보관해 주므로, 다시 붙으면 이어서 진행한다.
  function bind() {
    if (typeof socket === 'undefined' || !socket) return setTimeout(bind, 200);

    socket.on('g4_begin', (d) => {
      if (typeof dcArrived === 'function') dcArrived();
      // 판이 시작됐는데 화면이 안 켜져 있으면 g4_state 를 전부 버려서
      // 카드도 못 고르고 배팅도 못 한다. 어떤 경로로 들어왔든 여기서 켠다.
      if (!q4Live) {
        const wc = document.getElementById('waitCard'); if (wc) wc.style.display = 'none';
        enterWaiting();
      }
      q4Spec = !!d.watching;                       // 관전이면 아무것도 못 낸다
      document.body.classList.toggle('q-spec', q4Spec);
      q4Room = d.roomId; mySeat = d.me || 0; lastRecv = Date.now(); q4Pend = null;
      q4WasMulti = !d.solo;                        // "한 판 더" 가 어디로 갈지를 가른다
      q4RematchOn = false; markRematch(0, 0);
      // 앱을 껐다 켜도 돌아올 수 있게 남겨 둔다. 기억에만 두면 새로고침 한 번에
      // 돌아갈 방을 잊어버린다.
      // 방 번호가 없으면(그물 없이 두는 판) 적어 두지 않는다 — 적어 두면
      // 판이 끝난 뒤에도 "게임 중" 으로 남아 로비에서 자꾸 되돌아가려 한다.
      try {
        if (q4Room) localStorage.setItem('ff_q4', JSON.stringify({ room: q4Room, seat: mySeat }));
        else localStorage.removeItem('ff_q4');
      } catch (_) {}
      resetFx();   // 새 판 — 딜·뒤집기 연출을 처음부터 다시
      $('q-startPanel').classList.remove('show');
      const total = d.n || (d.seats || []).length || 4;
      const humans = (d.seats || []).filter((x) => !x.isBot).length;
      if (!d.solo) $('q-status').textContent = `${total}인전 · 사람 ${humans}명 · AI ${total - humans}명`;
    });
    // 대기방 — 게임 화면에 앉은 채로 자리가 차는 걸 본다
    socket.on('g4_room', (d) => {
      // 2인 방에서 다인전으로 바꾸면 서버가 우리를 자리 넷짜리 대기방에 옮겨 놓는다.
      // 그때는 아직 다인전 화면이 아니므로 여기서 열어 준다 — 안 그러면 아무 일도 안 일어난 것처럼 보인다.
      if (!q4Live) {
        const wc = document.getElementById('waitCard'); if (wc) wc.style.display = 'none';
        const lm = document.getElementById('lobbyMain'); if (lm) lm.style.display = '';
        enterWaiting();
      }
      q4Pend = d; q4Room = null; lastRecv = Date.now(); renderPending();
    });
    socket.on('g4_cancelled', () => {});
    socket.on('g4_state', (s) => {
      if (!q4Live) return;
      // 판이 돌아왔다 — 끊김 덮개를 걷는다. 예전엔 2인전 판이 열릴 때만 걷어서,
      // 다인전은 멀쩡히 이어졌는데도 덮개가 그대로 남아 있었다.
      if (typeof dcArrived === 'function') dcArrived();
      q4 = s; lastRecv = Date.now(); noteState(); render();
    });
    socket.on('g4_over', (s) => {
      if (!q4Live) return;
      q4 = s; lastRecv = Date.now(); render(); setTimeout(() => showOver(s), 600);
    });
    socket.on('g4_rematch_wanted', (d) => {
      if (!q4Live) return;
      markRematch((d && d.ready) || 0, (d && d.of) || 0, q4RematchOn ? '기다리는 중…' : null);
      if (!q4RematchOn && typeof toast === 'function') toast('💬 같이 한 판 더 하재요!', 2200);
    });
    socket.on('g4_clock', (d) => { if (q4Live && d) paintClock(d.clock, d.seat); });
    socket.on('g4_invite_res', (d) => {
      const box = $('q-inviteList');
      if (d && d.ok) { box.innerHTML = '<div class="lb-empty">초대를 보냈어요!</div>';
        setTimeout(() => window.q4CloseInvite(), 900); }
      else if (box) box.innerHTML = `<div class="lb-empty">${(d && d.error) || '보내지 못했어요'}</div>`;
    });
    // 초대를 받았다 — 누르는 쪽이 결정한다 (남의 화면을 마음대로 끌어오지 않는다)
    socket.on('g4_invited', (d) => {
      if (!d || !d.roomId) return;
      const from = typeof esc === 'function' ? esc(d.from || '친구') : (d.from || '친구');
      if (typeof askConfirm !== 'function') return;
      askConfirm({ icon: '\uD83D\uDC65', title: `${from} 님이 다인전에 초대했어요`,
                   desc: '수락하면 그 대기방으로 들어갑니다.', yes: '들어가기', no: '거절' },
        () => {
          enterWaiting();
          socket.emit('g4_accept', { roomId: d.roomId, nick: typeof getNick === 'function' ? getNick() : '나' });
        });
    });
    socket.on('g4_error', (m) => { alert(m); window.q4Quit(); });
    // 시간을 다 쓰면 그 자리는 AI 가 넘겨받는다. 판을 끝내지는 않는다 —
    // 한 사람 때문에 나머지가 끝나면 억울하기 때문.
    // 시간을 다 쓰면 서버는 그 자리를 AI 에게 넘기고 소켓을 놓는다. 그러면
    // 이쪽으로는 판 상태가 더 안 오고, 잠시 뒤 자가복구가 "판을 못 찾겠다"
    // 며 g4_gone 을 불러 "접속이 끊겨 판이 종료됐어요" 라고 띄웠다.
    // 끊긴 적이 없는데 끊겼다고 하는 셈이다. 시간을 다 쓴 것은 몰수패다 —
    // 그렇게 적고 여기서 판을 닫는다.
    socket.on('g4_timeout', () => {
      if (!q4Live) return;
      const tm = $('q-timer'); if (tm) { tm.textContent = '0:00'; tm.classList.add('warn'); }
      showTimeoutOver();
    });
    socket.on('g4_gone', () => {
      if (!q4Live) return;
      try { localStorage.removeItem('ff_q4'); } catch (_) {}
      $('q-status').textContent = '연결이 끊겨 판을 이어갈 수 없어요.';
      setTimeout(() => { alert('접속이 끊겨 판이 종료됐어요. 다시 시작해주세요.'); window.q4Quit(); }, 400);
    });
    socket.on('connect', () => {
      if (q4Live && q4Room) return resume();
      // 앱을 껐다 켠 경우 — 기억은 비었지만 남겨 둔 자리가 있을 수 있다
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('ff_q4') || 'null'); } catch (_) {}
      if (saved && saved.room) {
        q4Room = saved.room; mySeat = saved.seat || 0;
        socket.emit('g4_resume', { roomId: q4Room, seat: mySeat });
      }
    });
  }

  function resume() {
    $('q-status').textContent = '다시 연결하는 중…';
    socket.emit('g4_resume', { roomId: q4Room, seat: mySeat });
  }

  // 진행이 멈춘 채 방치되지 않도록 클라이언트도 스스로 확인한다
  setInterval(() => {
    if (!q4Live || !q4Room || !q4 || q4Pend) return;
    if (q4.over) return;
    // 예전엔 "내 차례면 정상" 이라며 여기서 빠져나갔다. 그런데 자리 연결이
    // 끊긴 채 내 차례가 오면 뭘 눌러도 안 나가는 게 바로 그 상황이라,
    // 정작 필요한 순간에 자가복구가 꺼져 있었다. 이제는 내 차례여도 오래
    // 조용하면 한 번 이어 붙인다 — 이어 붙이는 건 판을 건드리지 않는다.
    if (Date.now() - lastRecv < 15000) return;
    resume();
  }, 5000);

  bind();
})();
