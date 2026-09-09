// 스토어 스크린샷을 기기에서 받아 규격에 맞춘다.
//
// 브라우저로는 못 만든다 — 미리보기 창이 800px 언저리에서 잘라서, 1080×1920 을
// 만들려면 늘려야 하고 그러면 글자가 뭉갠다. 폰에 앱을 깔았으면 그 화면을
// 그대로 받는 게 가장 깨끗하다.
//
//   1) 폰을 USB 로 꽂고 개발자 옵션 > USB 디버깅을 켠다
//   2) 앱을 띄워 찍고 싶은 화면을 연다
//   3) node tools/shots.mjs 로비        →  store-assets/새로/로비.png
//
// 파일 이름은 그냥 붙이면 된다. 크기는 이 스크립트가 1080×1920 으로 맞춘다 —
// 기기가 더 길쭉하면 위아래를 배경색으로 채우고, 더 크면 줄인다.
// (플레이스토어는 긴 변이 짧은 변의 두 배를 넘으면 안 받는다. 요즘 폰은
//  20:9 가 흔해서 그냥 올리면 걸린다.)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NAME = process.argv[2];
if (!NAME) { console.error('쓰기: node tools/shots.mjs <이름>'); process.exit(1); }

const SDK = process.env.ANDROID_HOME || path.join(os.homedir(), 'android-sdk');
const ADB = path.join(SDK, 'platform-tools', 'adb');
if (!fs.existsSync(ADB)) { console.error('adb 를 못 찾았다: ' + ADB); process.exit(1); }

const devices = execFileSync(ADB, ['devices'], { encoding: 'utf8' })
  .split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
if (!devices.length) { console.error('붙은 기기가 없다 — USB 디버깅을 켜고 꽂는다'); process.exit(1); }

const OUT = path.join(process.cwd(), 'store-assets', '새로');
fs.mkdirSync(OUT, { recursive: true });
const raw = path.join(OUT, '.' + NAME + '.raw.png');
fs.writeFileSync(raw, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));

// 1080×1920 으로 맞춘다. 잘라내지 않고 배경색으로 채운다 — 잘라내면 화면
// 위아래가 날아가서 무엇을 보여 주려던 것인지가 사라진다.
const py = `
from PIL import Image
im = Image.open(${JSON.stringify(raw)}).convert('RGB')
W, H = 1080, 1920
s = min(W / im.width, H / im.height)
im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
bg = im.getpixel((im.width // 2, 2))            # 맨 윗줄 가운데 색 = 앱 바탕
out = Image.new('RGB', (W, H), bg)
out.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
out.save(${JSON.stringify(path.join(OUT, NAME + '.png'))})
print(f'{im.width}x{im.height} → 1080x1920 (바탕 {bg})')
`;
try {
  const r = execFileSync('python3', ['-c', py], { encoding: 'utf8' });
  fs.unlinkSync(raw);
  console.log('store-assets/새로/' + NAME + '.png — ' + r.trim());
} catch (e) {
  console.error('맞추기 실패 (python3 와 Pillow 가 필요하다):', e.message);
  console.error('원본은 남겨 둔다: ' + raw);
}
