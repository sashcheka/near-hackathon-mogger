import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSession, restoreSession, saveSession } from '../src/walletSession.ts';

const session = { token: 'A'.repeat(44), account_id: 'buyer.testnet', expires_in: 3600 };
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

test('reload checks the saved token with the backend without extending expiry', async () => {
  const saved = storage();
  const original = saveSession(session, saved, 1000);
  const restored = await restoreSession('buyer.testnet', async (token) => {
    assert.equal(token, session.token);
    return { account_id: 'buyer.testnet' };
  }, saved, () => 2000);
  assert.deepEqual(restored, original);
  assert.equal(restored.expires_at, 3601000);
});

test('a different wallet, expired session or signed-out tab cannot restore', async () => {
  const saved = storage();
  const check = () => { assert.fail('Backend must not be called'); };
  saveSession(session, saved, 1000);
  assert.equal(await restoreSession('other.testnet', check, saved, () => 2000), null);
  assert.equal(await restoreSession('buyer.testnet', check, saved, () => 3601000), null);
  clearSession(saved);
  assert.equal(await restoreSession('buyer.testnet', check, saved, () => 2000), null);
});

test('revoked tokens, backend outages and account mismatches stay unverified', async () => {
  const saved = storage();
  saveSession(session, saved, 1000);
  for (const check of [
    async () => { throw new Error('Unauthorized'); },
    async () => { throw new Error('Network unavailable'); },
    async () => ({ account_id: 'other.testnet' }),
  ]) assert.equal(await restoreSession('buyer.testnet', check, saved, () => 2000), null);
});

test('expiry is rechecked after the backend responds', async () => {
  const saved = storage();
  saveSession(session, saved, 1000);
  let now = 2000;
  const restored = await restoreSession('buyer.testnet', async () => {
    now = 3601000;
    return { account_id: 'buyer.testnet' };
  }, saved, () => now);
  assert.equal(restored, null);
});

test('blocked storage retains an in-memory login and does not break restoration', async () => {
  const blocked = {
    getItem() { throw new Error('Blocked'); },
    setItem() { throw new Error('Blocked'); },
    removeItem() { throw new Error('Blocked'); },
  };
  assert.equal(saveSession(session, blocked, 1000).token, session.token);
  clearSession(blocked);
  assert.equal(await restoreSession('buyer.testnet', async () => session, blocked), null);
});

test('damaged saved data cannot restore verification', async () => {
  for (const value of ['{', 'null', JSON.stringify({ ...session, expires_at: 'later' }),
    JSON.stringify({ ...session, token: 'short', expires_at: 3601000 })]) {
    const damaged = { getItem: () => value, setItem() {}, removeItem() {} };
    const check = () => { assert.fail('Backend must not be called'); };
    assert.equal(await restoreSession('buyer.testnet', check, damaged, () => 2000), null);
  }
});
