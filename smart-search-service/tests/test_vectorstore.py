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

"""The vector store against a real PostgreSQL: storing and searching chunks, the generation counter that stops an older
job from overwriting a newer one, and the saved failure reasons. Needs TEST_POSTGRES_DSN."""

import os
import subprocess
import sys
import time
import uuid

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

pytestmark = pytest.mark.db

SERVICE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTL = 7 * 24 * 3600
DIMENSION = 768


def unit_vector(position: int) -> list[float]:
    """A vector pointing along one axis. Two different positions are at right angles, so they never match each other."""
    vector = [0.0] * DIMENSION
    vector[position] = 1.0
    return vector


@pytest.fixture
def document(new_id, vs):
    """A fresh document id; whatever the test stored under it is deleted afterwards."""
    document_id = new_id()
    yield document_id
    vs.delete_document(document_id)


def axis_for(document_id: str) -> int:
    return 50 + int(document_id) % 600


def store(vs, document_id, generation, texts, *, title="Title", pages=None, native_links=None, **extra):
    axis = axis_for(document_id)
    return vs.store_chunks_if_current(
        [unit_vector(axis) for _ in texts],
        texts,
        title,
        pages or [1] * len(texts),
        document_id,
        generation,
        "Page",
        "pdf",
        "Library",
        "https://drive.google.com/file/d/abc/view",
        native_links or [None] * len(texts),
        **extra,
    )


# ---- generations


def test_each_claim_of_a_document_gets_the_next_generation(vs, document):
    first = vs.claim_generation(document)
    assert vs.claim_generation(document) == first + 1


def test_only_the_latest_claim_is_current(vs, document):
    old = vs.claim_generation(document)
    assert vs.is_current_generation(document, old)
    new = vs.claim_generation(document)
    assert not vs.is_current_generation(document, old)
    assert vs.is_current_generation(document, new)


def test_a_document_nobody_claimed_has_no_current_generation(vs, new_id):
    assert vs.is_current_generation(new_id(), 1) is False


# ---- storing and searching


def test_stored_chunks_are_found_by_a_search_on_their_vector(vs, document):
    generation = vs.claim_generation(document)
    assert store(vs, document, generation, ["Choreo ships APIs."], title="Choreo guide", pages=[3]) is True
    results = vs.search(unit_vector(axis_for(document)), "choreo", 5, 6)
    assert [(r.document_id, r.content, r.title, r.page, r.unit_label, r.file_extension, r.source) for r in results] == [
        (document, "Choreo ships APIs.", "Choreo guide", 3, "Page", "pdf", "Library")
    ]
    assert results[0].similarity_score == pytest.approx(1.0)
    assert results[0].native_link is None


def test_a_search_does_not_return_chunks_that_point_somewhere_else(vs, document):
    store(vs, document, vs.claim_generation(document), ["Some text."])
    other_axis = (axis_for(document) + 1) % DIMENSION
    assert [r for r in vs.search(unit_vector(other_axis), "text", 5, 6) if r.document_id == document] == []


def similar_vector(axis: int, other_axis: int, similarity: float) -> list[float]:
    """A vector whose similarity to unit_vector(axis) is exactly `similarity`."""
    vector = [0.0] * DIMENSION
    vector[axis] = similarity
    vector[other_axis] = (1 - similarity**2) ** 0.5
    return vector


def test_a_match_below_the_minimum_score_is_left_out_even_when_it_is_the_best_there_is(vs, document):
    axis = axis_for(document)
    store_similar(vs, document, axis, 0.5)
    assert [r for r in vs.search(unit_vector(axis), "text", 10, 6) if r.document_id == document] == []


def test_a_match_above_the_minimum_score_is_returned(vs, document):
    axis = axis_for(document)
    store_similar(vs, document, axis, 0.8)
    found = [r for r in vs.search(unit_vector(axis), "text", 10, 6) if r.document_id == document]
    assert [r.similarity_score for r in found] == [pytest.approx(0.8)]


def store_similar(vs, document_id, axis, similarity):
    vs.store_chunks_if_current(
        [similar_vector(axis, (axis + 1) % DIMENSION, similarity)],
        ["Some text."],
        "T",
        [1],
        document_id,
        vs.claim_generation(document_id),
        "Page",
        "pdf",
        "S",
        "https://drive.google.com/file/d/abc/view",
        [None],
    )


def test_the_native_link_of_a_chunk_comes_back_and_a_missing_one_is_none(vs, document):
    link = "https://docs.google.com/presentation/d/F/present?slide=id.p2"
    store(vs, document, vs.claim_generation(document), ["First.", "Second."], native_links=[link, None])
    by_text = {r.content: r.native_link for r in vs.search(unit_vector(axis_for(document)), "first", 5, 6)}
    assert by_text == {"First.": link, "Second.": None}


