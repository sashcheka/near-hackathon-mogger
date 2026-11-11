import hashlib
import uuid

import pytest


@pytest.fixture
def cart(pgsql):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE merchants SET account_id = 'fresh.testnet' WHERE id = 'fresh'")
    return {'id': str(uuid.uuid4()), 'budget_yocto': '50000000000000000000000', 'items': [
        {'product_id': 'toilet-paper', 'quantity': 1}, {'product_id': 'milk-whole', 'quantity': 1}]}


async def test_checkout_is_atomic_owned_and_idempotent(service_client, pgsql, buyer_token, cart):
    response = await service_client.post('/checkouts', json=cart, bearer=buyer_token)
    assert response.status == 201
    checkout = response.json()
    assert checkout['id'] == cart['id']
    assert checkout['total_yocto'] == '40000000000000000000000'
    assert [(item['merchant_id'], item['receiver_id']) for item in checkout['items']] == [
        ('fresh', 'fresh.testnet'), ('general', 'merchant.testnet')]
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE merchants SET account_id = 'changed.testnet' WHERE id = 'fresh'")
        cursor.execute("UPDATE products SET price_yocto = 1 WHERE id = 'milk-whole'")
    assert (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json() == checkout
    assert (await service_client.get(f"/checkouts/{cart['id']}", bearer=buyer_token)).json() == checkout
    altered = {**cart, 'items': [cart['items'][0]]}
    assert (await service_client.post('/checkouts', json=altered, bearer=buyer_token)).status == 409
    history = await service_client.get('/checkouts', bearer=buyer_token)
    assert history.json()['checkouts'] == [checkout]
    assert (await service_client.get('/orders', bearer=buyer_token)).json() == {'orders': []}
    other = 'C' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(other.encode()).hexdigest(), 'other.testnet'))
        cursor.execute('SELECT count(*) FROM orders WHERE checkout_id = %s', (cart['id'],))
        assert cursor.fetchone() == (2,)
    assert (await service_client.get(f"/checkouts/{cart['id']}", bearer=other)).status == 404


async def test_total_budget_and_missing_merchant_prevent_partial_checkout(service_client, pgsql, buyer_token, cart):
    too_low = {**cart, 'budget_yocto': '30000000000000000000000'}
    result = await service_client.post('/checkouts', json=too_low, bearer=buyer_token)
    assert result.status == 409 and result.json() == {'error': 'budget_exceeded'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE merchants SET account_id = NULL WHERE id = 'fresh'")
    result = await service_client.post('/checkouts', json=cart, bearer=buyer_token)
    assert result.status == 409 and result.json() == {'error': 'merchant_not_configured'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM checkouts')
        assert cursor.fetchone() == (0,)
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)


async def test_grouped_checkout_keeps_partial_payment_status(service_client, pgsql, buyer_token, cart):
    checkout = (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json()
    first = checkout['items'][0]
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            "INSERT INTO payments (order_id, network_id, transaction_hash, sender_id, receiver_id, "
            "amount_yocto, block_hash, block_timestamp_ns) VALUES (%s, 'testnet', %s, "
            "'buyer.testnet', %s, %s, %s, 1)",
            (first['order_id'], 'A' * 44, first['receiver_id'], first['total_yocto'], '7' * 44))
        cursor.execute("UPDATE orders SET status = 'paid' WHERE id = %s", (first['order_id'],))
    result = await service_client.get(f"/checkouts/{cart['id']}", bearer=buyer_token)
    assert [item['status'] for item in result.json()['items']] == ['paid', 'pending_payment']


async def test_cancel_item_and_checkout_preserves_history_and_ownership(service_client, pgsql, buyer_token, cart):
    checkout = (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json()
    order_id = checkout['items'][0]['order_id']
    other = 'C' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(other.encode()).hexdigest(), 'other.testnet'))
    assert (await service_client.delete(f'/orders/{order_id}', bearer=other)).status == 404
    assert (await service_client.delete(f'/checkouts/{cart["id"]}', bearer=other)).status == 404
    cancelled = await service_client.delete(f'/orders/{order_id}', bearer=buyer_token)
    assert cancelled.status == 200 and cancelled.json()['status'] == 'cancelled'
    assert (await service_client.delete(f'/orders/{order_id}', bearer=buyer_token)).status == 200
    result = await service_client.delete(f'/checkouts/{cart["id"]}', bearer=buyer_token)
    assert result.status == 200
    assert [item['status'] for item in result.json()['items']] == ['cancelled', 'cancelled']
    assert (await service_client.get(f'/checkouts/{cart["id"]}', bearer=buyer_token)).json() == result.json()


async def test_cannot_cancel_paid_checkout(service_client, pgsql, buyer_token, cart):
    checkout = (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json()
    paid_id = checkout['items'][0]['order_id']
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE orders SET status = 'paid' WHERE id = %s", (paid_id,))
    assert (await service_client.delete(f'/orders/{paid_id}', bearer=buyer_token)).status == 409
    assert (await service_client.delete(f'/checkouts/{cart["id"]}', bearer=buyer_token)).status == 409
    result = await service_client.get(f'/checkouts/{cart["id"]}', bearer=buyer_token)
    assert [item['status'] for item in result.json()['items']] == ['paid', 'pending_payment']


async def test_policy_applies_to_full_checkout_before_and_after_creation(service_client, buyer_token, cart):
    policy = {'max_order_yocto': '30000000000000000000000', 'max_unit_yocto': '', 'allowed_merchant': ''}
    assert (await service_client.put('/purchase-policy/settings', json=policy, bearer=buyer_token)).status == 200
    response = await service_client.post('/checkouts', json=cart, bearer=buyer_token)
    assert response.status == 409 and response.json() == {'error': 'policy_order_limit'}
    policy['max_order_yocto'] = ''
    await service_client.put('/purchase-policy/settings', json=policy, bearer=buyer_token)
    checkout = (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json()
    policy['max_order_yocto'] = '30000000000000000000000'
    await service_client.put('/purchase-policy/settings', json=policy, bearer=buyer_token)
    for item in checkout['items']:
        order = await service_client.get(f"/orders/{item['order_id']}", bearer=buyer_token)
        assert order.json()['policy_error'] == 'policy_order_limit'


@pytest.mark.parametrize(('policy', 'reason'), [
    ({'max_order_yocto': '', 'max_unit_yocto': '10000000000000000000000', 'allowed_merchant': ''}, 'policy_unit_limit'),
    ({'max_order_yocto': '', 'max_unit_yocto': '', 'allowed_merchant': 'merchant.testnet'}, 'policy_merchant'),
])
async def test_any_disallowed_item_blocks_all_orders(service_client, pgsql, buyer_token, cart, policy, reason):
    await service_client.put('/purchase-policy/settings', json=policy, bearer=buyer_token)
    response = await service_client.post('/checkouts', json=cart, bearer=buyer_token)
    assert response.status == 409 and response.json() == {'error': reason}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)
