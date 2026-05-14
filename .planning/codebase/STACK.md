# Technology Stack

**Analysis Date:** 2026-05-14

## Languages

**Primary:**
- TypeScript ~5.9.3 — Frontend React application (`src/**/*.tsx`, `src/**/*.ts`)
- Python >=3.11 — FastAPI backend (`backend/**/*.py`)

**Secondary:**
- CSS/Tailwind — Styling via `@import "tailwindcss"` in `src/index.css`
- SQL — SQLite/PostgreSQL via SQLAlchemy ORM

## Runtime

**Frontend Environment:**
- Node.js 20 (from `Dockerfile`: `FROM node:20-alpine`)
- Vite dev server on port 5173 with HMR and polling

**Backend Environment:**
- Python 3.11 (`backend/Dockerfile`: `FROM python:3.11-slim-bookworm`)
- Uvicorn 0.40.0 ASGI server on port 8000

**Package Manager:**
- Frontend: npm (`package.json` present; `package-lock.json` optional per comment)
- Backend: pip (`requirements.txt` and `pyproject.toml` both present)
- Lockfile: Not detected (npm lockfile noted as optional)

## Frameworks

**Core Frontend:**
- React ^19.2.0 — UI library
- React DOM ^19.2.0 — Renderer
- React Router DOM ^7.12.0 — SPA routing (`BrowserRouter` in `src/App.tsx`)
- Tailwind CSS ^4.1.18 — Utility-first CSS framework
- Tailwind CSS PostCSS/Vite plugins ^4.1.18 — Build integration

**UI Component Primitives (shadcn/ui pattern):**
- Radix UI primitives (`@radix-ui/react-avatar`, `dialog`, `dropdown-menu`, `label`, `radio-group`, `scroll-area`, `separator`, `slot`, `tabs`, `tooltip`) — Headless accessible components
- `class-variance-authority` ^0.7.1 — Component variant management
- `tailwind-merge` ^3.4.0 + `clsx` ^2.1.1 — Conditional class merging
- `lucide-react` ^0.562.0 — Icon library
- `sonner` ^2.0.7 — Toast notifications

**Data Visualization:**
- Recharts ^3.6.0 — React charting library

**Core Backend:**
- FastAPI ^0.129.0 — Web framework (async, OpenAPI auto-docs)
- Uvicorn ^0.40.0 — ASGI server
- Pydantic ^2.12.5 — Data validation and settings management
- SQLAlchemy ^2.0.46 — ORM and database abstraction
- Alembic ^1.18.4 — Database migrations
- APScheduler ^3.11.0 — Background job scheduling

**Testing:**
- pytest ^8.3.5 — Python test runner

**Build/Dev:**
- Vite ^7.2.4 — Frontend build tool and dev server
- TypeScript ~5.9.3 — Type checking
- `@vitejs/plugin-react` ^5.1.1 — React Fast Refresh
- PostCSS ^8.5.6 + Autoprefixer ^10.4.23 — CSS processing

## Key Dependencies

**Critical Frontend:**
- `react` ^19.2.0 / `react-dom` ^19.2.0 — Core UI framework
- `react-router-dom` ^7.12.0 — Client-side routing
- `recharts` ^3.6.0 — Charts and data visualization
- `lucide-react` ^0.562.0 — Iconography

**Critical Backend:**
- `fastapi` ^0.129.0 — API framework
- `sqlalchemy` ^2.0.46 — Database ORM
- `alembic` ^1.18.4 — Schema migrations
- `httpx` ^0.27.0 — Async HTTP client for external APIs
- `pydantic-settings` ^2.12.0 — Environment-based configuration
- `apscheduler` ^3.11.0 — Cron/interval scheduling
- `psycopg2-binary` ^2.9.11 — PostgreSQL driver (optional; SQLite is default)
- `numpy` ^2.2.4 — Numerical computation (climate calculations)

**Infrastructure:**
- `python-dotenv` ^1.2.1 — `.env` file loading
- `python-multipart` ^0.0.22 — Form/file upload parsing

## Configuration

**Environment:**
- `.env` file at project root (gitignored)
- `python-dotenv` loads variables in `backend/main.py`
- Key configs required: `ADMIN_API_KEY`, `ADMIN_PASSWORD`, `METRICS_PASSWORD`, `DATABASE_URL` (optional), `STATIC_DIR`, `OPENMETEO_ENABLED`

**Build:**
- `vite.config.ts` — Vite plugins, path aliases (`@/src`), proxy rules, manual chunking
- `tsconfig.json` — Project references (`tsconfig.app.json`, `tsconfig.node.json`)
- `package.json` — npm scripts: `dev`, `build`, `preview`
- `backend/pyproject.toml` — PEP 621 project metadata, dependency groups (`dev`)
- `backend/requirements.txt` — Pinned production dependencies

## Platform Requirements

**Development:**
- Docker + Docker Compose (optional but documented)
- Node.js 20+ (for local frontend dev)
- Python 3.11+ (for local backend dev)
- Ports: 5173 (Vite), 8000 (FastAPI)

**Production:**
- Docker containers (multi-service via `docker-compose.yml`)
- Backend serves static frontend from `STATIC_DIR` (`/app/frontend/dist`)
- Health check: `GET /api/health`
- Non-root user (`appuser`) in backend container

---

*Stack analysis: 2026-05-14*
