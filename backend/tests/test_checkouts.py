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
    assert (await service_client.post('/checkouts', json=cart, bearer=buyer_token)).json() == checkout
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
