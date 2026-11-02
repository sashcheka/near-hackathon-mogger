-- migrate:up
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending_payment', 'paid'));

CREATE TABLE payments (
    order_id UUID PRIMARY KEY REFERENCES orders(id),
    network_id TEXT NOT NULL CHECK (network_id = 'testnet'),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    amount_yocto NUMERIC(39, 0) NOT NULL CHECK (amount_yocto > 0),
    block_hash TEXT NOT NULL CHECK (block_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    block_timestamp_ns NUMERIC(20, 0) NOT NULL CHECK (
        block_timestamp_ns BETWEEN 1 AND 18446744073709551615
    ),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network_id, transaction_hash)
);

-- migrate:down
-- Refuse rollback while paid orders exist rather than erase payment history.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status = 'pending_payment');
DROP TABLE payments;
