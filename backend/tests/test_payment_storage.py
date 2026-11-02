import psycopg2.errors
import pytest


def create_order(cursor):
    cursor.execute(
        "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
        "budget_yocto, buyer_id, receiver_id) VALUES "
        "('toilet-paper', 1, 2, 2, 3, 'buyer.testnet', 'merchant.testnet') RETURNING id",
    )
    return cursor.fetchone()[0]


def insert_payment(cursor, order_id, tx_hash='A' * 44):
    cursor.execute(
        "INSERT INTO payments (order_id, network_id, transaction_hash, sender_id, "
        "receiver_id, amount_yocto, block_hash, block_timestamp_ns) VALUES "
        "(%s, 'testnet', %s, 'buyer.testnet', 'merchant.testnet', 2, %s, 1)",
        (order_id, tx_hash, '3' * 44),
    )


def test_database_rejects_reused_transaction(pgsql):
    with pgsql['treasury'].cursor() as cursor:
        first, second = create_order(cursor), create_order(cursor)
        insert_payment(cursor, first)
        with pytest.raises(psycopg2.errors.UniqueViolation):
            insert_payment(cursor, second)


def test_database_rejects_second_payment_for_one_order(pgsql):
    with pgsql['treasury'].cursor() as cursor:
        order_id = create_order(cursor)
        insert_payment(cursor, order_id)
        with pytest.raises(psycopg2.errors.UniqueViolation):
            insert_payment(cursor, order_id, 'B' * 44)


def test_database_preserves_unpaid_status_on_schema_migration(pgsql, migrate_database):
    database = pgsql['treasury']
    with database.cursor() as cursor:
        order_id = create_order(cursor)
        cursor.execute('DROP TABLE payments')
        cursor.execute('ALTER TABLE orders DROP CONSTRAINT orders_status_check')
        cursor.execute("ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status = 'pending_payment')")
        cursor.execute("DELETE FROM schema_migrations WHERE version = '20261103000100'")
    migrate_database(database.conninfo)
    with database.cursor() as cursor:
        cursor.execute('SELECT status, total_yocto FROM orders WHERE id = %s', (order_id,))
        assert cursor.fetchone() == ('pending_payment', 2)
        cursor.execute('SELECT count(*) FROM payments')
        assert cursor.fetchone() == (0,)
