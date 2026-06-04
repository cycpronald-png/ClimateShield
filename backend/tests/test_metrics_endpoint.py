"""
Test that the metrics endpoint returns exactly the 8 canonical
counter keys — and that ``state.json`` (consumed by the
static-mode frontend) also carries them.

Regression guard for the bug where the frontend's static-mode
getMetrics() spread the entire state.json, leaking
wbt_thresholds, state_ranges, last_date, etc. into the panel
and visually hiding the real metrics.
"""
import json
import os
import sys
import pytest

# IMPORTANT: env vars must be set BEFORE importing backend.* because
# backend.database reads DATABASE_URL at import time and creates the
# engine with that URL. The lifespan handler later runs
# Base.metadata.create_all(engine) — that needs the engine bound to
# a real, shared (file-backed) SQLite, not :memory: which is
# per-connection.
_TEST_DB = "/tmp/_cs_metrics_test.db"
if os.path.exists(_TEST_DB):
    os.remove(_TEST_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("METRICS_PASSWORD", "test-metrics")
os.environ.setdefault("ADMIN_API_KEY", "test-api-key")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from backend.main import app
from backend.services.counters import COUNTER_NAMES, get_all_counters


EXPECTED_KEYS = [
    "hko_fetches",
    "weather_readings",
    "wbt_calculations",
    "risk_scores",
    "alerts_generated",
    "forecast_days",
    "warnings",
    "hne_checks",
]


def test_counter_names_match_documented_order():
    assert list(COUNTER_NAMES) == EXPECTED_KEYS


def test_get_all_counters_returns_all_eight_keys_even_when_db_is_empty():
    from backend.database import Base, engine, SessionLocal
    # The TestClient lifespan already created all tables; create_all
    # is a no-op in that case. If the suite is run without TestClient
    # first, this populates the schema.
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        # Clear any rows left over from earlier tests in the suite
        # so the "all zero" assertion is deterministic.
        from backend import models
        db.query(models.GenerationCounter).delete()
        db.commit()
        result = get_all_counters(db)
        assert set(result.keys()) == set(EXPECTED_KEYS)
        assert all(result[k] == 0 for k in EXPECTED_KEYS)
    finally:
        db.close()


def test_get_all_counters_returns_deterministic_order():
    from backend.database import Base, engine, SessionLocal
    from backend import models
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        # Wipe the table so this test is independent of others
        db.query(models.GenerationCounter).delete()
        db.commit()
        # Insert rows out of canonical order
        db.add(models.GenerationCounter(name="warnings", total=7))
        db.add(models.GenerationCounter(name="hko_fetches", total=3))
        db.add(models.GenerationCounter(name="alerts_generated", total=1))
        db.commit()
        result = get_all_counters(db)
        assert list(result.keys()) == EXPECTED_KEYS
        assert result["hko_fetches"] == 3
        assert result["warnings"] == 7
        assert result["alerts_generated"] == 1
    finally:
        db.close()


def test_metrics_endpoint_returns_all_eight_keys():
    with TestClient(app) as c:
        r = c.post("/api/weather/metrics")
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == set(EXPECTED_KEYS), (
            f"Expected {sorted(EXPECTED_KEYS)}, got {sorted(data.keys())}"
        )
        for k, v in data.items():
            assert isinstance(v, int), f"{k} is {type(v).__name__}, expected int"
            assert v >= 0


def test_metrics_endpoint_returns_deterministic_key_order():
    with TestClient(app) as c:
        r = c.post("/api/weather/metrics")
        assert list(r.json().keys()) == EXPECTED_KEYS


def test_state_json_static_bundle_has_all_eight_metric_keys():
    """The static-mode frontend reads counters from public/data/state.json
    on GitHub Pages. That file must contain all 8 numeric keys so
    the panel can render them without falling back to zeros."""
    path = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "state.json")
    if not os.path.isfile(path):
        pytest.skip("public/data/state.json not present in this checkout")
    with open(path) as f:
        state = json.load(f)
    for k in EXPECTED_KEYS:
        assert k in state, f"state.json missing metric {k}"
        assert isinstance(state[k], (int, float)), (
            f"state.json metric {k} is {type(state[k]).__name__}, expected number"
        )


# Cleanup: remove the temp DB after the module is done
def pytest_sessionfinish(session, exitstatus):
    try:
        os.remove(_TEST_DB)
    except OSError:
        pass
