import { useCallback, useEffect, useState } from 'react';
import { getAppState, setAppState } from '../db/appState';

const KEY = 'premium_purchased';

export async function isPremium(): Promise<boolean> {
  try {
    const v = await getAppState(KEY);
    return v === '1';
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────
// Module-level state + listener パターンで複数 hook 間を同期させる。
// 各画面が個別 useState を持つと、Settings で更新 → Charts に伝播しないという
// バグが起きるため、全 hook がここに subscribe して一斉に再レンダリングする。
// ───────────────────────────────────────────────
type Listener = (premium: boolean) => void;
let cached: boolean | null = null; // null = まだ DB から読んでない
let inFlightLoad: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

async function ensureLoaded(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!inFlightLoad) {
    inFlightLoad = isPremium().then((v) => {
      cached = v;
      inFlightLoad = null;
      notify();
      return v;
    });
  }
  return inFlightLoad;
}

function notify(): void {
  for (const l of listeners) {
    try {
      l(cached === true);
    } catch {
      // 個別 listener の例外で他を巻き込まない
    }
  }
}

export async function setPremiumPurchased(): Promise<void> {
  await setAppState(KEY, '1');
  cached = true;
  notify();
}

export async function clearPremiumPurchased(): Promise<void> {
  await setAppState(KEY, '0');
  cached = false;
  notify();
}

/**
 * 全画面共通の Pro 状態 hook。どこで toggle しても全 subscriber が同期する。
 */
export function usePremium() {
  const [premium, setPremium] = useState<boolean>(cached === true);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let mounted = true;
    listeners.add(setPremium);
    ensureLoaded().then((v) => {
      if (mounted) {
        setPremium(v);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      listeners.delete(setPremium);
    };
  }, []);

  const refresh = useCallback(async () => {
    cached = null; // DB から強制再読込
    const v = await ensureLoaded();
    setPremium(v);
  }, []);

  const purchase = useCallback(async () => {
    await setPremiumPurchased();
  }, []);

  return { premium, loading, refresh, purchase };
}
