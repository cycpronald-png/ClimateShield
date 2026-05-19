# ClimateShield

A lightweight climate risk awareness dashboard for Hong Kong. Monitors real-time HKO (Hong Kong Observatory) weather data, computes heat-stress risk levels using a 0-30 composite risk score framework, and coordinates supply donations for at-risk districts.

## Features

- **Control Plane** — Real-time district risk overview with HKO weather data, active warnings (TC, WMSGNL, etc.), and donation management
- **Risk Intelligence** — Wet-bulb temperature (WBT) time-series analysis with fixed 15-40°C Y-axis and 5 risk bands + 9 overlap zones, 9-day / 14-day forecast discrepancy detection, hot-night-excess (HNE) monitoring with temperature-aware projection, station-level detail modals with risk history (0-30 scale)
- **Live Risk Score** — On-demand recomputation via `/live-score` endpoint with full score breakdown (W, H, V, M components) and theoretical maximum display (30/30)
- **Donation** — Pledge cooling / warming supplies, select drop-off locations, track estimated impact
- **Admin Settings** — Theme toggle, data backup (export/import), impact metrics reset, risk formula parameter editing (WBT thresholds, vulnerability triggers, warning multipliers)

## Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + Recharts | Dashboard UI, data visualization, gauge components |
| Backend | Python 3.11 + FastAPI + SQLAlchemy + SQLite | Weather data orchestration, risk scoring, API |
| Data Sources | HKO API (auto-polling every 10 min), Open-Meteo | Real-time weather readings + extended forecasts |
| Risk Framework | 0-30 scale: W (WBT 0-6) + H (HNE 0-4) + V (Vulnerability 0-5) × M (Warnings 1.0-3.0), capped at 30 | Composite risk scoring with priority-ordered state lookup |

### Risk Score Framework (0–30 Scale)

The composite risk score is computed as:

```
Score = (WBT_component + HNE_component + Vulnerability_component) × Warning_multiplier
      Capped at 30.0
```

| Component | Range | Details |
|-----------|-------|---------|
| **W** (Wet-Bulb Temperature) | 0–6 | WBT < 21.9°C → 0; 22–23.9°C → 1; 24–26.9°C → 2; 27–29.9°C → 4; ≥ 30°C → 6 |
| **H** (Hot Night Excess) | 0–18 | 0 nights → 0; 1–2 nights → 2; 3–4 nights → 12 (3x sensitivity threshold); 5+ nights → 18 |
| **V** (Vulnerability) | 0–5 | HNE ≥ 2 triggers max vulnerability (5) |
| **M** (Warning Multiplier) | 1.0–3.0 | T1/T3=1.5, T8/T9/T10=3.0, Rainstorm Red/Black=2.0, others=1.0 |
| **States** | 0–30 | Safe (0–12), Low (13–16), Yellow (17–22), Red (23–26), Purple (25–30) |

**Theoretical Maximum**: `(6 + 4 + 5) × 3.0 = 45` → capped at **30.0**

---

## System Requirements

| Spec | Minimum | Recommended |
|------|---------|-------------|
| **OS** | Windows 10/11, macOS 12+ (Intel/Apple Silicon), Linux | Latest stable OS version |
| **CPU** | x86_64 or ARM64 | Any modern multi-core processor |
| **RAM** | 4 GB | 8 GB |
| **Storage** | 2 GB free | 5 GB free (for logs & data growth) |
| **Network** | Internet for HKO API polling | Stable broadband |

### Required Software

