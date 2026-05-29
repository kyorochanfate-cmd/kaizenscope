import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  CATEGORY_LABELS,
  MACHINE_CATEGORY_LABELS,
} from '../constants/categories';
import {
  AnalysisSession,
  Resource,
  TaskCategory,
  TaskElement,
} from '../types';
import { analyzeImprovements } from './improvements';
import { formatMs } from './time';

const HEX = {
  value_added: '22C55E',
  incidental: 'EAB308',
  waste: 'EF4444',
};

function modeLabel(m: AnalysisSession['mode']): string {
  return m === 'person' ? '人' : m === 'machine' ? '機械' : '人＋機械';
}

function categoryLabelFor(cat: TaskCategory, isMachine: boolean): string {
  return isMachine ? MACHINE_CATEGORY_LABELS[cat] : CATEGORY_LABELS[cat];
}

function sumCat(arr: TaskElement[], cat: TaskCategory): number {
  return arr.filter((t) => t.category === cat).reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
}

function escXml(s: string | number): string {
  return String(s).replace(/[<>&'"]/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
    return map[c];
  });
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'session';
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary =
    typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── OOXML チャート XML ジェネレータ (サンプルスクリプトと同一) ───
function chartXmlStackedColumn(opts: {
  title: string;
  sheet: string;
  catRange: string;
  series: { name: string; range: string; colorHex: string }[];
}): string {
  const sheetRef = `'${opts.sheet}'`;
  const seriesXml = opts.series
    .map(
      (s, i) => `
    <c:ser>
      <c:idx val="${i}"/>
      <c:order val="${i}"/>
      <c:tx><c:v>${escXml(s.name)}</c:v></c:tx>
      <c:spPr>
        <a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </c:spPr>
      <c:cat><c:strRef><c:f>${sheetRef}!${s.range.replace(/[A-Z]+(\d+):[A-Z]+\d+/, opts.catRange)}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${sheetRef}!${s.range}</c:f></c:numRef></c:val>
    </c:ser>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(opts.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
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
      <c:catAx><c:axId val="111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
      <c:valAx><c:axId val="222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:title><c:tx><c:rich><a:bodyPr rot="-5400000"/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP"/><a:t>秒</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:crossAx val="111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

function chartXmlPie(opts: {
  title: string;
  sheet: string;
  catRange: string;
  valRange: string;
  colorsHex: string[];
}): string {
  const sheetRef = `'${opts.sheet}'`;
  const dPts = opts.colorsHex
    .map(
      (col, i) =>
        `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:w w="20000"/></a:ln></c:spPr></c:dPt>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(opts.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          ${dPts}
          <c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>
</c:separator></c:dLbls>
          <c:cat><c:strRef><c:f>${sheetRef}!${opts.catRange}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${sheetRef}!${opts.valRange}</c:f></c:numRef></c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function chartXmlLine(opts: {
  title: string;
  sheet: string;
  catRange: string;
  series: { name: string; range: string; colorHex: string }[];
}): string {
  const sheetRef = `'${opts.sheet}'`;
  const seriesXml = opts.series
    .map(
      (s, i) => `
    <c:ser>
      <c:idx val="${i}"/>
      <c:order val="${i}"/>
      <c:tx><c:v>${escXml(s.name)}</c:v></c:tx>
      <c:spPr><a:ln w="28000"><a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill></a:ln></c:spPr>
      <c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill></c:spPr></c:marker>
      <c:cat><c:strRef><c:f>${sheetRef}!${opts.catRange}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${sheetRef}!${s.range}</c:f></c:numRef></c:val>
      <c:smooth val="0"/>
    </c:ser>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(opts.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
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
      <c:catAx><c:axId val="333333"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="444444"/></c:catAx>
      <c:valAx><c:axId val="444444"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="0%" sourceLinked="0"/><c:crossAx val="333333"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function chartXmlGantt(opts: {
  title: string;
  sheet: string;
  catRange: string;
  offsetRange: string;
  durationRange: string;
  dPtColors: string[];
}): string {
  const sheetRef = `'${opts.sheet}'`;
  const dPtsXml = opts.dPtColors
    .map(
      (color, i) =>
        `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" b="1" sz="1400"/><a:t>${escXml(opts.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
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
          <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
          <c:invertIfNegative val="0"/>
          <c:cat><c:strRef><c:f>${sheetRef}!${opts.catRange}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${sheetRef}!${opts.offsetRange}</c:f></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:v>所要</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
          <c:invertIfNegative val="0"/>
          ${dPtsXml}
          <c:cat><c:strRef><c:f>${sheetRef}!${opts.catRange}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${sheetRef}!${opts.durationRange}</c:f></c:numRef></c:val>
        </c:ser>
        <c:gapWidth val="80"/>
        <c:overlap val="100"/>
        <c:axId val="777777"/>
        <c:axId val="888888"/>
      </c:barChart>
      <c:catAx><c:axId val="777777"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="888888"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
      <c:valAx><c:axId val="888888"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP"/><a:t>秒</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:crossAx val="777777"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

function drawingXml(anchor: {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
}): string {
  const { fromCol, fromRow, toCol, toRow } = anchor;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr><xdr:cNvPr id="1" name="Chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
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

const drawingRelsXml = (chartIdx: number): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIdx}.xml"/>
</Relationships>`;

// ─── ワークブック組み立て ───
async function buildWorkbookBytes(
  session: AnalysisSession,
  resources: Resource[],
  tasks: TaskElement[]
): Promise<Uint8Array> {
  const tactMs = session.tactTimeSec * 1000;

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: 概要 (右側 D2:E5 にカテゴリ集計 — 円グラフ参照用) ───
  const overview: (string | number)[][] = [
    ['カイゼンスコープ レポート'],
    [],
    ['セッション名', session.name],
    ['作成日時', new Date(session.createdAt).toLocaleString('ja-JP')],
    ['分析モード', modeLabel(session.mode)],
    ['動画長さ', formatMs(session.durationMs)],
    ['FPS', session.fps],
    ['タクトタイム (秒)', session.tactTimeSec],
    [],
    ['記録件数', tasks.length],
    ['対象リソース数', resources.length],
  ];

  // 試算条件が設定されていれば、概要の最下部に「改善効果見込み」を出す
  if (session.hourlyRateYen != null && session.cyclesPerDay != null) {
    const days = session.workingDaysPerYear ?? 250;
    const wasteSec = sumCat(tasks, 'waste') / 1000;
    // ムダを全てなくせた場合の年間効果
    const hoursIfZeroWaste = wasteSec * session.cyclesPerDay * days / 3600;
    const yenIfZeroWaste = hoursIfZeroWaste * session.hourlyRateYen;
    // ムダを半減できた場合
    const yenIfHalfWaste = yenIfZeroWaste / 2;
    overview.push(
      [],
      ['💰 改善効果の試算 (年間)'],
      ['時給', `¥${session.hourlyRateYen}/h`],
      ['1日のサイクル数', `${session.cyclesPerDay} 台`],
      ['年間稼働日数', `${days} 日`],
      ['1サイクル当たりのムダ・停止', `${wasteSec.toFixed(1)} 秒`],
      ['ムダ全廃時の年間効果', Math.round(yenIfZeroWaste)],
      ['ムダ半減時の年間効果', Math.round(yenIfHalfWaste)],
    );
  }
  const wsOv = XLSX.utils.aoa_to_sheet(overview);
  wsOv['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 4 }, { wch: 14 }, { wch: 12 }];
  // 円グラフ用データを D2:E5 に追加
  const totalsAll = {
    value_added: sumCat(tasks, 'value_added') / 1000,
    incidental: sumCat(tasks, 'incidental') / 1000,
    waste: sumCat(tasks, 'waste') / 1000,
  };
  XLSX.utils.sheet_add_aoa(
    wsOv,
    [
      ['カテゴリ', '秒数'],
      ['正味', totalsAll.value_added],
      ['付帯', totalsAll.incidental],
      ['ムダ・停止', totalsAll.waste],
    ],
    { origin: 'D2' }
  );
  XLSX.utils.book_append_sheet(wb, wsOv, '概要');

  // ─── Sheet 2: ガントチャート (チャート参照用データ) ───
  // 列構成: A=ラベル / B=開始(秒) / C=終了(秒) / D=所要(秒) / E=カテゴリ
  // データは開始時刻の **降順** で持つ。理由: Excel のネイティブ横棒チャートは
  // データ先頭行が下、末尾行が上に描画されるため、降順にすると
  // 「開始が早い作業ほど上」に並ぶ。
  const ganttHeader = ['ラベル', '開始(秒)', '終了(秒)', '所要(秒)', 'カテゴリ'];
  const ganttRows: (string | number)[][] = [ganttHeader];
  const ganttSorted = [...tasks].sort(
    (a, b) => b.startTimeMs - a.startTimeMs
  );
  ganttSorted.forEach((t) => {
    const r = resources.find((x) => x.id === t.resourceId);
    const isMachine = r?.type === 'machine';
    const startSec = Number((t.startTimeMs / 1000).toFixed(2));
    const endSec = Number((t.endTimeMs / 1000).toFixed(2));
    ganttRows.push([
      `${isMachine ? '⚙' : '👷'}${r?.name ?? '?'}: ${t.name}`,
      startSec,
      endSec,
      Number((endSec - startSec).toFixed(2)),
      categoryLabelFor(t.category, isMachine),
    ]);
  });
  const ganttRowCount = ganttRows.length - 1;
  const wsGantt = XLSX.utils.aoa_to_sheet(ganttRows);
  wsGantt['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsGantt, 'ガントチャート');

  // ─── Sheet 3: 山積み表 (リソース別の集計) ───
  const yamaHeader = ['リソース', '正味(s)', '付帯(s)', 'ムダ(s)', '合計(s)', 'タクト達成率'];
  const yamaRows: (string | number)[][] = [yamaHeader];
  for (const r of resources) {
    const rt = tasks.filter((t) => t.resourceId === r.id);
    const va = sumCat(rt, 'value_added') / 1000;
    const inc = sumCat(rt, 'incidental') / 1000;
    const w = sumCat(rt, 'waste') / 1000;
    const total = va + inc + w;
    yamaRows.push([
      `${r.type === 'machine' ? '⚙' : '👷'}${r.name}`,
      Number(va.toFixed(2)),
      Number(inc.toFixed(2)),
      Number(w.toFixed(2)),
      Number(total.toFixed(2)),
      tactMs > 0 ? Number((total / session.tactTimeSec).toFixed(3)) : 0,
    ]);
  }
  const yamaRowCount = yamaRows.length - 1;
  const wsYama = XLSX.utils.aoa_to_sheet(yamaRows);
  wsYama['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsYama, '山積み表');

  // ─── Sheet 3: タスク詳細 ───
  const sortedTasks = [...tasks].sort(
    (a, b) =>
      a.resourceId.localeCompare(b.resourceId) ||
      a.startTimeMs - b.startTimeMs
  );
  const taskHeader = [
    '#',
    'リソース',
    'タイプ',
    '作業名',
    '開始(秒)',
    '終了(秒)',
    '所要(秒)',
    'カテゴリ',
  ];
  const taskRows: (string | number)[][] = [taskHeader];
  sortedTasks.forEach((t, i) => {
    const r = resources.find((x) => x.id === t.resourceId);
    const isMachine = r?.type === 'machine';
    taskRows.push([
      i + 1,
      r?.name ?? '?',
      isMachine ? '機械' : '人',
      t.name,
      Number((t.startTimeMs / 1000).toFixed(2)),
      Number((t.endTimeMs / 1000).toFixed(2)),
      Number(((t.endTimeMs - t.startTimeMs) / 1000).toFixed(2)),
      categoryLabelFor(t.category, isMachine),
    ]);
  });
  const wsTasks = XLSX.utils.aoa_to_sheet(taskRows);
  wsTasks['!cols'] = [
    { wch: 5 }, { wch: 16 }, { wch: 6 }, { wch: 24 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTasks, 'タスク詳細');

  // ─── Sheet 4: 改善ポイント ───
  const suggestions = analyzeImprovements(session, resources, tasks);
  const impHeader = ['重要度', 'タイトル', '内容', '改善案'];
  const impRows: (string | number)[][] = [impHeader];
  for (const s of suggestions) {
    impRows.push([
      s.severity === 'critical' ? '🔴 要対応' : s.severity === 'warn' ? '🟡 改善余地' : '🔵 ヒント',
      s.title,
      s.detail,
      s.hint ?? '',
    ]);
  }
  if (suggestions.length === 0) {
    impRows.push(['—', '改善ポイントは見つかりませんでした', '', '']);
  }
  const wsImp = XLSX.utils.aoa_to_sheet(impRows);
  wsImp['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 50 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsImp, '改善ポイント');

  // ─── xlsx 書き出し ───
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const bytes = base64ToUint8Array(b64);

  // ─── JSZip でチャート XML を inject ───
  const zip = await JSZip.loadAsync(bytes);

  const sheetByOrder = [
    { name: '概要', file: 'xl/worksheets/sheet1.xml', relFile: 'xl/worksheets/_rels/sheet1.xml.rels' },
    { name: 'ガントチャート', file: 'xl/worksheets/sheet2.xml', relFile: 'xl/worksheets/_rels/sheet2.xml.rels' },
    { name: '山積み表', file: 'xl/worksheets/sheet3.xml', relFile: 'xl/worksheets/_rels/sheet3.xml.rels' },
    { name: 'タスク詳細', file: 'xl/worksheets/sheet4.xml', relFile: 'xl/worksheets/_rels/sheet4.xml.rels' },
    { name: '改善ポイント', file: 'xl/worksheets/sheet5.xml', relFile: 'xl/worksheets/_rels/sheet5.xml.rels' },
  ];

  type ChartDef = {
    idx: number;
    drawingIdx: number;
    onSheet: string;
    xml: string;
    anchor: { fromCol: number; fromRow: number; toCol: number; toRow: number };
  };
  const charts: ChartDef[] = [];

  // Pie (概要)
  charts.push({
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
    anchor: { fromCol: 0, fromRow: 13, toCol: 7, toRow: 32 },
  });

  // Stacked column (山積み表)
  if (yamaRowCount > 0) {
    charts.push({
      idx: 2,
      drawingIdx: 2,
      onSheet: '山積み表',
      xml: chartXmlStackedColumn({
        title: '山積み表 (リソース別)',
        sheet: '山積み表',
        catRange: `$A$2:$A$${yamaRowCount + 1}`,
        series: [
          { name: '正味', range: `$B$2:$B$${yamaRowCount + 1}`, colorHex: HEX.value_added },
          { name: '付帯', range: `$C$2:$C$${yamaRowCount + 1}`, colorHex: HEX.incidental },
          { name: 'ムダ・停止', range: `$D$2:$D$${yamaRowCount + 1}`, colorHex: HEX.waste },
        ],
      }),
      anchor: { fromCol: 0, fromRow: yamaRowCount + 3, toCol: 10, toRow: yamaRowCount + 25 },
    });
  }

  // Gantt (ガントチャート)
  if (ganttRowCount > 0) {
    charts.push({
      idx: 3,
      drawingIdx: 3,
      onSheet: 'ガントチャート',
      xml: chartXmlGantt({
        title: 'ガントチャート (タスク × 時系列)',
        sheet: 'ガントチャート',
        catRange: `$A$2:$A$${ganttRowCount + 1}`,
        offsetRange: `$B$2:$B$${ganttRowCount + 1}`,
        durationRange: `$D$2:$D$${ganttRowCount + 1}`,
        dPtColors: ganttSorted.map((t) => HEX[t.category]),
      }),
      anchor: { fromCol: 6, fromRow: 0, toCol: 18, toRow: ganttRowCount + 8 },
    });
  }

  // チャート/ドローイング XML を追加
  for (const ch of charts) {
    zip.file(`xl/charts/chart${ch.idx}.xml`, ch.xml);
    zip.file(`xl/drawings/drawing${ch.drawingIdx}.xml`, drawingXml(ch.anchor));
    zip.file(`xl/drawings/_rels/drawing${ch.drawingIdx}.xml.rels`, drawingRelsXml(ch.idx));
  }

  // [Content_Types].xml にエントリ追加
  const ctEntry = zip.file('[Content_Types].xml');
  if (ctEntry) {
    let ct = await ctEntry.async('string');
    let extra = '';
    for (const ch of charts) {
      extra += `<Override PartName="/xl/charts/chart${ch.idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
      extra += `<Override PartName="/xl/drawings/drawing${ch.drawingIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
    }
    ct = ct.replace('</Types>', extra + '</Types>');
    zip.file('[Content_Types].xml', ct);
  }

  // 各シートに drawing 参照を埋め込む
  for (const ch of charts) {
    const sheetSpec = sheetByOrder.find((s) => s.name === ch.onSheet);
    if (!sheetSpec) continue;

    // シート XML に <drawing r:id="..."/> を追加
    const sheetEntry = zip.file(sheetSpec.file);
    if (sheetEntry) {
      let sheetXml = await sheetEntry.async('string');
      if (!sheetXml.includes(`r:id="rIdDrawing${ch.drawingIdx}"`)) {
        sheetXml = sheetXml.replace(
          /<\/worksheet>\s*$/,
          `<drawing r:id="rIdDrawing${ch.drawingIdx}"/></worksheet>`
        );
        zip.file(sheetSpec.file, sheetXml);
      }
    }

    // シートの rels ファイルに Relationship 追加 (無ければ新規作成)
    const relsEntry = zip.file(sheetSpec.relFile);
    let relsXml: string;
    if (relsEntry) {
      relsXml = await relsEntry.async('string');
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

  const finalBytes = await zip.generateAsync({ type: 'uint8array' });
  return finalBytes;
}

export async function exportXlsx(
  session: AnalysisSession,
  resources: Resource[],
  tasks: TaskElement[]
): Promise<string> {
  const bytes = await buildWorkbookBytes(session, resources, tasks);
  const filename = `${safeFileName(session.name)}_${session.id.slice(0, 8)}.xlsx`;
  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Excel レポートを送信',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }
  return file.uri;
}
