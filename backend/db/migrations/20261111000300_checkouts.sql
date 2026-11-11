-- migrate:up
CREATE TABLE checkouts (
    id UUID PRIMARY KEY,
    buyer_id TEXT NOT NULL,
    request_spec TEXT NOT NULL,
    total_yocto NUMERIC(39, 0) NOT NULL CHECK (total_yocto > 0),
    budget_yocto NUMERIC(39, 0) NOT NULL CHECK (budget_yocto > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (total_yocto <= budget_yocto)
);
CREATE INDEX checkouts_buyer_idx ON checkouts (buyer_id, created_at DESC);
ALTER TABLE orders ADD COLUMN checkout_id UUID REFERENCES checkouts(id);
CREATE INDEX orders_checkout_idx ON orders (checkout_id);
CREATE TABLE checkout_items (
    order_id UUID PRIMARY KEY REFERENCES orders(id),
    product_name TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL
);

-- migrate:down
DROP TABLE checkout_items;
ALTER TABLE orders DROP COLUMN checkout_id;
DROP TABLE checkouts;
