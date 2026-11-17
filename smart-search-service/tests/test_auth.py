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

"""The login check that runs before every route: which calls need a token, which roles may do what, and what happens
when a token is wrong or the provider's signing keys change."""

import time
import types

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request

import auth
from config import JWT_ADMIN_ROLE, JWT_AUDIENCE, JWT_CLOCK_SKEW_SECONDS, JWT_EMPLOYEE_ROLE, JWT_ISSUER

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
NEW_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _signing_key(key_id, private_key):
    return types.SimpleNamespace(key_id=key_id, key=private_key.public_key())


class FakeKeyList:
    """Stands in for the provider's key list: it records every call, and can show a rotated key after a refresh."""

    def __init__(self, keys, after_refresh=None, error=None):
        self.keys, self.after_refresh, self.error, self.calls = keys, after_refresh, error, []

    def get_signing_keys(self, refresh=False):
        self.calls.append(refresh)
        if self.error:
            raise self.error
        if refresh and self.after_refresh is not None:
            self.keys = self.after_refresh
        return list(self.keys)


@pytest.fixture(autouse=True)
def provider_keys(monkeypatch):
    keys = FakeKeyList([_signing_key("k1", KEY)])
    monkeypatch.setattr(auth, "_jwks_client", keys)
    monkeypatch.setattr(auth, "_last_forced_refresh", float("-inf"))
    return keys


def make_token(
    groups=(JWT_EMPLOYEE_ROLE,), lifetime=3600, audience=JWT_AUDIENCE[0], issuer=JWT_ISSUER, key=KEY, kid="k1"
):
    claims = {"iss": issuer, "aud": audience, "groups": list(groups) if not isinstance(groups, str) else groups}
    if lifetime is not None:
        claims["exp"] = int(time.time()) + lifetime
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid} if kid else None)


def check(method, path, token=None):
    """The HTTP code the login check gives a call: 200 when it lets it through."""
    headers = [(b"x-user-jwt", token.encode())] if token else []
    request = Request({"type": "http", "method": method, "path": path, "headers": headers})
    try:
        auth.verify_caller(request)
    except HTTPException as error:
        return error.status_code
    return 200


# ---- calls without a token


def test_the_health_check_never_needs_a_token():
    assert check("GET", "/health") == 200


@pytest.mark.parametrize(
    "method, path",
    [("GET", "/search"), ("POST", "/answer"), ("POST", "/compose"), ("GET", "/documents/"), ("POST", "/documents")],
)
def test_a_call_without_a_token_is_refused_on_user_routes(method, path):
    assert check(method, path) == 401


@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", "/documents"),
        ("GET", "/documents/123/status"),
        ("POST", "/documents/123/source-check"),
        ("DELETE", "/documents/123"),
        ("POST", "/ingest-drive-link"),
    ],
)
def test_the_admin_routes_let_the_backends_own_jobs_in_without_a_token(method, path):
    assert check(method, path) == 200


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", "/documents/123/status"),
        ("GET", "/documents/abc/status"),
        ("GET", "/documents/123/status/"),
        ("DELETE", "/documents/123/extra"),
        ("GET", "/ingest-drive-link"),
    ],
)
def test_a_near_miss_of_an_admin_route_still_needs_a_token(method, path):
    assert check(method, path) == 401


# ---- roles


def test_an_employee_may_use_the_user_routes_but_not_the_admin_ones():
    token = make_token(groups=[JWT_EMPLOYEE_ROLE])
    assert check("GET", "/search", token) == 200
    assert check("POST", "/answer", token) == 200
    assert check("GET", "/documents", token) == 403
    assert check("DELETE", "/documents/123", token) == 403
    assert check("POST", "/ingest-drive-link", token) == 403


def test_an_admin_may_use_every_route():
    token = make_token(groups=[JWT_ADMIN_ROLE])
    assert check("GET", "/search", token) == 200
    assert check("POST", "/ingest-drive-link", token) == 200
    assert check("DELETE", "/documents/123", token) == 200


@pytest.mark.parametrize("groups", [[], ["some-other-group"], ["something", "else"]])
def test_a_token_without_a_known_role_is_refused_everywhere(groups):
    token = make_token(groups=groups)
    assert check("GET", "/search", token) == 403
    assert check("GET", "/documents", token) == 403


def test_a_token_with_no_groups_claim_at_all_is_refused():
    claims = {"iss": JWT_ISSUER, "aud": JWT_AUDIENCE[0], "exp": int(time.time()) + 3600}
    token = jwt.encode(claims, KEY, algorithm="RS256", headers={"kid": "k1"})
    assert check("GET", "/search", token) == 403


def test_groups_may_be_one_string_instead_of_a_list():
    assert check("GET", "/documents", make_token(groups=JWT_ADMIN_ROLE)) == 200


def test_entries_in_the_groups_list_that_are_not_text_are_ignored():
    token = make_token(groups=[123, None, JWT_ADMIN_ROLE])
    assert check("GET", "/documents", token) == 200


