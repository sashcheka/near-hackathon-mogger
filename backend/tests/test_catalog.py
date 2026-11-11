import psycopg2.errors
import pytest

FRESH = {'milk-whole', 'milk-lactose-free', 'oat-drink', 'almond-drink',
         'bread-whole-wheat', 'bread-gluten-free'}
HOME = {'premium-paper', 'dish-soap', 'laundry-detergent'}


def merchant(product_id):
    if product_id in FRESH:
        return {'merchant_id': 'fresh', 'merchant_name': 'Fresh Market', 'merchant_ready': False}
    if product_id in HOME:
        return {'merchant_id': 'home', 'merchant_name': 'Home Market', 'merchant_ready': False}
    return {'merchant_id': 'general', 'merchant_name': 'Everyday Market', 'merchant_ready': True}


async def test_products(service_client):
    response = await service_client.get('/products')
    assert response.status == 200
    assert response.headers['Content-Type'].split(';', 1)[0] == 'application/json'
    expected = [
        ('almond-drink', 'Unsweetened almond drink, 1 L', '40000000000000000000000'),
        ('bread-gluten-free', 'Gluten-free bread, 400 g', '40000000000000000000000'),
        ('bread-whole-wheat', 'Whole wheat bread, 500 g', '20000000000000000000000'),
        ('coffee-beans', 'Whole coffee beans, 250 g', '60000000000000000000000'),
        ('coffee-decaf', 'Decaffeinated ground coffee, 250 g', '60000000000000000000000'),
        ('coffee-ground', 'Caffeinated ground coffee, 250 g', '50000000000000000000000'),
        ('dish-soap', 'Dishwashing liquid for hand washing dishes, 500 mL', '20000000000000000000000'),
        ('groceries', 'Groceries basket', '50000000000000000000000'),
        ('laundry-detergent', 'Liquid laundry detergent for washing machines, 1 L', '50000000000000000000000'),
        ('milk-lactose-free', 'Lactose-free cow milk, 1 L', '30000000000000000000000'),
        ('milk-whole', 'Whole cow milk, 1 L', '20000000000000000000000'),
        ('oat-drink', 'Unsweetened oat drink, 1 L', '30000000000000000000000'),
        ('premium-paper', 'Premium toilet paper', '500000000000000000000000'),
        ('tea-black', 'Black tea, 20 bags', '30000000000000000000000'),
        ('tea-green', 'Green tea, 20 bags', '30000000000000000000000'),
        ('toilet-paper', 'Toilet paper', '20000000000000000000000'),
        ('water-sparkling', 'Sparkling drinking water, 1 L', '10000000000000000000000'),
        ('water-still', 'Still drinking water, 1 L', '10000000000000000000000'),
    ]
    assert response.json() == {'products': [
        {'id': product_id, 'name': name, 'price_yocto': price, **merchant(product_id)}
        for product_id, name, price in expected
    ]}


async def test_empty_products(service_client, pgsql):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('DELETE FROM products')

    response = await service_client.get('/products')
    assert response.status == 200
    assert response.json() == {'products': []}


async def test_products_read_updated_database_values(service_client, pgsql):
    price = '340282366920938463463374607431768211455'
    name = 'Custom paper "deluxe"'
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'UPDATE products SET name = %s, price_yocto = %s WHERE id = %s',
            (name, price, 'toilet-paper'),
        )

    response = await service_client.get('/products')
    assert response.status == 200
    products = response.json()['products']
    assert len(products) == 18
    assert next(p for p in products if p['id'] == 'toilet-paper') == {
        'id': 'toilet-paper', 'name': name, 'price_yocto': price, **merchant('toilet-paper'),
    }


@pytest.mark.parametrize('price', [0, -1])
def test_reject_non_positive_price(pgsql, price):
    with pgsql['treasury'].cursor() as cursor:
        with pytest.raises(psycopg2.errors.CheckViolation):
            cursor.execute(
                'INSERT INTO products (id, name, price_yocto) VALUES (%s, %s, %s)',
                ('invalid-product', 'Invalid product', price),
            )
