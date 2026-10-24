-- migrate:up
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity BIGINT NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
    unit_price_yocto NUMERIC(39, 0) NOT NULL CHECK (unit_price_yocto > 0),
    total_yocto NUMERIC(39, 0) NOT NULL CHECK (total_yocto > 0),
    budget_yocto NUMERIC(39, 0) NOT NULL CHECK (budget_yocto > 0),
    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (total_yocto = unit_price_yocto * quantity),
    CHECK (total_yocto <= budget_yocto)
);
CREATE INDEX orders_product_id_idx ON orders(product_id);

-- migrate:down
DROP TABLE orders;
