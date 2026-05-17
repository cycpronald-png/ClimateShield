# Integrations — ClimateShield

## External APIs

### Hong Kong Observatory (HKO) Open Data API

- **Service:** Hong Kong Observatory Weather API
- **Base URL:** `https://data.weather.gov.hk`
- **Endpoint:** `/weatherAPI/opendata/weather.php`
- **Auth:** None (public open data)
- **Client:** `backend/services/hko_client.py` — `HKOClient` class (httpx.AsyncClient singleton, lifespan-managed)
- **User-Agent:** `ClimateShield/1.0 (+https://climateshield.hk; contact@climateshield.hk)`

**Data Types Fetched:**
| dataType | Description | Purpose |
|----------|-------------|---------|
| `rhrread` | Current weather readings | Temperature, humidity, rainfall, UV, wind per station |
| `fnd` | 9-day forecast | Max/min temp, humidity, weather description, wind, PSR |
| `warnsum` | Warning summary | Active weather warnings (typhoon, rainstorm, etc.) |
| `flw` | Local forecast | General weather situation + local forecast |

**Fetch Strategy:**
- Concurrent fetch via `asyncio.gather()` in `HKOClient.fetch_all()`
- Shared httpx.AsyncClient (lifespan-managed: `init()` on startup, `aclose()` on shutdown)
- Timeout: 10s (5s connect)
- Non-critical failure: returns `None` on HTTP errors (logged, not raised)
- Follow redirect: enabled

**Station Mapping:**
- 26 HKO stations mapped to 18 HK districts in `STATION_DISTRICT_MAP` (`hko_client.py`)
- 5 stations monitored for Control Plane: Hong Kong Observatory, Kai Tak Runway Park, King's Park, Kowloon City, Sham Shui Po

### Open-Meteo Forecast API

- **Service:** Open-Meteo Free Weather API
- **Base URL:** `https://api.open-meteo.com/v1`
- **Endpoint:** `/forecast`
- **Auth:** None (free, no API key needed)
- **Client:** `backend/services/open_meteo_client.py` — `OpenMeteoClient` class (httpx.AsyncClient singleton, lifespan-managed)
- **Coordinates:** HK (22.3193°N, 114.1694°E)

**Parameters:**
- `daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean`
- `forecast_days=14`
- `timezone=auto`

**Fetch Strategy:**
- Retry logic: up to 3 attempts on ConnectError, ReadTimeout, and HTTP 5xx
- Fast-fail on 4xx client errors and API-level error responses (`{"error": true}`)
- Timeout: 10s (10s connect, 10s read)
- Enabled/disabled via `weather_orchestrator.set_open_meteo_enabled(True)`

**Purpose:** Extends HKO's 9-day forecast to 14 days by appending days 10-14 with computed risk scores.
- Gate: `beta_14day=true` query param on frontend request
- Status: `OPENMETEO_ENABLED` env var (default: `true`)

## Internal API Endpoints

### Weather Data (`/api/weather`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/weather/current` | Public | Latest reading per station (last 2h) |
| GET | `/api/weather/forecast` | Public | 9-day forecast (+ optional 14-day via `?beta_14day=true`) |
| GET | `/api/weather/risks` | Public | 7-day and 9-day risk outlook summaries |
| GET | `/api/weather/history` | Public | Daily aggregates for N days (`?days=7&station=X&beta_14day=true`) |
| GET | `/api/weather/history/readings` | Public | Raw readings per station for N hours (`?station=X&hours=12`) |
| POST | `/api/weather/live-score` | Public | On-the-fly risk score recomputation for a station |
| GET | `/api/weather/trends` | Public | Combined 7-day backward + 9-day forward trend data |
| GET | `/api/weather/warnings` | Public | Active HKO weather warnings |
| GET | `/api/weather/last-refresh` | Public | Last data refresh timestamp and status |
| POST | `/api/weather/refresh` | Rate-limited (3/min) | Manual HKO data fetch trigger |
| GET | `/api/weather/alerts/unread` | Public | Pending (unacknowledged) system alerts |
| POST | `/api/weather/alerts/{id}/ack` | Public | Acknowledge a system alert |
| POST | `/api/weather/metrics` | Public | Generation impact counters |
| POST | `/api/weather/metrics/reset` | Password | Reset all counters (requires `METRICS_PASSWORD`) |
| POST | `/api/weather/metrics/last-reset` | Public | Last counter reset timestamp |
| POST | `/api/weather/verify-password` | Rate-limited (5/min) | Verify metrics/admin password |
| GET | `/api/weather/risk-config` | Public | Active risk formula configuration (read-only) |

