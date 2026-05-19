"""
Lightweight JSON timestamp persistence for last-refresh tracking.
Stores state in backend/.last_refresh.json — no DB migration needed.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_STATE_PATH = Path(__file__).resolve().parent.parent / ".last_refresh.json"


def _write_last_refresh(success: bool, error: str | None = None) -> None:
    """Write a timestamp record to the JSON state file."""
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "success": success,
    }
    if error:
        payload["error"] = error
    try:
        _STATE_PATH.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as e:
        logger.warning("Failed to write state file: %s", e)


def get_last_refresh() -> dict:
    """Return the last refresh record, or null defaults if absent/corrupted."""
    if not _STATE_PATH.exists():
        return {"timestamp": None, "success": None}
    try:
        data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        return {
            "timestamp": data.get("timestamp"),
            "success": data.get("success"),
            "error": data.get("error"),
        }
    except Exception:
        return {"timestamp": None, "success": None}
