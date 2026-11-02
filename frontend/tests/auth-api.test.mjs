import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthChallenge, revokeSession, verifyWallet } from '../src/api.ts';

test('requests a challenge for the selected account and submits only the signed proof', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true }));
  };
  await getAuthChallenge('buyer.testnet');
  await verifyWallet('nonce', 'ed25519:key', 'signature');
  await revokeSession('token');
  assert.equal(calls[0].url, '/api/auth/challenge');
  assert.deepEqual(JSON.parse(calls[0].options.body), { account_id: 'buyer.testnet' });
  assert.equal(calls[1].url, '/api/auth/verify');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    nonce: 'nonce', public_key: 'ed25519:key', signature: 'signature',
  });
  assert.equal(calls[2].options.method, 'DELETE');
  assert.deepEqual(calls[2].options.headers, { Authorization: 'Bearer token' });
});

test('does not treat a rejected proof as an authenticated session', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'invalid_challenge' }), { status: 401 });
  await assert.rejects(verifyWallet('nonce', 'key', 'signature'), /expired or was already used/);
});
