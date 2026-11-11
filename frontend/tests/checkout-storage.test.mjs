import assert from 'node:assert/strict';
import test from 'node:test';
import { clearCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from '../src/checkoutStorage.ts';

test('keeps the same checkout request for retries, scoped to the wallet', (t) => {
  const original = globalThis.localStorage;
  t.after(() => { globalThis.localStorage = original; });
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const draft = { id: '11111111-1111-4111-8111-111111111111', budget_yocto: '5',
    items: [{ product_id: 'paper', quantity: 1 }] };
  saveCheckoutDraft('buyer.testnet', draft);
  assert.deepEqual(readCheckoutDraft('buyer.testnet'), draft);
  assert.equal(readCheckoutDraft('other.testnet'), null);
  clearCheckoutDraft('buyer.testnet');
  assert.equal(readCheckoutDraft('buyer.testnet'), null);
});
