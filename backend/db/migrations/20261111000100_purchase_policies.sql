-- migrate:up
CREATE TABLE purchase_policies (
    buyer_id TEXT PRIMARY KEY,
    max_order_yocto NUMERIC(39, 0) CHECK (max_order_yocto > 0),
    max_unit_yocto NUMERIC(39, 0) CHECK (max_unit_yocto > 0),
    allowed_merchant TEXT
);

CREATE TABLE policy_decisions (
    id BIGSERIAL PRIMARY KEY,
    buyer_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity BIGINT NOT NULL,
    unit_price_yocto NUMERIC(39, 0) NOT NULL,
    total_yocto NUMERIC(42, 0) NOT NULL,
    receiver_id TEXT,
    decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked')),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX policy_decisions_buyer_idx ON policy_decisions (buyer_id, id DESC);

-- migrate:down
DROP TABLE policy_decisions;
DROP TABLE purchase_policies;
