// 앱 아이콘·스플래시를 우리 그림으로 갈아 끼운다.
//
// npx cap add android 는 Capacitor 기본 아이콘(가운데가 흰 네모)을 깔아 둔다.
// 그대로 내면 스토어에도 홈 화면에도 낯선 그림이 올라간다 — 눈에 잘 안 띄는데
// 한 번 나가면 되돌리기 번거로운 자리다.
//
//   node tools/icons.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

// 원본. 적응형 아이콘은 앞·뒤 두 장이 따로다(런처가 모양을 오려 낸다).
// store-assets 의 adaptive-* 는 옛 디자인이다(어두운 자주 + 주황 글자).
// 지금 브랜드는 남색+백금이라 쓰면 안 된다 — 지금 아이콘에서 만든다.
const SRC = {
  legacy: path.join(ROOT, 'public/icon-512.png'),            // 옛 런처(오리기 전)
  mask:   path.join(ROOT, 'public/icon-maskable-512.png'),   // 잘릴 것을 셈하고 그린 것
  splash: path.join(ROOT, 'store-assets/splash-2732.png'),
};
for (const [k, p] of Object.entries(SRC))
  if (!fs.existsSync(p)) throw new Error('원본이 없다: ' + k + ' → ' + p);

// 런처 아이콘 48dp · 적응형은 108dp
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function resize(src, out, size, round = false) {
  const py = `
from PIL import Image, ImageDraw
im = Image.open(${JSON.stringify(src)}).convert('RGBA').resize((${size}, ${size}), Image.LANCZOS)
${round ? `
m = Image.new('L', (${size}, ${size}), 0)
ImageDraw.Draw(m).ellipse((0, 0, ${size - 1}, ${size - 1}), fill=255)
im.putalpha(m)
` : ''}
im.save(${JSON.stringify(out)})
`;
  execFileSync('python3', ['-c', py]);
}

// 마스커블 아이콘을 108dp 판에 꽉 채운다(짧은 변에 맞춰 자른다)
function adaptive(src, out, size) {
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(src)}).convert('RGB')
s = ${size} / min(im.width, im.height)
im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
l, t = (im.width - ${size}) // 2, (im.height - ${size}) // 2
im.crop((l, t, l + ${size}, t + ${size})).save(${JSON.stringify(out)})
`]);
}
function blank(out, size) {
  execFileSync('python3', ['-c', `
from PIL import Image
Image.new('RGBA', (${size}, ${size}), (0, 0, 0, 0)).save(${JSON.stringify(out)})
`]);
}

let n = 0;
for (const [dpi, k] of Object.entries(DPI)) {
  const dir = path.join(RES, 'mipmap-' + dpi);
  fs.mkdirSync(dir, { recursive: true });
  resize(SRC.legacy, path.join(dir, 'ic_launcher.png'), Math.round(48 * k));
  resize(SRC.legacy, path.join(dir, 'ic_launcher_round.png'), Math.round(48 * k), true);
  // 적응형은 108dp 판인데 가운데 72dp 만 반드시 보인다(런처가 모양을 오려 낸다).
  // 마스커블 아이콘은 애초에 잘릴 것을 셈하고 그린 것이라 그대로 깔면 된다.
  // 앞판은 비워 둔다 — 층을 나눌 그림이 아니라 한 장짜리 그림이다.
  adaptive(SRC.mask, path.join(dir, 'ic_launcher_background.png'), Math.round(108 * k));
  blank(path.join(dir, 'ic_launcher_foreground.png'), Math.round(108 * k));
  n += 4;
}

// 적응형 뒤판을 색이 아니라 그림으로 바꾼다 — 지금은 흰색 한 칸이라
// 앞 그림이 흰 바탕에 떠 있다(우리 아이콘은 어두운 바탕이다).
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = path.join(RES, 'mipmap-anydpi-v26', f);
  if (!fs.existsSync(p)) continue;
  fs.writeFileSync(p, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);
  n++;
}

// 스플래시 — 세로/가로 각 밀도. 화면을 덮는 그림이라 짧은 변에 맞춰 자른다.
const SPL = {
  'port-mdpi': [320, 480], 'port-hdpi': [480, 800], 'port-xhdpi': [720, 1280],
  'port-xxhdpi': [960, 1600], 'port-xxxhdpi': [1280, 1920],
  'land-mdpi': [480, 320], 'land-hdpi': [800, 480], 'land-xhdpi': [1280, 720],
  'land-xxhdpi': [1600, 960], 'land-xxxhdpi': [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(SPL)) {
  const d = path.join(RES, 'drawable-' + dir);
  if (!fs.existsSync(d)) continue;
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(SRC.splash)}).convert('RGB')
s = max(${w} / im.width, ${h} / im.height)
im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
l, t = (im.width - ${w}) // 2, (im.height - ${h}) // 2
im.crop((l, t, l + ${w}, t + ${h})).save(${JSON.stringify(path.join(d, 'splash.png'))})
`;
  execFileSync('python3', ['-c', py]);
  n++;
}
const one = path.join(RES, 'drawable', 'splash.png');
if (fs.existsSync(path.dirname(one))) { resize(SRC.splash, one, 1280); n++; }

console.log(`아이콘·스플래시 ${n}장 갈아 끼움`);
