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

"""Test setup. Fake settings are put in place before any service module is imported, so the tests never use real
credentials, the real .env file or a real database. The tests that need PostgreSQL only run when TEST_POSTGRES_DSN
points at a throwaway local database (see tests/README.md)."""

import asyncio
import itertools
import json
import os
import time

import httpx
import psycopg
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from helpers import database_refusal

# Settings the service reads, and PostgreSQL connection variables that could point the connection somewhere else, that
# the tests leave unset, so a value in the developer's shell can't change a test.
_UNSET = (
    "VERTEX_LOCATION",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_GENERATION_MODEL",
    "DRIVE_SERVICE_TOKEN_URL",
    "DRIVE_SERVICE_CLIENT_ID",
    "DRIVE_SERVICE_CLIENT_SECRET",
    "MAX_DRIVE_FILE_SIZE_MB",
    "SLIM_READ_ENABLED",
    "JWT_CLOCK_SKEW_SECONDS",
    "PGHOSTADDR",
    "PGSERVICE",
    "PGSERVICEFILE",
)

_TEST_DSN = os.environ.get("TEST_POSTGRES_DSN", "").strip()


def _fake_service_account_json() -> str:
    """A service account key that is never used to sign in anywhere - the embeddings module just needs one that parses."""
    private_key = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        .decode()
    )
    return json.dumps(
        {
            "type": "service_account",
            "project_id": "test-project",
            "private_key_id": "test",
            "private_key": private_key,
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )


def _prepare_environment() -> None:
    for name in _UNSET:
        os.environ.pop(name, None)
    os.environ.update(
        # With this on, config.py's load_dotenv() ignores the real .env file.
        PYTHON_DOTENV_DISABLED="1",
        VERTEX_PROJECT_ID="test-project",
        VERTEX_SERVICE_ACCOUNT_JSON=_fake_service_account_json(),
        ANTHROPIC_API_KEY="test-key",
        DRIVE_SERVICE_URL="http://localhost:9094",
        DRIVE_SERVICE_AUTH_TOKEN="test-token",
        POSTGRES_DSN=_TEST_DSN or "host=127.0.0.1 port=1 dbname=unused_test connect_timeout=1",
        JWT_ISSUER="https://issuer.test",
        JWT_AUDIENCE="aud-one, aud-two",
        JWT_JWKS_URL="https://issuer.test/jwks",
        JWT_ADMIN_ROLE="admin-test",
        JWT_EMPLOYEE_ROLE="employee-test",
    )


_prepare_environment()


def pytest_sessionstart(session):
    """Refuses to run against anything but a local database made for testing - the tests create and drop tables. Every
    address in the connection string is checked, because PostgreSQL may connect to `hostaddr` instead of `host`."""
    if not _TEST_DSN:
        return
    refusal = database_refusal(_TEST_DSN)
    if refusal:
        pytest.exit(
            f"TEST_POSTGRES_DSN is not allowed: {refusal}. It must name only local addresses (localhost, 127.0.0.1, "
            "::1 or a socket folder) and a database whose name contains 'test'. The tests create and drop tables, so "
            "nothing else is allowed.",
            returncode=2,
        )
    try:
        psycopg.connect(_TEST_DSN, connect_timeout=5).close()
    except psycopg.Error as error:
        pytest.exit(f"Could not connect to TEST_POSTGRES_DSN: {error}", returncode=2)


def pytest_collection_modifyitems(config, items):
    if _TEST_DSN:
        return
    skip = pytest.mark.skip(reason="needs TEST_POSTGRES_DSN, a throwaway local PostgreSQL with pgvector")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


# ---- database fixtures: only used by tests marked db, which are skipped without TEST_POSTGRES_DSN


@pytest.fixture(scope="session")
def test_dsn() -> str:
    return _TEST_DSN


@pytest.fixture(scope="session")
def schema(test_dsn) -> str:
    """The service keeps its tables in a schema named after the database."""
    return conninfo_to_dict(test_dsn)["dbname"]


@pytest.fixture(scope="session")
def admin(test_dsn):
    """A plain connection to the test database, for looking at what the service wrote."""
    with psycopg.connect(test_dsn, autocommit=True) as connection:
        yield connection


@pytest.fixture(scope="session")
def server_dsn(test_dsn) -> str:
    """The same server, on its maintenance database - for creating and dropping scratch databases."""
    return make_conninfo(test_dsn, dbname="postgres")


_document_ids = itertools.count(time.time_ns() // 1000)


@pytest.fixture
def new_id():
    """Hands out a document id nobody used before (a number, as the service expects), so tests never share rows."""
    return lambda: str(next(_document_ids))


@pytest.fixture(scope="session")
def vs(test_dsn):
    from indexing import vectorstore

    return vectorstore


class Api:
    """Calls the service's own app in-process, one request at a time or many at once."""

    def __init__(self, app):
        self._transport = httpx.ASGITransport(app=app)

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self._transport, base_url="http://test", timeout=60)

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def go():
            async with self._client() as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(go())

    def get(self, path: str) -> httpx.Response:
        return self.request("GET", path)

    def post(self, path: str, body: dict) -> httpx.Response:
        return self.request("POST", path, json=body)

    def post_many(self, path: str, bodies: list[dict]) -> list[httpx.Response]:
        async def go():
            async with self._client() as client:
                return await asyncio.gather(*[client.post(path, json=body) for body in bodies])

        return asyncio.run(go())


@pytest.fixture(scope="session")
def main_module(test_dsn):
    """The service's main module, with the login check switched off - the login check has its own tests."""
    import auth
    import main

    main.app.dependency_overrides[auth.verify_caller] = lambda: None
    yield main
    main.app.dependency_overrides.pop(auth.verify_caller, None)


@pytest.fixture(scope="session")
def api(main_module) -> Api:
    return Api(main_module.app)


@pytest.fixture
def status_of(api):
    """The indexing status the service reports for a document: (HTTP code, body)."""

    def status(document_id: str):
        response = api.get(f"/documents/{document_id}/status")
        return response.status_code, response.json()

    return status
