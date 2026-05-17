# Code Structure — ClimateShield

**Analysis Date:** 2026-05-17

## Directory Tree

```
ClimateShield/
├── backend/                    # Python FastAPI backend
│   ├── api/                    # API route handlers (FastAPI routers)
│   │   ├── admin.py            # Admin endpoints: export/import, risk config CRUD
│   │   ├── donor.py            # Donor pledge submission
│   │   ├── health.py           # Health check endpoint
│   │   └── weather.py          # Weather data, risk scores, metrics, alerts
│   ├── middleware/              # (empty — middleware in main.py)
│   ├── migrations/             # Alembic database migrations
│   │   └── versions/          # Migration scripts (6 migration files)
│   ├── services/               # Business logic layer
│   │   ├── climate/            # Domain-specific climate calculations
│   │   │   ├── hne.py          # Hot Night Excess calculation
│   │   │   ├── hot_nights_tracker.py  # Per-station consecutive hot night tracking
│   │   │   ├── risk.py         # Risk level mapping, outlook, alert logic
│   │   │   ├── scoring.py      # (legacy scoring, superseded by scoring_v2)
│   │   │   ├── scoring_v2.py   # Composite risk score: min(30, (W+H+V)×M)
│   │   │   └── wbt.py          # Wet-bulb temperature (Tetens + Newton-Raphson)
│   │   ├── agent_event_bus.py  # Stub: replaces former agent council logging
│   │   ├── audit_logger.py     # Action audit logging
│   │   ├── climate_engine.py   # Backward-compat re-export wrapper for climate/ package
│   │   ├── counters.py         # Generation impact counter management
│   │   ├── health_service.py   # Health check logic
│   │   ├── hko_client.py       # HKO Open Data async HTTP client
│   │   ├── last_refresh.py     # Last refresh timestamp tracking
│   │   ├── open_meteo_client.py  # Open-Meteo Forecast API async client
│   │   ├── risk_config_service.py  # Risk formula config: load, validate, persist
│   │   ├── scheduler.py        # APScheduler job definitions
│   │   └── weather_orchestrator.py  # Central HKO data flow coordinator
│   ├── auth.py                 # API key authentication (unused by routers)
│   ├── crud.py                 # SQLAlchemy CRUD for donation models
│   ├── database.py             # Engine, session, Base, SQLite WAL pragma
│   ├── limiter.py              # slowapi rate limiter
│   ├── main.py                 # FastAPI app, lifespan, CORS, SPA serve
│   ├── models.py               # SQLAlchemy ORM models (all tables)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── pyproject.toml          # Python project config
│   └── requirements.txt        # Python dependencies
├── dist/                       # Production build output (Vite)
│   ├── assets/                 # JS/CSS bundles (chunked)
│   └── index.html              # SPA entry
├── public/                     # Static assets copied to dist
│   ├── logo.png
│   └── vite.svg
├── src/                        # React TypeScript frontend
│   ├── assets/                 # Images, SVGs
│   ├── components/             # Shared UI components
│   │   ├── admin/              # Admin-specific components
│   │   │   └── donations/     # Donations management tab
│   │   ├── control-plane/     # Control Plane shared components
│   │   │   └── LastRefreshDisplay.tsx
│   │   ├── layout/            # App shell, nav, user menu
│   │   │   ├── AppShell.tsx
│   │   │   ├── MainNav.tsx
│   │   │   └── UserMenu.tsx
│   │   ├── ui/                # Shadcn-style primitive components
│   │   │   ├── alert.tsx, avatar.tsx, badge.tsx, button.tsx
│   │   │   ├── card.tsx, dropdown-menu.tsx, input.tsx
│   │   │   ├── Modal.tsx, scroll-area.tsx, sheet.tsx
│   │   │   ├── skeleton.tsx, table.tsx, tabs.tsx, tooltip.tsx
│   │   │   └── ...
│   │   ├── ErrorBoundary.tsx
│   │   ├── OfflineBanner.tsx
│   │   ├── mode-toggle.tsx
│   │   └── theme-provider.tsx
│   ├── context/                # React contexts
│   │   └── RetryContext.tsx    # Global retry trigger
│   ├── hooks/                  # Custom React hooks
│   │   ├── useControlPlaneData.ts
│   │   ├── useLastRefresh.ts
│   │   └── useOfflineCache.ts
│   ├── lib/                    # Utility functions
│   │   └── utils.ts            # cn() classname helper
│   ├── pages/                  # Top-level route pages (lazy-loaded)
│   │   ├── ControlPlane.tsx
│   │   ├── RiskIntelligence.tsx
│   │   ├── Settings.tsx
│   │   ├── donate/
│   │   │   ├── Donate.tsx
│   │   │   ├── components/    # Donate page sub-components
│   │   │   ├── constants.ts
│   │   │   └── types.ts
│   │   └── settings/
│   │       └── components/    # Settings page sub-components
│   │           ├── ConfirmDialog.tsx
│   │           ├── MetricsPanel.tsx
│   │           ├── RiskFormulaPanel.tsx
│   │           └── ThemeToggle.tsx
│   ├── sections/               # Feature sections (composite components)
│   │   ├── control-plane/
│   │   │   ├── components/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── RiskCard.tsx
│   │   │   │   └── Sparkline.tsx
│   │   │   ├── sample-data.json
│   │   │   └── types.ts
│   │   └── risk-intelligence/
│   │       ├── components/
│   │       │   ├── ForecastComparison.tsx
│   │       │   ├── ForecastDashboard.tsx
│   │       │   ├── HotNightMonitor.tsx
│   │       │   ├── RiskGrid.tsx
│   │       │   ├── RiskHistoryModal.tsx
│   │       │   ├── RiskScoreGauge.tsx     # Live score gauge with W/H/V/M breakdown
│   │       │   ├── StationDataTable.tsx
│   │       │   ├── StationDetailModal.tsx
│   │       │   ├── WBTTimeSeriesGraph.tsx
│   │       │   └── WarningsCard.tsx
│   │       ├── sample-data.json
│   │       └── types.ts
│   ├── services/               # API client layer
│   │   └── api.ts              # Centralized fetch wrappers for all endpoints
│   ├── test/                   # Test files (empty directory)
│   ├── App.tsx                 # Root component with routing
│   ├── index.css               # Global styles (Tailwind)
│   └── main.tsx                # React mount point
├── .env.example                # Environment variable template
├── docker-compose.yml          # Development Docker Compose
├── docker-compose.prod.yml     # Production Docker Compose
├── Dockerfile                  # Frontend build Dockerfile
├── index.html                  # Vite HTML entry
├── package.json                # Node.js dependencies and scripts
├── tsconfig.json               # TypeScript config (references app + node)
├── tsconfig.app.json           # TypeScript app config
├── tsconfig.node.json          # TypeScript Node config
└── vite.config.ts              # Vite config with proxy and chunking
```

