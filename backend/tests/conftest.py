"""
Test isolation.

The suite used to run against whatever DATABASE_URL the developer had in
backend/.env — i.e. the live dev Postgres — and left rows behind on every run.
This pins tests to a disposable database instead.

Resolution order:
  1. TEST_DATABASE_URL from the environment (use this to test against Postgres)
  2. a local throwaway SQLite file, recreated from scratch each session

DATABASE_URL must be set before anything under src/ is imported, because
src/config/database.py builds its engine at import time. conftest.py is loaded
by pytest ahead of every test module, so this is the right place for it.
load_dotenv() does not override variables that are already set, so this wins
over backend/.env.
"""
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_SQLITE_PATH = ROOT / "test_potholes.db"
_DEFAULT_TEST_URL = f"sqlite:///{_SQLITE_PATH}"

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", _DEFAULT_TEST_URL)

# Start each session from a clean slate for the throwaway SQLite database.
if TEST_DATABASE_URL == _DEFAULT_TEST_URL and _SQLITE_PATH.exists():
    _SQLITE_PATH.unlink()

os.environ["DATABASE_URL"] = TEST_DATABASE_URL

