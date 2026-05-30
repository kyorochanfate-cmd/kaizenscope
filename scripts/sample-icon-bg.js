// 新しい icon.png の四隅から中央寄りの「アイコン本体」の地色を平均サンプリング。
// 余白(白)領域を避けて、青い本体の代表色を出す。
const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;

const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
const data = fs.readFileSync(iconPath);
const png = PNG.sync.read(data);
const { width, height, data: pixels } = png;

// 画像の中央領域 (アイコン本体の中心) からサンプリング。
// 緑色 (R<G かつ G>120) は除外し、青の代表色だけ集める。
const samples = [];
const cx = Math.floor(width / 2);
const cy = Math.floor(height / 2);
const radius = Math.floor(Math.min(width, height) * 0.18); // 中央 36% の正方形
for (let y = cy - radius; y < cy + radius; y++) {
  for (let x = cx - radius; x < cx + radius; x++) {
    const i = (y * width + x) * 4;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 200) continue;
    // 緑系 (アイコンの矢印) はスキップ
    if (g > 110 && g > r + 15 && g > b - 30) continue;
    // 白系 (余白) もスキップ
    if (r > 230 && g > 230 && b > 230) continue;
    samples.push([r, g, b]);
  }
}

if (samples.length === 0) {
  console.error('No samples found');
  process.exit(1);
}

const avg = samples.reduce(
  (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
  [0, 0, 0]
).map((v) => Math.round(v / samples.length));

const hex = '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`Sampled ${samples.length} pixels`);
console.log(`RGB: ${avg.join(', ')}`);
console.log(`HEX: ${hex}`);
