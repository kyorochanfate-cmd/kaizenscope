import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
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
import { createResource } from '../db/resources';
import { createSession } from '../db/sessions';
import { RootStackParamList } from '../navigation/types';
import { colors, gradients, radii, shadows, spacing } from '../theme';
import { AnalysisMode } from '../types';
import { formatDuration } from '../utils/time';
import { captureException, trackEvent } from '../utils/telemetry';
import { persistVideo } from '../utils/videoStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'NewSession'>;

const FPS_PRESETS = [24, 30, 60, 120];

const MODE_OPTIONS: { key: AnalysisMode; label: string; sub: string; icon: string }[] = [
  { key: 'person', label: '人の分析', sub: '作業者の動きを分析', icon: '👷' },
  { key: 'machine', label: '機械の分析', sub: '機械の稼働を分析', icon: '⚙️' },
  { key: 'both', label: '人＋機械', sub: '人と機械を並行で分析', icon: '👷⚙️' },
];

interface PickedVideo {
  uri: string;
  durationMs: number;
  width: number;
  height: number;
  fileName: string | null;
}

export default function NewSessionScreen({ navigation }: Props) {
  const [mode, setMode] = useState<AnalysisMode>('person');
  const [people, setPeople] = useState<string[]>(['作業者1']);
  const [machines, setMachines] = useState<string[]>(['機械1']);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [name, setName] = useState('');
  const [fps, setFps] = useState('30');
  const [tactTime, setTactTime] = useState('60');
  const [creating, setCreating] = useState(false);

  const showPeople = mode === 'person' || mode === 'both';
  const showMachines = mode === 'machine' || mode === 'both';

  const updateAt = (
    list: string[],
    setter: (l: string[]) => void,
    i: number,
    v: string
  ) => {
    const next = [...list];
    next[i] = v;
    setter(next);
  };
  const removeAt = (list: string[], setter: (l: string[]) => void, i: number) => {
    if (list.length <= 1) return;
    setter(list.filter((_, idx) => idx !== i));
  };
  const addPerson = () => setPeople([...people, `作業者${people.length + 1}`]);
  const addMachine = () => setMachines([...machines, `機械${machines.length + 1}`]);

  // OS の権限ダイアログを出す前に、なぜ権限が必要かを説明するプリプロンプト。
  // 「分からないからとりあえず拒否」が大幅に減る (= 権限拒否率が下がる)。
  const explainAndAsk = (
    title: string,
    body: string,
    onProceed: () => void
  ): void => {
    Alert.alert(title, body, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '次へ進む', onPress: onProceed },
    ]);
  };

  // 2回目以降の呼び出しで Android の picker activity が起動失敗するケースが
  // あるので、try/catch で確実に拾い、ユーザーにフィードバックする。
  const safeLaunch = async (
    label: string,
    launch: () => Promise<ImagePicker.ImagePickerResult>
  ) => {
    try {
      const result = await launch();
      handlePickResult(result);
    } catch (e: any) {
      Alert.alert(
        `${label}を開けませんでした`,
        '一度アプリを再起動してから再度お試しください。\n\n' + String(e?.message ?? e)
      );
      captureException(e, { context: `picker:${label}` });
    }
  };

  const pickFromLibrary = () => {
    explainAndAsk(
      '📁 動画ファイルへのアクセス',
      'カイゼンスコープは、ライブラリに保存されている作業動画を読み込んで分析します。\n\n動画は端末内のみで処理され、外部に送信されません。',
      async () => {
        try {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              '権限が必要です',
              'メディアライブラリへのアクセスが拒否されました。後から OS の設定 → アプリ → カイゼンスコープ で許可できます。'
            );
            return;
          }
          await safeLaunch('ライブラリ', () =>
            ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['videos'],
              quality: 1,
              videoMaxDuration: 0,
              allowsEditing: false,
            })
          );
        } catch (e: any) {
          Alert.alert('エラー', String(e?.message ?? e));
          captureException(e, { context: 'pickFromLibrary' });
        }
      }
    );
  };

  const pickFromCamera = () => {
    explainAndAsk(
      '🎥 カメラと録音へのアクセス',
      'カイゼンスコープは、作業を録画するためにカメラとマイクを使います。\n\n録画は端末内のみに保存され、外部に送信されません。',
      async () => {
        try {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              '権限が必要です',
              'カメラへのアクセスが拒否されました。後から OS の設定 → アプリ → カイゼンスコープ で許可できます。'
            );
            return;
          }
          await safeLaunch('カメラ', () =>
            ImagePicker.launchCameraAsync({
              mediaTypes: ['videos'],
              videoMaxDuration: 0,
              allowsEditing: false,
            })
          );
        } catch (e: any) {
          Alert.alert('エラー', String(e?.message ?? e));
          captureException(e, { context: 'pickFromCamera' });
        }
      }
    );
  };

  const handlePickResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    if (a.type !== 'video') {
      Alert.alert('エラー', '動画ファイルを選択してください');
      return;
    }
    setVideo({
      uri: a.uri,
      durationMs: a.duration ?? 0,
      width: a.width,
      height: a.height,
      fileName: a.fileName ?? null,
    });
    if (!name && a.fileName) {
      setName(a.fileName.replace(/\.[^.]+$/, ''));
    }
  };

  const onCreate = async () => {
    if (!video) {
      Alert.alert('入力エラー', '動画を選択してください');
      return;
    }
    if (!name.trim()) {
      Alert.alert('入力エラー', 'セッション名を入力してください');
      return;
    }
    const fpsNum = parseFloat(fps);
    if (!fpsNum || fpsNum <= 0) {
      Alert.alert('入力エラー', 'FPSは正の数値で入力してください');
      return;
    }
    const tactNum = parseFloat(tactTime);
    if (!tactNum || tactNum <= 0) {
      Alert.alert('入力エラー', 'タクトタイムは正の数値で入力してください');
      return;
    }
    const cleanPeople = showPeople ? people.map((n) => n.trim()).filter(Boolean) : [];
    const cleanMachines = showMachines ? machines.map((n) => n.trim()).filter(Boolean) : [];
    if (cleanPeople.length + cleanMachines.length === 0) {
      Alert.alert('入力エラー', '分析対象を1つ以上登録してください');
      return;
    }
    setCreating(true);
    try {
      // 動画をキャッシュからアプリの永続ストレージへコピー
      let persistentUri: string;
      try {
        persistentUri = await persistVideo(video.uri);
      } catch (e: any) {
        Alert.alert(
          '動画の保存失敗',
          `${String(e?.message ?? e)}\n\n端末の空き容量を確認してください。`
        );
        setCreating(false);
        return;
      }
      const session = await createSession({
        name: name.trim(),
        videoUri: persistentUri,
        fps: fpsNum,
        durationMs: video.durationMs,
        tactTimeSec: tactNum,
        mode,
        parentSessionId: null,
      });
      for (const n of cleanPeople) {
        await createResource({ sessionId: session.id, name: n, type: 'person' });
      }
      for (const n of cleanMachines) {
        await createResource({ sessionId: session.id, name: n, type: 'machine' });
      }
      trackEvent('session_created', {
        mode,
        peopleCount: cleanPeople.length,
        machineCount: cleanMachines.length,
      });
      navigation.replace('Analysis', { sessionId: session.id });
    } catch (e: any) {
      Alert.alert('エラー', String(e?.message ?? e));
      captureException(e, { context: 'createSession' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.stepHeading}>① 何を分析しますか?</Text>
        <View style={styles.modeGrid}>
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.modeCard, active && styles.modeCardActive]}
                onPress={() => setMode(opt.key)}
              >
                <Text style={styles.modeIcon}>{opt.icon}</Text>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.modeSub, active && styles.modeSubActive]}>{opt.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.stepHeading, { marginTop: 20 }]}>② 分析対象を登録</Text>
        <Text style={styles.hint}>後からも追加・編集できます</Text>

        {showPeople && (
          <View style={styles.resBox}>
            <Text style={styles.resBoxTitle}>👷 作業者</Text>
            {people.map((n, i) => (
              <View key={i} style={styles.resRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={n}
                  onChangeText={(v) => updateAt(people, setPeople, i, v)}
                  placeholder={`作業者${i + 1}`}
                />
                <TouchableOpacity
                  style={[styles.resDel, people.length <= 1 && styles.resDelDisabled]}
                  onPress={() => removeAt(people, setPeople, i)}
                  disabled={people.length <= 1}
                >
                  <Text style={styles.resDelText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.resAdd} onPress={addPerson}>
              <Text style={styles.resAddText}>＋ 作業者を追加</Text>
            </TouchableOpacity>
          </View>
        )}

        {showMachines && (
          <View style={[styles.resBox, { marginTop: 8 }]}>
            <Text style={styles.resBoxTitle}>⚙️ 機械</Text>
            {machines.map((n, i) => (
              <View key={i} style={styles.resRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={n}
                  onChangeText={(v) => updateAt(machines, setMachines, i, v)}
                  placeholder={`機械${i + 1}`}
                />
                <TouchableOpacity
                  style={[styles.resDel, machines.length <= 1 && styles.resDelDisabled]}
                  onPress={() => removeAt(machines, setMachines, i)}
                  disabled={machines.length <= 1}
                >
                  <Text style={styles.resDelText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.resAdd} onPress={addMachine}>
              <Text style={styles.resAddText}>＋ 機械を追加</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.stepHeading, { marginTop: 20 }]}>③ 動画を選ぶ</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={pickFromLibrary}>
            <Text style={styles.btnSecondaryText}>ライブラリから選択</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={pickFromCamera}>
            <Text style={styles.btnSecondaryText}>カメラで撮影</Text>
          </TouchableOpacity>
        </View>

        {video && (
          <View style={styles.videoInfo}>
            <Text style={styles.videoInfoText}>
              {video.width}×{video.height} ・ {formatDuration(video.durationMs)}
            </Text>
            <Text style={styles.videoInfoSub} numberOfLines={1}>
              {video.fileName ?? video.uri.split('/').pop()}
            </Text>
          </View>
        )}

        <Text style={[styles.stepHeading, { marginTop: 20 }]}>④ セッション名</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="例: ライン1 / 朝礼後計測"
        />

        <Text style={[styles.stepHeading, { marginTop: 20 }]}>⑤ FPS（フレームレート）</Text>
        <View style={styles.row}>
          {FPS_PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, parseFloat(fps) === p && styles.chipActive]}
              onPress={() => setFps(String(p))}
            >
              <Text
                style={[styles.chipText, parseFloat(fps) === p && styles.chipTextActive]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={fps}
          onChangeText={setFps}
          keyboardType="decimal-pad"
          placeholder="30"
        />
        <Text style={styles.hint}>
          動画のFPSが分かれば手動入力してください。一般的なスマホは30または60fps
        </Text>

        <Text style={[styles.stepHeading, { marginTop: 20 }]}>⑥ タクトタイム（秒）</Text>
        <TextInput
          style={styles.input}
          value={tactTime}
          onChangeText={setTactTime}
          keyboardType="decimal-pad"
          placeholder="60"
        />

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.primaryWrap, creating && { opacity: 0.6 }]}
          onPress={onCreate}
          disabled={creating}
        >
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {creating ? '作成中...' : '✓ セッション作成'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  stepHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  hint: { fontSize: 12, color: colors.textDim, marginTop: 4 },
  modeGrid: { flexDirection: 'row', gap: 8 },
  modeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    ...shadows.card,
  },
  modeCardActive: {
    borderColor: colors.primary600,
    backgroundColor: colors.primary50,
    ...shadows.cardStrong,
  },
  modeIcon: { fontSize: 30, marginBottom: 6 },
  modeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textAlign: 'center',
  },
  modeLabelActive: { color: colors.primary700 },
  modeSub: { fontSize: 10, color: colors.textDim, marginTop: 2, textAlign: 'center' },
  modeSubActive: { color: colors.primary700 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    alignItems: 'center',
    flex: 1,
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  primaryWrap: { marginTop: spacing.xxl, ...shadows.floating },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  videoInfo: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.primary50,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary600,
  },
  videoInfoText: { fontSize: 13, color: colors.primary800, fontWeight: '700' },
  videoInfoSub: { fontSize: 11, color: colors.primary700, marginTop: 2 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flex: 0,
  },
  chipActive: {
    backgroundColor: colors.primary600,
    borderColor: colors.primary600,
  },
  chipText: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: '#fff', fontWeight: '800' },
  resBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 12,
    marginTop: 8,
    ...shadows.card,
  },
  resBoxTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  resDel: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.danger50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resDelDisabled: { backgroundColor: colors.bgAlt },
  resDelText: { color: colors.danger700, fontWeight: '800', fontSize: 16 },
  resAdd: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primary100,
    alignItems: 'center',
  },
  resAddText: { color: colors.primary700, fontWeight: '800' },
});
