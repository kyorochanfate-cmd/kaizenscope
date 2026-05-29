import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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

/**
 * セッションから A4 縦の本格 PDF レポートを生成し、シェアシートを開く。
 *
 * ページ構成:
 *  1. カバー: タイトル、メタ、KPI 4タイル、円グラフ、改善効果見込み
 *  2. 山積み + リソース別表
 *  3. ガントチャート (時間軸つき)
 *  4. 改善ポイント + 次のアクション
 *  付録: タスク詳細表
 */

const CAT_COLOR: Record<TaskCategory, string> = {
  value_added: '#10b981',
  incidental: '#3b82f6',
  waste: '#ef4444',
};

const INDIGO_DARK = '#1e1b4b';
const INDIGO_MID = '#3730a3';
const INDIGO_ACCENT = '#4338ca';

function modeLabel(m: AnalysisSession['mode']): string {
  return m === 'person' ? '人' : m === 'machine' ? '機械' : '人＋機械';
}

function catLabelFor(c: TaskCategory, isMachine: boolean): string {
  return isMachine ? MACHINE_CATEGORY_LABELS[c] : CATEGORY_LABELS[c];
}

function esc(s: string | number): string {
  return String(s).replace(/[<>&'"]/g, (c) => {
    const map: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[c];
  });
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'session';
}

function fmtYen(n: number): string {
  if (n >= 100000000) return `¥${(n / 100000000).toFixed(2)} 億`;
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)} 万`;
  return `¥${Math.round(n).toLocaleString()}`;
}

interface Stats {
  total: number;
  byCat: Record<TaskCategory, number>;
  pct: Record<TaskCategory, number>;
}

function computeStats(tasks: TaskElement[]): Stats {
  const byCat: Record<TaskCategory, number> = {
    value_added: 0,
    incidental: 0,
    waste: 0,
  };
  let total = 0;
  for (const t of tasks) {
    const d = t.endTimeMs - t.startTimeMs;
    byCat[t.category] += d;
    total += d;
  }
  const pct: Record<TaskCategory, number> = {
    value_added: total > 0 ? (byCat.value_added / total) * 100 : 0,
    incidental: total > 0 ? (byCat.incidental / total) * 100 : 0,
    waste: total > 0 ? (byCat.waste / total) * 100 : 0,
  };
  return { total, byCat, pct };
}

/** 円グラフ (3 セグメント + 中央に空白) — ドーナツ風 */
function donutSvg(stats: Stats, size: number): string {
  const r = size / 2 - 6;
  const innerR = r * 0.55;
  const cx = size / 2;
  const cy = size / 2;
  const total = stats.byCat.value_added + stats.byCat.incidental + stats.byCat.waste;
  if (total === 0) {
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0"/>
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#ffffff"/>
    </svg>`;
  }
  let acc = 0;
  const segs: string[] = [];
  (['value_added', 'incidental', 'waste'] as const).forEach((c) => {
    const v = stats.byCat[c];
    if (v === 0) return;
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += v;
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const x0o = cx + r * Math.cos(a0);
    const y0o = cy + r * Math.sin(a0);
    const x1o = cx + r * Math.cos(a1);
    const y1o = cy + r * Math.sin(a1);
    const x0i = cx + innerR * Math.cos(a1);
    const y0i = cy + innerR * Math.sin(a1);
    const x1i = cx + innerR * Math.cos(a0);
    const y1i = cy + innerR * Math.sin(a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    segs.push(
      `<path d="M${x0o.toFixed(2)},${y0o.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1o.toFixed(2)},${y1o.toFixed(2)} L${x0i.toFixed(2)},${y0i.toFixed(2)} A${innerR},${innerR} 0 ${large} 0 ${x1i.toFixed(2)},${y1i.toFixed(2)} Z" fill="${CAT_COLOR[c]}" />`
    );
  });
  // 中央の合計表示
  const totalMin = Math.floor(total / 60000);
  const totalSec = Math.floor((total % 60000) / 1000);
  const centerLabel =
    totalMin > 0 ? `${totalMin}分${totalSec.toString().padStart(2, '0')}秒` : `${totalSec}秒`;
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${segs.join('')}
    <text x="${cx}" y="${cy - 4}" font-size="11" fill="#64748b" font-weight="700" text-anchor="middle" font-family="-apple-system,sans-serif">合計時間</text>
    <text x="${cx}" y="${cy + 14}" font-size="16" fill="#0f172a" font-weight="800" text-anchor="middle" font-family="-apple-system,sans-serif" font-variant-numeric="tabular-nums">${esc(centerLabel)}</text>
  </svg>`;
}

/** タクト達成率のゲージ (半円) */
function gaugeSvg(pct: number, size: number): string {
  const w = size;
  const h = size * 0.6;
  const cx = w / 2;
  const cy = h - 8;
  const r = w / 2 - 12;
  const startA = Math.PI;
  const endA = 0;
  // 背景半円
  const bgPath = `M ${(cx - r).toFixed(2)},${cy.toFixed(2)} A ${r},${r} 0 0 1 ${(cx + r).toFixed(2)},${cy.toFixed(2)}`;
  // 進捗弧
  const clamped = Math.max(0, Math.min(1.5, pct / 100));
  const a = startA - clamped * Math.PI;
  const ex = cx + r * Math.cos(a);
  const ey = cy + r * Math.sin(a);
  const large = a < 0 ? 1 : 0;
  const progPath =
    pct === 0
      ? ''
      : `M ${(cx - r).toFixed(2)},${cy.toFixed(2)} A ${r},${r} 0 ${large} 1 ${ex.toFixed(2)},${ey.toFixed(2)}`;
  const color = pct > 100 ? '#dc2626' : pct > 90 ? '#f59e0b' : '#10b981';
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <path d="${bgPath}" stroke="#e2e8f0" stroke-width="16" fill="none" stroke-linecap="round"/>
    ${progPath ? `<path d="${progPath}" stroke="${color}" stroke-width="16" fill="none" stroke-linecap="round"/>` : ''}
    <text x="${cx}" y="${cy - 6}" font-size="28" fill="#0f172a" font-weight="900" text-anchor="middle" font-family="-apple-system,sans-serif" font-variant-numeric="tabular-nums">${esc(Math.round(pct))}<tspan font-size="14" font-weight="700" fill="#64748b">%</tspan></text>
    <text x="${cx - r - 4}" y="${cy + 14}" font-size="9" fill="#94a3b8" text-anchor="end" font-family="-apple-system,sans-serif">0</text>
    <text x="${cx + r + 4}" y="${cy + 14}" font-size="9" fill="#94a3b8" font-family="-apple-system,sans-serif">100+</text>
  </svg>`;
}

