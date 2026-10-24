-- Demo prices in test NEAR. One NEAR is 10^24 yoctoNEAR.
INSERT INTO products (id, name, price_yocto) VALUES
    ('toilet-paper', 'Toilet paper', 2000000000000000000000000),
    ('groceries', 'Groceries basket', 5000000000000000000000000),
    ('premium-paper', 'Premium toilet paper', 50000000000000000000000000),
    ('milk-whole', 'Whole cow milk, 1 L', 2000000000000000000000000),
    ('milk-lactose-free', 'Lactose-free cow milk, 1 L', 3000000000000000000000000),
    ('oat-drink', 'Unsweetened oat drink, 1 L', 3000000000000000000000000),
    ('almond-drink', 'Unsweetened almond drink, 1 L', 4000000000000000000000000),
    ('coffee-beans', 'Whole coffee beans, 250 g', 6000000000000000000000000),
    ('coffee-ground', 'Caffeinated ground coffee, 250 g', 5000000000000000000000000),
    ('coffee-decaf', 'Decaffeinated ground coffee, 250 g', 6000000000000000000000000),
    ('tea-green', 'Green tea, 20 bags', 3000000000000000000000000),
    ('tea-black', 'Black tea, 20 bags', 3000000000000000000000000),
    ('dish-soap', 'Dishwashing liquid for hand washing dishes, 500 mL', 2000000000000000000000000),
    ('laundry-detergent', 'Liquid laundry detergent for washing machines, 1 L', 5000000000000000000000000),
    ('water-sparkling', 'Sparkling drinking water, 1 L', 1000000000000000000000000),
    ('water-still', 'Still drinking water, 1 L', 1000000000000000000000000),
    ('bread-whole-wheat', 'Whole wheat bread, 500 g', 2000000000000000000000000),
    ('bread-gluten-free', 'Gluten-free bread, 400 g', 4000000000000000000000000)
ON CONFLICT (id) DO NOTHING;
