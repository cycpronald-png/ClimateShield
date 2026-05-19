import logging

logger = logging.getLogger(__name__)

def emit_agent_log(agent_id: str, log_type: str, message: str) -> None:
    """Stub: replaces agent event bus logging with standard logging."""
    logger.info(f"[{agent_id}] {log_type}: {message}")

def get_recent_events(limit: int = 500) -> list:
    """Stub: returns empty list since agent council is removed."""
    return []

def event_generator():
    """Stub: empty event generator."""
    return
    yield  # Makes it a generator
