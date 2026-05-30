import { getDb } from '../db/database';

/**
 * app_state テーブル(SQLite)を使った key-value ストア。
 * AsyncStorage を新規導入せず、既存 DB に相乗りする方針。
 */

async function get(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    `SELECT value FROM app_state WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

async function set(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

const KEY_ONBOARDED = 'onboarded_at';
const KEY_AD_FREE_UNTIL = 'ad_free_until';
const KEY_LAST_INTERSTITIAL_AT = 'last_interstitial_at';

export async function hasSeenOnboarding(): Promise<boolean> {
  const v = await get(KEY_ONBOARDED);
  return v != null;
}

export async function markOnboardingSeen(): Promise<void> {
  await set(KEY_ONBOARDED, String(Date.now()));
}

/** デバッグ用: オンボーディング再表示 */
export async function resetOnboarding(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM app_state WHERE key = ?`, [KEY_ONBOARDED]);
}

// ─── 広告関連 ───────────────────────────────────────────

/** 広告非表示期間の終了時刻 (epoch ms)。0 なら未設定 */
export async function getAdFreeUntil(): Promise<number> {
  const v = await get(KEY_AD_FREE_UNTIL);
  return v ? Number(v) : 0;
}

/** リワード視聴等で広告非表示期間を付与 */
export async function setAdFreeUntil(epochMs: number): Promise<void> {
  await set(KEY_AD_FREE_UNTIL, String(epochMs));
}

/** 最後にインタースティシャルを表示した時刻 (頻度キャップ用) */
export async function getLastInterstitialAt(): Promise<number> {
  const v = await get(KEY_LAST_INTERSTITIAL_AT);
  return v ? Number(v) : 0;
}

export async function markInterstitialShown(): Promise<void> {
  await set(KEY_LAST_INTERSTITIAL_AT, String(Date.now()));
}
