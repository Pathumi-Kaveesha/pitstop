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

"""A reusable HTTPS connection pool, so each call doesn't pay for a new secure connection."""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def make_session() -> requests.Session:
    """Retries once when a saved connection turns out to be dead. Safe for the
    calls made through it: they only read, or repeat with the same result."""
    retry = Retry(total=1, connect=1, read=1, allowed_methods=None)
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session
