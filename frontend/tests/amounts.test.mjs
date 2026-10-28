import assert from 'node:assert/strict';
import test from 'node:test';
import { fromYocto, toYocto } from '../src/amounts.ts';

test('preserves exact amounts beyond JavaScript number precision', () => {
  const values = ['3', '0.1', '0.000000000000000000000001',
    '999999999999999.999999999999999999999999'];
  for (const value of values) assert.equal(fromYocto(toYocto(value)), value);
  assert.equal(toYocto('3'), '3000000000000000000000000');
  assert.equal(toYocto('1.000'), '1000000000000000000000000');
});

test('rejects invalid budgets instead of rounding or accepting exponent notation', () => {
  for (const value of ['', '0', '0.0', '-1', '1e3', '01', '1,5', 'NaN',
    '0.0000000000000000000000001', '1000000000000000']) {
    assert.throws(() => toYocto(value));
  }
});
