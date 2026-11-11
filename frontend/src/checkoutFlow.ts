import { getCheckout, getOrder } from './api.ts';
import type { Checkout, CheckoutItem, PaymentDetails } from './api';
import { startPayment } from './paymentFlow.ts';
import { payableDetails, readAttempt } from './paymentState.ts';

type Context = { accountId: string; token: string };
type Hooks = { active: () => boolean; onUpdate: (checkout: Checkout) => void;
  onProgress: (merchant: string) => void; onPaid: () => void };
type Dependencies = { getCheckout: typeof getCheckout; getOrder: typeof getOrder;
  startPayment: typeof startPayment; readAttempt: typeof readAttempt };
const dependencies: Dependencies = { getCheckout, getOrder, startPayment, readAttempt };

export class CheckoutPaymentError extends Error {
  constructor(message: string, readonly orderId: string) { super(message); }
}

export async function payCheckout(id: string, context: Context, send: (details: PaymentDetails) => Promise<string>,
  hooks: Hooks, deps: Dependencies = dependencies): Promise<Checkout> {
  let currentId = '';
  async function refresh() {
    const checkout = await deps.getCheckout(context.token, id);
    if (checkout.id !== id) throw new Error('The service returned a different order.');
    if (hooks.active()) hooks.onUpdate(checkout);
    return checkout;
  }
  try {
    const latest = await refresh();
    const prepared: { item: CheckoutItem; details: PaymentDetails }[] = [];
    for (const item of latest.items.filter((entry) => entry.status !== 'paid')) {
      currentId = item.order_id;
      const order = await deps.getOrder(item.order_id, context.token);
      if (order.id !== item.order_id) throw new Error('The service returned a different payment.');
      if (order.status === 'paid') continue;
      if (deps.readAttempt(context.accountId, item.order_id))
        throw new Error('A previous payment needs checking before another transfer.');
      const details = payableDetails(order);
      if (details.receiver_id !== item.receiver_id || details.amount_yocto !== item.total_yocto)
        throw new Error('Payment details changed. Refresh and review the order.');
      prepared.push({ item, details });
    }
    for (const { item, details } of prepared) {
      if (!hooks.active()) throw new Error('Payment stopped. Review the order before continuing.');
      currentId = item.order_id;
      hooks.onProgress(item.merchant_name);
      await deps.startPayment({ orderId: item.order_id, accountId: context.accountId, token: context.token }, details, send);
      if (!hooks.active()) throw new Error('Payment stopped. Review the order before continuing.');
      hooks.onPaid();
      await refresh();
    }
    return await refresh();
  } catch (error) {
    throw new CheckoutPaymentError(error instanceof Error ? error.message : 'Payment could not be completed.', currentId);
  }
}
