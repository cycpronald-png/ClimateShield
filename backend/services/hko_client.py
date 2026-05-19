"""
HKO Open Data Async Client (Best Practice: Shared httpx.AsyncClient via lifespan).
"""
import logging
import httpx
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

BASE_URL = "https://data.weather.gov.hk"
HKO_USER_AGENT = "ClimateShield/1.0 (+https://climateshield.hk; contact@climateshield.hk)"

# Station-to-district mapping for HK observatory network
STATION_DISTRICT_MAP = {
    "Hong Kong Observatory": "Yau Tsim Mong",
    "King's Park": "Yau Tsim Mong",
    "Wong Chuk Hang": "Southern",
    "Ta Kwu Ling": "North",
    "Lau Fau Shan": "Yuen Long",
    "Tai Po": "Tai Po",
    "Sha Tin": "Sha Tin",
    "Tuen Mun": "Tuen Mun",
    "Tseung Kwan O": "Sai Kung",
    "Sai Kung": "Sai Kung",
    "Cheung Chau": "Islands",
    "Chek Lap Kok": "Islands",
    "Tsing Yi": "Kwai Tsing",
    "Shek Kong": "Yuen Long",
    "Tsuen Wan Ho Koon": "Tsuen Wan",
    "Tsuen Wan Shing Mun Valley": "Tsuen Wan",
    "Hong Kong Park": "Central and Western",
    "Shau Kei Wan": "Eastern",
    "Kowloon City": "Kowloon City",
    "Happy Valley": "Wan Chai",
    "Wong Tai Sin": "Wong Tai Sin",
    "Stanley": "Southern",
    "Kwun Tong": "Kwun Tong",
    "Sham Shui Po": "Sham Shui Po",
    "Kai Tak Runway Park": "Kowloon City",
    "Yuen Long Park": "Yuen Long",
    "Tai Mei Tuk": "Tai Po",
}


class HKOClient:
    """
    Shared async client for Hong Kong Observatory Open Data API.
    Managed via FastAPI lifespan (init on startup, aclose on shutdown).
    """

    def __init__(self, timeout: float = 10.0):
        self._client: Optional[httpx.AsyncClient] = None
        self._timeout = timeout

    async def init(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=BASE_URL,
                timeout=httpx.Timeout(timeout=self._timeout, connect=5.0),
                headers={
                    "User-Agent": HKO_USER_AGENT,
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

    async def _fetch(self, data_type: str, lang: str = "en") -> Optional[Dict[str, Any]]:
        if not self.is_ready:
            raise RuntimeError("HKOClient not initialized. Call init() in lifespan.")
        try:
            response = await self._client.get(
                "/weatherAPI/opendata/weather.php",
                params={"dataType": data_type, "lang": lang},
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            # Log and return None for non-critical transient errors
            logger.warning("HKOClient HTTP error %s for %s: %s", e.response.status_code, data_type, e)
            return None
        except httpx.RequestError as e:
            logger.warning("HKOClient request error for %s: %s", data_type, e)
            return None

    async def fetch_current_weather(self, lang: str = "en") -> Optional[Dict[str, Any]]:
        """dataType=rhrread: current temp, humidity, rainfall, UV, wind."""
        return await self._fetch("rhrread", lang)

    async def fetch_forecast(self, lang: str = "en") -> Optional[Dict[str, Any]]:
        """dataType=fnd: 9-day forecast with max/min temp, humidity, weather desc, wind."""
        return await self._fetch("fnd", lang)

    async def fetch_warnings(self, lang: str = "en") -> Optional[Dict[str, Any]]:
        """dataType=warnsum: summary of active warnings."""
        return await self._fetch("warnsum", lang)

    async def fetch_warning_detail(self, lang: str = "en") -> Optional[Dict[str, Any]]:
        """dataType=warninfo: detailed warning information."""
        return await self._fetch("warninfo", lang)

    async def fetch_local_forecast(self, lang: str = "en") -> Optional[Dict[str, Any]]:
        """dataType=flw: local forecast + general situation."""
        return await self._fetch("flw", lang)

    async def fetch_all(self, lang: str = "en") -> Dict[str, Optional[Dict[str, Any]]]:
        """Fetch all primary data types concurrently (best practice: asyncio.gather)."""
        import asyncio
        results = await asyncio.gather(
            self.fetch_current_weather(lang),
            self.fetch_forecast(lang),
            self.fetch_warnings(lang),
            self.fetch_local_forecast(lang),
        )
        return {
            "current": results[0],
            "forecast": results[1],
            "warnings": results[2],
            "local": results[3],
        }

    def resolve_district(self, station_name: str) -> Optional[str]:
        return STATION_DISTRICT_MAP.get(station_name)


# Global singleton — wired in FastAPI lifespan
hko = HKOClient()
