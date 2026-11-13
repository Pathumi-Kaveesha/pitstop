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

"""How config.py reads its settings. Each case loads it in a fresh process, because it reads the settings once, when it
is first imported."""

import json
import os
import subprocess
import sys

import pytest

SERVICE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REQUIRED = {
    "VERTEX_PROJECT_ID": "project",
    "ANTHROPIC_API_KEY": "key",
    "DRIVE_SERVICE_URL": "http://localhost:9094",
    "POSTGRES_DSN": "host=127.0.0.1 dbname=x_test",
    "JWT_ISSUER": "https://issuer.test",
    "JWT_AUDIENCE": "aud",
    "JWT_JWKS_URL": "https://issuer.test/jwks",
    "JWT_ADMIN_ROLE": "admin",
    "JWT_EMPLOYEE_ROLE": "employee",
}

_PRINT_SETTINGS = (
    "import sys, json; sys.path.insert(0, %r); import config; "
    "print(json.dumps({name: getattr(config, name) for name in %r}))"
)


def load_config(*names: str, **changes):
    """Loads config.py with only the required settings plus the given changes (None removes one); returns the process."""
    environment = {"PATH": os.environ.get("PATH", ""), "PYTHON_DOTENV_DISABLED": "1", **REQUIRED}
    for name, value in changes.items():
        if value is None:
            environment.pop(name, None)
        else:
            environment[name] = value
    code = _PRINT_SETTINGS % (SERVICE_ROOT, list(names))
    return subprocess.run(
        [sys.executable, "-c", code], env=environment, capture_output=True, text=True, cwd=SERVICE_ROOT
    )


def values(*names: str, **changes) -> dict:
    process = load_config(*names, **changes)
    assert process.returncode == 0, process.stderr
    return json.loads(process.stdout)


def error_of(**changes) -> str:
    process = load_config(**changes)
    assert process.returncode != 0, "config.py loaded although it should have been refused"
    return process.stderr


def test_defaults_when_only_the_required_settings_are_given():
    settings = values(
        "VERTEX_LOCATION",
        "ANTHROPIC_BASE_URL",
        "CLAUDE_GENERATION_MODEL",
        "DRIVE_SERVICE_TOKEN_URL",
        "DRIVE_SERVICE_AUTH_TOKEN",
        "MAX_DRIVE_FILE_SIZE_BYTES",
        "SLIM_READ_ENABLED",
        "JWT_CLOCK_SKEW_SECONDS",
        "JWT_AUDIENCE",
    )
    assert settings == {
        "VERTEX_LOCATION": "global",
        "ANTHROPIC_BASE_URL": None,
        "CLAUDE_GENERATION_MODEL": "claude-sonnet-5",
        "DRIVE_SERVICE_TOKEN_URL": None,
        "DRIVE_SERVICE_AUTH_TOKEN": None,
        "MAX_DRIVE_FILE_SIZE_BYTES": 150 * 1024 * 1024,
        "SLIM_READ_ENABLED": True,
        "JWT_CLOCK_SKEW_SECONDS": 60,
        "JWT_AUDIENCE": ["aud"],
    }


@pytest.mark.parametrize("name", sorted(REQUIRED))
def test_a_missing_required_setting_stops_the_service_from_starting(name):
    assert f"KeyError: '{name}'" in error_of(**{name: None})


@pytest.mark.parametrize("name", ["JWT_ISSUER", "JWT_AUDIENCE", "JWT_JWKS_URL", "JWT_ADMIN_ROLE", "JWT_EMPLOYEE_ROLE"])
def test_a_blank_login_setting_is_refused(name):
    assert "must all be set and not blank" in error_of(**{name: "  "})


def test_the_audience_can_list_several_values():
    assert values("JWT_AUDIENCE", JWT_AUDIENCE=" one, two ,, three ")["JWT_AUDIENCE"] == ["one", "two", "three"]


def test_the_signing_keys_must_come_from_an_https_address():
    assert "JWT_JWKS_URL must use https://" in error_of(JWT_JWKS_URL="http://issuer.test/jwks")


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:9094",
        "http://127.0.0.1:9094",
        "https://drive-service.example.com",
    ],
)
def test_drive_service_addresses_that_are_allowed(url):
    assert values("DRIVE_SERVICE_URL", DRIVE_SERVICE_URL=url)["DRIVE_SERVICE_URL"] == url


@pytest.mark.parametrize("url", ["http://drive-service.example.com", "ftp://localhost", "https://", "localhost:9094"])
def test_drive_service_addresses_that_are_refused(url):
    assert "DRIVE_SERVICE_URL must use https://" in error_of(DRIVE_SERVICE_URL=url)


def test_the_drive_service_address_is_tidied():
    settings = values("DRIVE_SERVICE_URL", DRIVE_SERVICE_URL="  https://drive-service.example.com/  ")
    assert settings["DRIVE_SERVICE_URL"] == "https://drive-service.example.com"


