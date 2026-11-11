import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBalance } from '../src/balance.ts';
import { getWalletBalance } from '../src/api.ts';

test('formats test NEAR without floating-point rounding or hiding tiny balances', () => {
  assert.equal(formatBalance('0'), '0');
  assert.equal(formatBalance('20000000000000000000000'), '0.02');
  assert.equal(formatBalance('2000245500818750000000000'), '≈ 2.000245');
  assert.equal(formatBalance('1'), '< 0.000001');
});

test('checks the returned account, network and amount', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let body = { account_id: 'buyer.testnet', network_id: 'testnet', amount_yocto: '123' };
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/wallets/buyer.testnet/balance');
    return new Response(JSON.stringify(body));
  };
  assert.equal(await getWalletBalance('buyer.testnet'), '123');
  for (const change of [{ account_id: 'other.testnet' }, { network_id: 'mainnet' },
    { amount_yocto: '01' }, { amount_yocto: 123 }]) {
    body = { account_id: 'buyer.testnet', network_id: 'testnet', amount_yocto: '123', ...change };
    await assert.rejects(getWalletBalance('buyer.testnet'), /could not be verified/);
  }
});
