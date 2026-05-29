import * as Crypto from 'expo-crypto';
import { Resource, ResourceType } from '../types';
import { getDb } from './database';

interface ResourceRow {
  id: string;
  session_id: string;
  name: string;
  type: ResourceType;
  order_index: number;
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    type: row.type,
    orderIndex: row.order_index,
  };
}

export async function createResource(input: {
  sessionId: string;
  name: string;
  type: ResourceType;
}): Promise<Resource> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const max = await db.getFirstAsync<{ max_order: number | null }>(
    `SELECT MAX(order_index) AS max_order FROM resources WHERE session_id = ?`,
    [input.sessionId]
  );
  const orderIndex = (max?.max_order ?? -1) + 1;
  await db.runAsync(
    `INSERT INTO resources (id, session_id, name, type, order_index)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.sessionId, input.name, input.type, orderIndex]
  );
  return { id, sessionId: input.sessionId, name: input.name, type: input.type, orderIndex };
}

export async function listResources(sessionId: string): Promise<Resource[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ResourceRow>(
    `SELECT * FROM resources WHERE session_id = ? ORDER BY order_index ASC`,
    [sessionId]
  );
  return rows.map(rowToResource);
}

export async function deleteResource(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM resources WHERE id = ?`, [id]);
}

export async function renameResource(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE resources SET name = ? WHERE id = ?`, [name, id]);
}
