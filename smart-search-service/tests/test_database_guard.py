# Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""The guard that keeps the database tests away from anything but a local test database. They create and drop tables, so
the guard itself is tested."""

import os

import pytest

import conftest
from helpers import database_refusal

ALLOWED = [
    "host=127.0.0.1 port=55432 dbname=smartsearch_test user=pgadmin",
    "host=localhost dbname=smartsearch_test",
    "host=LOCALHOST dbname=smartsearch_test",
    "host=::1 dbname=smartsearch_test",
    "host=/var/run/postgresql dbname=smartsearch_test",
    "hostaddr=127.0.0.1 dbname=smartsearch_test",
    "host=localhost hostaddr=127.0.0.1 dbname=smartsearch_test",
    "host=localhost,127.0.0.1 dbname=smartsearch_test",
    "postgresql://pgadmin@localhost:55432/smartsearch_test",
]

REFUSED = [
    pytest.param("host=db.example.com dbname=smartsearch_test", "not on this machine", id="remote host"),
    pytest.param("host=10.0.0.5 dbname=smartsearch_test", "not on this machine", id="private address"),
    pytest.param(
        "host=localhost.example.com dbname=smartsearch_test",
        "not on this machine",
        id="name that only starts like localhost",
    ),
    pytest.param(
        "host=127.0.0.1.example.com dbname=smartsearch_test",
        "not on this machine",
        id="name that only starts like 127.0.0.1",
    ),
    pytest.param(
        "host=localhost hostaddr=192.0.2.1 dbname=shared_test",
        "not on this machine",
        id="local host but remote hostaddr",
    ),
    pytest.param(
        "host=127.0.0.1 hostaddr=10.1.2.3 dbname=smartsearch_test",
        "not on this machine",
        id="local address but remote hostaddr",
    ),
    pytest.param("hostaddr=192.0.2.1 dbname=smartsearch_test", "not on this machine", id="remote hostaddr alone"),
    pytest.param(
        "host=localhost,db.example.com dbname=smartsearch_test", "not on this machine", id="one remote host in a list"
    ),
    pytest.param(
        "host=localhost hostaddr=127.0.0.1,192.0.2.1 dbname=smartsearch_test",
        "not on this machine",
        id="one remote hostaddr in a list",
    ),
    pytest.param("host=localhost, dbname=smartsearch_test", "not on this machine", id="an empty entry in a list"),
    pytest.param("host=2001:db8::1 dbname=smartsearch_test", "not on this machine", id="remote IPv6 address"),
    pytest.param(
        "postgresql://pgadmin@db.example.com/smartsearch_test", "not on this machine", id="remote host in a URL"
    ),
    pytest.param("dbname=smartsearch_test user=pgadmin", "does not name a host", id="no host at all"),
    pytest.param("host=localhost dbname=sales_pitstop", "does not contain 'test'", id="a database name without test"),
    pytest.param("host=localhost", "does not contain 'test'", id="no database name"),
    pytest.param("host=localhost dbname=smartsearch_test service=prod", "service entry", id="a service entry"),
    pytest.param(
        "host=localhost dbname=smartsearch_test banana=1", "valid connection string", id="not a valid address"
    ),
    pytest.param("this is not a connection string", "valid connection string", id="nonsense"),
]


@pytest.mark.parametrize("dsn", ALLOWED)
def test_a_local_test_database_is_allowed(dsn):
    assert database_refusal(dsn) is None


@pytest.mark.parametrize("dsn, reason", REFUSED)
def test_anything_that_could_reach_another_machine_or_a_real_database_is_refused(dsn, reason):
    assert reason in (database_refusal(dsn) or "")


def test_the_variables_that_could_point_the_connection_elsewhere_are_removed_from_the_tests_environment(monkeypatch):
    monkeypatch.setattr(
        os,
        "environ",
        {"PGHOSTADDR": "192.0.2.1", "PGSERVICE": "prod", "PGSERVICEFILE": "/tmp/pg_service.conf", "KEEP": "1"},
    )
    conftest._prepare_environment()
    assert [name for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE") if name in os.environ] == []
    assert os.environ["KEEP"] == "1"
    assert os.environ["PYTHON_DOTENV_DISABLED"] == "1"
