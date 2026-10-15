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

"""Checks the user's login token that the backend forwards, the same way the backend checks it:
signature against the provider's public keys, then issuer, audience and expiry, then the user's role."""

import logging
import re
import threading
import time

import jwt
from fastapi import HTTPException, Request

from config import (
    JWT_ADMIN_ROLE,
    JWT_AUDIENCE,
    JWT_CLOCK_SKEW_SECONDS,
    JWT_EMPLOYEE_ROLE,
    JWT_ISSUER,
    JWT_JWKS_URL,
)

logger = logging.getLogger("smart-search-service")

# Not x-jwt-assertion: Choreo's gateway sets that one itself on the calls it carries.
USER_JWT_HEADER = "x-user-jwt"

# The admin-only routes: the backend only calls them for an admin, or from its scheduled jobs and bulk runs. Those have
# no user, so they can't carry a token and are allowed without one. A call that does carry a token needs the admin role.
_ADMIN_ROUTES = (
    ("GET", re.compile(r"^/documents$")),
    ("GET", re.compile(r"^/documents/[0-9]+/status$")),
    ("DELETE", re.compile(r"^/documents/[0-9]+$")),
    ("POST", re.compile(r"^/ingest-drive-link$")),
)

# Only the key list is cached (for an hour), not each key, so a key the provider removes stops working at the next refresh.
# A short timeout, so an unreachable key server can't hold every request for the library's default 30 seconds.
_jwks_client = jwt.PyJWKClient(JWT_JWKS_URL, cache_keys=False, lifespan=3600, timeout=5)


# A token with a key id we don't know makes us re-download the key list, in case the provider just rotated its keys.
# Without a limit, junk tokens could make every request call the provider, so that refresh happens at most this often.
_KEY_REFRESH_MIN_INTERVAL_SECONDS = 30
_refresh_lock = threading.Lock()
_last_forced_refresh = float("-inf")


def _find_key(keys, key_id):
    return next((key for key in keys if key.key_id == key_id), None)


def _signing_key_for(token: str):
    """The key that signed this token. A key id missing from the cached list refreshes the list, at most once per interval."""
    global _last_forced_refresh
    key_id = jwt.get_unverified_header(token).get("kid")
    key = _find_key(_jwks_client.get_signing_keys(), key_id)
    if key is not None:
        return key

    with _refresh_lock:
        now = time.monotonic()
        if now - _last_forced_refresh < _KEY_REFRESH_MIN_INTERVAL_SECONDS:
            raise jwt.PyJWKClientError("Unknown key id, and the key list was refreshed too recently to try again")
        _last_forced_refresh = now
    key = _find_key(_jwks_client.get_signing_keys(refresh=True), key_id)
    if key is None:
        raise jwt.PyJWKClientError("Unable to find a signing key that matches the token's key id")
    return key


def _is_admin_route(method: str, path: str) -> bool:
    return any(method == allowed and pattern.fullmatch(path) for allowed, pattern in _ADMIN_ROUTES)


def _groups_of(claims: dict) -> list[str]:
    groups = claims.get("groups")
    if isinstance(groups, str):
        return [groups]
    if isinstance(groups, list):
        return [group for group in groups if isinstance(group, str)]
    return []


def verify_caller(request: Request) -> None:
    """Runs before every route. Anything that carries a token must carry a valid one for a user with the right role;
    a call without one is only allowed on the admin routes the scheduled jobs use."""
    path = request.scope["path"]
    if path == "/health":
        return

    token = request.headers.get(USER_JWT_HEADER)
    if not token:
        if _is_admin_route(request.method, path):
            return
        raise HTTPException(status_code=401, detail="Missing user token.")

    try:
        signing_key = _signing_key_for(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            leeway=JWT_CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.PyJWKClientConnectionError as error:
        logger.error("Could not fetch the token signing keys: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail="Could not verify the user token right now.") from error
    except jwt.PyJWTError as error:
        logger.warning("Rejected a user token: %s", type(error).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired user token.") from error
    except Exception as error:  # noqa: BLE001 - anything unexpected still rejects the call
        logger.exception("Unexpected error while checking a user token")
        raise HTTPException(status_code=401, detail="Invalid or expired user token.") from error

    groups = _groups_of(claims)
    allowed_roles = {JWT_ADMIN_ROLE} if _is_admin_route(request.method, path) else {JWT_ADMIN_ROLE, JWT_EMPLOYEE_ROLE}
    if not allowed_roles.intersection(groups):
        logger.warning("Rejected a user token without the needed role for %s %s", request.method, path)
        raise HTTPException(status_code=403, detail="Insufficient privileges.")
