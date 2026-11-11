import { useEffect, useState } from 'react';
import { getCheckouts, getOrders } from './api';
import type { Checkout, Order, Product } from './api';
import { fromYocto } from './amounts';

type Props = { token: string; products: Product[]; revision: number; onReview: (order: Order) => void;
  onCheckout: (checkout: Checkout) => void };

export default function MyOrders({ token, products, revision, onReview, onCheckout }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getOrders(token), getCheckouts(token)]).then(([orders, checkouts]) => {
      if (active) { setOrders(orders.orders); setCheckouts(checkouts.checkouts); }
    }).catch((error: Error) => {
      if (active) {
        setOrders([]);
        setCheckouts([]);
        setError(error.message);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision, refresh]);

  return <section aria-labelledby="my-orders-title" aria-busy={loading}>
    <div className="wallet-controls">
      <h2 id="my-orders-title">My orders</h2>
      <button type="button" disabled={loading} onClick={() => setRefresh(refresh + 1)}>
        Refresh
      </button>
    </div>
    <p>Up to 20 recent orders of each type, newest first.</p>
    {loading && <p role="status">Loading your orders…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && orders.length === 0 && checkouts.length === 0 && <p>No orders linked to this account yet.</p>}
    {checkouts.length > 0 && <ul className="orders-list">
      {checkouts.map((checkout) => {
        const paid = checkout.items.filter((item) => item.status === 'paid').length;
        return <li key={checkout.id} className="order-item">
          <div className="order-summary"><div className="order-product">
            <strong>Store order</strong><small>{checkout.items.length} items · {new Set(checkout.items.map((item) => item.merchant_id)).size} merchants</small>
          </div><div className="order-total"><small>Total</small><strong>{fromYocto(checkout.total_yocto)} test NEAR</strong></div></div>
          <div className="order-footer"><div className="order-meta">
            <span className={`order-status ${paid === checkout.items.length ? 'paid' : ''}`}>
              {paid === checkout.items.length ? 'Paid' : checkout.items.every((item) => item.status === 'cancelled')
                ? 'Cancelled' : `${paid} of ${checkout.items.length} payments confirmed`}
            </span><small>Order {checkout.id}</small>
          </div><button className="secondary-button order-action" type="button" onClick={() => onCheckout(checkout)}>View order</button></div>
        </li>;
      })}
    </ul>}
    {orders.length > 0 && <ul className="orders-list">
      {orders.map((order) => <li key={order.id} className="order-item">
        <div className="order-summary">
          <div className="order-product">
            <strong>{products.find((product) => product.id === order.product_id)?.name ?? order.product_id}</strong>
            <small>Qty {order.quantity} · {fromYocto(order.unit_price_yocto)} test NEAR each</small>
          </div>
          <div className="order-total">
            <small>Total</small>
            <strong>{fromYocto(order.total_yocto)} test NEAR</strong>
          </div>
        </div>
        <div className="order-footer">
          <div className="order-meta">
            <span className={`order-status ${order.status}`}>
              {order.status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Cancelled' : 'Awaiting payment'}
            </span>
            <small>Order {order.id}</small>
          </div>
          <button className="secondary-button order-action" type="button" onClick={() => onReview(order)}>
            {order.status === 'pending_payment' ? 'Review & pay' : 'View order'}
          </button>
        </div>
      </li>)}
    </ul>}
  </section>;
}
