import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, verifyPayment } from '../src/api.ts';

const hash = 'A'.repeat(44);
const result = { verified: true, order_id: 'order', transaction_hash: hash,
  sender_id: 'buyer.testnet', network_id: 'testnet', order_status: 'paid' };

test('verification submits only the saved hash with the session token', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/orders/order/verify-payment');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.deepEqual(JSON.parse(options.body), { transaction_hash: hash });
    return new Response(JSON.stringify(result));
  };
  assert.deepEqual(await verifyPayment('order', 'token', hash), result);
});

test('HTTP 202 remains pending rather than successful', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'transaction_pending' }), { status: 202 });
  await assert.rejects(verifyPayment('order', 'token', hash), (error) =>
    error instanceof ApiError && error.status === 202 && error.code === 'transaction_pending');
});

test('incomplete or mismatched success cannot confirm payment', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const change of [{ verified: false }, { order_status: 'pending_payment' },
    { order_id: 'other' }, { transaction_hash: 'B'.repeat(44) }, { network_id: 'mainnet' }]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ ...result, ...change }));
    await assert.rejects(verifyPayment('order', 'token', hash), /did not confirm/);
  }
});
