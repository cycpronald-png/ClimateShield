# Architecture — ClimateShield

**Analysis Date:** 2026-05-17

## System Overview

ClimateShield is a **monolithic full-stack application** with a Python (FastAPI) backend serving both a REST API and the built React SPA frontend from the same process. The architecture follows a **layered service pattern** with clear separation between API routing, business logic (services), data access (SQLAlchemy ORM), and external integrations (HKO, Open-Meteo).

**Key Characteristics:**
- Single FastAPI process serves API + static SPA (production mode)
- SQLAlchemy ORM with SQLite (WAL mode) as default database
- Scheduled background jobs via APScheduler for HKO data polling
- Admin-editable risk formula persisted in DB with validation
- Frontend uses lazy-loaded route components with offline caching

## Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React SPA (Vite)                      │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Risk     │ │ Control      │ │ Settings │ │ Donate  │ │
│  │ Intell.  │ │ Plane        │ │          │ │         │ │
│  └────┬─────┘ └──────┬───────┘ └────┬─────┘ └────┬────┘ │
│       │               │              │            │       │
│       └───────────────┴──────────────┴────────────┘       │
│                         │ fetch(/api/*)                   │
└─────────────────────────┼────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────┐
│                   FastAPI Backend                         │
│                         │                                 │
│  ┌──────────────────────┼────────────────────────────┐   │
│  │              API Layer (Routers)                    │   │
│  │  /api/weather ─── weather.py                        │   │
│  │  /api/admin  ─── admin.py                           │   │
│  │  /api/donor  ─── donor.py                            │   │
│  │  /api/health ─── health.py                           │   │
│  └──────────────────────┼────────────────────────────┘   │
│                         │                                 │
│  ┌──────────────────────┼────────────────────────────┐   │
│  │           Services Layer                            │   │
│  │  ┌───────────────────────────────────────────┐     │   │
│  │  │ WeatherOrchestrator (singleton)            │     │   │
│  │  │  parse_hko → persist → compute risk → alert│     │   │
│  │  └──────┬──────────┬──────────┬───────────────┘     │   │
│  │         │          │          │                      │   │
│  │  ┌──────┴──┐  ┌────┴────┐  ┌─┴──────────────┐     │   │
│  │  │climate/ │  │risk_    │  │hot_nights_      │     │   │
│  │  │engine   │  │config_  │  │tracker          │     │   │
│  │  │(re-     │  │service  │  │                 │     │   │
│  │  │export)  │  │         │  │                 │     │   │
│  │  └────┬────┘  └────┬────┘  └────┬────────────┘     │   │
│  │       │             │            │                   │   │
│  │  ┌────┴─────────────┴────────────┴────────────┐     │   │
│  │  │      climate/ package (domain modules)      │     │   │
│  │  │  wbt.py │ hne.py │ risk.py │ scoring_v2.py │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  └────────────────────────────────────────────────────┘   │
│                         │                                 │
│  ┌──────────────────────┼────────────────────────────┐   │
│  │         External Clients (Lifespan-managed)       │   │
│  │  HKOClient ─── data.weather.gov.hk               │   │
│  │  OpenMeteoClient ─── api.open-meteo.com           │   │
│  └───────────────────────────────────────────────────┘   │
│                         │                                 │
│  ┌──────────────────────┼────────────────────────────┐   │
│  │              Data Layer                            │   │
│  │  SQLAlchemy ORM ─── SQLite (WAL)                  │   │
│  │  models.py │ database.py │ crud.py │ schemas.py   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │           APScheduler (Background)                  │   │
│  │  10min: HKO poll  │ 60min: forecast refresh         │   │
│  │  08:30 HK: HNE daily  │ 6h: WAL checkpoint          │   │
│  │  0/6/12/18 HK: scheduled full refresh              │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## Module Boundaries

### API Layer
- Purpose: HTTP request routing, parameter validation, response serialization
- Location: `backend/api/`
- Contains: FastAPI routers with Pydantic schemas for request/response validation
- Depends on: Services layer, Database layer
- Used by: Frontend SPA via `/api/*` fetch calls

### Services Layer
- Purpose: Core business logic — weather data orchestration, climate calculations, risk scoring
- Location: `backend/services/`
- Contains:
  - `weather_orchestrator.py` — Central coordinator: parses HKO data, persists readings, computes risk scores, generates alerts
  - `climate_engine.py` — Backward-compatible re-export wrapper for `climate/` package
  - `risk_config_service.py` — Loads, validates, persists admin-editable risk formula configuration
  - `hko_client.py` — Async HTTP client for HKO Open Data API
  - `open_meteo_client.py` — Async HTTP client for Open-Meteo Forecast API
  - `scheduler.py` — APScheduler job definitions for periodic data polling
  - `counters.py` — Generation impact counter management (KPI tracking)
  - `audit_logger.py` — Action audit logging
  - `agent_event_bus.py` — Stub (replaces former agent council logging)
- Depends on: Data layer, External APIs
- Used by: API layer

### Climate Domain Package
- Purpose: Pure domain logic for climate calculations
- Location: `backend/services/climate/`
- Contains:
  - `wbt.py` — Tetens Newton-Raphson wet-bulb temperature calculation
  - `hne.py` — Hot Night Excess calculation and threshold detection
  - `risk.py` — Risk level mapping, outlook computation, alert decision logic
  - `scoring_v2.py` — Composite risk score engine: `min(30, (W + H + V) × M)`
  - `hot_nights_tracker.py` — Consecutive hot night tracking per station
- Depends on: SQLAlchemy models (for hot_nights_tracker only)
- Used by: Services layer via `climate_engine.py` re-exports

### Data Layer
- Purpose: Database access, ORM models, CRUD operations
- Location: `backend/models.py`, `backend/database.py`, `backend/crud.py`, `backend/schemas.py`
- Contains: SQLAlchemy models, session management, Pydantic schemas, donation CRUD
- Depends on: Nothing (foundational layer)
- Used by: All other backend layers

### Frontend SPA
- Purpose: UI rendering and user interaction
- Location: `src/`
- Contains: React components organized by page/feature sections
- Depends on: Backend API via fetch calls proxied through Vite dev server or same-origin in production
- Used by: End users

## Key Design Patterns

**Singleton Services (Lifespan-Managed):**
- `HKOClient` (`backend/services/hko_client.py`) — Shared `httpx.AsyncClient` initialized in FastAPI lifespan, closed on shutdown
- `OpenMeteoClient` (`backend/services/open_meteo_client.py`) — Same pattern as HKOClient
- `WeatherOrchestrator` (`backend/services/weather_orchestrator.py`) — Module-level singleton coordinating HKO data flow
- `APScheduler` (`backend/services/scheduler.py`) — Global scheduler singleton started in lifespan

**Re-Export Wrapper (Backward Compatibility):**
- `backend/services/climate_engine.py` re-exports all public APIs from `backend/services/climate/` package
- Allows existing imports (`from backend.services.climate_engine import ...`) to continue working
- New code should import directly from domain modules (e.g., `from backend.services.climate.wbt import calculate_wbt`)

**Admin-Editable Configuration:**
- Risk formula thresholds/multipliers stored in `risk_formula_configs` DB table
- `risk_config_service.py` (`backend/services/risk_config_service.py`) handles validation, upsert, and reset
- Falls back to hardcoded `DEFAULT_CONFIG` when no DB config exists
- Admin updates via `/api/admin/risk-config` (password-protected)

**Offline-Resilient Frontend:**
- `useOfflineCache` hook (`src/hooks/useOfflineCache.ts`) stores last successful API response in `sessionStorage`
- `RetryContext` (`src/context/RetryContext.tsx`) allows manual retry trigger across components
- Pages fall back to cached data when fetches fail

**Rate Limiting:**
- `slowapi` rate limiter (`backend/limiter.py`) applied to sensitive endpoints (e.g., `/api/weather/refresh: 3/minute`)

## Data Flow

**HKO Data Ingestion (Primary):**

1. APScheduler triggers `_poll_and_persist()` every 10 minutes (`backend/services/scheduler.py`)
2. `hko.fetch_all()` fetches current weather, forecast, warnings, and local forecast concurrently (`backend/services/hko_client.py`)
3. `persist_weather_data()` orchestrates the full pipeline (`backend/services/weather_orchestrator.py`):
   - Parse HKO JSON → flat reading dicts (`parse_hko_to_readings`)
   - Parse HKO forecast → forecast day dicts (`parse_hko_to_forecast`)
   - Parse HKO warnings → warning dicts (`parse_hko_to_warnings`)
   - Compute WBT for each reading (`calculate_wbt` from `backend/services/climate/wbt.py`)
   - Compute HNE for nighttime readings (`calculate_hne` from `backend/services/climate/hne.py`)
   - Load active risk config (`get_active_risk_config` from `backend/services/risk_config_service.py`)
   - Persist hot night counts (`persist_hot_night_counts` from `backend/services/climate/hot_nights_tracker.py`)
   - Compute composite risk score v2 for each reading (`compute_risk_score_v2` from `backend/services/climate/scoring_v2.py`)
   - Persist readings to `weather_readings` table
   - Compute WBT and project hot night streaks for forecast days
   - Compute composite risk score v2 for each forecast day
   - Persist forecasts to `weather_forecast_days` table
   - Manage warning lifecycle (mark expired, persist new)
   - Increment generation counters
   - Generate auto-alerts if thresholds exceeded (`should_create_alert`)
4. Generation counters incremented for KPI tracking

**Live Score Computation (On-Demand):**

1. Frontend calls `POST /api/weather/live-score?station=...` (`backend/api/weather.py` line 405)
2. API fetches latest reading for station from DB
3. Loads active risk config from DB
4. Fetches active warnings (deduplicated by warning_type)
5. Gets current consecutive hot nights for station
6. Calls `compute_risk_score_v2(wbt, consecutive, warnings, risk_cfg)` (`backend/services/climate/scoring_v2.py`)
7. Returns score breakdown: `{ value, state, w, h, v, m, t8_applied, breakdown, theoretical_max }`

**Frontend Data Fetch:**

1. `RiskIntelligence` page (`src/pages/RiskIntelligence.tsx`) fetches 4 endpoints in parallel:
   - `GET /api/weather/current` — station readings
   - `GET /api/weather/forecast` — 9-day (or 14-day beta) forecast
   - `GET /api/weather/trends` — backward + forward risk trends
   - `GET /api/weather/risk-config` — active risk formula config
2. Polls every 5 minutes (`setInterval(fetchAll, 300000)`)
3. `RiskScoreGauge` component polls `POST /api/weather/live-score` every 2 minutes

## State Management

**Backend State:**
- Database (SQLite): All persistent state — readings, forecasts, warnings, alerts, donor profiles, risk config, counters
- Singleton services: Hold HTTP clients, scheduler state, Open-Meteo enable flag
- No in-memory caching layer; queries hit SQLite directly (WAL mode for concurrent read/write)

**Frontend State:**
- React component-level `useState` — No global state manager (no Redux, Zustand, etc.)
- `useOfflineCache` hook — `sessionStorage` for offline resilience, version-stamped to auto-invalidate on schema changes
- `RetryContext` — Simple counter-based retry trigger (incrementing key forces re-fetch via `useEffect` dependency)
- `useLastRefresh` hook — Tracks last data refresh timestamp and staleness
- `useControlPlaneData` hook — Custom data fetch hook for Control Plane page
- Open-Meteo beta flag stored in `localStorage` (`climateshield_openmeteo_beta`)

## API Design

**Style:** RESTful JSON API over HTTP

**Prefixes:**
- `/api/weather/*` — Weather data, risk scores, warnings, metrics (`backend/api/weather.py`)
- `/api/admin/*` — Admin operations, backup, risk config management (`backend/api/admin.py`)
- `/api/donor/*` — Donation pledge submission (`backend/api/donor.py`)
- `/api/health` — Health check (`backend/api/health.py`)

**Key Endpoints:**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/weather/current` | None | Latest reading per station |
| GET | `/api/weather/forecast` | None | 9-day (or 14-day beta) forecast |
| GET | `/api/weather/risks` | None | 7-day and 9-day risk outlook |
| POST | `/api/weather/live-score` | None | On-demand risk score recomputation |
| GET | `/api/weather/trends` | None | Backward + forward risk trends |
| GET | `/api/weather/warnings` | None | Active HKO warnings |
| GET | `/api/weather/history` | None | Daily aggregates (1-90 days) |
| GET | `/api/weather/history/readings` | None | Raw readings per station/hours |
| POST | `/api/weather/refresh` | Rate-limited (3/min) | Manual HKO data fetch |
| GET | `/api/weather/risk-config` | None | Public read-only risk config |
| GET | `/api/weather/alerts/unread` | None | Pending system alerts |
| GET | `/api/admin/risk-config` | X-Admin-Password header | Admin risk config |
| PUT | `/api/admin/risk-config` | Password in body | Update risk config |
| POST | `/api/admin/risk-config/test` | Password in body | Test config without saving |
| POST | `/api/donor/pledge` | None | Submit donation pledge |
| GET | `/api/admin/export` | None | Full DB backup as JSON |
| GET | `/api/health` | None | Service health check |

**Authentication:**
- Admin endpoints: `X-Admin-Password` header or password in request body
- Metrics reset: `METRICS_PASSWORD` env var, verified via `secrets.compare_digest`
- No JWT/OAuth — password-based admin auth only
- `backend/auth.py` defines `X-API-Key` header scheme (ADMIN_API_KEY env var) but not wired to routers currently

**SPA Catch-All:**
- In production, if `STATIC_DIR` exists, all non-API routes serve `index.html` for SPA routing
- API routes are registered first and take priority over SPA catch-all

## Risk Scoring Architecture

**Formula:** `RiskScore = min(30, (W + H + V) × M)`

Implemented in `backend/services/climate/scoring_v2.py`, `compute_risk_score_v2()`.

### Component Breakdown

**W — Wet-Bulb Temperature Score (0–6):**
- Looked up from configurable thresholds (`wbt_thresholds` in `risk_formula_configs` table)
- Default bands: `<26 → 0`, `26–27 → 2`, `28–29 → 4`, `≥30 → 6`
- Lookup function: `lookup_wbt_score()` in `backend/services/climate/scoring_v2.py`

**H — Hot Night Excess Score (0–4):**
- Based on consecutive nights with minimum temperature > 28°C
- Looked up from configurable thresholds (`hne_thresholds`)
- Default bands: `≤1 night → 0`, `2 nights → 1`, `3–4 nights → 2`, `≥5 nights → 4`
- Tracked per-station in `consecutive_hot_nights` table (`backend/services/climate/hot_nights_tracker.py`)
- Lookup function: `lookup_hne_score()` in `backend/services/climate/scoring_v2.py`

**V — Vulnerability Bonus (0 or 5):**
- Applied when H ≥ `vulnerability_config.trigger_h_score` (default: 2)
- Bonus value: `vulnerability_config.bonus` (default: 5)
- Captures compounding risk from sustained heat exposure

**M — Warning Multiplier (1.0–3.0):**
- Highest active HKO warning determines multiplier
- Priority order (highest first):
  - T8 (Gale/Storm Signal No. 8): 3.0
  - Black Rainstorm: 2.0
  - T3 (Strong Wind Signal No. 3): 1.5
  - T1 or Red Rainstorm: 1.5
  - Thunderstorm or Amber Rainstorm: 1.2
  - None: 1.0
- Lookup function: `lookup_warning_multiplier()` with fuzzy substring matching

**T8 Floor Rule:**
- If T8 warning is active and raw score < `t8_floor.min_score` (default: 27), boost to that minimum
- Ensures T8 conditions always surface as Purple alert regardless of WBT/H readings
- Tracked in response as `t8_applied: true/false`

**State Mapping (0–30 → Risk State):**
- Overlapping ranges resolved by priority: Purple > Red > Yellow > Low > Safe
- Default: Safe (0–12), Low (13–16), Yellow (17–22), Red (23–26), Purple (25–30)
- Overlap at 25–26: Purple takes precedence
- Lookup function: `lookup_state()` in `backend/services/climate/scoring_v2.py`

**HNE Calculation:**
- `HNe = Σ[max(0, T_h − 28°C)]` for each hour in night window (20:00–07:59)
- Extreme threshold: 17.7 °C·h (90th percentile from HK study)
- Implemented in `backend/services/climate/hne.py`

**WBT Calculation:**
- Tetens saturation vapor pressure + Newton-Raphson iteration
- Accounts for station barometric pressure (default 1013.25 hPa)
- Implemented in `backend/services/climate/wbt.py`

**Risk Config Management:**
- Default config: hardcoded in `backend/services/risk_config_service.py` (`DEFAULT_CONFIG`)
- DB config: `risk_formula_configs` table, `is_active` flag
- Validation: 7 checks enforced (non-overlapping bands, monotonic scores, complete state coverage, T8 floor within Purple range)
- Admin CRUD: GET/PUT/POST endpoints in `backend/api/admin.py`
- Test endpoint: `POST /api/admin/risk-config/test` runs 3 sample scenarios without persisting

---

*Architecture analysis: 2026-05-17*