def test_a_transcript_chunk_links_to_the_moment_that_matches_the_question(vs, document):
    moments = [
        [("30", "We start with the welcome and the agenda."), ("95", "Pricing for the enterprise plan is explained.")]
    ]
    store(vs, document, vs.claim_generation(document), ["Transcript text."], moments=moments)
    result = vs.search(unit_vector(axis_for(document)), "enterprise pricing", 5, 6)[0]
    assert result.native_link == "https://drive.google.com/file/d/abc/view?t=95"


def test_at_most_two_chunks_of_one_document_are_returned(vs, document):
    store(vs, document, vs.claim_generation(document), ["One.", "Two.", "Three.", "Four."])
    results = vs.search(unit_vector(axis_for(document)), "text", 10, 6)
    assert len([r for r in results if r.document_id == document]) == vs.MAX_CHUNKS_PER_DOCUMENT == 2


def test_storing_again_replaces_the_old_version_and_drops_chunks_it_no_longer_has(vs, document, admin, schema):
    generation = vs.claim_generation(document)
    store(vs, document, generation, ["A.", "B.", "C."])
    store(vs, document, generation, ["Only one now."])
    rows = admin.execute(f'SELECT id, content FROM "{schema}".chunks WHERE document_id = %s', (document,)).fetchall()
    assert rows == [(f"{document}#0", "Only one now.")]


def test_a_job_that_was_superseded_stores_nothing(vs, document):
    old = vs.claim_generation(document)
    vs.claim_generation(document)
    assert store(vs, document, old, ["Late work."]) is False
    assert vs.document_exists(document) is False


def test_mismatched_lists_are_refused_before_anything_is_written(vs, document):
    generation = vs.claim_generation(document)
    with pytest.raises(ValueError, match="length mismatch"):
        vs.store_chunks_if_current(
            [unit_vector(1)], ["a", "b"], "T", [1], document, generation, "Page", "pdf", "S", "l", [None]
        )
    assert vs.document_exists(document) is False


def test_stored_documents_are_listed(vs, document):
    store(vs, document, vs.claim_generation(document), ["Listed."])
    assert document in vs.list_document_ids()
    assert vs.document_exists(document) is True


# ---- the version of what was indexed


def test_the_link_and_version_of_what_was_indexed_are_recorded_with_it(vs, document):
    generation = vs.claim_generation(document)
    store(vs, document, generation, ["Text."], source_link="https://example.com/p", source_version="v1")
    assert vs.get_document_source(document) == ("https://example.com/p", "v1")


def test_storing_without_a_version_forgets_an_older_one_because_it_no_longer_describes_what_is_stored(vs, document):
    generation = vs.claim_generation(document)
    store(vs, document, generation, ["Text."], source_link="https://example.com/p", source_version="v1")
    store(vs, document, generation, ["Text."])
    assert vs.get_document_source(document) is None


def test_a_version_recorded_later_never_replaces_one_that_is_already_known(vs, document):
    assert vs.get_document_source(document) is None
    vs.record_document_source_if_absent(document, "https://example.com/p", "first")
    vs.record_document_source_if_absent(document, "https://example.com/p", "second")
    assert vs.get_document_source(document) == ("https://example.com/p", "first")


# ---- deleting


def test_deleting_removes_the_chunks_and_the_version_and_says_whether_anything_was_there(vs, document):
    store(
        vs, document, vs.claim_generation(document), ["Text."], source_link="https://example.com/p", source_version="v1"
    )
    assert vs.delete_document(document) is True
    assert vs.document_exists(document) is False
    assert vs.get_document_source(document) is None
    assert vs.delete_document(document) is False


def test_a_job_that_started_before_a_delete_cannot_write_the_document_back(vs, document):
    generation = vs.claim_generation(document)
    vs.delete_document(document)
    assert store(vs, document, generation, ["Too late."]) is False
    assert vs.document_exists(document) is False


# ---- jobs that are running


def test_a_job_that_keeps_refreshing_its_mark_is_not_stale_and_one_that_stops_is(vs, document):
    generation = vs.claim_generation(document)
    vs.start_index_job(document, generation)
    assert vs.is_index_job_stale(document, 0.5) is False
    time.sleep(0.8)
    assert vs.is_index_job_stale(document, 0.5) is True
    vs.touch_index_job(document, generation)
    assert vs.is_index_job_stale(document, 0.5) is False


def test_a_finished_job_is_never_stale(vs, document):
    generation = vs.claim_generation(document)
    vs.start_index_job(document, generation)
    vs.finish_index_job(document, generation)
    time.sleep(0.6)
    assert vs.is_index_job_stale(document, 0.5) is False


def test_the_mark_of_a_job_that_died_can_be_cleared(vs, document):
    generation = vs.claim_generation(document)
    vs.start_index_job(document, generation)
    time.sleep(0.6)
    vs.clear_stale_index_job(document, 0.5)
    assert vs.is_index_job_stale(document, 0.5) is False


