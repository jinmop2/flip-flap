// 아이템 갈아엎기 — 어떤 아이템이 판에 닿는지 8000판씩 재고 고친 결과.
// 여기서는 그 결정이 코드에 그대로 남아 있는지, 새 아이템의 규칙이 맞는지를 본다.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const items = require('../items.js');
const htm = read('public/index.html'), cli = read('public/client.js'), srv = read('server.js');
const { ITEM_ICONS } = require('../public/item-icons.js');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };
const C = (k, g) => ({ kind: k, grade: g, id: k * 100 + g });
const mkGame = () => ({
  centerDeck: [C(2, 1), C(3, 1), C(4, 1), C(6, 1)],
  p1Hand: [C(2, 2), C(3, 2), C(4, 2)], p2Hand: [C(6, 2), C(6, 3), C(6, 4)],
  p1Acquired: [], p2Acquired: [], phase: 'bidding', auctioneer: 1,
  auction: { centerCard: C(4, 3), _offeredCard: C(6, 5), type: 'open' },
  time: { 1: 300, 2: 300 }, itemMode: true,
  items: { 1: [], 2: [] }, itemUsed: { 1: false, 2: false }, fx: items.freshFx(),
});

console.log('① 카탈로그');
{
  const ids = Object.keys(items.ITEMS);
  ok('13종', ids.length === 13, String(ids.length));
  // 판에 닿지 않던 것들은 뺐다 — 재 보니 승률이 ±1.5%p 안에서 놀았다
  for (const gone of ['hourglass', 'pickpocket', 'discount', 'dice'])
    ok(`${gone} 는 없앴다`, !ids.includes(gone));
  for (const add of ['bomb', 'trade', 'scan', 'pick3'])
    ok(`${add} 를 넣었다`, ids.includes(add));
  ok('모래시계가 어디에도 안 남았다',
     !/모래시계/.test(htm) && !/모래시계/.test(cli) && !/hourglass/.test(read('items.js')));
  // 화면·서버·아이콘이 같은 목록을 봐야 한다. 하나만 빠지면 물음표가 뜬다.
  const cliIds = [...cli.match(/const ITEM_INFO = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  ok('화면 목록이 서버와 같다', ids.every((i) => cliIds.includes(i)) && cliIds.every((i) => ids.includes(i)));
  ok('아이콘이 다 있다', ids.every((i) => ITEM_ICONS[i]), ids.filter((i) => !ITEM_ICONS[i]).join(','));
  ok('AI 점수표가 다 안다', ids.filter((i) => i !== 'redo').every((i) => new RegExp(`case '${i}'`).test(srv)),
     ids.filter((i) => i !== 'redo' && !new RegExp(`case '${i}'`).test(srv)).join(','));
}

console.log('\n② 폭탄 — 먹는 쪽이 버린다');
{
  const g = mkGame();
  g.items[1] = ['bomb'];
  const r = items.use(g, 1, 'bomb');
  ok('경매 중에만 얹을 수 있다', r.ok === true);
  ok('경매품에 폭탄이 붙었다', g.fx.bomb === 1);
  const g2 = mkGame(); g2.items[1] = ['bomb']; g2.auction = null;
  ok('경매가 없으면 못 쓴다', !!items.use(g2, 1, 'bomb').error);
  const g3 = mkGame(); g3.items[1] = ['bomb']; g3.fx.bomb = 2;
  ok('두 번 얹지 못한다', !!items.use(g3, 1, 'bomb').error);
  // 건 사람도 예외가 아니다 — 서버는 '낙찰자' 만 보고 버리게 한다
  ok('건 사람도 먹으면 버린다', /if \(g\.itemMode && g\.fx\.bomb\) \{\s*\n\s*const winner = p1Wins \? 1 : 2;/.test(srv));
  ok('사람이면 직접 고른다', /io\.to\(sid\)\.emit\('bomb_pick'/.test(srv));
  ok('AI 는 알아서 버린다', /const t = cpuTarget\(acq, wHand\);/.test(srv));
  ok('고를 때까지 판이 기다린다', /g\.bombPick = winner;/.test(srv));
  ok('고른 카드만 지운다', /socket\.on\('bomb_discard'[\s\S]{0,420}hand\.splice\(i, 1\)/.test(srv));
  ok('남의 차례엔 못 지운다', /if \(!g\.itemMode \|\| g\.bombPick !== me\) return;/.test(srv));
  // 창을 닫아 도망가면 판이 멈춘 채 남는다
  ok('버릴 카드를 고르는 창은 못 닫는다',
     /modal\.classList\.add\('show', 'no-close'\)/.test(cli)
     && /if \(!_bombOn\) closeItemUse\(\);/.test(cli)
     && /const no = document\.getElementById\('iuNo'\); if \(no\) no\.style\.display = 'none';/.test(cli));
  ok('다시 들어와도 다시 뜬다', /if \(s\.bombPick && !_bombOn\) openBombPick/.test(cli));
}

console.log('\n③ 교환권 — 소매치기(순 교환이라 0%p)를 대신한다');
{
  const g = mkGame();
  g.p1Acquired = [C(6, 1), C(2, 1)];
  g.p2Acquired = [C(2, 2), C(6, 2)];
  g.items[1] = ['trade'];
  const r = items.use(g, 1, 'trade');
  ok('맞바꾼다', r.ok === true && g.p1Acquired.length === 2 && g.p2Acquired.length === 2);
  ok('서로 딴 것이 없으면 못 쓴다', (() => {
    const g2 = mkGame(); g2.items[1] = ['trade']; g2.p1Acquired = [];
    return !!items.use(g2, 1, 'trade').error;
  })());
  // 상대의 리치를 건드리지 않는 건 도둑고양이와 같은 배려다
  ok('리치는 피해서 가져온다', /const safe = opAcq\.filter\(c => theirs\[c\.kind\] < \(SPEC_NEED\[c\.kind\] \|\| 99\) - 1\)/.test(read('items.js')));
}

console.log('\n④ 재경매 — 봉인이 붙어야 뜻이 있다');
{
  const g = mkGame();
  g.phase = 'reveal';
  g.auction.p1Bid = C(2, 2); g.auction.p2Bid = C(6, 2);
  g.items[1] = ['redo'];
  const r = items.use(g, 1, 'redo');
  ok('다시 배팅으로 돌아간다', r.ok === true && g.phase === 'bidding');
  ok('양쪽 다 방금 낸 카드가 묶인다', g.fx.banned[1] === 202 && g.fx.banned[2] === 602,
     JSON.stringify(g.fx.banned));
  ok('서버가 묶인 카드를 막는다', /g\.fx\.banned\[me\] === cardId/.test(srv));
  ok('전설로 올렸다', items.ITEMS.redo.tier === 'legend');
}

console.log('\n⑤ 고르기 — 새로 뽑기(평균이 그대로)를 대신한다');
{
  const g = mkGame();
  g.p1Acquired = [C(3, 5)];                 // 3을 모으는 중
  g.centerDeck = [C(6, 1), C(3, 1), C(4, 1)];
  g.items[1] = ['pick3'];
  const before = g.auction.centerCard.id;
  const r = items.use(g, 1, 'pick3');
  ok('중앙 카드가 바뀐다', r.ok === true && g.auction.centerCard.id !== before);
  ok('맨 위 석 장 중에서 고른다', [601, 301, 401].includes(g.auction.centerCard.id));
  ok('내가 모으는 종류를 집어 온다', g.auction.centerCard.kind === 3, String(g.auction.centerCard.kind));
  ok('원래 카드는 덱 아래로', g.centerDeck.some((c) => c.id === before));
}

console.log('\n⑥ 세던 것들을 낮췄다');
{
  const src = read('items.js');
  // 도둑고양이 하나로 승률이 +42.9%p 였다 — 뺏어 오지 않고 덱으로 돌려보낸다
  ok('도둑고양이는 훔치지 않는다', /g\.centerDeck\.push\(target\);/.test(src) && !/myAcq\.push\(target\)/.test(src));
  ok('설명도 같이 고쳤다', /덱으로 되돌린다/.test(htm) && /덱으로 되돌린다/.test(cli));
  ok('연막탄은 전설로', items.ITEMS.smoke.tier === 'legend');
  const t = { common: 0, rare: 0, legend: 0 };
  for (const it of Object.values(items.ITEMS)) t[it.tier]++;
  ok('일반 3 · 희귀 4 · 전설 6', t.common === 3 && t.rare === 4 && t.legend === 6,
     `${t.common}/${t.rare}/${t.legend}`);
  ok('설명서 숫자도 맞다', htm.includes(`일반 (${t.common}종)`) && htm.includes(`희귀 (${t.rare}종)`)
     && htm.includes(`전설 (${t.legend}종)`));
}

console.log('\n⑦ 눈금자 — 상대가 이 판을 얼마나 원하나');
{
  const g = mkGame();
  g.p2Acquired = [C(4, 1), C(4, 2), C(4, 4)];   // 4를 세 장 — 한 장이면 세트
  g.items[1] = ['scan'];
  const r = items.use(g, 1, 'scan');
  ok('읽는다', r.ok === true);
  ok('간절한 판은 2로 나온다', g.fx.scan[1] === 2, String(g.fx.scan[1]));
  const g2 = mkGame(); g2.items[1] = ['scan']; g2.p2Acquired = [];
  items.use(g2, 1, 'scan');
  ok('빈손이면 낮게 나온다', g2.fx.scan[1] <= 1, String(g2.fx.scan[1]));
  ok('화면에 띄운다', /f\.scan != null/.test(cli));
}

console.log('\n⑧ 아이템 카드는 따로 있다 — 뽑히면 경매품이 세 장');
{
  const src = read('items.js');
  // 예전엔 경매에 질 때마다 나와 판당 5.6개씩 쌓였다. 그만큼 한 개가 시시했다.
  // 이제 덱에 넣은 아이템 카드에서만 나온다 — 재 보니 판당 2.9개.
  ok('아이템 카드를 덱에 섞는다', /function mixItemCards\(deck\)/.test(srv));
  ok('보너스 2 · 덤 2', /shuffle\(\['bonus', 'tip', 'bonus', 'tip'\]\)/.test(srv));
  ok('아이템전에서만 섞는다', /game\.itemMode = true;\s*\n\s*mixItemCards\(game\.centerDeck\);/.test(srv));
  // 세트에 쓰이는 카드에 표시를 붙이지 않는다 —
  // 2종은 덱에 두 장뿐이라 그중 하나가 아이템 카드가 되면 2세트가 막힌다
  ok('보통 카드에 표시를 붙이지 않는다', !/\.sp = /.test(srv) && !/card\.sp ===/.test(srv));
  ok('아이템 카드에는 종류·등급이 없다', /\{ item: kinds\[w\], id: 'it_' \+ kinds\[w\]\[0\] \+ w \}/.test(srv));

  // 판은 평균 6.3턴에 끝나 12장짜리 중앙 덱의 절반만 뒤집힌다. 통째로 섞으면
  // 아이템 카드가 안 뒤집히는 뒤쪽에 몰려, 한 판에 0~1장만 나오는 판이 37% 였다.
  // 보통 카드 두 장마다 창 하나 — 창마다 한 장씩 꽂아 두 턴에 한 번은 반드시 나온다.
  ok('통째로 섞지 않는다', !/deck\.push\(\.\.\.extra\);/.test(srv));
  ok('창마다 한 장씩 꽂는다', /const WIN = 2;/.test(srv)
     && /deck\.slice\(w \* WIN, \(w \+ 1\) \* WIN\)/.test(srv)
     && /seg\.splice\(Math\.floor\(Math\.random\(\) \* \(seg\.length \+ 1\)\), 0,/.test(srv));
  ok('보너스 2 · 덤 2 는 그대로', /shuffle\(\['bonus', 'tip', 'bonus', 'tip'\]\)/.test(srv));
  ok('아이템 카드는 넉 장 · 덱은 16장 · 보통 카드 순서 유지', (() => {
    const fn = new Function('return ' + srv.match(/function mixItemCards[\s\S]*?\n\}/)[0])();
    for (let t = 0; t < 400; t++) {
      const d = []; for (let k = 0; k < 12; k++) d.push({ n: k });
      fn(d);
      if (d.length !== 16) return false;
      const its = d.filter(c => c.item);
      if (its.length !== 4) return false;
      if (its.filter(c => c.item === 'bonus').length !== 2) return false;
      const ns = d.filter(c => !c.item).map(c => c.n);
      for (let k = 0; k < 12; k++) if (ns[k] !== k) return false;
    }
    return true;
  })());
  // 두 턴에 한 번은 반드시 — 앞쪽 6장(=6턴) 안에 최소 두 장
  ok('6턴이면 최소 두 장은 나온다', (() => {
    const fn = new Function('return ' + srv.match(/function mixItemCards[\s\S]*?\n\}/)[0])();
    for (let t = 0; t < 400; t++) {
      const d = []; for (let k = 0; k < 12; k++) d.push({ n: k });
      fn(d);
      let normals = 0, items = 0;
      for (const c of d) { if (c.item) { items++; continue; } normals++; if (normals >= 6) break; }
      if (items < 2) return false;
    }
    return true;
  })());

  // 아이템 카드가 나오면 그 자리에서 한 장 더 뽑는다
  ok('한 장 더 뽑는다', /while \(game\.centerDeck\.length && guard\+\+ < 12\)[\s\S]{0,900}continue;/.test(srv));
  ok('보통 카드가 나오면 거기서 멈춘다', /if \(!card\.item\) \{[\s\S]{0,140}return bonus;/.test(srv));

  // 🎁 보너스 — 뒤집은 진행자가 그 자리에서. 공짜라 일반 등급만.
  ok('보너스는 진행자에게', /card\.item === 'bonus'[\s\S]{0,220}items\.pick\('common'\)[\s\S]{0,160}items\.give\(game, game\.auctioneer, it\.id\)/.test(srv));
  ok('등급을 지정해 뽑을 수 있다', /function grant\(g, who, tier\)/.test(src)
     && /const pool = tier && BY_TIER\[tier\]/.test(src));
  ok('공짜로 전설은 안 나온다', (() => {
    const g = { items: { 1: [], 2: [] }, p1Acquired: [], p2Acquired: [] };
    for (let i = 0; i < 60; i++) { g.items[1] = []; if (items.grant(g, 1, 'common').tier !== 'common') return false; }
    return true;
  })());

  // 🏷 덤 — 경매품에 얹혀 세 장이 되고, 진 쪽이 가져간다.
  // 이긴 쪽에 주면 아이템의 86% 가 앞선 쪽으로 갔다(재 봤다).
  ok('덤은 경매품에 얹힌다', /game\.auction\.tipCard = \{ kind: 'tip', itemId: it\.id, name: it\.name, tier: it\.tier \};/.test(srv));
  // 앞면 공개 — 무엇이 걸렸는지 봐야 "저것 때문에 져 준다" 가 성립한다.
  // 보여 준 것과 실제로 주는 것이 달라지면 안 되므로, 뽑기는 공개 때 한 번뿐이다.
  ok('보여 준 그 아이템을 준다', /items\.give\(g, loser, tipCard\.itemId\)/.test(srv));
  // 덤은 공개 시점에 받을 사람이 아직 없다 — 전설 조건을 '누가 뒤처졌나' 로 잰다.
  // 무조건 true 로 넘기면 동률인 초반부터 전설이 쏟아진다.
  ok('전설은 격차가 벌어진 뒤에만', /const gap = items\.isBehind\(game, 1\) \|\| items\.isBehind\(game, 2\);/.test(srv)
     && /items\.pick\(null, gap\)/.test(srv));
  ok('열세 가지가 다 나온다', (() => {
    const seen = new Set();
    for (let i = 0; i < 200000; i++) seen.add(items.pick(null, true).id);
    return Object.keys(items.ITEMS).every(id => seen.has(id));
  })());
  ok('동률이면 전설이 안 나온다', (() => {
    for (let i = 0; i < 20000; i++) if (items.pick(null, false).tier === 'legend') return false;
    return true;
  })());
  ok('정해만 두고 주지는 않는다', /function pick\(tier, behind\)/.test(src)
     && !/function pick\(tier, behind\) \{[\s\S]{0,300}g\.items/.test(src));
  ok('덤은 패자에게', /if \(g\.itemMode && tipCard\) \{\s*\n\s*const loser = p1Wins \? 2 : 1;/.test(srv));
  ok('덤이 없으면 아이템도 없다', /const tipCard = g\.auction\.tipCard \|\| null;/.test(srv));

  // 둘 다 보여야 셈에 넣는다
  ok('양쪽에 보낸다', /tipCard: a\.tipCard \|\| null,/.test(srv) && /bonusCard: a\.bonusCard \|\| null,/.test(srv));
  ok('경매품 자리에 한 장 더 그린다', /if \(a\.tipCard\) \{[\s\S]{0,260}makeItemCard\(a\.tipCard\)/.test(cli));
  ok('보너스로 뭘 얻었는지도 판에 남는다', /if \(a\.bonusCard\) \{[\s\S]{0,320}makeItemCard\(a\.bonusCard\)/.test(cli));
  ok('아이템 카드를 따로 그린다', /function makeItemCard\(card\)/.test(cli));
  ok('아이템 그림을 앞면에 그린다', /itemArt\(card\.itemId\)/.test(cli)
     && /ic-name'; \S*\.textContent = card\.name/.test(cli));
  ok('등급이 카드에서 읽힌다', /\.card\.item-card\.t-legend \{/.test(htm) && /\.card\.item-card\.t-rare \{/.test(htm));
  ok('아이템 카드 모양이 있다', /\.card\.item-card \{/.test(htm) && /\.card\.item-card\.ic-bonus \{/.test(htm));
  ok('상대가 보너스로 뭘 얻었는지 알린다', /socket\.on\('bonus_card'/.test(cli)
     && /io\.to\(s2\)\.emit\('bonus_card'/.test(srv));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
