-- migrate:up
ALTER TABLE orders ADD COLUMN buyer_id TEXT CHECK (
    buyer_id IS NULL OR (
        length(buyer_id) BETWEEN 2 AND 64 AND buyer_id <> 'system' AND
        buyer_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
);
CREATE INDEX orders_buyer_id_idx ON orders(buyer_id);

-- migrate:down
ALTER TABLE orders DROP COLUMN buyer_id;
