import { TaskCategory } from '../types';

// 人: 正味作業 / 付帯作業 / ムダ
export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  value_added: '正味作業',
  incidental: '付帯作業',
  waste: 'ムダ',
};

export const CATEGORY_DESCRIPTIONS: Record<TaskCategory, string> = {
  value_added: 'モノを変化させる価値のある作業',
  incidental: '価値は生まないが今は必要な作業',
  waste: '価値を生まず無くせる作業',
};

export const CATEGORY_EXAMPLES: Record<TaskCategory, string> = {
  value_added: '例: 加工、組立、検査、塗装',
  incidental: '例: 部品取り、段取り、運搬準備',
  waste: '例: 手待ち、探す、手直し',
};

export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  value_added: '#22c55e',
  incidental: '#eab308',
  waste: '#ef4444',
};

export const CATEGORY_ORDER: TaskCategory[] = ['value_added', 'incidental', 'waste'];

// 機械: 正味稼働 / 付帯稼働 / 停止ロス
export const MACHINE_CATEGORY_LABELS: Record<TaskCategory, string> = {
  value_added: '正味稼働',
  incidental: '付帯稼働',
  waste: '停止ロス',
};

export const MACHINE_CATEGORY_DESCRIPTIONS: Record<TaskCategory, string> = {
  value_added: '加工・組立など、価値を生んでいる稼働',
  incidental: '稼働しているが直接価値は生まない動作',
  waste: '機械が止まっている、本来の働きをしていない',
};

export const MACHINE_CATEGORY_EXAMPLES: Record<TaskCategory, string> = {
  value_added: '例: 切削、プレス、溶接、塗装',
  incidental: '例: 早送り、原点復帰、自動工具交換',
  waste: '例: 故障、段取り、チョコ停、材料待ち',
};
