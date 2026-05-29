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
