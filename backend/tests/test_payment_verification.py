import asyncio
import copy
import uuid

import pytest


HASH = 'A' * 44
RECEIPT_ID = '3' * 44
AMOUNT = '2000000000000000000000000'
REQUEST = {'transaction_hash': HASH, 'sender_id': 'buyer.testnet'}
TRANSACTION = {
    'hash': HASH, 'signer_id': 'buyer.testnet', 'receiver_id': 'merchant.testnet',
    'actions': [{'Transfer': {'deposit': AMOUNT}}],
}
OUTCOME = {'id': HASH, 'outcome': {'status': {'SuccessReceiptId': RECEIPT_ID}}}
RECEIPT = {'id': RECEIPT_ID, 'outcome': {
    'executor_id': 'merchant.testnet', 'status': {'SuccessValue': ''},
}}


@pytest.fixture
def near_rpc(mockserver, pgsql, seed_catalog):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            'budget_yocto, receiver_id) VALUES (%s, 1, %s, %s, %s, %s) RETURNING id::text',
            ('toilet-paper', AMOUNT, AMOUNT, AMOUNT, 'merchant.testnet'),
        )
        order_id = cursor.fetchone()[0]
    state = {'order_id': order_id, 'calls': [], 'chain_id': 'testnet',
             'http_status': 200, 'delay': 0, 'result': copy.deepcopy({
                 'transaction': TRANSACTION, 'final_execution_status': 'FINAL',
                 'status': {'SuccessValue': ''}, 'transaction_outcome': OUTCOME,
                 'receipts_outcome': [RECEIPT],
             })}

    @mockserver.handler('/near-rpc')
    async def rpc(request):
        body = request.json
        assert body['jsonrpc'] == '2.0' and body['id'] == 'payment-verification'
        state['calls'].append(body['method'])
        if body['method'] == 'status':
            assert body['params'] == []
            result = {'chain_id': state['chain_id']}
        else:
            assert body['method'] == 'tx'
            assert body['params'] == {'tx_hash': HASH, 'sender_account_id': 'buyer.testnet',
                                      'wait_until': 'FINAL'}
            await asyncio.sleep(state['delay'])
            result = state['result']
        reply = {'jsonrpc': '2.0', 'id': body['id'], 'result': result}
        if body['method'] == 'tx':
            reply = state.get('reply', reply)
        return mockserver.make_response(status=state['http_status'], json=reply)

    return state


async def verify(service_client, state, **changes):
    return await service_client.post(
        f"/orders/{state['order_id']}/verify-payment", json={**REQUEST, **changes},
    )


def assert_unpaid(pgsql, state):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT status FROM orders WHERE id = %s', (state['order_id'],))
        assert cursor.fetchone() == ('pending_payment',)


async def test_verifies_saved_amount_without_recording_payment(service_client, pgsql, near_rpc):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE products SET price_yocto = 1 WHERE id = 'toilet-paper'")
    response = await verify(service_client, near_rpc)
    assert response.status == 200
    assert response.json() == {
        'verified': True, 'order_id': near_rpc['order_id'], 'transaction_hash': HASH,
        'sender_id': 'buyer.testnet', 'network_id': 'testnet', 'order_status': 'pending_payment',
    }
    assert near_rpc['calls'] == ['status', 'tx']
    assert_unpaid(pgsql, near_rpc)


@pytest.mark.parametrize(('field', 'value', 'status', 'error'), [
    ('transaction', {**TRANSACTION, 'hash': 'B' * 44}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'signer_id': 'other.testnet'}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'receiver_id': 'other.testnet'}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'actions': [{'Transfer': {'deposit': '1'}}]}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'actions': TRANSACTION['actions'] * 2}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'actions': [{'FunctionCall': {}}]}, 409, 'transaction_mismatch'),
    ('transaction', {**TRANSACTION, 'actions': [{'Transfer': {'deposit': 2}}]}, 502, 'invalid_rpc_response'),
    ('final_execution_status', 'EXECUTED_OPTIMISTIC', 202, 'transaction_pending'),
    ('final_execution_status', 'NONE', 202, 'transaction_pending'),
    ('final_execution_status', 'INCLUDED', 202, 'transaction_pending'),
    ('final_execution_status', 'INCLUDED_FINAL', 202, 'transaction_pending'),
    ('final_execution_status', 'EXECUTED', 202, 'transaction_pending'),
    ('final_execution_status', 'unrecognized', 502, 'invalid_rpc_response'),
    ('status', {'Failure': {'ActionError': {}}}, 409, 'transaction_failed'),
    ('status', {'SuccessValue': 123}, 502, 'invalid_rpc_response'),
    ('receipts_outcome', [], 502, 'invalid_rpc_response'),
    ('receipts_outcome', [RECEIPT, RECEIPT], 502, 'invalid_rpc_response'),
    ('receipts_outcome', [{'id': RECEIPT_ID, 'outcome': {
        'executor_id': 'other.testnet', 'status': {'SuccessValue': ''},
    }}], 502, 'invalid_rpc_response'),
    ('receipts_outcome', [{'id': RECEIPT_ID, 'outcome': {
        'executor_id': 'merchant.testnet', 'status': {'Failure': {}},
    }}], 409, 'transaction_failed'),
    ('transaction_outcome', {**OUTCOME, 'id': 'B' * 44}, 502, 'invalid_rpc_response'),
])
async def test_rejects_unverified_transfers(service_client, pgsql, near_rpc, field, value, status, error):
    near_rpc['result'][field] = copy.deepcopy(value)
    response = await verify(service_client, near_rpc)
    assert response.status == status
    assert response.json() == {'error': error}
    assert_unpaid(pgsql, near_rpc)


