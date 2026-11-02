import { getOrder, verifyPayment } from './api.ts';
import type { OrderDetails, PaymentDetails } from './api';
import { clearAttempt, isTransactionHash, payableDetails, PaymentNotSent, paymentStorage,
  readAttempt, saveAttempt, withPaymentLock } from './paymentState.ts';
import type { PaymentStorage } from './paymentState';

export type PaymentContext = { orderId: string; accountId: string; token: string };
type Environment = { storage: PaymentStorage; locks: Pick<LockManager, 'request'> | null | undefined };
const environment = (): Environment => ({ storage: paymentStorage(), locks: globalThis.navigator?.locks });

export class PaymentRecoveryError extends Error {
  readonly hash: string;
  constructor(hash: string) {
    super('Transfer submitted, but browser recovery could not be saved. Keep this hash and check payment.');
    this.hash = hash;
  }
}

function confirmed(context: PaymentContext, order: OrderDetails, storage: PaymentStorage) {
  if (order.id !== context.orderId || order.status !== 'paid')
    throw new Error('Payment is not confirmed. Check the same transfer again.');
  try { clearAttempt(context.accountId, context.orderId, storage); } catch { /* Backend is authoritative. */ }
  return order;
}

async function verify(context: PaymentContext, hash: string, storage: PaymentStorage) {
  const result = await verifyPayment(context.orderId, context.token, hash);
  if (result.sender_id !== context.accountId) throw new Error('Payment sender does not match the wallet.');
  return confirmed(context, await getOrder(context.orderId, context.token), storage);
}

export async function startPayment(context: PaymentContext, expected: PaymentDetails,
  send: (details: PaymentDetails) => Promise<string>, env = environment()) {
  return withPaymentLock(context.accountId, context.orderId, async () => {
    const order = await getOrder(context.orderId, context.token);
    if (order.id !== context.orderId) throw new Error('The service returned a different order.');
    if (order.status === 'paid') return confirmed(context, order, env.storage);
    const previous = readAttempt(context.accountId, context.orderId, env.storage);
    if (previous?.hash) return verify(context, previous.hash, env.storage);
    if (previous) throw new Error('A wallet request already started. Check wallet history before paying again.');
    const details = payableDetails(order);
    if (details.receiver_id !== expected.receiver_id || details.amount_yocto !== expected.amount_yocto)
      throw new Error('Payment details changed. Refresh and review the order before paying.');
    saveAttempt(context.accountId, context.orderId, { hash: null }, env.storage);
    let hash: string;
    try { hash = await send(details); } catch (error) {
      if (error instanceof PaymentNotSent) clearAttempt(context.accountId, context.orderId, env.storage);
      throw error;
    }
    if (!isTransactionHash(hash)) throw new Error('No transaction hash was returned. Check wallet history.');
    try { saveAttempt(context.accountId, context.orderId, { hash }, env.storage); } catch {
      throw new PaymentRecoveryError(hash);
    }
    return verify(context, hash, env.storage);
  }, env.locks);
}

export async function checkPayment(context: PaymentContext, hash: string, env = environment()) {
  if (!isTransactionHash(hash)) throw new Error('Enter the transaction hash from your wallet history.');
  return withPaymentLock(context.accountId, context.orderId, async () => {
    const order = await getOrder(context.orderId, context.token);
    if (order.status === 'paid') return confirmed(context, order, env.storage);
    let previous = null;
    try { previous = readAttempt(context.accountId, context.orderId, env.storage); } catch { /* Verification sends no funds. */ }
    if (previous?.hash && previous.hash !== hash) throw new Error('Check the saved transaction hash.');
    try { saveAttempt(context.accountId, context.orderId, { hash }, env.storage); } catch { /* Keep hash visible in UI. */ }
    return verify(context, hash, env.storage);
  }, env.locks);
}

export async function resetUnknownPayment(context: PaymentContext, noTransferConfirmed: boolean, env = environment()) {
  if (!noTransferConfirmed) throw new Error('First check that no transfer was sent in your wallet history.');
  return withPaymentLock(context.accountId, context.orderId, async () => {
    let previous = null;
    try { previous = readAttempt(context.accountId, context.orderId, env.storage); } catch { /* User checked wallet history. */ }
    if (previous?.hash) throw new Error('A submitted transfer must be checked before starting another.');
    const order = await getOrder(context.orderId, context.token);
    if (order.status === 'paid') return confirmed(context, order, env.storage);
    clearAttempt(context.accountId, context.orderId, env.storage);
    return null;
  }, env.locks);
}
