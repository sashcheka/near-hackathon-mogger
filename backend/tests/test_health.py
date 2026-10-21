async def test_health(service_client):
    response = await service_client.get('/health')

    assert response.status == 200
    assert response.headers['Content-Type'].split(';', 1)[0] == 'application/json'
    assert response.json() == {'status': 'ok'}
