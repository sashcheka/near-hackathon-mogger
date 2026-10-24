import uuid

import psycopg2.errors
import pytest


PRICE = '2000000000000000000000000'
TOTAL = '4000000000000000000000000'
REQUEST = {'product_id': 'toilet-paper', 'quantity': 2, 'budget_yocto': TOTAL}


async def test_create_order_and_preserve_price_snapshot(service_client, pgsql):
    response = await service_client.post('/orders', json=REQUEST)
    assert response.status == 201
    order = response.json()
    assert str(uuid.UUID(order['id'])) == order['id']
    assert order == {
        'id': order['id'], **REQUEST, 'unit_price_yocto': PRICE,
        'total_yocto': TOTAL, 'status': 'pending_payment',
    }
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'UPDATE products SET price_yocto = 1 WHERE id = %s',
            ('toilet-paper',),
        )
        cursor.execute(
            'SELECT product_id, quantity, unit_price_yocto::text, '
            'total_yocto::text, budget_yocto::text, status FROM orders WHERE id = %s',
            (order['id'],),
        )
        assert cursor.fetchone() == (
            'toilet-paper', 2, PRICE, TOTAL, TOTAL, 'pending_payment',
        )
    response = await service_client.post('/orders', json=REQUEST)
    assert response.status == 201
    assert response.json()['unit_price_yocto'] == '1'
    assert response.json()['total_yocto'] == '2'


@pytest.mark.parametrize(('changes', 'status', 'error'), [
    ({'budget_yocto': PRICE}, 409, 'budget_exceeded'),
    ({'product_id': "unknown' OR TRUE --"}, 404, 'product_not_found'),
    ({'product_id': ''}, 400, 'invalid_request'),
    ({'quantity': 0}, 400, 'invalid_request'),
    ({'quantity': -1}, 400, 'invalid_request'),
    ({'quantity': 1001}, 400, 'invalid_request'),
    ({'quantity': 1.5}, 400, 'invalid_request'),
    ({'quantity': True}, 400, 'invalid_request'),
    ({'budget_yocto': 3}, 400, 'invalid_request'),
    ({'budget_yocto': '0'}, 400, 'invalid_request'),
    ({'budget_yocto': '-1'}, 400, 'invalid_request'),
    ({'budget_yocto': '01'}, 400, 'invalid_request'),
    ({'budget_yocto': '1e30'}, 400, 'invalid_request'),
    ({'budget_yocto': '9' * 40}, 400, 'invalid_request'),
    ({'unit_price_yocto': '1'}, 400, 'invalid_request'),
])
async def test_rejected_order_is_not_saved(service_client, pgsql, changes, status, error):
    response = await service_client.post('/orders', json={**REQUEST, **changes})
    assert response.status == status
    assert response.json() == {'error': error}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)


@pytest.mark.parametrize('body', ['{', '[]', '{}', 'null'])
async def test_invalid_json_request(service_client, body):
    response = await service_client.post('/orders', data=body)
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}


async def test_large_amounts_do_not_overflow(service_client, pgsql):
    price = '9' * 39
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'UPDATE products SET price_yocto = %s WHERE id = %s',
            (price, 'toilet-paper'),
        )
    response = await service_client.post(
        '/orders', json={**REQUEST, 'quantity': 1, 'budget_yocto': price},
    )
    assert response.status == 201
    assert response.json()['total_yocto'] == price
    response = await service_client.post(
        '/orders', json={**REQUEST, 'quantity': 1000, 'budget_yocto': price},
    )
    assert response.status == 409
    assert response.json() == {'error': 'budget_exceeded'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (1,)


@pytest.mark.parametrize(('total', 'budget'), [(3, 4), (2, 1)])
def test_database_guards_order_amounts(pgsql, total, budget):
    with pgsql['treasury'].cursor() as cursor:
        with pytest.raises(psycopg2.errors.CheckViolation):
            cursor.execute(
                'INSERT INTO orders (product_id, quantity, unit_price_yocto, '
                'total_yocto, budget_yocto) VALUES (%s, 1, 2, %s, %s)',
                ('toilet-paper', total, budget),
            )
