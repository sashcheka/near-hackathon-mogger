import type { Product } from './api';
import { fromYocto } from './amounts';

type Props = { products: Product[]; loading: boolean; error: string; onRefresh: () => void };

export default function Store({ products, loading, error, onRefresh }: Props) {
  return <section aria-labelledby="store-title" aria-busy={loading}>
    <div className="wallet-controls">
      <div>
        <h2 id="store-title">Demo catalog</h2>
        {!loading && !error && <small>{products.length} {products.length === 1 ? 'product' : 'products'} · Prices in test NEAR</small>}
      </div>
      <button className="secondary-button store-refresh" type="button" disabled={loading} onClick={onRefresh}>
        Refresh
      </button>
    </div>
    {loading && <p role="status">Loading products…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && products.length === 0 && <p>No products are available.</p>}
    {!loading && !error && products.length > 0 && <ul className="store-grid">
      {products.map((product) => <li className="store-product" key={product.id}>
        <strong>{product.name}</strong>
        <div><small>Price</small><span>{fromYocto(product.price_yocto)} test NEAR</span></div>
      </li>)}
    </ul>}
  </section>;
}
