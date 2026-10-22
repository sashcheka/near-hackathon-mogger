import pytest

from testsuite.databases.pgsql import discover

pytest_plugins = ['pytest_userver.plugins.postgresql']


@pytest.fixture(scope='session')
def pgsql_local(service_source_dir, pgsql_local_create):
    databases = discover.find_schemas(
        'community_treasury', [service_source_dir / 'db'],
    )
    return pgsql_local_create(list(databases.values()))


@pytest.fixture(autouse=True)
def seed_catalog(pgsql, service_source_dir):
    # The testsuite clears tables between tests; restore the demo catalog.
    with pgsql['treasury'].cursor() as cursor:
        cursor.execute((service_source_dir / 'db/treasury.sql').read_text())