# ---- saved failure reasons


def test_a_saved_reason_is_read_back_and_saving_again_replaces_it(vs, document, admin, schema):
    vs.save_index_error(document, "could not read this file", None, TTL)
    assert vs.get_index_error(document, TTL) == "could not read this file"
    vs.save_index_error(document, "second reason", None, TTL)
    assert vs.get_index_error(document, TTL) == "second reason"
    assert admin.execute(
        f'SELECT count(*) FROM "{schema}".index_errors WHERE document_id = %s', (document,)
    ).fetchone() == (1,)


def test_a_document_with_no_failure_has_no_reason(vs, new_id):
    assert vs.get_index_error(new_id(), TTL) is None


def test_non_ascii_reasons_survive(vs, document):
    vs.save_index_error(document, "ünïcödé 日本語 — reason", None, TTL)
    assert vs.get_index_error(document, TTL) == "ünïcödé 日本語 — reason"


def test_a_reason_older_than_the_limit_is_not_returned_and_saving_drops_expired_ones(
    vs, document, new_id, admin, schema
):
    vs.save_index_error(document, "old reason", None, TTL)
    time.sleep(1.2)
    assert vs.get_index_error(document, 1) is None
    assert vs.get_index_error(document, TTL) == "old reason"
    vs.save_index_error(new_id(), "new reason", None, 1)
    assert admin.execute(
        f'SELECT count(*) FROM "{schema}".index_errors WHERE document_id = %s', (document,)
    ).fetchone() == (0,)


def test_a_newer_attempt_retires_the_old_reason_without_anyone_clearing_it(vs, document):
    first = vs.claim_generation(document)
    vs.save_index_error(document, "attempt 1 failed", first, TTL)
    assert vs.get_index_error(document, TTL) == "attempt 1 failed"
    second = vs.claim_generation(document)
    assert second == first + 1
    assert vs.get_index_error(document, TTL) is None


def test_a_late_failure_from_an_older_attempt_never_replaces_or_shows_over_a_newer_one(vs, document):
    first = vs.claim_generation(document)
    second = vs.claim_generation(document)
    vs.save_index_error(document, "attempt 2 failed", second, TTL)
    vs.save_index_error(document, "late failure of attempt 1", first, TTL)
    assert vs.get_index_error(document, TTL) == "attempt 2 failed"
    third = vs.claim_generation(document)
    vs.save_index_error(document, "late failure of attempt 2", second, TTL)
    assert vs.get_index_error(document, TTL) is None
    vs.save_index_error(document, "attempt 3 failed", third, TTL)
    assert vs.get_index_error(document, TTL) == "attempt 3 failed"


def test_a_request_turned_away_before_any_job_belongs_to_the_current_generation(vs, document):
    vs.save_index_error(document, "bad link", None, TTL)
    assert vs.get_index_error(document, TTL) == "bad link"
    vs.claim_generation(document)
    assert vs.get_index_error(document, TTL) is None
    vs.save_index_error(document, "bad link again", None, TTL)
    assert vs.get_index_error(document, TTL) == "bad link again"
    vs.claim_generation(document)
    assert vs.get_index_error(document, TTL) is None


def test_clearing_removes_a_reason_and_clearing_nothing_is_fine(vs, document, new_id):
    vs.save_index_error(document, "x", None, TTL)
    vs.clear_index_error(document)
    assert vs.get_index_error(document, TTL) is None
    vs.clear_index_error(new_id())


def test_deleting_a_document_retires_its_reason(vs, document):
    generation = vs.claim_generation(document)
    vs.save_index_error(document, "failed", generation, TTL)
    vs.delete_document(document)
    assert vs.get_index_error(document, TTL) is None


def test_a_problem_with_the_failure_table_never_stops_anything_else(vs, document, new_id, monkeypatch):
    import indexing.queries as queries

    good_schema = queries.INDEX_ERRORS_SCHEMA
    monkeypatch.setattr(vs, "INDEX_ERROR_RETRY_DELAY_SECONDS", 0.01)
    try:
        vs._ensure_index_errors_table()
        with psycopg.connect(os.environ["POSTGRES_DSN"], autocommit=True) as connection:
            connection.execute(f'DROP TABLE IF EXISTS "{connection.info.dbname}".index_errors')
        monkeypatch.setattr(vs, "_index_errors_ready", False)
        monkeypatch.setattr(queries, "INDEX_ERRORS_SCHEMA", "CREATE TABLE index_errors (")  # cannot be created

        assert vs.claim_generation(document) >= 1
        assert vs.document_exists(document) is False
        assert vs.list_document_ids() is not None
        with pytest.raises(RuntimeError):
            vs.save_index_error(document, "x", None, TTL)
        with pytest.raises(Exception):
            vs.get_index_error(document, TTL)
        assert vs.claim_generation(new_id()) >= 1

        monkeypatch.setattr(queries, "INDEX_ERRORS_SCHEMA", good_schema)
        vs.save_index_error(document, "now it works", None, TTL)
        assert vs.get_index_error(document, TTL) == "now it works"
    finally:
        queries.INDEX_ERRORS_SCHEMA = good_schema
        vs._index_errors_ready = False
        vs._ensure_index_errors_table()


