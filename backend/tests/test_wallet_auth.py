import asyncio
import base64
import hashlib
import struct
import subprocess

import pytest


# RFC 8032 test vector: public test material, never a real wallet key.
SEED = bytes.fromhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
KEY_BYTES = bytes.fromhex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def base58(value):
    number, result = int.from_bytes(value, 'big'), ''
    while number:
        number, digit = divmod(number, 58)
        result = ALPHABET[digit] + result
    return '1' * (len(value) - len(value.lstrip(b'\0'))) + result


PUBLIC_KEY = 'ed25519:' + base58(KEY_BYTES)


def sign(challenge, tmp_path, **changes):
    challenge = {**challenge, **changes}
    def string(value):
        data = value.encode()
        return struct.pack('<I', len(data)) + data
    payload = (struct.pack('<I', 2147484061) + string(challenge['message']) +
               base64.b64decode(challenge['nonce']) + string(challenge['recipient']) + b'\0')
    key_file, hash_file = tmp_path / 'test-key.der', tmp_path / 'message.hash'
    key_file.write_bytes(bytes.fromhex('302e020100300506032b657004220420') + SEED)
    hash_file.write_bytes(hashlib.sha256(payload).digest())
    signature = subprocess.run(
        ['openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(key_file),
         '-keyform', 'DER', '-in', str(hash_file)],
        check=True, capture_output=True,
    ).stdout
    return {'nonce': challenge['nonce'], 'public_key': PUBLIC_KEY,
            'signature': base64.b64encode(signature).decode()}


@pytest.fixture
def auth_rpc(mockserver, pgsql):
    state = {'calls': [], 'chain_id': 'testnet', 'permission': 'FullAccess',
             'account_id': 'buyer.testnet', 'http_status': 200}

    @mockserver.handler('/near-rpc')
    def rpc(request):
        body = request.json
        state['calls'].append(body['method'])
        if body['method'] == 'status':
            result = {'chain_id': state['chain_id']}
        else:
            assert body['method'] == 'query'
            assert body['params'] == {
                'request_type': 'view_access_key', 'finality': 'final',
                'account_id': state['account_id'], 'public_key': PUBLIC_KEY,
            }
            result = {'permission': state['permission'], 'nonce': 1}
            if state.get('expire_during_rpc'):
                with pgsql['treasury'].cursor() as cursor:
                    cursor.execute("UPDATE auth_challenges SET expires_at = now() - interval '1 second'")
        reply = {'jsonrpc': '2.0', 'id': body['id'], 'result': result}
        if 'error' in state:
            reply = {'jsonrpc': '2.0', 'id': body['id'], 'error': state['error']}
        return mockserver.make_response(status=state['http_status'], json=reply)
    return state


async def challenge(service_client, account='buyer.testnet'):
    response = await service_client.post('/auth/challenge', json={'account_id': account})
    assert response.status == 201
    assert response.headers['Cache-Control'] == 'no-store'
    body = response.json()
    assert len(base64.b64decode(body['nonce'])) == 32
    assert body['expires_in'] == 300 and body['recipient'] == 'localhost:5173'
    return body


