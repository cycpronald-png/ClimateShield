# External Integrations

**Analysis Date:** 2026-05-14

## APIs & External Services

**Hong Kong Observatory (HKO) Open Data API:**
- Base URL: `https://data.weather.gov.hk`
- Client implementation: `backend/services/hko_client.py`
- SDK: `httpx` ^0.27.0 (shared `AsyncClient` managed via FastAPI lifespan)
- Endpoints consumed:
  - `GET /weatherAPI/opendata/weather.php?dataType=rhrread` — Current weather (temperature, humidity, rainfall, UV, wind)
  - `GET /weatherAPI/opendata/weather.php?dataType=fnd` — 9-day forecast (max/min temp, humidity, weather description, wind)
  - `GET /weatherAPI/opendata/weather.php?dataType=warnsum` — Summary of active warnings
  - `GET /weatherAPI/opendata/weather.php?dataType=warninfo` — Detailed warning information
  - `GET /weatherAPI/opendata/weather.php?dataType=flw` — Local forecast + general situation
- Auth: None required (open data)
- User-Agent header: `ClimateShield/1.0 (+https://climateshield.hk; contact@climateshield.hk)`
- Timeout: 10s connect, 10s read with 5s connect timeout override on `rhrread`
- Data flow: HKO raw JSON → `parse_hko_to_readings()` / `parse_hko_to_forecast()` / `parse_hko_to_warnings()` → SQLAlchemy models → SQLite/PostgreSQL
- Retry: `DateTrigger` retry scheduled 1 hour after failure (`_scheduled_refresh` in `backend/services/scheduler.py`)

**Open-Meteo Forecast API:**
- Base URL: `https://api.open-meteo.com/v1`
- Client implementation: `backend/services/open_meteo_client.py`
- SDK: `httpx` ^0.27.0
- Endpoint consumed:
  - `GET /forecast?latitude=22.3193&longitude=114.1694&daily=temperature_2m_max,temperature_2m_min,relative_humidity_mean&forecast_days=14&timezone=auto`
- Auth: None required (open data)
- User-Agent header: `ClimateShield/1.0 (+https://climateshield.hk; contact@climateshield.hk)`
- Purpose: Extends the HKO 9-day forecast with days 10–14; appends computed WBT and composite risk scores
- Toggle: Enabled via `OPENMETEO_ENABLED=true` in `.env`; wired in lifespan (`weather_orchestrator.set_open_meteo_enabled(True)`)
- Fallback: Returns `open_meteo_status: "disabled" | "unavailable" | "error"` with empty extended forecast on failure

## Data Storage

**Databases:**
- **SQLite** (default): `sqlite:///./climateshield.db` or `/app/backend/data/climateshield.db` in Docker
  - Connection: `DATABASE_URL` env var (optional)
  - Client: SQLAlchemy ^2.0.46 with `NullPool` for SQLite
  - WAL mode enabled (`PRAGMA journal_mode=WAL`) for concurrency
  - Auto-migration fallback: `_ensure_risk_columns()` in `backend/database.py` adds missing columns via `ALTER TABLE`
- **PostgreSQL** (optional): Uncomment `DATABASE_URL` in `.env`
  - Driver: `psycopg2-binary` ^2.9.11
  - Pool: Standard SQLAlchemy pool (not `NullPool`)

**Schema Migrations:**
- Tool: Alembic ^1.18.4
- Config: `backend/alembic/` (inferred from dependency)
- Startup safety: `Base.metadata.create_all(engine)` runs in lifespan to create missing tables

**File Storage:**
- Local filesystem only — SQLite `.db` file and audit logs in `/app/backend/data`

**Caching:**
- None detected (no Redis/Memcached)
- SQLite WAL checkpoint every 6 hours via APScheduler to prevent unbounded WAL growth

## Authentication & Identity

**Auth Provider:** Custom (API-key and password based)
- `ADMIN_API_KEY` — Protects admin endpoints
- `ADMIN_PASSWORD` — Admin panel authentication
- `METRICS_PASSWORD` — Metrics endpoint authentication
- Implementation: Passed as query params or JSON body to backend routers (`backend/api/admin.py`)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Rollbar)
- Logging: Python `logging` module with structured `emit_agent_log()` calls to an internal `agent_event_bus`

**Logs:**
- Console logging from scheduler jobs (`print` + `logger`)
- Agent event bus logs (`backend/services/agent_event_bus.py`) for operational traceability

## CI/CD & Deployment

**Hosting:** Docker Compose (development)
- `docker-compose.yml` defines two services: `backend` (port 8000) and `frontend` (port 5173)
- Backend depends on frontend being healthy
- Volume `climateshield_data` persists SQLite and logs

**CI Pipeline:** Not detected

## Environment Configuration

**Required env vars:**
- `ADMIN_API_KEY` — API key for admin endpoints
- `ADMIN_PASSWORD` — Admin panel password
- `METRICS_PASSWORD` — Metrics access password
- `DATABASE_URL` — Optional; defaults to SQLite
- `STATIC_DIR` — Frontend build output path (`/app/frontend/dist`)
- `OPENMETEO_ENABLED` — Toggle Open-Meteo integration (`true`/`false`)

**Secrets location:**
- `.env` at project root (gitignored)
- `.env.example` documents all variables

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected (no webhooks sent to external services)

## Data Flow Architecture

**HKO Polling Loop (Primary):**
1. `APScheduler` triggers `_poll_and_persist()` every 10 minutes
2. `HKOClient.fetch_all()` concurrently requests `rhrread`, `fnd`, `warnsum`, `flw`
3. `WeatherOrchestrator` parses JSON into flat dicts (`parse_hko_to_readings`, `parse_hko_to_forecast`, `parse_hko_to_warnings`)
4. Climate engine computes WBT, HNE, composite risk scores, and risk outlooks
5. Persisted to `WeatherReading`, `WeatherForecastDay`, `WeatherWarning`, `SystemAlert` tables
6. Frontend queries `/api/weather/*` endpoints for display

**Open-Meteo Extension (Secondary):**
1. Triggered on-demand via `WeatherOrchestrator.get_extended_forecast()`
2. `OpenMeteoClient.fetch_14day_forecast()` fetches 14 days of daily data
3. Days 10–14 are appended to HKO forecast with WBT + risk scores computed using the same `climate_engine` functions
4. Frontend displays extended forecast with source attribution (`source: "open_meteo"`)

**Frontend ↔ Backend:**
- Vite dev proxy forwards `/api`, `/docs`, `/openapi.json` to `BACKEND_TARGET` (default `http://127.0.0.1:8000`)
- Production: backend serves built static files from `STATIC_DIR` and catches all SPA routes to `index.html`

---

*Integration audit: 2026-05-14*