### Admin (`/api/admin`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/export` | None (open) | Full JSON backup export |
| POST | `/api/admin/import` | None (open) | Import JSON backup (50MB limit) |
| GET | `/api/admin/donations` | None | List all donation pledges |
| GET | `/api/admin/donations/{id}` | None | Get specific pledge |
| GET | `/api/admin/risk-config` | Admin password (X-Admin-Password header) | Risk formula config |
| PUT | `/api/admin/risk-config` | Admin password | Update risk formula config |
| POST | `/api/admin/risk-config/reset` | Admin password | Reset to default formula |
| POST | `/api/admin/risk-config/test` | Admin password | Test config with sample scenarios |

### Donor (`/api/donor`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/donor/pledge` | Public | Submit a donation pledge (auto-creates donor profile) |

### Health (`/api/health`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | Public | Health check (DB, HKO API, disk space) |

### Frontend API Client

- Centralized in `src/services/api.ts`
- All calls use native `fetch()` — no Axios or similar
- API base: `/api` (relative, proxied by Vite in dev)
- Three API groups: `api.weather.*`, `api.admin.*`, `api.donate.*`, `api.agents.*`
- `api.agents.getStreamUrl()` references `/api/agents/stream` (SSE endpoint — stub on backend)

## Data Flow

### Primary Data Ingestion (HKO → DB → Frontend)

```
[HKO API]                    [Backend]                         [Frontend]
    │                             │                                  │
    │  ┌──────────────────────┐   │                                  │
    │  │  APScheduler Jobs    │   │                                  │
    │  │  (AsyncIOScheduler)  │   │                                  │
    │  └──────────────────────┘   │                                  │
    │          │                    │                                  │
    │    Every 10 min               │                                  │
    │    ┌─────────────┐           │                                  │
    │    │_poll_and_   │           │                                  │
    │    │ persist()    │─────────►│ parse_hko_to_readings()          │
    │    └─────────────┘           │ parse_hko_to_warnings()         │
    │          │                    │ calculate_wbt() per reading     │
    │    Every 60 min               │ compute_risk_score_v2()         │
    │    ┌─────────────┐           │ persist_hot_night_counts()      │
    │    │_hourly_      │           │ → WeatherReading rows           │
    │    │forecast_     │           │ → WeatherForecastDay rows       │
    │    │refresh()    │           │ → WeatherWarning rows           │
    │    └─────────────┘           │ → SystemAlert (if threshold)    │
    │          │                    │ → GenerationCounter increments │
    │    Daily 08:30 HK            │                                  │
    │    ┌─────────────┐           │                                  │ GET /api/weather/current
    │    │_daily_hne_  │           │                                  │────────────────────────►
    │    │check()      │           │                                  │ GET /api/weather/forecast
    │    └─────────────┘           │                                  │ GET /api/weather/risks
    │          │                    │                                  │ GET /api/weather/warnings
    │    4x Daily (0,6,12,18h)     │                                  │ GET /api/weather/alerts/unread
    │    ┌─────────────┐           │                                  │
    │    │_scheduled_  │           │                                  │
    │    │refresh()   │           │                                  │
    │    │(with retry)│           │                                  │
    │    └─────────────┘           │                                  │
    │          │                    │                                  │
    ▼          ▼                    ▼                                  ▼
```

### Extended Forecast (Open-Meteo)

```
[Open-Meteo API]              [Backend]                         [Frontend]
     │                             │                                  │
     │  GET /forecast              │                                  │
     │  (14-day, HK coords)       │                                  │
     │◄────────────────────────────│                                  │
     │                             │  get_extended_forecast()         │
     │────────────────────────────►│  Filters days 10-14             │
     │                             │  Calculates WBT + CRS            │ GET /api/weather/forecast?beta_14day=true
     │                             │  Appends to HKO forecast        │◄───────────────────────────
     │                             │                                  │
     ▼                             ▼                                  ▼
```

