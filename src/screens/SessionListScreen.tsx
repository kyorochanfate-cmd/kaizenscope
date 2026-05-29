import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AppInfoModal from '../components/AppInfoModal';
import BannerAdSlot from '../components/BannerAdSlot';
import { deleteSession, listSessions } from '../db/sessions';
import { RootStackParamList } from '../navigation/types';
import { colors, gradients, radii, shadows, spacing, typography } from '../theme';
import { AnalysisSession } from '../types';
import { formatDuration } from '../utils/time';
import { deleteVideo } from '../utils/videoStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionList'>;

export default function SessionListScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [infoVisible, setInfoVisible] = useState(false);

  const load = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ヘッダー右に ⓘ ボタンを置く
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setInfoVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ paddingHorizontal: 6 }}
        >
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>ⓘ</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onDelete = (s: AnalysisSession) => {
    Alert.alert('削除確認', `「${s.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteVideo(s.videoUri).catch(() => {});
          await deleteSession(s.id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <BannerAdSlot />
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <LinearGradient
              colors={gradients.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyHero}
            >
              <Text style={styles.emptyHeroIcon}>📹</Text>
            </LinearGradient>
            <Text style={styles.emptyTitle}>分析を始めましょう</Text>
            <Text style={styles.emptySub}>
              作業動画を読み込んで{'\n'}ムダや改善ポイントを可視化します
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('NewSession')}
              style={styles.emptyBtnWrap}
            >
              <LinearGradient
                colors={gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>＋ 新しい分析をはじめる</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.cardBody}
              onPress={() => navigation.navigate('Analysis', { sessionId: item.id })}
              onLongPress={() => onDelete(item)}
            >
              <LinearGradient
                colors={gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardIconWrap}
              >
                <Text style={styles.cardIcon}>📹</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {formatDuration(item.durationMs)}
                    </Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {item.fps.toFixed(0)}fps
                    </Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      T/T {item.tactTimeSec}s
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDate}>
                  {new Date(item.createdAt).toLocaleString('ja-JP')}
                </Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDelete(item)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.deleteBtnIcon}>🗑</Text>
              <Text style={styles.deleteBtnLabel}>削除</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {sessions.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.fabWrap}
          onPress={() => navigation.navigate('NewSession')}
        >
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Text style={styles.fabIcon}>＋</Text>
            <Text style={styles.fabLabel}>新規</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      <AppInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        onDataWiped={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // === Empty state ===
  empty: {
    padding: spacing.xxxl,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyHero: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadows.floating,
  },
  emptyHeroIcon: { fontSize: 44 },
  emptyTitle: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  emptySub: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textDim,
  },
  emptyBtnWrap: { marginTop: spacing.xxl, ...shadows.floating },
  emptyBtn: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // === Card ===
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: { fontSize: 28 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  metaChip: {
    backgroundColor: colors.primary50,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metaChipText: {
    fontSize: 11,
    color: colors.primary700,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardDate: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 6,
  },
  cardArrow: {
    fontSize: 26,
    color: colors.textFaint,
    fontWeight: '300',
  },
  deleteBtn: {
    width: 64,
    backgroundColor: colors.danger50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteBtnIcon: { fontSize: 22 },
  deleteBtnLabel: {
    fontSize: 10,
    color: colors.danger700,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // === FAB ===
  fabWrap: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xxl,
    borderRadius: radii.pill,
    ...shadows.floating,
  },
  fab: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabIcon: { color: '#fff', fontSize: 22, fontWeight: '900' },
  fabLabel: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
