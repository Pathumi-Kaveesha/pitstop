# Smart Search service tests

These tests check the Python service without touching anything real: no real Google Drive, Vertex AI, Claude or
internet, no real `.env` file and no real database.

## Run them

From the `smart-search-service` folder:

```bash
pip install -r requirements-dev.txt     # the service's packages plus pytest
pytest
```

That runs everything that does not need a database (about 250 tests). The tests that need PostgreSQL are skipped, and
`pytest` tells you how many.

## Run the database tests too

They need a throwaway PostgreSQL with the pgvector extension. One way to get one:

```bash
docker run -d --name smartsearch-test-db -p 55432:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=pgadmin -e POSTGRES_DB=smartsearch_test \
  pgvector/pgvector:pg17

TEST_POSTGRES_DSN="host=127.0.0.1 port=55432 dbname=smartsearch_test user=pgadmin" pytest
```

The tests create and drop tables, so they only run against a database that is on your own machine, written with its host
(`localhost`, `127.0.0.1`, `::1` or a socket folder), whose `hostaddr` too (if you set one) is local, and whose name contains
`test`. The tests also ignore `PGHOSTADDR`, `PGSERVICE` and `PGSERVICEFILE` from your shell. Anything else stops the run before it
connects. Never point it at a shared or real database.

## What is covered

| File | What it checks |
|---|---|
| `test_config.py` | how settings are read, and which wrong ones stop the service from starting |
| `test_auth.py` | the login check: tokens, roles, expired or forged tokens, key changes |
| `test_chunking.py` | reading PDF, Word, PowerPoint, Excel and Google text into pieces and chunks |
| `test_deep_links.py` | links to a video moment, slide, sheet tab or heading |
| `test_compose.py` | message writing helpers, with Claude replaced by a fake |
| `test_web_page.py` | web page safety rules, redirects, the three-at-a-time limit, the size and time limits |
| `test_vectorstore.py` (database) | storing, searching and deleting; the generation counter; failure reasons |
| `test_failure_reasons.py` (database) | what the status endpoint reports and when it clears |
| `test_web_page_indexing.py` (database) | indexing a web page from its link, end to end with a fake download |

## Adding a test

Keep a test small and give it a name that says what should happen. Three modules open a database connection the moment
they are imported (`main`, `indexing.vectorstore` and `answering.generation`), so a test never imports them at the top of
a file. Database tests get them from the `main_module` and `vs` fixtures instead, which keeps the file skippable when no
database is set up. Use `new_id()` for document ids so tests never share rows.
