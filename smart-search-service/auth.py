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
signature against the provider's public keys, then issuer, audience and expiry."""

import logging
import re

import jwt
from fastapi import HTTPException, Request

from config import (
    JWT_AUDIENCE,
    JWT_CLOCK_SKEW_SECONDS,
    JWT_ISSUER,
    JWT_JWKS_URL,
)

logger = logging.getLogger("smart-search-service")

# Not x-jwt-assertion: Choreo's gateway sets that one itself on the calls it carries.
USER_JWT_HEADER = "x-user-jwt"

# The backend's scheduled jobs (orphan sweep, reconciliation) call these without a user, so they can't carry a token.
_TOKENLESS_ROUTES = (
    ("GET", re.compile(r"^/documents$")),
    ("GET", re.compile(r"^/documents/[0-9]+/status$")),
    ("DELETE", re.compile(r"^/documents/[0-9]+$")),
    ("POST", re.compile(r"^/ingest-drive-link$")),
)

# Only the key list is cached (for an hour), not each key, so a key the provider removes stops working at the next refresh.
# A short timeout, so an unreachable key server can't hold every request for the library's default 30 seconds.
_jwks_client = jwt.PyJWKClient(JWT_JWKS_URL, cache_keys=False, lifespan=3600, timeout=5)


def _tokenless_allowed(method: str, path: str) -> bool:
    return any(method == allowed and pattern.fullmatch(path) for allowed, pattern in _TOKENLESS_ROUTES)


def verify_caller(request: Request) -> None:
    """Runs before every route. Anything that carries a token must carry a valid one; a call without one is
    only allowed on the routes the scheduled jobs use."""
    path = request.scope["path"]
    if path == "/health":
        return

    token = request.headers.get(USER_JWT_HEADER)
    if not token:
        if _tokenless_allowed(request.method, path):
            return
        raise HTTPException(status_code=401, detail="Missing user token.")

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        jwt.decode(
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
