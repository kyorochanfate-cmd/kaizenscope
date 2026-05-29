const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function main() {
  const file = path.join(__dirname, '..', 'sample-report.xlsx');
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('xl/charts/chart4.xml').async('string');
  console.log(xml);
}
main();
