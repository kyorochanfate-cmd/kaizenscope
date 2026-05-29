import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { createResource, deleteResource, listResources, renameResource } from '../db/resources';
import {
  getSession,
  renameSession,
  updateCostParams,
  updateFps,
  updateTactTime,
} from '../db/sessions';
import { RootStackParamList } from '../navigation/types';
import { AnalysisMode, Resource, ResourceType } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ route }: Props) {
  const { sessionId } = route.params;

  const [mode, setMode] = useState<AnalysisMode>('both');
  const [sessionName, setSessionName] = useState('');
  const [tactTime, setTactTime] = useState('60');
  const [fps, setFps] = useState('30');
  const [resources, setResources] = useState<Resource[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [cyclesPerDay, setCyclesPerDay] = useState('');
  const [workingDays, setWorkingDays] = useState('');

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ResourceType>('person');
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [s, rs] = await Promise.all([getSession(sessionId), listResources(sessionId)]);
    if (s) {
      setMode(s.mode);
      setSessionName(s.name);
      setTactTime(String(s.tactTimeSec));
      setFps(String(s.fps));
      setHourlyRate(s.hourlyRateYen != null ? String(s.hourlyRateYen) : '');
      setCyclesPerDay(s.cyclesPerDay != null ? String(s.cyclesPerDay) : '');
      setWorkingDays(s.workingDaysPerYear != null ? String(s.workingDaysPerYear) : '');
      // Choose default type for new add based on mode
      if (s.mode === 'machine') setNewType('machine');
      else setNewType('person');
    }
    setResources(rs);
    setEditing({});
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (mode === 'person' && newType !== 'person') setNewType('person');
    if (mode === 'machine' && newType !== 'machine') setNewType('machine');
  }, [mode, newType]);

  const onSaveCostParams = async () => {
    const parse = (s: string): number | null => {
      const t = s.trim();
      if (!t) return null;
      const n = parseFloat(t);
      if (!isFinite(n) || n <= 0) return null;
      return n;
    };
    const rate = parse(hourlyRate);
    const cycles = parse(cyclesPerDay);
    const days = parse(workingDays);
    // 全部空でも OK (リセット), どれか一つでも入っていれば部分保存可
    await updateCostParams(sessionId, {
      hourlyRateYen: rate,
      cyclesPerDay: cycles != null ? Math.round(cycles) : null,
      workingDaysPerYear: days != null ? Math.round(days) : null,
    });
    Alert.alert('保存しました', '試算条件を更新しました');
  };

  const onSaveSession = async () => {
    const tactNum = parseFloat(tactTime);
    const fpsNum = parseFloat(fps);
    if (!sessionName.trim()) {
      Alert.alert('入力エラー', 'セッション名を入力してください');
      return;
    }
    if (!tactNum || tactNum <= 0) {
      Alert.alert('入力エラー', 'タクトタイムは正の数値で入力してください');
      return;
    }
    if (!fpsNum || fpsNum <= 0) {
      Alert.alert('入力エラー', 'FPSは正の数値で入力してください');
      return;
    }
    await Promise.all([
      renameSession(sessionId, sessionName.trim()),
      updateTactTime(sessionId, tactNum),
      updateFps(sessionId, fpsNum),
    ]);
    Alert.alert('保存しました', '設定を更新しました');
  };

  const onAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('入力エラー', '名前を入力してください');
      return;
    }
    await createResource({ sessionId, name: newName.trim(), type: newType });
    setNewName('');
    await load();
  };

  const onDelete = (r: Resource) => {
    Alert.alert(
      '削除確認',
      `「${r.name}」を削除しますか？\n関連する要素作業も全て削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteResource(r.id);
            await load();
          },
        },
      ]
    );
  };

  const startEdit = (r: Resource) => {
    setEditing((prev) => ({ ...prev, [r.id]: r.name }));
  };
  const commitEdit = async (r: Resource) => {
    const v = (editing[r.id] ?? '').trim();
    if (v && v !== r.name) {
      await renameResource(r.id, v);
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_HEIGHT + 16 }}
      >
        <Text style={styles.section}>セッション情報</Text>
        <View style={styles.card}>
          <Text style={styles.label}>セッション名</Text>
          <TextInput
            style={styles.input}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="例: ライン1 / 朝礼後計測"
          />

          <Text style={styles.label}>タクトタイム（秒）</Text>
          <TextInput
            style={styles.input}
            value={tactTime}
            onChangeText={setTactTime}
            keyboardType="decimal-pad"
            placeholder="60"
          />
          <Text style={styles.hint}>1サイクルの目標時間。ガント/ヤマズミの基準線になります。</Text>

          <Text style={styles.label}>FPS（フレームレート）</Text>
          <TextInput
            style={styles.input}
            value={fps}
            onChangeText={setFps}
            keyboardType="decimal-pad"
            placeholder="30"
          />
          <Text style={styles.hint}>コマ送りの精度に影響します。</Text>

          <TouchableOpacity style={styles.saveBtn} onPress={onSaveSession}>
            <Text style={styles.saveBtnText}>セッション情報を保存</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { marginTop: 20 }]}>💰 改善効果の試算 (任意)</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>
            ここを入れると、改善タブで「年間の効果見込み (¥/年)」が自動計算されます。
            経営層への説明に便利です。
          </Text>

          <Text style={styles.label}>アワーレート (¥/時)</Text>
          <TextInput
            style={styles.input}
            value={hourlyRate}
            onChangeText={setHourlyRate}
            keyboardType="decimal-pad"
            placeholder="例: 2500"
          />
          <Text style={styles.hint}>作業者時給または機械の時間あたりコスト</Text>

          <Text style={styles.label}>1日のサイクル数</Text>
          <TextInput
            style={styles.input}
            value={cyclesPerDay}
            onChangeText={setCyclesPerDay}
            keyboardType="decimal-pad"
            placeholder="例: 800"
          />

          <Text style={styles.label}>年間稼働日数</Text>
          <TextInput
            style={styles.input}
            value={workingDays}
            onChangeText={setWorkingDays}
            keyboardType="decimal-pad"
            placeholder="例: 250"
          />

          <TouchableOpacity style={styles.saveBtn} onPress={onSaveCostParams}>
            <Text style={styles.saveBtnText}>試算条件を保存</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { marginTop: 20 }]}>
          {mode === 'person' ? '作業者' : mode === 'machine' ? '機械' : '分析対象（人 ・ 機械）'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>追加</Text>
          {mode === 'both' && (
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.chip, newType === 'person' && styles.chipActive]}
                onPress={() => setNewType('person')}
              >
                <Text style={[styles.chipText, newType === 'person' && styles.chipTextActive]}>
                  👷 人
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, newType === 'machine' && styles.chipActive]}
                onPress={() => setNewType('machine')}
              >
                <Text style={[styles.chipText, newType === 'machine' && styles.chipTextActive]}>
                  ⚙️ 機械
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.row, { marginTop: 8 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newName}
              onChangeText={setNewName}
              placeholder={newType === 'person' ? '例: 作業者2' : '例: プレス機A'}
            />
            <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
              <Text style={styles.addBtnText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.label}>登録済み</Text>
          {resources.length === 0 ? (
            <Text style={styles.empty}>まだ登録がありません</Text>
          ) : (
            resources.map((r) => {
              const isEditing = editing[r.id] !== undefined;
              return (
                <View key={r.id} style={styles.resRow}>
                  <View style={[styles.typeBadge, r.type === 'machine' && styles.typeBadgeMachine]}>
                    <Text style={styles.typeBadgeText}>
                      {r.type === 'person' ? '👷' : '⚙️'}
                    </Text>
                  </View>
                  {isEditing ? (
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editing[r.id]}
                      onChangeText={(v) => setEditing((p) => ({ ...p, [r.id]: v }))}
                      autoFocus
                      onBlur={() => commitEdit(r)}
                      onSubmitEditing={() => commitEdit(r)}
                    />
                  ) : (
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => startEdit(r)}>
                      <Text style={styles.resName}>{r.name}</Text>
                      <Text style={styles.resHint}>タップで名前を変更</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => onDelete(r)} style={styles.delBtn}>
                    <Text style={styles.delBtnText}>削除</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
      <SessionTabBar current="Settings" sessionId={sessionId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 8, marginBottom: 6 },
  hint: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  addBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 16 },
  resRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeMachine: { backgroundColor: '#fef3c7' },
  typeBadgeText: { fontSize: 16 },
  resName: { fontSize: 16, color: '#111827', fontWeight: '600' },
  resHint: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  delBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  delBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  proStatus: {
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  proStatusText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  proBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  proBtnOn: { backgroundColor: '#2563eb' },
  proBtnOff: { backgroundColor: '#6b7280' },
  proBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
