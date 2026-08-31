// 뽑기 화면이 서버와 제대로 물려 있는지 (정적 검사).
// 브라우저 없이도 "붙는 자리를 빠뜨렸는지" 는 잡을 수 있다.
const fs = require('fs');
const root = __dirname + '/..';
const cli = fs.readFileSync(root + '/public/client.js', 'utf8');
const html = fs.readFileSync(root + '/public/index.html', 'utf8');
const acc = fs.readFileSync(root + '/accounts.js', 'utf8');
const srv = fs.readFileSync(root + '/server.js', 'utf8');
const art = fs.readFileSync(root + '/public/art.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

console.log('\n① 화면 요소가 다 있는가');
for (const id of ['gachaModal', 'gcStage', 'gcCoins', 'gcShards', 'gcInfo', 'gcExch', 'gcOne', 'gcTen', 'victoryFx'])
  ok('#' + id, html.includes('id="' + id + '"'));

console.log('\n② 서버 API 와 물려 있는가');
ok('확률표를 서버에서 받아온다', /fetch\('\/api\/gacha'\)/.test(cli));
ok('뽑기 요청 경로', /\/api\/gacha\/roll/.test(cli) && /\/api\/gacha\/roll/.test(srv));
ok('교환 경로가 서버에 있다', /\/api\/gacha\/exchange/.test(srv));
ok('확률을 코드에 다시 안 적었다 (서버 값만 쓴다)',
   !/60\s*%|0\.60|2\s*%/.test(cli.slice(cli.indexOf('renderGachaInfo'), cli.indexOf('renderGachaInfo') + 700)));

console.log('\n③ 확률·천장이 화면에 표시되는가 (표시 의무)');
ok('등급별 확률을 찍는다', /rates\.map/.test(cli));
ok('천장 횟수를 찍는다', /info\.pity|i\.pity/.test(cli));
ok('실제 확률임을 밝힌다', /천장까지 반영한 실제/.test(cli));

console.log('\n④ 아바타 7종이 그려져 있고 프로필에 연결됐는가');
{
  const m = art.match(/const AVATAR_ART = \{([\s\S]*?)\n\};/);
  const ids = m ? [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : [];
  const shopBody = acc.match(/const SHOP = \{([\s\S]*?)\n\};/)[1];
  const shopAva = [...shopBody.matchAll(/^\s{2}(ava_\w+):/gm)].map((x) => x[1]);
  ok(`아바타 ${ids.length}종 그려짐`, ids.length > 0);
  ok('상점 아바타가 전부 그려져 있다', shopAva.every((id) => ids.includes(id)),
     '없음: ' + shopAva.filter((id) => !ids.includes(id)).join(' '));
  ok('프로필이 아바타를 쓴다(faceOf)', /function faceOf/.test(cli) && /faceOf\(p\)/.test(cli));
  ok('서버가 avatar 를 프로필에 실어보낸다', /avatar:\s*u\.avatar/.test(acc));
}

console.log('\n⑤ 효과가 실제 순간에 발동되는가');
ok('이겼을 때 승리 연출', /winner === mi\)\s*\{\s*try\s*\{\s*playVictoryFx/.test(cli));
ok('카드 낼 때 파티클', /playPlaceFx\(/.test(cli));
ok('낙찰 도장이 장착한 모양을 쓴다', /winnerProf.*winStamp|STAMP_CLS\[stampId\]/.test(cli));
ok('움직임 줄이기 설정 존중', /prefers-reduced-motion/.test(cli));

console.log('\n⑥ 뽑기 입구가 있는가');
// 뽑기는 상점 머리의 버튼에서 '꾸미기·기타' 묶음의 상품 칸으로 내려갔다 —
// 사는 것들 사이에 같이 있어야 상점의 일부로 보인다.
ok('상점 안 뽑기 칸', /tile\.onclick = \(\) => openGacha\(\);/.test(cli)
   && /if \(g\.types\.includes\('ticket'\)\) ordered\.push\(\{ gacha: true \}\);/.test(cli));
ok('ESC 로 닫힌다', /'gachaModal'/.test(cli));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
