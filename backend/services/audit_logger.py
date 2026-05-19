import json
import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler
from typing import Optional

AUDIT_LOG_PATH = os.getenv("AUDIT_LOG_PATH", "/app/backend/data/audit.log")
AUDIT_LOG_MAX_BYTES = int(os.getenv("AUDIT_LOG_MAX_BYTES", "10485760"))  # 10MB
AUDIT_LOG_BACKUP_COUNT = int(os.getenv("AUDIT_LOG_BACKUP_COUNT", "5"))

_audit_logger: Optional[logging.Logger] = None


def _get_audit_logger() -> logging.Logger:
    global _audit_logger
    if _audit_logger is not None:
        return _audit_logger

    logger = logging.getLogger("climateshield.audit")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # Ensure directory exists
    log_dir = os.path.dirname(AUDIT_LOG_PATH)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

    handler = RotatingFileHandler(
        AUDIT_LOG_PATH,
        maxBytes=AUDIT_LOG_MAX_BYTES,
        backupCount=AUDIT_LOG_BACKUP_COUNT,
    )
    handler.setLevel(logging.INFO)

    # Plain JSON formatter — one line per entry
    class JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            return json.dumps({
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "action": record.action,
                "ip": record.ip,
                "details": record.details,
            }, default=str)

    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    _audit_logger = logger
    return _audit_logger


def audit_log(action: str, ip: str, details: Optional[str] = None) -> None:
    """Write a single audit log entry."""
    logger = _get_audit_logger()
    record = logger.makeRecord(
        logger.name,
        logging.INFO,
        "",
        0,
        "",
        (),
        None,
    )
    record.action = action
    record.ip = ip
    record.details = details or ""
    logger.handle(record)
