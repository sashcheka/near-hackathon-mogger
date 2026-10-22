import psycopg2.errors
import pytest


async def test_catalog_storage(service_client, pgsql):
    response = await service_client.get('/health')
    assert response.status == 200

    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT id, price_yocto::text FROM products ORDER BY id')
        assert cursor.fetchall() == [
            ('groceries', '5000000000000000000000000'),
            ('premium-paper', '50000000000000000000000000'),
            ('toilet-paper', '2000000000000000000000000'),
        ]


@pytest.mark.parametrize('price', [0, -1])
def test_reject_non_positive_price(pgsql, price):
    with pgsql['treasury'].cursor() as cursor:
        with pytest.raises(psycopg2.errors.CheckViolation):
            cursor.execute(
                'INSERT INTO products (id, name, price_yocto) VALUES (%s, %s, %s)',
                ('invalid-product', 'Invalid product', price),
            )
