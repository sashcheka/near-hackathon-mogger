-- Demo prices in test NEAR. One NEAR is 10^24 yoctoNEAR.
INSERT INTO products (id, name, price_yocto) VALUES
    ('toilet-paper', 'Toilet paper', 20000000000000000000000),
    ('groceries', 'Groceries basket', 50000000000000000000000),
    ('premium-paper', 'Premium toilet paper', 500000000000000000000000),
    ('milk-whole', 'Whole cow milk, 1 L', 20000000000000000000000),
    ('milk-lactose-free', 'Lactose-free cow milk, 1 L', 30000000000000000000000),
    ('oat-drink', 'Unsweetened oat drink, 1 L', 30000000000000000000000),
    ('almond-drink', 'Unsweetened almond drink, 1 L', 40000000000000000000000),
    ('coffee-beans', 'Whole coffee beans, 250 g', 60000000000000000000000),
    ('coffee-ground', 'Caffeinated ground coffee, 250 g', 50000000000000000000000),
    ('coffee-decaf', 'Decaffeinated ground coffee, 250 g', 60000000000000000000000),
    ('tea-green', 'Green tea, 20 bags', 30000000000000000000000),
    ('tea-black', 'Black tea, 20 bags', 30000000000000000000000),
    ('dish-soap', 'Dishwashing liquid for hand washing dishes, 500 mL', 20000000000000000000000),
    ('laundry-detergent', 'Liquid laundry detergent for washing machines, 1 L', 50000000000000000000000),
    ('water-sparkling', 'Sparkling drinking water, 1 L', 10000000000000000000000),
    ('water-still', 'Still drinking water, 1 L', 10000000000000000000000),
    ('bread-whole-wheat', 'Whole wheat bread, 500 g', 20000000000000000000000),
    ('bread-gluten-free', 'Gluten-free bread, 400 g', 40000000000000000000000)
ON CONFLICT (id) DO NOTHING;