async def test_signed_challenge_creates_session_once(service_client, pgsql, auth_rpc, tmp_path):
    body = await challenge(service_client)
    proof = sign(body, tmp_path)
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 200
    assert response.headers['Cache-Control'] == 'no-store'
    session = response.json()
    assert session['account_id'] == 'buyer.testnet' and session['expires_in'] == 3600
    token = session['token']
    assert len(base64.b64decode(token)) == 32
    headers = {'Authorization': 'Bearer ' + token}
    status = await service_client.get('/auth/session', headers=headers)
    assert status.status == 200 and status.json() == {'account_id': 'buyer.testnet'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT token_hash FROM auth_sessions')
        assert cursor.fetchall() == [(hashlib.sha256(token.encode()).hexdigest(),)]
        cursor.execute('SELECT count(*) FROM auth_challenges')
        assert cursor.fetchone() == (0,)
    replay = await service_client.post('/auth/verify', json=proof)
    assert replay.status == 401 and replay.json() == {'error': 'invalid_challenge'}
    assert auth_rpc['calls'] == ['status', 'query']
    revoked = await service_client.delete('/auth/session', headers=headers)
    assert revoked.status == 200
    assert (await service_client.get('/auth/session', headers=headers)).status == 401


@pytest.mark.parametrize('change', [
    {'message': 'Different message'}, {'recipient': 'attacker.example'},
])
async def test_wrong_signed_payload(service_client, auth_rpc, tmp_path, change):
    proof = sign(await challenge(service_client), tmp_path, **change)
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 401
    assert auth_rpc['calls'] == []


@pytest.mark.parametrize('change', [
    {'signature': '!' * 88}, {'signature': base64.b64encode(bytes(64)).decode()},
    {'public_key': 'ed25519:' + '1' * 33}, {'public_key': 'ed25519:0' * 8},
    {'public_key': PUBLIC_KEY.replace('ed25519:', 'secp256k1:')},
    {'public_key': 'ed25519:' + 'z' * 44},
])
async def test_bad_signature_encoding_or_key(service_client, auth_rpc, tmp_path, change):
    proof = {**sign(await challenge(service_client), tmp_path), **change}
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 401
    assert auth_rpc['calls'] == []


@pytest.mark.parametrize(('change', 'status'), [
    ({'permission': {'FunctionCall': {}}}, 401),
    ({'chain_id': 'mainnet'}, 502), ({'http_status': 503}, 503),
    ({'error': {'code': -32000, 'cause': {'name': 'UNKNOWN_ACCESS_KEY'}}}, 401),
    ({'error': {'code': -32000, 'cause': {'name': 'UNKNOWN_ACCOUNT'}}}, 401),
    ({'error': {'code': -32000, 'cause': {'name': 'INTERNAL_ERROR'}}}, 503),
])
async def test_rpc_does_not_authenticate_unverified_account(
        service_client, pgsql, auth_rpc, tmp_path, change, status):
    auth_rpc.update(change)
    proof = sign(await challenge(service_client), tmp_path)
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == status
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM auth_sessions')
        assert cursor.fetchone() == (0,)


@pytest.mark.parametrize('during_rpc', [False, True])
async def test_expiry_is_rechecked(service_client, pgsql, auth_rpc, tmp_path, during_rpc):
    proof = sign(await challenge(service_client), tmp_path)
    if during_rpc:
        auth_rpc['expire_during_rpc'] = True
    else:
        with pgsql['treasury'].cursor() as cursor:
            cursor.execute("UPDATE auth_challenges SET expires_at = now() - interval '1 second'")
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 401 and response.json() == {'error': 'invalid_challenge'}
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute('SELECT count(*) FROM auth_sessions')
        assert cursor.fetchone() == (0,)


async def test_concurrent_verification_is_single_use(service_client, auth_rpc, tmp_path):
    proof = sign(await challenge(service_client), tmp_path)
    responses = await asyncio.gather(*[
        service_client.post('/auth/verify', json=proof) for _ in range(2)
    ])
    assert sorted(response.status for response in responses) == [200, 401]


async def test_nonce_account_binding(service_client, auth_rpc, tmp_path):
    first = await challenge(service_client)
    second = await challenge(service_client, 'other.testnet')
    proof = {**sign(first, tmp_path), 'nonce': second['nonce']}
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 401
    assert auth_rpc['calls'] == []


@pytest.mark.parametrize('body', [{}, [], {'account_id': 'Bad.testnet'},
                                  {'account_id': 'system'}, {'account_id': 1},
                                  {'account_id': 'buyer.testnet', 'extra': 1}])
async def test_invalid_challenge_input(service_client, body):
    response = await service_client.post('/auth/challenge', json=body)
    assert response.status == 400


async def test_expired_session(service_client, pgsql, auth_rpc, tmp_path):
    response = await service_client.post('/auth/verify', json=sign(
        await challenge(service_client), tmp_path))
    token = response.json()['token']
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE auth_sessions SET expires_at = now() - interval '1 second'")
    response = await service_client.get('/auth/session', headers={'Authorization': 'Bearer ' + token})
    assert response.status == 401


@pytest.mark.parametrize('body', ['{', '[]', '{}', 'null'])
async def test_invalid_verify_body(service_client, auth_rpc, body):
    response = await service_client.post('/auth/verify', data=body)
    assert response.status == 400
    assert auth_rpc['calls'] == []


@pytest.mark.parametrize('header', ['', 'Bearer short', 'Basic ' + 'A' * 44])
async def test_invalid_session_token(service_client, header):
    response = await service_client.get('/auth/session', headers={'Authorization': header})
    assert response.status == 401


async def test_signature_rejects_different_nonce(service_client, auth_rpc, tmp_path):
    first, second = await challenge(service_client), await challenge(service_client)
    proof = {**sign(first, tmp_path), 'nonce': second['nonce']}
    response = await service_client.post('/auth/verify', json=proof)
    assert response.status == 401 and auth_rpc['calls'] == []
