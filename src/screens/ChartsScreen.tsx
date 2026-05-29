import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BannerAdSlot from '../components/BannerAdSlot';
import SessionTabBar, { TAB_BAR_HEIGHT } from '../components/SessionTabBar';
import { listResources } from '../db/resources';
import { getSession } from '../db/sessions';
import { listTasks } from '../db/tasks';
import { RootStackParamList } from '../navigation/types';
import { colors, radii, shadows, spacing } from '../theme';
import { exportXlsx } from '../utils/excel';
import { exportPdf } from '../utils/pdf';
import { captureException, trackEvent } from '../utils/telemetry';

type Props = NativeStackScreenProps<RootStackParamList, 'Charts'>;

export default function ChartsScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const onExportExcel = async () => {
    setExporting(true);
    try {
      const [s, rs, ts] = await Promise.all([
        getSession(sessionId),
        listResources(sessionId),
        listTasks(sessionId),
      ]);
      if (!s) {
        Alert.alert('エラー', 'セッションが見つかりません');
        return;
      }
      await exportXlsx(s, rs, ts);
      trackEvent('xlsx_exported', { taskCount: ts.length, resourceCount: rs.length });
    } catch (e: any) {
      Alert.alert('出力失敗', String(e?.message ?? e));
      captureException(e, { context: 'exportXlsx' });
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    setExportingPdf(true);
    try {
      const [s, rs, ts] = await Promise.all([
        getSession(sessionId),
        listResources(sessionId),
        listTasks(sessionId),
      ]);
      if (!s) {
        Alert.alert('エラー', 'セッションが見つかりません');
        return;
      }
      await exportPdf(s, rs, ts);
      trackEvent('pdf_exported', { taskCount: ts.length, resourceCount: rs.length });
    } catch (e: any) {
      Alert.alert('PDF 出力失敗', String(e?.message ?? e));
      captureException(e, { context: 'exportPdf' });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BannerAdSlot />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + 16 }}
      >
        <Text style={styles.intro}>見たい分析を選んでください</Text>

        <AnalysisCard
          gradient={['#3b82f6', '#1d4ed8'] as const}
          icon="📊"
          title="ガントチャート"
          tag="1リソース＝1行・横軸時間"
          desc="全リソースを並列で見て、誰がいつ動いていたか・止まっていたかを比較する"
          hint="多リソースのタイミング比較"
          onPress={() => navigation.navigate('Gantt', { sessionId })}
        />

        <View style={{ height: spacing.md }} />

        <AnalysisCard
          gradient={['#10b981', '#047857'] as const}
          icon="📈"
          title="山積み表"
          tag="1リソース＝1本の縦棒"
          desc="各リソースの合計時間と内訳をタクトと比較。負荷の偏り・タクト達成を一目で"
          hint="負荷の平準化・タクト達成率"
          onPress={() => navigation.navigate('Yamazumi', { sessionId })}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>PC へ送る</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onExportExcel}
          disabled={exporting}
          style={styles.proCardWrap}
        >
          <LinearGradient
            colors={['#fef3c7', '#fde68a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proCard}
          >
            <View style={styles.proIconWrap}>
              <Text style={styles.proIcon}>📊</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proTitle}>Excel レポート出力</Text>
              <Text style={styles.proTag}>6 シート構成 / メール・クラウドで PC へ</Text>
              <Text style={styles.proDesc}>
                概要・タスク詳細・リソース別サマリ・改善ポイント・ガント用データを 1 ファイルに
              </Text>
            </View>
            {exporting ? (
              <ActivityIndicator color={colors.primary700} />
            ) : (
              <Text style={styles.cardArrow}>›</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: spacing.md }} />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onExportPdf}
          disabled={exportingPdf}
          style={styles.proCardWrap}
        >
          <LinearGradient
            colors={['#fee2e2', '#fecaca']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.proCard, { borderColor: '#fca5a5' }]}
          >
            <View style={styles.proIconWrap}>
              <Text style={styles.proIcon}>📄</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.proTitle, { color: '#991b1b' }]}>
                PDF レポート出力
              </Text>
              <Text style={[styles.proTag, { color: '#7f1d1d' }]}>
                A4 縦 / 朝礼・上司・社内回覧に
              </Text>
              <Text style={[styles.proDesc, { color: '#991b1b' }]}>
                サマリ・カテゴリ円グラフ・山積み・ガント・改善ポイントを 1 ファイルに整形
              </Text>
            </View>
            {exportingPdf ? (
              <ActivityIndicator color="#991b1b" />
            ) : (
              <Text style={[styles.cardArrow, { color: '#fca5a5' }]}>›</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
      <SessionTabBar current="Charts" sessionId={sessionId} />
    </View>
  );
}

function AnalysisCard({
  gradient,
  icon,
  title,
  tag,
  desc,
  hint,
  onPress,
}: {
  gradient: readonly [string, string];
  icon: string;
  title: string;
  tag: string;
  desc: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardIconWrap}
      >
        <Text style={styles.cardIcon}>{icon}</Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardTag}>{tag}</Text>
        <Text style={styles.cardDesc}>{desc}</Text>
        <View style={styles.cardHintWrap}>
          <Text style={styles.cardHintMark}>✓</Text>
          <Text style={styles.cardHint}>{hint}</Text>
        </View>
      </View>
      <Text style={styles.cardArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  intro: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: spacing.lg,
    textAlign: 'center',
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  cardIcon: { fontSize: 28 },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardTag: {
    fontSize: 11,
    color: colors.primary700,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  cardHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  cardHintMark: {
    color: colors.success600,
    fontSize: 11,
    fontWeight: '900',
  },
  cardHint: {
    fontSize: 11,
    color: colors.success700,
    fontWeight: '700',
  },
  cardArrow: { fontSize: 28, color: colors.textFaint, fontWeight: '300' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  proCardWrap: { ...shadows.cardStrong },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  proIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    ...shadows.card,
  },
  proIcon: { fontSize: 28 },
  proTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#78350f',
    letterSpacing: -0.3,
  },
  proBadgeWrap: {
    backgroundColor: '#d97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proBadge: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  proOwned: {
    color: colors.success700,
    fontSize: 12,
    fontWeight: '900',
  },
  proTag: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '800',
    marginTop: 4,
  },
  proDesc: {
    fontSize: 12,
    color: '#78350f',
    marginTop: 4,
    lineHeight: 18,
  },
});
