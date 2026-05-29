const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function main() {
  const argPath = process.argv[2];
  const filePath = argPath
    ? path.resolve(argPath)
    : path.join(__dirname, '..', 'sample-report.xlsx');
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);

  console.log('=== ファイル構成 ===');
  const charts = [];
  const drawings = [];
  zip.forEach((relPath) => {
    if (relPath.match(/^xl\/charts\/chart\d+\.xml$/)) charts.push(relPath);
    if (relPath.match(/^xl\/drawings\/drawing\d+\.xml$/)) drawings.push(relPath);
  });
  console.log(`チャート XML: ${charts.length} 個`);
  charts.forEach((c) => console.log(`  - ${c}`));
  console.log(`ドローイング XML: ${drawings.length} 個`);
  drawings.forEach((d) => console.log(`  - ${d}`));

  console.log('\n=== 各 chart の参照範囲 ===');
  for (const cp of charts) {
    const xml = await zip.file(cp).async('string');
    const titleMatch = xml.match(/<a:t>([^<]+)<\/a:t>/);
    const refs = [...xml.matchAll(/<c:f>([^<]+)<\/c:f>/g)].map((m) => m[1]);
    console.log(`${cp}:`);
    console.log(`  タイトル: ${titleMatch ? titleMatch[1] : '(なし)'}`);
    refs.forEach((r) => console.log(`  参照: ${r}`));
  }

  console.log('\n=== シートごとの drawing 参照 ===');
  const sheets = ['sheet1.xml', 'sheet2.xml', 'sheet3.xml', 'sheet4.xml', 'sheet5.xml', 'sheet6.xml'];
  for (const sn of sheets) {
    const sheetXml = await zip.file(`xl/worksheets/${sn}`).async('string');
    const dm = sheetXml.match(/<drawing r:id="([^"]+)"\/>/);
    console.log(`  ${sn}: ${dm ? `→ ${dm[1]}` : '(drawing なし)'}`);
  }

  console.log('\n=== exceljs での再読込テスト (ファイル破損チェック) ===');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  wb.eachSheet((ws) => {
    console.log(`  シート: ${ws.name} (行: ${ws.rowCount}, 列: ${ws.columnCount})`);
  });
  console.log('  → OK: xlsx は正常に読み戻せました');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