def test_the_anthropic_host_must_use_https_because_the_key_is_sent_to_it():
    assert "ANTHROPIC_BASE_URL must use https://" in error_of(ANTHROPIC_BASE_URL="http://proxy.example.com")
    assert values("ANTHROPIC_BASE_URL", ANTHROPIC_BASE_URL="https://proxy.example.com") == {
        "ANTHROPIC_BASE_URL": "https://proxy.example.com"
    }


def test_the_drive_service_token_address_must_use_https():
    assert "DRIVE_SERVICE_TOKEN_URL must use https://" in error_of(DRIVE_SERVICE_TOKEN_URL="http://token.example.com")


def test_a_token_address_needs_the_client_id_and_secret_with_it():
    assert "KeyError: 'DRIVE_SERVICE_CLIENT_ID'" in error_of(DRIVE_SERVICE_TOKEN_URL="https://token.example.com")
    assert "KeyError: 'DRIVE_SERVICE_CLIENT_SECRET'" in error_of(
        DRIVE_SERVICE_TOKEN_URL="https://token.example.com", DRIVE_SERVICE_CLIENT_ID="id"
    )
    settings = values(
        "DRIVE_SERVICE_TOKEN_URL",
        "DRIVE_SERVICE_CLIENT_ID",
        "DRIVE_SERVICE_CLIENT_SECRET",
        DRIVE_SERVICE_TOKEN_URL=" https://token.example.com ",
        DRIVE_SERVICE_CLIENT_ID="id",
        DRIVE_SERVICE_CLIENT_SECRET="secret",
    )
    assert settings == {
        "DRIVE_SERVICE_TOKEN_URL": "https://token.example.com",
        "DRIVE_SERVICE_CLIENT_ID": "id",
        "DRIVE_SERVICE_CLIENT_SECRET": "secret",
    }


@pytest.mark.parametrize("raw, expected", [("200", 200), (" 12 ", 12), ("", 150), ("   ", 150)])
def test_a_number_setting_takes_a_whole_number_and_falls_back_when_blank(raw, expected):
    settings = values("MAX_DRIVE_FILE_SIZE_BYTES", MAX_DRIVE_FILE_SIZE_MB=raw)
    assert settings["MAX_DRIVE_FILE_SIZE_BYTES"] == expected * 1024 * 1024


@pytest.mark.parametrize("raw", ["0", "-5", "abc", "1.5"])
def test_a_number_setting_that_is_set_but_unusable_is_an_error(raw):
    assert "MAX_DRIVE_FILE_SIZE_MB must be a whole number above 0" in error_of(MAX_DRIVE_FILE_SIZE_MB=raw)


def test_the_size_above_which_a_file_runs_alone_defaults_to_50_mb():
    assert values("LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES")["LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES"] == 50 * 1024 * 1024


@pytest.mark.parametrize("raw, expected", [("100", 100), (" 30 ", 30), ("", 50), ("   ", 50)])
def test_the_size_above_which_a_file_runs_alone_can_be_set_per_environment(raw, expected):
    settings = values("LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES", LARGE_FILE_EXCLUSIVE_MB=raw)
    assert settings["LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES"] == expected * 1024 * 1024


@pytest.mark.parametrize("raw", ["0", "-5", "abc", "1.5"])
def test_an_unusable_runs_alone_size_is_an_error(raw):
    assert "LARGE_FILE_EXCLUSIVE_MB must be a whole number above 0" in error_of(LARGE_FILE_EXCLUSIVE_MB=raw)


def test_the_opened_size_limit_for_office_files_defaults_to_250_mb():
    assert values("MAX_OOXML_UNCOMPRESSED_BYTES")["MAX_OOXML_UNCOMPRESSED_BYTES"] == 250 * 1024 * 1024


@pytest.mark.parametrize("raw, expected", [("400", 400), (" 100 ", 100), ("", 250), ("   ", 250)])
def test_the_opened_size_limit_can_be_set_per_environment(raw, expected):
    settings = values("MAX_OOXML_UNCOMPRESSED_BYTES", MAX_OOXML_UNCOMPRESSED_MB=raw)
    assert settings["MAX_OOXML_UNCOMPRESSED_BYTES"] == expected * 1024 * 1024


@pytest.mark.parametrize("raw", ["0", "-5", "abc", "1.5"])
def test_an_unusable_opened_size_limit_is_an_error(raw):
    assert "MAX_OOXML_UNCOMPRESSED_MB must be a whole number above 0" in error_of(MAX_OOXML_UNCOMPRESSED_MB=raw)


@pytest.mark.parametrize("raw", ["false", "FALSE", " 0 ", "no", "Off"])
def test_slim_reading_can_be_turned_off(raw):
    assert values("SLIM_READ_ENABLED", SLIM_READ_ENABLED=raw) == {"SLIM_READ_ENABLED": False}


@pytest.mark.parametrize("raw", ["true", "1", "yes", "", "anything else"])
def test_slim_reading_stays_on_for_every_other_value(raw):
    assert values("SLIM_READ_ENABLED", SLIM_READ_ENABLED=raw) == {"SLIM_READ_ENABLED": True}
