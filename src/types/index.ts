export type ResourceType = 'person' | 'machine';

export type AnalysisMode = 'person' | 'machine' | 'both';

export type TaskCategory = 'value_added' | 'incidental' | 'waste';

export interface AnalysisSession {
  id: string;
  name: string;
  videoUri: string;
  fps: number;
  durationMs: number;
  tactTimeSec: number;
  mode: AnalysisMode;
  parentSessionId: string | null;
  /** 改善効果試算用: 時給 (¥/h)。未設定なら null */
  hourlyRateYen: number | null;
  /** 改善効果試算用: 1日のサイクル数。未設定なら null */
  cyclesPerDay: number | null;
  /** 改善効果試算用: 年間稼働日数。未設定なら null (デフォルト 250 として扱う) */
  workingDaysPerYear: number | null;
  createdAt: number;
}

export interface Resource {
  id: string;
  sessionId: string;
  name: string;
  type: ResourceType;
  orderIndex: number;
}

export interface TaskElement {
  id: string;
  sessionId: string;
  resourceId: string;
  cycleNumber: number;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  category: TaskCategory;
}
