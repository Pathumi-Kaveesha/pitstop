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

"""SQL for the chunks table, kept separate from the code that runs it."""

from config import EMBEDDING_DIMENSION

# One row per chunk. The id is "documentId#index", so re-indexing overwrites in place.
SCHEMA = f"""
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    embedding vector({EMBEDDING_DIMENSION}) NOT NULL,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    page INTEGER NOT NULL,
    unit_label TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    source TEXT NOT NULL,
    drive_link TEXT NOT NULL,
    native_link TEXT NOT NULL,
    moments TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
"""

UPSERT_CHUNK = """
INSERT INTO chunks (id, document_id, embedding, content, title, page, unit_label,
                    file_extension, source, drive_link, native_link, moments)
VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET
    embedding = EXCLUDED.embedding,
    content = EXCLUDED.content,
    title = EXCLUDED.title,
    page = EXCLUDED.page,
    unit_label = EXCLUDED.unit_label,
    file_extension = EXCLUDED.file_extension,
    source = EXCLUDED.source,
    drive_link = EXCLUDED.drive_link,
    native_link = EXCLUDED.native_link,
    moments = EXCLUDED.moments
"""

# Raises how many candidates HNSW checks - "true" scopes it to just this one query.
SET_EF_SEARCH = "SELECT set_config('hnsw.ef_search', %s, true)"

SEARCH = """
SELECT content, title, page, document_id, unit_label, file_extension, source,
       drive_link, native_link, moments,
       1 - (embedding <=> %s::vector) AS similarity
FROM chunks
ORDER BY embedding <=> %s::vector
LIMIT %s
"""

DOCUMENT_EXISTS = "SELECT 1 FROM chunks WHERE document_id = %s LIMIT 1"

FIND_DOCUMENT_SOURCE = "SELECT drive_link, file_extension FROM chunks WHERE document_id = %s LIMIT 1"

DELETE_STALE_CHUNKS = "DELETE FROM chunks WHERE document_id = %s AND id <> ALL(%s::text[])"

DELETE_BY_DOCUMENT_ID = "DELETE FROM chunks WHERE document_id = %s"
