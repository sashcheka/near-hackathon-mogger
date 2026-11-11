import hashlib

import pytest


SETTINGS = {'max_order_yocto': '50000000000000000000000',
            'max_unit_yocto': '30000000000000000000000',
            'allowed_merchant': 'merchant.testnet'}
ORDER = {'product_id': 'toilet-paper', 'quantity': 1,
         'budget_yocto': '100000000000000000000000'}


async def save(service_client, token, settings=SETTINGS):
    return await service_client.put('/purchase-policy/settings', json=settings, bearer=token)


async def test_settings_are_scoped_to_verified_buyer(service_client, pgsql, buyer_token):
    other = 'C' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(other.encode()).hexdigest(), 'other.testnet'))
    assert (await save(service_client, buyer_token)).json() == SETTINGS
    assert (await service_client.get('/purchase-policy/settings', bearer=buyer_token)).json() == SETTINGS
    assert (await service_client.get('/purchase-policy/settings', bearer=other)).json() == {
        'max_order_yocto': '', 'max_unit_yocto': '', 'allowed_merchant': ''}
    assert (await service_client.get('/purchase-policy/settings')).status == 401


@pytest.mark.parametrize('changes', [
    {'max_order_yocto': '0'}, {'max_unit_yocto': '-1'}, {'max_unit_yocto': '01'},
    {'max_order_yocto': '9' * 40}, {'allowed_merchant': 'bad..account'},
    {'max_order_yocto': 1}, {'extra': 'value'},
])
async def test_invalid_settings_do_not_replace_saved_rules(service_client, buyer_token, changes):
    assert (await save(service_client, buyer_token)).status == 200
    assert (await save(service_client, buyer_token, {**SETTINGS, **changes})).status == 400
    assert (await service_client.get('/purchase-policy/settings', bearer=buyer_token)).json() == SETTINGS


@pytest.mark.parametrize(('settings', 'order', 'error'), [
    ({**SETTINGS, 'max_order_yocto': '10000000000000000000000'}, ORDER, 'policy_order_limit'),
    ({**SETTINGS, 'max_unit_yocto': '10000000000000000000000'}, ORDER, 'policy_unit_limit'),
    ({**SETTINGS, 'allowed_merchant': 'other.testnet'}, ORDER, 'policy_merchant'),
    (SETTINGS, {**ORDER, 'budget_yocto': '10000000000000000000000'}, 'budget_exceeded'),
])
async def test_rejected_purchase_records_reason_without_order(service_client, pgsql, buyer_token, settings, order, error):
    assert (await save(service_client, buyer_token, settings)).status == 200
    response = await service_client.post('/orders', json=order, bearer=buyer_token)
    assert response.status == 409 and response.json() == {'error': error}
    history = await service_client.get('/purchase-policy/history', bearer=buyer_token)
    assert history.json()['decisions'][0] == {
        'product_id': 'toilet-paper', 'total_yocto': '20000000000000000000000',
        'decision': 'blocked', 'reason': error}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)


async def test_allowed_order_and_changed_rules_block_payment_preflight(service_client, buyer_token):
    assert (await save(service_client, buyer_token)).status == 200
    created = await service_client.post('/orders', json=ORDER, bearer=buyer_token)
    assert created.status == 201
    path = '/orders/' + created.json()['id']
    assert (await service_client.get(path, bearer=buyer_token)).json()['policy_error'] == ''
    history = await service_client.get('/purchase-policy/history', bearer=buyer_token)
    assert history.json()['decisions'][0]['reason'] == 'within_limits'
    assert (await save(service_client, buyer_token, {**SETTINGS, 'allowed_merchant': 'other.testnet'})).status == 200
    assert (await service_client.get(path, bearer=buyer_token)).json()['policy_error'] == 'policy_merchant'
