import * as Crypto from 'expo-crypto';
import { AnalysisMode, AnalysisSession } from '../types';
import { getDb } from './database';

interface SessionRow {
  id: string;
  name: string;
  video_uri: string;
  fps: number;
  duration_ms: number;
  tact_time_sec: number;
  mode: AnalysisMode;
  parent_session_id: string | null;
  hourly_rate_yen: number | null;
  cycles_per_day: number | null;
  working_days_per_year: number | null;
  created_at: number;
}

function rowToSession(row: SessionRow): AnalysisSession {
  return {
    id: row.id,
    name: row.name,
    videoUri: row.video_uri,
    fps: row.fps,
    durationMs: row.duration_ms,
    tactTimeSec: row.tact_time_sec,
    mode: row.mode,
    parentSessionId: row.parent_session_id ?? null,
    hourlyRateYen: row.hourly_rate_yen ?? null,
    cyclesPerDay: row.cycles_per_day ?? null,
    workingDaysPerYear: row.working_days_per_year ?? null,
    createdAt: row.created_at,
  };
}

export async function createSession(input: {
  name: string;
  videoUri: string;
  fps: number;
  durationMs: number;
  tactTimeSec?: number;
  mode: AnalysisMode;
  parentSessionId?: string | null;
}): Promise<AnalysisSession> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = Date.now();
  const tactTimeSec = input.tactTimeSec ?? 60;
  const parentSessionId = input.parentSessionId ?? null;
  await db.runAsync(
    `INSERT INTO sessions (id, name, video_uri, fps, duration_ms, tact_time_sec, mode, parent_session_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.videoUri, input.fps, input.durationMs, tactTimeSec, input.mode, parentSessionId, createdAt]
  );
  return {
    id,
    name: input.name,
    videoUri: input.videoUri,
    fps: input.fps,
    durationMs: input.durationMs,
    tactTimeSec,
    mode: input.mode,
    parentSessionId,
    hourlyRateYen: null,
    cyclesPerDay: null,
    workingDaysPerYear: null,
    createdAt,
  };
}

export async function updateCostParams(
  id: string,
  params: {
    hourlyRateYen: number | null;
    cyclesPerDay: number | null;
    workingDaysPerYear: number | null;
  }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sessions SET hourly_rate_yen = ?, cycles_per_day = ?, working_days_per_year = ? WHERE id = ?`,
    [params.hourlyRateYen, params.cyclesPerDay, params.workingDaysPerYear, id]
  );
}

export async function listSessions(): Promise<AnalysisSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions ORDER BY created_at DESC`
  );
  return rows.map(rowToSession);
}

export async function getSession(id: string): Promise<AnalysisSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE id = ?`,
    [id]
  );
  return row ? rowToSession(row) : null;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sessions WHERE id = ?`, [id]);
}

export async function updateTactTime(id: string, tactTimeSec: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sessions SET tact_time_sec = ? WHERE id = ?`,
    [tactTimeSec, id]
  );
}

export async function renameSession(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sessions SET name = ? WHERE id = ?`, [name, id]);
}

export async function updateFps(id: string, fps: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sessions SET fps = ? WHERE id = ?`, [fps, id]);
}

export async function updateMode(id: string, mode: AnalysisMode): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sessions SET mode = ? WHERE id = ?`, [mode, id]);
}
