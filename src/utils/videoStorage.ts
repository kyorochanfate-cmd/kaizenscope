import * as Crypto from 'expo-crypto';
import * as LegacyFS from 'expo-file-system/legacy';

// expo-image-picker から返る URI はキャッシュなので、OS が掃除すると消える。
// アプリの documentDirectory/videos/<uuid>.<ext> にコピーして永続化する。

const VIDEOS_DIR_NAME = 'videos';
const VIDEOS_DIR = LegacyFS.documentDirectory + VIDEOS_DIR_NAME + '/';

function getExtension(uri: string): string {
  const cleaned = uri.split('?')[0].split('#')[0];
  const m = cleaned.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'mp4';
}

async function ensureVideosDir(): Promise<void> {
  await LegacyFS.makeDirectoryAsync(VIDEOS_DIR, { intermediates: true }).catch(() => {
    // already exists is OK
  });
}

/**
 * キャッシュ URI の動画ファイルを documentDirectory/videos/ にコピーし、
 * 永続的に参照可能な新 URI を返す。
 */
export async function persistVideo(srcUri: string): Promise<string> {
  await ensureVideosDir();
  const filename = `${Crypto.randomUUID()}.${getExtension(srcUri)}`;
  const destUri = VIDEOS_DIR + filename;
  await LegacyFS.copyAsync({ from: srcUri, to: destUri });
  return destUri;
}

/**
 * 保存した動画ファイルを削除する (セッション削除時に呼ぶ)。
 * アプリの videos/ ディレクトリ配下のファイルだけを削除する安全装置付き。
 */
export async function deleteVideo(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  if (!uri.startsWith(VIDEOS_DIR)) return; // 古いセッションやキャッシュ参照は対象外
  try {
    await LegacyFS.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort
  }
}

/**
 * 動画ファイルが実在するかチェック。古いセッション (キャッシュ URI のままで OS が掃除した) を
 * 開いたときの「真っ黒画面」事故を事前にユーザーに知らせるための判定。
 */
export async function videoExists(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFS.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * videos/ ディレクトリ配下の全ファイルを削除する。
 * 全データ削除フロー専用 (ユーザーが明示的に同意したときのみ呼ぶ)。
 */
export async function deleteAllVideos(): Promise<void> {
  try {
    await LegacyFS.deleteAsync(VIDEOS_DIR, { idempotent: true });
    await ensureVideosDir();
  } catch {
    // best-effort
  }
}