## Entry Points

**Backend:**
- `backend/main.py` — FastAPI application creation and startup. Runs with `uvicorn backend.main:app`
- `backend/services/scheduler.py:start_scheduler()` — Background job registration, called from lifespan

**Frontend:**
- `src/main.tsx` — React DOM mount (`ReactDOM.createRoot`)
- `src/App.tsx` — Root component with `BrowserRouter`, `ThemeProvider`, `RetryProvider`, lazy-loaded routes
- `vite.config.ts` — Dev server entry with `/api` proxy to backend (default `http://127.0.0.1:8000`)

**Production:**
- Backend serves built SPA from `dist/` via `STATIC_DIR` env var (default `/app/frontend/dist`)

## Module Organization

### Backend: Layered Architecture

```
main.py (app creation, lifespan)
  └── api/ (HTTP routing)
        └── services/ (business logic)
              ├── climate/ (domain calculations)
              └── models.py, crud.py, database.py (data access)
```

**Import flow:** API layer imports from services; services import from climate/ domain package and models. No circular dependencies.

**climate/ package** is the pure domain logic layer. It should not import from `api/` or orchestrator-level services.

**climate_engine.py** acts as a facade/re-export for backward compatibility. New code should import directly from domain modules.

### Frontend: Page-Section-Component Pattern

```
App.tsx (routing)
  └── pages/ (route-level, lazy-loaded)
        └── sections/ (feature composites used by pages)
              └── components/ (atomic UI building blocks)
```

**Pages** (`src/pages/`) — Top-level route components. Own data fetching, page layout, and compose sections.

**Sections** (`src/sections/`) — Feature-grouped composite components. Each section has its own `types.ts` and `components/` subdirectory.