/** ガントチャート SVG */
function ganttSvg(
  tasks: TaskElement[],
  resources: Resource[],
  tactMs: number,
  width: number,
  rowHeight: number
): string {
  if (tasks.length === 0) return '';
  const maxMs = Math.max(
    tactMs * 1.1,
    ...tasks.map((t) => t.endTimeMs),
    1000
  );
  const chartHeight = resources.length * rowHeight + 40; // header + rows
  const labelW = 110;
  const pxPerMs = (width - labelW - 20) / maxMs;

  // 軸 (秒の目盛り)
  const tickStep = pickTickStep(maxMs);
  const ticks: number[] = [];
  for (let t = 0; t <= maxMs; t += tickStep) ticks.push(t);

  const axisY = 22;
  const rowsStartY = 32;

  const axisLines = ticks
    .map((t) => {
      const x = labelW + t * pxPerMs;
      return `
        <line x1="${x.toFixed(1)}" y1="${axisY}" x2="${x.toFixed(1)}" y2="${chartHeight - 8}" stroke="#e2e8f0" stroke-width="0.5"/>
        <text x="${x.toFixed(1)}" y="${axisY - 4}" font-size="8" fill="#64748b" text-anchor="middle" font-family="-apple-system,sans-serif">${esc((t / 1000).toFixed(t < 10000 ? 1 : 0))}s</text>
      `;
    })
    .join('');

  // タクト線
  const tactLine =
    tactMs > 0
      ? `
    <line x1="${(labelW + tactMs * pxPerMs).toFixed(1)}" y1="${axisY - 2}" x2="${(labelW + tactMs * pxPerMs).toFixed(1)}" y2="${chartHeight - 8}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text x="${(labelW + tactMs * pxPerMs + 4).toFixed(1)}" y="${axisY - 4}" font-size="8" fill="#dc2626" font-weight="700" font-family="-apple-system,sans-serif">T/T</text>
  `
      : '';

  const rows = resources
    .map((r, idx) => {
      const y = rowsStartY + idx * rowHeight;
      const rTasks = tasks.filter((t) => t.resourceId === r.id);
      const rowBg =
        idx % 2 === 0
          ? `<rect x="${labelW}" y="${y}" width="${(width - labelW - 10).toFixed(1)}" height="${rowHeight - 2}" fill="#f8fafc"/>`
          : '';
      const label = `<text x="${labelW - 6}" y="${y + rowHeight / 2 + 3}" font-size="9" fill="#0f172a" font-weight="700" text-anchor="end" font-family="-apple-system,sans-serif">${esc((r.type === 'person' ? '👷 ' : '⚙ ') + r.name)}</text>`;
      const bars = rTasks
        .map((t) => {
          const x = labelW + t.startTimeMs * pxPerMs;
          const w = Math.max(1.2, (t.endTimeMs - t.startTimeMs) * pxPerMs);
          const txt =
            w > 24
              ? `<text x="${(x + 3).toFixed(1)}" y="${y + rowHeight / 2 + 3}" font-size="7" fill="#ffffff" font-weight="700" font-family="-apple-system,sans-serif" clip-path="inset(0)">${esc(t.name.slice(0, Math.floor(w / 5)))}</text>`
              : '';
          return `
            <rect x="${x.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="${rowHeight - 8}" fill="${CAT_COLOR[t.category]}" rx="2"/>
            ${txt}
          `;
        })
        .join('');
      return rowBg + label + bars;
    })
    .join('');

  return `<svg width="${width}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,sans-serif">
    ${axisLines}
    ${tactLine}
    ${rows}
  </svg>`;
}

