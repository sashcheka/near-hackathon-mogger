async def test_order_list_is_empty_for_a_new_buyer(service_client, buyer_token):
    response = await service_client.get('/orders', bearer=buyer_token)
    assert response.status == 200 and response.json() == {'orders': []}
    assert response.headers['Cache-Control'] == 'no-store'


async def test_order_list_filters_owner_and_preserves_saved_prices(service_client, pgsql, buyer_token):
    request = {'product_id': 'toilet-paper', 'quantity': 2,
               'budget_yocto': '5000000000000000000000000'}
    created = await service_client.post('/orders', json=request, bearer=buyer_token)
    assert created.status == 201
    saved_order = created.json()
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute("UPDATE products SET price_yocto = 1 WHERE id = 'toilet-paper'")
        for owner in ('other.testnet', None):
            cursor.execute(
                "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
                "budget_yocto, buyer_id) VALUES ('toilet-paper', 1, 1, 1, 1, %s)", (owner,))
    response = await service_client.get('/orders?buyer_id=other.testnet', bearer=buyer_token)
    assert response.status == 200 and response.json() == {'orders': [saved_order]}


async def test_order_list_returns_twenty_newest_orders(service_client, pgsql, buyer_token):
    ids = []
    with pgsql['treasury'].cursor() as cursor:
        for age in range(21):
            cursor.execute(
                "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
                "budget_yocto, buyer_id, created_at) VALUES "
                "('toilet-paper', 1, 1, 1, 1, 'buyer.testnet', "
                "now() - %s * interval '1 minute') RETURNING id::text", (age,))
            ids.append(cursor.fetchone()[0])
    response = await service_client.get('/orders', bearer=buyer_token)
    assert response.status == 200
    assert [order['id'] for order in response.json()['orders']] == ids[:20]


async def test_order_list_uses_id_to_break_timestamp_ties(service_client, pgsql, buyer_token):
    ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']
    with pgsql['treasury'].cursor() as cursor:
        for order_id in ids:
            cursor.execute(
                "INSERT INTO orders (id, product_id, quantity, unit_price_yocto, "
                "total_yocto, budget_yocto, buyer_id, created_at) VALUES "
                "(%s, 'toilet-paper', 1, 1, 1, 1, 'buyer.testnet', '2026-01-01T00:00:00Z')", (order_id,))
    response = await service_client.get('/orders', bearer=buyer_token)
    assert response.status == 200
    assert [order['id'] for order in response.json()['orders']] == ids[::-1]
