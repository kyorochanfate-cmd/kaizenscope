// ネイティブ Excel チャート (データ参照型) を埋め込んだサンプル xlsx を生成する。
//
// 仕組み:
//   1. exceljs で通常のデータシートを書く (山積みデータ / カテゴリデータ 等)
//   2. 出力 xlsx を JSZip で開いて OOXML を直接編集
//   3. xl/charts/chartN.xml と xl/drawings/drawingN.xml を inject
//   4. ContentTypes / 各シートの rels / シート XML に <drawing> 参照を追加
//
// 実行: node scripts/generate-sample-xlsx.js
// 出力: ./sample-report.xlsx
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const ARGB = {
  value_added: 'FFDCFCE7',
  incidental: 'FFFEF3C7',
  waste: 'FFFEE2E2',
  headerBg: 'FF1F2937',
  headerFg: 'FFFFFFFF',
  subHeader: 'FFE5E7EB',
  critical: 'FFFCA5A5',
  warn: 'FFFCD34D',
  info: 'FF93C5FD',
};
const HEX = {
  value_added: '22C55E',
  incidental: 'EAB308',
  waste: 'EF4444',
};

// ─── モックデータ ───
const session = {
  name: 'デモ: ライン1 朝礼後計測',
  fps: 30,
  durationMs: 195000,
  tactTimeSec: 60,
  mode: 'both',
  createdAt: Date.UTC(2026, 4, 17, 9, 30, 0),
};
const resources = [
  { id: 'r1', name: '太郎', type: 'person' },
  { id: 'r2', name: '次郎', type: 'person' },
  { id: 'r3', name: 'プレスA', type: 'machine' },
];
const CYCLES = {
  1: [
    { rid: 'r1', name: '部品取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r1', name: 'ボルト締め', s: 5, e: 23, cat: 'value_added' },
    { rid: 'r1', name: '検査', s: 23, e: 33, cat: 'value_added' },
    { rid: 'r1', name: '完成品運搬', s: 33, e: 40, cat: 'incidental' },
    { rid: 'r2', name: '段取り', s: 0, e: 8, cat: 'incidental' },
    { rid: 'r2', name: '加工準備', s: 8, e: 15, cat: 'incidental' },
    { rid: 'r2', name: '検査補助', s: 15, e: 27, cat: 'value_added' },
    { rid: 'r2', name: '片付け', s: 27, e: 37, cat: 'incidental' },
    { rid: 'r3', name: '段取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r3', name: 'プレス加工', s: 5, e: 30, cat: 'value_added' },
    { rid: 'r3', name: 'プレス加工', s: 30, e: 50, cat: 'value_added' },
  ],
  2: [
    { rid: 'r1', name: '部品取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r1', name: 'ボルト締め', s: 5, e: 27, cat: 'value_added' },
    { rid: 'r1', name: '検査', s: 27, e: 42, cat: 'value_added' },
    { rid: 'r1', name: '完成品運搬', s: 42, e: 50, cat: 'incidental' },
    { rid: 'r1', name: '次工程準備', s: 50, e: 65, cat: 'value_added' },
    { rid: 'r2', name: '段取り', s: 0, e: 8, cat: 'incidental' },
    { rid: 'r2', name: '加工準備', s: 8, e: 15, cat: 'incidental' },
    { rid: 'r2', name: '手待ち', s: 15, e: 35, cat: 'waste' },
    { rid: 'r2', name: '検査補助', s: 35, e: 47, cat: 'value_added' },
    { rid: 'r3', name: '段取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r3', name: 'プレス加工', s: 5, e: 30, cat: 'value_added' },
    { rid: 'r3', name: 'チョコ停', s: 30, e: 45, cat: 'waste' },
    { rid: 'r3', name: 'プレス加工', s: 45, e: 62, cat: 'value_added' },
  ],
  3: [
    { rid: 'r1', name: '部品取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r1', name: 'ボルト締め', s: 5, e: 23, cat: 'value_added' },
    { rid: 'r1', name: '検査', s: 23, e: 35, cat: 'value_added' },
    { rid: 'r1', name: '完成品運搬', s: 35, e: 42, cat: 'incidental' },
    { rid: 'r1', name: '次工程準備', s: 42, e: 55, cat: 'value_added' },
    { rid: 'r2', name: '段取り', s: 0, e: 8, cat: 'incidental' },
    { rid: 'r2', name: '加工準備', s: 8, e: 15, cat: 'incidental' },
    { rid: 'r2', name: '検査補助', s: 15, e: 30, cat: 'value_added' },
    { rid: 'r2', name: '片付け', s: 30, e: 40, cat: 'incidental' },
    { rid: 'r3', name: '段取り', s: 0, e: 5, cat: 'incidental' },
    { rid: 'r3', name: 'プレス加工', s: 5, e: 30, cat: 'value_added' },
    { rid: 'r3', name: 'プレス加工', s: 30, e: 52, cat: 'value_added' },
  ],
};
const CYCLE_OFFSETS = { 1: 0, 2: 65, 3: 130 };

