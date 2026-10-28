-- migrate:up
ALTER TABLE orders
    ADD COLUMN receiver_id TEXT CHECK (
        receiver_id IS NULL OR (
            length(receiver_id) BETWEEN 2 AND 64
            AND receiver_id <> 'system'
            AND receiver_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
        )
    ),
    ADD COLUMN network_id TEXT NOT NULL DEFAULT 'testnet'
        CHECK (network_id = 'testnet');

-- migrate:down
ALTER TABLE orders DROP COLUMN receiver_id, DROP COLUMN network_id;
