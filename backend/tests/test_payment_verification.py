import asyncio
import copy
import hashlib
import uuid

import pytest


HASH = 'A' * 44
RECEIPT_ID = '3' * 44
BLOCK_HASH = '7' * 44
AMOUNT = '2000000000000000000000000'
REQUEST = {'transaction_hash': HASH}
TRANSACTION = {
    'hash': HASH, 'signer_id': 'buyer.testnet', 'receiver_id': 'merchant.testnet',
    'actions': [{'Transfer': {'deposit': AMOUNT}}],
}
OUTCOME = {'id': HASH, 'block_hash': BLOCK_HASH,
           'outcome': {'status': {'SuccessReceiptId': RECEIPT_ID}}}
RECEIPT = {'id': RECEIPT_ID, 'outcome': {
    'executor_id': 'merchant.testnet', 'status': {'SuccessValue': ''},
}}


@pytest.fixture
def near_rpc(mockserver, pgsql, seed_catalog, buyer_token):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            "budget_yocto, receiver_id, buyer_id, created_at) VALUES "
            "(%s, 1, %s, %s, %s, %s, 'buyer.testnet', now() - interval '1 minute') RETURNING id::text",
            ('toilet-paper', AMOUNT, AMOUNT, AMOUNT, 'merchant.testnet'),
        )
        order_id = cursor.fetchone()[0]
        cursor.execute('SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000000000)::bigint::text')
        timestamp = cursor.fetchone()[0]
    state = {'order_id': order_id, 'token': buyer_token, 'calls': [], 'chain_id': 'testnet',
             'http_status': 200, 'delay': 0,
             'block': {'header': {'hash': BLOCK_HASH, 'timestamp_nanosec': timestamp}},
             'result': copy.deepcopy({
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
        elif body['method'] == 'tx':
            requested_hash = body['params']['tx_hash']
            assert requested_hash in (HASH, state.get('alternative_hash'))
            assert body['params'] == {'tx_hash': requested_hash, 'sender_account_id': 'buyer.testnet',
                                      'wait_until': 'FINAL'}
            await asyncio.sleep(state['delay'])
            result = state['result']
            if requested_hash != HASH:
                result = copy.deepcopy(result)
                result['transaction']['hash'] = requested_hash
                result['transaction_outcome']['id'] = requested_hash
        else:
            assert body['method'] == 'block'
            assert body['params'] == {'block_id': BLOCK_HASH}
            result = state['block']
            if barrier := state.get('block_barrier'):
                await barrier.wait()
            if callback := state.pop('before_block_reply', None):
                callback()
        reply = {'jsonrpc': '2.0', 'id': body['id'], 'result': result}
        if body['method'] == 'tx':
            reply = state.get('reply', reply)
        status = state.get('block_http_status', state['http_status']) if body['method'] == 'block' else state['http_status']
        return mockserver.make_response(status=status, json=reply)

    return state


async def verify(service_client, state, **changes):
    return await service_client.post(
        f"/orders/{state['order_id']}/verify-payment", json={**REQUEST, **changes},
        bearer=state['token'],
    )


async def test_cancelled_order_still_accepts_a_verified_transfer(service_client, pgsql, near_rpc):
    response = await service_client.delete(f"/orders/{near_rpc['order_id']}", bearer=near_rpc['token'])
    assert response.status == 200 and response.json()['status'] == 'cancelled'
    response = await verify(service_client, near_rpc)
    assert response.status == 200 and response.json()['order_status'] == 'paid'
    assert_paid(pgsql, near_rpc)


def assert_unpaid(pgsql, state):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT status FROM orders WHERE id = %s', (state['order_id'],))
        assert cursor.fetchone() == ('pending_payment',)
        cursor.execute('SELECT count(*) FROM payments WHERE order_id = %s', (state['order_id'],))
        assert cursor.fetchone() == (0,)


def assert_paid(pgsql, state, amount=AMOUNT):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'SELECT o.status, p.network_id, p.transaction_hash, p.sender_id, '
            'p.receiver_id, p.amount_yocto::text, p.block_hash, p.block_timestamp_ns::text '
            'FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = %s',
            (state['order_id'],))
        assert cursor.fetchone() == ('paid', 'testnet', HASH, 'buyer.testnet',
            'merchant.testnet', amount, BLOCK_HASH, state['block']['header']['timestamp_nanosec'])


async def test_records_saved_amount_and_marks_paid(service_client, pgsql, near_rpc):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE products SET price_yocto = 1 WHERE id = 'toilet-paper'")
    response = await verify(service_client, near_rpc)
    assert response.status == 200
    assert response.json() == {
        'verified': True, 'order_id': near_rpc['order_id'], 'transaction_hash': HASH,
        'sender_id': 'buyer.testnet', 'network_id': 'testnet', 'order_status': 'paid',
    }
    assert near_rpc['calls'] == ['status', 'tx', 'block']
    assert_paid(pgsql, near_rpc)
    details = await service_client.get(f"/orders/{near_rpc['order_id']}", bearer=near_rpc['token'])
    history = await service_client.get('/orders', bearer=near_rpc['token'])
    assert details.json()['status'] == 'paid'
    assert details.json()['transaction_hash'] == HASH
    assert history.json()['orders'][0]['status'] == 'paid'
    other_token = 'C' * 44
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('INSERT INTO auth_sessions (token_hash, account_id) VALUES (%s, %s)',
                       (hashlib.sha256(other_token.encode()).hexdigest(), 'other.testnet'))
    foreign = await service_client.get(f"/orders/{near_rpc['order_id']}", bearer=other_token)
    assert foreign.status == 404
    assert foreign.json() == {'error': 'order_not_found'}


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
    {'sender_id': 'buyer.testnet'},
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
        bearer=near_rpc['token'],
    )
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}
    assert near_rpc['calls'] == []


