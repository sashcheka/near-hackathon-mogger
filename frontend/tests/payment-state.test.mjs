import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAttempt, payableDetails, paymentKey, readAttempt, saveAttempt,
  transferRequest, withPaymentLock } from '../src/paymentState.ts';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}

const payment = { network_id: 'testnet', receiver_id: 'merchant.testnet',
  asset: 'NEAR', amount_yocto: '2000000000000000000000001' };
const order = { status: 'pending_payment', payment, quantity: 1,
  unit_price_yocto: payment.amount_yocto, total_yocto: payment.amount_yocto,
  budget_yocto: '3000000000000000000000000' };

test('wallet request contains one exact native transfer on Testnet', () => {
  assert.deepEqual(transferRequest(payment, 'buyer.testnet'), {
    network: 'testnet', signerId: 'buyer.testnet', receiverId: 'merchant.testnet',
    actions: [{ type: 'Transfer', params: { deposit: '2000000000000000000000001' } }],
  });
});

test('recovers an unresolved wallet request and then its hash across component reloads', () => {
  const saved = storage();
  saveAttempt('buyer.testnet', 'order', { hash: null }, saved);
  assert.deepEqual(readAttempt('buyer.testnet', 'order', saved), { hash: null });
  saveAttempt('buyer.testnet', 'order', { hash: 'A'.repeat(44) }, saved);
  assert.equal(readAttempt('buyer.testnet', 'order', saved).hash, 'A'.repeat(44));
  assert.equal(readAttempt('other.testnet', 'order', saved), null);
  assert.equal(readAttempt('buyer.testnet', 'other', saved), null);
  clearAttempt('buyer.testnet', 'order', saved);
  assert.equal(readAttempt('buyer.testnet', 'order', saved), null);
});

test('corrupt payment recovery is never treated as an unused Pay button', () => {
  const saved = storage();
  for (const raw of ['{', 'null', '{}', '{"hash":"invalid"}', '{"hash":null,"extra":true}']) {
    saved.setItem(paymentKey('buyer', 'order'), raw);
    assert.throws(() => readAttempt('buyer', 'order', saved), /unreadable/);
  }
});

test('cash details remain exact and reject the wrong network, currency or amount', () => {
  assert.equal(payableDetails(order).amount_yocto, '2000000000000000000000001');
  for (const change of [{ network_id: 'mainnet' }, { asset: 'USDC' },
    { amount_yocto: '1' }, { receiver_id: 'system' }, { receiver_id: 'bad..testnet' }]) {
    assert.throws(() => payableDetails({ ...order, payment: { ...payment, ...change } }));
  }
  for (const change of [{ status: 'paid' }, { payment: null }, { total_yocto: '1e24' },
    { budget_yocto: '1' }, { quantity: 2 }, { unit_price_yocto: '1' },
    { total_yocto: '9'.repeat(39), payment: { ...payment, amount_yocto: '9'.repeat(39) } }]) {
    assert.throws(() => payableDetails({ ...order, ...change }));
  }
});

test('missing tab coordination or an occupied lock cannot start payment', async () => {
  const task = () => { assert.fail('Must not send'); };
  await assert.rejects(withPaymentLock('buyer', 'order', task, null), /supports payment coordination/);
  const occupied = { request: async (name, options, callback) => {
    assert.equal(name, paymentKey('buyer', 'order'));
    assert.deepEqual(options, { ifAvailable: true });
    return callback(null);
  } };
  await assert.rejects(withPaymentLock('buyer', 'order', task, occupied), /Another tab/);
});