**Components** (`src/components/`) — Shared/reusable UI. Further subdivided:
- `ui/` — Shadcn-style primitives (Button, Card, Badge, etc.)
- `layout/` — App shell composition (AppShell, MainNav, UserMenu)
- `admin/` — Admin feature components
- `control-plane/` — Shared Control Plane components (LastRefreshDisplay)

## File Naming Patterns

**Backend Python:**
- Snake_case for all files: `weather_orchestrator.py`, `hot_nights_tracker.py`, `scoring_v2.py`
- Single-word or compound names: `hne.py`, `wbt.py`, `risk.py`
- Module-level singletons use module-level variable: `hko = HKOClient()`, `open_meteo = OpenMeteoClient()`
- Service modules: one primary class or function set per file
- API routers: named by domain (`weather.py`, `admin.py`, `donor.py`, `health.py`)

**Frontend TypeScript:**
- PascalCase for components: `RiskScoreGauge.tsx`, `ForecastDashboard.tsx`, `HotNightMonitor.tsx`
- camelCase for hooks: `useOfflineCache.ts`, `useControlPlaneData.ts`, `useLastRefresh.ts`
- camelCase for utilities: `utils.ts`, `api.ts`
- Type files: `types.ts` in each section/page directory
- Constants: `constants.ts` in feature directories
- Sample data: `sample-data.json` in section directories

## Import Patterns

**Backend:**
```python
# Standard library
import logging
from datetime import datetime, timezone, timedelta

# Third-party
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

# Application (absolute imports from backend package root)
from backend.services.weather_orchestrator import weather_orchestrator
from backend.services.climate.scoring_v2 import compute_risk_score_v2
from backend.services.risk_config_service import get_active_risk_config
from backend import models, schemas
```

**Frontend:**
```typescript
// React
import { useState, useEffect, useCallback, useMemo } from 'react';

// UI components using @ alias
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Feature components (relative or @ alias)
import { RiskScoreGauge } from '@/sections/risk-intelligence/components/RiskScoreGauge';

// Services and hooks
import { api } from '@/services/api';
import { useOfflineCache } from '@/hooks/useOfflineCache';

// Types (relative within feature)
import type { WeatherReading } from '../types';
```

**Path Aliases:**
- Frontend: `@` → `./src/` (configured in `vite.config.ts` and `tsconfig.app.json`)
- Backend: No path aliases; all absolute imports from `backend.` package root

## Config Files

| File | Purpose |
|------|---------|
| `.env.example` | Environment variable template (API keys, DB URL, CORS origins, passwords) |
| `backend/pyproject.toml` | Python project metadata and dependencies |
| `backend/requirements.txt` | Pinned Python dependencies |
| `backend/alembic.ini` | Alembic migration configuration |
| `backend/database.py` | SQLAlchemy engine config, SQLite WAL pragma |
| `package.json` | Node.js project config, scripts, dependencies |
| `tsconfig.json` | TypeScript project references |
| `tsconfig.app.json` | TypeScript app compilation config |
| `tsconfig.node.json` | TypeScript Node config for Vite |
| `vite.config.ts` | Vite dev server proxy, build chunking, path aliases |
| `docker-compose.yml` | Development Docker services |
| `docker-compose.prod.yml` | Production Docker services |
| `Dockerfile` (root) | Frontend build container |
| `backend/Dockerfile` | Backend container |

**Runtime Config via Environment:**
- `DATABASE_URL` — Database connection string (default: `sqlite:///./climateshield.db`)
- `CORS_ORIGINS` — Comma-separated allowed origins
- `STATIC_DIR` — Built frontend directory for SPA serve (default: `/app/frontend/dist`)
- `ADMIN_PASSWORD` — Admin endpoint password
- `METRICS_PASSWORD` — Metrics reset password
- `ADMIN_API_KEY` — API key header auth (defined in `auth.py` but not wired to routers)
- `BACKEND_URL` — Vite proxy target (default: `http://127.0.0.1:8000`)

## Shared vs Feature Code

**Shared Backend Code:**
- `backend/database.py` — Engine, session factory, Base class (used by all models and API routes)
- `backend/models.py` — All ORM models in one file (both weather and donation domains)
- `backend/schemas.py` — All Pydantic schemas in one file
- `backend/services/counters.py` — Generation counters (used by weather orchestrator)
- `backend/services/audit_logger.py` — Audit logging (used by admin and weather routes)
- `backend/services/last_refresh.py` — Last refresh tracking (used by weather API)
- `backend/services/climate_engine.py` — Re-export facade bridging old and new imports