# ---- a database that already exists, and a restart


@pytest.fixture
def scratch_database(server_dsn):
    """A new empty database just for one test, dropped afterwards. Gives its connection string and its name."""
    name = f"smartsearch_test_scratch_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(server_dsn, autocommit=True) as server:
        server.execute(f'CREATE DATABASE "{name}"')
    dsn = make_conninfo(server_dsn, dbname=name)
    with psycopg.connect(dsn, autocommit=True) as connection:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
    yield dsn, name
    with psycopg.connect(server_dsn, autocommit=True) as server:
        server.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def run_in_new_process(code: str, dsn: str) -> subprocess.CompletedProcess:
    """Runs a few lines in a fresh interpreter, as a restarted service would, against the given database."""
    program = f"import sys; sys.path.insert(0, {SERVICE_ROOT!r}); import indexing.vectorstore as vs; {code}"
    environment = dict(os.environ, POSTGRES_DSN=dsn, PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run(
        [sys.executable, "-c", program], env=environment, capture_output=True, text=True, cwd=SERVICE_ROOT
    )


OLD_TABLES = """
CREATE TABLE chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, embedding vector(768) NOT NULL, content TEXT NOT NULL,
  title TEXT NOT NULL, page INTEGER NOT NULL, unit_label TEXT NOT NULL, file_extension TEXT NOT NULL, source TEXT NOT NULL,
  drive_link TEXT NOT NULL, native_link TEXT NOT NULL, moments TEXT NOT NULL);
CREATE TABLE document_state (document_id TEXT PRIMARY KEY, generation BIGINT NOT NULL);
CREATE TABLE index_jobs (document_id TEXT PRIMARY KEY, generation BIGINT NOT NULL, heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE document_sources (document_id TEXT PRIMARY KEY, link TEXT NOT NULL, version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO document_state VALUES ('old1', 4);
INSERT INTO document_sources VALUES ('old1', 'https://x', 'v1');
"""


def tables_in(dsn: str, schema: str) -> set[str]:
    with psycopg.connect(dsn, autocommit=True) as connection:
        rows = connection.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (schema,))
        return {row[0] for row in rows}


def test_a_database_that_already_has_the_older_tables_keeps_them_and_gets_the_failure_table_only_when_first_needed(
    scratch_database,
):
    dsn, schema = scratch_database
    with psycopg.connect(dsn, autocommit=True) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')
        connection.execute(f'SET search_path TO "{schema}", public')
        connection.execute(OLD_TABLES)
    assert "index_errors" not in tables_in(dsn, schema)

    assert run_in_new_process("vs._ensure_schema()", dsn).returncode == 0
    assert "index_errors" not in tables_in(dsn, schema)  # starting up leaves the failure table alone

    assert run_in_new_process("vs.get_index_error('never-seen', 604800)", dsn).returncode == 0
    assert "index_errors" in tables_in(dsn, schema)  # its first use creates it

    with psycopg.connect(dsn, autocommit=True) as connection:
        assert connection.execute(
            f'SELECT generation FROM "{schema}".document_state WHERE document_id = %s', ("old1",)
        ).fetchone() == (4,)
        assert connection.execute(
            f'SELECT version FROM "{schema}".document_sources WHERE document_id = %s', ("old1",)
        ).fetchone() == ("v1",)

    before = tables_in(dsn, schema)
    assert run_in_new_process("vs._ensure_schema(); vs.get_index_error('again', 604800)", dsn).returncode == 0
    assert tables_in(dsn, schema) == before  # running it again changes nothing


def test_a_reason_saved_by_a_process_that_has_exited_is_read_by_new_ones(document, test_dsn):
    saved = run_in_new_process(
        f"vs.save_index_error({document!r}, 'failed before the restart', vs.claim_generation({document!r}), 604800)",
        test_dsn,
    )
    assert saved.returncode == 0, saved.stderr
    for _ in range(2):
        read = run_in_new_process(f"print(vs.get_index_error({document!r}, 604800))", test_dsn)
        assert read.stdout.strip() == "failed before the restart", read.stderr


def test_many_threads_claiming_the_same_document_all_get_different_generations(vs, document):
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        generations = list(pool.map(lambda _: vs.claim_generation(document), range(24)))
    assert len(set(generations)) == 24
    assert sorted(generations) == list(range(min(generations), min(generations) + 24))
