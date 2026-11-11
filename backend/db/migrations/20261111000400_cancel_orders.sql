-- migrate:up
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending_payment', 'paid', 'cancelled'));

-- migrate:down
-- Refuse rollback while cancelled orders exist.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending_payment', 'paid'));
