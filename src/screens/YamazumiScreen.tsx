import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import SessionTabBar from '../components/SessionTabBar';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Yamazumi'>;

const PAD_L = 50;
const PAD_R = 20;
const PAD_T = 30;
const PAD_B = 80;
const BAR_GAP = 16;

export default function YamazumiScreen({ route }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<TaskElement[]>([]);

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

  const tasksForCycle = tasks;

  if (!session) {
    return (
      <View style={styles.loading}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  const tactMs = session.tactTimeSec * 1000;
  const totalsPerResource: Record<string, number> = {};
  resources.forEach((r) => {
    totalsPerResource[r.id] = tasksForCycle
      .filter((t) => t.resourceId === r.id)
      .reduce((sum, t) => sum + (t.endTimeMs - t.startTimeMs), 0);
  });
  const maxTotal = Math.max(
    tactMs,
    ...Object.values(totalsPerResource),
    1000
  );

  const screenW = Dimensions.get('window').width;
  const minChartW = screenW - 24;
  const minBarWidth = 70;
  const requiredW = PAD_L + PAD_R + resources.length * (minBarWidth + BAR_GAP);
  const chartW = Math.max(minChartW, requiredW);
  const chartH = 480;
  const plotH = chartH - PAD_T - PAD_B;
  const plotW = chartW - PAD_L - PAD_R;
  const barWidth = resources.length > 0
    ? Math.min(110, (plotW - BAR_GAP * resources.length) / Math.max(1, resources.length))
    : 60;

  const msToY = (ms: number) => PAD_T + plotH - (ms / maxTotal) * plotH;

  const yTicks = computeYTicks(maxTotal);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>
          {tasks.length === 0 ? 'データなし' : `${tasks.length} 件記録`}
        </Text>
      </View>

      <ScrollView horizontal>
        <Svg width={chartW} height={chartH}>
          {yTicks.map((t) => {
            const y = msToY(t);
            return (
              <G key={t}>
                <Line
                  x1={PAD_L}
                  x2={chartW - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                <SvgText x={PAD_L - 6} y={y + 4} fontSize={10} fill="#6b7280" textAnchor="end">
                  {(t / 1000).toFixed(0)}s
                </SvgText>
              </G>
            );
          })}

          <Line
            x1={PAD_L}
            x2={chartW - PAD_R}
            y1={msToY(tactMs)}
            y2={msToY(tactMs)}
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="6,4"
          />
          <SvgText
            x={chartW - PAD_R}
            y={msToY(tactMs) - 6}
            fontSize={11}
            fill="#dc2626"
            textAnchor="end"
            fontWeight="bold"
          >
            T/T {session.tactTimeSec}s
          </SvgText>

          {resources.map((r, idx) => {
            const x = PAD_L + idx * (barWidth + BAR_GAP) + BAR_GAP / 2;
            const rTasks = tasksForCycle
              .filter((t) => t.resourceId === r.id)
              .sort((a, b) => a.startTimeMs - b.startTimeMs);
            let yOffsetMs = 0;
            return (
              <G key={r.id}>
                {rTasks.map((t) => {
                  const dur = t.endTimeMs - t.startTimeMs;
                  const top = msToY(yOffsetMs + dur);
                  const bottom = msToY(yOffsetMs);
                  yOffsetMs += dur;
                  const h = bottom - top;
                  return (
                    <G key={t.id}>
                      <Rect
                        x={x}
                        y={top}
                        width={barWidth}
                        height={h}
                        fill={CATEGORY_COLORS[t.category]}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                      {h > 14 && (
                        <SvgText
                          x={x + barWidth / 2}
                          y={top + h / 2 + 3}
                          fontSize={9}
                          fill="#fff"
                          textAnchor="middle"
                          fontWeight="600"
                        >
                          {truncate(t.name, Math.floor(barWidth / 7))}
                        </SvgText>
                      )}
                    </G>
                  );
                })}
                <SvgText
                  x={x + barWidth / 2}
                  y={chartH - PAD_B + 16}
                  fontSize={11}
                  fill="#111827"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {(r.type === 'person' ? '人:' : '機:') + r.name}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={chartH - PAD_B + 32}
                  fontSize={10}
                  fill="#6b7280"
                  textAnchor="middle"
                >
                  {formatMs(totalsPerResource[r.id] ?? 0)}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={chartH - PAD_B + 46}
                  fontSize={10}
                  fill={(totalsPerResource[r.id] ?? 0) > tactMs ? '#dc2626' : '#16a34a'}
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {(((totalsPerResource[r.id] ?? 0) / tactMs) * 100).toFixed(0)}%
                </SvgText>
              </G>
            );
          })}

          <Line
            x1={PAD_L}
            x2={PAD_L}
            y1={PAD_T}
            y2={chartH - PAD_B}
            stroke="#9ca3af"
            strokeWidth={1}
          />
          <Line
            x1={PAD_L}
            x2={chartW - PAD_R}
            y1={chartH - PAD_B}
            y2={chartH - PAD_B}
            stroke="#9ca3af"
            strokeWidth={1}
          />
        </Svg>
      </ScrollView>

      <View style={styles.legend}>
        {CATEGORY_ORDER.map((c) => (
          <View key={c} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: CATEGORY_COLORS[c] }]} />
            <Text style={styles.legendText}>{CATEGORY_LABELS[c]}</Text>
          </View>
        ))}
      </View>
      <SessionTabBar current="Charts" sessionId={sessionId} />
    </View>
  );
}

function computeYTicks(maxMs: number): number[] {
  const step = pickStep(maxMs);
  const ticks: number[] = [];
  for (let t = 0; t <= maxMs; t += step) ticks.push(t);
  return ticks;
}

function pickStep(maxMs: number): number {
  if (maxMs <= 10000) return 1000;
  if (maxMs <= 30000) return 5000;
  if (maxMs <= 120000) return 10000;
  if (maxMs <= 600000) return 60000;
  return 120000;
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
});
