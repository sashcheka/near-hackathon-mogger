import psycopg2.errors
import pytest


async def test_products(service_client):
    response = await service_client.get('/products')
    assert response.status == 200
    assert response.headers['Content-Type'].split(';', 1)[0] == 'application/json'
    assert response.json() == {
        'products': [
            {
                'id': 'groceries',
                'name': 'Groceries basket',
                'price_yocto': '5000000000000000000000000',
            },
            {
                'id': 'premium-paper',
                'name': 'Premium toilet paper',
                'price_yocto': '50000000000000000000000000',
            },
            {
                'id': 'toilet-paper',
                'name': 'Toilet paper',
                'price_yocto': '2000000000000000000000000',
            },
        ],
    }


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
    assert len(products) == 3
    assert products[-1] == {
        'id': 'toilet-paper', 'name': name, 'price_yocto': price,
    }


@pytest.mark.parametrize('price', [0, -1])
def test_reject_non_positive_price(pgsql, price):
    with pgsql['treasury'].cursor() as cursor:
        with pytest.raises(psycopg2.errors.CheckViolation):
            cursor.execute(
                'INSERT INTO products (id, name, price_yocto) VALUES (%s, %s, %s)',
                ('invalid-product', 'Invalid product', price),
            )
