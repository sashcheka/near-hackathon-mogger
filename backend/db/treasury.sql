CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    price_yocto NUMERIC(39, 0) NOT NULL CHECK (price_yocto > 0)
);

-- Demo prices in test NEAR: 2, 5, and 50. One NEAR is 10^24 yoctoNEAR.
INSERT INTO products (id, name, price_yocto) VALUES
    ('toilet-paper', 'Toilet paper', 2000000000000000000000000),
    ('groceries', 'Groceries basket', 5000000000000000000000000),
    ('premium-paper', 'Premium toilet paper', 50000000000000000000000000)
ON CONFLICT (id) DO NOTHING;
