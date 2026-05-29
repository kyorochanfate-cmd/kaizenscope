import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme';

/**
 * 画面下/上端などに置く広告枠。
 *
 * 現状: モック (Expo Go で動かすため)。
 * 本番化:
 *   1. `npx expo install react-native-google-mobile-ads`
 *   2. app.json の plugins に android/iosAppId を設定
 *   3. EAS Build で開発ビルドを作る (Expo Go では使えなくなる)
 *   4. 下の `MockAd` を以下に置き換える:
 *
 *      import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
 *      <BannerAd
 *        unitId={__DEV__ ? TestIds.BANNER : 'ca-app-pub-XXX/YYY'}
 *        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
 *      />
 *
 *   5. (任意) インタースティシャル / リワード広告も同じ要領で
 */
export default function BannerAdSlot() {
  // v1 では全ユーザーに広告(モック)を表示。AdMob 実装時にここを差し替える。
  return <MockAd />;
}

function MockAd() {
  return (
    <View style={styles.adBox}>
      <View style={styles.adTag}>
        <Text style={styles.adTagText}>AD</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.adTitle}>ここに広告が表示されます</Text>
        <Text style={styles.adSub}>(モック表示・実広告は後日)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  adBox: {
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adTag: {
    backgroundColor: colors.accent500,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  adTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.8,
  },
  adTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  adSub: { fontSize: 10, color: colors.textDim, marginTop: 2 },
});