**Feature-Specific Backend Code:**
- `backend/services/climate/` — Climate domain calculations (not used by donation features)
- `backend/api/donor.py`, `backend/crud.py` — Donation domain (not used by weather features)
- `backend/services/hko_client.py`, `backend/services/open_meteo_client.py` — External API clients (weather only)

**Shared Frontend Code:**
- `src/components/ui/` — Shadcn primitives used across all pages
- `src/components/layout/` — AppShell, MainNav used by all routes
- `src/components/OfflineBanner.tsx` — Used by RiskIntelligence and ControlPlane
- `src/components/control-plane/LastRefreshDisplay.tsx` — Used by both main pages
- `src/context/RetryContext.tsx` — Global retry trigger
- `src/hooks/useOfflineCache.ts` — Reusable offline cache hook
- `src/hooks/useLastRefresh.ts` — Reusable last-refresh hook
- `src/services/api.ts` — Centralized API client (all endpoints)
- `src/sections/risk-intelligence/components/WarningsCard.tsx` — Shared between RiskIntelligence and ControlPlane

**Feature-Specific Frontend Code:**
- `src/sections/risk-intelligence/` — Risk Intelligence components and types
- `src/sections/control-plane/` — Control Plane components and types
- `src/pages/donate/` — Donate page with its own sub-components, types, and constants
- `src/pages/settings/` — Settings page with RiskFormulaPanel, MetricsPanel, ThemeToggle

## Where to Add New Code

**New API endpoint:**
- Add route handler in `backend/api/weather.py` or create new router file in `backend/api/`
- Register router in `backend/main.py`
- Add Pydantic schema in `backend/schemas.py` if needed
- Add frontend fetch wrapper in `src/services/api.ts`

**New climate calculation:**
- Add module in `backend/services/climate/` (pure domain logic)
- Re-export from `backend/services/climate_engine.py` for backward compatibility
- Import in `backend/services/weather_orchestrator.py` for pipeline integration

**New frontend page:**
- Create page component in `src/pages/`
- Add lazy import and Route in `src/App.tsx`
- Add nav link in `src/components/layout/MainNav.tsx`
- Add feature section in `src/sections/` with `types.ts` and `components/` subdirectory

**New UI component:**
- Primitive: Add to `src/components/ui/` (Shadcn pattern)
- Shared: Add to `src/components/` (e.g., `src/components/OfflineBanner.tsx`)
- Feature-specific: Add to `src/sections/{feature}/components/`

**New DB model:**
- Add model class in `backend/models.py`
- Add Pydantic schemas in `backend/schemas.py`
- Create Alembic migration in `backend/migrations/versions/`
- Run `Base.metadata.create_all(engine)` handles new tables, but ALTER TABLE for new columns on existing tables requires `_ensure_risk_columns()` pattern in `backend/database.py`

**New risk formula parameter:**
- Add column(s) to `RiskFormulaConfig` model in `backend/models.py`
- Update `DEFAULT_CONFIG` in `backend/services/risk_config_service.py`
- Add validation in `validate_risk_config()`
- Update `compute_risk_score_v2()` in `backend/services/climate/scoring_v2.py`
- Update `RiskFormulaPanel` in `src/pages/settings/components/RiskFormulaPanel.tsx`
- Update `RiskScoreGauge` display in `src/sections/risk-intelligence/components/RiskScoreGauge.tsx`

## Special Directories

**`dist/`:**
- Purpose: Production build output from Vite
- Generated: Yes (by `npm run build`)
- Committed: Yes (served by FastAPI in production via STATIC_DIR)
- Do not manually edit

**`backend/migrations/`:**
- Purpose: Alembic database migration scripts
- Generated: Partially (auto-generated by `alembic revision --autogenerate`)
- Committed: Yes
- Contains 6 migration versions tracking schema evolution

**`backend/__pycache__/`:**
- Purpose: Python bytecode cache
- Generated: Yes (by Python interpreter)
- Committed: No (in `.gitignore`)

**`src/test/`:**
- Purpose: Frontend test files
- Generated: No
- Committed: Partially (directory exists, currently empty)

**`src/sections/*/sample-data.json`:**
- Purpose: Sample/mock data for section components during development
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-17*