async def test_missing_or_unconfigured_order_does_not_call_rpc(service_client, pgsql, near_rpc):
    missing = await service_client.post(f'/orders/{uuid.uuid4()}/verify-payment', json=REQUEST,
                                        bearer=near_rpc['token'])
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
    assert_paid(pgsql, near_rpc, amount)


@pytest.mark.parametrize('timestamp', [None, 123, '', '0', '-1', '+1', '01', '1e9',
                                      '18446744073709551616', '1' * 21])
async def test_invalid_block_time_is_rejected(service_client, pgsql, near_rpc, timestamp):
    near_rpc['block']['header']['timestamp_nanosec'] = timestamp
    response = await verify(service_client, near_rpc)
    assert response.status == 502 and response.json() == {'error': 'invalid_rpc_response'}
    assert_unpaid(pgsql, near_rpc)


async def test_block_must_match_transaction_outcome(service_client, pgsql, near_rpc):
    near_rpc['block']['header']['hash'] = '8' * 44
    response = await verify(service_client, near_rpc)
    assert response.status == 502 and response.json() == {'error': 'invalid_rpc_response'}
    assert_unpaid(pgsql, near_rpc)


async def test_missing_outcome_block_is_rejected(service_client, pgsql, near_rpc):
    del near_rpc['result']['transaction_outcome']['block_hash']
    response = await verify(service_client, near_rpc)
    assert response.status == 502 and response.json() == {'error': 'invalid_rpc_response'}
    assert near_rpc['calls'] == ['status', 'tx']
    assert_unpaid(pgsql, near_rpc)


def copy_order(pgsql, order_id):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            'budget_yocto, receiver_id, buyer_id, created_at) '
            'SELECT product_id, quantity, unit_price_yocto, total_yocto, budget_yocto, '
            'receiver_id, buyer_id, created_at FROM orders WHERE id = %s RETURNING id::text',
            (order_id,))
        return cursor.fetchone()[0]


async def test_repeat_returns_saved_result_when_rpc_is_down(service_client, pgsql, near_rpc):
    first = await verify(service_client, near_rpc)
    assert first.status == 200
    near_rpc.update(http_status=503, calls=[])
    repeated = await verify(service_client, near_rpc)
    assert repeated.status == 200 and repeated.json() == first.json()
    assert near_rpc['calls'] == []
    assert_paid(pgsql, near_rpc)


