-- migrate:up
CREATE TABLE merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    account_id TEXT CHECK (account_id IS NULL OR (
        length(account_id) BETWEEN 2 AND 64 AND account_id <> 'system'
        AND account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ))
);
INSERT INTO merchants (id, name) VALUES
    ('general', 'Everyday Market'), ('fresh', 'Fresh Market'), ('home', 'Home Market');
ALTER TABLE products ADD COLUMN merchant_id TEXT NOT NULL DEFAULT 'general' REFERENCES merchants(id);
UPDATE products SET merchant_id = 'fresh' WHERE id IN
    ('milk-whole', 'milk-lactose-free', 'oat-drink', 'almond-drink', 'bread-whole-wheat', 'bread-gluten-free');
UPDATE products SET merchant_id = 'home' WHERE id IN
    ('premium-paper', 'dish-soap', 'laundry-detergent');

-- migrate:down
ALTER TABLE products DROP COLUMN merchant_id;
DROP TABLE merchants;
