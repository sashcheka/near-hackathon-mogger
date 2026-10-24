import os
import shutil
import subprocess

import pytest

from testsuite.databases.pgsql import discover

pytest_plugins = ['pytest_userver.plugins.postgresql']


@pytest.fixture(scope='session')
def userver_config_http_client(userver_config_http_client, mockserver_info):
    def patch(config, config_vars):
        userver_config_http_client(config, config_vars)
        components = config['components_manager']['components']
        components['handler-purchase']['ollama-url'] = mockserver_info.url('/api/chat')
        components['handler-purchase']['ollama-model'] = 'test-model'
        components['http-client-core']['testsuite-timeout'] = '500ms'

    return patch


@pytest.fixture(scope='session')
def migrate_database(service_source_dir):
    dbmate = shutil.which('dbmate')
    if dbmate is None:
        pytest.fail('dbmate is required; see backend/README.md migration setup')

    def migrate(conninfo):
        uri = conninfo.replace(sslmode=conninfo.sslmode or 'disable').get_uri()
        subprocess.run(
            [
                dbmate, '--no-dump-schema', '--migrations-dir',
                str(service_source_dir / 'db/migrations'), 'migrate',
            ],
            env={**os.environ, 'DATABASE_URL': uri},
            check=True,
        )

    return migrate


@pytest.fixture(scope='session')
def _pgsql_control(_pgsql_control, migrate_database):
    # Apply migrations after database creation, before testsuite discovers tables.
    initialize = _pgsql_control.initialize_sharded_db

    def initialize_with_migrations(database):
        initialize(database)
        for shard in database.shards:
            connection = _pgsql_control.get_connection_cached(shard.dbname)
            migrate_database(connection.conninfo)

    _pgsql_control.initialize_sharded_db = initialize_with_migrations
    try:
        yield _pgsql_control
    finally:
        _pgsql_control.initialize_sharded_db = initialize


@pytest.fixture(scope='session')
def pgsql_cleanup_exclude_tables():
    return frozenset({'public.schema_migrations'})


@pytest.fixture(scope='session')
def pgsql_local(pgsql_local_create):
    database = discover.PgShardedDatabase(
        service_name='community_treasury',
        dbname='treasury',
        shards=[discover.PgShard(
            shard_id=0, pretty_name='treasury',
            dbname='community_treasury_treasury', files=[], migrations=[],
        )],
    )
    return pgsql_local_create([database])


@pytest.fixture(autouse=True)
def seed_catalog(pgsql, service_source_dir):
    # The testsuite clears tables between tests; restore the demo catalog.
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute((service_source_dir / 'db/seed.sql').read_text())
