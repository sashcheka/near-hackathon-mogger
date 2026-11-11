import { useEffect, useState } from 'react';
import { getOrders } from './api';
import type { Order, Product } from './api';
import { fromYocto } from './amounts';

type Props = { token: string; products: Product[]; revision: number; onReview: (order: Order) => void };

export default function MyOrders({ token, products, revision, onReview }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getOrders(token).then(({ orders }) => {
      if (active) setOrders(orders);
    }).catch((error: Error) => {
      if (active) {
        setOrders([]);
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
    <p>20 most recent orders, newest first.</p>
    {loading && <p role="status">Loading your orders…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && orders.length === 0 && <p>No orders linked to this account yet.</p>}
    {orders.length > 0 && <ul className="orders-list">
      {orders.map((order) => <li key={order.id} className="order-item">
        <div className="order-item-header">
          <strong>{products.find((product) => product.id === order.product_id)?.name ?? order.product_id}</strong>
          <span className={`order-status ${order.status}`}>
            {order.status === 'paid' ? 'Paid' : 'Awaiting payment'}
          </span>
        </div>
        <small>Order: {order.id}</small>
        <dl className="order-metrics">
          <div><dt>Quantity</dt><dd>{order.quantity}</dd></div>
          <div><dt>Unit price</dt><dd>{fromYocto(order.unit_price_yocto)} test NEAR</dd></div>
          <div><dt>Total</dt><dd>{fromYocto(order.total_yocto)} test NEAR</dd></div>
        </dl>
        <button className="secondary-button" type="button" onClick={() => onReview(order)}>
          {order.status === 'paid' ? 'View' : 'Review & pay'}
        </button>
      </li>)}
    </ul>}
  </section>;
}
