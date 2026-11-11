import { useEffect, useRef, useState } from 'react';
import { cancelCheckout, cancelOrder, getCheckout } from './api';
import type { Checkout, CheckoutItem } from './api';
import { fromYocto } from './amounts';
import { CheckoutPaymentError, payCheckout } from './checkoutFlow';
import { useWallet } from './WalletProvider';
import { cancelSafely } from './cancelFlow';

type Props = { checkout: Checkout; accountId: string; token: string;
  onUpdate: (checkout: Checkout) => void; onReview: (item: CheckoutItem) => void; onPaid: () => void };

export default function CheckoutDetails({ checkout, accountId, token, onUpdate, onReview, onPaid }: Props) {
  const { sendTransfer, busy: walletBusy } = useWallet();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const merchants = [...new Map(checkout.items.map((item) => [item.merchant_id, item.merchant_name])).entries()];
  const unpaid = checkout.items.filter((item) => item.status === 'pending_payment');
  const remaining = unpaid.reduce((sum, item) => sum + BigInt(item.total_yocto), 0n).toString();

  async function cancel(item?: CheckoutItem) {
    if (inFlight.current || walletBusy) return;
    const ids = item ? [item.order_id] : unpaid.map((entry) => entry.order_id);
    if (!ids.length || !window.confirm('Cancel the unpaid item(s)? Check your wallet first: a submitted transfer can still be confirmed.')) return;
    inFlight.current = true;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await cancelSafely(accountId, ids, async () => {
        if (item) await cancelOrder(token, item.order_id);
        else await cancelCheckout(token, checkout.id);
      });
      await refresh();
      setMessage('Cancellation saved. Already submitted transfers can still be checked.');
      onPaid();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cancellation failed.');
      await refresh().catch(() => {});
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }

  async function refresh() {
    const updated = await getCheckout(token, checkout.id);
    if (active.current) onUpdate(updated);
    return updated;
  }

  async function payAll() {
    if (inFlight.current || walletBusy) return;
    inFlight.current = true;
    setWorking(true);
    setError('');
    setProblem('');
    setMessage('');
    try {
      const updated = await payCheckout(checkout.id, { accountId, token }, sendTransfer, {
        active: () => active.current,
        onUpdate,
        onProgress: (merchant) => setMessage(`Confirm payment to ${merchant} in your wallet.`),
        onPaid,
      });
      if (active.current) setMessage(updated.items.some((item) => item.status === 'pending_payment')
        ? 'Some items are still awaiting payment.' : 'All remaining payments confirmed.');
    } catch (reason) {
      if (active.current) {
        setMessage('');
        setProblem(reason instanceof CheckoutPaymentError ? reason.orderId : '');
        setError(reason instanceof Error ? reason.message : 'Payment could not be completed.');
        await refresh().catch(() => {});
      }
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }

  return <section aria-labelledby="checkout-title" aria-busy={working}>
    <div className="wallet-controls"><div><h2 id="checkout-title">Order summary</h2>
      <small>Order {checkout.id}</small></div>
      <button className="secondary-button" type="button" disabled={working} onClick={() => {
        void refresh().catch((reason: Error) => setError(reason.message));
      }}>Refresh</button></div>
    <p>Remaining: <strong>{fromYocto(remaining)} test NEAR</strong> · Original total: {fromYocto(checkout.total_yocto)} test NEAR · Budget: {fromYocto(checkout.budget_yocto)} test NEAR</p>
    <ul className="orders-list">
      {merchants.map(([id, name]) => <li className="order-item" key={id}>
        <h3>{name}</h3>
        {checkout.items.filter((item) => item.merchant_id === id).map((item) => <div className="checkout-item" key={item.order_id}>
          <div className="checkout-product"><strong title={item.product_name} tabIndex={0}>{item.product_name}</strong><small>Qty {item.quantity} · {fromYocto(item.unit_price_yocto)} test NEAR each</small>
            <small>To {item.receiver_id}</small></div>
          <div className="order-total"><strong>{fromYocto(item.total_yocto)} test NEAR</strong>
            <span className={`order-status ${item.status}`}>{item.status === 'paid' ? 'Paid' : item.status === 'cancelled' ? 'Cancelled' : 'Awaiting payment'}</span></div>
          <div className="checkout-actions">
            <button type="button" className="secondary-button order-action" disabled={working}
              onClick={() => onReview(item)}>{item.status === 'paid' ? 'View payment' : item.status === 'cancelled' ? 'Check payment' : 'Review payment'}</button>
            {item.status === 'pending_payment' && <button type="button" className="secondary-button order-action"
              disabled={working || walletBusy} onClick={() => { void cancel(item); }}>Cancel item</button>}
          </div>
        </div>)}
      </li>)}
    </ul>
    {unpaid.length > 0 && <div className="cart-checkout">
      <p>Each item is a separate Testnet transfer. Your wallet will ask you to confirm each payment.</p>
      <button type="button" disabled={working || walletBusy} onClick={() => { void payAll(); }}>
        {working ? 'Processing payments…' : 'Pay remaining items'}
      </button>
      {!checkout.items.some((item) => item.status === 'paid') && <button className="secondary-button" type="button"
        disabled={working || walletBusy} onClick={() => { void cancel(); }}>Cancel order</button>}
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}{problem && ' Open Review payment for that item to check or recover it.'}</p>}
  </section>;
}
