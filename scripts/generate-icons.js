// カイゼンスコープのアプリアイコンとスプラッシュ画像を SVG → PNG で生成。
// 実行: node scripts/generate-icons.js
//
// デザインコンセプト: 工場の歯車 + ストップウォッチ + 「改」 で
//   「現場の作業をはかって改善する」 を象徴する。
//   ブランドカラー: 工業ブルー (#2563eb) / アクセントイエロー (#fbbf24)
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const BLUE = '#2563eb';
const BLUE_DARK = '#1d4ed8';
const YELLOW = '#fbbf24';
const WHITE = '#ffffff';
const INK = '#0f172a';

// Adaptive icon は中央 66% に意味のある絵柄を入れる必要があるので、
// 余白多めの設計にする。
function iconSvg({ size = 1024, withBg = true, bg = BLUE }) {
  const c = size / 2;
  const r = size * 0.36; // 歯車外周
  const inner = size * 0.22; // 中央円
  const teeth = 8;
  const toothLen = size * 0.06;

  const toothPath = [];
  for (let i = 0; i < teeth; i++) {
    const ang = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    const x1 = c + Math.cos(ang) * r;
    const y1 = c + Math.sin(ang) * r;
    const x2 = c + Math.cos(ang) * (r + toothLen);
    const y2 = c + Math.sin(ang) * (r + toothLen);
    toothPath.push(
      `<circle cx="${x2}" cy="${y2}" r="${size * 0.045}" fill="${YELLOW}"/>`
    );
    toothPath.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${YELLOW}" stroke-width="${size * 0.04}" stroke-linecap="round"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${withBg ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>` : ''}
  ${toothPath.join('\n  ')}
  <!-- 歯車本体 -->
  <circle cx="${c}" cy="${c}" r="${r}" fill="${WHITE}" stroke="${BLUE_DARK}" stroke-width="${size * 0.025}"/>
  <circle cx="${c}" cy="${c}" r="${inner}" fill="${BLUE}"/>
  <!-- 中央の 「改」 -->
  <text x="${c}" y="${c + size * 0.085}" font-size="${size * 0.27}" font-family="Yu Gothic UI, Noto Sans CJK JP, sans-serif" font-weight="900" fill="${WHITE}" text-anchor="middle">改</text>
</svg>`;
}

function splashSvg() {
  const W = 1284, H = 2778; // iPhone Pro Max baseline
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${WHITE}"/>
  <g transform="translate(${W / 2 - 240}, ${H / 2 - 320})">
    ${iconSvg({ size: 480, withBg: true, bg: BLUE })}
  </g>
  <text x="${W / 2}" y="${H / 2 + 320}" font-size="80" font-family="Yu Gothic UI, Noto Sans CJK JP, sans-serif" font-weight="900" fill="${INK}" text-anchor="middle">カイゼンスコープ</text>
  <text x="${W / 2}" y="${H / 2 + 410}" font-size="40" font-family="Yu Gothic UI, Noto Sans CJK JP, sans-serif" fill="#64748b" text-anchor="middle">現場の作業を、はかって改善</text>
</svg>`;
}

function svgToPng(svg, width) {
  const r = new Resvg(svg, {
    background: 'transparent',
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Yu Gothic UI' },
  });
  return r.render().asPng();
}

const assetsDir = path.join(__dirname, '..', 'assets');

// 1024x1024 標準アイコン (Play Store + iOS)
fs.writeFileSync(path.join(assetsDir, 'icon.png'), svgToPng(iconSvg({ size: 1024, withBg: true }), 1024));
// 1024 adaptive (前景のみ、Android 用)
fs.writeFileSync(
  path.join(assetsDir, 'adaptive-icon.png'),
  svgToPng(iconSvg({ size: 1024, withBg: false }), 1024)
);
// favicon 48x48
fs.writeFileSync(path.join(assetsDir, 'favicon.png'), svgToPng(iconSvg({ size: 256, withBg: true }), 256));
// splash 1284x2778
fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), svgToPng(splashSvg(), 1284));

console.log('✅ icon / adaptive-icon / favicon / splash-icon を生成');
console.log(`   assets/icon.png         (1024x1024)`);
console.log(`   assets/adaptive-icon.png (1024x1024, 前景透過)`);
console.log(`   assets/favicon.png      (256x256)`);
console.log(`   assets/splash-icon.png  (1284x2778)`);
