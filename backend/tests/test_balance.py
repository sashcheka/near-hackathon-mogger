import pytest


@pytest.fixture
def balance_rpc(mockserver):
    state = {'chain_id': 'testnet', 'amount': '2000245500818750000000000', 'calls': []}

    @mockserver.handler('/balance-rpc')
    def rpc(request):
        body = request.json
        state['calls'].append(body['method'])
        if body['method'] == 'status':
            assert body['params'] == []
            result = {'chain_id': state['chain_id']}
        else:
            assert body['params'] == {'request_type': 'view_account', 'finality': 'final',
                                      'account_id': 'buyer.testnet'}
            result = {'amount': state['amount']}
        return mockserver.make_response(json={'jsonrpc': '2.0', 'id': body['id'], 'result': result})

    return state


async def test_balance_reads_exact_testnet_amount(service_client, balance_rpc):
    response = await service_client.get('/wallets/buyer.testnet/balance')
    assert response.status == 200
    assert response.json() == {'network_id': 'testnet', 'account_id': 'buyer.testnet',
                               'amount_yocto': balance_rpc['amount']}
    assert response.headers['Cache-Control'] == 'no-store'
    assert balance_rpc['calls'] == ['status', 'query']


@pytest.mark.parametrize('amount', ['', '01', '-1', '1e24', '9' * 40, 1])
async def test_rejects_invalid_rpc_amount(service_client, balance_rpc, amount):
    balance_rpc['amount'] = amount
    response = await service_client.get('/wallets/buyer.testnet/balance')
    assert response.status == 502 and response.json() == {'error': 'balance_unavailable'}


async def test_zero_and_wrong_network(service_client, balance_rpc):
    balance_rpc['amount'] = '0'
    assert (await service_client.get('/wallets/buyer.testnet/balance')).json()['amount_yocto'] == '0'
    balance_rpc['chain_id'] = 'mainnet'
    response = await service_client.get('/wallets/buyer.testnet/balance')
    assert response.status == 502 and response.json() == {'error': 'balance_unavailable'}


async def test_invalid_account_never_calls_rpc(service_client, balance_rpc):
    response = await service_client.get('/wallets/bad..testnet/balance')
    assert response.status == 400 and response.json() == {'error': 'invalid_request'}
    assert balance_rpc['calls'] == []
