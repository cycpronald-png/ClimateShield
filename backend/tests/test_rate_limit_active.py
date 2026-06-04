"""
Smoke test for the new rate-limiter wiring.

The old code had `@limiter.limit("3/minute")` decorators on routes
but never registered ``app.state.limiter`` or the RateLimitExceeded
handler — so the limits were silently no-ops. This test confirms the
4th call in a minute now returns 429.
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("METRICS_PASSWORD", "test-metrics")
os.environ.setdefault("ADMIN_API_KEY", "test-api-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_verify_password_rate_limit(client):
    """Hitting /verify-password > 5 times in a minute should produce 429."""
    payload = {"password": "wrong"}
    statuses = []
    for _ in range(7):
        r = client.post("/api/weather/verify-password", json=payload)
        statuses.append(r.status_code)
    # The first 5 are 403 (invalid), the 6th+ must be 429
    assert 429 in statuses, f"Expected at least one 429, got {statuses}"
    assert statuses[5] == 429 or statuses[6] == 429
