import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';
import { getAdFreeStatus, watchRewardedForAdFree } from '../utils/ads';
import { seedDemoIntoLatestSession } from '../utils/seed';
import { wipeAllUserData } from '../utils/wipe';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 全データ削除後に呼ばれる (例: SessionList リロード) */
  onDataWiped?: () => void;
}

const PRIVACY_POLICY_URL =
  'https://kyorochanfate-cmd.github.io/kaizenscope/privacy.html';
const SUPPORT_EMAIL = 'kyorochan.fate@gmail.com';

export default function AppInfoModal({ visible, onClose, onDataWiped }: Props) {
  const [wiping, setWiping] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [watchingRewarded, setWatchingRewarded] = useState(false);
  const [adFreeRemainingMin, setAdFreeRemainingMin] = useState(0);

  const appName = (Constants.expoConfig?.name as string) ?? 'カイゼンスコープ';
  const version = (Constants.expoConfig?.version as string) ?? '1.0.0';
  const sdkVersion = (Constants.expoConfig?.sdkVersion as string) ?? '54.0.0';

  // モーダル表示時に ad-free 残り時間を再計算
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const s = await getAdFreeStatus();
      if (!cancelled) setAdFreeRemainingMin(s.remainingMinutes);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const onWatchRewarded = async () => {
    setWatchingRewarded(true);
    try {
      const r = await watchRewardedForAdFree();
      if (r.ok) {
        const s = await getAdFreeStatus();
        setAdFreeRemainingMin(s.remainingMinutes);
        Alert.alert(
          '✅ 広告を 1 時間 非表示にしました',
          'ご視聴ありがとうございました。'
        );
      } else if (r.reason === 'sdk_unavailable') {
        Alert.alert(
          '広告が利用できません',
          'Expo Go では広告の表示はサポートされていません。EAS でビルドしたアプリでお試しください。'
        );
      } else if (r.reason === 'closed_without_reward') {
        Alert.alert('途中で閉じられました', '最後まで視聴すると報酬が付与されます。');
      } else {
        Alert.alert(
          '広告を読み込めませんでした',
          '通信状況をご確認の上、しばらく経ってから再度お試しください。'
        );
      }
    } finally {
      setWatchingRewarded(false);
    }
  };

  const openPrivacy = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
      Alert.alert('開けませんでした', 'プライバシーポリシーの URL を開けませんでした')
    );
  };

  const openMail = () => {
    const subject = encodeURIComponent(`【${appName}】お問い合わせ`);
    const body = encodeURIComponent(
      `\n\n---\nApp: ${appName} ${version}\nPlatform: ${Platform.OS} ${Platform.Version}\n`
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert('開けませんでした', 'メールアプリを開けませんでした')
    );
  };

  const onWipe = () => {
    Alert.alert(
      '⚠️ 全データを削除しますか?',
      [
        'すべてのセッション、動画、設定が完全に削除されます。',
        'この操作は取り消せません。',
        '',
        '本当に実行しますか?',
      ].join('\n'),
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => confirmWipe(),
        },
      ]
    );
  };

  const onSeed = () => {
    Alert.alert(
      '🌱 サンプルデータを投入',
      [
        'これは Play Store 用スクリーンショット撮影のための機能です。',
        '',
        '事前準備:',
        '・任意の動画でセッションを 1 つ作成しておく',
        '・そのセッションには要素作業を 1 件も記録しない',
        '',
        '投入される内容:',
        '・リソース 3 件 (作業者A/B + プレスA)',
        '・要素作業 15 件 (現実的な作業名)',
        '・改善効果の試算条件 (¥2,500/h, 800台/日, 250日/年)',
        '・タクトタイム 60 秒',
        '',
        '空のセッションが見つからない場合はエラーになります。',
      ].join('\n'),
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '投入する',
          onPress: async () => {
            setSeeding(true);
            try {
              const result = await seedDemoIntoLatestSession();
              Alert.alert(
                '✅ 投入完了',
                [
                  `セッション「${result.sessionName}」にデモデータを投入しました。`,
                  '',
                  `・リソース: 新規 ${result.resourcesCreated} 件`,
                  `・要素作業: ${result.tasksCreated} 件`,
                  `・試算条件: 設定済み`,
                  '',
                  '画面を閉じて、改善タブや分析タブで撮影してください。',
                ].join('\n')
              );
              onDataWiped?.(); // セッション一覧の更新トリガにも使う
              onClose();
            } catch (e: any) {
              Alert.alert('エラー', String(e?.message ?? e));
            } finally {
              setSeeding(false);
            }
          },
        },
      ]
    );
  };

  const confirmWipe = () => {
    Alert.alert(
      '最終確認',
      '本当によろしいですか? 削除すると元に戻せません。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '完全に削除',
          style: 'destructive',
          onPress: async () => {
            setWiping(true);
            try {
              await wipeAllUserData();
              Alert.alert('完了', 'すべてのデータを削除しました');
              onDataWiped?.();
              onClose();
            } catch (e: any) {
              Alert.alert('エラー', String(e?.message ?? e));
            } finally {
              setWiping(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.title}>{appName}</Text>
            <Text style={styles.subtitle}>
              バージョン {version} ・ Expo SDK {sdkVersion}
            </Text>

            <Section heading="📘 法的事項">
              <Row label="プライバシーポリシー" onPress={openPrivacy} />
            </Section>

            <Section heading="✉ サポート">
              <Row
                label="お問い合わせ (メール)"
                onPress={openMail}
                hint={SUPPORT_EMAIL}
              />
            </Section>

            <Section heading="🎬 広告を 1 時間 非表示にする">
              {adFreeRemainingMin > 0 ? (
                <View style={styles.adFreeActive}>
                  <Text style={styles.adFreeActiveLabel}>
                    ✓ 現在広告非表示中
                  </Text>
                  <Text style={styles.adFreeActiveSub}>
                    残り 約 {adFreeRemainingMin} 分
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.dangerHint}>
                    短い動画広告を 1 本ご視聴いただくと、
                    向こう 1 時間アプリ内のインタースティシャル広告を停止します。
                    開発を応援いただける場合にどうぞ。
                  </Text>
                  <TouchableOpacity
                    style={styles.rewardBtn}
                    onPress={onWatchRewarded}
                    disabled={watchingRewarded}
                    activeOpacity={0.85}
                  >
                    {watchingRewarded ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.rewardBtnText}>
                        ▶ 広告を見て 1 時間非表示にする
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </Section>

            {/* スクショ撮影用の開発者ツール。本番ビルドでは非表示。 */}
            {__DEV__ && (
              <Section heading="📸 ストア撮影用 (開発者向け)">
                <Text style={styles.dangerHint}>
                  スクリーンショット用に、空のセッションへリアルなサンプル要素作業を一括投入します。
                  {'\n'}事前に動画 1 本でセッションを作っておいてください。
                </Text>
                <TouchableOpacity
                  style={styles.seedBtn}
                  onPress={onSeed}
                  disabled={seeding}
                  activeOpacity={0.85}
                >
                  <Text style={styles.seedBtnText}>
                    {seeding ? '投入中...' : '🌱 デモデータを投入'}
                  </Text>
                </TouchableOpacity>
              </Section>
            )}

            <Section heading="🗑 データ管理">
              <Text style={styles.dangerHint}>
                このアプリのデータは、すべて端末内のみに保存されています。
                外部サーバーには送信されません。
              </Text>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={onWipe}
                disabled={wiping}
                activeOpacity={0.85}
              >
                <Text style={styles.dangerBtnText}>
                  {wiping ? '削除中...' : '🗑 全データを削除'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.dangerSub}>
                セッション、動画、設定、オンボーディング履歴を消去します。
              </Text>
            </Section>

            <Text style={styles.copyright}>
              © {new Date().getFullYear()} カイゼンスコープ
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.closeBtnText}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  onPress,
  hint,
}: {
  label: string;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingTop: 8,
    ...shadows.topbar,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
    marginBottom: spacing.xl,
    fontWeight: '600',
  },
  section: { marginBottom: spacing.xl },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionBody: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
  },
  rowHint: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  rowArrow: {
    fontSize: 22,
    color: colors.textFaint,
    fontWeight: '300',
  },
  dangerHint: {
    fontSize: 12,
    color: colors.textMuted,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    lineHeight: 18,
  },
  dangerBtn: {
    backgroundColor: colors.danger600,
    margin: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  seedBtn: {
    backgroundColor: colors.success600,
    margin: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  seedBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  dangerSub: {
    fontSize: 11,
    color: colors.textDim,
    paddingHorizontal: 12,
    paddingBottom: 12,
    lineHeight: 16,
  },
  rewardBtn: {
    backgroundColor: '#4338ca',
    margin: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  rewardBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  adFreeActive: {
    margin: 12,
    padding: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#6ee7b7',
    alignItems: 'center',
  },
  adFreeActiveLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  adFreeActiveSub: {
    fontSize: 12,
    color: '#065f46',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  copyright: {
    fontSize: 10,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  closeBtn: {
    margin: spacing.lg,
    backgroundColor: colors.primary700,
    paddingVertical: 14,
    borderRadius: radii.pill,
    alignItems: 'center',
    ...shadows.card,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
