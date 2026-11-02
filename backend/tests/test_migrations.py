def test_adopt_existing_catalog_and_repeat_migration(pgsql, migrate_database):
    database = pgsql['treasury']
    with database.cursor() as cursor:
        # Simulate the catalog without its initial migration record.
        cursor.execute(
            'DELETE FROM schema_migrations WHERE version = %s',
            ('20261024000100',),
        )
        cursor.execute(
            'UPDATE products SET name = %s WHERE id = %s',
            ('Existing custom name', 'toilet-paper'),
        )
        cursor.execute('SELECT count(*) FROM products')
        catalog_size = cursor.fetchone()

    migrate_database(database.conninfo)
    migrate_database(database.conninfo)

    with database.cursor() as cursor:
        cursor.execute('SELECT version FROM schema_migrations ORDER BY version')
        assert cursor.fetchall() == [
            ('20261024000100',), ('20261024000200',), ('20261028000100',),
            ('20261102000100',), ('20261102000200',),
            ('20261103000100',), ('20261103000200',),
        ]
        cursor.execute('SELECT count(*) FROM products')
        assert cursor.fetchone() == catalog_size
        cursor.execute('SELECT name FROM products WHERE id = %s', ('toilet-paper',))
        assert cursor.fetchone() == ('Existing custom name',)


def test_buyer_migration_preserves_unowned_orders(pgsql, migrate_database):
    database = pgsql['treasury']
    with database.cursor() as cursor:
        cursor.execute('ALTER TABLE orders DROP COLUMN buyer_id')
        cursor.execute("DELETE FROM schema_migrations WHERE version = '20261102000200'")
        cursor.execute(
            "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
            "budget_yocto) VALUES ('toilet-paper', 1, 2, 2, 3) RETURNING id",
        )
        order_id = cursor.fetchone()[0]
    migrate_database(database.conninfo)
    with database.cursor() as cursor:
        cursor.execute('SELECT buyer_id, total_yocto, status FROM orders WHERE id = %s',
                       (order_id,))
        assert cursor.fetchone() == (None, 2, 'pending_payment')


def test_lower_demo_prices_preserves_custom_prices_and_saved_orders(
        pgsql, migrate_database, service_source_dir):
    database = pgsql['treasury']
    old_price = '2000000000000000000000000'
    with database.cursor() as cursor:
        cursor.execute("DELETE FROM schema_migrations WHERE version = '20261103000200'")
        cursor.execute('SELECT id, price_yocto FROM products ORDER BY id')
        expected = cursor.fetchall()
        cursor.execute('UPDATE products SET price_yocto = price_yocto * 100')
        cursor.execute("UPDATE products SET price_yocto = 7 WHERE id = 'groceries'")
        cursor.execute(
            'INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, '
            "budget_yocto) VALUES ('toilet-paper', 1, %s, %s, %s) RETURNING id",
            (old_price, old_price, old_price),
        )
        order_id = cursor.fetchone()[0]

    migrate_database(database.conninfo)
    migrate_database(database.conninfo)
    with database.cursor() as cursor:
        cursor.execute((service_source_dir / 'db/seed.sql').read_text())
        cursor.execute('SELECT id, price_yocto FROM products ORDER BY id')
        assert cursor.fetchall() == [
            (product_id, 7 if product_id == 'groceries' else price)
            for product_id, price in expected
        ]
        cursor.execute(
            'SELECT unit_price_yocto::text, total_yocto::text, budget_yocto::text, '
            'status FROM orders WHERE id = %s', (order_id,),
        )
        assert cursor.fetchone() == (old_price, old_price, old_price, 'pending_payment')
