// 앱(Capacitor)에 넣을 화면 한 벌을 만든다.
//
// 웹에서는 Express 가 세 곳에서 파일을 꺼내 준다 — public/, 저장소 뿌리의 엔진
// 파일들(rules2.js·game4.js…), 그리고 socket.io 가 스스로 내놓는 클라이언트.
// 앱에는 서버가 없으므로 그 셋을 한 폴더에 모으고, 절대 주소('/twelve.js')를
// 상대 주소로 바꿔 준다. 안 바꾸면 기기 안의 없는 자리를 가리킨다.
//
//   node tools/build-app.mjs      →  app-www/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'app-www');

// 서버가 뿌리에서 꺼내 주던 파일들 (server.js 의 목록과 같아야 한다)
const ENGINES = ['rules2.js', 'ai2.js', 'twelve.js', 'game4.js', 'ai4.js', 'items.js', 'view4.js', 'items2.js'];

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
};

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), OUT);

// 엔진 파일 — 웹에서는 서버가 내주던 것들
for (const f of ENGINES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) throw new Error('엔진 파일이 없다: ' + f);
  fs.copyFileSync(src, path.join(OUT, f));
}

// socket.io 클라이언트 — 웹에서는 /socket.io/socket.io.js 로 서버가 내주지만
// 앱에는 그 서버가 없다. 설치된 꾸러미에서 꺼내 넣는다.
const sioCandidates = [
  'node_modules/socket.io/client-dist/socket.io.min.js',
  'node_modules/socket.io-client/dist/socket.io.min.js',
];
const sio = sioCandidates.map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p));
if (!sio) throw new Error('socket.io 클라이언트를 못 찾았다 — npm install 먼저');
fs.copyFileSync(sio, path.join(OUT, 'socket.io.js'));

// 서비스워커는 앱에서 쓰지 않는다. 자산이 이미 기기 안에 있는데 그 위에 또
// 캐시를 얹으면, 앱을 새로 깔아도 옛 화면이 남는 길이 생긴다.
fs.rmSync(path.join(OUT, 'sw.js'), { force: true });

// 절대 주소를 상대 주소로
const html = path.join(OUT, 'index.html');
let h = fs.readFileSync(html, 'utf8');
const before = h;
h = h.replace('<script src="/socket.io/socket.io.js"></script>', '<script src="socket.io.js"></script>');
for (const f of ENGINES) h = h.split('src="/' + f + '"').join('src="' + f + '"');
// 서비스워커 등록은 앱에서 지운다
h = h.replace(/navigator\.serviceWorker\s*\.register\([^)]*\)/g, 'Promise.reject()');
if (h === before) throw new Error('바꿀 주소를 하나도 못 찾았다 — index.html 이 달라졌다');
fs.writeFileSync(html, h);

// 확인 — 화면이 부르는 파일이 다 들어 있는가. 하나라도 없으면 앱은 흰 화면이다.
const missing = [...h.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  .filter((s) => !/^https?:/.test(s))
  .filter((s) => !fs.existsSync(path.join(OUT, s.replace(/^\.?\//, ''))));
if (missing.length) throw new Error('빠진 파일: ' + missing.join(', '));

const n = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((k, e) => k + (e.isDirectory() ? n(path.join(d, e.name)) : 1), 0);
console.log(`app-www/ 준비 — ${n(OUT)}개 파일, 스크립트 ${[...h.matchAll(/<script src=/g)].length}줄`);
