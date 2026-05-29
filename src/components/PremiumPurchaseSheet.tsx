import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { setPremiumPurchased } from '../utils/premium';
import { trackEvent } from '../utils/telemetry';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
}

// 表示用の価格 (実価格は Play Console / App Store Connect の商品設定で決まる)
const DISPLAY_PRICE = '¥980';
const PRODUCT_ID = 'genba_ie_pro_unlock'; // Play Console と一致させる予定

/**
 * 買い切り型「Pro 版」購入シート。
 *
 * 現状: モック (`mockPurchase`) — Expo Go でそのまま動く。
 * 本番化:
 *   1. `npx expo install react-native-iap`
 *   2. Play Console で `PRODUCT_ID` をマネージドプロダクト (一回限り) として登録
 *   3. EAS Build で開発ビルドを作る
 *   4. ここで `RNIap.initConnection()` → `RNIap.getProducts({ skus: [PRODUCT_ID] })`
 *      → `RNIap.requestPurchase({ sku: PRODUCT_ID })` → 完了時 `setPremiumPurchased()` 呼ぶ
 *   5. アプリ起動時に `getAvailablePurchases()` でリストア判定
 */
async function mockPurchase(): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 1200));
  return true;
}

export default function PremiumPurchaseSheet({ visible, onClose, onPurchased }: Props) {
  const [loading, setLoading] = useState(false);

  const onBuy = async () => {
    setLoading(true);
    try {
      const ok = await mockPurchase();
      if (ok) {
        await setPremiumPurchased();
        trackEvent('pro_purchased', { source: 'modal' });
        onPurchased();
      }
    } finally {
      setLoading(false);
    }
  };

  const onRestore = async () => {
    // 本番では RNIap.getAvailablePurchases() を呼んで過去購入があれば setPremiumPurchased。
    // 今はモックなので何もしない。
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={loading ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.icon}>✨</Text>
          <Text style={styles.title}>Pro 版にアップグレード</Text>
          <Text style={styles.subtitle}>{DISPLAY_PRICE} 買い切り ・ 月額課金なし</Text>

          <View style={styles.featureBox}>
            <Text style={styles.featureHead}>解放される機能</Text>
            <Feature icon="🚫" text="広告を非表示" />
            <Feature icon="📤" text="Excel レポート出力" />
            <Feature icon="💻" text="PC への送信 (メール / クラウド)" />
            <Feature icon="📊" text="複数シートで詳細データ" />
            <Feature icon="💡" text="改善ポイント分析" />
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>処理中...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.buyBtn} onPress={onBuy}>
                <Text style={styles.buyBtnText}>{DISPLAY_PRICE} で購入</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.restoreBtn} onPress={onRestore}>
                <Text style={styles.restoreText}>購入を復元</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancel} onPress={onClose}>
                <Text style={styles.cancelText}>あとで</Text>
              </TouchableOpacity>
            </>
          )}
          <Text style={styles.devNote}>
            ※ 現在は開発デモ版。実際の課金フローは Play Store 公開時に動作します
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  icon: { fontSize: 42, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  featureBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 18,
    gap: 8,
  },
  featureHead: { fontSize: 12, color: '#1e3a8a', fontWeight: '800', marginBottom: 2 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: { fontSize: 18 },
  featureText: { fontSize: 14, color: '#1e40af', fontWeight: '600' },
  buyBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  buyBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  restoreBtn: { marginTop: 8, paddingVertical: 10 },
  restoreText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  cancel: { marginTop: 4, paddingVertical: 8 },
  cancelText: { color: '#9ca3af', fontSize: 13 },
  loadingBox: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  loadingText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  devNote: {
    marginTop: 14,
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