### Risk Score Computation (V2 Formula)

```
┌──────────────────────────────────────────────────────────────────┐
│  Risk Formula:  R = (W + H + V) × M    (capped at 30)           │
│                                                                  │
│  W = Wet-Bulb Temperature score (0-6)                            │
│      From: risk_config.wbt_thresholds                            │
│                                                                  │
│  H = Hot Night Excess score (0-4)                                │
│      From: risk_config.hne_thresholds                            │
│      Input: consecutive hot nights count                          │
│                                                                  │
│  V = Vulnerability bonus (0 or 5)                                │
│      From: risk_config.vulnerability_config                      │
│      Triggered when H ≥ configurable threshold                   │
│                                                                  │
│  M = Warning Multiplier (1.0-3.0)                               │
│      From: risk_config.warning_multipliers                        │
│      Based on active warning types (typhoon, rainstorm, etc.)    │
│                                                                  │
│  T8 Floor Rule: If T8 signal active, minimum score from config   │
│                                                                  │
│  Config source: RiskFormulaConfig (DB) / backend/services/       │
│    risk_config_service.py + climate/scoring_v2.py               │
└──────────────────────────────────────────────────────────────────┘
```

### Donation Flow

```
[Donor]                      [Frontend]                       [Backend]
   │                             │                                │
   │ Submit pledge form           │                                │
   │────────────────────────────►│ POST /api/donor/pledge          │
   │                             │───────────────────────────────►│
   │                             │                                │ crud.create_donation_pledge()
   │                             │                                │   → DonorProfile (upsert by email)
   │                             │                                │   → DonationPledge (status=pending)
   │                             │                                │   → DonationItem (per item)
   │                             │◄───────────────────────────────│
   │ Confirmation                 │                                │
   │◄────────────────────────────│                                │
```

## Auth & Security

### Admin API Key Auth

- Implementation: `backend/auth.py`
- Mechanism: `X-API-Key` header (FastAPI `APIKeyHeader` security scheme)
- Secret: `ADMIN_API_KEY` env var (required, fails at startup if missing)
- Comparison: `secrets.compare_digest()` (constant-time comparison)
- Currently not enforced on admin routes (code exists but not wired as dependency)

### Admin Password Auth

- Implementation: `backend/api/admin.py`
- Mechanism: `X-Admin-Password` header or request body `password` field
- Secret: `ADMIN_PASSWORD` env var
- Used for: risk config CRUD, metrics reset
- Comparison: `secrets.compare_digest()`

### Metrics Password Auth

- Implementation: `backend/api/weather.py`
- Mechanism: Request body `password` field
- Secret: `METRICS_PASSWORD` env var
- Used for: metrics reset, password verification

### CORS

- Origins configurable via `CORS_ORIGINS` env var (comma-separated)
- Default: `http://localhost:5173`, `http://localhost:3000`
- Credentials allowed: yes
- Methods: all (`*`)
- Headers: all (`*`)

### Rate Limiting

- Implementation: `backend/limiter.py` (slowapi)
- Key: remote IP address
- Applied endpoints:
  - `POST /api/weather/refresh` — 3/minute
  - `POST /api/weather/verify-password` — 5/minute

### Audit Logging

- Implementation: `backend/services/audit_logger.py`
- Storage: Rotating file (`/app/backend/data/audit.log`, 10MB, 5 backups)
- Format: JSON (timestamp, action, ip, details)
- Events logged: export_backup, import_backup, view_donations, update_risk_config, reset_risk_config, reset_metrics

## Scheduled Tasks

All scheduled via APScheduler (`AsyncIOScheduler`, timezone: Asia/Hong_Kong) in `backend/services/scheduler.py`:

