# Testing — ClimateShield

**Analysis Date:** 2026-05-17

## Test Frameworks

**Frontend: No test framework is installed or configured.**
- No `vitest`, `jest`, `@testing-library/react`, or any test runner in `package.json` `devDependencies`
- No test config files (`vitest.config.ts`, `jest.config.ts`, `jest.config.js`) exist
- No test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`) found anywhere in `src/`

**Backend: pytest is declared as a dev dependency but no tests exist.**
- `backend/pyproject.toml` lists `pytest>=7.0.0` and `httpx>=0.27.0` in `[dependency-groups] dev`
- No `pytest.ini`, `conftest.py`, or `pytest` configuration found
- No test files (`test_*.py`, `*_test.py`) found anywhere in `backend/`
- No `backend/tests/` or `backend/test/` directory exists

**Run Commands:**
```bash
# Frontend — no test commands exist
# package.json scripts only: dev, build, preview

# Backend — pytest could be run but has no tests
# No test script in pyproject.toml
pip install -e ".[dev]"   # Install dev deps
pytest                    # Would find nothing
```

## Test Coverage

**Coverage: 0% across both frontend and backend.**

No test files, no coverage configuration, no coverage reports exist.

- Frontend: 0 test files, 0 assertions
- Backend: 0 test files, 0 assertions
- No coverage tools installed (`@vitest/coverage`, `pytest-cov`)

## Test Organization

**No test organization exists.** There are no test directories, no test files, and no test fixtures.

**Expected locations if tests were added (based on conventions):**
- Frontend: Co-located `*.test.tsx` next to source files, or `src/__tests__/` directory
- Backend: `backend/tests/` directory with `conftest.py`

## Running Tests

```bash
# Frontend — no test runner available
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite build (only type checking exists)

