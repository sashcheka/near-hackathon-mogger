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
        assert cursor.fetchall() == [('20261024000100',), ('20261024000200',)]
        cursor.execute('SELECT count(*) FROM products')
        assert cursor.fetchone() == catalog_size
        cursor.execute('SELECT name FROM products WHERE id = %s', ('toilet-paper',))
        assert cursor.fetchone() == ('Existing custom name',)
