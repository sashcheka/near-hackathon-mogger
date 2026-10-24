-- Demo prices in test NEAR: 2, 5, and 50. One NEAR is 10^24 yoctoNEAR.
INSERT INTO products (id, name, price_yocto) VALUES
    ('toilet-paper', 'Toilet paper', 2000000000000000000000000),
    ('groceries', 'Groceries basket', 5000000000000000000000000),
    ('premium-paper', 'Premium toilet paper', 50000000000000000000000000)
ON CONFLICT (id) DO NOTHING;
