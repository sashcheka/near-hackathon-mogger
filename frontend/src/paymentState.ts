import type { OrderDetails, PaymentDetails } from './api';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';

export type Attempt = { hash: string | null };
export type PaymentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class PaymentNotSent extends Error {}

export function transferRequest(payment: PaymentDetails, signerId: string): SignAndSendTransactionParams {
  return { network: 'testnet', signerId, receiverId: payment.receiver_id,
    actions: [{ type: 'Transfer', params: { deposit: payment.amount_yocto } }] };
}

export function isTransactionHash(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export function paymentKey(account: string, orderId: string) {
  return `community-treasury:testnet:payment:${account}:${orderId}`;
}

export function paymentStorage(): PaymentStorage {
  try { return window.localStorage; } catch {
    throw new Error('Enable browser storage before paying so the transfer can be recovered.');
  }
}

export function readAttempt(account: string, id: string, storage = paymentStorage()): Attempt | null {
  const raw = storage.getItem(paymentKey(account, id));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value && Object.keys(value).length === 1 &&
      (value.hash === null || isTransactionHash(value.hash))) return { hash: value.hash };
  } catch { /* Damaged recovery data must never enable another transfer. */ }
  throw new Error('Payment recovery data is unreadable. Check your wallet history before continuing.');
}

export function saveAttempt(account: string, id: string, attempt: Attempt, storage = paymentStorage()) {
  const value = JSON.stringify(attempt);
  storage.setItem(paymentKey(account, id), value);
  if (storage.getItem(paymentKey(account, id)) !== value)
    throw new Error('Payment recovery could not be saved. Check browser storage permissions.');
}

export function clearAttempt(account: string, id: string, storage = paymentStorage()) {
  storage.removeItem(paymentKey(account, id));
}

export function payableDetails(order: OrderDetails): PaymentDetails {
  const payment = order.payment;
  const amount = (value: unknown) => typeof value === 'string' && /^[1-9][0-9]{0,38}$/.test(value);
  if (order.status !== 'pending_payment' || !payment || payment.network_id !== 'testnet' ||
    payment.asset !== 'NEAR' || payment.amount_yocto !== order.total_yocto ||
    !amount(order.total_yocto) || !amount(order.unit_price_yocto) || !amount(order.budget_yocto) ||
    !Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 1000 ||
    BigInt(order.total_yocto) > (1n << 128n) - 1n ||
    BigInt(order.total_yocto) > BigInt(order.budget_yocto) ||
    BigInt(order.unit_price_yocto) * BigInt(order.quantity) !== BigInt(order.total_yocto) ||
    typeof payment.receiver_id !== 'string' || payment.receiver_id.length < 2 ||
    payment.receiver_id.length > 64 || payment.receiver_id === 'system' ||
    !/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(payment.receiver_id))
    throw new Error('This order has invalid or missing Testnet payment details. Refresh the order.');
  return payment;
}

export async function withPaymentLock<T>(account: string, id: string, task: () => Promise<T>,
  locks: Pick<LockManager, 'request'> | null | undefined = globalThis.navigator?.locks): Promise<T> {
  if (!locks) throw new Error('Use a current browser that supports payment coordination between tabs.');
  return locks.request(paymentKey(account, id), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('Another tab is already handling this payment. Check it before continuing.');
    return task();
  });
}