def test_a_token_on_an_admin_route_must_be_valid_it_is_not_waved_through():
    assert check("GET", "/documents", make_token(lifetime=-3600, groups=[JWT_ADMIN_ROLE])) == 401
    assert check("GET", "/documents", "not-a-token") == 401


# ---- the token itself


def test_either_listed_audience_is_accepted():
    for audience in JWT_AUDIENCE:
        assert check("GET", "/search", make_token(audience=audience)) == 200


def test_a_token_for_another_audience_or_issuer_is_refused():
    assert check("GET", "/search", make_token(audience="somebody-else")) == 401
    assert check("GET", "/search", make_token(issuer="https://attacker.test")) == 401


def test_an_expired_token_is_refused_but_a_little_clock_difference_is_allowed():
    assert check("GET", "/search", make_token(lifetime=-(JWT_CLOCK_SKEW_SECONDS + 60))) == 401
    assert check("GET", "/search", make_token(lifetime=-(JWT_CLOCK_SKEW_SECONDS // 2))) == 200


def test_a_token_with_no_expiry_is_refused():
    assert check("GET", "/search", make_token(lifetime=None)) == 401


def test_a_token_signed_with_another_key_is_refused():
    assert check("GET", "/search", make_token(key=OTHER_KEY)) == 401


def test_a_token_signed_with_a_shared_secret_instead_of_the_private_key_is_refused():
    claims = {"iss": JWT_ISSUER, "aud": JWT_AUDIENCE[0], "exp": int(time.time()) + 3600, "groups": [JWT_ADMIN_ROLE]}
    forged = jwt.encode(
        claims, "a-shared-secret-that-is-long-enough-for-hs256", algorithm="HS256", headers={"kid": "k1"}
    )
    assert check("GET", "/search", forged) == 401


def test_an_unsigned_token_is_refused():
    claims = {"iss": JWT_ISSUER, "aud": JWT_AUDIENCE[0], "exp": int(time.time()) + 3600, "groups": [JWT_ADMIN_ROLE]}
    assert check("GET", "/search", jwt.encode(claims, key=None, algorithm="none")) == 401


@pytest.mark.parametrize("token", ["garbage", "a.b.c", "....", "x" * 5000])
def test_text_that_is_not_a_token_is_refused(token):
    assert check("GET", "/search", token) == 401


def test_anything_unexpected_while_checking_still_refuses_the_call(provider_keys):
    provider_keys.error = RuntimeError("something nobody planned for")
    assert check("GET", "/search", make_token()) == 401


def test_a_key_server_that_cannot_be_reached_is_reported_as_unavailable_not_as_a_bad_token(provider_keys):
    provider_keys.error = jwt.PyJWKClientConnectionError("down")
    assert check("GET", "/search", make_token()) == 503


# ---- keys that change


def test_a_new_signing_key_is_picked_up_by_refreshing_the_list_once(provider_keys):
    provider_keys.after_refresh = [_signing_key("k1", KEY), _signing_key("k2", NEW_KEY)]
    assert check("GET", "/search", make_token(key=NEW_KEY, kid="k2")) == 200
    assert provider_keys.calls == [False, True]


def test_a_known_key_never_causes_a_refresh(provider_keys):
    assert check("GET", "/search", make_token()) == 200
    assert provider_keys.calls == [False]


def test_a_token_with_an_unknown_key_id_is_refused_after_one_refresh(provider_keys):
    assert check("GET", "/search", make_token(key=OTHER_KEY, kid="unknown")) == 401
    assert provider_keys.calls == [False, True]


def test_a_token_with_no_key_id_is_refused(provider_keys):
    assert check("GET", "/search", make_token(kid=None)) == 401


def test_junk_tokens_cannot_make_every_request_refresh_the_key_list(provider_keys, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(auth, "time", types.SimpleNamespace(monotonic=lambda: now[0]))
    junk = make_token(key=OTHER_KEY, kid="unknown")
    for _ in range(5):
        assert check("GET", "/search", junk) == 401
    assert provider_keys.calls.count(True) == 1

    now[0] += auth._KEY_REFRESH_MIN_INTERVAL_SECONDS + 1
    assert check("GET", "/search", junk) == 401
    assert provider_keys.calls.count(True) == 2


def test_a_rotated_key_is_found_once_the_refresh_limit_has_passed(provider_keys, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(auth, "time", types.SimpleNamespace(monotonic=lambda: now[0]))
    assert check("GET", "/search", make_token(key=NEW_KEY, kid="k2")) == 401  # not published yet; uses up the refresh

    provider_keys.after_refresh = [_signing_key("k1", KEY), _signing_key("k2", NEW_KEY)]
    assert check("GET", "/search", make_token(key=NEW_KEY, kid="k2")) == 401  # too soon to refresh again

    now[0] += auth._KEY_REFRESH_MIN_INTERVAL_SECONDS + 1
    assert check("GET", "/search", make_token(key=NEW_KEY, kid="k2")) == 200