| Job ID | Trigger | Function | Purpose |
|--------|---------|----------|---------|
| `hko_poll_10min` | Every 10 min (±5s jitter) | `_poll_and_persist()` | Full HKO fetch: current weather + warnings |
| `hko_forecast_60min` | Every 60 min (±5s jitter) | `_hourly_forecast_refresh()` | HKO forecast refresh |
| `hne_daily_0830` | Cron: 08:30 HK time daily | `_daily_hne_check()` | Hot Night Excess computation + alerts |
| `hko_scheduled_0000` | Cron: 00:00 HK | `_scheduled_refresh()` | Full refresh with 1h retry on failure |
| `hko_scheduled_0600` | Cron: 06:00 HK | `_scheduled_refresh()` | Full refresh with 1h retry on failure |
| `hko_scheduled_1200` | Cron: 12:00 HK | `_scheduled_refresh()` | Full refresh with 1h retry on failure |
| `hko_scheduled_1800` | Cron: 18:00 HK | `_scheduled_refresh()` | Full refresh with 1h retry on failure |
| `wal_checkpoint` | Every 6 hours | `checkpoint_wal()` | SQLite WAL TRUNCATE checkpoint |

**Retry behavior:**
- `_scheduled_refresh()` schedules a one-time retry job 1 hour after failure
- Retry jobs use `DateTrigger` with unique IDs (`hko_retry_{original_job_id}`)
- `max_instances=1`, `coalesce="latest"` on all jobs
- `misfire_grace_time`: 60s for polls, 300s for daily/checkpoint jobs

**Startup seed:**
- Immediate first poll via `asyncio.get_event_loop().create_task(_poll_and_persist())` at scheduler start
- `seed_weather_data()` called from FastAPI lifespan after scheduler start

## Integration Risks

### HKO API Dependency (High Risk)
- **Risk:** HKO API has no SLA; outages directly block data refresh
- **Mitigation:** Retry logic on scheduled refreshes (1h delay); stale data served from DB until refresh succeeds
- **Gap:** No circuit breaker; repeated failures will keep retrying every scheduled interval
- **Impact:** Frontend shows stale data; no new alerts generated; risk scores not updated

### Open-Meteo API Dependency (Medium Risk)
- **Risk:** Optional 14-day forecast extension; not critical path
- **Mitigation:** Graceful fallback — returns only HKO 9-day forecast if Open-Meteo fails
- **Status:** Controlled by `OPENMETEO_ENABLED` env var and `beta_14day` query param

### No Authentication on Admin Export/Import (High Risk)
- **Risk:** `/api/admin/export` and `/api/admin/import` have no auth requirement
- **Impact:** Anyone with network access can export all data or import arbitrary data
- **Mitigation:** None currently in place
- **Recommendation:** Wire `get_api_key` dependency or admin password on these endpoints

### No WebSocket/SSE for Live Updates (Low Risk)
- **Risk:** Frontend polls periodically; no real-time push
- **Mitigation:** `api.agents.getStreamUrl()` references `/api/agents/stream` but backend `agent_event_bus` is a stub (no actual SSE)
- **Impact:** Alerts and risk changes may take up to 10 minutes to appear

### SQLite Concurrency Limits (Medium Risk)
- **Risk:** SQLite WAL mode supports concurrent reads but single writer; high-frequency writes may block
- **Mitigation:** WAL checkpoint every 6 hours prevents unbounded log growth
- **Scale limit:** Single-process deployment only; PostgreSQL needed for horizontal scaling

### Secrets Management (Medium Risk)
- **Risk:** `ADMIN_API_KEY`, `ADMIN_PASSWORD`, `METRICS_PASSWORD` stored in `.env` file
- **Mitigation:** `.env` in `.gitignore`; `docker-compose.yml` loads from `.env` file
- **Gap:** No vault integration; no secret rotation; default keys in `.env.example`
- **Recommendation:** Generate strong random keys for production; use secrets manager

### Rate Limiting Coverage (Low Risk)
- **Risk:** Rate limiting only applied to 2 endpoints (`/refresh`, `/verify-password`)
- **Impact:** Other endpoints (e.g., `/metrics/reset`) could be brute-forced
- **Mitigation:** Password auth on sensitive mutations provides some protection

---

*Integration audit: 2026-05-17*