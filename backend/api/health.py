"""
Health check router for ClimateShield backend.

GET /api/health returns 200 OK when all checks pass,
or 503 Service Unavailable with details on failures.
"""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from backend.services.health_service import run_health_checks

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health():
    result = await run_health_checks()
    is_healthy = result["status"] == "healthy"
    return JSONResponse(
        content=result,
        status_code=status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
