import { readAttempt, withPaymentLock } from './paymentState';

// Coordinate with payment requests in other tabs and preserve recovery data.
export async function cancelSafely<T>(account: string, ids: string[], cancel: () => Promise<T>): Promise<T> {
  const sorted = [...ids].sort();
  async function lock(index: number): Promise<T> {
    if (index === sorted.length) return cancel();
    const id = sorted[index];
    return withPaymentLock(account, id, () => {
      if (readAttempt(account, id))
        throw new Error('A payment needs checking before cancellation. Review the payment and your wallet history.');
      return lock(index + 1);
    });
  }
  return lock(0);
}
