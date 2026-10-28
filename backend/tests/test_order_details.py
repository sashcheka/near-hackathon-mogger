import uuid

import psycopg2.errors
import pytest


AMOUNT = '4000000000000000000000000'
REQUEST = {'product_id': 'toilet-paper', 'quantity': 2, 'budget_yocto': AMOUNT}


async def test_details_use_saved_price_and_payment_settings(service_client, pgsql):
    response = await service_client.post('/orders', json=REQUEST)
    assert response.status == 201
    order = response.json()
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE products SET price_yocto = 1 WHERE id = 'toilet-paper'")
        cursor.execute('SELECT receiver_id, network_id FROM orders WHERE id = %s',
                       (order['id'],))
        assert cursor.fetchone() == ('merchant.testnet', 'testnet')

    response = await service_client.get(
        f"/orders/{order['id']}?amount_yocto=1&receiver_id=attacker.testnet&network_id=mainnet",
    )
    assert response.status == 200
    assert response.json() == {**order, 'payment': {
        'network_id': 'testnet', 'receiver_id': 'merchant.testnet',
        'asset': 'NEAR', 'amount_yocto': AMOUNT,
    }}


@pytest.mark.parametrize('receiver', [None, 'previous-merchant.testnet'])
async def test_details_do_not_replace_missing_or_old_recipient(service_client, pgsql, receiver):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            'budget_yocto, receiver_id) VALUES (%s, 1, 1, 1, 1, %s) RETURNING id::text',
            ('toilet-paper', receiver),
        )
        order_id = cursor.fetchone()[0]
    response = await service_client.get(f'/orders/{order_id}')
    assert response.status == 200
    payment = response.json()['payment']
    if receiver is None:
        assert payment is None
    else:
        assert payment == {'network_id': 'testnet', 'receiver_id': receiver,
                           'asset': 'NEAR', 'amount_yocto': '1'}


@pytest.mark.parametrize('order_id', ['invalid', '00000000-0000-0000-0000-00000000000z'])
async def test_invalid_order_id(service_client, order_id):
    response = await service_client.get(f'/orders/{order_id}')
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}


async def test_missing_order(service_client):
    response = await service_client.get(f'/orders/{uuid.uuid4()}')
    assert response.status == 404
    assert response.json() == {'error': 'order_not_found'}


@pytest.mark.parametrize(('receiver', 'network'), [
    ('merchant.testnet', 'mainnet'), ('bad..testnet', 'testnet'),
    ('system', 'testnet'), ('', 'testnet'), ('a' * 65, 'testnet'),
])
def test_database_rejects_invalid_payment_details(pgsql, receiver, network):
    with pgsql['treasury'].cursor() as cursor:
        with pytest.raises(psycopg2.errors.CheckViolation):
            cursor.execute(
                'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
                'budget_yocto, receiver_id, network_id) VALUES (%s, 1, 1, 1, 1, %s, %s)',
                ('toilet-paper', receiver, network),
            )


def test_payment_migration_preserves_existing_order(pgsql, migrate_database):
    database = pgsql['treasury']
    with database.cursor() as cursor:
        cursor.execute('ALTER TABLE orders DROP COLUMN receiver_id, DROP COLUMN network_id')
        cursor.execute("DELETE FROM schema_migrations WHERE version = '20261028000100'")
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            'budget_yocto) VALUES (%s, 2, %s, %s, %s) RETURNING id::text',
            ('toilet-paper', '2000000000000000000000000', AMOUNT, AMOUNT),
        )
        order_id = cursor.fetchone()[0]
    migrate_database(database.conninfo)
    with database.cursor() as cursor:
        cursor.execute(
            'SELECT total_yocto::text, status, receiver_id, network_id '
            'FROM orders WHERE id = %s', (order_id,),
        )
        assert cursor.fetchone() == (AMOUNT, 'pending_payment', None, 'testnet')
