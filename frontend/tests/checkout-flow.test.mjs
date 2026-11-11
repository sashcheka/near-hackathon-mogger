import assert from 'node:assert/strict';
import test from 'node:test';
import { CheckoutPaymentError, payCheckout } from '../src/checkoutFlow.ts';

function fixture() {
  const context = { accountId: 'buyer.testnet', token: 'token' };
  const items = ['first', 'second'].map((id) => ({ order_id: id, product_id: id, product_name: id,
    quantity: 1, unit_price_yocto: '2', total_yocto: '2', merchant_id: id,
    merchant_name: id, receiver_id: `${id}.testnet`, status: 'pending_payment' }));
  const checkout = { id: 'checkout', total_yocto: '4', budget_yocto: '5', items };
  const calls = [];
  const deps = {
    getCheckout: async () => structuredClone(checkout),
    getOrder: async (id) => {
      const item = items.find((entry) => entry.order_id === id);
      return { id, status: item.status, quantity: 1, unit_price_yocto: '2', total_yocto: '2',
        budget_yocto: '5', policy_error: '', payment: { network_id: 'testnet', asset: 'NEAR',
          amount_yocto: '2', receiver_id: item.receiver_id } };
    },
    readAttempt: () => null,
    startPayment: async ({ orderId }) => { calls.push(orderId); items.find((item) => item.order_id === orderId).status = 'paid'; },
  };
  const hooks = { active: () => true, onUpdate: () => {}, onProgress: () => {}, onPaid: () => {} };
  return { context, items, calls, deps, hooks };
}

test('preflights every item before any wallet request', async () => {
  const f = fixture();
  const original = f.deps.getOrder;
  f.deps.getOrder = async (id) => ({ ...await original(id), policy_error: id === 'second' ? 'policy_merchant' : '' });
  await assert.rejects(payCheckout('checkout', f.context, async () => '', f.hooks, f.deps),
    (error) => error instanceof CheckoutPaymentError && error.orderId === 'second');
  assert.deepEqual(f.calls, []);
});

test('stops after a failed payment and retries only unpaid items', async () => {
  const f = fixture();
  const original = f.deps.startPayment;
  f.deps.startPayment = async (ctx, ...args) => {
    if (ctx.orderId === 'second') throw new Error('Wallet canceled');
    return original(ctx, ...args);
  };
  await assert.rejects(payCheckout('checkout', f.context, async () => '', f.hooks, f.deps), /Wallet canceled/);
  assert.deepEqual(f.calls, ['first']);
  f.deps.startPayment = original;
  const result = await payCheckout('checkout', f.context, async () => '', f.hooks, f.deps);
  assert.deepEqual(f.calls, ['first', 'second']);
  assert.ok(result.items.every((item) => item.status === 'paid'));
});

test('an unresolved previous attempt stops the checkout before any transfer', async () => {
  const f = fixture();
  f.deps.readAttempt = (_account, id) => id === 'second' ? { hash: null } : null;
  await assert.rejects(payCheckout('checkout', f.context, async () => '', f.hooks, f.deps), /previous payment/);
  assert.deepEqual(f.calls, []);
});
