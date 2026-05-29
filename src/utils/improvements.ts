import { AnalysisSession, Resource, TaskCategory, TaskElement } from '../types';
import { formatMs } from './time';

export type SuggestionSeverity = 'critical' | 'warn' | 'info';

export interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  hint?: string;
  // 互換性のため残置 (常に null)。サイクル機能廃止により以前のように分析単位で分けない
  cycleNumber?: number | null;
  /** この提案に対応すれば短縮できる合計時間 (ms) - シミュレーション用 */
  potentialReductionMs?: number;
  /** うちムダ・停止カテゴリから減る分 (ms) - シミュレーション用 */
  wasteReductionMs?: number;
}

function nameOf(r: Resource): string {
  return `${r.type === 'person' ? '👷' : '⚙️'} ${r.name}`;
}

function severityRank(s: SuggestionSeverity): number {
  return s === 'critical' ? 0 : s === 'warn' ? 1 : 2;
}

interface ResourceStats {
  resource: Resource;
  total: number;
  byCategory: Record<TaskCategory, number>;
  tasks: TaskElement[];
}

export function analyzeImprovements(
  session: AnalysisSession,
  resources: Resource[],
  tasks: TaskElement[]
): Suggestion[] {
  const out: Suggestion[] = [];
  if (tasks.length === 0 || resources.length === 0) return out;

  const tactMs = session.tactTimeSec * 1000;

  const perResource = new Map<string, ResourceStats>();
  for (const r of resources) {
    const rTasks = tasks.filter((t) => t.resourceId === r.id);
    const total = rTasks.reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
    const byCategory: Record<TaskCategory, number> = {
      value_added: 0,
      incidental: 0,
      waste: 0,
    };
    for (const t of rTasks) byCategory[t.category] += t.endTimeMs - t.startTimeMs;
    perResource.set(r.id, { resource: r, total, byCategory, tasks: rTasks });
  }

  // === A. 負荷の偏り ===
  const active = Array.from(perResource.values()).filter((p) => p.total > 0);
  if (active.length >= 2) {
    const sortedDesc = [...active].sort((a, b) => b.total - a.total);
    const heaviest = sortedDesc[0];
    const lightest = sortedDesc[sortedDesc.length - 1];
    const diff = heaviest.total - lightest.total;
    const tolerance = tactMs > 0 ? tactMs * 0.2 : 5000;
    if (diff > tolerance) {
      const movable = heaviest.tasks
        .filter((t) => t.category !== 'waste')
        .sort(
          (a, b) =>
            b.endTimeMs - b.startTimeMs - (a.endTimeMs - a.startTimeMs)
        );
      const candidate = movable.find((t) => {
        const d = t.endTimeMs - t.startTimeMs;
        return heaviest.total - d >= lightest.total + d - tolerance;
      });
      let hint: string;
      let bottleneckGain = 0;
      if (candidate) {
        const d = candidate.endTimeMs - candidate.startTimeMs;
        const newH = heaviest.total - d;
        const newL = lightest.total + d;
        // ボトルネック (最も重いリソース) の時間短縮量
        bottleneckGain = heaviest.total - Math.max(newH, newL);
        hint = `${nameOf(heaviest.resource)} の「${candidate.name}」(${formatMs(
          d
        )}) を ${nameOf(lightest.resource)} に渡すと、差が ${formatMs(
          diff
        )} → ${formatMs(Math.abs(newH - newL))} に縮まります`;
      } else {
        hint = `${nameOf(heaviest.resource)} の作業を ${nameOf(
          lightest.resource
        )} 側に振り分けて平準化を検討`;
      }
      out.push({
        id: 'imbalance',
        severity: 'warn',
        title: '負荷の偏り',
        detail: `${nameOf(heaviest.resource)}: ${formatMs(
          heaviest.total
        )}\n${nameOf(lightest.resource)}: ${formatMs(
          lightest.total
        )}\n差: ${formatMs(diff)}`,
        hint,
        potentialReductionMs: bottleneckGain,
        wasteReductionMs: 0,
      });
    }
  }

  // === B. タクト超過 ===
  if (tactMs > 0) {
    for (const p of perResource.values()) {
      if (p.total > tactMs) {
        const over = p.total - tactMs;
        const pct = ((p.total / tactMs) * 100).toFixed(0);
        const wasteSum = p.byCategory.waste;
        const hint =
          wasteSum >= over * 0.5
            ? `ムダ・停止が ${formatMs(
                wasteSum
              )} あり、これを ${formatMs(over)} 削減できればタクト内に収まります`
            : `付帯作業を減らす、または工程の組み替えが必要です`;
        // ムダから取り戻せる分が見込み短縮量
        const achievable = Math.min(over, wasteSum);
        out.push({
          id: `tact-${p.resource.id}`,
          severity: 'critical',
          title: `タクト超過: ${nameOf(p.resource)}`,
          detail: `合計 ${formatMs(p.total)} / タクト ${formatMs(
            tactMs
          )} (${pct}%)\n超過分 ${formatMs(over)}`,
          hint,
          potentialReductionMs: achievable,
          wasteReductionMs: achievable,
        });
      }
    }
  }

  // === C. ムダ・停止の比率 ===
  const totalAll = Array.from(perResource.values()).reduce(
    (s, p) => s + p.total,
    0
  );
  const wasteAll = Array.from(perResource.values()).reduce(
    (s, p) => s + p.byCategory.waste,
    0
  );
  if (totalAll > 0) {
    const ratio = wasteAll / totalAll;
    if (ratio >= 0.2) {
      const top3 = tasks
        .filter((t) => t.category === 'waste')
        .sort(
          (a, b) =>
            b.endTimeMs - b.startTimeMs - (a.endTimeMs - a.startTimeMs)
        )
        .slice(0, 3);
      const topList = top3
        .map((t) => {
          const r = resources.find((x) => x.id === t.resourceId);
          return `・${r ? nameOf(r) : '?'}「${t.name}」 ${formatMs(
            t.endTimeMs - t.startTimeMs
          )}`;
        })
        .join('\n');
      const top3Sum = top3.reduce(
        (s, t) => s + (t.endTimeMs - t.startTimeMs),
        0
      );
      out.push({
        id: 'waste-ratio',
        severity: ratio >= 0.4 ? 'critical' : 'warn',
        title: `ムダ・停止が ${(ratio * 100).toFixed(0)}%`,
        detail: `合計 ${formatMs(wasteAll)} がムダ・停止\n大きい順:\n${topList}`,
        hint: '無くせるムダか、減らせるムダかを動画で確認しましょう',
        potentialReductionMs: top3Sum,
        wasteReductionMs: top3Sum,
      });
    }
  }

  // === D. 1回が長いムダ・停止 ===
  const longThreshold = tactMs > 0 ? tactMs * 0.2 : 10000;
  for (const t of tasks) {
    if (t.category !== 'waste') continue;
    const dur = t.endTimeMs - t.startTimeMs;
    if (dur >= longThreshold) {
      const r = resources.find((x) => x.id === t.resourceId);
      out.push({
        id: `long-waste-${t.id}`,
        severity: 'warn',
        title: '長いムダ・停止',
        detail: `${r ? nameOf(r) : '?'}「${t.name}」 ${formatMs(dur)}`,
        hint: 'なぜこれだけ長いのか、動画を見直して原因を特定しましょう',
        potentialReductionMs: dur,
        wasteReductionMs: dur,
      });
    }
  }

  // === E. 同じ名前の作業のばらつき (per resource × task name) ===
  // サイクル機能は廃止したが、同じ作業を複数回記録した場合のばらつき検出は維持
  const groups = new Map<string, TaskElement[]>();
  for (const t of tasks) {
    const key = `${t.resourceId}::${t.name}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  for (const [key, ts] of groups.entries()) {
    if (ts.length < 2) continue;
    const durs = ts.map((t) => t.endTimeMs - t.startTimeMs);
    const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
    if (mean === 0) continue;
    const variance =
      durs.reduce((s, d) => s + (d - mean) ** 2, 0) / durs.length;
    const cv = Math.sqrt(variance) / mean;
    const range = Math.max(...durs) - Math.min(...durs);
    if (cv > 0.3 && range > 2000) {
      const [resourceId, name] = key.split('::');
      const r = resources.find((x) => x.id === resourceId);
      const sorted = [...ts].sort((a, b) => a.startTimeMs - b.startTimeMs);
      const list = sorted
        .map((t, i) => `${i + 1}回目=${formatMs(t.endTimeMs - t.startTimeMs)}`)
        .join(' / ');
      const slowest = [...ts].sort(
        (a, b) => b.endTimeMs - b.startTimeMs - (a.endTimeMs - a.startTimeMs)
      )[0];
      const slowIdx = sorted.findIndex((t) => t.id === slowest.id) + 1;
      // 平均より長い回を平均まで縮められた場合の短縮見込み
      const overMean = durs
        .filter((d) => d > mean)
        .reduce((s, d) => s + (d - mean), 0);
      out.push({
        id: `variance-${resourceId}-${name}`,
        severity: 'info',
        title: '同じ作業のばらつき',
        detail: `${r ? nameOf(r) : '?'}「${name}」\n${list}`,
        hint: `一番遅かった ${slowIdx} 回目の動画を確認し、原因を取り除けば全体短縮できる可能性があります`,
        potentialReductionMs: Math.round(overMean),
        wasteReductionMs: 0,
      });
    }
  }

  out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return out;
}
