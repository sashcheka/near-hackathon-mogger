-- migrate:up
-- Change only the original demo prices; preserve custom prices and saved orders.
UPDATE products AS product
SET price_yocto = demo.price_near * 10000000000000000000000
FROM (VALUES
    ('toilet-paper', 2),
    ('groceries', 5),
    ('premium-paper', 50),
    ('milk-whole', 2),
    ('milk-lactose-free', 3),
    ('oat-drink', 3),
    ('almond-drink', 4),
    ('coffee-beans', 6),
    ('coffee-ground', 5),
    ('coffee-decaf', 6),
    ('tea-green', 3),
    ('tea-black', 3),
    ('dish-soap', 2),
    ('laundry-detergent', 5),
    ('water-sparkling', 1),
    ('water-still', 1),
    ('bread-whole-wheat', 2),
    ('bread-gluten-free', 4)
) AS demo(id, price_near)
WHERE product.id = demo.id
  AND product.price_yocto = demo.price_near * 1000000000000000000000000;

-- migrate:down
UPDATE products AS product
SET price_yocto = demo.price_near * 1000000000000000000000000
FROM (VALUES
    ('toilet-paper', 2),
    ('groceries', 5),
    ('premium-paper', 50),
    ('milk-whole', 2),
    ('milk-lactose-free', 3),
    ('oat-drink', 3),
    ('almond-drink', 4),
    ('coffee-beans', 6),
    ('coffee-ground', 5),
    ('coffee-decaf', 6),
    ('tea-green', 3),
    ('tea-black', 3),
    ('dish-soap', 2),
    ('laundry-detergent', 5),
    ('water-sparkling', 1),
    ('water-still', 1),
    ('bread-whole-wheat', 2),
    ('bread-gluten-free', 4)
) AS demo(id, price_near)
WHERE product.id = demo.id
  AND product.price_yocto = demo.price_near * 10000000000000000000000;
