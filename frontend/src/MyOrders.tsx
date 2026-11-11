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
    {orders.length > 0 && <div className="orders-scroll">
      <table className="orders-table">
        <thead><tr>
          <th scope="col">Product / order</th><th scope="col">Quantity</th>
          <th scope="col">Unit price</th><th scope="col">Total</th><th scope="col">Status</th>
          <th scope="col">Action</th>
        </tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id}>
          <td>{products.find((product) => product.id === order.product_id)?.name ?? order.product_id}
            <small>{order.id}</small></td>
          <td>{order.quantity}</td>
          <td className="amount">{fromYocto(order.unit_price_yocto)} test NEAR</td>
          <td className="amount">{fromYocto(order.total_yocto)} test NEAR</td>
          <td><span className={`order-status ${order.status}`}>
            {order.status === 'paid' ? 'Paid' : 'Awaiting payment'}
          </span></td>
          <td><button className="secondary-button" type="button" onClick={() => onReview(order)}>
            {order.status === 'paid' ? 'View' : 'Review & pay'}
          </button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
