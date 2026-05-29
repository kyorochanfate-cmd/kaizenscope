import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BannerAdSlot from '../components/BannerAdSlot';
import SessionTabBar, { TAB_BAR_HEIGHT } from '../components/SessionTabBar';
import { listResources } from '../db/resources';
import { getSession } from '../db/sessions';
import { listTasks } from '../db/tasks';
import { RootStackParamList } from '../navigation/types';
import { colors, gradients, radii, shadows } from '../theme';
import { AnalysisSession, Resource, TaskElement } from '../types';
import {
  analyzeImprovements,
  Suggestion,
  SuggestionSeverity,
} from '../utils/improvements';
import { formatMs } from '../utils/time';

type Props = NativeStackScreenProps<RootStackParamList, 'Improvements'>;

const SEVERITY_META: Record<
  SuggestionSeverity,
  { icon: string; label: string; bg: string; border: string; color: string }
> = {
  critical: {
    icon: '🔴',
    label: '要対応',
    bg: '#fef2f2',
    border: '#fca5a5',
    color: '#991b1b',
  },
  warn: {
    icon: '🟡',
    label: '改善余地',
    bg: '#fffbeb',
    border: '#fcd34d',
    color: '#92400e',
  },
  info: {
    icon: '🔵',
    label: 'ヒント',
    bg: '#eff6ff',
    border: '#93c5fd',
    color: '#1e40af',
  },
};

