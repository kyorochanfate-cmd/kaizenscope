import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import SessionTabBar, { TAB_BAR_HEIGHT } from '../components/SessionTabBar';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '../constants/categories';
import { listResources } from '../db/resources';
import { getSession } from '../db/sessions';
import { listTasks } from '../db/tasks';
import { RootStackParamList } from '../navigation/types';
import { AnalysisSession, Resource, TaskElement } from '../types';
import { formatMs } from '../utils/time';

type Props = NativeStackScreenProps<RootStackParamList, 'Gantt'>;

const ROW_HEIGHT = 44;
const ROW_GAP = 6;
const PADDING_LEFT = 110;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 40;

export default function GanttScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<TaskElement[]>([]);
  const [pxPerSec, setPxPerSec] = useState(50);
  // null = 全リソース横断、string = そのリソース ID のみ
  const [filterResourceId, setFilterResourceId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!session) return;
    navigation.setOptions({
      title: `ガントチャート ・ ${session.name}`,
    });
  }, [navigation, session]);

  if (!session) {
    return (
      <View style={styles.loading}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  const filteredResources = filterResourceId
    ? resources.filter((r) => r.id === filterResourceId)
    : resources;
  const tasksForCycle = filterResourceId
    ? tasks.filter((t) => t.resourceId === filterResourceId)
    : tasks;
  const tactMs = session.tactTimeSec * 1000;
  const maxEnd = tasksForCycle.reduce((m, t) => Math.max(m, t.endTimeMs), 0);
  const baseTaskStart = tasksForCycle.reduce(
    (m, t) => Math.min(m, t.startTimeMs),
    tasksForCycle.length > 0 ? tasksForCycle[0].startTimeMs : 0
  );
  // チャートの時間範囲: [-leftPadMs, rightEdge + rightMargin] を 0 開始に正規化。
  //   - データが長い × タクトが短い: データ末尾を右側、タクト線が左端に詰まらないよう
  //     leftPad で時間原点をマイナスにずらす
  //   - データが短い × タクトが長い: タクトが右側 80%付近、データは左半分
  const dataEnd = Math.max(maxEnd - baseTaskStart, 0);
  const rightEdge = Math.max(dataEnd, tactMs);
  // タクト線がチャート左端から少なくとも全幅の 8% は離れるよう余白を確保
  const minTactFromLeftMs = rightEdge * 0.08;
  const leftPadMs = Math.max(0, minTactFromLeftMs - tactMs);
  const rightMargin = Math.max(rightEdge * 0.1, 2000);
  const totalMs = Math.max(leftPadMs + rightEdge + rightMargin, 1000);
  const pxPerMs = pxPerSec / 1000;
  // 時間 t から画面 x への変換用ベース (leftPad 込み)
  const timeBaseX = PADDING_LEFT + leftPadMs * pxPerMs;
  const chartWidth = Math.max(
    Dimensions.get('window').width - 40,
    totalMs * pxPerMs + PADDING_LEFT + 40
  );
  const chartHeight =
    PADDING_TOP + PADDING_BOTTOM + filteredResources.length * (ROW_HEIGHT + ROW_GAP);

  const tickStep = pickTickStep(rightEdge + rightMargin);
  const ticks: number[] = [];
  for (let t = 0; t <= rightEdge + rightMargin; t += tickStep) ticks.push(t);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, alignItems: 'center' }}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={[styles.chip, filterResourceId === null && styles.chipActive]}
            onPress={() => setFilterResourceId(null)}
          >
            <Text
              style={[styles.chipText, filterResourceId === null && styles.chipTextActive]}
            >
              全体
            </Text>
          </TouchableOpacity>
          {resources.map((r) => {
            const active = filterResourceId === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilterResourceId(r.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {r.type === 'person' ? '👷' : '⚙️'} {r.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => setPxPerSec(Math.max(10, pxPerSec - 20))}
        >
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={{ color: '#374151', fontVariant: ['tabular-nums'], minWidth: 50, textAlign: 'center' }}>
          {pxPerSec}px/s
        </Text>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => setPxPerSec(Math.min(400, pxPerSec + 20))}
        >
          <Text style={styles.zoomBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal>
        <ScrollView>
          <Svg width={chartWidth} height={chartHeight}>
            <G>
              {ticks.map((t) => {
                const x = timeBaseX + t * pxPerMs;
                return (
                  <G key={t}>
                    <Line
                      x1={x}
                      x2={x}
                      y1={PADDING_TOP - 6}
                      y2={chartHeight - PADDING_BOTTOM + 6}
                      stroke="#e5e7eb"
                      strokeWidth={1}
                    />
                    <SvgText
                      x={x}
                      y={PADDING_TOP - 10}
                      fontSize={10}
                      fill="#6b7280"
                      textAnchor="middle"
                    >
                      {(t / 1000).toFixed(t < 10000 ? 1 : 0)}s
                    </SvgText>
                  </G>
                );
              })}

              <Line
                x1={timeBaseX + tactMs * pxPerMs}
                x2={timeBaseX + tactMs * pxPerMs}
                y1={PADDING_TOP - 6}
                y2={chartHeight - PADDING_BOTTOM + 6}
                stroke="#dc2626"
                strokeWidth={2}
                strokeDasharray="6,4"
              />
              <SvgText
                x={timeBaseX + tactMs * pxPerMs + 4}
                y={PADDING_TOP - 14}
                fontSize={10}
                fill="#dc2626"
                fontWeight="bold"
              >
                T/T {session.tactTimeSec}s
              </SvgText>

              {filteredResources.map((r, idx) => {
                const rowY = PADDING_TOP + idx * (ROW_HEIGHT + ROW_GAP);
                const rTasks = tasksForCycle.filter((t) => t.resourceId === r.id);
                return (
                  <G key={r.id}>
                    <SvgText
                      x={4}
                      y={rowY + ROW_HEIGHT / 2 + 4}
                      fontSize={12}
                      fill="#111827"
                      fontWeight="600"
                    >
                      {(r.type === 'person' ? '人:' : '機:') + r.name}
                    </SvgText>
                    <Rect
                      x={PADDING_LEFT}
                      y={rowY}
                      width={chartWidth - PADDING_LEFT - 20}
                      height={ROW_HEIGHT}
                      fill={idx % 2 === 0 ? '#f3f4f6' : '#fafafa'}
                    />
                    {rTasks.map((t) => {
                      const x = timeBaseX + (t.startTimeMs - baseTaskStart) * pxPerMs;
                      const w = Math.max(2, (t.endTimeMs - t.startTimeMs) * pxPerMs);
                      return (
                        <G key={t.id}>
                          <Rect
                            x={x}
                            y={rowY + 4}
                            width={w}
                            height={ROW_HEIGHT - 8}
                            fill={CATEGORY_COLORS[t.category]}
                            rx={3}
                          />
                          {w > 40 && (
                            <SvgText
                              x={x + 4}
                              y={rowY + ROW_HEIGHT / 2 + 4}
                              fontSize={10}
                              fill="#fff"
                              fontWeight="600"
                            >
                              {truncate(t.name, Math.floor(w / 6))}
                            </SvgText>
                          )}
                        </G>
                      );
                    })}
                  </G>
                );
              })}
            </G>
          </Svg>
        </ScrollView>
      </ScrollView>

      <View style={styles.legend}>
        {CATEGORY_ORDER.map((c) => (
          <View key={c} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: CATEGORY_COLORS[c] }]} />
            <Text style={styles.legendText}>{CATEGORY_LABELS[c]}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#dc2626' }]} />
          <Text style={styles.legendText}>タクトタイム</Text>
        </View>
      </View>

      <CycleSummary tasks={tasksForCycle} tactMs={tactMs} />
      <SessionTabBar current="Charts" sessionId={sessionId} />
    </View>
  );
}

function CycleSummary({ tasks, tactMs }: { tasks: TaskElement[]; tactMs: number }) {
  const totals: Record<string, number> = { value_added: 0, incidental: 0, waste: 0 };
  tasks.forEach((t) => {
    totals[t.category] += t.endTimeMs - t.startTimeMs;
  });
  const total = totals.value_added + totals.incidental + totals.waste;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>合計: {formatMs(total)} / T/T {formatMs(tactMs)}</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        {CATEGORY_ORDER.map((c) => (
          <Text key={c} style={styles.summaryItem}>
            <Text style={{ color: CATEGORY_COLORS[c], fontWeight: '700' }}>■ </Text>
            {CATEGORY_LABELS[c]}: {formatMs(totals[c])} ({pct(totals[c])}%)
          </Text>
        ))}
      </View>
    </View>
  );
}

function pickTickStep(totalMs: number): number {
  if (totalMs <= 5000) return 500;
  if (totalMs <= 20000) return 2000;
  if (totalMs <= 60000) return 5000;
  if (totalMs <= 300000) return 30000;
  return 60000;
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  toolbarLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  toolbarMuted: { fontSize: 12, color: '#9ca3af' },
  zoomBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  legend: {
    flexDirection: 'row',
    gap: 14,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendColor: { width: 14, height: 14, borderRadius: 2 },
  legendText: { fontSize: 12, color: '#374151' },
  summary: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  summaryItem: { fontSize: 12, color: '#374151' },
});
