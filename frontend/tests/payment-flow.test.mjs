import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPayment, resetUnknownPayment, startPayment } from '../src/paymentFlow.ts';
import { PaymentNotSent, readAttempt } from '../src/paymentState.ts';

const hash = 'A'.repeat(44);
const context = { orderId: 'order', accountId: 'buyer.testnet', token: 'token' };
const payment = { network_id: 'testnet', receiver_id: 'merchant.testnet', asset: 'NEAR', amount_yocto: '2' };
const originalOrder = { id: 'order', product_id: 'paper', quantity: 1, unit_price_yocto: '2',
  total_yocto: '2', budget_yocto: '3', status: 'pending_payment', payment };

function setup(t) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
  let locked = false;
  const locks = { request: async (_name, _options, callback) => {
    if (locked) return callback(null);
    locked = true;
    try { return await callback({}); } finally { locked = false; }
  } };
  const state = { order: structuredClone(originalOrder), pending: false, verifications: 0 };
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer token');
    if (url.endsWith('/verify-payment')) {
      ++state.verifications;
      assert.deepEqual(JSON.parse(options.body), { transaction_hash: hash });
      assert.equal(readAttempt('buyer.testnet', 'order', storage).hash, hash);
      if (state.pending) return new Response(JSON.stringify({ error: 'transaction_pending' }), { status: 202 });
      state.order.status = 'paid';
      return new Response(JSON.stringify({ verified: true, order_id: 'order', transaction_hash: hash,
        sender_id: 'buyer.testnet', network_id: 'testnet', order_status: 'paid' }));
    }
    assert.equal(url, '/api/orders/order');
    return new Response(JSON.stringify(state.order));
  };
  return { state, env: { storage, locks } };
}

test('records the attempt before wallet confirmation and verifies before clearing it', async (t) => {
  const { state, env } = setup(t);
  let sends = 0;
  const paid = await startPayment(context, payment, async (details) => {
    ++sends;
    assert.deepEqual(details, payment);
    assert.deepEqual(readAttempt('buyer.testnet', 'order', env.storage), { hash: null });
    return hash;
  }, env);
  assert.equal(paid.status, 'paid');
  assert.equal(sends, 1);
  assert.equal(state.verifications, 1);
  assert.equal(readAttempt('buyer.testnet', 'order', env.storage), null);
});

test('pending verification and reload retry the same hash without a second send', async (t) => {
  const { state, env } = setup(t);
  state.pending = true;
  let sends = 0;
  const send = async () => { ++sends; return hash; };
  await assert.rejects(startPayment(context, payment, send, env), /not finalized/);
  assert.equal(readAttempt('buyer.testnet', 'order', env.storage).hash, hash);
  state.pending = false;
  assert.equal((await startPayment(context, payment, send, env)).status, 'paid');
  assert.equal(sends, 1);
});

test('unknown wallet errors block another send until the user checks history', async (t) => {
  const { env } = setup(t);
  let sends = 0;
  const unknown = async () => { ++sends; throw new Error('Connection lost'); };
  await assert.rejects(startPayment(context, payment, unknown, env), /Connection lost/);
  await assert.rejects(startPayment(context, payment, unknown, env), /already started/);
  await assert.rejects(resetUnknownPayment(context, false, env), /First check/);
  assert.equal(sends, 1);
  await resetUnknownPayment(context, true, env);
  assert.equal(readAttempt('buyer.testnet', 'order', env.storage), null);
});

test('known cancellation clears the attempt without verifying or sending again', async (t) => {
  const { state, env } = setup(t);
  await assert.rejects(startPayment(context, payment, async () => {
    throw new PaymentNotSent('Canceled');
  }, env), /Canceled/);
  assert.equal(readAttempt('buyer.testnet', 'order', env.storage), null);
  assert.equal(state.verifications, 0);
});

test('a resumed hash can be checked without any wallet callback', async (t) => {
  const { env } = setup(t);
  assert.equal((await checkPayment(context, hash, env)).status, 'paid');
});