export default function ImprovementsScreen({ route }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<TaskElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [s, rs, ts] = await Promise.all([
      getSession(sessionId),
      listResources(sessionId),
      listTasks(sessionId),
    ]);
    setSession(s);
    setResources(rs);
    setTasks(ts);
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const suggestions: Suggestion[] = useMemo(() => {
    if (!session) return [];
    return analyzeImprovements(session, resources, tasks);
  }, [session, resources, tasks]);

  // 現状メトリクス
  const current = useMemo(() => {
    const total = tasks.reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
    const waste = tasks
      .filter((t) => t.category === 'waste')
      .reduce((s, t) => s + (t.endTimeMs - t.startTimeMs), 0);
    const tactMs = session ? session.tactTimeSec * 1000 : 0;
    const tactPct = tactMs > 0 ? Math.round((total / tactMs) * 100) : 0;
    const wastePct = total > 0 ? Math.round((waste / total) * 100) : 0;
    return { total, waste, tactPct, wastePct, tactMs };
  }, [tasks, session]);

  // 選択中の提案を合算した「改善後の見込み」
  const projected = useMemo(() => {
    let reduce = 0;
    let wasteReduce = 0;
    for (const s of suggestions) {
      if (!selectedIds.has(s.id)) continue;
      reduce += s.potentialReductionMs ?? 0;
      wasteReduce += s.wasteReductionMs ?? 0;
    }
    // 過剰減算を防止
    reduce = Math.min(reduce, current.total);
    wasteReduce = Math.min(wasteReduce, current.waste);
    const newTotal = Math.max(0, current.total - reduce);
    const newWaste = Math.max(0, current.waste - wasteReduce);
    const newTactPct =
      current.tactMs > 0 ? Math.round((newTotal / current.tactMs) * 100) : 0;
    const newWastePct = newTotal > 0 ? Math.round((newWaste / newTotal) * 100) : 0;
    return {
      reduce,
      wasteReduce,
      newTotal,
      newWaste,
      newTactPct,
      newWastePct,
    };
  }, [selectedIds, suggestions, current]);

  // 年間効果見込み (¥/年)。Settings で 3 つとも入っていれば計算可能
  const yearlySavings = useMemo(() => {
    if (!session) return null;
    const rate = session.hourlyRateYen;
    const cyc = session.cyclesPerDay;
    const days = session.workingDaysPerYear ?? 250;
    if (rate == null || rate <= 0 || cyc == null || cyc <= 0) return null;
    if (projected.reduce <= 0) return 0;
    // 1サイクルあたりの短縮(秒) × サイクル/日 × 日/年 / 3600 = 短縮時間/年
    const hoursSavedPerYear =
      (projected.reduce / 1000) * cyc * days / 3600;
    return hoursSavedPerYear * rate;
  }, [session, projected.reduce]);

  if (!session) {
    return (
      <View style={styles.loading}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  const cnt = {
    critical: suggestions.filter((s) => s.severity === 'critical').length,
    warn: suggestions.filter((s) => s.severity === 'warn').length,
    info: suggestions.filter((s) => s.severity === 'info').length,
  };

  const selectable = suggestions.filter(
    (s) => (s.potentialReductionMs ?? 0) > 0
  );
  const hasSelection = selectedIds.size > 0;
  // シミュレーションパネルを出すかどうか
  const showSim = selectable.length > 0;

  // 試算条件が部分的にでも入っていれば緑カードを試みる
  const hasCostConfig =
    session?.hourlyRateYen != null && session?.cyclesPerDay != null;
  const hasPartialCostConfig =
    !hasCostConfig &&
    (session?.hourlyRateYen != null || session?.cyclesPerDay != null);
  const SIM_PANEL_HEIGHT = hasCostConfig
    ? 232
    : hasPartialCostConfig
    ? 200
    : 168;
  const bottomReserve =
    TAB_BAR_HEIGHT + (showSim ? SIM_PANEL_HEIGHT : 0) + 16;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BannerAdSlot />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomReserve }}
      >
        <View style={styles.summaryRow}>
          <View style={[styles.sumChip, { backgroundColor: '#fef2f2' }]}>
            <Text style={[styles.sumChipNum, { color: '#991b1b' }]}>
              {cnt.critical}
            </Text>
            <Text style={[styles.sumChipLabel, { color: '#991b1b' }]}>要対応</Text>
          </View>
          <View style={[styles.sumChip, { backgroundColor: '#fffbeb' }]}>
            <Text style={[styles.sumChipNum, { color: '#92400e' }]}>
              {cnt.warn}
            </Text>
            <Text style={[styles.sumChipLabel, { color: '#92400e' }]}>
              改善余地
            </Text>
          </View>
          <View style={[styles.sumChip, { backgroundColor: '#eff6ff' }]}>
            <Text style={[styles.sumChipNum, { color: '#1e40af' }]}>
              {cnt.info}
            </Text>
            <Text style={[styles.sumChipLabel, { color: '#1e40af' }]}>
              ヒント
            </Text>
          </View>
        </View>

        {showSim && (
          <View style={styles.howtoBox}>
            <Text style={styles.howtoText}>
              💡 カードをタップして「対応する」と仮定すると、画面下の見込み数値が変わります
            </Text>
          </View>
        )}

        {suggestions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>{tasks.length === 0 ? '📝' : '✨'}</Text>
            <Text style={styles.emptyTitle}>
              {tasks.length === 0
                ? 'まだ記録がありません'
                : '改善ポイントは見つかりませんでした'}
            </Text>
            <Text style={styles.emptyText}>
              {tasks.length === 0
                ? '分析画面で要素作業を記録すると、ここに改善ポイントが出てきます'
                : '負荷もタクト内に収まり、ムダも目立たない良い状態です'}
            </Text>
          </View>
        ) : (
          suggestions.map((s) => {
            const meta = SEVERITY_META[s.severity];
            const selected = selectedIds.has(s.id);
            const canSelect = (s.potentialReductionMs ?? 0) > 0;
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={canSelect ? 0.7 : 1}
                onPress={() => {
                  if (!canSelect) return;
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  });
                }}
                style={[
                  styles.card,
                  { backgroundColor: meta.bg, borderColor: meta.border },
                  selected && styles.cardSelected,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardIcon}>
                    {selected ? '✅' : meta.icon}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardLabel, { color: meta.color }]}>
                      {selected ? '対応すると仮定' : meta.label}
                    </Text>
                    <Text style={[styles.cardTitle, { color: meta.color }]}>
                      {s.title}
                    </Text>
                  </View>
                  {canSelect && (
                    <View style={styles.gainBadge}>
                      <Text style={styles.gainBadgeLabel}>短縮見込</Text>
                      <Text style={styles.gainBadgeValue}>
                        -{formatMs(s.potentialReductionMs!)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardDetail, { color: meta.color }]}>
                  {s.detail}
                </Text>
                {s.hint && (
                  <View style={[styles.hintBox, { borderColor: meta.border }]}>
                    <Text style={styles.hintLabel}>💡 改善案</Text>
                    <Text style={styles.hintText}>{s.hint}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ボトム: シミュレーションパネル (常時表示) */}
      {showSim && (
        <View style={[styles.simPanel, { bottom: TAB_BAR_HEIGHT }]}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.simHeaderBar}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.simHeaderLabel}>改善後シミュレーション</Text>
              <Text style={styles.simHeaderTitle}>
                {hasSelection
                  ? `${selectedIds.size} 件 対応すると…`
                  : 'タップで対応する提案を選択'}
              </Text>
            </View>
            {hasSelection && (
              <TouchableOpacity
                onPress={() => setSelectedIds(new Set())}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={styles.simResetBtn}
              >
                <Text style={styles.simResetText}>リセット</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
          <View style={styles.simRow}>
            <SimMetric
              label="合計"
              before={formatMs(current.total)}
              after={formatMs(projected.newTotal)}
              changed={projected.reduce > 0}
            />
            <SimMetric
              label="ムダ"
              before={`${current.wastePct}%`}
              after={`${projected.newWastePct}%`}
              changed={projected.wasteReduce > 0}
            />
            {current.tactMs > 0 && (
              <SimMetric
                label="タクト達成"
                before={`${current.tactPct}%`}
                after={`${projected.newTactPct}%`}
                changed={projected.reduce > 0}
                betterIfLower
              />
            )}
          </View>

          {hasCostConfig ? (
            <View style={styles.savingsBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savingsLabel}>年間効果見込み</Text>
                <Text style={styles.savingsSub}>
                  {(projected.reduce / 1000).toFixed(1)}秒/サイクル ×{' '}
                  {session!.cyclesPerDay} 台/日 ×{' '}
                  {session!.workingDaysPerYear ?? 250} 日 ×{' '}
                  ¥{session!.hourlyRateYen}/h
                </Text>
              </View>
              <Text style={styles.savingsAmount}>
                {yearlySavings == null
                  ? '-'
                  : yearlySavings >= 10000
                  ? `¥${(yearlySavings / 10000).toFixed(1)}万/年`
                  : `¥${Math.round(yearlySavings).toLocaleString()}/年`}
              </Text>
            </View>
          ) : hasPartialCostConfig ? (
            <View style={styles.savingsHintBox}>
              <Text style={styles.savingsHintText}>
                ⚠️ 設定タブに戻って、
                {session!.hourlyRateYen == null && '「時給」'}
                {session!.cyclesPerDay == null && '「1日のサイクル数」'}
                {' '}を入れてください。両方そろうと年間効果が自動計算されます。
              </Text>
            </View>
          ) : (
            <View style={styles.savingsHintBox}>
              <Text style={styles.savingsHintText}>
                💡 設定タブで時給・1日サイクル数を入れると「年間効果見込み」が出ます
              </Text>
            </View>
          )}
        </View>
      )}

      <SessionTabBar current="Improvements" sessionId={sessionId} />
    </View>
  );
}

function SimMetric({
  label,
  before,
  after,
  changed,
}: {
  label: string;
  before: string;
  after: string;
  changed: boolean;
  betterIfLower?: boolean;
}) {
  return (
    <View style={styles.simMetric}>
      <Text style={styles.simMetricLabel}>{label}</Text>
      <View style={styles.simMetricValueRow}>
        <Text style={[styles.simBefore, changed && styles.simBeforeStrike]}>
          {before}
        </Text>
        {changed && (
          <>
            <Text style={styles.simArrow}>→</Text>
            <Text style={styles.simAfter}>{after}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sumChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sumChipNum: { fontSize: 24, fontWeight: '800' },
  sumChipLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  howtoBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  howtoText: { fontSize: 12, color: '#3730a3', lineHeight: 18 },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  card: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon: { fontSize: 20 },
  cardLabel: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  cardDetail: {
    fontSize: 13,
    marginTop: 10,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  hintBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
  },
  hintLabel: { fontSize: 11, fontWeight: '800', color: '#374151', marginBottom: 4 },
  hintText: { fontSize: 13, color: '#1f2937', lineHeight: 20 },
  cardSelected: {
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  gainBadge: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  gainBadgeLabel: { fontSize: 9, color: '#6b7280', fontWeight: '700' },
  gainBadgeValue: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  simPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.topbar,
  },
  simHeaderBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  simHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#c7d2fe',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  simHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.1,
  },
  simResetBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  simResetText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  simRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: colors.surface,
  },
  simMetric: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  simMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  simMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  simBefore: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  simBeforeStrike: {
    textDecorationLine: 'line-through',
    color: colors.textFaint,
  },
  simArrow: { fontSize: 12, color: colors.textFaint },
  simAfter: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.success700,
    fontVariant: ['tabular-nums'],
  },
  savingsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 12,
  },
  savingsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  savingsSub: {
    fontSize: 10,
    color: '#065f46',
    marginTop: 2,
  },
  savingsAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  savingsHintBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderStyle: 'dashed',
  },
  savingsHintText: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
  },
});
