// ── 4인전 클라이언트 ──────────────────────────────────────────────────────
// 기존 2인 화면(#game)과 완전히 분리된 #game4 화면을 그린다.
// 서버와는 g4_* 이벤트로만 통신하므로 클래식·아이템전 흐름에 영향이 없다.

(function () {
  let q4 = null;         // 최신 상태
  let q4Live = false;    // 4인전 화면에 있는가
  let q4Room = null;     // 재접속해서 이어하기 위한 방 번호
  let lastRecv = 0;      // 마지막으로 상태를 받은 시각
  let prevPhase = null, prevTurn = 0;   // 효과음을 단계가 바뀔 때만 울리려고
  let mySeat = 0;        // 내 좌석 — 멀티에서는 0이 아닐 수 있다
  let oppSeats = [1, 2, 3];   // 내 다음 자리부터 시계방향 상대들 (3인이면 2명)
  let seatCount = 4;
  const $ = (id) => document.getElementById(id);
  // 소리는 부가 요소다. 아직 초기화 전이거나 재생이 막혀도 게임 진행을 막으면 안 된다.
  const sfx = (n) => { try { if (typeof playSound === 'function') playSound(n); } catch (_) {} };

  // 4인전 전용 특수 카드 — 최강 2-1, 최약 6-13 (2인전은 6-10이라 여기서 따로 판정한다)
  const top4 = (c) => c && c.kind === 2 && c.grade === 1;
  const bot4 = (c) => c && c.kind === 6 && c.grade === 13;

  function card4(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    if (!card) {
      el.classList.add('back');
      el.innerHTML = '<span class="bf flip">FLIP</span><span class="bf flap">FLAP</span>';
      return el;
    }
    el.dataset.kind = card.kind;
    el.dataset.id = card.id;
    const special = top4(card) || bot4(card);
    if (special) el.classList.add('special');
    const top = document.createElement('div');
    top.className = 'c-top';
    const rank = document.createElement('span');
    rank.className = 'c-rank'; rank.textContent = card.grade;
    top.appendChild(rank);
    if (special) {
      const mk = document.createElement('span');
      mk.className = 'c-mark'; mk.textContent = top4(card) ? '👑' : '⚔';
      top.appendChild(mk);
    }
    const num = document.createElement('div');
    num.className = 'c-num'; num.textContent = card.kind;
    el.appendChild(top); el.appendChild(num);
    if (opts.pick) {
      el.classList.add('pick');
      el.addEventListener('click', () => opts.onPick(card));
    }
    return el;
  }

  // 획득 더미 — 2인전과 같이 실제 카드 모양 그대로 보여준다.
  // 종류별로 묶어 겹쳐 쌓되, 등급 배지가 드러날 만큼만 노출해서
  // 몇 종의 몇 번을 가져갔는지 그대로 읽힌다. (상대는 CSS 로 더 작게)
  function acqPile(acq) {
    const groups = {};
    for (const c of acq) (groups[c.kind] = groups[c.kind] || []).push(c);
    const out = [];
    for (const kind of [2, 3, 4, 6]) {
      const g = groups[kind]; if (!g) continue;
      g.sort((a, b) => a.grade - b.grade);
      const done = g.length >= kind, reach = g.length === kind - 1;
      const wrap = document.createElement('div');
      wrap.className = 'q-pg' + (done ? ' done' : reach ? ' reach' : '');
      wrap.dataset.k = kind;
      for (const c of g) wrap.appendChild(card4(c));
      const cnt = document.createElement('span');
      cnt.className = 'q-pn' + (done ? ' done' : reach ? ' reach' : '');
      cnt.textContent = done ? '완성!' : `${g.length}/${kind}`;
      wrap.appendChild(cnt);
      out.push(wrap);
    }
    return out;
  }

  // 시작 전 대기방 — 게임 화면에 앉은 채로 자리가 차는 걸 본다
  let q4Pend = null;
  function renderPending() {
    const p = q4Pend; if (!p) return;
    document.body.classList.toggle('q-n3', p.willBe === 3);
    $('q-turn').textContent = '대기 중';
    $('q-deck').textContent = `${p.count}명 입장`;

    // 상대 자리 — 나를 뺀 3칸. 아직 안 온 자리는 "빈 자리"
    const opps = $('q-opps'); opps.innerHTML = '';
    for (let k = 1; k <= 3; k++) {
      const seat = (p.me + k) % 4;
      const who = p.seats[seat];
      const d = document.createElement('div');
      d.className = 'q-opp' + (who ? '' : ' empty');
      const nm = document.createElement('div');
      nm.className = 'q-oname';
      if (who) { const b = document.createElement('span'); b.className = 'q-human'; b.textContent = '사람'; nm.appendChild(b); }
      nm.appendChild(document.createTextNode(who ? who.name : '빈 자리'));
      const meta = document.createElement('div');
      meta.className = 'q-ometa';
      meta.textContent = who ? '준비 완료' : '기다리는 중…';
      d.appendChild(nm); d.appendChild(meta);
      opps.appendChild(d);
    }
    $('q-oppbids').innerHTML = '';
    $('q-mybid').innerHTML = ''; $('q-mybid').className = '';
    $('q-myacq').innerHTML = '';
    $('q-myhand').innerHTML = '';
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

  // ── 렌더 ────────────────────────────────────────────────────────────────
  function render() {
    if (!q4) return;
    const s = q4, a = s.auction;
    mySeat = (s.me === undefined || s.me === null) ? 0 : s.me;
    seatCount = s.n || s.seats.length || 4;
    document.body.classList.toggle('q-n3', seatCount === 3);
    // 내 다음 자리부터 시계방향. 3인이면 상대가 2명뿐이다.
    oppSeats = Array.from({ length: seatCount - 1 }, (_, k) => (mySeat + k + 1) % seatCount);

    q4Pend = null;
    document.body.classList.remove('q-waiting');
    $('q-startPanel').classList.remove('show');
    $('q-turn').textContent = `${s.turn}턴`;
    $('q-deck').textContent = `덱 ${s.deckLeft}장`;

    // 상단 3명
    const opps = $('q-opps'); opps.innerHTML = '';
    for (const i of oppSeats) {
      const p = s.seats[i];
      const d = document.createElement('div');
      d.className = 'q-opp' + (s.auctioneer === i ? ' auc' : '') + (p.bidded ? ' bidded' : '');
      const nm = document.createElement('div');
      nm.className = 'q-oname';
      if (s.auctioneer === i) { const b = document.createElement('span'); b.className = 'q-obadge'; b.textContent = '진행'; nm.appendChild(b); }
      if (!p.isBot) { const b = document.createElement('span'); b.className = 'q-human'; b.textContent = '사람'; nm.appendChild(b); }
      nm.appendChild(document.createTextNode(p.name));
      const meta = document.createElement('div');
      meta.className = 'q-ometa';
      const need = document.createElement('span');
      need.className = 'q-need' + (p.need <= 1 ? ' r1' : p.need === 2 ? ' r2' : '');
      need.textContent = p.need <= 0 ? '완성!' : `-${p.need}`;
      meta.appendChild(need);
      const hd = document.createElement('span'); hd.textContent = `🂠${p.handLen}`;
      meta.appendChild(hd);
      const acq = document.createElement('div'); acq.className = 'q-oacq';
      for (const c of acqPile(p.acq)) acq.appendChild(c);
      d.appendChild(nm); d.appendChild(meta); d.appendChild(acq);
      opps.appendChild(d);
    }

    // 경매 매트
    const me = s.seats[mySeat];
    const iAmAuc = s.auctioneer === mySeat;
    $('q-center').innerHTML = ''; $('q-offer').innerHTML = '';
    if (a) {
      $('q-center').appendChild(card4(a.center));
      $('q-offer').appendChild(card4(a.offered));       // null 이면 뒷면
      $('q-typeTag').textContent = a.type === 'open' ? '👁 오픈' : a.type === 'closed' || a.type === 'close' ? '🙈 클로즈' : '';
    } else {
      $('q-center').appendChild(card4(null));
      $('q-offer').appendChild(card4(null));
      $('q-typeTag').textContent = '';
    }

    // 배팅 카드는 각자 자기 앞에 놓인다.
    // 아직 안 열린 카드는 뒷면으로 두었다가 공개 시점에 한 번에 뒤집는다.
    const winner = s.result ? s.result.winner : -1;
    const bidView = (seat) => {
      if (!a) return null;
      if (a.bids && a.bids[seat]) return card4(a.bids[seat]);   // 열린 카드
      if (s.seats[seat].bidded) return card4(null);             // 냈지만 아직 뒷면
      return null;
    };
    const ob = $('q-oppbids'); ob.innerHTML = '';
    for (const i of oppSeats) {
      const slot = document.createElement('div');
      slot.className = 'q-bslot' + (i === winner ? ' win' : '');
      const card = bidView(i);
      if (card) {
        slot.appendChild(card);
        if (i === winner) { const l = document.createElement('div'); l.className = 'q-blabel'; l.textContent = '낙찰'; slot.appendChild(l); }
      }
      ob.appendChild(slot);
    }
    const mb = $('q-mybid'); mb.innerHTML = '';
    mb.className = (winner === mySeat ? 'win' : '');
    const myCard = bidView(mySeat);
    if (myCard) {
      mb.appendChild(myCard);
      if (winner === mySeat) { const l = document.createElement('div'); l.className = 'q-blabel'; l.textContent = '낙찰'; mb.appendChild(l); }
    }
    // 클로즈에서 진행자가 아직 선공개를 안 했으면 그 사람을 표시
    if (a && a.closed && a.first !== null && a.first !== undefined && !a.firstDone && a.first !== mySeat) {
      const el = opps.children[oppSeats.indexOf(a.first)];
      if (el) el.classList.add('turn');
    }

    // 내 획득 더미 — 상대들과 같은 형식으로 보여준다
    const my = $('q-myacq'); my.innerHTML = '';
    const meLabel = document.createElement('span');
    meLabel.className = 'q-melabel';
    meLabel.textContent = iAmAuc ? '👑 나 (진행자)' : '나';
    my.appendChild(meLabel);
    const meNeed = document.createElement('span');
    meNeed.className = 'q-need' + (me.need <= 1 ? ' r1' : me.need === 2 ? ' r2' : '');
    meNeed.textContent = me.need <= 0 ? '완성!' : `-${me.need}`;
    my.appendChild(meNeed);
    for (const c of acqPile(me.acq)) my.appendChild(c);

    // 상태 문구 + 손패 선택 가능 여부
    let msg = '', pickMode = null;
    if (s.phase === 'draw') msg = iAmAuc ? '👑 내가 진행자! 덱을 눌러 카드를 공개하세요' : `${s.seats[s.auctioneer].name} 님이 카드를 공개하는 중…`;
    else if (s.phase === 'offer') { if (iAmAuc) { msg = '경매에 내놓을 카드를 고르세요'; pickMode = 'offer'; } else msg = `${s.seats[s.auctioneer].name} 님이 출품하는 중…`; }
    else if (s.phase === 'choose_type') msg = iAmAuc ? '경매 방식을 고르세요' : `${s.seats[s.auctioneer].name} 님이 방식을 고르는 중…`;
    else if (s.phase === 'bidding') {
      const closed = a && a.closed;
      const waitFirst = closed && a.first !== null && a.first !== undefined && !a.firstDone;
      if (!s.bidders.includes(mySeat)) msg = s.firstAuction ? '첫 경매라 진행자인 나는 입찰하지 않습니다' : '손패가 없어 이번엔 입찰할 수 없어요';
      else if (waitFirst && a.first !== mySeat) msg = `${s.seats[a.first].name} 님이 먼저 공개 배팅하는 중…`;
      else if (me.bidded) msg = '나머지가 배팅하는 중…';
      else if (waitFirst && a.first === mySeat) { msg = '👑 진행자는 먼저 공개로 배팅합니다 — 카드를 고르세요'; pickMode = 'bid'; }
      else { msg = closed ? '🙈 경매품은 비밀! 배팅 카드를 고르세요' : '배팅 카드를 고르세요'; pickMode = 'bid'; }
    }
    else if (s.phase === 'reveal') msg = '두구두구… 공개!';
    else if (s.phase === 'settled' && s.result) {
      const r = s.result;
      const who = r.winner === mySeat ? '내가' : s.seats[r.winner].name + ' 님이';
      msg = r.betrayed ? `⚔ 졸개의 배신! ${who} 낙찰!` : `${who} 낙찰!`;
      if (r.payouts && r.payouts.length) {
        const mine = r.payouts.find((p) => p.seat === mySeat);
        if (mine) msg += `  (내 손패로 ${mine.card.kind}-${mine.card.grade} 들어옴)`;
      }
    }
    $('q-status').textContent = msg;
    $('q-typeBtns').classList.toggle('show', s.phase === 'choose_type' && iAmAuc);

    // 내 손패
    const hand = $('q-myhand'); hand.innerHTML = '';
    const sorted = [...s.myHand].sort((x, y) => (x.kind * 100 + x.grade) - (y.kind * 100 + y.grade));
    for (const c of sorted) {
      hand.appendChild(card4(c, {
        pick: !!pickMode,
        onPick: (card) => {
          if (pickMode === 'offer') socket.emit('g4_act', { type: 'offer', cardId: card.id });
          else if (pickMode === 'bid') socket.emit('g4_act', { type: 'bid', cardId: card.id });
        },
      }));
    }

    // 덱 클릭 = 카드 공개
    $('q-center').style.cursor = (s.phase === 'draw' && iAmAuc) ? 'pointer' : 'default';
    $('q-center').onclick = (s.phase === 'draw' && iAmAuc)
      ? () => socket.emit('g4_act', { type: 'draw' }) : null;

    // 남은 카드 패널이 열려 있으면 같이 갱신
    if ($('q-leftPanel').classList.contains('show')) renderLeft();

    // 효과음 — 단계가 바뀔 때만 울린다
    if (s.phase !== prevPhase || s.turn !== prevTurn) {
      if (s.phase === 'offer' && s.turn === prevTurn) sfx('flip');       // 덱에서 공개
      else if (s.phase === 'bidding') sfx('place');
      else if (s.phase === 'reveal') sfx('reveal');
      else if (s.phase === 'settled') sfx(s.result && s.result.betrayed ? 'special' : 'card');
      else if (s.phase === 'draw' && s.turn !== prevTurn) sfx('tick');
      prevPhase = s.phase; prevTurn = s.turn;
    }
  }

  // 아직 안 나온 카드 — 내 손패·모든 획득 더미·공개된 경매품을 빼고 남은 것.
  // 전부 내가 화면에서 볼 수 있는 정보라 따로 세어주는 것뿐이고, 남의 손패를 보여주는 게 아니다.
  function renderLeft() {
    const box = $('q-left'); if (!box || !q4) return;
    // 내가 쥔 카드와 남이 가져간 카드는 뜻이 달라서 따로 표시한다
    const mine = new Set(q4.myHand.map((c) => c.id));
    const gone = new Set();
    for (const st of q4.seats) for (const c of st.acq) gone.add(c.id);
    const a = q4.auction;
    if (a) { if (a.center) gone.add(a.center.id); if (a.offered) gone.add(a.offered.id); }
    box.innerHTML = '';
    for (const [kind, max] of (q4.spec || [[2, 6], [3, 10], [4, 10], [6, 14]])) {
      const row = document.createElement('div'); row.className = 'q-lrow';
      const kk = document.createElement('b'); kk.className = 'q-ck'; kk.dataset.k = kind;
      kk.textContent = kind; row.appendChild(kk);
      const gs = document.createElement('div'); gs.className = 'q-lgs';
      for (let g = 1; g <= max; g++) {
        const id = kind * 100 + g;
        const el = document.createElement('span');
        el.className = 'q-lg' + (gone.has(id) ? ' gone' : mine.has(id) ? ' mine' : '');
        el.textContent = g;
        gs.appendChild(el);
      }
      row.appendChild(gs);
      box.appendChild(row);
    }
  }
  window.q4ToggleLeft = function () {
    const p = $('q-leftPanel');
    p.classList.toggle('show');
    if (p.classList.contains('show')) renderLeft();
  };

  function showOver(s) {
    const order = (s.over.order && s.over.order.length) ? s.over.order : null;
    const rank = order || [s.over.winner, ...[0, 1, 2, 3].filter((i) => i !== s.over.winner)];
    $('q-otitle').textContent = s.over.winner === mySeat ? '🏆 승리!' : '아쉽네요…';
    const rk = $('q-orank'); rk.innerHTML = '';
    rank.forEach((seat, idx) => {
      const p = s.seats[seat];
      const row = document.createElement('div');
      row.className = 'q-rrow' + (seat === mySeat ? ' me' : '');
      const pos = document.createElement('span');
      pos.className = 'q-rpos'; pos.textContent = ['🥇', '🥈', '🥉', '4'][idx] || (idx + 1);
      const nm = document.createElement('span'); nm.style.flex = '1'; nm.style.textAlign = 'left';
      nm.textContent = p.name;
      const info = document.createElement('span');
      info.textContent = p.need <= 0 ? '세트 완성' : `완성까지 ${p.need}장`;
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
    askConfirm({
      icon: '👥', title: '4인전 (베타)',
      desc: '4인 경매 배틀!\n\n' +
            '· 카드 37장, 손패 6장, 덱 13장\n' +
            '· 진행자도 함께 입찰합니다 (첫 경매만 제외)\n' +
            '· 배팅 카드는 약하게 부른 사람부터 강한 카드를 가져갑니다\n\n' +
            '※ 베타 — 전적·랭킹·코인에 반영되지 않습니다',
      yes: '⚡ 빠른대전', no: '👤 솔로 (AI 3명)',
    }, () => window.q4Quick(), () => window.q4Start());
  };

  // ── 빠른대전 — 곧바로 게임 화면에 앉아서 기다린다 ────────────────────────
  window.q4Quick = function () {
    if (typeof closeModePanels === 'function') closeModePanels();
    $('q-over').classList.remove('show');
    q4Live = true; q4 = null; q4Room = null; q4Pend = null;
    lastRecv = Date.now(); prevPhase = null; prevTurn = 0;
    document.body.classList.add('quad4', 'q-waiting');
    $('q-turn').textContent = '대기 중'; $('q-deck').textContent = '';
    $('q-status').textContent = '자리에 앉는 중…';
    sfx('deal');
    try { if (typeof startBGM === 'function') startBGM(); } catch (_) {}
    socket.emit('g4_quick', { nick: typeof getNick === 'function' ? getNick() : '나' });
  };
  // 방 안에서 시작 — 지금 앉아 있는 인원으로 몇 인전인지 결정된다
  window.q4StartNow = function () { sfx('select'); socket.emit('g4_startnow'); };

  window.q4Start = function () {
    if (typeof closeModePanels === 'function') closeModePanels();
    $('q-over').classList.remove('show');
    document.body.classList.add('quad4');
    q4Live = true; q4Room = null; lastRecv = Date.now(); prevPhase = null; prevTurn = 0;
    $('q-status').textContent = '자리 배치 중…';
    sfx('deal');
    try { if (typeof startBGM === 'function') startBGM(); } catch (_) {}   // 2인전과 같은 배경음악
    socket.emit('g4_start', { nick: typeof getNick === 'function' ? getNick() : '나' });
  };

  window.q4Quit = function () {
    socket.emit('g4_leave');
    q4Live = false; q4 = null; q4Room = null; q4Pend = null;
    $('q-startPanel').classList.remove('show');
    document.body.classList.remove('quad4', 'q-n3', 'q-waiting');
    $('q-over').classList.remove('show');
  };

  window.q4Type = function (t) {
    if (!q4 || q4.phase !== 'choose_type' || q4.auctioneer !== 0) return;
    socket.emit('g4_act', { type: 'auctionType', val: t });
  };

  // ── 소켓 ────────────────────────────────────────────────────────────────
  // 모바일에서 화면을 잠그거나 네트워크가 깜빡이면 소켓이 끊긴다.
  // 서버가 판을 잠시 보관해 주므로, 다시 붙으면 이어서 진행한다.
  function bind() {
    if (typeof socket === 'undefined' || !socket) return setTimeout(bind, 200);

    socket.on('g4_begin', (d) => {
      q4Room = d.roomId; mySeat = d.me || 0; lastRecv = Date.now(); q4Pend = null;
      $('q-startPanel').classList.remove('show');
      const total = d.n || (d.seats || []).length || 4;
      const humans = (d.seats || []).filter((x) => !x.isBot).length;
      if (!d.solo) $('q-status').textContent = `${total}인전 · 사람 ${humans}명 · AI ${total - humans}명`;
    });
    // 대기방 — 게임 화면에 앉은 채로 자리가 차는 걸 본다
    socket.on('g4_room', (d) => { if (!q4Live) return; q4Pend = d; q4Room = null; lastRecv = Date.now(); renderPending(); });
    socket.on('g4_cancelled', () => {});
    socket.on('g4_state', (s) => { if (!q4Live) return; q4 = s; lastRecv = Date.now(); render(); });
    socket.on('g4_over', (s) => {
      if (!q4Live) return;
      q4 = s; lastRecv = Date.now(); render(); setTimeout(() => showOver(s), 600);
    });
    socket.on('g4_error', (m) => { alert(m); window.q4Quit(); });
    socket.on('g4_gone', () => {
      if (!q4Live) return;
      $('q-status').textContent = '연결이 끊겨 판을 이어갈 수 없어요.';
      setTimeout(() => { alert('접속이 끊겨 판이 종료됐어요. 다시 시작해주세요.'); window.q4Quit(); }, 400);
    });
    socket.on('connect', () => { if (q4Live && q4Room) resume(); });
  }

  function resume() {
    $('q-status').textContent = '다시 연결하는 중…';
    socket.emit('g4_resume', { roomId: q4Room, seat: mySeat });
  }

  // 진행이 멈춘 채 방치되지 않도록 클라이언트도 스스로 확인한다
  setInterval(() => {
    if (!q4Live || !q4Room || !q4 || q4Pend) return;
    if (q4.over) return;
    const waiting = (['draw', 'offer', 'choose_type'].includes(q4.phase) && q4.auctioneer === mySeat)
      || (q4.phase === 'bidding' && q4.bidders.includes(mySeat) && !q4.seats[mySeat].bidded);
    if (waiting) return;                       // 내 입력을 기다리는 중이면 정상
    if (Date.now() - lastRecv < 15000) return;
    resume();
  }, 5000);

  bind();
})();
