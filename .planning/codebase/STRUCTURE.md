# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```
[project-root]/
├── .planning/
│   └── codebase/              # GSD intelligence documents
├── backend/
│   ├── api/                   # FastAPI routers
│   ├── migrations/
│   │   └── versions/          # Alembic/SQLAlchemy migration scripts
│   ├── services/
│   │   └── climate/           # Climate calculation modules
│   ├── __init__.py
│   ├── auth.py                # API key auth for admin routes
│   ├── crud.py                # Donation CRUD helpers
│   ├── database.py            # SQLAlchemy engine & session
│   ├── main.py                # FastAPI app & lifespan
│   ├── models.py              # SQLAlchemy ORM models
│   └── schemas.py             # Pydantic request/response schemas
├── public/                    # Static assets (logo.png, etc.)
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── admin/
│   │   │   └── donations/
│   │   ├── control-plane/
│   │   ├── layout/
│   │   └── ui/                # shadcn/ui primitive components
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   │   ├── donate/
│   │   │   └── components/
│   │   ├── settings/
│   │   │   └── components/
│   │   ├── ControlPlane.tsx
│   │   ├── RiskIntelligence.tsx
│   │   ├── Settings.tsx
│   │   └── donate/Donate.tsx
│   ├── sections/
│   │   ├── control-plane/
│   │   │   └── components/
│   │   └── risk-intelligence/
│   │       └── components/
│   ├── services/
│   ├── test/
│   ├── App.tsx
│   └── main.tsx
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── Update_For.md             # Risk scoring formula specification
└── vite.config.ts
```

## Directory Purposes

**`backend/api/`:**
- Purpose: FastAPI router modules exposing REST endpoints
- Contains: `weather.py` (public + protected weather endpoints), `donor.py` (donation pledge creation), `admin.py` (export/import, donations, risk config), `health.py` (health checks)
- Key files: `backend/api/weather.py`, `backend/api/admin.py`

**`backend/services/`:**
- Purpose: Business logic, external API clients, orchestration, and climate calculations
- Contains: `hko_client.py`, `open_meteo_client.py`, `weather_orchestrator.py`, `scheduler.py`, `risk_config_service.py`, `climate_engine.py`, and sub-package `climate/`
- Key files: `backend/services/weather_orchestrator.py`, `backend/services/scheduler.py`

**`backend/services/climate/`:**
- Purpose: Pure climate calculation functions (WBT, HNE, risk scoring, hot nights tracker)
- Contains: `wbt.py`, `hne.py`, `risk.py`, `scoring.py`, `scoring_v2.py`, `hot_nights_tracker.py`
- Key files: `backend/services/climate/scoring_v2.py`, `backend/services/climate/wbt.py`

**`backend/migrations/versions/`:**
- Purpose: Alembic migration scripts for schema evolution
- Contains: `e93db34a6dca_initial_migration.py`, `20260514_add_risk_formula_config.py`, and others
- Key files: `backend/migrations/versions/20260514_add_risk_formula_config.py`

**`src/pages/`:**
- Purpose: Top-level React page components mapped to routes
- Contains: `ControlPlane.tsx`, `RiskIntelligence.tsx`, `Settings.tsx`, `donate/Donate.tsx`
- Key files: `src/pages/RiskIntelligence.tsx`, `src/pages/ControlPlane.tsx`

**`src/sections/`:**
- Purpose: Domain-specific section components used by pages
- Contains: `risk-intelligence/` (dashboard widgets), `control-plane/` (monitoring widgets)
- Key files: `src/sections/risk-intelligence/components/RiskGrid.tsx`, `src/sections/control-plane/components/Dashboard.tsx`

**`src/components/`:**
- Purpose: Reusable UI primitives and shared layout components
- Contains: `ui/` (shadcn/ui), `layout/` (`AppShell.tsx`, `MainNav.tsx`), `admin/`, `control-plane/`
- Key files: `src/components/layout/AppShell.tsx`, `src/components/ui/card.tsx`

**`src/services/`:**
- Purpose: Frontend API client abstraction
- Contains: `api.ts` (centralized `fetch` wrappers for all backend endpoints)
- Key files: `src/services/api.ts`

**`src/hooks/` and `src/context/`:**
- Purpose: Custom React hooks and context providers
- Contains: `useOfflineCache.ts`, `useControlPlaneData.ts`, `useLastRefresh.ts`, `RetryContext.tsx`
- Key files: `src/hooks/useOfflineCache.ts`, `src/context/RetryContext.tsx`

## Key File Locations

**Entry Points:**
- `backend/main.py`: FastAPI app initialization and lifespan
- `src/main.tsx`: React root mount
- `src/App.tsx`: React router, theme, and error boundary setup

**Configuration:**
- `vite.config.ts`: Vite dev server, proxy rules (`/api` → backend), `@` alias to `./src`
- `tsconfig.app.json` / `tsconfig.node.json`: TypeScript compiler settings
- `backend/database.py`: SQLAlchemy engine and session factory
- `.env.example`: Template for required environment variables

**Core Logic:**
- `backend/services/climate/scoring_v2.py`: Risk score engine v2 (0-30 scale)
- `backend/services/weather_orchestrator.py`: HKO data parsing, persistence, and Open-Meteo extension
- `backend/models.py`: SQLAlchemy ORM models for weather, donations, alerts, and risk config

**Testing:**
- `src/test/`: Frontend test directory (detected in tree, contents not inspected)

## Naming Conventions

**Files:**
- Backend modules: `snake_case.py` (e.g., `weather_orchestrator.py`, `risk_config_service.py`)
- Frontend components: `PascalCase.tsx` (e.g., `RiskGrid.tsx`, `AppShell.tsx`)
- Frontend utilities/hooks: `camelCase.ts` (e.g., `useOfflineCache.ts`, `api.ts`)

**Directories:**
- Backend packages: `snake_case` (e.g., `backend/services/climate/`)
- Frontend feature modules: `kebab-case` or `camelCase` (e.g., `risk-intelligence/`, `control-plane/`)

**SQLAlchemy Models:**
- Class names: `PascalCase` matching table concept (e.g., `WeatherReading`, `DonationPledge`)
- Table names: `snake_case` plural (e.g., `weather_readings`, `donation_pledges`)

**FastAPI Routers:**
- Router variable: lowercase module name (e.g., `router = APIRouter(prefix="/api/weather")` in `weather.py`)

## Where to Add New Code

**New API Endpoint:**
- Router code: `backend/api/{domain}.py`
- Schema: `backend/schemas.py` (add Pydantic models)
- Service logic: `backend/services/{domain}_service.py`

**New Database Entity:**
- Model: `backend/models.py`
- Migration: `backend/migrations/versions/` (generate via Alembic)
- CRUD (if needed): `backend/crud.py`
- Schema: `backend/schemas.py`

**New Frontend Page:**
- Page component: `src/pages/{PascalName}.tsx`
- Route: `src/App.tsx` (add `<Route>` inside `<AppShell>`)
- Page-specific subcomponents: `src/pages/{kebab-name}/components/`

**New Section Component (domain widget):**
- Implementation: `src/sections/{domain}/components/{PascalName}.tsx`
- Types: `src/sections/{domain}/types.ts` (if not existing)

**New Reusable UI Primitive:**
- Implementation: `src/components/ui/{kebab-name}.tsx` (follow shadcn/ui patterns)

**New Backend Service / Client:**
- Implementation: `backend/services/{snake_name}.py`
- Lifespan wiring: `backend/main.py` (import and call `.init()` / `.close()`)

## Special Directories

**`backend/migrations/versions/`:**
- Purpose: Alembic schema migration scripts
- Generated: Yes (via `alembic revision`)
- Committed: Yes

**`public/`:**
- Purpose: Static assets served directly by Vite (and FastAPI in production)
- Contains: `logo.png`, favicon, etc.
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD workspace artifacts (phase plans, codebase intelligence)
- Generated: Yes (by GSD commands)
- Committed: Yes (typically)

**`src/components/ui/`:**
- Purpose: shadcn/ui primitive components (Button, Card, Sheet, etc.)
- Generated: Yes (via `npx shadcn add`)
- Committed: Yes

---

*Structure analysis: 2026-05-14*
