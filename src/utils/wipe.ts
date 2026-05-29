import { getDb } from '../db/database';
import { deleteAllVideos } from './videoStorage';

/**
 * アプリ内の全ユーザーデータを削除する。
 *
 * 対象:
 *  - sessions / resources / tasks テーブル (FK の cascade で resources/tasks も連動)
 *  - app_state テーブル (オンボーディング閲覧フラグ等)
 *  - documentDirectory/videos/ 配下の動画ファイル
 *
 * Play Store のデータ削除ガイドラインに準拠するため、ユーザーが
 * 設定モーダルから明示的に同意した場合のみ呼ばれる前提。
 */
export async function wipeAllUserData(): Promise<void> {
  const db = await getDb();
  // テーブルの順番は FK CASCADE で sessions だけで十分だが、安全のため明示削除
  await db.execAsync(`
    DELETE FROM tasks;
    DELETE FROM resources;
    DELETE FROM sessions;
    DELETE FROM app_state;
  `);
  await deleteAllVideos();
}
