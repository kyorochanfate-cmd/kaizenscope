import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SessionTabBar, { TAB_BAR_HEIGHT } from '../components/SessionTabBar';
import TaskEditModal from '../components/TaskEditModal';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MACHINE_CATEGORY_LABELS,
} from '../constants/categories';
import { listResources } from '../db/resources';
import { getSession } from '../db/sessions';
import { createTask, deleteTask, listTasks } from '../db/tasks';
import { RootStackParamList } from '../navigation/types';
import {
  AnalysisSession,
  Resource,
  TaskCategory,
  TaskElement,
} from '../types';
import { formatMs, frameToMs, msToFrame, secToMs } from '../utils/time';

type Props = NativeStackScreenProps<RootStackParamList, 'Analysis'>;

export default function AnalysisScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<TaskElement[]>([]);

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [taskName, setTaskName] = useState('');
  const [category, setCategory] = useState<TaskCategory>('value_added');
  const [editingTask, setEditingTask] = useState<TaskElement | null>(null);

  const player = useVideoPlayer(session?.videoUri ?? null, (p) => {
    p.timeUpdateEventInterval = 0.05;
    p.muted = false; // 既定で音声 ON (現場の機械音やアラームも分析材料になる)
  });

  const playingEvt = useEvent(player, 'playingChange', { isPlaying: false });
  const timeEvt = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null as number | null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });
  const [scrubMs, setScrubMs] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const isPlaying = playingEvt?.isPlaying ?? false;
  useEffect(() => {
    player.playbackRate = playbackRate;
  }, [player, playbackRate]);
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  const playerMs = Math.round((timeEvt?.currentTime ?? 0) * 1000);
  // While playing, scrubMs tracks the player. While paused/scrubbing, scrubMs is
  // user-controlled — needed because expo-video doesn't emit timeUpdate while paused,
  // so a seek (frame step, etc.) leaves playerMs stale.
  useEffect(() => {
    if (isPlaying && !isScrubbing) setScrubMs(playerMs);
  }, [playerMs, isPlaying, isScrubbing]);
  const currentMs = scrubMs;

  const load = useCallback(async () => {
    const [s, rs, ts] = await Promise.all([
      getSession(sessionId),
      listResources(sessionId),
      listTasks(sessionId),
    ]);
    setSession(s);
    setResources(rs);
    setTasks(ts);
    if (rs.length > 0 && !selectedResourceId) {
      setSelectedResourceId(rs[0].id);
    }
  }, [sessionId, selectedResourceId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // 別の画面から戻ってきた時だけ In/Out をクリア (重複登録防止)。
  // load の identity 変化で誤発火しないよう deps を空にして安定化させている
  // — リソース切替などの他 state 更新では再走しない。
  useFocusEffect(
    useCallback(() => {
      setInMs(null);
      setOutMs(null);
      setTaskName('');
    }, [])
  );

  useEffect(() => {
    if (!session) return;
    navigation.setOptions({ title: session.name });
  }, [navigation, session, sessionId]);

  const fps = session?.fps ?? 30;
  const durationMs = useMemo(() => {
    if (session?.durationMs) return session.durationMs;
    return Math.round((player.duration || 0) * 1000);
  }, [session, player.duration]);

  const recentNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = tasks.length - 1; i >= 0 && out.length < 8; i--) {
      const n = tasks[i].name;
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }, [tasks]);

  const selectedResource = useMemo(
    () => resources.find((r) => r.id === selectedResourceId) ?? null,
    [resources, selectedResourceId]
  );
  const isMachine = selectedResource?.type === 'machine';

  // Pick the right TPS label set for the selected resource type
  const catLabels = isMachine ? MACHINE_CATEGORY_LABELS : CATEGORY_LABELS;

  // 同じリソースの最終 Out を自動 In として固定する。
  // これがあれば In は「前作業から自動」で、変更不可。
  const autoInMs = useMemo(() => {
    if (!selectedResourceId) return null;
    let latestEnd: number | null = null;
    for (const t of tasks) {
      if (t.resourceId !== selectedResourceId) continue;
      if (latestEnd === null || t.endTimeMs > latestEnd) latestEnd = t.endTimeMs;
    }
    return latestEnd;
  }, [tasks, selectedResourceId]);

  // エディタを開いた後 (Out が確定済み) は、リソース切替で In がブレないように
  // inMs (ユーザー設定 or autoIn のスナップショット) を優先する。
  // Out 未確定の「次の作業の準備」フェーズでは、autoIn 優先で連続記録を快適にする。
  const inEditorMode = outMs !== null;
  const effectiveInMs = inEditorMode ? inMs ?? autoInMs : autoInMs ?? inMs;
  const inLocked = !inEditorMode && autoInMs !== null;

  const stats = useMemo(() => {
    const byCat = { value_added: 0, incidental: 0, waste: 0 };
    let total = 0;
    for (const t of tasks) {
      const d = t.endTimeMs - t.startTimeMs;
      byCat[t.category] += d;
      total += d;
    }
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return {
      total,
      byCat,
      pct: { value_added: pct(byCat.value_added), incidental: pct(byCat.incidental), waste: pct(byCat.waste) },
    };
  }, [tasks]);

  const stepFrames = useCallback(
    (delta: number) => {
      player.pause();
      const newFrame = Math.max(0, msToFrame(currentMs, fps) + delta);
      const newMs = Math.min(frameToMs(newFrame, fps), durationMs);
      player.currentTime = newMs / 1000;
      setScrubMs(newMs);
    },
    [player, currentMs, fps, durationMs]
  );

  const stepSeconds = useCallback(
    (delta: number) => {
      player.pause();
      const newMs = Math.max(0, Math.min(currentMs + delta * 1000, durationMs));
      player.currentTime = newMs / 1000;
      setScrubMs(newMs);
    },
    [player, currentMs, durationMs]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) player.pause();
    else player.play();
  }, [isPlaying, player]);

  const onSetIn = () => {
    if (inLocked) return; // auto-locked from previous task; can't be changed
    setInMs(currentMs);
    if (outMs !== null && outMs <= currentMs) setOutMs(null);
  };
  const onSetOut = () => {
    if (effectiveInMs === null) {
      Alert.alert('順序エラー', '先に「ここから」を設定してください');
      return;
    }
    if (currentMs <= effectiveInMs) {
      Alert.alert('順序エラー', '「ここまで」は「ここから」より後の時刻にしてください');
      return;
    }
    // エディタモード突入時、In が autoIn 由来なら inMs にスナップショット。
    // これでリソース/サイクル切替しても、編集中の In が消えなくなる。
    if (inMs === null && autoInMs !== null) {
      setInMs(autoInMs);
    }
    setOutMs(currentMs);
  };
  const onClearMarkers = () => {
    if (!inLocked) setInMs(null);
    setOutMs(null);
    setTaskName('');
  };

  const onSaveTask = async () => {
    if (effectiveInMs === null || outMs === null) {
      Alert.alert('入力エラー', 'In/Outを設定してください');
      return;
    }
    if (!selectedResourceId) {
      Alert.alert('入力エラー', 'リソースを選択してください');
      return;
    }
    if (!taskName.trim()) {
      Alert.alert('入力エラー', '作業名を入力してください');
      return;
    }
    await createTask({
      sessionId,
      resourceId: selectedResourceId,
      cycleNumber: 1, // サイクル機能は廃止。DB 列との互換性のため 1 固定
      name: taskName.trim(),
      startTimeMs: effectiveInMs,
      endTimeMs: outMs,
      category,
    });
    // 保存後: 次の作業に向けて Out 位置までシークし、入力欄をリセット。
    // 次の作業の In は autoInMs (= 今保存した作業の Out) として自動で固定される。
    player.pause();
    player.currentTime = outMs / 1000;
    setScrubMs(outMs);
    setInMs(null);
    setOutMs(null);
    setTaskName('');
    const next = await listTasks(sessionId);
    setTasks(next);
  };

  const onDeleteTask = (t: TaskElement) => {
    Alert.alert('削除確認', `「${t.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteTask(t.id);
          setTasks(await listTasks(sessionId));
        },
      },
    ]);
  };

  if (!session) {
    return (
      <View style={styles.loading}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  const currentFrame = msToFrame(currentMs, fps);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.videoBox}>
          <VideoView
            style={styles.video}
            player={player}
            allowsFullscreen
            nativeControls={false}
            contentFit="contain"
          />
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatMs(currentMs)}</Text>
          <Text style={styles.frameText}>F: {currentFrame}</Text>
          <Text style={styles.durText}>/ {formatMs(durationMs)}</Text>
        </View>

        <View style={styles.sliderRow}>
          <View style={styles.markerTrack}>
            {effectiveInMs !== null && outMs !== null && (
              <View
                style={[
                  styles.markerRange,
                  {
                    left: `${(effectiveInMs / Math.max(1, durationMs)) * 100}%`,
                    width: `${((outMs - effectiveInMs) / Math.max(1, durationMs)) * 100}%`,
                  },
                ]}
              />
            )}
            {effectiveInMs !== null && (
              <View
                style={[
                  styles.markerLine,
                  { left: `${(effectiveInMs / Math.max(1, durationMs)) * 100}%`, backgroundColor: '#22c55e' },
                ]}
              />
            )}
            {outMs !== null && (
              <View
                style={[
                  styles.markerLine,
                  { left: `${(outMs / Math.max(1, durationMs)) * 100}%`, backgroundColor: '#ef4444' },
                ]}
              />
            )}
          </View>
          <Slider
            style={{ flex: 1 }}
            minimumValue={0}
            maximumValue={Math.max(1, durationMs)}
            value={currentMs}
            step={Math.max(1, 1000 / fps)}
            onValueChange={(v) => {
              setIsScrubbing(true);
              setScrubMs(v);
            }}
            onSlidingComplete={(v) => {
              player.currentTime = v / 1000;
              setScrubMs(v);
              setIsScrubbing(false);
            }}
            minimumTrackTintColor="#2563eb"
            maximumTrackTintColor="#d1d5db"
          />
        </View>

        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>再生速度</Text>
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.speedChip, playbackRate === r && styles.speedChipActive]}
              onPress={() => setPlaybackRate(r)}
            >
              <Text
                style={[
                  styles.speedChipText,
                  playbackRate === r && styles.speedChipTextActive,
                ]}
              >
                {r}x
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.muteBtn, muted && styles.muteBtnActive]}
            onPress={() => setMuted((m) => !m)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.ctrlRow}>
          <CtrlBtn label="◀◀" sub="5コマ戻し" onPress={() => stepFrames(-5)} />
          <CtrlBtn label="◀" sub="1コマ戻し" onPress={() => stepFrames(-1)} />
          <CtrlBtn
            label={isPlaying ? '⏸' : '▶'}
            onPress={togglePlay}
            primary
          />
          <CtrlBtn label="▶" sub="1コマ送り" onPress={() => stepFrames(1)} />
          <CtrlBtn label="▶▶" sub="5コマ送り" onPress={() => stepFrames(5)} />
        </View>
        <View style={styles.ctrlRow2}>
          <CtrlBtn label="−5秒" sub="" onPress={() => stepSeconds(-5)} small />
          <CtrlBtn label="−1秒" sub="" onPress={() => stepSeconds(-1)} small />
          <CtrlBtn label="+1秒" sub="" onPress={() => stepSeconds(1)} small />
          <CtrlBtn label="+5秒" sub="" onPress={() => stepSeconds(5)} small />
        </View>

        <View style={styles.stepBanner}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {effectiveInMs === null ? '1' : outMs === null ? '2' : '3'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {effectiveInMs === null
                ? '始まりを記録'
                : outMs === null
                ? '終わりを記録'
                : '内容を保存'}
            </Text>
            <Text style={styles.stepSub}>
              {effectiveInMs === null
                ? '▶ 再生して、作業が始まる所で「ここから」をタップ'
                : outMs === null
                ? inLocked
                  ? '前の作業の終わりから自動で始まっています。終わる所で「ここまで」をタップ'
                  : '続きを再生して、終わる所で「ここまで」をタップ'
                : '下の入力欄を埋めて「この作業を保存」をタップ'}
            </Text>
          </View>
        </View>

        <View style={styles.inoutRow}>
          <TouchableOpacity
            style={[
              styles.inBtn,
              effectiveInMs !== null && !inLocked && styles.inBtnSet,
              inLocked && styles.inBtnLocked,
            ]}
            onPress={onSetIn}
            disabled={inLocked}
            activeOpacity={inLocked ? 1 : 0.7}
          >
            <Text
              style={[
                styles.inBtnText,
                effectiveInMs !== null && !inLocked && styles.inBtnTextMuted,
                inLocked && styles.inBtnTextLocked,
              ]}
            >
              {inLocked ? '🔒 ここから' : effectiveInMs !== null ? '✓ ここから' : '🚩 ここから'}
            </Text>
            <Text
              style={[
                styles.inBtnTime,
                effectiveInMs !== null && !inLocked && styles.inBtnTimeMuted,
                inLocked && styles.inBtnTimeLocked,
              ]}
            >
              {effectiveInMs !== null
                ? inLocked
                  ? `前作業の続き ${formatMs(effectiveInMs)}`
                  : formatMs(effectiveInMs)
                : 'タップで始まり'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.outBtn,
              outMs !== null && styles.outBtnSet,
              effectiveInMs === null && styles.outBtnDisabled,
            ]}
            onPress={onSetOut}
          >
            <Text style={styles.outBtnText}>🏁 ここまで</Text>
            <Text style={styles.outBtnTime}>
              {outMs !== null
                ? formatMs(outMs)
                : effectiveInMs === null
                ? '先に始まり'
                : 'タップで終わり'}
            </Text>
          </TouchableOpacity>
          {(outMs !== null || (!inLocked && inMs !== null)) && (
            <TouchableOpacity style={styles.clearBtn} onPress={onClearMarkers}>
              <Text style={styles.clearBtnText}>やり直す</Text>
            </TouchableOpacity>
          )}
        </View>

        {effectiveInMs !== null && outMs !== null && (
          <View style={styles.editor}>
            {/* コンパクトな所要時間表示 (1行) */}
            <View style={styles.durLine}>
              <Text style={styles.durLineMain}>{formatMs(outMs - effectiveInMs)}</Text>
              <Text style={styles.durLineSub}>
                {formatMs(effectiveInMs)} → {formatMs(outMs)}
              </Text>
            </View>

            {/* 作業名 (最重要) */}
            <TextInput
              style={[styles.input, styles.taskNameInput]}
              value={taskName}
              onChangeText={setTaskName}
              placeholder="作業名 (例: ボルト締め)"
              autoFocus={!taskName}
            />
            {recentNames.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.suggestRow}
                contentContainerStyle={{ gap: 6 }}
              >
                {recentNames.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={styles.suggestChip}
                    onPress={() => setTaskName(n)}
                  >
                    <Text style={styles.suggestChipText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* 分類 (横並びの色付きピル) */}
            <View style={styles.catChipRow}>
              {CATEGORY_ORDER.map((c) => {
                const active = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.catChip,
                      { borderColor: CATEGORY_COLORS[c] },
                      active && { backgroundColor: CATEGORY_COLORS[c] },
                    ]}
                    onPress={() => setCategory(c)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        active
                          ? styles.catChipTextActive
                          : { color: CATEGORY_COLORS[c] },
                      ]}
                    >
                      {catLabels[c]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* リソース (2つ以上ある時だけ・横スクロール) */}
            {resources.length > 1 && (
              <View style={[styles.chipRow, { marginTop: 8 }]}>
                {resources.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, selectedResourceId === r.id && styles.chipActive]}
                    onPress={() => setSelectedResourceId(r.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedResourceId === r.id && styles.chipTextActive,
                      ]}
                    >
                      {r.type === 'person' ? '👷' : '⚙️'} {r.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={onSaveTask}>
              <Text style={styles.saveBtnText}>この作業を保存</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.taskListBox}>
          <Text style={styles.taskListHeader}>記録済み要素作業（{tasks.length}件）</Text>
          {tasks.length > 0 && (
            <Text style={styles.taskListHint}>タップで編集 / 長押しで削除</Text>
          )}
          {tasks.length > 0 && (
            <View style={styles.statsBox}>
              <View style={styles.statsTotalRow}>
                <Text style={styles.statsTotalLabel}>合計時間</Text>
                <Text style={styles.statsTotalValue}>{formatMs(stats.total)}</Text>
              </View>
              <View style={styles.statsBar}>
                {(['value_added', 'incidental', 'waste'] as const).map((c) =>
                  stats.byCat[c] > 0 ? (
                    <View
                      key={c}
                      style={{
                        flex: stats.byCat[c],
                        backgroundColor: CATEGORY_COLORS[c],
                      }}
                    />
                  ) : null
                )}
              </View>
              <View style={styles.statsLegend}>
                {(['value_added', 'incidental', 'waste'] as const).map((c) => {
                  const label =
                    session.mode === 'machine'
                      ? MACHINE_CATEGORY_LABELS[c]
                      : session.mode === 'person'
                      ? CATEGORY_LABELS[c]
                      : c === 'value_added'
                      ? '正味'
                      : c === 'incidental'
                      ? '付帯'
                      : 'ムダ・停止';
                  return (
                    <View key={c} style={styles.statsLegendItem}>
                      <View
                        style={[styles.statsLegendDot, { backgroundColor: CATEGORY_COLORS[c] }]}
                      />
                      <Text style={styles.statsLegendText}>
                        {label} {stats.pct[c]}%
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.statsHint}>タップでジャンプ・長押しで削除</Text>
            </View>
          )}
          {tasks.length === 0 ? (
            <View style={styles.emptyGuide}>
              <Text style={styles.emptyGuideIcon}>👋</Text>
              <Text style={styles.emptyGuideTitle}>はじめましょう</Text>
              <Text style={styles.emptyGuideText}>
                ① ▶ で動画を再生{'\n'}
                ② 作業の始まりで「🚩 ここから」をタップ{'\n'}
                ③ 作業の終わりで「🏁 ここまで」をタップ{'\n'}
                ④ 作業名と分類を入れて保存
              </Text>
              <Text style={styles.emptyGuideHint}>
                細かく合わせたいときは ◀/▶ ボタンで{'\n'}コマ送りができます
              </Text>
            </View>
          ) : (
            tasks.map((t) => {
              const r = resources.find((x) => x.id === t.resourceId);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.taskRow}
                  onPress={() => setEditingTask(t)}
                  onLongPress={() => onDeleteTask(t)}
                >
                  <View
                    style={[
                      styles.taskColor,
                      { backgroundColor: CATEGORY_COLORS[t.category] },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskName}>{t.name}</Text>
                    <Text style={styles.taskMeta}>
                      {r?.name ?? '?'} ・ {formatMs(t.startTimeMs)} → {formatMs(t.endTimeMs)}（
                      {t.endTimeMs - t.startTimeMs}ms）
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
      <SessionTabBar current="Analysis" sessionId={sessionId} />
      <TaskEditModal
        task={editingTask}
        resources={resources}
        onClose={() => setEditingTask(null)}
        onChanged={() => listTasks(sessionId).then(setTasks)}
        onJumpToStart={(startMs) => {
          player.pause();
          player.currentTime = startMs / 1000;
          setScrubMs(startMs);
        }}
      />
    </View>
  );
}

function CtrlBtn({
  label,
  sub,
  onPress,
  primary,
  small,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.ctrlBtn,
        primary && styles.ctrlBtnPrimary,
        small && styles.ctrlBtnSmall,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.ctrlBtnText,
          primary && styles.ctrlBtnTextPrimary,
          small && styles.ctrlBtnTextSmall,
        ]}
      >
        {label}
      </Text>
      {sub && !primary && !small && <Text style={styles.ctrlBtnSub}>{sub}</Text>}
    </TouchableOpacity>
  );
}

function HeaderBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoBox: {
    backgroundColor: '#000',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  video: { width: '100%', height: '100%' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    padding: 8,
    gap: 12,
    backgroundColor: '#fff',
  },
  timeText: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], color: '#111827' },
  frameText: { fontSize: 14, color: '#2563eb', fontVariant: ['tabular-nums'], fontWeight: '600' },
  durText: { fontSize: 14, color: '#6b7280', fontVariant: ['tabular-nums'] },
  sliderRow: { paddingHorizontal: 16, backgroundColor: '#fff' },
  markerTrack: { height: 6, position: 'relative', marginTop: 2 },
  markerRange: {
    position: 'absolute',
    top: 1,
    height: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    borderRadius: 2,
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: 6,
    marginLeft: -1.5,
    borderRadius: 1,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: '#fff',
  },
  speedLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginRight: 4 },
  speedChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  speedChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  speedChipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  speedChipTextActive: { color: '#fff' },
  muteBtn: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtnActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  muteBtnText: { fontSize: 16 },
  ctrlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 6,
    backgroundColor: '#fff',
  },
  ctrlRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  ctrlBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  ctrlBtnSmall: {
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
  },
  ctrlBtnTextSmall: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  ctrlBtnPrimary: {
    backgroundColor: '#2563eb',
    paddingVertical: 18,
    shadowColor: '#2563eb',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ctrlBtnText: { fontSize: 18, fontWeight: '800', color: '#111827' },
  ctrlBtnTextPrimary: { color: '#fff', fontSize: 30 },
  ctrlBtnSub: { fontSize: 11, color: '#6b7280', marginTop: 2, fontWeight: '600' },
  stepBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#eff6ff',
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '800', color: '#1d4ed8' },
  stepSub: { fontSize: 12, color: '#1e40af', marginTop: 2 },
  inoutRow: { flexDirection: 'row', padding: 12, gap: 8 },
  inBtn: {
    flex: 1,
    backgroundColor: '#dcfce7',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#86efac',
  },
  inBtnSet: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  // 「前の作業から自動で固定された In」のロック状態。
  // dashed の枠と濃いめのグレーで「触れない」ことを強く出す。
  inBtnLocked: {
    backgroundColor: '#e5e7eb',
    borderColor: '#9ca3af',
    borderStyle: 'dashed',
  },
  inBtnText: { fontWeight: '700', color: '#166534', fontSize: 15 },
  inBtnTextMuted: { color: '#6b7280' },
  inBtnTextLocked: { color: '#4b5563' },
  inBtnTime: { fontSize: 12, color: '#166534', fontVariant: ['tabular-nums'], marginTop: 4 },
  inBtnTimeMuted: { color: '#9ca3af' },
  inBtnTimeLocked: { color: '#4b5563', fontWeight: '700' },
  outBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fca5a5',
  },
  outBtnSet: { backgroundColor: '#fecaca', borderColor: '#ef4444' },
  outBtnDisabled: { opacity: 0.45 },
  outBtnText: { fontWeight: '700', color: '#991b1b', fontSize: 15 },
  outBtnTime: { fontSize: 12, color: '#991b1b', fontVariant: ['tabular-nums'], marginTop: 4 },
  clearBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  clearBtnText: { color: '#6b7280', fontWeight: '600' },
  editor: {
    margin: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  durBanner: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  durBannerLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  durBannerValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  durBannerSub: { fontSize: 11, color: '#9ca3af', fontVariant: ['tabular-nums'], marginTop: 4 },
  inlineRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  // コンパクトな所要時間表示 (1 行)
  durLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  durLineMain: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  durLineSub: { fontSize: 12, color: '#6b7280', fontVariant: ['tabular-nums'] },
  taskNameInput: { fontSize: 17, fontWeight: '600' },
  // 分類ピル (横並び・コンパクト)
  catChipRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  catChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  catChipText: { fontSize: 14, fontWeight: '800' },
  catChipTextActive: { color: '#fff' },
  suggestRow: { marginTop: 6 },
  suggestChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  suggestChipText: { fontSize: 12, color: '#3730a3', fontWeight: '600' },
  editorLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    padding: 10,
    gap: 10,
  },
  catStripe: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  catTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  catDesc: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  catEx: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  catCheck: { fontSize: 22, color: '#10b981', fontWeight: '900', marginRight: 4 },
  wasteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wasteCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fecaca',
    padding: 10,
  },
  wasteCardActive: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
  wasteCardLabel: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
  wasteCardLabelActive: { color: '#7f1d1d' },
  wasteCardEx: { fontSize: 10, color: '#b91c1c', marginTop: 2 },
  wasteCardExActive: { color: '#991b1b' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  taskListBox: { padding: 12 },
  taskListHeader: { fontSize: 14, fontWeight: '700', color: '#374151' },
  taskListHint: { fontSize: 11, color: '#9ca3af', marginTop: 2, marginBottom: 8 },
  taskEmpty: { textAlign: 'center', color: '#9ca3af', padding: 20 },
  emptyGuide: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
  },
  emptyGuideIcon: { fontSize: 32 },
  emptyGuideTitle: { fontSize: 17, fontWeight: '800', color: '#92400e', marginTop: 4 },
  emptyGuideText: { fontSize: 14, color: '#78350f', marginTop: 12, lineHeight: 22 },
  emptyGuideHint: {
    fontSize: 12,
    color: '#92400e',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  statsBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statsTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  statsTotalLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  statsTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  statsBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 8,
    backgroundColor: '#f3f4f6',
  },
  statsLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  statsLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statsLegendDot: { width: 10, height: 10, borderRadius: 5 },
  statsLegendText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  statsHint: { fontSize: 10, color: '#9ca3af', marginTop: 8, textAlign: 'center' },
  taskRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    gap: 10,
  },
  taskColor: { width: 6, height: 36, borderRadius: 3 },
  taskName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  taskMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
});
