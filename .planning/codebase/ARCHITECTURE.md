# Architecture

**Analysis Date:** 2026-05-14

## Pattern Overview

**Overall:** Monolithic full-stack application with a FastAPI backend and a React SPA frontend.

**Key Characteristics:**
- Single-process FastAPI server with embedded APScheduler for background jobs
- SQLite database (production-grade via WAL mode, configurable via `DATABASE_URL`)
- Shared `httpx.AsyncClient` singletons managed through FastAPI lifespan (HKO + Open-Meteo)
- Climate scoring engine with admin-editable v2 formula persisted in the database
- Frontend is a Vite-built React SPA served statically by FastAPI in production

## Layers

**Presentation (Frontend):**
- Purpose: React SPA rendering the control plane, risk intelligence dashboard, donation flow, and admin settings
- Location: `src/`
- Contains: React components, hooks, contexts, services, pages, sections
- Depends on: Backend REST API (`/api/*`)
- Used by: End users (field workers, administrators, donors)

**API Layer (Backend):**
- Purpose: FastAPI routers exposing REST endpoints for weather, donations, admin, and health
- Location: `backend/api/`
- Contains: `weather.py`, `donor.py`, `admin.py`, `health.py`
- Depends on: Service layer, database session (`get_db`), auth (`get_api_key`)
- Used by: Frontend SPA, external health checks

**Service Layer (Backend):**
- Purpose: Business logic, external API clients, orchestration, climate calculations, scheduling
- Location: `backend/services/`
- Contains: HKO client, Open-Meteo client, weather orchestrator, scheduler, climate engine, risk config service
- Depends on: Database models, external APIs (HKO, Open-Meteo)
- Used by: API layer, scheduler background jobs

**Data Layer (Backend):**
- Purpose: SQLAlchemy ORM models, database engine, CRUD helpers, schema validation
- Location: `backend/models.py`, `backend/database.py`, `backend/crud.py`, `backend/schemas.py`
- Contains: 10 tables including weather readings, forecasts, warnings, donations, risk formula config
- Depends on: SQLite (or any SQLAlchemy-compatible DB)
- Used by: Service layer, API layer

## Data Flow

**HKO Fetch → Orchestration → Scoring → Persistence → Frontend Display:**

1. **Fetch:** `scheduler.py` triggers `hko.fetch_all()` every 10 minutes via `AsyncIOScheduler`
2. **Orchestrate:** `weather_orchestrator.py` parses raw HKO JSON into flat reading dicts and forecast dicts
3. **Score:** `climate_engine.py` and `scoring_v2.py` compute WBT, HNE, and composite risk score (0-30) using the active `RiskFormulaConfig`
4. **Persist:** `weather_orchestrator.py` writes `WeatherReading`, `WeatherForecastDay`, `WeatherWarning`, `SystemAlert`, and `ConsecutiveHotNights` records to SQLite via SQLAlchemy
5. **Serve:** Frontend calls `/api/weather/current`, `/api/weather/forecast`, `/api/weather/risks`, `/api/weather/trends` via `src/services/api.ts`
6. **Display:** React pages (`RiskIntelligence`, `ControlPlane`) render grids, cards, charts, and warning banners using the fetched data

**State Management:**
- Backend: Stateless REST API; all state lives in SQLite
- Frontend: React `useState` + `useEffect` for local page state; `RetryContext` and `useOfflineCache` for offline resilience
- Scheduler state: Global `AsyncIOScheduler` singleton and shared `HKOClient`/`OpenMeteoClient` singletons

## Key Abstractions

**WeatherOrchestrator:**
- Purpose: Coordinates HKO data fetching, persistence, and Open-Meteo forecast extension
- Examples: `backend/services/weather_orchestrator.py`
- Pattern: Singleton initialized in FastAPI lifespan, shared across requests and scheduler jobs

**Climate Scoring Engine (v2):**
- Purpose: Computes a 0-30 risk score from wet-bulb temperature, consecutive hot nights, active warnings, and admin-configurable thresholds
- Examples: `backend/services/climate/scoring_v2.py`, `backend/services/risk_config_service.py`
- Pattern: Pure functions + database-backed config; formula = `min(30, (W + H + V) * M)` with T8 floor rule

**HKOClient / OpenMeteoClient:**
- Purpose: Async HTTP clients for external weather APIs with shared `httpx.AsyncClient`
- Examples: `backend/services/hko_client.py`, `backend/services/open_meteo_client.py`
- Pattern: Lifespan-managed singletons (`init()` on startup, `aclose()` on shutdown)

## Entry Points

**Backend Server:**
- Location: `backend/main.py`
- Triggers: `uvicorn backend.main:app`
- Responsibilities: Lifespan initialization (DB tables, HKO/Open-Meteo clients, scheduler, seed data), CORS middleware, static file serving, router mounting

**Scheduler Jobs:**
- Location: `backend/services/scheduler.py`
- Triggers: APScheduler `AsyncIOScheduler` started in lifespan
- Responsibilities: 10-minute HKO full poll, daily 08:30 HNE check, hourly forecast refresh

**Frontend Entry:**
- Location: `src/main.tsx`
- Triggers: Vite dev server or built static `index.html`
- Responsibilities: Mount React app with `ThemeProvider`, `BrowserRouter`, and `ErrorBoundary`

## Error Handling

**Strategy:** Graceful degradation with logging and user-facing fallback states.

**Patterns:**
- Backend: `logger.warning` for transient HKO/Open-Meteo failures; return `None` or empty lists instead of raising
- Frontend: `ErrorBoundary` catches React render crashes; `OfflineBanner` shows cached data when API fails; `Suspense` with loading fallbacks for lazy-loaded pages
- API: `HTTPException` with descriptive detail for client errors; `try/except` in scheduler jobs to prevent scheduler thread crashes

## Cross-Cutting Concerns

**Logging:** Python `logging` module with module-level `logger = logging.getLogger(__name__)`; `audit_logger.py` for admin action logging (IP + action + details)

**Validation:** Pydantic `BaseModel` schemas in `backend/schemas.py` for request/response validation; `risk_config_service.validate_risk_config()` for admin config edits

**Authentication:**
- Admin endpoints: `APIKeyHeader` via `backend/auth.py` (`X-API-Key` header, `ADMIN_API_KEY` env var)
- Metrics/admin password endpoints: `secrets.compare_digest` against `METRICS_PASSWORD` or `ADMIN_PASSWORD` env vars
- Donor endpoints: No auth required

**CORS:** Configured in `main.py` for `localhost:5173` and `localhost:3000`

---

*Architecture analysis: 2026-05-14*
