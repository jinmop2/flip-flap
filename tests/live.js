// 살아 있는 서버가 필요한 시금석은 저마다 자기 서버를 띄운다.
//
// 예전엔 다섯이 localhost:3000 하나를 같이 썼다. 앞 시금석이 대기열에
// 남겨 둔 사람이 다음 시금석의 방에 끼어들어, 연달아 돌리면 가끔 빨개졌다.
// 하나씩 다시 돌리면 멀쩡하니 "원래 그런 것" 으로 넘기게 되는데,
// 그러다 보면 진짜 빨간 것도 같이 넘긴다.
// 개발 서버를 안 띄워 두면 다섯이 통째로 실패하기도 했다.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');

// port 는 시금석마다 다른 번호로 (같이 쓰면 처음 문제로 되돌아간다)
async function liveServer(port, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fflive-'));
  const sv = spawn('node', ['server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), FF_DATA_FILE: path.join(dir, 'a.json'), ...env },
  });
  const url = 'http://localhost:' + port;
  // 서버가 아직 저장 파일을 쓰는 중일 수 있다 — 지우다 걸려도 시금석을
  // 죽이지는 않는다. 어차피 임시 폴더라 남아도 기계가 치운다.
  const stop = () => {
    try { sv.kill('SIGKILL'); } catch (_) {}
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (_) {}
  };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  // 뜰 때까지 기다린다 — 고정 시간으로 재면 기계가 바쁜 날에 깨진다
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url + '/health')).ok) return { url, stop, proc: sv }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  stop();
  throw new Error(`서버가 ${port} 에서 15초 안에 안 떴다`);
}

module.exports = { liveServer };
