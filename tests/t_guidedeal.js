// 턴 안내 스위치와 다인전 딜.
//
// ① 안내는 모드마다 다른 칸에 뜬다. 2인전·트웰브만 끄고 있어서, 껐는데도
//    다인전과 미니게임에서는 그대로 나왔다.
// ② 다인전 딜은 가운데 '공개 카드' 칸에서 내 몫만 날아왔다. 카드는 덱에서
//    나오는 것이고, 나눠준다면 다 같이 받아야 "나눠준다" 로 읽힌다.
const fs = require('fs');
const R = __dirname + '/..';
const cli = fs.readFileSync(R + '/public/client.js', 'utf8');
const c4 = fs.readFileSync(R + '/public/client4.js', 'utf8');
const html = fs.readFileSync(R + '/public/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (note ? '  ' + note : '')); } };

console.log('① 턴 안내 스위치가 모든 모드를 끈다');
{
  ok('스위치가 있다', /function toggleGuide\(\)/.test(cli) && /togGuide/.test(html));
  ok('껐다 켠 것을 기억한다', /localStorage\.setItem\('ff_guide'/.test(cli));
  const m = /for \(const id of \[([^\]]*)\]\) \{\s*\n\s*const sb = document\.getElementById\(id\); if \(sb\) sb\.style\.display = guideOff/.exec(cli);
  ok('안내 칸 목록을 돌며 끈다', !!m, m ? '' : '목록을 못 찾음');
  if (m) {
    const ids = m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
    for (const need of ['statusBar', 'tv-status', 'q-status', 'mnStatus'])
      ok(`${need} 를 끈다`, ids.includes(need), ids.join(','));
    // 목록에 있는 칸이 실제로 있어야 한다 — 이름이 틀리면 조용히 아무 일도 안 한다
    for (const id of ids) ok(`${id} 가 화면에 있다`, html.includes('id="' + id + '"'));
  }
}

console.log('\n② 다인전도 덱에서 네 사람에게 나눠준다');
{
  ok('덱에서 나온다', /dealFromDeck\(deck, hand\.querySelectorAll\('\.card'\)/.test(c4)
     && /const deck = \$\('q-deckstack'\);/.test(c4));
  ok('가운데 칸에서 안 나온다', !/dealFromDeck\(\$\('q-center'\)/.test(c4));
  ok('상대에게도 날아간다', /function q4DealGhosts\(deckEl, seats, o\)/.test(c4)
     && /q4DealGhosts\(deck, seats,/.test(c4));
  // 한 사람에게 몰아주지 않고 한 바퀴씩 돈다
  ok('한 바퀴씩 돈다', /offset: seats\.length, step: players/.test(c4)
     && /const delay = \(i \* o\.players \+ p\) \* o\.stagger;/.test(c4));
  ok('나는 맨 끝에 받는다', /offset: seats\.length/.test(c4));
  ok('날아간 카드는 지운다', /setTimeout\(\(\) => g\.remove\(\), delay \+ 560\)/.test(c4));
  ok('소리도 네 사람 몫', /for \(let i = 0; i < sorted\.length \* players; i\+\+\)/.test(c4));
  ok('그림자 모양이 있다', /\.q-deal-ghost \{/.test(html));
  ok('흔들림을 줄인 기기에서는 안 띄운다',
     /@media \(prefers-reduced-motion:reduce\) \{ \.q-deal-ghost \{ display:none; \} \}/.test(html));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
