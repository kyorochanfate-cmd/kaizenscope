import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

const DB_NAME = 'genba_ie.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(sessions)`);
  if (!cols.some((c) => c.name === 'mode')) {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'person'`);
  }
  if (!cols.some((c) => c.name === 'parent_session_id')) {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN parent_session_id TEXT`);
  }
  if (!cols.some((c) => c.name === 'hourly_rate_yen')) {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN hourly_rate_yen REAL`);
  }
  if (!cols.some((c) => c.name === 'cycles_per_day')) {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN cycles_per_day INTEGER`);
  }
  if (!cols.some((c) => c.name === 'working_days_per_year')) {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN working_days_per_year INTEGER`);
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA_SQL);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  await getDb();
}