const tasks = [];
for (const cn of [1, 2, 3]) {
  CYCLES[cn].forEach((t, i) => {
    tasks.push({
      id: `c${cn}-t${i}`,
      resourceId: t.rid,
      cycleNumber: cn,
      name: t.name,
      startTimeMs: (CYCLE_OFFSETS[cn] + t.s) * 1000,
      endTimeMs: (CYCLE_OFFSETS[cn] + t.e) * 1000,
      category: t.cat,
    });
  });
}

const CATEGORY_LABELS = { value_added: '正味作業', incidental: '付帯作業', waste: 'ムダ' };
const MACHINE_CATEGORY_LABELS = { value_added: '正味稼働', incidental: '付帯稼働', waste: '停止ロス' };
const catLabel = (c, m) => (m ? MACHINE_CATEGORY_LABELS[c] : CATEGORY_LABELS[c]);

function sumCat(arr, cat) {
  return arr.filter((t) => t.category === cat).reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
}
function escXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// ─── OOXML チャート XML ジェネレータ ─────────────────────
// references like 'Sheet'!$A$2:$A$10 — chart reads live from these cells
function chartXmlStackedColumn({ title, sheet, catRange, series }) {
  const sheetRef = `'${sheet}'`;
  const seriesXml = series
    .map(
      (s, i) => `
    <c:ser>
      <c:idx val="${i}"/>
      <c:order val="${i}"/>
      <c:tx>
        <c:v>${escXml(s.name)}</c:v>
      </c:tx>
      <c:spPr>
        <a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </c:spPr>
      <c:cat>
        <c:strRef>
          <c:f>${sheetRef}!${catRange}</c:f>
        </c:strRef>
      </c:cat>
      <c:val>
        <c:numRef>
          <c:f>${sheetRef}!${s.range}</c:f>
        </c:numRef>
      </c:val>
    </c:ser>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="stacked"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:overlap val="100"/>
        <c:axId val="111111"/>
        <c:axId val="222222"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="111111"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="222222"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="222222"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:title>
          <c:tx><c:rich>
            <a:bodyPr rot="-5400000"/><a:lstStyle/>
            <a:p><a:r><a:rPr lang="ja-JP"/><a:t>秒</a:t></a:r></a:p>
          </c:rich></c:tx>
          <c:overlay val="0"/>
        </c:title>
        <c:crossAx val="111111"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

function chartXmlPie({ title, sheet, catRange, valRange, colorsHex }) {
  const sheetRef = `'${sheet}'`;
  const dPts = colorsHex
    .map(
      (col, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:w w="20000"/></a:ln></c:spPr></c:dPt>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          ${dPts}
          <c:dLbls>
            <c:showLegendKey val="0"/>
            <c:showVal val="0"/>
            <c:showCatName val="1"/>
            <c:showSerName val="0"/>
            <c:showPercent val="1"/>
            <c:showBubbleSize val="0"/>
            <c:separator>
</c:separator>
          </c:dLbls>
          <c:cat>
            <c:strRef><c:f>${sheetRef}!${catRange}</c:f></c:strRef>
          </c:cat>
          <c:val>
            <c:numRef><c:f>${sheetRef}!${valRange}</c:f></c:numRef>
          </c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

// 横向き積み上げ棒チャートを「ガント」風に: 1系列目を透明にして開始時刻のオフセット用、
// 2系列目を所要時間として描画。データ点ごとにカテゴリ色を当てる。
function chartXmlGantt({ title, sheet, catRange, offsetRange, durationRange, dPtColors }) {
  const sheetRef = `'${sheet}'`;
  const dPtsXml = dPtColors
    .map(
      (color, i) =>
        `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="bar"/>
        <c:grouping val="stacked"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>開始</c:v></c:tx>
          <c:spPr>
            <a:noFill/>
            <a:ln><a:noFill/></a:ln>
          </c:spPr>
          <c:invertIfNegative val="0"/>
          <c:cat>
            <c:strRef><c:f>${sheetRef}!${catRange}</c:f></c:strRef>
          </c:cat>
          <c:val>
            <c:numRef><c:f>${sheetRef}!${offsetRange}</c:f></c:numRef>
          </c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:v>所要</c:v></c:tx>
          <c:spPr>
            <a:solidFill><a:srgbClr val="2563EB"/></a:solidFill>
            <a:ln><a:noFill/></a:ln>
          </c:spPr>
          <c:invertIfNegative val="0"/>
          ${dPtsXml}
          <c:cat>
            <c:strRef><c:f>${sheetRef}!${catRange}</c:f></c:strRef>
          </c:cat>
          <c:val>
            <c:numRef><c:f>${sheetRef}!${durationRange}</c:f></c:numRef>
          </c:val>
        </c:ser>
        <c:gapWidth val="80"/>
        <c:overlap val="100"/>
        <c:axId val="777777"/>
        <c:axId val="888888"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="777777"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:crossAx val="888888"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="888888"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:title>
          <c:tx><c:rich>
            <a:bodyPr/><a:lstStyle/>
            <a:p><a:r><a:rPr lang="ja-JP"/><a:t>秒</a:t></a:r></a:p>
          </c:rich></c:tx>
          <c:overlay val="0"/>
        </c:title>
        <c:crossAx val="777777"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

function chartXmlLine({ title, sheet, catRange, series }) {
  const sheetRef = `'${sheet}'`;
  const seriesXml = series
    .map(
      (s, i) => `
    <c:ser>
      <c:idx val="${i}"/>
      <c:order val="${i}"/>
      <c:tx><c:v>${escXml(s.name)}</c:v></c:tx>
      <c:spPr>
        <a:ln w="28000"><a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill></a:ln>
      </c:spPr>
      <c:marker>
        <c:symbol val="circle"/>
        <c:size val="7"/>
        <c:spPr><a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill></c:spPr>
      </c:marker>
      <c:cat>
        <c:strRef><c:f>${sheetRef}!${catRange}</c:f></c:strRef>
      </c:cat>
      <c:val>
        <c:numRef><c:f>${sheetRef}!${s.range}</c:f></c:numRef>
      </c:val>
      <c:smooth val="0"/>
    </c:ser>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(title)}</a:t></a:r></a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:marker val="1"/>
        <c:axId val="333333"/>
        <c:axId val="444444"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="333333"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="444444"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="444444"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:numFmt formatCode="0%" sourceLinked="0"/>
        <c:crossAx val="333333"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function drawingXml(chartLocation) {
  const { fromCol, fromRow, toCol, toRow } = chartLocation;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="1" name="Chart"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

const drawingRelsXml = (chartIdx) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIdx}.xml"/>
</Relationships>`;

// ─── 改善ポイント分析 (簡略版) ───
function analyzeImprovements() {
  const out = [];
  const tactMs = session.tactTimeSec * 1000;
  for (const cn of [1, 2, 3]) {
    const cycleTasks = tasks.filter((t) => t.cycleNumber === cn);
    const perRes = new Map();
    for (const r of resources) {
      const rt = cycleTasks.filter((t) => t.resourceId === r.id);
      const total = rt.reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
      perRes.set(r.id, { resource: r, total, tasks: rt });
    }
    const active = [...perRes.values()].filter((p) => p.total > 0);
    if (active.length >= 2) {
      active.sort((a, b) => b.total - a.total);
      const h = active[0], l = active[active.length - 1];
      const diff = h.total - l.total;
      if (diff > tactMs * 0.2) {
        const cand = h.tasks.filter((t) => t.category !== 'waste').sort((a, b) => b.endTimeMs - b.startTimeMs - (a.endTimeMs - a.startTimeMs))[0];
        out.push({
          severity: 'warn', cycle: cn,
          title: `負荷の偏り (C${cn})`,
          detail: `${h.resource.name}: ${(h.total/1000).toFixed(1)}s\n${l.resource.name}: ${(l.total/1000).toFixed(1)}s\n差: ${(diff/1000).toFixed(1)}s`,
          hint: cand ? `${h.resource.name} の「${cand.name}」を ${l.resource.name} に渡すと差が縮まります` : '',
        });
      }
    }
    for (const p of perRes.values()) {
      if (p.total > tactMs) {
        out.push({
          severity: 'critical', cycle: cn,
          title: `タクト超過: ${p.resource.name} (C${cn})`,
          detail: `合計 ${(p.total/1000).toFixed(1)}s / タクト ${(tactMs/1000).toFixed(1)}s\n超過分 ${((p.total-tactMs)/1000).toFixed(1)}s`,
          hint: 'ムダ・停止の削減か工程の組み替えが必要',
        });
      }
    }
    const w = [...perRes.values()].reduce((s, p) => s + sumCat(p.tasks, 'waste'), 0);
    const total = [...perRes.values()].reduce((s, p) => s + p.total, 0);
    if (total > 0 && w / total >= 0.2) {
      out.push({
        severity: w / total >= 0.4 ? 'critical' : 'warn', cycle: cn,
        title: `ムダ・停止が ${((w / total) * 100).toFixed(0)}% (C${cn})`,
        detail: `合計 ${(w/1000).toFixed(1)}s がムダ・停止`,
        hint: '無くせるムダか、減らせるムダかを動画で確認',
      });
    }
  }
  const rank = { critical: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.cycle - b.cycle);
  return out;
}

// ─── Excel 組み立て ───
async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'カイゼンスコープ';
  wb.created = new Date();

  const tactMs = session.tactTimeSec * 1000;

  // === Sheet 0: 概要 ===
  const wsOv = wb.addWorksheet('概要');
  wsOv.columns = [{ width: 22 }, { width: 30 }, { width: 4 }, { width: 12 }, { width: 12 }];
  wsOv.mergeCells('A1:E1');
  wsOv.getCell('A1').value = '📊 カイゼンスコープ レポート';
  wsOv.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  wsOv.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
  wsOv.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  wsOv.getRow(1).height = 36;

  const ovRows = [
    ['セッション名', session.name],
    ['作成日時', new Date(session.createdAt).toLocaleString('ja-JP')],
    ['分析モード', '人＋機械'],
    ['動画長さ', `${(session.durationMs/1000).toFixed(1)}s`],
    ['FPS', session.fps],
    ['タクトタイム (秒)', session.tactTimeSec],
    ['記録件数', tasks.length],
    ['対象リソース数', resources.length],
    ['記録サイクル数', 3],
  ];
  ovRows.forEach((r, i) => {
    const row = wsOv.getRow(i + 3);
    row.getCell(1).value = r[0];
    row.getCell(2).value = r[1];
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.subHeader } };
  });

  // 円グラフ用データ (右側 D3:E5)
  const totals = {
    value_added: sumCat(tasks, 'value_added') / 1000,
    incidental: sumCat(tasks, 'incidental') / 1000,
    waste: sumCat(tasks, 'waste') / 1000,
  };
  wsOv.getCell('D2').value = 'カテゴリ';
  wsOv.getCell('E2').value = '秒数';
  ['D2', 'E2'].forEach((c) => {
    wsOv.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsOv.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    wsOv.getCell(c).alignment = { horizontal: 'center' };
  });
  wsOv.getCell('D3').value = '正味';
  wsOv.getCell('E3').value = totals.value_added;
  wsOv.getCell('D3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.value_added } };
  wsOv.getCell('D4').value = '付帯';
  wsOv.getCell('E4').value = totals.incidental;
  wsOv.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.incidental } };
  wsOv.getCell('D5').value = 'ムダ・停止';
  wsOv.getCell('E5').value = totals.waste;
  wsOv.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.waste } };

  // === Sheet 1: 山積み (チャート + データ) ===
  const wsYama = wb.addWorksheet('山積み表');
  wsYama.columns = [{ width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
  const yHdr = ['ラベル', '正味(s)', '付帯(s)', 'ムダ(s)', '合計(s)', 'タクト達成率'];
  yHdr.forEach((h, i) => {
    const c = wsYama.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: ARGB.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    c.alignment = { horizontal: 'center' };
  });
  let yRow = 2;
  for (const cn of [1, 2, 3]) {
    for (const r of resources) {
      const rt = tasks.filter((t) => t.cycleNumber === cn && t.resourceId === r.id);
      const va = sumCat(rt, 'value_added') / 1000;
      const inc = sumCat(rt, 'incidental') / 1000;
      const w = sumCat(rt, 'waste') / 1000;
      const total = va + inc + w;
      const row = wsYama.getRow(yRow);
      row.getCell(1).value = `C${cn} ${r.type === 'machine' ? '⚙' : '👷'}${r.name}`;
      row.getCell(2).value = Number(va.toFixed(2));
      row.getCell(3).value = Number(inc.toFixed(2));
      row.getCell(4).value = Number(w.toFixed(2));
      row.getCell(5).value = { formula: `B${yRow}+C${yRow}+D${yRow}`, result: Number(total.toFixed(2)) };
      row.getCell(6).value = { formula: `E${yRow}/${session.tactTimeSec}`, result: total / session.tactTimeSec };
      row.getCell(6).numFmt = '0%';
      yRow++;
    }
  }
  // チャートが入る場所をある程度確保するため、空行を入れる (チャートは row 12 から)
  wsYama.getCell('A12').value = '↓ グラフ (データを変えると自動更新されます)';
  wsYama.getCell('A12').font = { italic: true, color: { argb: 'FF6B7280' } };

  // === Sheet 2: サイクル推移 (line chart 用) ===
  const wsCycle = wb.addWorksheet('サイクル推移');
  wsCycle.columns = [{ width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
  const cHdr = ['サイクル', '正味%', '付帯%', 'ムダ%'];
  cHdr.forEach((h, i) => {
    const c = wsCycle.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: ARGB.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    c.alignment = { horizontal: 'center' };
  });
  for (let i = 0; i < 3; i++) {
    const cn = i + 1;
    const cT = tasks.filter((t) => t.cycleNumber === cn);
    const va = sumCat(cT, 'value_added');
    const inc = sumCat(cT, 'incidental');
    const w = sumCat(cT, 'waste');
    const total = va + inc + w;
    const r = wsCycle.getRow(i + 2);
    r.getCell(1).value = `C${cn}`;
    r.getCell(2).value = total > 0 ? va / total : 0;
    r.getCell(3).value = total > 0 ? inc / total : 0;
    r.getCell(4).value = total > 0 ? w / total : 0;
    [2, 3, 4].forEach((col) => (r.getCell(col).numFmt = '0%'));
  }
  wsCycle.getCell('A6').value = '↓ サイクル間のカテゴリ比率の推移';
  wsCycle.getCell('A6').font = { italic: true, color: { argb: 'FF6B7280' } };

  // === Sheet 3: タスク詳細 ===
  const wsTasks = wb.addWorksheet('タスク詳細');
  const taskHeaders = ['#', 'サイクル', 'リソース', 'タイプ', '作業名', '開始(秒)', '終了(秒)', '所要(秒)', 'カテゴリ'];
  taskHeaders.forEach((h, i) => {
    const c = wsTasks.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: ARGB.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    c.alignment = { horizontal: 'center' };
  });
  const sorted = [...tasks].sort((a, b) => a.cycleNumber - b.cycleNumber || a.startTimeMs - b.startTimeMs);
  sorted.forEach((t, i) => {
    const r = resources.find((x) => x.id === t.resourceId);
    const isMachine = r?.type === 'machine';
    const row = wsTasks.getRow(i + 2);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = t.cycleNumber;
    row.getCell(3).value = r?.name;
    row.getCell(4).value = isMachine ? '機械' : '人';
    row.getCell(5).value = t.name;
    row.getCell(6).value = Number((t.startTimeMs / 1000).toFixed(2));
    row.getCell(7).value = Number((t.endTimeMs / 1000).toFixed(2));
    row.getCell(8).value = Number(((t.endTimeMs - t.startTimeMs) / 1000).toFixed(2));
    row.getCell(9).value = catLabel(t.category, isMachine);
    row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB[t.category] } };
    row.getCell(9).font = { bold: true };
  });
  wsTasks.columns = [
    { width: 5 }, { width: 8 }, { width: 16 }, { width: 8 }, { width: 26 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 },
  ];
  wsTasks.autoFilter = { from: { row: 1, column: 1 }, to: { row: sorted.length + 1, column: 9 } };
  wsTasks.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // === Sheet 4: 改善ポイント ===
  const wsImp = wb.addWorksheet('改善ポイント');
  const impHdr = ['重要度', 'サイクル', 'タイトル', '内容', '改善案'];
  impHdr.forEach((h, i) => {
    const c = wsImp.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: ARGB.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    c.alignment = { horizontal: 'center' };
  });
  const suggestions = analyzeImprovements();
  suggestions.forEach((s, i) => {
    const row = wsImp.getRow(i + 2);
    const sevText = s.severity === 'critical' ? '🔴 要対応' : s.severity === 'warn' ? '🟡 改善余地' : '🔵 ヒント';
    const sevArgb = s.severity === 'critical' ? ARGB.critical : s.severity === 'warn' ? ARGB.warn : ARGB.info;
    row.getCell(1).value = sevText;
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevArgb } };
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = `C${s.cycle}`;
    row.getCell(3).value = s.title;
    row.getCell(4).value = s.detail;
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(5).value = s.hint;
    row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
    row.height = 50;
  });
  wsImp.columns = [{ width: 14 }, { width: 8 }, { width: 28 }, { width: 50 }, { width: 50 }];

  // === Sheet 5: ガントチャート (chart + data) ===
  const wsGantt = wb.addWorksheet('ガントチャート');
  // A: ラベル / B: 開始(秒) / C: 終了(秒) / D: 所要(秒) / E: カテゴリ
  const ganttHdr = ['ラベル', '開始(秒)', '終了(秒)', '所要(秒)', 'カテゴリ'];
  ganttHdr.forEach((h, i) => {
    const c = wsGantt.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: ARGB.headerFg } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.headerBg } };
    c.alignment = { horizontal: 'center' };
  });
  // 開始時刻の DESC ソート: 末尾行が earliest になる。
  // Excel のネイティブ横棒チャートのデフォルト挙動 (data 末尾行 = chart の TOP) と
  // 組み合わせると、earliest が TOP に表示される。
  const ganttSorted = [...tasks].sort(
    (a, b) => b.startTimeMs - a.startTimeMs
  );
  ganttSorted.forEach((t, i) => {
    const r = resources.find((x) => x.id === t.resourceId);
    const isMachine = r?.type === 'machine';
    const row = wsGantt.getRow(i + 2);
    const label = `${isMachine ? '⚙' : '👷'}${r?.name}: ${t.name}`;
    row.getCell(1).value = label;
    row.getCell(2).value = Number((t.startTimeMs / 1000).toFixed(2));
    row.getCell(3).value = Number((t.endTimeMs / 1000).toFixed(2));
    row.getCell(4).value = { formula: `C${i + 2}-B${i + 2}`, result: Number(((t.endTimeMs - t.startTimeMs) / 1000).toFixed(2)) };
    row.getCell(5).value = catLabel(t.category, isMachine);
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB[t.category] } };
  });
  wsGantt.columns = [{ width: 32 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
  wsGantt.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // === Buffer に書き出し → ZIP として開いてネイティブチャートを注入 ===
  const buf = await wb.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(buf);

  // 各シート XML の名前 (作成順に sheet1, sheet2, ...)
  const sheetByOrder = [
    { name: '概要', file: 'xl/worksheets/sheet1.xml', relFile: 'xl/worksheets/_rels/sheet1.xml.rels' },
    { name: '山積み表', file: 'xl/worksheets/sheet2.xml', relFile: 'xl/worksheets/_rels/sheet2.xml.rels' },
    { name: 'サイクル推移', file: 'xl/worksheets/sheet3.xml', relFile: 'xl/worksheets/_rels/sheet3.xml.rels' },
    { name: 'タスク詳細', file: 'xl/worksheets/sheet4.xml', relFile: 'xl/worksheets/_rels/sheet4.xml.rels' },
    { name: '改善ポイント', file: 'xl/worksheets/sheet5.xml', relFile: 'xl/worksheets/_rels/sheet5.xml.rels' },
    { name: 'ガントチャート', file: 'xl/worksheets/sheet6.xml', relFile: 'xl/worksheets/_rels/sheet6.xml.rels' },
  ];

  // チャート定義
  const charts = [
    {
      idx: 1,
      drawingIdx: 1,
      onSheet: '概要',
      xml: chartXmlPie({
        title: '全体カテゴリ比率',
        sheet: '概要',
        catRange: '$D$3:$D$5',
        valRange: '$E$3:$E$5',
        colorsHex: [HEX.value_added, HEX.incidental, HEX.waste],
      }),
      anchor: { fromCol: 0, fromRow: 12, toCol: 7, toRow: 32 },
    },
    {
      idx: 2,
      drawingIdx: 2,
      onSheet: '山積み表',
      xml: chartXmlStackedColumn({
        title: '山積み表 (サイクル × リソース)',
        sheet: '山積み表',
        catRange: '$A$2:$A$10',
        series: [
          { name: '正味', range: '$B$2:$B$10', colorHex: HEX.value_added },
          { name: '付帯', range: '$C$2:$C$10', colorHex: HEX.incidental },
          { name: 'ムダ・停止', range: '$D$2:$D$10', colorHex: HEX.waste },
        ],
      }),
      anchor: { fromCol: 0, fromRow: 13, toCol: 10, toRow: 35 },
    },
    {
      idx: 3,
      drawingIdx: 3,
      onSheet: 'サイクル推移',
      xml: chartXmlLine({
        title: 'サイクル間 カテゴリ比率の推移',
        sheet: 'サイクル推移',
        catRange: '$A$2:$A$4',
        series: [
          { name: '正味%', range: '$B$2:$B$4', colorHex: HEX.value_added },
          { name: '付帯%', range: '$C$2:$C$4', colorHex: HEX.incidental },
          { name: 'ムダ%', range: '$D$2:$D$4', colorHex: HEX.waste },
        ],
      }),
      anchor: { fromCol: 0, fromRow: 7, toCol: 9, toRow: 28 },
    },
    {
      idx: 4,
      drawingIdx: 4,
      onSheet: 'ガントチャート',
      xml: chartXmlGantt({
        title: 'ガントチャート (タスク × 時系列)',
        sheet: 'ガントチャート',
        catRange: `$A$2:$A$${ganttSorted.length + 1}`,
        offsetRange: `$B$2:$B$${ganttSorted.length + 1}`,
        durationRange: `$D$2:$D$${ganttSorted.length + 1}`,
        dPtColors: ganttSorted.map((t) => HEX[t.category]),
      }),
      anchor: { fromCol: 6, fromRow: 0, toCol: 18, toRow: ganttSorted.length + 8 },
    },
  ];

  // 各チャートとそのドローイングを ZIP に追加
  for (const ch of charts) {
    zip.file(`xl/charts/chart${ch.idx}.xml`, ch.xml);
    zip.file(`xl/drawings/drawing${ch.drawingIdx}.xml`, drawingXml(ch.anchor));
    zip.file(`xl/drawings/_rels/drawing${ch.drawingIdx}.xml.rels`, drawingRelsXml(ch.idx));
  }

  // [Content_Types].xml に追加
  let ct = await zip.file('[Content_Types].xml').async('string');
  let extraTypes = '';
  for (const ch of charts) {
    extraTypes += `<Override PartName="/xl/charts/chart${ch.idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
    extraTypes += `<Override PartName="/xl/drawings/drawing${ch.drawingIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  }
  ct = ct.replace('</Types>', extraTypes + '</Types>');
  zip.file('[Content_Types].xml', ct);

  // 各シートに drawing 参照を埋め込む
  for (const ch of charts) {
    const sheetSpec = sheetByOrder.find((s) => s.name === ch.onSheet);
    if (!sheetSpec) continue;

    // 1) シート XML に <drawing r:id="rIdDrawing"/> を追加
    let sheetXml = await zip.file(sheetSpec.file).async('string');
    if (!sheetXml.includes('<drawing ')) {
      sheetXml = sheetXml.replace(/<\/worksheet>\s*$/, `<drawing r:id="rIdDrawing${ch.drawingIdx}"/></worksheet>`);
      zip.file(sheetSpec.file, sheetXml);
    } else {
      // 既に drawing がある場合は付け足し: 念のため二重登録を避けるため別名にしたいが、今回 exceljs は drawing を作っていないので省略
    }

    // 2) シートの rels に Relationship 追加
    const relsFile = zip.file(sheetSpec.relFile);
    let relsXml;
    if (relsFile) {
      relsXml = await relsFile.async('string');
    } else {
      relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    }
    const newRel = `<Relationship Id="rIdDrawing${ch.drawingIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${ch.drawingIdx}.xml"/>`;
    if (!relsXml.includes(`Id="rIdDrawing${ch.drawingIdx}"`)) {
      relsXml = relsXml.replace('</Relationships>', newRel + '</Relationships>');
    }
    zip.file(sheetSpec.relFile, relsXml);
  }

  const finalBuf = await zip.generateAsync({ type: 'nodebuffer' });
  let outPath = path.join(__dirname, '..', 'sample-report.xlsx');
  try {
    fs.writeFileSync(outPath, finalBuf);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      // 既存ファイルが Excel で開かれている場合は別名で保存
      outPath = path.join(__dirname, '..', `sample-report-${Date.now()}.xlsx`);
      fs.writeFileSync(outPath, finalBuf);
      console.log('⚠ 既存の sample-report.xlsx が開かれているため、別名で保存しました');
    } else {
      throw e;
    }
  }
  console.log(`✅ 生成完了: ${outPath}`);
  console.log(`   タスク ${tasks.length} / 改善 ${suggestions.length} 件 / シート ${sheetByOrder.length} (うちネイティブチャート ${charts.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
