import * as Crypto from 'expo-crypto';
import { TaskCategory, TaskElement } from '../types';
import { getDb } from './database';

interface TaskRow {
  id: string;
  session_id: string;
  resource_id: string;
  cycle_number: number;
  name: string;
  start_time_ms: number;
  end_time_ms: number;
  category: TaskCategory;
}

function rowToTask(row: TaskRow): TaskElement {
  return {
    id: row.id,
    sessionId: row.session_id,
    resourceId: row.resource_id,
    cycleNumber: row.cycle_number,
    name: row.name,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    category: row.category,
  };
}

export async function createTask(input: {
  sessionId: string;
  resourceId: string;
  cycleNumber: number;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  category: TaskCategory;
}): Promise<TaskElement> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO tasks (id, session_id, resource_id, cycle_number, name, start_time_ms, end_time_ms, category, waste_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.sessionId,
      input.resourceId,
      input.cycleNumber,
      input.name,
      input.startTimeMs,
      input.endTimeMs,
      input.category,
    ]
  );
  return {
    id,
    sessionId: input.sessionId,
    resourceId: input.resourceId,
    cycleNumber: input.cycleNumber,
    name: input.name,
    startTimeMs: input.startTimeMs,
    endTimeMs: input.endTimeMs,
    category: input.category,
  };
}

export async function listTasks(sessionId: string): Promise<TaskElement[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks WHERE session_id = ? ORDER BY cycle_number ASC, start_time_ms ASC`,
    [sessionId]
  );
  return rows.map(rowToTask);
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function updateTask(
  id: string,
  input: {
    name?: string;
    category?: TaskCategory;
    resourceId?: string;
    cycleNumber?: number;
  }
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name);
  }
  if (input.category !== undefined) {
    fields.push('category = ?');
    values.push(input.category);
  }
  if (input.resourceId !== undefined) {
    fields.push('resource_id = ?');
    values.push(input.resourceId);
  }
  if (input.cycleNumber !== undefined) {
    fields.push('cycle_number = ?');
    values.push(input.cycleNumber);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
}
