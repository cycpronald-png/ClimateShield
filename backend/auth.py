from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader
import os
import secrets

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


def _get_valid_api_keys():
    key = os.getenv("ADMIN_API_KEY")
    if not key:
        raise RuntimeError(
            "ADMIN_API_KEY environment variable is required. "
            "Set it before starting the application."
        )
    return {key}


async def get_api_key(api_key_header: str = Security(api_key_header)):
    if not api_key_header:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    valid_keys = _get_valid_api_keys()
    header_bytes = api_key_header.encode("utf-8")
    for valid_key in valid_keys:
        if secrets.compare_digest(header_bytes, valid_key.encode("utf-8")):
            return api_key_header
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )
