import type { CartItem, Product } from './api';
import { fromYocto } from './amounts';

type Props = { products: Product[]; loading: boolean; error: string; onRefresh: () => void;
  cart: CartItem[]; onAdd: (product: Product) => void; onCart: () => void };

export default function Store({ products, loading, error, onRefresh, cart, onAdd, onCart }: Props) {
  const merchants = [...new Map(products.map((p) => [p.merchant_id, p.merchant_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <section aria-labelledby="store-title" aria-busy={loading}>
    <div className="wallet-controls">
      <div>
        <h2 id="store-title">Demo catalog</h2>
        {!loading && !error && <small>{products.length} products · Prices in test NEAR</small>}
      </div>
      <div className="store-actions">
        <button className="secondary-button store-refresh" type="button" disabled={loading} onClick={onRefresh}>Refresh</button>
        <button type="button" onClick={onCart}>Cart{count > 0 && ` (${count})`}</button>
      </div>
    </div>
    {loading && <p role="status">Loading products…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && products.length === 0 && <p>No products are available.</p>}
    {cart.length >= 20 && <small>A cart can contain up to 20 different products.</small>}
    {!loading && !error && merchants.map(([id, name]) => <section key={id} className="store-merchant">
      <h3>{name}</h3>
      <ul className="store-grid">
        {products.filter((product) => product.merchant_id === id).map((product) => <li className="store-product" key={product.id}>
          <strong>{product.name}</strong>
          <div className="store-product-footer">
            <div><small>Price</small><span>{fromYocto(product.price_yocto)} test NEAR</span></div>
            <button className="secondary-button store-add" type="button"
              disabled={(cart.find((item) => item.product_id === product.id)?.quantity ?? 0) >= 1000 ||
                (cart.length >= 20 && !cart.some((item) => item.product_id === product.id))}
              aria-label={`Add ${product.name} to cart`} onClick={() => onAdd(product)}>Add</button>
          </div>
        </li>)}
      </ul>
    </section>)}
  </section>;
}
