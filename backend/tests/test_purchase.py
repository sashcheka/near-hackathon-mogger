import asyncio
import json

import pytest


REQUEST = {'prompt': 'Buy one pack of toilet paper',
           'budget_yocto': '3000000000000000000000000'}


@pytest.fixture
def ollama(mockserver):
    state = {'content': '{"product_id":"toilet-paper","quantity":1}',
             'status': 200, 'delay': 0, 'done': True, 'calls': 0}

    @mockserver.handler('/api/chat')
    async def chat(request):
        state['calls'] += 1
        body = request.json
        assert body['model'] == 'test-model'
        assert body['stream'] is False and body['think'] is False
        assert body['format']['additionalProperties'] is False
        data = json.loads(body['messages'][1]['content'])
        assert data['request'] == REQUEST['prompt']
        assert {item['id'] for item in data['catalog']} == {
            'toilet-paper', 'groceries', 'premium-paper',
        }
        await asyncio.sleep(state['delay'])
        return mockserver.make_response(status=state['status'], json={
            'done': state['done'], 'message': {'content': state['content']},
        })

    return state


async def test_model_creates_unpaid_order(service_client, pgsql, ollama):
    response = await service_client.post('/purchase-requests', json=REQUEST)
    assert response.status == 201
    order = response.json()
    assert order['product_id'] == 'toilet-paper'
    assert order['quantity'] == 1
    assert order['total_yocto'] == '2000000000000000000000000'
    assert order['status'] == 'pending_payment'
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT id::text FROM orders')
        assert cursor.fetchall() == [(order['id'],)]


@pytest.mark.parametrize(('changes', 'status', 'error'), [
    ({'content': 'not JSON'}, 502, 'invalid_model_response'),
    ({'content': '{"product_id":"made-up","quantity":1}'}, 502, 'invalid_model_response'),
    ({'content': '{"product_id":"toilet-paper","quantity":0}'}, 502, 'invalid_model_response'),
    ({'content': '{"product_id":null,"quantity":1}'}, 404, 'no_matching_product'),
    ({'content': '{"product_id":"premium-paper","quantity":1}'}, 409, 'budget_exceeded'),
    ({'content': '{"product_id":"toilet-paper","quantity":1,"price":1}'}, 502, 'invalid_model_response'),
    ({'done': False}, 502, 'invalid_model_response'),
    ({'status': 500}, 503, 'model_unavailable'),
    ({'delay': 1}, 504, 'model_timeout'),
])
async def test_model_failure_creates_no_order(service_client, pgsql, ollama, changes, status, error):
    ollama.update(changes)
    response = await service_client.post('/purchase-requests', json=REQUEST)
    assert response.status == status
    assert response.json() == {'error': error}
    assert ollama['calls'] == 1
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM orders')
        assert cursor.fetchone() == (0,)


@pytest.mark.parametrize('changes', [
    {'prompt': ''}, {'prompt': '   '}, {'prompt': 'a' * 2001},
    {'budget_yocto': '0'}, {'budget_yocto': '1e30'}, {'budget_yocto': 3},
    {'product_id': 'toilet-paper'},
])
async def test_invalid_purchase_does_not_call_model(service_client, ollama, changes):
    response = await service_client.post('/purchase-requests', json={**REQUEST, **changes})
    assert response.status == 400
    assert response.json() == {'error': 'invalid_request'}
    assert ollama['calls'] == 0


async def test_empty_catalog_does_not_call_model(service_client, pgsql, ollama):
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('DELETE FROM products')
    response = await service_client.post('/purchase-requests', json=REQUEST)
    assert response.status == 404
    assert response.json() == {'error': 'no_matching_product'}
    assert ollama['calls'] == 0
