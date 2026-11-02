import hashlib

import pytest


HASH = 'A' * 44
ORDER = {'product_id': 'toilet-paper', 'quantity': 1,
         'budget_yocto': '3000000000000000000000000'}
PURCHASE = {'prompt': 'Buy toilet paper', 'budget_yocto': ORDER['budget_yocto']}


@pytest.fixture
def upstream_calls(mockserver):
    calls = []

    @mockserver.handler('/api/chat')
    def model(request):
        calls.append('model')
        return mockserver.make_response(status=500)

    @mockserver.handler('/near-rpc')
    def rpc(request):
        calls.append('rpc')
        return mockserver.make_response(status=500)

    return calls


@pytest.fixture
def owned_order(pgsql, seed_catalog):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
            "budget_yocto, receiver_id, buyer_id) "
            "VALUES ('toilet-paper', 1, 2, 2, 3, 'merchant.testnet', 'buyer.testnet') "
            "RETURNING id::text",
        )
        return cursor.fetchone()[0]


@pytest.mark.parametrize('kind', ['missing', 'malformed', 'unknown', 'expired', 'revoked'])
async def test_rejects_inactive_sessions_before_order_or_upstream_work(
        service_client, pgsql, buyer_token, owned_order, upstream_calls, kind):
    token = {'missing': None, 'malformed': 'bad', 'unknown': 'U' * 44}.get(kind, buyer_token)
    with pgsql['treasury'].cursor() as cursor:
        if kind == 'expired':
            cursor.execute("UPDATE auth_sessions SET expires_at = now() - interval '1 second'")
        if kind == 'revoked':
            cursor.execute('DELETE FROM auth_sessions')
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    for method, path, body in [
        ('post', '/orders', ORDER), ('post', '/purchase-requests', PURCHASE),
        ('get', '/orders', None),
        ('get', f'/orders/{owned_order}', None),
        ('post', f'/orders/{owned_order}/verify-payment', {'transaction_hash': HASH}),
    ]:
        response = await getattr(service_client, method)(
            path, headers=headers, **({'json': body} if body is not None else {}))
        assert response.status == 401 and response.json() == {'error': 'unauthorized'}
        assert response.headers['Cache-Control'] == 'no-store'
    assert upstream_calls == []
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (1,)


@pytest.mark.parametrize('owner', ['other.testnet', None])
async def test_foreign_and_legacy_orders_are_inaccessible(
        service_client, pgsql, buyer_token, owned_order, upstream_calls, owner):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('UPDATE orders SET buyer_id = %s WHERE id = %s', (owner, owned_order))
    details = await service_client.get(
        f'/orders/{owned_order}?buyer_id=buyer.testnet', bearer=buyer_token)
    verification = await service_client.post(
        f'/orders/{owned_order}/verify-payment', json={'transaction_hash': HASH}, bearer=buyer_token)
    for response in (details, verification):
        assert response.status == 404 and response.json() == {'error': 'order_not_found'}
    assert upstream_calls == []
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT buyer_id, status FROM orders WHERE id = %s', (owned_order,))
        assert cursor.fetchone() == (owner, 'pending_payment')


@pytest.mark.parametrize(('path', 'body'), [
    ('/orders', {**ORDER, 'buyer_id': 'other.testnet'}),
    ('/purchase-requests', {**PURCHASE, 'buyer_id': 'other.testnet'}),
])
async def test_request_cannot_override_buyer(service_client, pgsql, buyer_token, upstream_calls, path, body):
    response = await service_client.post(path, json=body, bearer=buyer_token)
    assert response.status == 400 and response.json() == {'error': 'invalid_request'}
    assert upstream_calls == []
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)


@pytest.mark.parametrize('sender', ['buyer.testnet', 'other.testnet'])
async def test_request_cannot_choose_payment_sender(
        service_client, buyer_token, owned_order, upstream_calls, sender):
    response = await service_client.post(f'/orders/{owned_order}/verify-payment',
        json={'transaction_hash': HASH, 'sender_id': sender}, bearer=buyer_token)
    assert response.status == 400 and response.json() == {'error': 'invalid_request'}
    assert upstream_calls == []


async def test_two_buyers_have_separate_orders(service_client, pgsql, buyer_token):
    other_token = 'C' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(other_token.encode()).hexdigest(), 'other.testnet'))
    response = await service_client.post('/orders', json=ORDER, bearer=other_token)
    assert response.status == 201
    path = '/orders/' + response.json()['id']
    assert (await service_client.get(path, bearer=other_token)).status == 200
    assert (await service_client.get(path, bearer=buyer_token)).status == 404
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT buyer_id FROM orders')
        assert cursor.fetchall() == [('other.testnet',)]


async def test_new_session_for_same_account_keeps_access(service_client, pgsql, buyer_token, owned_order):
    replacement = 'D' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('DELETE FROM auth_sessions')
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(replacement.encode()).hexdigest(), 'buyer.testnet'))
    assert (await service_client.get(f'/orders/{owned_order}', bearer=buyer_token)).status == 401
    assert (await service_client.get(f'/orders/{owned_order}', bearer=replacement)).status == 200