| Tool | Windows | macOS |
|------|---------|-------|
| **Docker Desktop** 4.20+ | [Download](https://www.docker.com/products/docker-desktop/) | [Download](https://www.docker.com/products/docker-desktop/) |
| **OR Node.js 20+** | [Download](https://nodejs.org/) | `brew install node` |
| **OR Python 3.11+** | [Download](https://python.org/) | `brew install python@3.11` |

> **Windows Python tip:** During installation, check **"Add Python to PATH"** and **"Disable path length limit"**.

---

## Quick Start (Docker — Recommended)

Docker runs the entire stack (frontend + backend + SQLite database) in isolated containers. This is the easiest and most reliable method.

### Step 1 — Install Docker

#### macOS

1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) (choose Apple Silicon or Intel build)
2. Open the `.dmg` and drag Docker to **Applications**
3. Launch Docker Desktop from Applications
4. Grant any requested permissions (macOS may ask for privileged access)
5. Wait for the engine to start (whale icon turns green in the menu bar)

#### Windows

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Run the installer and **enable WSL 2** when prompted (required for best performance)
3. Restart your computer
4. Open Docker Desktop and wait for the engine to start (whale icon turns green)
5. Verify WSL 2 is the default backend: **Settings → General → Use the WSL 2 based engine** (checked)

> **Windows Home users:** Docker Desktop requires WSL 2. If you see "WSL 2 installation is incomplete", [install the WSL 2 Linux kernel update package](https://aka.ms/wsl2kernel).

### Step 2 — Clone the Repository

```bash
# macOS / Windows (PowerShell, Git Bash, or Terminal)
git clone <repository-url> climateshield
cd climateshield
```

### Step 3 — Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example environment file
cp .env.example .env
```

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Password for admin panel access | `Climate1222Shield` |
| `METRICS_PASSWORD` | Password for metrics/health endpoints | `Climate1222Shield` |

> **Security note:** Change these passwords before deploying to production. The passwords are lazy-evaluated — the app will prompt for them when accessing protected routes.

### Step 4 — Build and Launch

```bash
# First run: builds images and starts containers (~3-5 minutes)
docker-compose up --build

# Subsequent runs (after code changes):
docker-compose up --build

# Or if images are already built:
docker-compose up -d
```

> **Windows note:** If `docker-compose` is not found, use `docker compose` (space, no hyphen). Run commands in **PowerShell** or **Git Bash**.

### Step 5 — Verify Installation

Open these URLs in your browser:

- **Frontend (Dashboard)**: http://localhost:5173
- **Backend API Docs (Swagger UI)**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/health → should return `{"status":"ok"}`

**Expected first-run behavior:**
1. The initial HKO data poll may take 1-2 minutes
2. All stations will show **Score 0.0 / 30** with **"Safe — No Immediate Risk"** (this is correct when WBT < 25.9°C)
3. The **Control Plane** shows district risk cards
4. **Risk Intelligence** shows the WBT time-series graph and forecast dashboard

### Stopping

```bash
# Stop containers (preserves SQLite database and data)
docker-compose down

# Stop and remove ALL data (irreversible — deletes SQLite DB)
docker-compose down -v
```

---

## Manual Setup (No Docker)

Use this if you prefer running services directly on your machine, or if Docker is unavailable.

### Step 1 — Install Prerequisites

#### macOS

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20 and Python 3.11
brew install node python@3.11

# Verify installations
node --version  # Should show v20.x.x
python3 --version  # Should show Python 3.11.x
```

#### Windows

1. **Node.js**: Download and install [Node.js 20 LTS](https://nodejs.org/) → choose "Automatically install necessary tools"
2. **Python 3.11**: Download and install [Python 3.11](https://www.python.org/downloads/windows/)
   - ⚠️ **Important:** Check **"Add Python to PATH"** during installation
   - Also check **"Disable path length limit"**
3. **Git** (optional but recommended): Download from [git-scm.com](https://git-scm.com/download/win)

Verify installations in **PowerShell**:
```powershell
node --version    # Should show v20.x.x
python --version  # Should show Python 3.11.x
```

### Step 2 — Clone and Configure

```bash
git clone <repository-url> climateshield
cd climateshield

# Create .env file (see Docker Step 3 for required variables)
cp .env.example .env
# Edit .env and set your ADMIN_PASSWORD and METRICS_PASSWORD
```

### Step 3 — Backend (Terminal 1)

```bash
# Create a Python virtual environment
# macOS / Linux:
python3 -m venv .venv
source .venv/bin/activate

# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Enable script execution if blocked (Windows PowerShell only)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install Python dependencies
pip install -r backend/requirements.txt

# Run database migrations (if using Alembic)
# Or just start — the app auto-creates tables on first run

# Start the FastAPI server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will:
- Initialize HKO and Open-Meteo clients
- Auto-create SQLite database tables on first run
- Start a scheduler that polls HKO data every 10 minutes
- Seed initial config with `trigger_h_score=2` (WBT vulnerability threshold)

**Verify:**
- Health: http://localhost:8000/api/health → `{"status":"ok"}`
- API Docs: http://localhost:8000/docs

### Step 4 — Frontend (Terminal 2)

Open a **new terminal** (keep the backend running in Terminal 1):

```bash
cd climateshield

# Install Node.js dependencies (first time only)
npm install

# Start the Vite dev server
npm run dev
```

The dev server will:
- Start on http://localhost:5173
- Proxy `/api`, `/docs`, `/openapi.json` to the backend at `:8000` (configured in `vite.config.ts`)
- Auto-reload on file changes

**Verify:** Open http://localhost:5173 — the dashboard should load.

### Step 5 — Build for Production (Optional)

```bash
# Build optimized static files to dist/
npm run build

# The backend (when STATIC_DIR=/app/frontend/dist) will serve these files
```

---

## API Endpoints

Key endpoints available at `http://localhost:8000`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check — returns `{"status":"ok"}` |
| `/api/weather/readings` | GET | Current weather readings for all stations |
| `/api/weather/readings?station=...` | GET | Readings for a specific station |
| `/api/weather/live-score` | POST | Live risk score computation with breakdown (W, H, V, M) |
| `/api/weather/warnings` | GET | Active weather warnings (TC, WMSGNL, Rainstorm, etc.) |
| `/api/weather/trends` | GET | 9-day and 14-day forecast trends with HNE projection |
| `/api/weather/history/readings?station=...&hours=...` | GET | Historical WBT readings for time-series graph |
| `/api/donors` | POST | Submit a donation pledge |
| `/api/admin/*` | Various | Admin endpoints (protected by ADMIN_PASSWORD) |

See full API documentation at http://localhost:8000/docs (Swagger UI).

---

## Project Structure

```
climateshield/
├── backend/                    # FastAPI application
│   ├── api/                    # API routers (donor, admin, weather, health)
│   │   └── weather.py          # /live-score, /readings, /warnings, /trends, /history/readings
│   ├── services/               # Business logic
│   │   ├── climate/            # Risk scoring (scoring_v2.py, risk_config_service.py)
│   │   ├── weather_orchestrator.py  # HKO polling, warning deduplication, forecast projection
│   │   └── scheduler.py        # Background task scheduler (10-min HKO polls)
│   ├── database.py             # SQLite connection & session management
│   ├── models.py               # SQLAlchemy ORM models (WeatherReading, WeatherWarning, etc.)
│   ├── schemas.py              # Pydantic request/response models
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt        # Python dependencies
│   └── Dockerfile              # Backend container image
├── src/                        # React frontend source
│   ├── pages/                  # Route-level pages (ControlPlane, RiskIntelligence, Donate, Settings)
│   ├── sections/               # Feature sub-components
│   │   ├── control-plane/      # District risk cards, warning badges
│   │   └── risk-intelligence/  # Gauge, WBT graph, forecast dashboard, history modal
│   │       ├── components/
│   │       │   ├── RiskScoreGauge.tsx        # Live score display (0-30, friendly messages)
│   │       │   ├── WBTTimeSeriesGraph.tsx    # Historical WBT chart (15-40°C Y-axis)
│   │       │   ├── ForecastDashboard.tsx     # 9-day forecast with risk projection
│   │       │   └── RiskHistoryModal.tsx      # Historical risk scores (0-30 scale)
│   ├── components/             # Shared UI (layout, admin, ui primitives)
│   ├── hooks/                  # React hooks (data fetching, caching)
│   ├── services/               # API client (api.ts with getLiveScore, getHistoricalReadings)
│   └── App.tsx                 # Router & root layout
├── public/                     # Static assets (logo, favicon)
├── package.json                # Node.js dependencies & scripts
├── docker-compose.yml          # Multi-container orchestration (backend + frontend)
├── Dockerfile                  # Frontend dev container
├── vite.config.ts              # Vite build configuration
└── .env                        # Environment variables (not committed)
```

---

## Data & Storage

- **SQLite** is used for all persistence (weather readings, forecasts, donation pledges, system alerts, risk config)
- The database file (`climateshield.db`) is created automatically at first run
- **No external database server** (PostgreSQL, MySQL, etc.) is required
- **Backup/restore** available via **Settings → Data Backup** (export/import JSON)

### Database Schema Overview

| Table | Purpose |
|-------|---------|
| `weather_readings` | Real-time WBT, temperature, humidity, wind per station |
| `weather_warnings` | Active HKO warnings (TC, WMSGNL, Rainstorm, etc.) with deduplication |
| `forecast_periods` | 9-day and 14-day forecast data from HKO |
| `risk_configs` | Admin-editable risk formula parameters (WBT bands, trigger_h_score, multipliers) |
| `donors` | Donation pledges with impact estimates |

---

## Admin Configuration

Access the admin panel at **Settings → Admin Panel** (password from `.env` → `ADMIN_PASSWORD`).

Editable risk parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `wb_t*` | 21.9 / 23.9 / 26.9 / 29.9 | WBT threshold boundaries (°C) |
| `wb_s*` | 0 / 1 / 2 / 4 / 6 | WBT component scores |
| `trigger_h_score` | 2 | HNE threshold to trigger max vulnerability (V=5) |
| `h_s1` / `h_s2` / `h_s3` / `h_s4` | 0 / 1 / 2 / 4 | HNE component scores by consecutive nights |
| `max_vuln_score` | 5 | Maximum vulnerability score |
| Warning multipliers | T1/T3=1.5, T8/T9/T10=3.0, etc. | Per-warning-type multipliers |

---

## Troubleshooting

### Docker Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `docker-compose` not found | Docker Desktop not installed or not running | Install / start Docker Desktop |
| Port 5173 or 8000 already in use | Another app is using the port | Change ports in `docker-compose.yml` or `vite.config.ts` |
| Build fails with "no space left on device" | Docker image cache full | Run `docker system prune -a` (removes unused images) |
| Container keeps restarting | Python import error or port conflict | Check logs: `docker-compose logs backend` |

### Backend Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| HKO data not loading | Network issue or HKO API unavailable | The app will show offline mode with cached data; check `docker-compose logs backend` |
| `ModuleNotFoundError` on import | Not running from repo root or virtual env not active | Ensure you are in the `climateshield/` folder and `.venv` is activated |
| Risk scores all show 0.0 | Current WBT is below 21.9°C | **This is correct behavior**, not a bug. See Risk Framework section above |
| Duplicate warnings in DB | Historical bug in orchestrator | Run the cleanup script or let the deduplication logic handle it automatically |
| `trigger_h_score` still 3 in DB | Old config cached before fix | Restart containers or manually update via Settings → Admin Panel |

### Frontend Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page after build | `dist/` not mounted into backend container | Run `npm run build` before `docker-compose up` or mount `./frontend/dist` |
| `npm install` fails on Windows | Native module compilation issue | Use `npm install --legacy-peer-deps` or ensure Python is in PATH |
| Gauge shows old values after rebuild | Browser cache | Hard-refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (macOS) |
| Chart not rendering | Recharts not installed | Run `npm install` again; check `package.json` for `recharts` |

### MacOS-Specific Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `python3: command not found` | Python not installed or not in PATH | `brew install python@3.11`; ensure `/opt/homebrew/bin` or `/usr/local/bin` is in PATH |
| `pip install` permission denied | System Python protected | Always use a virtual environment (`python3 -m venv .venv`) |
| Docker Desktop slow on Apple Silicon | Rosetta emulation for x86 images | Ensure you're using ARM64 Docker Desktop and base images |

### Windows-Specific Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `python` not recognized | Python not in PATH | Reinstall Python and check "Add Python to PATH" |
| PowerShell execution policy blocks scripts | Default security setting | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `npm` fails with `node-gyp` errors | Missing Visual Studio Build Tools | Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload |
| WSL 2 required but not installed | Docker Desktop on Windows Home | Follow [Microsoft's WSL 2 installation guide](https://aka.ms/wsl2kernel) |
| Line ending errors (`\r\n` vs `\n`) | Git auto-converts line endings | Run `git config --global core.autocrlf false` and re-clone |

### Verification Commands

```bash
# Check if backend is healthy
curl http://localhost:8000/api/health

# Check live score for a station
curl -s -X POST 'http://localhost:8000/api/weather/live-score?station=Hong+Kong+Observatory' | python3 -m json.tool

# Check active warnings
curl http://localhost:8000/api/weather/warnings | python3 -m json.tool

# View backend logs
docker-compose logs backend --tail=50

# View frontend logs
docker-compose logs frontend --tail=50
```

---

## Development Workflow

### Making Changes

1. **Frontend changes**: Edit files in `src/` → Vite auto-reloads at `http://localhost:5173`
2. **Backend changes**: Edit files in `backend/` → Uvicorn auto-reloads with `--reload` flag
3. **Database schema changes**: Use Alembic migrations or allow auto-create on restart

### Rebuilding After Changes

```bash
# After frontend code changes
npx tsc -b --noEmit  # TypeScript check (0 errors required)
npx vite build       # Production build
docker-compose build frontend && docker-compose up -d  # Rebuild container

# After backend code changes
docker-compose build backend && docker-compose up -d
```

### Running Tests (if available)

```bash
# Backend tests (if pytest configured)
cd backend && pytest

# Frontend type check
npx tsc -b --noEmit

# Frontend build check
npx vite build
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test locally
4. Submit a pull request with a clear description

---

## License

Copyright (c) ClimateShield Contributors. All rights reserved.
