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

"""Shared test helpers: the check that a database address is a local test database, a fake web server on a real local
socket, and a tiny PDF writer."""

import datetime
import ipaddress
import socket
import ssl
import tempfile
import threading
import time

import psycopg
from psycopg.conninfo import conninfo_to_dict


def _is_local(address: str) -> bool:
    """A name or address of this machine, or the folder of a local socket."""
    if address.startswith("/") or address.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(address).is_loopback
    except ValueError:
        return False


def database_refusal(dsn: str) -> str | None:
    """Why this connection string must not be used for the tests, or None when it is a local test database.

    PostgreSQL connects to `hostaddr` when it is given, whatever `host` says, so both are checked, and every entry of a
    comma-separated list. A service entry can change the address too, so none is allowed."""
    try:
        settings = conninfo_to_dict(dsn)
    except psycopg.ProgrammingError:
        return "it is not a valid connection string"
    if settings.get("service"):
        return "it uses a service entry, which can change the address"
    entries: list[str] = []
    for key in ("host", "hostaddr"):
        if settings.get(key):
            entries += [entry.strip() for entry in settings[key].split(",")]
    if not entries:
        return "it does not name a host, so the shell's PGHOST would decide"
    if not all(_is_local(entry) for entry in entries):
        return "a host or hostaddr in it is not on this machine"
    if "test" not in (settings.get("dbname") or ""):
        return "the database name does not contain 'test'"
    return None


def _self_signed_certificate() -> tuple[str, str]:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    folder = tempfile.mkdtemp()
    with open(folder + "/cert.pem", "wb") as file:
        file.write(certificate.public_bytes(serialization.Encoding.PEM))
    with open(folder + "/key.pem", "wb") as file:
        file.write(
            key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
        )
    return folder + "/cert.pem", folder + "/key.pem"


class FakeWebServer:
    """A web server on a real local port. With gap > 0 it sends its headers, then one byte every `gap` seconds (a slow
    server that never finishes); with gap == 0 it sends the whole body at once."""

    def __init__(self, gap=0.0, tls=False, body=b"<p>hello</p>" * 5, content_length=1_000_000, encoding=None):
        self.gap, self.body, self.content_length, self.encoding = gap, body, content_length, encoding
        self.stopped = False
        self._socket = socket.socket()
        self._socket.bind(("127.0.0.1", 0))
        self._socket.listen(5)
        self.port = self._socket.getsockname()[1]
        self._tls = None
        if tls:
            certificate, key = _self_signed_certificate()
            self._tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            self._tls.load_cert_chain(certificate, key)
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self):
        while not self.stopped:
            try:
                connection, _ = self._socket.accept()
            except OSError:
                return
            threading.Thread(target=self._answer, args=(connection,), daemon=True).start()

    def _answer(self, connection):
        try:
            if self._tls:
                connection = self._tls.wrap_socket(connection, server_side=True)
            request = b""
            while b"\r\n\r\n" not in request:
                chunk = connection.recv(4096)
                if not chunk:  # the client hung up before sending its request
                    return
                request += chunk
            head = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n"
            if self.encoding:
                head += f"Content-Encoding: {self.encoding}\r\n"
            length = self.content_length if self.gap else len(self.body)
            connection.sendall((head + f"Content-Length: {length}\r\n\r\n").encode())
            if not self.gap:
                connection.sendall(self.body)
                return
            for index in range(10_000):
                if self.stopped:
                    return
                connection.sendall(bytes([self.body[index % len(self.body)]]))
                time.sleep(self.gap)
        except Exception:  # noqa: BLE001 - the client hanging up is the point of some tests
            pass
        finally:
            try:
                connection.close()
            except Exception:  # noqa: BLE001
                pass

    def close(self):
        self.stopped = True
        self._socket.close()


def make_pdf(pages: list[str]) -> bytes:
    """A small, valid PDF with one line of text per page."""
    objects: list[bytes] = [b"<< /Type /Catalog /Pages 2 0 R >>", b""]
    page_ids = []
    for text in pages:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_ids.append(page_id)
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET".encode()
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content_id} 0 R "
            f"/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>".encode()
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()

    output = b"%PDF-1.4\n"
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(output)
    output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        output += f"{offset:010d} 00000 n \n".encode()
    output += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return output
