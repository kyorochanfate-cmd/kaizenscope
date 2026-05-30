// ユーザー提供の icon.png は 2816x1536 の横長プレビューフレーム付き画像。
// Android アイコンとして使えるよう、本体だけ切り出して用途別に再生成する。
//
// 出力:
//   assets/icon.png         : Play Store 用 1024x1024 (navy + 緑シンボル)
//   assets/adaptive-icon.png: Android アダプティブアイコンの foreground。
//                             緑シンボルだけ残し、それ以外を透明化して safe zone に納める
//   assets/splash-icon.png  : 起動スプラッシュ用 1024x1024 (icon と同じ)

const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;
const { Resvg } = require('@resvg/resvg-js');

const ASSETS = path.join(__dirname, '..', 'assets');
const SRC = path.join(ASSETS, 'icon.png');

const NAVY_HEX = '#114259';

function isNavyPixel(r, g, b) {
  return r < 80 && g < 100 && b < 150;
}
function isGreenPixel(r, g, b) {
  return g > 110 && g > r + 30;
}

function findContentBbox(png, onlyGreen = false) {
  const { width, height, data } = png;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 50) continue; // transparent
      const match = onlyGreen
        ? isGreenPixel(r, g, b)
        : isNavyPixel(r, g, b) || isGreenPixel(r, g, b);
      if (!match) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function cropToSquare(png, bbox, padding = 0) {
  const { width, data } = png;
  const w = bbox.maxX - bbox.minX + 1;
  const h = bbox.maxY - bbox.minY + 1;
  const size = Math.max(w, h) + padding * 2;
  const out = new PNG({ width: size, height: size });
  // 上下左右の中央寄せ
  const offsetX = Math.round((size - w) / 2);
  const offsetY = Math.round((size - h) / 2);
  // 透明で初期化
  out.data.fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcI = ((bbox.minY + y) * width + (bbox.minX + x)) * 4;
      const dstI = ((offsetY + y) * size + (offsetX + x)) * 4;
      out.data[dstI] = data[srcI];
      out.data[dstI + 1] = data[srcI + 1];
      out.data[dstI + 2] = data[srcI + 2];
      out.data[dstI + 3] = data[srcI + 3];
    }
  }
  return out;
}

function makeTransparentExceptGreen(png) {
  // 緑以外のすべての pixel を透明に。緑だけ残す。
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      if (isGreenPixel(r, g, b)) {
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      } else {
        out.data[i] = 0;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = 0;
      }
    }
  }
  return out;
}

function pngToResvgUpscale(png, targetSize) {
  // PNG を base64 にしてから SVG <image> に埋め込み、Resvg で targetSize に
  // バイリニア相当でスケール。
  const b64 = PNG.sync.write(png).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${png.width} ${png.height}">
    <image href="data:image/png;base64,${b64}" x="0" y="0" width="${png.width}" height="${png.height}"/>
  </svg>`;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: targetSize },
    background: 'transparent',
  });
  return resvg.render().asPng();
}

// メインフロー
const src = PNG.sync.read(fs.readFileSync(SRC));
console.log(`Source: ${src.width}x${src.height}`);

const bbox = findContentBbox(src);
const bw = bbox.maxX - bbox.minX + 1;
const bh = bbox.maxY - bbox.minY + 1;
console.log(`Content bbox: ${bw}x${bh} at (${bbox.minX}, ${bbox.minY})`);

// 1. icon.png / splash-icon.png 用: navy 本体を 1024x1024 に
//    rounded corner はそのまま残し、padding 少なめでクロップ
const fullIcon = cropToSquare(src, bbox, 8);
const fullIconPng = pngToResvgUpscale(fullIcon, 1024);
fs.writeFileSync(path.join(ASSETS, 'icon.png'), fullIconPng);
fs.writeFileSync(path.join(ASSETS, 'splash-icon.png'), fullIconPng);
console.log('✓ Wrote icon.png (1024x1024)');
console.log('✓ Wrote splash-icon.png (1024x1024)');

// 2. adaptive-icon.png 用: 緑シンボルだけ抽出 → 透明背景にして
//    Android safe zone (66%) に納まるように余白を多めに付ける
const symbolOnly = makeTransparentExceptGreen(src);
const greenBbox = findContentBbox(symbolOnly, /* onlyGreen */ true);
const greenW = greenBbox.maxX - greenBbox.minX + 1;
const greenH = greenBbox.maxY - greenBbox.minY + 1;
console.log(`Symbol bbox: ${greenW}x${greenH}`);
// 中心に余白多め (シンボルが canvas の ~50% を占めるように padding 設定)
// canvas = max(w, h) * 2 で safe zone 内に収まる
const symbolPadding = Math.round(Math.max(greenW, greenH) * 0.5);
const symbolCropped = cropToSquare(symbolOnly, greenBbox, symbolPadding);
const adaptivePng = pngToResvgUpscale(symbolCropped, 1024);
fs.writeFileSync(path.join(ASSETS, 'adaptive-icon.png'), adaptivePng);
console.log('✓ Wrote adaptive-icon.png (1024x1024)');

// 3. favicon.png (web 用、小さくて OK)
const faviconPng = pngToResvgUpscale(fullIcon, 192);
fs.writeFileSync(path.join(ASSETS, 'favicon.png'), faviconPng);
console.log('✓ Wrote favicon.png (192x192)');

console.log('\nNavy color for backgroundColor:', NAVY_HEX);
