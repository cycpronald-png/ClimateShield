"""
Weather API router shim.

This module is preserved for backwards compatibility with existing imports
(``from backend.api import weather``) but the routes have been split into
focused modules:

  * :mod:`backend.api.weather_current`   — GET /api/weather/current
  * :mod:`backend.api.weather_forecast`  — GET /api/weather/forecast, /risks, /trends
  * :mod:`backend.api.weather_history`   — GET /api/weather/history*, POST /live-score
  * :mod:`backend.api.weather_admin`     — alerts, warnings, refresh, metrics, risk-config

All four modules share the same ``/api/weather`` prefix and are mounted by
``backend.main``.
"""
from fastapi import APIRouter

from backend.api.weather_current import router as current_router
from backend.api.weather_forecast import router as forecast_router
from backend.api.weather_history import router as history_router
from backend.api.weather_admin import router as admin_router

router = APIRouter(prefix="/api/weather", tags=["weather"])
for sub in (current_router, forecast_router, history_router, admin_router):
    router.include_router(sub)

__all__ = ["router"]
