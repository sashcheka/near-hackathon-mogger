import type { AuthSession } from './api';

export type SavedSession = AuthSession & { expires_at: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'community-treasury:testnet:session';

function browserStorage(): StorageLike | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function clearSession(storage = browserStorage()) {
  try { storage?.removeItem(key); } catch { /* Storage may be disabled. */ }
}

export function saveSession(session: AuthSession, storage = browserStorage(), now = Date.now()) {
  const saved: SavedSession = { ...session, expires_at: now + session.expires_in * 1000 };
  try { storage?.setItem(key, JSON.stringify(saved)); } catch { /* Keep the in-memory session. */ }
  return saved;
}

export async function restoreSession(
  accountId: string,
  check: (token: string) => Promise<{ account_id: string }>,
  storage = browserStorage(),
  now = Date.now,
): Promise<SavedSession | null> {
  try {
    const saved: SavedSession = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!saved || saved.account_id !== accountId || typeof saved.token !== 'string' ||
      saved.token.length !== 44 || !Number.isFinite(saved.expires_at) ||
      saved.expires_at <= now()) return null;
    const current = await check(saved.token);
    return current.account_id === accountId && saved.expires_at > now() ? saved : null;
  } catch {
    return null;
  }
}