async def test_paid_order_rejects_another_transaction(service_client, pgsql, near_rpc):
    assert (await verify(service_client, near_rpc)).status == 200
    near_rpc['calls'].clear()
    response = await verify(service_client, near_rpc, transaction_hash='B' * 44)
    assert response.status == 409 and response.json() == {'error': 'order_already_paid'}
    assert near_rpc['calls'] == []
    assert_paid(pgsql, near_rpc)


async def test_transaction_cannot_pay_a_second_order(service_client, pgsql, near_rpc):
    second_id = copy_order(pgsql, near_rpc['order_id'])
    assert (await verify(service_client, near_rpc)).status == 200
    second = {**near_rpc, 'order_id': second_id}
    response = await verify(service_client, second)
    assert response.status == 409 and response.json() == {'error': 'transaction_already_used'}
    assert_unpaid(pgsql, second)
    assert_paid(pgsql, near_rpc)


@pytest.mark.parametrize('offset', [-1, 0, 1])
async def test_transfer_must_follow_order_creation_exactly(service_client, pgsql, near_rpc, offset):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE orders SET created_at = '2026-01-01T00:00:00Z' WHERE id = %s",
                       (near_rpc['order_id'],))
    near_rpc['block']['header']['timestamp_nanosec'] = str(1767225600000000000 + offset)
    response = await verify(service_client, near_rpc)
    if offset > 0:
        assert response.status == 200
        assert_paid(pgsql, near_rpc)
    else:
        assert response.status == 409 and response.json() == {'error': 'transaction_before_order'}
        assert_unpaid(pgsql, near_rpc)


async def test_block_lookup_failure_records_nothing(service_client, pgsql, near_rpc):
    near_rpc['block_http_status'] = 503
    response = await verify(service_client, near_rpc)
    assert response.status == 503 and response.json() == {'error': 'rpc_unavailable'}
    assert_unpaid(pgsql, near_rpc)


@pytest.mark.parametrize('barrier', [False, True])
async def test_concurrent_same_payment_is_idempotent(service_client, pgsql, near_rpc, barrier):
    if barrier:
        near_rpc['block_barrier'] = asyncio.Barrier(2)
    responses = await asyncio.gather(verify(service_client, near_rpc), verify(service_client, near_rpc))
    assert [response.status for response in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    assert_paid(pgsql, near_rpc)


async def test_concurrent_orders_cannot_share_a_payment(service_client, pgsql, near_rpc):
    second_id = copy_order(pgsql, near_rpc['order_id'])
    near_rpc['block_barrier'] = asyncio.Barrier(2)
    responses = await asyncio.gather(
        verify(service_client, near_rpc), verify(service_client, {**near_rpc, 'order_id': second_id}))
    assert sorted(response.status for response in responses) == [200, 409]
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM payments')
        assert cursor.fetchone() == (1,)
        cursor.execute('SELECT status FROM orders ORDER BY status')
        assert cursor.fetchall() == [('paid',), ('pending_payment',)]


async def test_concurrent_transfers_cannot_pay_one_order_twice(service_client, pgsql, near_rpc):
    near_rpc.update(block_barrier=asyncio.Barrier(2), alternative_hash='B' * 44)
    responses = await asyncio.gather(
        verify(service_client, near_rpc), verify(service_client, near_rpc, transaction_hash='B' * 44))
    assert sorted(response.status for response in responses) == [200, 409]
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT transaction_hash FROM payments')
        payments = cursor.fetchall()
        assert len(payments) == 1 and payments[0][0] in (HASH, 'B' * 44)
        cursor.execute('SELECT status FROM orders')
        assert cursor.fetchone() == ('paid',)


@pytest.mark.parametrize('field', ['receiver', 'amount'])
async def test_order_snapshot_is_rechecked_after_rpc(service_client, pgsql, near_rpc, field):
    def change_order():
        with pgsql['treasury'].cursor() as cursor:
            sql = ("UPDATE orders SET receiver_id = 'other.testnet' WHERE id = %s" if field == 'receiver'
                   else 'UPDATE orders SET unit_price_yocto = 1, total_yocto = 1 WHERE id = %s')
            cursor.execute(sql, (near_rpc['order_id'],))
    near_rpc['before_block_reply'] = change_order
    response = await verify(service_client, near_rpc)
    assert response.status == 409 and response.json() == {'error': 'order_changed'}
    assert_unpaid(pgsql, near_rpc)
