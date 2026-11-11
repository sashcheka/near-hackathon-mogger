export type Route = { view: 'purchase' | 'orders' | 'order' | 'store' | 'cart' | 'checkout' | 'not-found'; id?: string };

export function parseRoute(path: string): Route {
  if (path === '/') return { view: 'purchase' };
  if (path === '/store') return { view: 'store' };
  if (path === '/cart') return { view: 'cart' };
  if (path === '/orders') return { view: 'orders' };
  const match = /^\/(orders|checkouts)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(path);
  if (match) return { view: match[1] === 'orders' ? 'order' : 'checkout', id: match[2] };
  return { view: 'not-found' };
}
