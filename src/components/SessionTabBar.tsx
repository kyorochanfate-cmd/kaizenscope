import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RootStackParamList } from '../navigation/types';
import { colors, gradients, radii, shadows } from '../theme';

type SessionRouteName = 'Analysis' | 'Charts' | 'Improvements' | 'Settings';

const TABS: { name: SessionRouteName; icon: string; label: string }[] = [
  { name: 'Analysis', icon: '🎬', label: '記録' },
  { name: 'Charts', icon: '📊', label: '分析' },
  { name: 'Improvements', icon: '💡', label: '改善' },
  { name: 'Settings', icon: '⚙️', label: '設定' },
];

interface Props {
  current: SessionRouteName;
  sessionId: string;
}

export default function SessionTabBar({ current, sessionId }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map((t) => {
          const active = t.name === current;
          return (
            <TouchableOpacity
              key={t.name}
              style={styles.tab}
              activeOpacity={0.7}
              onPress={() => {
                if (active) return;
                nav.replace(t.name, { sessionId });
              }}
            >
              {active ? (
                <LinearGradient
                  colors={gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconWrapActive}
                >
                  <Text style={[styles.icon, { color: '#fff' }]}>{t.icon}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.iconWrap}>
                  <Text style={styles.icon}>{t.icon}</Text>
                </View>
              )}
              <Text style={[styles.label, active && styles.labelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Height used by callers to pad scroll content so the bar doesn't overlap.
export const TAB_BAR_HEIGHT = 80;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    ...shadows.topbar,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    width: 48,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    width: 56,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  icon: { fontSize: 18 },
  label: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelActive: { color: colors.primary700, fontWeight: '800' },
});
