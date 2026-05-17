# Tech Stack — ClimateShield

## Runtime & Languages

**Primary:**
- TypeScript 5.9.x — Frontend (React SPA)
- Python 3.11 — Backend (FastAPI)

**Secondary:**
- SQL — Database schema (SQLite dialect, PostgreSQL-compatible via SQLAlchemy)
- CSS (via Tailwind) — Styling

## Frontend Stack

**Framework:**
- React 19.2.x — UI library
- React Router DOM 7.12.x — Client-side routing

**UI Components:**
- Radix UI — Headless component primitives (`@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-avatar`, `@radix-ui/react-label`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slot`)
- Lucide React 0.562.x — Icon library
- Recharts 3.6.x — Charting/data visualization
- Sonner 2.0.x — Toast notifications
- qrcode.react 4.2.x — QR code generation

**Styling:**
- Tailwind CSS 4.1.x — Utility-first CSS (via `@tailwindcss/vite` plugin)
- tailwindcss-animate 1.0.x — Animation utilities
- class-variance-authority 0.7.x — Variant styling for components
- clsx 2.1.x + tailwind-merge 3.4.x — Conditional class merging

**State & Data:**
- Custom hooks (`src/hooks/useControlPlaneData.ts`, `src/hooks/useLastRefresh.ts`, `src/hooks/useOfflineCache.ts`)
- React Context (`src/context/RetryContext.tsx`)
- `fetch()` API — All HTTP calls via `src/services/api.ts`

**Build:**
- Vite 7.2.x — Build tool and dev server
- `@vitejs/plugin-react` 5.1.x — React Fast Refresh
- `@tailwindcss/vite` 4.1.x — Tailwind Vite integration
- `@tailwindcss/postcss` 4.1.x — PostCSS processing
- PostCSS 8.5.x — CSS pipeline
- Autoprefixer 10.4.x — Vendor prefixing

**TypeScript Config:**
- Target: ES2022
- Module: ESNext (bundler resolution)
- JSX: react-jsx
- Strict mode enabled
- Path alias: `@/*` → `./src/*`
- `noUnusedLocals`, `noUnusedParameters` enabled

## Backend Stack

**Framework:**
- FastAPI 0.129.x — ASGI web framework
- Starlette 0.52.x — Underlying ASGI toolkit
- Uvicorn 0.40.x — ASGI server

**API & Validation:**
- Pydantic 2.12.x — Data validation and serialization
- pydantic-core 2.41.x — Rust-based validation core
- pydantic-settings 2.12.x — Settings from env vars
- python-multipart 0.0.22 — File upload handling

**HTTP Client:**
- httpx 0.27.x — Async HTTP client for external API calls (HKO, Open-Meteo)

**Scheduling:**
- APScheduler 3.11.x — Background job scheduling (AsyncIOScheduler)

**Rate Limiting:**
- slowapi 0.1.9+ — Rate limiting middleware

**Email Validation:**
- email-validator 2.3.x — Email format validation
- dnspython 2.8.x — DNS lookups for email validation

**Computing:**
- numpy 2.2.x — Numerical computing (climate calculations)

## Database & ORM

**ORM:**
- SQLAlchemy 2.0.x — ORM and query builder
- Alembic 1.18.x — Database migration tool

**Databases:**
- SQLite (default) — Local development and single-instance deployment
  - WAL mode enabled for concurrent read/write
  - File: `climateshield.db` (project root)
  - `NullPool` connection pool (appropriate for SQLite)
- PostgreSQL (optional) — Production scaling
  - `psycopg2-binary 2.9.x` — PostgreSQL adapter
  - Activated via `DATABASE_URL` env var

**Schema Models** (`backend/models.py`):
- `DonorProfile` — Donor contact information
- `DonationPledge` — Donation pledges with status lifecycle
- `DonationItem` — Individual items within a pledge
- `WeatherReading` — Current weather observations per station
- `WeatherForecastDay` — 9-day forecast data per day
- `WeatherWarning` — HKO weather warnings with lifecycle
- `SystemAlert` — Auto-generated risk alerts
- `GenerationCounter` — Cumulative KPI counters
- `CounterResetLog` — Counter reset audit trail
- `RiskFormulaConfig` — Configurable risk formula thresholds (JSON columns)
- `ConsecutiveHotNights` — Night streak tracking per station/date

## Build Tools

**Frontend Build:**
- `npm run dev` — Vite dev server on port 5173
- `npm run build` — `tsc -b && vite build` (type-check then bundle)
- `npm run preview` — Vite preview server
- Manual chunk splitting configured in `vite.config.ts`:
  - `plotly-vendor`, `visx-vendor`, `react-vendor`, `router-vendor`, `radix-vendor`, `icons-vendor`, `vendor`
  - Chunk size warning limit: 1500KB

**Backend:**
- `python -m uvicorn backend.main:app` — Direct uvicorn startup
- Alembic migrations in `backend/migrations/versions/`
- No separate build step — Python interpreted directly

**Vite Dev Proxy:**
- `/api` → `http://127.0.0.1:8000` (backend)
- `/docs` → backend (FastAPI Swagger)
- `/openapi.json` → backend (OpenAPI spec)
- Backend URL configurable via `BACKEND_URL` env var

## Dev Tooling

**Type Checking:**
- TypeScript 5.9.x with strict mode

**Linting:**
- No ESLint or Prettier config detected — relies on TypeScript compiler for basic checks
- No Biome, Ruff, or Black config detected

**Testing:**
- pytest 8.3.x (listed in requirements.txt)
- Frontend: `src/test/` directory exists, no test runner config detected in `package.json`

**No CI/CD Pipeline Detected:**
- No GitHub Actions, GitLab CI, or similar config files found

## Infrastructure

**Docker:**
- Frontend: `Dockerfile` — `node:20-alpine`
  - Dev server with hot reload, exposed port 5173
  - `BACKEND_URL=http://backend:8000`
- Backend: `backend/Dockerfile` — `python:3.11-slim-bookworm`
  - Non-root user (`appuser`, uid 1000)
  - Health check via `curl` to `/api/health`
  - Exposed port 8000

**Docker Compose:**
- `docker-compose.yml` — Development
  - Backend + Frontend services
  - Source code mounted as read-only volumes for hot reload
  - Named volume `climateshield_data` for SQLite persistence
  - Backend health check with dependency condition
- `docker-compose.prod.yml` — Production
  - No source mounts
  - Backend serves static frontend via `STATIC_DIR`
  - Restart policy: `always`

**Deployment:**
- Backend serves built frontend as SPA via `STATIC_DIR` env var
- SPA catch-all: unmatched routes return `index.html`
- CORS origins configurable via `CORS_ORIGINS` env var (comma-separated)
- Default CORS: `http://localhost:5173`, `http://localhost:3000`

**Audit:**
- Rotating file-based audit log: `backend/data/audit.log` (10MB, 5 backups)
- JSON-formatted entries with timestamp, action, IP, details

## Version Summary Table

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend Language | TypeScript | ~5.9.x |
| Frontend Framework | React | ^19.2.x |
| Frontend Router | React Router DOM | ^7.12.x |
| Frontend Build | Vite | ^7.2.x |
| Frontend CSS | Tailwind CSS | ^4.1.x |
| Frontend Charts | Recharts | ^3.6.x |
| Frontend Components | Radix UI | Various ^1.x |
| Backend Language | Python | 3.11 |
| Backend Framework | FastAPI | 0.129.x |
| Backend Server | Uvicorn | 0.40.x |
| Backend ORM | SQLAlchemy | 2.0.46 |
| Backend Migrations | Alembic | 1.18.4 |
| Backend HTTP Client | httpx | 0.27.0 |
| Backend Scheduler | APScheduler | 3.11.0 |
| Backend Validation | Pydantic | 2.12.5 |
| Backend Numerics | NumPy | 2.2.4 |
| Default Database | SQLite | (system) |
| Alt Database | PostgreSQL | (via psycopg2-binary 2.9.11) |
| Rate Limiting | slowapi | >=0.1.9 |
| Frontend Container | Node.js (Alpine) | 20 |
| Backend Container | Python (Debian slim) | 3.11 |

---

*Stack analysis: 2026-05-17*