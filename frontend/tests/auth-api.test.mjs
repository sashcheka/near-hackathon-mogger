import assert from 'node:assert/strict';
import test from 'node:test';
import { createPurchase, getAuthChallenge, getAuthSession, getOrder, getOrders, revokeSession, verifyWallet } from '../src/api.ts';

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
  await getAuthSession('token');
  assert.equal(calls[0].url, '/api/auth/challenge');
  assert.deepEqual(JSON.parse(calls[0].options.body), { account_id: 'buyer.testnet' });
  assert.equal(calls[1].url, '/api/auth/verify');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    nonce: 'nonce', public_key: 'ed25519:key', signature: 'signature',
  });
  assert.equal(calls[2].options.method, 'DELETE');
  assert.deepEqual(calls[2].options.headers, { Authorization: 'Bearer token' });
  assert.equal(calls[3].url, '/api/auth/session');
  assert.deepEqual(calls[3].options.headers, { Authorization: 'Bearer token' });
});

test('does not treat a rejected proof as an authenticated session', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'invalid_challenge' }), { status: 401 });
  await assert.rejects(verifyWallet('nonce', 'key', 'signature'), /expired or was already used/);
});

test('purchase uses the verified session header without a caller-selected buyer', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/purchase-requests');
    assert.equal(options.headers.Authorization, 'Bearer session-token');
    assert.deepEqual(JSON.parse(options.body), { prompt: 'Buy paper', budget_yocto: '3' });
    return new Response(JSON.stringify({ status: 'pending_payment' }), { status: 201 });
  };
  await createPurchase('Buy paper', '3', 'session-token');
});

test('order history uses the verified session without selecting a buyer in the URL', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/orders');
    assert.deepEqual(options.headers, { Authorization: 'Bearer session-token' });
    return new Response(JSON.stringify({ orders: [] }));
  };
  assert.deepEqual(await getOrders('session-token'), { orders: [] });
});

test('rejected history requests do not retry anonymously', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    ++calls;
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  };
  await assert.rejects(getOrders('expired-token'), /session expired/);
  assert.equal(calls, 1);
});

test('order review reloads the saved payment status using the session', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/orders/order-id');
    assert.deepEqual(options.headers, { Authorization: 'Bearer session-token' });
    return new Response(JSON.stringify({ id: 'order-id', status: 'paid' }));
  };
  assert.equal((await getOrder('order-id', 'session-token')).status, 'paid');
});
