import { Platform } from 'react-native';
import {
  getAdFreeUntil,
  getLastInterstitialAt,
  markInterstitialShown,
  setAdFreeUntil,
} from './appState';
import { captureException } from './telemetry';

/**
 * AdMob 広告ユーティリティ。
 *
 * 設計方針:
 *  - Expo Go ではネイティブモジュールが無いので、すべての呼び出しを
 *    try/catch で no-op にして開発を止めない
 *  - __DEV__ では TestIds を使う(自分の端末で実広告を踏むと永久 BAN)
 *  - インタースティシャルは「最後の表示から MIN_INTER_GAP_MS 経過」+
 *    「ad-free 期間外」のときだけ表示
 *  - リワードは視聴完了で 1 時間 ad-free を付与
 */

const ANDROID_INTERSTITIAL_UNIT_ID = 'ca-app-pub-7673631103665099/8736327027';
const ANDROID_REWARDED_UNIT_ID = 'ca-app-pub-7673631103665099/1537024086';

/** インタースティシャルの最低間隔 (ms)。5 分。 */
const MIN_INTER_GAP_MS = 5 * 60 * 1000;
/** リワード視聴で付与する ad-free 時間 (ms)。1 時間。 */
const REWARD_AD_FREE_MS = 60 * 60 * 1000;

// SDK モジュールの動的ロード。Expo Go では失敗するので catch して null のまま。
let SDK: any = null;
let InterstitialAdCls: any = null;
let RewardedAdCls: any = null;
let AdEventTypeEnum: any = null;
let RewardedAdEventTypeEnum: any = null;
let TestIdsConst: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-google-mobile-ads');
  SDK = mod.default ?? mod;
  InterstitialAdCls = mod.InterstitialAd;
  RewardedAdCls = mod.RewardedAd;
  AdEventTypeEnum = mod.AdEventType;
  RewardedAdEventTypeEnum = mod.RewardedAdEventType;
  TestIdsConst = mod.TestIds;
} catch (e) {
  // Expo Go - 動かない
}

/**
 * テスト広告を使うべきか。
 *  - __DEV__ (Expo Go / development ビルド) は当然テスト
 *  - EXPO_PUBLIC_USE_TEST_ADS=1 (eas.json の preview プロファイルで設定) もテスト
 *
 * これにより preview ビルドでは本番 ID を使わず、必ず TestAd ラベル付きの
 * テスト広告だけが表示される → 自己クリックによる AdMob BAN を防止。
 * production プロファイルだけこのフラグを立てないので本物の広告が出る。
 */
const USE_TEST_ADS =
  __DEV__ || process.env.EXPO_PUBLIC_USE_TEST_ADS === '1';

function interstitialUnitId(): string {
  if (USE_TEST_ADS || !TestIdsConst) return TestIdsConst?.INTERSTITIAL ?? '';
  return Platform.OS === 'android' ? ANDROID_INTERSTITIAL_UNIT_ID : '';
}

function rewardedUnitId(): string {
  if (USE_TEST_ADS || !TestIdsConst) return TestIdsConst?.REWARDED ?? '';
  return Platform.OS === 'android' ? ANDROID_REWARDED_UNIT_ID : '';
}

let initialized = false;

export async function initAds(): Promise<void> {
  if (initialized || !SDK) return;
  try {
    // テスト広告モードのときは、実機を強制的にテストデバイス扱いにする。
    // (本番 ID を使う production でも、登録した端末では TestAd になる二重の保険)
    if (USE_TEST_ADS) {
      try {
        await SDK().setRequestConfiguration({
          testDeviceIdentifiers: ['EMULATOR'],
        });
      } catch {}
    }
    await SDK().initialize();
    initialized = true;
    // バックグラウンドで最初の広告をプリロードしておく
    preloadInterstitial();
  } catch (e) {
    captureException(e, { context: 'initAds' });
  }
}

// ─── インタースティシャル ───────────────────────────────

let interstitial: any = null;
let interstitialReady = false;

