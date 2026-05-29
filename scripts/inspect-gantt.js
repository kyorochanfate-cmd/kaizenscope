const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function main() {
  const file = path.join(__dirname, '..', 'sample-report.xlsx');
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);

  // workbook.xml をそのまま見る
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  console.log('=== workbook.xml ===');
  // <sheet> 要素を抜き出し
  const sheetMatches = [...wbXml.matchAll(/<sheet [^>]*\/>/g)];
  sheetMatches.forEach((m, i) => console.log(`  [${i + 1}] ${m[0]}`));

  // ガントチャートが何番目の sheet か (内部的に sheet1.xml = 1, sheet2.xml = 2, ...)
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml').async('string');
  // strings as array
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(sharedStringsXml)) !== null) {
    const inner = m[1];
    // すべての <t> を結合
    const ts = [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join('');
    strings.push(ts);
  }
  console.log(`\nshared strings count: ${strings.length}`);
  console.log('first 20:', strings.slice(0, 20));

  // 各 sheet ファイルの先頭/末尾行をダンプ
  for (let i = 1; i <= 6; i++) {
    const fpath = `xl/worksheets/sheet${i}.xml`;
    const file = zip.file(fpath);
    if (!file) continue;
    const sheetXml = await file.async('string');
    const rowMatches = [...sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    if (rowMatches.length === 0) continue;
    console.log(`\n=== sheet${i}.xml (${rowMatches.length} rows) ===`);
    const showRow = (rm) => {
      const cells = [...rm[2].matchAll(/<c r="([A-Z]+\d+)"(?: s="\d+")?(?: t="(\w)")?[^>]*><v>([^<]+)<\/v><\/c>/g)];
      const vals = cells.map((c) => {
        if (c[2] === 's') return strings[parseInt(c[3], 10)] ?? `?ss${c[3]}`;
        return c[3];
      });
      console.log(`  row ${rm[1]}: ${vals.slice(0, 5).join(' | ')}`);
    };
    rowMatches.slice(0, 3).forEach(showRow);
    if (rowMatches.length > 5) console.log('  ...');
    rowMatches.slice(-3).forEach(showRow);
  }
}

main().catch(console.error);