def rpc_error(name, code=-32000):
    return {'jsonrpc': '2.0', 'id': 'payment-verification', 'error': {
        'code': code, 'message': 'Server error', 'cause': {'name': name},
    }}


@pytest.mark.parametrize(('reply', 'status', 'error'), [
    ([], 502, 'invalid_rpc_response'),
    ({'jsonrpc': '2.0', 'id': 'wrong', 'result': {}}, 502, 'invalid_rpc_response'),
    ({**rpc_error('UNKNOWN_TRANSACTION'), 'result': {}}, 502, 'invalid_rpc_response'),
    (rpc_error('UNKNOWN_TRANSACTION'), 404, 'transaction_not_found'),
    (rpc_error('TIMEOUT_ERROR'), 202, 'transaction_pending'),
    (rpc_error('INVALID_TRANSACTION'), 409, 'transaction_failed'),
    (rpc_error('INTERNAL_ERROR'), 503, 'rpc_unavailable'),
    (rpc_error('INVALID_PARAMS', -32602), 400, 'invalid_request'),
])
async def test_rpc_errors_fail_closed(service_client, pgsql, near_rpc, reply, status, error):
    near_rpc['reply'] = reply
    response = await verify(service_client, near_rpc)
    assert response.status == status
    assert response.json() == {'error': error}
    assert_unpaid(pgsql, near_rpc)


@pytest.mark.parametrize(('changes', 'status', 'error'), [
    ({'chain_id': 'mainnet'}, 502, 'rpc_wrong_network'),
    ({'http_status': 503}, 503, 'rpc_unavailable'),
    ({'delay': 1}, 504, 'rpc_timeout'),
])
async def test_wrong_network_and_transport_errors(service_client, near_rpc, changes, status, error):
    near_rpc.update(changes)
    response = await verify(service_client, near_rpc)
    assert response.status == status
    assert response.json() == {'error': error}
    if 'chain_id' in changes:
        assert near_rpc['calls'] == ['status']


@pytest.mark.parametrize('changes', [
    {'transaction_hash': 'bad'}, {'transaction_hash': '0' * 44},
    {'transaction_hash': 'A' * 45}, {'transaction_hash': 1},
    {'sender_id': 'Bad.testnet'}, {'sender_id': 'system'},
    {'sender_id': ''}, {'sender_id': 'a' * 65}, {'receiver_id': 'other.testnet'},
    {'amount_yocto': '1'},
])
async def test_invalid_request_does_not_call_rpc(service_client, near_rpc, changes):
    response = await verify(service_client, near_rpc, **changes)
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}
    assert near_rpc['calls'] == []


@pytest.mark.parametrize('body', ['{', '{}', '[]', 'null'])
async def test_malformed_request_does_not_call_rpc(service_client, near_rpc, body):
    response = await service_client.post(
        f"/orders/{near_rpc['order_id']}/verify-payment", data=body,
    )
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}
    assert near_rpc['calls'] == []


async def test_missing_or_unconfigured_order_does_not_call_rpc(service_client, pgsql, near_rpc):
    missing = await service_client.post(f'/orders/{uuid.uuid4()}/verify-payment', json=REQUEST)
    assert missing.status == 404
    assert missing.json() == {'error': 'order_not_found'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('UPDATE orders SET receiver_id = NULL WHERE id = %s', (near_rpc['order_id'],))
    response = await verify(service_client, near_rpc)
    assert response.status == 409
    assert response.json() == {'error': 'payment_not_configured'}
    assert near_rpc['calls'] == []


async def test_large_amount_is_compared_exactly(service_client, pgsql, near_rpc):
    amount = '123456789012345678901234567890123456789'
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'UPDATE orders SET unit_price_yocto = %s, total_yocto = %s, budget_yocto = %s '
            'WHERE id = %s', (amount, amount, amount, near_rpc['order_id']),
        )
    near_rpc['result']['transaction']['actions'][0]['Transfer']['deposit'] = amount
    response = await verify(service_client, near_rpc)
    assert response.status == 200
    assert_unpaid(pgsql, near_rpc)