# Backend — pytest installed but no tests
pytest               # Discovers nothing (no test files)
pytest backend/      # Would scan backend for tests
```

**TypeScript type checking is the only validation:**
```bash
tsc -b               # TypeScript build check (run as part of npm run build)
```

## Test Patterns

**No test patterns exist.** The following patterns are observed in the codebase that would be candidates for testing:

### Backend — Testable Pure Functions

These functions in `backend/services/climate/` are pure (no DB, no I/O) and highly testable:

- `backend/services/climate/scoring_v2.py` — `lookup_wbt_score()`, `lookup_hne_score()`, `lookup_warning_multiplier()`, `lookup_state()`, `compute_risk_score_v2()`
- `backend/services/climate/wbt.py` — `calculate_wbt()`, `calculate_wbgt()`
- `backend/services/climate/hne.py` — `calculate_hne()`, `is_extreme_hne()`
- `backend/services/climate/risk.py` — `risk_level_from_wbt()`, `risk_level_from_max_temp()`, `compute_risk_outlook()`, `should_create_alert()`
- `backend/services/risk_config_service.py` — `validate_risk_config()` (complex validation logic with many error paths)

### Backend — API Endpoint Tests

These would require a test database fixture:

- `backend/api/weather.py` — All weather endpoints (current, forecast, history, live-score, trends)
- `backend/api/donor.py` — Donation pledge creation
- `backend/api/admin.py` — Export/import, risk config CRUD
- `backend/api/health.py` — Health check

### Frontend — Component Tests

Key components that would benefit from testing:

- `src/sections/risk-intelligence/components/RiskScoreGauge.tsx` — Score gauge rendering, state mapping
- `src/hooks/useOfflineCache.ts` — Cache read/write/clear, version invalidation
- `src/hooks/useControlPlaneData.ts` — Data fetching, offline fallback
- `src/services/api.ts` — API client method signatures and error handling
- `src/components/ErrorBoundary.tsx` — Error catching and fallback UI
- `src/context/RetryContext.tsx` — Retry key increment behavior

### Frontend — Integration Tests

Critical user flows:

- Risk Intelligence page: loads data, shows station gauges, live score polling
- Donation flow: form submission, success/error handling
- Settings: risk formula configuration, password verification
- Offline behavior: cached data display, retry trigger

## Coverage Gaps

**Critical untested areas:**

### Backend — High Priority

| Area | What's Not Tested | Risk | Files |
|------|-------------------|------|-------|
| Risk score v2 formula | All scoring functions (W, H, V, M, T8 floor, cap, state mapping) | Incorrect risk scores deployed to production | `backend/services/climate/scoring_v2.py` |
| WBT calculation | Tetens/Newton-Raphson iteration convergence, edge cases (RH=0, RH=100, extreme temps) | Incorrect wet-bulb temperatures → wrong risk levels | `backend/services/climate/wbt.py` |
| Risk config validation | 7 separate validation rules with overlapping edge cases | Invalid configs accepted or valid configs rejected | `backend/services/risk_config_service.py` |
| Weather orchestrator | Persistence logic, data transformation from HKO format | Data loss or corruption on each refresh cycle | `backend/services/weather_orchestrator.py` |
| CRUD operations | Donation pledge creation, donor profile upsert | Data integrity issues | `backend/crud.py` |

### Backend — Medium Priority

| Area | What's Not Tested | Risk | Files |
|------|-------------------|------|-------|
| API endpoints | All 15+ weather endpoints, admin endpoints | Regression on API contract changes | `backend/api/*.py` |
| Auth/password checking | `secrets.compare_digest` timing-attack protection | Security regression | `backend/auth.py`, `backend/api/weather.py:_check_password` |
| Rate limiting | slowapi integration on refresh/verify endpoints | Accidental lockout or no protection | `backend/limiter.py`, `backend/api/weather.py` |
| Import/export | Backup file validation, partial import rollback | Data corruption on malformed uploads | `backend/api/admin.py` |
| Audit logging | JSON format, rotation, field completeness | Missing audit trail for compliance | `backend/services/audit_logger.py` |

### Frontend — High Priority

| Area | What's Not Tested | Risk | Files |
|------|-------------------|------|-------|
| useOfflineCache | Cache version invalidation, sessionStorage quota errors | Users shown stale data silently | `src/hooks/useOfflineCache.ts` |
| API client | Error handling consistency, response parsing | Unhandled API errors crash UI | `src/services/api.ts` |
| RiskScoreGauge | Score → state mapping, gauge rendering | Wrong risk level displayed | `src/sections/risk-intelligence/components/RiskScoreGauge.tsx` |
| ErrorBoundary | Default props, recovery mechanism | Unclear crash screen | `src/components/ErrorBoundary.tsx` |

### Frontend — Medium Priority

| Area | What's Not Tested | Risk | Files |
|------|-------------------|------|-------|
| Control plane data hook | Polling interval, refresh attempt guard, offline fallback | Infinite refresh loops or stale data | `src/hooks/useControlPlaneData.ts` |
| Risk Intelligence page | Multi-API parallel loading, station filtering | Race conditions, empty states | `src/pages/RiskIntelligence.tsx` |
| Donation flow | Form validation, submission, toast messages | Failed donations show no feedback | `src/pages/donate/Donate.tsx` |
| Risk formula panel | Config editing, validation, save/reset flows | Config corruption | `src/pages/settings/components/RiskFormulaPanel.tsx` |

## CI/CD

**No CI/CD pipeline is configured.**

- No `.github/workflows/` directory exists
- No `Makefile`, `tox.ini`, or CI configuration files
- `docker-compose.yml` and `docker-compose.prod.yml` exist for local/Docker deployment
- No automated test execution on push or PR
- No pre-commit hooks configured

**Docker Compose services** (from `docker-compose.yml` existence):
- Frontend container (Vite dev server, port 5173)
- Backend container (uvicorn, port 8000)
- Database service (likely PostgreSQL for production)

**Build validation is manual only:**
```bash
npm run build          # TypeScript type check + Vite build
# No automated linting, testing, or deployment checks
```

## Manual Testing

**No formal manual testing procedures documented.**

**Observed manual testing patterns from code comments and implementation:**

1. **Weather data refresh:** `POST /api/weather/refresh` — manually trigger HKO data fetch
2. **Health check:** `GET /api/health` — verify backend services
3. **Admin endpoints:** Password-gated, tested via browser or curl
4. **Open-Meteo beta flag:** `localStorage.setItem("climateshield_openmeteo_beta", "true")` — manual toggle for 14-day forecast

**Local development workflow:**
```bash
# Start backend
cd backend
uvicorn backend.main:app --reload --port 8000

# Start frontend
npm run dev    # Vite on port 5173 with proxy to backend

# Check health
curl http://localhost:8000/api/health
```

**FastAPI auto-docs:** Available at `GET /docs` (Swagger UI) when backend is running.

---

*Testing analysis: 2026-05-17*