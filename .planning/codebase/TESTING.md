# Testing Analysis

**Analysis Date:** 2026-05-14

## Test Infrastructure

- **Backend Framework**: pytest (configured in `backend/pyproject.toml` dependency group `dev`)
- **Frontend Framework**: none installed, Vite handles builds only
- **Runner**: none configured
- **CI**: none; `.github/workflows/` absent

### Configuration Files

| File | Status | Notes |
|------|--------|-------|
| `backend/pyproject.toml` | contains `pytest>=7.0.0` under `[dependency-groups] dev` | pytest listed but `pytest.ini`/`setup.cfg` absent |
| `pytest.ini` | **missing** | no test discovery rules, no coverage config |
| `jest.config.*` | **missing** | no Jest or Vitest frontend config |
| `vitest.config.*` | **missing** | no unit-test runner for React components |

### Package.json
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview"
}
```
There is **no `test` script** defined; this indicates no frontend testing infrastructure.

---

## Backend Tests

**Result: ZERO TEST FILES FOUND**

The following search patterns were explicitly checked and returned no results:
- `**/test*.py` 
- `**/*_test.py` 
- `backend/**/test*.py` 
- `backend/tests/**`
- No `tests/` or `test/` directories under `backend/`.

### Identified Critical Untested Areas

1. **`backend/services/climate/scoring_v2.py`** — Risk scoring engine v2.
   - Contains threshold-based scoring, fuzzy warning matching, and T8 floor logic.
   - Directly impacts user-facing risk levels and safety advisories.
   - Zero parametrized tests for edge cases or multipliers.

2. **`backend/services/weather_orchestrator.py`** — Weather data orchestrator.
   - Parses HKO JSON into SQLAlchemy models.
   - Creates `SystemAlert` records on thresholds.
   - Contains DB interaction loops, `MONITORED_STATIONS` logic, and alert deduplication (`_ensure_unique_alert`).
   - No tests for `run_hne_daily_check`, `persist_weather_data`, or `seed_weather_data`.

3. **`backend/api/admin.py`** — Admin REST endpoints (393 lines).
   - Import/export JSON backups, CRUD for donations, formula update/test endpoints.
   - Uses admin password checks (`secrets.compare_digest`) and Pydantic validation.
   - No authentication/API tests, no file-upload tests.

4. **`backend/services/risk_config_service.py`** — Formula validation logic.
   - Validates WBT thresholds, state-range partitions, Purple-state / T8-floor coupling.
   - Contains `DEFAULT_CONFIG` hard-coded values; no tests to prove `validate_risk_config` rejects bad configs.

### Other Untested Modules

- **`backend/services/hko_client.py`** — HKO API client, response parsing.
- **`backend/services/open_meteo_client.py`** — Open-Meteo integration.
- **`backend/services/counters.py`** — GenerationCounter increment logic.
- **`backend/services/climate_engine.py`** — WBT/HNE raw calculations.
- **`backend/services/audit_logger.py`** — Audit log write path.
- **`backend/models.py`** — SQLAlchemy ORM models (constraints, cascade).
- **`backend/main.py`** — FastAPI lifespan, router wiring, middleware.

---

## Frontend Tests

**Result: ZERO TEST FILES FOUND**

- No `.test.tsx`, `.spec.tsx`, `.test.ts`, or `.spec.ts` files inside `src/`.
- The only test files present belong to installed packages under `node_modules/` (e.g., Redux Toolkit internals), not project code.

### Frontend Components Without Coverage

| Area | Technology | Untested Concerns |
|------|------------|-------------------|
| Pages | React + TypeScript | Route rendering, state hydration |
| Sections | Feature sub-components | Data-bound UI, modals |
| Components | Shared UI (Radix-based) | Accessibility, keyboard navigation |
| Hooks | Custom React hooks | API caching, polling, error handling |
| Services | `src/services/api.ts` | Fetch wrappers, error parsing, retries |
| Recharts | Risk / forecast charts | Data-to-chart mapping, responsive sizing |

---

## Test Coverage Assessment

### Areas That HAVE Tests

None. The project contains no automated tests.

### Areas That LACK Tests

- **Backend Business Logic**: Risk scoring, weather parsing, alert creation.
- **Backend API**: All FastAPI routers (`/api/health`, `/api/weather`, `/api/admin`, `/api/donor`).
- **Backend Data Layer**: SQLAlchemy models, alembic migrations.
- **Frontend UI**: Component rendering, user interactions (buttons, forms, filters).
- **Frontend Services**: API integration, local storage usage.
- **Infrastructure**: Dockerfile build-time, `docker-compose` healthchecks.

### Priority-Risk Matrix

| File | Impact | Complexity | Recommended Test Type |
|------|--------|------------|-----------------------|
| `backend/services/climate/scoring_v2.py` | Critical | Medium | Unit (parametrized) |
| `backend/services/risk_config_service.py` | High | Medium | Unit + Property-based |
| `backend/api/admin.py` | High | Medium | Integration (HTTP) |
| `backend/services/weather_orchestrator.py` | Critical | High | Integration (DB mocks + fixtures) |
| `src/services/api.ts` | High | Low | Unit (fetch mocking) |
| `src/pages/ControlPlane.tsx` | Medium | High | Component (RTL) |
| `src/pages/RiskIntelligence.tsx` | Medium | High | Component (RTL) |

---

## Manual Testing

### Documented Procedures

- **README verification** (`/Users/yellow/[REAL] Eco-pilot/Test/ClimateShield/README.md`):
  - Developer is instructed to open `http://localhost:5173` and visually inspect the Control Plane district cards.
  - Backend health check: `GET http://localhost:8000/api/health` should return `{"status":"ok"}`.
  - No step-by-step QA checklist, no regression test list.

### HKO Integration Verification

- No isolated test script or mock server exists.
- HKO integration is tested implicitly by running the full application and observing data in the UI or logs.
- Backend log references (`logging.getLogger(__name__)`) are the only runtime diagnostics.

---

## CI/CD

### GitHub Actions

- **No workflows** found (`.github/workflows/` does not exist).

### Docker Testing

- `docker-compose.yml` defines a `healthcheck` for the backend container only:
  ```yaml
  healthcheck:
    test: ["CMD-SHELL", "curl -fsS http://localhost:8000/api/health || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 15s
  ```
- This is runtime health monitoring, **not** automated test execution.
- Neither Dockerfile runs pytest or any test suite during build.

### Docker Compose Services

| Service | Dockerfile | Test Stage? |
|---------|-----------|-------------|
| `backend` | `backend/Dockerfile` | No; only installs deps & starts uvicorn |
| `frontend` | `Dockerfile` | No; runs `npm run dev` |

---

## Recommendations

1. **Bootstrap pytest in backend**:
   - Create `backend/pytest.ini` with `testpaths = tests`.
   - Add `pytest-cov` and `pytest-asyncio` to dev dependencies.
   - Write a minimal test for `compute_risk_score_v2` with a few edge-case scenarios.

2. **Add Vitest to frontend**:
   - Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`.
   - Add a `test` script in `package.json`.
   - Cover at least `src/services/api.ts` fetch wrappers and one major page component.

3. **Add a GitHub Actions workflow**:
   - Run backend tests on PRs (`pytest --cov`).
   - Run frontend build + lint (`tsc -b`, `vite build`) to catch type errors.
   - Optionally run `docker-compose up --build` as a smoke test.

4. **Create manual test checklist**:
   - Document HKO response shapes and how to verify each endpoint using curl.
   - Define acceptance criteria for Control Plane card rendering.

---

*Testing audit: 2026-05-14*