function preloadInterstitial(): void {
  if (!InterstitialAdCls || !AdEventTypeEnum) return;
  try {
    const unit = interstitialUnitId();
    if (!unit) return;
    interstitial = InterstitialAdCls.createForAdRequest(unit, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitial.addAdEventListener(AdEventTypeEnum.LOADED, () => {
      interstitialReady = true;
    });
    interstitial.addAdEventListener(AdEventTypeEnum.CLOSED, () => {
      interstitialReady = false;
      // 次の表示用にすぐ次をロード
      try {
        interstitial.load();
      } catch {}
    });
    interstitial.addAdEventListener(AdEventTypeEnum.ERROR, () => {
      interstitialReady = false;
    });
    interstitial.load();
  } catch (e) {
    captureException(e, { context: 'preloadInterstitial' });
  }
}

/**
 * 条件を満たすとインタースティシャル広告を表示する。
 * - ad-free 期間中は何もしない
 * - 直近 MIN_INTER_GAP_MS 以内に既に表示済みなら何もしない
 * - 広告がまだロードされていなければ何もしない
 *
 * Expo Go では常に no-op。
 */
export async function maybeShowInterstitial(): Promise<void> {
  if (!interstitial || !interstitialReady) return;
  try {
    const now = Date.now();
    const adFreeUntil = await getAdFreeUntil();
    if (now < adFreeUntil) return;
    const lastAt = await getLastInterstitialAt();
    if (now - lastAt < MIN_INTER_GAP_MS) return;
    await interstitial.show();
    await markInterstitialShown();
  } catch (e) {
    captureException(e, { context: 'maybeShowInterstitial' });
  }
}

// ─── リワード ─────────────────────────────────────────

/**
 * リワード広告を表示し、視聴完了時に 1 時間 ad-free を付与する。
 * 完了時に true、ロード/視聴失敗・キャンセル時に false を解決。
 *
 * Expo Go では常に { ok: false, reason: 'sdk_unavailable' }。
 */
export async function watchRewardedForAdFree(): Promise<{
  ok: boolean;
  reason?: 'sdk_unavailable' | 'load_failed' | 'closed_without_reward' | 'error';
}> {
  if (!RewardedAdCls || !RewardedAdEventTypeEnum || !AdEventTypeEnum) {
    return { ok: false, reason: 'sdk_unavailable' };
  }

  return new Promise((resolve) => {
    try {
      const unit = rewardedUnitId();
      if (!unit) {
        resolve({ ok: false, reason: 'sdk_unavailable' });
        return;
      }
      const rewarded = RewardedAdCls.createForAdRequest(unit, {
        requestNonPersonalizedAdsOnly: true,
      });
      let earned = false;
      let settled = false;
      const finish = (result: { ok: boolean; reason?: any }): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      rewarded.addAdEventListener(AdEventTypeEnum.LOADED, () => {
        try {
          rewarded.show();
        } catch {
          finish({ ok: false, reason: 'error' });
        }
      });
      rewarded.addAdEventListener(
        RewardedAdEventTypeEnum.EARNED_REWARD,
        async () => {
          earned = true;
          const until = Date.now() + REWARD_AD_FREE_MS;
          await setAdFreeUntil(until).catch(() => {});
        }
      );
      rewarded.addAdEventListener(AdEventTypeEnum.CLOSED, () => {
        finish(earned ? { ok: true } : { ok: false, reason: 'closed_without_reward' });
      });
      rewarded.addAdEventListener(AdEventTypeEnum.ERROR, () => {
        finish({ ok: false, reason: 'load_failed' });
      });
      rewarded.load();
    } catch (e) {
      captureException(e, { context: 'watchRewardedForAdFree' });
      resolve({ ok: false, reason: 'error' });
    }
  });
}

/** 現在 ad-free 期間中かどうか + 残り分(分)を返す */
export async function getAdFreeStatus(): Promise<{
  active: boolean;
  remainingMinutes: number;
}> {
  const until = await getAdFreeUntil();
  const remaining = Math.max(0, until - Date.now());
  return {
    active: remaining > 0,
    remainingMinutes: Math.ceil(remaining / 60000),
  };
}
