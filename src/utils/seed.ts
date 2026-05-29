import { createResource, listResources } from '../db/resources';
import {
  getSession,
  listSessions,
  updateCostParams,
  updateTactTime,
} from '../db/sessions';
import { createTask, listTasks } from '../db/tasks';
import { AnalysisSession, Resource, TaskCategory } from '../types';

/**
 * 撮影用デモデータ投入。指定セッションを以下のように埋める:
 *  - 必要に応じてリソース 3つ追加 (作業者A/B + プレスA)
 *  - 全 14 件の要素作業を配置 (タクト超過 + 負荷の偏り + 長いムダ + ばらつき検出)
 *  - 試算条件 (¥2500/h, 800 サイクル/日, 250 日/年) を設定
 *  - タクトタイム 60 秒
 *
 * 既にタスクが入っているセッションには投入しない。
 */

interface DemoTaskTpl {
  resourceKey: 'workerA' | 'workerB' | 'machineA';
  name: string;
  startSec: number;
  endSec: number;
  category: TaskCategory;
}

const DEMO_TASKS: DemoTaskTpl[] = [
  // 作業者A — 合計 ~67秒 (タクト超過)
  { resourceKey: 'workerA', name: '把持', startSec: 0, endSec: 2, category: 'value_added' },
  { resourceKey: 'workerA', name: '組付', startSec: 2, endSec: 15, category: 'value_added' },
  { resourceKey: 'workerA', name: '検査', startSec: 15, endSec: 25, category: 'incidental' },
  { resourceKey: 'workerA', name: '手待ち', startSec: 25, endSec: 32, category: 'waste' }, // 長いムダ
  { resourceKey: 'workerA', name: '組付', startSec: 32, endSec: 51, category: 'value_added' }, // ばらつき検出用 (2回目, 大幅長)
  { resourceKey: 'workerA', name: '運搬', startSec: 51, endSec: 60, category: 'incidental' },
  { resourceKey: 'workerA', name: '段取り', startSec: 60, endSec: 67, category: 'incidental' },

  // 作業者B — 合計 ~44秒 (負荷低い)
  { resourceKey: 'workerB', name: '組付', startSec: 0, endSec: 12, category: 'value_added' },
  { resourceKey: 'workerB', name: '把持', startSec: 12, endSec: 14, category: 'value_added' },
  { resourceKey: 'workerB', name: '検査', startSec: 14, endSec: 30, category: 'incidental' },
  { resourceKey: 'workerB', name: '組付', startSec: 30, endSec: 44, category: 'value_added' },

  // 機械 プレスA — 合計 ~58秒 (チョコ停あり)
  { resourceKey: 'machineA', name: '加工', startSec: 0, endSec: 30, category: 'value_added' },
  { resourceKey: 'machineA', name: '段取り', startSec: 30, endSec: 35, category: 'incidental' },
  { resourceKey: 'machineA', name: 'チョコ停', startSec: 35, endSec: 43, category: 'waste' }, // 長いムダ
  { resourceKey: 'machineA', name: '加工', startSec: 43, endSec: 58, category: 'value_added' },
];

export interface SeedResult {
  sessionName: string;
  tasksCreated: number;
  resourcesCreated: number;
  costParamsSet: boolean;
}

/** 指定セッションにデモデータを投入 */
export async function seedDemoIntoSession(
  sessionId: string
): Promise<SeedResult> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('セッションが見つかりません');

  const existingTasks = await listTasks(sessionId);
  if (existingTasks.length > 0) {
    throw new Error(
      `「${session.name}」には既に ${existingTasks.length} 件の記録があるため上書きできません。\n` +
        '別の新しいセッションを作成してから再度お試しください。'
    );
  }

  // タクトタイムを 60秒に
  await updateTactTime(sessionId, 60);

  // リソースを揃える
  const existingResources = await listResources(sessionId);
  const byKey = new Map<string, Resource>();

  let workerA = existingResources.find(
    (r) => r.type === 'person' && r.name.includes('A')
  );
  let workerB = existingResources.find(
    (r) => r.type === 'person' && r.name.includes('B')
  );
  let machineA = existingResources.find((r) => r.type === 'machine');
  let createdCount = 0;

  if (!workerA) {
    workerA = await createResource({
      sessionId,
      name: '作業者A',
      type: 'person',
    });
    createdCount++;
  }
  if (!workerB) {
    workerB = await createResource({
      sessionId,
      name: '作業者B',
      type: 'person',
    });
    createdCount++;
  }
  if (!machineA) {
    machineA = await createResource({
      sessionId,
      name: 'プレスA',
      type: 'machine',
    });
    createdCount++;
  }

  byKey.set('workerA', workerA);
  byKey.set('workerB', workerB);
  byKey.set('machineA', machineA);

  // タスクを投入
  let tasksCreated = 0;
  for (const tpl of DEMO_TASKS) {
    const res = byKey.get(tpl.resourceKey);
    if (!res) continue;
    await createTask({
      sessionId,
      resourceId: res.id,
      cycleNumber: 1,
      name: tpl.name,
      startTimeMs: tpl.startSec * 1000,
      endTimeMs: tpl.endSec * 1000,
      category: tpl.category,
    });
    tasksCreated++;
  }

  // 改善効果試算条件を入れる
  await updateCostParams(sessionId, {
    hourlyRateYen: 2500,
    cyclesPerDay: 800,
    workingDaysPerYear: 250,
  });

  return {
    sessionName: session.name,
    tasksCreated,
    resourcesCreated: createdCount,
    costParamsSet: true,
  };
}

/** 最新のセッションにデモデータを投入 (空のセッションが必要) */
export async function seedDemoIntoLatestSession(): Promise<SeedResult> {
  const sessions: AnalysisSession[] = await listSessions();
  if (sessions.length === 0) {
    throw new Error(
      '空のセッションがありません。先に動画を選んで新規セッションを作成してから、もう一度お試しください。'
    );
  }
  // 一番最近作成された (タスク 0 件の) セッションを探す
  for (const s of sessions) {
    const ts = await listTasks(s.id);
    if (ts.length === 0) {
      return await seedDemoIntoSession(s.id);
    }
  }
  throw new Error(
    '空のセッションが見つかりません。サンプル投入用に新しいセッションを作成してから再度お試しください。'
  );
}
