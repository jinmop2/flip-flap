// 앱이 무거워지지 않게 지키는 선.
//
// 폰의 렉은 여기서 재현할 수 없다. 그래서 "재서 고쳤다" 대신, 다시 무거워지기
// 쉬운 자리에 못을 박아 둔다 — 상시 폴링, 매 프레임 다시 그리는 애니메이션,
// 그리고 무심코 커지는 아이콘 파일.
const fs = require('fs');
const src = __dirname + '/..';
const cli = fs.readFileSync(src + '/public/client.js', 'utf8');
const c4 = fs.readFileSync(src + '/public/client4.js', 'utf8');
const html = fs.readFileSync(src + '/public/index.html', 'utf8');
const srv = fs.readFileSync(src + '/server.js', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra !== undefined ? '  ' + extra : ''))); };

console.log('① 아무 일 없을 때는 쉬어야 한다');
{
  // 예전엔 0.4초마다 모달 상태를 훑었다. 아무도 안 눌러도 초당 2.5번 깨어난다.
  ok('모달 상태를 폴링하지 않는다', !/setInterval\(navRefresh/.test(cli));
  ok('class 변화를 지켜본다', /MutationObserver/.test(cli) && /attributeFilter: \['class'\]/.test(cli));
  ok('한 프레임에 한 번만 부른다', /requestAnimationFrame\(\(\) => \{ watchModals\.q = false; navRefresh\(\); \}\)/.test(cli));

  // 다인전 재시도 타이머 — 보낸 게 있을 때만 돈다
  ok('재시도 타이머는 필요할 때만', /pendTimer = pendAct \? setInterval\(checkPend, 700\) : null/.test(c4));
  ok('먹히면 타이머를 끈다', /pendAct = null; watchPend\(\)/.test(c4));

  // 남아 있는 상시 타이머를 세어 둔다. 늘어나면 여기서 걸린다.
  const always = [...cli.matchAll(/setInterval\(/g)].length + [...c4.matchAll(/setInterval\(/g)].length;
  ok('상시 타이머가 늘지 않았다', always <= 5, `${always}개`);
}

console.log('\n② 매 프레임 다시 그리는 애니메이션');
{
  // opacity·transform 은 합성만 하지만, box-shadow·filter·width 는 다시 그린다.
  // 무한히 도는 것 중에 그런 게 있으면 폰이 계속 일한다.
  const infinite = [...html.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)].map((m) => m[1]);
  ok('무한 애니메이션을 찾았다', infinite.length > 0, `${infinite.length}개`);

  // 키프레임 본문은 중괄호가 겹쳐 있어 정규식으로 자르면 옆 규칙까지 삼킨다.
  // 여는 괄호부터 짝이 맞을 때까지 직접 센다.
  const bodyOf = (name) => {
    const i = html.search(new RegExp('@keyframes\\s+' + name + '\\s*\\{'));
    if (i < 0) return '';
    let j = html.indexOf('{', i), depth = 0;
    for (let k = j; k < html.length; k++) {
      if (html[k] === '{') depth++;
      else if (html[k] === '}' && --depth === 0) return html.slice(j + 1, k);
    }
    return '';
  };
  const heavy = [];
  for (const name of new Set(infinite)) {
    // 값 안에 섞인 단어가 아니라 실제 선언만 본다
    if (/(^|[{;\s])(box-shadow|filter|width|height|background)\s*:/.test(bodyOf(name))) heavy.push(name);
  }
  // 봐주는 목록을 두면 거기에 자꾸 쌓인다. 지금 하나도 없으니 그냥 0을 지킨다.
  ok('무한히 도는 무거운 애니가 없다', heavy.length === 0, heavy.join(','));

  // 뽑기 카드 열 장이 동시에 도는 자리 — 여기만은 반드시 가벼워야 한다
  ok('뽑기 카드 힌트는 opacity 만', /@keyframes gcTapHint \{ 0%,100% \{ opacity:0; \} 50% \{ opacity:1; \} \}/.test(html));
}

console.log('\n③ 내려받는 무게');
{
  const kb = (f) => Math.round(fs.statSync(src + '/public/' + f).size / 1024);
  // 표지 그림은 무심코 원본을 그대로 넣기 쉽다. 원본은 2.7MB 였다.
  ok('icon-512 가 200KB 이하', kb('icon-512.png') <= 200, kb('icon-512.png') + 'KB');
  ok('icon-192 가 60KB 이하', kb('icon-192.png') <= 60, kb('icon-192.png') + 'KB');
  ok('icon-180 가 60KB 이하', kb('icon-180.png') <= 60, kb('icon-180.png') + 'KB');
  for (const f of ['icon-512.png', 'icon-192.png', 'icon-180.png'])
    ok(`${f} 이 있다`, fs.existsSync(src + '/public/' + f));

  // 서버가 압축·캐시를 해 주는지 (한 줄 지우면 전송량이 4배가 된다)
  ok('gzip 압축을 쓴다', /require\('compression'\)\(\)/.test(srv));
  ok('그림·음악·폰트는 캐시한다', /max-age=604800/.test(srv));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
