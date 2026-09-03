// 대화창 — 카톡처럼 읽히게.
//
// 말풍선을 한 줄에 하나씩 쌓기만 하면 대화가 길어질수록 안 읽힌다. 여기서
// 지키는 것은 세 가지다: 날짜가 바뀌면 구분선, 같은 사람이 이어 쓰면 하나로
// 묶기(이름·꼬리는 처음에만, 시각은 마지막에만), 시각은 말풍선 밖.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const cli = fs.readFileSync(path.join(root, 'public/client.js'), 'utf8');
const htm = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
let n = 0, bad = 0;
const ok = (m, c, x) => { n++; if (c) console.log('  ✓ ' + m); else { bad++; console.log('  ✗ ' + m + (x !== undefined ? ' — ' + x : '')); } };

console.log('① 그리는 쪽');
{
  // 실제로 돌려 본다 — 정규식으로 "있나" 만 보면 모양이 바뀌어도 통과한다
  const src = cli.slice(cli.indexOf('const gcTime ='), cli.indexOf('window.gameChatSend'));
  const ctx = vm.createContext({ esc: (s) => String(s), ncClass: () => '', nickHTML: (x) => String(x), console });
  vm.runInContext(src + '\nthis.gcPaint = gcPaint; this.gcAppend = gcAppend;', ctx);
  const box = { innerHTML: '', scrollTop: 0, scrollHeight: 100 };
  const 어제 = Date.now() - 26 * 3600 * 1000, 지금 = Date.now();
  ctx.gcPaint(box, [
    { mine: false, idl: 'a', nick: '판세읽기', text: '하나', at: 어제 },
    { mine: false, idl: 'a', nick: '판세읽기', text: '둘', at: 어제 + 3000 },
    { mine: true, idl: 'me', nick: '나', text: '셋', at: 지금 - 5000 },
    { mine: false, idl: 'b', nick: '올인각', text: '넷', at: 지금 },
  ], true);
  const cnt = (re) => (box.innerHTML.match(re) || []).length;
  ok('줄 넷', cnt(/class="gc-row/g) === 4, String(cnt(/class="gc-row/g)));
  ok('날짜가 바뀌면 구분선', cnt(/class="gc-day"/g) === 2, String(cnt(/class="gc-day"/g)));
  ok('묶인 줄에는 꼬리를 한 번만', cnt(/gc-m tip/g) === 3, String(cnt(/gc-m tip/g)));
  ok('시각도 묶음마다 한 번만', cnt(/class="gc-t"/g) === 3, String(cnt(/class="gc-t"/g)));
  ok('이름도 묶음의 첫 줄에만', cnt(/class="gc-who/g) === 2, String(cnt(/class="gc-who/g)));
  ok('묶인 줄은 자리만 비운다', cnt(/gc-av blank/g) === 1, String(cnt(/gc-av blank/g)));
  ok('내 말은 오른쪽', /gc-row mine/.test(box.innerHTML));
  ok('시각은 말풍선 밖', /<\/div><span class="gc-t"/.test(box.innerHTML));

  // 1:1 은 이름이 필요 없다 — 두 사람뿐인데 이름을 붙이면 시끄럽다
  ctx.gcPaint(box, [{ mine: false, idl: 'a', nick: '판세읽기', text: '하나', at: 지금 }], false);
  ok('1:1 에는 이름·얼굴이 없다', !/gc-who|gc-av/.test(box.innerHTML));

  // 방금 보낸 것도 같은 길로 — 손으로 이어 붙이면 묶음이 어긋난다
  ctx.gcPaint(box, [{ mine: true, idl: 'me', nick: '나', text: '하나', at: 지금 }], false);
  ctx.gcAppend(box, { mine: true, idl: 'me', nick: '나', text: '둘', at: 지금 + 1000 });
  ok('보낸 것이 바로 붙는다', /둘/.test(box.innerHTML));
  ok('붙여도 묶인다', (box.innerHTML.match(/gc-m tip/g) || []).length === 1);

  ok('빈 대화는 빈 대로 말한다',
     (ctx.gcPaint(box, [], false), /gc-empty/.test(box.innerHTML)));
}

console.log('\n② 손으로 이어 붙이는 자리가 남아 있지 않다');
{
  // 예전에는 받은 메시지·보낸 메시지를 저마다 insertAdjacentHTML 로 붙였다.
  // 그러면 날짜 구분선과 묶음이 반드시 어긋난다 — 한 길로만 들어가야 한다.
  ok('말풍선을 손으로 안 만든다', !/insertAdjacentHTML[^\n]*gc-m/.test(cli));
  for (const 곳 of ['dm', 'clan_chat'])
    ok(`${곳} 도 gcAppend 를 쓴다`,
       new RegExp(`socket\\.on\\('${곳}'[\\s\\S]{0,900}gcAppend\\(`).test(cli));
}

console.log('\n③ 모양');
{
  ok('꼬리가 있다', /\.gc-m\.tip::before/.test(htm) && /clip-path:polygon/.test(htm));
  ok('묶인 줄은 둥글다', /\.gc-m:not\(\.tip\) \{ border-radius:13px; \}/.test(htm));
  ok('내 말은 금색', /\.gc-row\.mine \.gc-m \{[^}]*linear-gradient\(180deg,#e8c67c/.test(htm));
  // break-word 는 한글을 음절 중간에서 자른다 — "아이템전 ㄱ / ㄴ?" 처럼 읽힌다
  ok('한글 어절을 안 자른다', /word-break:keep-all; overflow-wrap:anywhere/.test(htm));
  // 줄 간격은 .gc-row 가 잡는다. 통 gap 을 같이 두면 두 번 벌어져 묶음이 안 보인다.
  ok('통에는 gap 이 없다', !/\.gc-msgs \{[^}]*gap:/.test(htm));
  ok('보내기는 동그란 단추', /\.gc-send button \{[^}]*border-radius:50%/.test(htm));
  ok('로비 친구창도 같은 말풍선', /\.ftalk-msgs \.gc-m \{/.test(htm));
  ok('로비 친구창에도 gap 이 없다', !/\.ftalk-msgs \{[^}]*gap:/.test(htm));
}

console.log('\n' + (bad ? 'FAIL ' + bad + '/' + n : 'OK ' + n + '개'));
process.exit(bad ? 1 : 0);
