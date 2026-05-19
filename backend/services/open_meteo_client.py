"""
Open-Meteo Async Client (mirrors HKOClient pattern).
"""
import logging
import httpx
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

BASE_URL = "https://api.open-meteo.com/v1"
USER_AGENT = "ClimateShield/1.0 (+https://climateshield.hk; contact@climateshield.hk)"

# HK coordinates
HK_LATITUDE = 22.3193
HK_LONGITUDE = 114.1694


class OpenMeteoClient:
    """
    Shared async client for Open-Meteo Forecast API.
    Managed via FastAPI lifespan (init on startup, close on shutdown).
    Implements retry logic per Context7/httpx best practices.
    """

    def __init__(self, timeout: float = 10.0, max_retries: int = 3):
        self._client: Optional[httpx.AsyncClient] = None
        self._timeout = timeout
        self._max_retries = max_retries

    async def init(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=BASE_URL,
                timeout=httpx.Timeout(timeout=self._timeout, connect=10.0, read=10.0),
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json",
                },
                follow_redirects=True,
            )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def is_ready(self) -> bool:
        return self._client is not None and not self._client.is_closed

    async def _fetch_with_retry(
        self,
        latitude: float = HK_LATITUDE,
        longitude: float = HK_LONGITUDE,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch 14-day daily forecast with retry logic.
        Retries on ConnectError, ReadTimeout, and HTTP 5xx errors.
        Returns JSON dict on success, None on persistent failure.
        """
        if not self.is_ready:
            raise RuntimeError("OpenMeteoClient not initialized. Call init() in lifespan.")

        for attempt in range(1, self._max_retries + 1):
            try:
                response = await self._client.get(
                    "/forecast",
                    params={
                        "latitude": latitude,
                        "longitude": longitude,
                        "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean",
                        "forecast_days": 14,
                        "timezone": "auto",
                    },
                )
                response.raise_for_status()
                data = response.json()
                # Open-Meteo can return HTTP 200 with {"error": true, "reason": "..."}
                if data.get("error"):
                    logger.warning(
                        "Open-Meteo returned error on attempt %s: %s",
                        attempt,
                        data.get("reason", "unknown"),
                    )
                    # Don't retry on API-level errors (bad params, etc.)
                    return None
                return data
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                # Retry on 5xx server errors; fail fast on 4xx client errors
                if 500 <= status < 600 and attempt < self._max_retries:
                    logger.warning(
                        "Open-Meteo HTTP %s on attempt %s/%s — retrying...",
                        status,
                        attempt,
                        self._max_retries,
                    )
                    continue
                logger.warning(
                    "OpenMeteoClient HTTP error %s: %s",
                    status,
                    e,
                )
                return None
            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                if attempt < self._max_retries:
                    logger.warning(
                        "Open-Meteo %s on attempt %s/%s — retrying...",
                        type(e).__name__,
                        attempt,
                        self._max_retries,
                    )
                    continue
                logger.warning(
                    "OpenMeteoClient connection error after %s attempts: %s",
                    self._max_retries,
                    e,
                )
                return None
            except httpx.RequestError as e:
                # Network-level errors that aren't ConnectTimeout
                if attempt < self._max_retries:
                    logger.warning(
                        "Open-Meteo request error on attempt %s/%s — retrying: %s",
                        attempt,
                        self._max_retries,
                        e,
                    )
                    continue
                logger.warning("OpenMeteoClient request error: %s", e)
                return None
            except Exception as e:
                logger.warning("OpenMeteoClient unexpected error: %s", e)
                return None
        return None  # Should not reach here

    async def fetch_14day_forecast(
        self,
        latitude: float = HK_LATITUDE,
        longitude: float = HK_LONGITUDE,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch 14-day daily forecast from Open-Meteo.
        Returns the JSON response dict on success, None on any exception.
        """
        return await self._fetch_with_retry(latitude, longitude)


# Global singleton — wired in FastAPI lifespan
open_meteo = OpenMeteoClient()
