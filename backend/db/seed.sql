-- Demo prices in test NEAR. One NEAR is 10^24 yoctoNEAR.
INSERT INTO merchants (id, name) VALUES
    ('general', 'Everyday Market'), ('fresh', 'Fresh Market'), ('home', 'Home Market')
ON CONFLICT (id) DO NOTHING;
INSERT INTO products (id, name, price_yocto, merchant_id) VALUES
    ('toilet-paper', 'Toilet paper', 20000000000000000000000, 'general'),
    ('groceries', 'Groceries basket', 50000000000000000000000, 'general'),
    ('premium-paper', 'Premium toilet paper', 500000000000000000000000, 'home'),
    ('milk-whole', 'Whole cow milk, 1 L', 20000000000000000000000, 'fresh'),
    ('milk-lactose-free', 'Lactose-free cow milk, 1 L', 30000000000000000000000, 'fresh'),
    ('oat-drink', 'Unsweetened oat drink, 1 L', 30000000000000000000000, 'fresh'),
    ('almond-drink', 'Unsweetened almond drink, 1 L', 40000000000000000000000, 'fresh'),
    ('coffee-beans', 'Whole coffee beans, 250 g', 60000000000000000000000, 'general'),
    ('coffee-ground', 'Caffeinated ground coffee, 250 g', 50000000000000000000000, 'general'),
    ('coffee-decaf', 'Decaffeinated ground coffee, 250 g', 60000000000000000000000, 'general'),
    ('tea-green', 'Green tea, 20 bags', 30000000000000000000000, 'general'),
    ('tea-black', 'Black tea, 20 bags', 30000000000000000000000, 'general'),
    ('dish-soap', 'Dishwashing liquid for hand washing dishes, 500 mL', 20000000000000000000000, 'home'),
    ('laundry-detergent', 'Liquid laundry detergent for washing machines, 1 L', 50000000000000000000000, 'home'),
    ('water-sparkling', 'Sparkling drinking water, 1 L', 10000000000000000000000, 'general'),
    ('water-still', 'Still drinking water, 1 L', 10000000000000000000000, 'general'),
    ('bread-whole-wheat', 'Whole wheat bread, 500 g', 20000000000000000000000, 'fresh'),
    ('bread-gluten-free', 'Gluten-free bread, 400 g', 40000000000000000000000, 'fresh')
ON CONFLICT (id) DO NOTHING;
