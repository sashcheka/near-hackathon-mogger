async def test_merchant_account_is_required_and_saved_per_order(service_client, pgsql, buyer_token):
    request = {'product_id': 'milk-whole', 'quantity': 1,
               'budget_yocto': '30000000000000000000000'}
    blocked = await service_client.post('/orders', json=request, bearer=buyer_token)
    assert blocked.status == 409 and blocked.json() == {'error': 'merchant_not_configured'}
    products = (await service_client.get('/products')).json()['products']
    assert next(product for product in products if product['id'] == 'milk-whole')['merchant_ready'] is False
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE merchants SET account_id = 'fresh.testnet' WHERE id = 'fresh'")
    products = (await service_client.get('/products')).json()['products']
    assert next(product for product in products if product['id'] == 'milk-whole')['merchant_ready'] is True
    created = await service_client.post('/orders', json=request, bearer=buyer_token)
    assert created.status == 201
    order_id = created.json()['id']
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE merchants SET account_id = 'new-fresh.testnet' WHERE id = 'fresh'")
    details = await service_client.get(f'/orders/{order_id}', bearer=buyer_token)
    assert details.status == 200
    assert details.json()['payment']['receiver_id'] == 'fresh.testnet'