function pickTickStep(maxMs: number): number {
  if (maxMs <= 5000) return 1000;
  if (maxMs <= 20000) return 2000;
  if (maxMs <= 60000) return 5000;
  if (maxMs <= 120000) return 10000;
  return Math.ceil(maxMs / 8000) * 1000;
}

function buildHtml(
  session: AnalysisSession,
  resources: Resource[],
  tasks: TaskElement[]
): string {
  const stats = computeStats(tasks);
  const tactMs = session.tactTimeSec * 1000;
  const tactPct = tactMs > 0 ? (stats.total / tactMs) * 100 : 0;
  const isMachine = session.mode === 'machine';

  // リソース別の集計
  const perRes = resources.map((r) => {
    const rt = tasks.filter((t) => t.resourceId === r.id);
    const s = computeStats(rt);
    return { resource: r, stats: s, count: rt.length };
  });
  const maxResTotal = Math.max(
    tactMs,
    ...perRes.map((p) => p.stats.total),
    1
  );

  // 改善ポイント
  const suggestions = analyzeImprovements(session, resources, tasks);
  const sevMeta: Record<
    string,
    {
      color: string;
      bg: string;
      border: string;
      label: string;
      icon: string;
    }
  > = {
    critical: {
      color: '#991b1b',
      bg: '#fef2f2',
      border: '#fca5a5',
      label: '要対応',
      icon: '!',
    },
    warn: {
      color: '#92400e',
      bg: '#fffbeb',
      border: '#fcd34d',
      label: '改善余地',
      icon: '△',
    },
    info: {
      color: '#1e40af',
      bg: '#eff6ff',
      border: '#93c5fd',
      label: 'ヒント',
      icon: 'i',
    },
  };

  // 改善効果見込み (任意)
  let costHeroBlock = '';
  if (session.hourlyRateYen != null && session.cyclesPerDay != null) {
    const days = session.workingDaysPerYear ?? 250;
    const wasteSec = stats.byCat.waste / 1000;
    const hoursIfZero = (wasteSec * session.cyclesPerDay * days) / 3600;
    const yenIfZero = hoursIfZero * session.hourlyRateYen;
    const yenIfHalf = yenIfZero / 2;
    costHeroBlock = `
      <section class="cost-hero">
        <div class="cost-hero-label">💰 改善効果の試算</div>
        <div class="cost-hero-grid">
          <div class="cost-hero-card primary">
            <div class="cost-hero-card-label">ムダ全廃時の年間効果</div>
            <div class="cost-hero-card-value">${esc(fmtYen(yenIfZero))}</div>
            <div class="cost-hero-card-sub">/ 年</div>
          </div>
          <div class="cost-hero-card secondary">
            <div class="cost-hero-card-label">ムダ半減時</div>
            <div class="cost-hero-card-value">${esc(fmtYen(yenIfHalf))}</div>
            <div class="cost-hero-card-sub">/ 年</div>
          </div>
        </div>
        <div class="cost-hero-formula">
          試算条件: ${esc(wasteSec.toFixed(1))} 秒/サイクル × ${esc(session.cyclesPerDay)} 台/日 × ${esc(days)} 日/年 × ¥${esc(session.hourlyRateYen)}/h
        </div>
      </section>
    `;
  }

  // ガント
  const ganttCanvasW = 540;
  const ganttRowH = 22;
  const ganttHtml = ganttSvg(tasks, resources, tactMs, ganttCanvasW, ganttRowH);

  // タスク詳細表
  const taskRows = tasks
    .slice()
    .sort((a, b) => a.startTimeMs - b.startTimeMs)
    .map((t, i) => {
      const r = resources.find((x) => x.id === t.resourceId);
      const dur = t.endTimeMs - t.startTimeMs;
      return `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${esc(r ? r.name : '?')}</td>
          <td>${esc(t.name)}</td>
          <td class="num">${esc(formatMs(t.startTimeMs))}</td>
          <td class="num">${esc(formatMs(t.endTimeMs))}</td>
          <td class="num"><b>${esc(formatMs(dur))}</b></td>
          <td><span class="cat-dot" style="background:${CAT_COLOR[t.category]}"></span>${esc(catLabelFor(t.category, isMachine))}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${esc(session.name)} - カイゼンスコープ レポート</title>
<style>
  @page {
    size: A4;
    margin: 14mm 12mm 16mm 12mm;
    @bottom-center {
      content: counter(page) " / " counter(pages);
      font-size: 9px;
      color: #94a3b8;
      font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    color: #0f172a;
    font-size: 10.5px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ─── ヘッダ ─── */
  .hero {
    background: linear-gradient(135deg, ${INDIGO_DARK} 0%, ${INDIGO_MID} 100%);
    color: #ffffff;
    padding: 18px 20px;
    border-radius: 10px;
    margin-bottom: 14px;
    position: relative;
    overflow: hidden;
  }
  .hero::after {
    content: '';
    position: absolute;
    right: -40px;
    top: -40px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
  }
  .hero-brand {
    font-size: 9px;
    letter-spacing: 2px;
    font-weight: 700;
    color: #c7d2fe;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .hero-title {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1.2;
    margin-bottom: 8px;
  }
  .hero-meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 10px;
    color: #c7d2fe;
  }
  .hero-meta-chip {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(255,255,255,0.12);
    border-radius: 10px;
    color: #ffffff;
    font-weight: 600;
  }

  /* ─── セクション見出し ─── */
  h2 {
    font-size: 13px;
    color: ${INDIGO_DARK};
    font-weight: 800;
    margin: 14px 0 8px;
    padding-bottom: 4px;
    border-bottom: 2px solid ${INDIGO_ACCENT};
    letter-spacing: -0.2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h2 .h2-num {
    background: ${INDIGO_ACCENT};
    color: #ffffff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 800;
  }

  /* ─── サマリ (ドーナツ + KPI + ゲージ) ─── */
  .summary-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 16px;
    align-items: center;
  }
  .summary-donut {
    text-align: center;
  }
  .summary-donut-legend {
    margin-top: 6px;
    display: flex;
    justify-content: center;
    flex-direction: column;
    gap: 3px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
  }
  .legend-color {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .legend-label { font-weight: 700; color: #334155; }
  .legend-pct {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    color: #0f172a;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .kpi-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    position: relative;
  }
  .kpi-card-accent {
    position: absolute;
    left: 0; top: 12px; bottom: 12px;
    width: 3px;
    border-radius: 2px;
  }
  .kpi-label {
    font-size: 9px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 800;
    margin-bottom: 3px;
  }
  .kpi-value {
    font-size: 20px;
    font-weight: 900;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .kpi-value-suffix {
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    margin-left: 2px;
  }
  .kpi-sub {
    font-size: 9px;
    color: #64748b;
    margin-top: 3px;
  }

  /* ─── 改善効果 (ヒーロー) ─── */
  .cost-hero {
    margin-top: 12px;
    padding: 12px 14px;
    background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%);
    border: 1px solid #6ee7b7;
    border-radius: 10px;
  }
  .cost-hero-label {
    font-size: 10px;
    color: #047857;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .cost-hero-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }
  .cost-hero-card {
    background: #ffffff;
    border-radius: 8px;
    padding: 10px 12px;
    border: 1px solid;
  }
  .cost-hero-card.primary { border-color: #10b981; }
  .cost-hero-card.secondary { border-color: #a7f3d0; }
  .cost-hero-card-label {
    font-size: 9px;
    color: #047857;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .cost-hero-card-value {
    font-size: 26px;
    font-weight: 900;
    color: #047857;
    line-height: 1;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
  }
  .cost-hero-card.secondary .cost-hero-card-value { font-size: 18px; }
  .cost-hero-card-sub {
    font-size: 10px;
    color: #065f46;
    font-weight: 700;
    margin-top: 2px;
  }
  .cost-hero-formula {
    font-size: 9px;
    color: #065f46;
    margin-top: 8px;
    text-align: right;
    font-style: italic;
  }

  /* ─── 山積み ─── */
  .yamazumi-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    padding: 6px 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .yz-name {
    width: 100px;
    font-size: 10px;
    font-weight: 800;
    color: #0f172a;
  }
  .yz-name-type {
    font-size: 8px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .yz-track {
    flex: 1;
    height: 22px;
    background: #f1f5f9;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    position: relative;
  }
  .yz-seg {
    height: 100%;
    position: relative;
  }
  .yz-seg-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 8px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .yz-tact {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 0;
    border-left: 2px dashed #dc2626;
  }
  .yz-total {
    width: 60px;
    text-align: right;
    font-size: 10px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .yz-pct {
    font-size: 9px;
    color: #64748b;
    font-weight: 700;
  }

  /* ─── ガント ─── */
  .gantt-wrap {
    background: #ffffff;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }

  /* ─── 改善ポイント ─── */
  .sug {
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 4px solid;
    border: 1px solid;
    margin-bottom: 6px;
    page-break-inside: avoid;
  }
  .sug-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sug-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: #ffffff;
    border: 1.5px solid;
    border-radius: 50%;
    font-weight: 900;
    font-size: 11px;
    flex-shrink: 0;
  }
  .sug-label {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .sug-title {
    font-size: 12px;
    font-weight: 900;
    flex: 1;
  }
  .sug-reduce {
    font-size: 10px;
    font-weight: 900;
    background: #10b981;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 3px;
    font-variant-numeric: tabular-nums;
  }
  .sug-detail {
    font-size: 10px;
    margin-top: 6px;
    margin-left: 28px;
    white-space: pre-line;
    line-height: 1.5;
  }
  .sug-hint {
    margin: 6px 0 0 28px;
    padding: 6px 9px;
    background: #ffffff;
    border-left: 3px solid;
    border-radius: 0 4px 4px 0;
    font-size: 10px;
    line-height: 1.5;
  }
  .sug-hint b { color: #0f172a; }

  /* ─── 表 ─── */
  table.detail {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    margin-top: 6px;
  }
  table.detail th {
    background: ${INDIGO_DARK};
    color: #ffffff;
    text-align: left;
    padding: 5px 6px;
    font-size: 8px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-weight: 800;
  }
  table.detail th.num { text-align: right; }
  table.detail td {
    padding: 4px 6px;
    border-bottom: 1px solid #f1f5f9;
  }
  table.detail td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  table.detail tr:nth-child(even) td { background: #f8fafc; }
  .cat-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }

  .page-break { page-break-before: always; }
  .empty-msg { color: #94a3b8; font-size: 10px; padding: 14px; text-align: center; }

  /* ─── サマリ用余白 ─── */
  .gauge-block {
    text-align: center;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    padding: 8px 6px 4px;
  }
  .gauge-label {
    font-size: 9px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 800;
    margin-bottom: 2px;
  }
</style>
</head>
<body>

<!-- ─── ヒーロー ─── -->
<div class="hero">
  <div class="hero-brand">Kaizen Scope ・ カイゼンスコープ</div>
  <div class="hero-title">${esc(session.name)}</div>
  <div class="hero-meta">
    <span class="hero-meta-chip">📅 ${esc(new Date(session.createdAt).toLocaleString('ja-JP'))}</span>
    <span class="hero-meta-chip">モード ${esc(modeLabel(session.mode))}</span>
    <span class="hero-meta-chip">タクト ${esc(session.tactTimeSec)} 秒</span>
    <span class="hero-meta-chip">${esc(session.fps)}fps</span>
    <span class="hero-meta-chip">動画 ${esc(formatMs(session.durationMs))}</span>
  </div>
</div>

<!-- ─── サマリ ─── -->
<h2><span class="h2-num">01</span>サマリ</h2>

<div class="summary-row">
  <div class="summary-donut">
    ${donutSvg(stats, 160)}
    <div class="summary-donut-legend">
      <div class="legend-item">
        <span class="legend-color" style="background:${CAT_COLOR.value_added}"></span>
        <span class="legend-label">${esc(catLabelFor('value_added', isMachine))}</span>
        <span class="legend-pct">${esc(stats.pct.value_added.toFixed(0))}%</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background:${CAT_COLOR.incidental}"></span>
        <span class="legend-label">${esc(catLabelFor('incidental', isMachine))}</span>
        <span class="legend-pct">${esc(stats.pct.incidental.toFixed(0))}%</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background:${CAT_COLOR.waste}"></span>
        <span class="legend-label">${esc(catLabelFor('waste', isMachine))}</span>
        <span class="legend-pct">${esc(stats.pct.waste.toFixed(0))}%</span>
      </div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-card-accent" style="background:${INDIGO_ACCENT}"></div>
      <div class="kpi-label">合計記録時間</div>
      <div class="kpi-value">${esc(formatMs(stats.total))}</div>
      <div class="kpi-sub">${esc(tasks.length)} 件の要素作業</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent" style="background:${tactPct > 100 ? '#dc2626' : tactPct > 90 ? '#f59e0b' : '#10b981'}"></div>
      <div class="kpi-label">タクト達成率</div>
      <div class="kpi-value" style="color:${tactPct > 100 ? '#dc2626' : tactPct > 90 ? '#f59e0b' : '#10b981'}">${esc(Math.round(tactPct))}<span class="kpi-value-suffix">%</span></div>
      <div class="kpi-sub">基準: ${esc(session.tactTimeSec)} 秒</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent" style="background:${CAT_COLOR.value_added}"></div>
      <div class="kpi-label">${esc(catLabelFor('value_added', isMachine))}</div>
      <div class="kpi-value" style="color:${CAT_COLOR.value_added}">${esc(formatMs(stats.byCat.value_added))}</div>
      <div class="kpi-sub">全体の ${esc(stats.pct.value_added.toFixed(0))}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent" style="background:${CAT_COLOR.waste}"></div>
      <div class="kpi-label">${esc(catLabelFor('waste', isMachine))}</div>
      <div class="kpi-value" style="color:${CAT_COLOR.waste}">${esc(formatMs(stats.byCat.waste))}</div>
      <div class="kpi-sub">全体の ${esc(stats.pct.waste.toFixed(0))}%</div>
    </div>
  </div>
</div>

${costHeroBlock}

<!-- ─── 山積み ─── -->
<h2><span class="h2-num">02</span>山積み (リソース別の負荷)</h2>
${
  perRes.length === 0
    ? '<div class="empty-msg">リソース未登録</div>'
    : perRes
        .map((p) => {
          const tactPctOnBar = tactMs > 0 ? Math.min(100, (tactMs / maxResTotal) * 100) : 0;
          const segW = (v: number) => (v / maxResTotal) * 100;
          const pctOfTotal = p.stats.total > 0
            ? p.stats.pct
            : { value_added: 0, incidental: 0, waste: 0 };
          return `
            <div class="yamazumi-row">
              <div class="yz-name">
                <div>${esc(p.resource.type === 'person' ? '👷' : '⚙️')} ${esc(p.resource.name)}</div>
                <div class="yz-name-type">${esc(p.count)} 件記録</div>
              </div>
              <div class="yz-track">
                ${p.stats.byCat.value_added > 0 ? `<div class="yz-seg" style="width:${segW(p.stats.byCat.value_added).toFixed(1)}%;background:${CAT_COLOR.value_added}">${pctOfTotal.value_added > 10 ? `<div class="yz-seg-label">${pctOfTotal.value_added.toFixed(0)}%</div>` : ''}</div>` : ''}
                ${p.stats.byCat.incidental > 0 ? `<div class="yz-seg" style="width:${segW(p.stats.byCat.incidental).toFixed(1)}%;background:${CAT_COLOR.incidental}">${pctOfTotal.incidental > 10 ? `<div class="yz-seg-label">${pctOfTotal.incidental.toFixed(0)}%</div>` : ''}</div>` : ''}
                ${p.stats.byCat.waste > 0 ? `<div class="yz-seg" style="width:${segW(p.stats.byCat.waste).toFixed(1)}%;background:${CAT_COLOR.waste}">${pctOfTotal.waste > 10 ? `<div class="yz-seg-label">${pctOfTotal.waste.toFixed(0)}%</div>` : ''}</div>` : ''}
                ${tactMs > 0 ? `<div class="yz-tact" style="left:${tactPctOnBar.toFixed(1)}%"></div>` : ''}
              </div>
              <div class="yz-total">${esc(formatMs(p.stats.total))}</div>
            </div>
          `;
        })
        .join('')
}
${tactMs > 0 ? `<div style="font-size:8px;color:#dc2626;margin-top:4px;text-align:right;padding-right:68px;font-weight:700">━ ━ タクト基準: ${esc(session.tactTimeSec)} 秒</div>` : ''}

<!-- ─── ガント ─── -->
<div class="page-break"></div>

<h2><span class="h2-num">03</span>ガントチャート (時系列)</h2>
${
  ganttHtml
    ? `<div class="gantt-wrap">${ganttHtml}</div>`
    : '<div class="empty-msg">記録されたタスクがありません</div>'
}

<!-- ─── 改善ポイント ─── -->
${
  suggestions.length > 0
    ? `
  <h2><span class="h2-num">04</span>改善ポイント (${suggestions.length} 件)</h2>
  ${suggestions
    .map((s, idx) => {
      const m = sevMeta[s.severity];
      return `
        <div class="sug" style="background:${m.bg};border-color:${m.border}">
          <div class="sug-head">
            <span class="sug-num" style="border-color:${m.color};color:${m.color}">${idx + 1}</span>
            <span class="sug-label" style="background:${m.color}">${esc(m.label)}</span>
            <span class="sug-title" style="color:${m.color}">${esc(s.title)}</span>
            ${
              s.potentialReductionMs && s.potentialReductionMs > 0
                ? `<span class="sug-reduce">-${esc(formatMs(s.potentialReductionMs))}</span>`
                : ''
            }
          </div>
          <div class="sug-detail" style="color:${m.color}">${esc(s.detail)}</div>
          ${
            s.hint
              ? `<div class="sug-hint" style="border-color:${m.color}">
                  <b>💡 改善案:</b> ${esc(s.hint)}
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('')}
`
    : '<h2><span class="h2-num">04</span>改善ポイント</h2><div class="empty-msg">特に対応すべき項目は見つかりませんでした</div>'
}

<!-- ─── タスク詳細表 (付録) ─── -->
<div class="page-break"></div>
<h2><span class="h2-num">05</span>タスク詳細 (付録)</h2>
${
  tasks.length === 0
    ? '<div class="empty-msg">記録なし</div>'
    : `
  <table class="detail">
    <thead>
      <tr>
        <th class="num">#</th>
        <th>リソース</th>
        <th>作業名</th>
        <th class="num">開始</th>
        <th class="num">終了</th>
        <th class="num">所要</th>
        <th>分類</th>
      </tr>
    </thead>
    <tbody>${taskRows}</tbody>
  </table>
`
}

</body>
</html>`;
}

export async function exportPdf(
  session: AnalysisSession,
  resources: Resource[],
  tasks: TaskElement[]
): Promise<void> {
  const html = buildHtml(session, resources, tasks);
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const baseName = `${safeFileName(session.name)}_${dateStr}.pdf`;

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: baseName,
      UTI: 'com.adobe.pdf',
    });
  }
}
