import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, gradients, radii, shadows, spacing } from '../theme';
import { markOnboardingSeen } from '../utils/appState';

interface Props {
  onDone: () => void;
}

interface Page {
  icon: string;
  title: string;
  body: string;
  bullets?: string[];
}

const PAGES: Page[] = [
  {
    icon: '👋',
    title: 'カイゼンスコープへようこそ',
    body:
      '作業動画から「ムダ」を見つけて、改善のヒントを引き出すアプリです。\n\nTPS/IE の手法をスマホ一つで実践できます。',
  },
  {
    icon: '📹',
    title: '動画を読み込む',
    body: '撮影した作業動画を選んでセッションを作ります。',
    bullets: [
      '人の分析・機械の分析・両方から選べます',
      '作業者や機械を登録',
      'タクトタイムも設定',
    ],
  },
  {
    icon: '🎬',
    title: '要素作業を記録する',
    body: '動画を見ながら、各作業の開始・終了をワンタップで打刻。',
    bullets: [
      '正味作業 / 付帯作業 / ムダ・停止に分類',
      'コマ送りで細かい時間も合わせられる',
      '記録した作業はあとから編集 OK',
    ],
  },
  {
    icon: '💡',
    title: '改善案 × 効果試算',
    body: '記録するだけで、AI が改善ポイントを自動抽出。',
    bullets: [
      '負荷のばらつき・タクト超過・ムダの集中を検出',
      '対応案を選ぶだけで改善後をシミュレーション',
      '時給を入れれば「年間 ¥XX 万円の効果見込み」も',
    ],
  },
];

const { width: SCREEN_W } = Dimensions.get('window');

export default function OnboardingScreen({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Page>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  const goNext = () => {
    if (index < PAGES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      finish();
    }
  };

  const finish = async () => {
    await markOnboardingSeen();
    onDone();
  };

  return (
    <LinearGradient
      colors={gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={styles.skipRow}>
        {index < PAGES.length - 1 ? (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Text style={styles.skip}>スキップ</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.page, { width: SCREEN_W }]}>
            <View style={styles.iconRing}>
              <Text style={styles.icon}>{item.icon}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            {item.bullets && (
              <View style={styles.bullets}>
                {item.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>✓</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      />

      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      <TouchableOpacity activeOpacity={0.85} style={styles.cta} onPress={goNext}>
        <Text style={styles.ctaText}>
          {index < PAGES.length - 1 ? '次へ →' : '✓ 始める'}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 50,
    paddingBottom: 30,
  },
  skipRow: {
    paddingHorizontal: 20,
    alignItems: 'flex-end',
    height: 28,
  },
  skip: {
    color: '#e0e7ff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  page: {
    paddingHorizontal: 32,
    paddingTop: 30,
    alignItems: 'center',
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    ...shadows.floating,
  },
  icon: { fontSize: 60 },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    color: '#e0e7ff',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  bullets: {
    marginTop: 4,
    alignSelf: 'stretch',
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  bulletMark: {
    fontSize: 14,
    color: '#fbbf24',
    fontWeight: '900',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    lineHeight: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 24,
  },
  cta: {
    marginHorizontal: 24,
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    ...shadows.floating,
  },
  ctaText: {
    color: colors.primary800,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
