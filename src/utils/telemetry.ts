// クラッシュレポート + 基本イベント送信の薄いラッパー。
//
// 現状: Expo Go では Sentry のネイティブモジュールが動かないので no-op。
// 本番化 (EAS Build / 開発ビルド):
//   1. `npx expo install @sentry/react-native`
//   2. app.json の plugins に "@sentry/react-native/expo" を追加
//   3. 下の SENTRY_DSN を実際の DSN に差し替え
//   4. 下の // import * as Sentry の行を有効化
//   5. App.tsx で `import { initTelemetry } from '@/utils/telemetry'; initTelemetry();` を呼ぶ
//      (現状は App.tsx で initTelemetry を呼んでおり、本番ビルドでも同じインターフェイスで動く)
//
// アプリコード側はこのモジュールの関数だけ使うので、本番化時の差分は
// 「import 行と SENTRY_DSN を埋める」のみ。

// import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = ''; // ← Sentry プロジェクト作成後に貼り付け

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;
  if (!SENTRY_DSN) {
    // 開発時 / Expo Go の場合
    if (__DEV__) {
      console.log('[telemetry] disabled (no DSN configured)');
    }
    return;
  }
  // Sentry.init({
  //   dsn: SENTRY_DSN,
  //   enableAutoSessionTracking: true,
  //   tracesSampleRate: 0.1,
  //   environment: __DEV__ ? 'development' : 'production',
  // });
}

/**
 * 例外を Sentry に送信。
 * 例: try { ... } catch (e) { captureException(e, { context: 'createSession' }); throw e; }
 */
export function captureException(e: unknown, extra?: Record<string, unknown>): void {
  if (__DEV__) {
    console.warn('[telemetry] exception', e, extra);
  }
  if (!SENTRY_DSN) return;
  // Sentry.captureException(e, { extra });
}

/**
 * 主要イベントを記録 (匿名化された使用統計)。
 * 例: trackEvent('session_created', { mode: 'both', resourceCount: 3 })
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log('[telemetry]', name, props);
  }
  if (!SENTRY_DSN) return;
  // Sentry.addBreadcrumb({
  //   category: 'event',
  //   message: name,
  //   data: props,
  //   level: 'info',
  // });
}
