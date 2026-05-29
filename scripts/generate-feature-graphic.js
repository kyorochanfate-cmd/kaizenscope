// Play Store のフィーチャーグラフィック (1024×500) を SVG → PNG で生成。
// 実行: node scripts/generate-feature-graphic.js
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'docs', 'feature-graphic.svg');
const PNG_PATH = path.join(__dirname, '..', 'docs', 'feature-graphic.png');

const svg = fs.readFileSync(SVG_PATH, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 },
  background: 'rgba(0,0,0,0)',
});
const png = resvg.render().asPng();
fs.writeFileSync(PNG_PATH, png);
console.log(`✓ Wrote ${PNG_PATH} (${png.length} bytes)`);
