# Codebase Concerns

**Analysis Date:** 2026-05-14

## Security Risks

**Admin password fallback:**
- File: `backend/api/admin.py` line 25
- Issue: `ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "climateshield")` includes a hardcoded default fallback. If the env var is missing, the application starts with a publicly known default password.
- Fix: Remove the fallback and raise `RuntimeError` on missing value, consistent with `backend/api/weather.py` line 19–24 (`METRICS_PASSWORD`).

**API key auth (timing-safe but single-key):**
- File: `backend/auth.py`
- Issue: Uses `secrets.compare_digest` correctly for timing-safe comparison, but only supports a single `ADMIN_API_KEY`. No key rotation or scoped keys (read-only vs admin). The key is read from env on every request via `_get_valid_api_keys()`.
- Fix: Consider caching valid keys at startup or supporting a comma-separated list for rotation.

**CORS origins are hardcoded to localhost:**
- File: `backend/main.py` lines 60–71
- Issue: `origins = ["http://localhost:5173", "http://localhost:3000"]`. For production deployment, these must be overridden by an env var or the frontend will be blocked.
- Fix: Load `CORS_ORIGINS` from env (e.g., comma-separated) with localhost as default.

**Password exposed in URL query parameters:**
- File: `src/services/api.ts` line 32
- Issue: `getRiskConfig` sends the admin password as `?password=...`. URLs are logged by reverse proxies, browsers, and server access logs.
- Fix: Move password to the request body or use a header.

**No rate limiting on sensitive endpoints:**
- Files: `backend/api/weather.py` lines 496–517 (unauthenticated `POST /refresh`), `backend/api/weather.py` lines 606–616 (public `POST /verify-password`)
- Issue: No rate-limiting middleware detected. The manual refresh endpoint can be spammed to trigger external API calls and DB writes. The password verification endpoint is brute-forceable.
- Fix: Add `slowapi` or similar rate-limiting.

**No input validation on file upload size:**
- File: `backend/api/admin.py` line 130
- Issue: `UploadFile = File(...)` has no `max_length` or size limit. A large JSON backup could exhaust server memory during import.
- Fix: Add a `max_length` constraint or stream-read with size checks.

---

## Performance Risks

**SQLite scalability limits:**
- File: `backend/database.py` lines 8–22
- Issue: Default database is SQLite (`sqlite:///./climateshield.db`). WAL mode is enabled (good), but `NullPool` means no connection reuse. SQLite handles the current write volume (one process), but concurrent writes from multiple workers (e.g., Gunicorn) will hit "database is locked" errors.
- Fix: For production multi-worker setups, migrate to PostgreSQL or use a single-process single-threaded server with SQLite.

**N+1 query patterns in orchestrator:**
- File: `backend/services/weather_orchestrator.py` lines 330–352
- Issue: Inside `for r in readings:` loop, each iteration runs `db.query(models.WeatherReading).filter_by(station=r["station"]).filter(...).all()`. For 20 stations, this is 20 extra queries per persistence cycle.
- Fix: Batch the prior-window query with `station IN (...)` and build a lookup dict before the loop.

**Repeated risk-config DB hits inside loops:**
- Files: `backend/api/weather.py` lines 281, 409, 454; `backend/services/weather_orchestrator.py` line 358
- Issue: `get_active_risk_config(db)` is called inside loops over historical buckets and forecast days. The config rarely changes; this is wasteful.
- Fix: Cache the active config for the duration of the request (e.g., pass it as a parameter or use `functools.lru_cache` with a short TTL).

**Unbounded export query:**
- File: `backend/api/admin.py` lines 33–126
- Issue: `export_backup` loads entire tables (`db.query(WeatherReading).all()`, etc.) into memory and constructs a massive JSON object. As data grows, this will OOM the process.
- Fix: Stream records or paginate the export. Use a generator-based JSON encoder.

**No caching layer:**
- Issue: No Redis, in-memory cache, or HTTP cache headers detected. Every API call hits the database. The HKO client also has no response caching.
- Fix: Add response caching for public weather endpoints (e.g., `GET /current` valid for 1 minute) and cache HKO API responses briefly to respect rate limits.

**Data volume implications (actual intervals):**
- File: `backend/services/scheduler.py` lines 157–166
- Issue: Full HKO poll runs every 10 minutes (not 5). With 20 stations, that's ~2,880 readings/day. Forecasts (9 rows) every hour. No data retention or archiving policy is defined. SQLite file will grow indefinitely.
- Fix: Add a scheduled job to purge readings older than N days, or archive to cold storage.

---

## Data Integrity

**Migration history had multiple heads (now merged):**
- File: `backend/migrations/versions/3a5f98d91c41_merge_risk_formula_and_counter_reset_.py`
- Issue: The merge migration proves the migration graph previously diverged. This risks future Alembic confusion if new branches are created without careful linear ordering.
- Fix: Enforce linear migration history in CI (`alembic history --verbose` check).

**Missing unique constraints on forecast and warning tables:**
- File: `backend/models.py` lines 148–179
- Issue: `WeatherForecastDay` has no unique constraint on `(forecast_date, forecast_day_index, fetched_at)`. Duplicates are possible. `WeatherWarning` has no unique constraint on `warning_type`; active warnings can be duplicated.
- Fix: Add `UniqueConstraint` where business logic requires it, or use upsert (`INSERT ... ON CONFLICT`) in the orchestrator.

**No DB-level enforcement of single active risk config:**
- File: `backend/models.py` lines 207–233
- Issue: `RiskFormulaConfig.is_active` is a Boolean with no unique partial index. `upsert_risk_config` deactivates all then inserts one, but a race condition or manual DB edit could leave multiple active configs.
- Fix: Add a partial unique index: `CREATE UNIQUE INDEX uq_one_active ON risk_formula_configs (is_active) WHERE is_active = TRUE` (SQLite supports this in recent versions; use a trigger or application check as fallback).

**Historical scores are re-evaluated with current formula:**
- Files: `backend/api/weather.py` lines 280–283, 407–411
- Issue: Endpoints `/history` and `/trends` recompute `composite_risk_score` on the fly using the *currently active* risk config. Historical scores stored in `weather_readings.composite_risk_score` are ignored. If the admin changes the formula, historical trend lines retroactively shift, breaking trend integrity.
- Fix: For historical endpoints, return the persisted `composite_risk_score` and `risk_level` from the row rather than recomputing. Only recompute if a specific `?recalc=true` param is passed.

**Risk of data loss during formula changes:**
- File: `backend/services/risk_config_service.py` lines 167–184
- Issue: `upsert_risk_config` deactivates old configs but does not archive them with metadata (who changed it, when, why). There is no audit trail for formula mutations.
- Fix: Add `changed_by` and `change_reason` columns, or append to an audit log table.

---

## Code Quality Issues

**Dead / mocked frontend stubs:**
- File: `src/services/api.ts` lines 23–30
- Issue: `admin.approve` and `admin.reject` are no-op mocks (`console.log(...); return { success: true }`). They do not call the backend.
- Fix: Implement real endpoints or remove the stubs.

**Duplicate risk-score and HNE computation logic:**
- Files: `backend/api/weather.py` and `backend/services/weather_orchestrator.py`
- Issue: The pattern `if peak_wbt is not None and avg_rh is not None: ... compute_risk_score_v2(...)` appears in at least four places (orchestrator persist, `/history`, `/trends` backward, `/trends` forward). HNE fallback logic (`temps_ordered = [r.temp_c for r in sorted(group, ...)]; hne = calculate_hne(...)`) is duplicated between `/history` and `/trends`.
- Fix: Extract a single `build_daily_summary(readings, risk_cfg)` helper in `backend/services/climate/summaries.py`.

**Fragile threshold access via `__defaults__`:**
- File: `backend/services/weather_orchestrator.py` line 513
- Issue: `calculate_hne.__defaults__[0]` retrieves the default threshold by positional index. If `calculate_hne` signature changes, this silently breaks alert messages.
- Fix: Export the threshold as a named constant (`HNE_EXTREME_THRESHOLD = 50.0` or similar) and reference it directly.

**Dead / confusing `db` check in Open-Meteo path:**
- File: `backend/services/weather_orchestrator.py` line 101
- Issue: `risk_cfg = get_active_risk_config(db) if 'db' in dir() else None`. Inside `get_extended_forecast`, `db` is never defined, so this is always `False`. Line 103 then creates a brand new `SessionLocal()`.
- Fix: Remove the dead branch and accept `db: Session` as a parameter to the method.

**No TODO/FIXME comments in project code:**
- Observation: All `TODO`/`FIXME`/`HACK` matches were inside `node_modules/`. The application code contains none. While this suggests discipline, it also means known shortcuts (like the forecast `consecutive=0` placeholder) are not explicitly flagged for future attention.
- Fix: Add a `# NOTE: placeholder` comment on line 397 of `weather_orchestrator.py`.

---

## Error Handling Gaps

**Silent failures in background jobs:**
- File: `backend/services/scheduler.py` lines 41–43, 58–60, 78–80, 101–103
- Issue: Every scheduled job wraps its body in `try: ... except Exception as e:` that logs and prints the error but swallows it. Failures do not bubble up to trigger alerts or restart logic.
- Fix: Emit a distinct "critical" agent log or integrate with an error-tracking service (e.g., Sentry).

**Silent failure on hot-night persistence:**
- File: `backend/services/weather_orchestrator.py` lines 360–363
- Issue: `persist_hot_night_counts(db, today_hk)` failure is caught and logged, but the function continues to compute risk scores. If hot-night data is missing, the `consecutive` count will be stale or zero, producing incorrect risk scores that are silently committed.
- Fix: Consider the hot-night persistence as critical; if it fails, skip risk-score computation or mark readings as `risk_level="Unknown"`.

**Missing validation on API inputs:**
- File: `backend/api/weather.py` line 224
- Issue: `days: int = 7` has no upper bound. A request with `?days=9999` will query and aggregate an enormous dataset, causing memory pressure.
- Fix: Add `Query(..., ge=1, le=90)` or similar Pydantic validation.

**Missing validation on forecast extension flag:**
- File: `backend/api/weather.py` line 228
- Issue: `beta_14day: Optional[str] = "false"` accepts any string. It only checks `.lower() == "true"`, so garbage values are treated as false. Not dangerous, but sloppy.
- Fix: Use a `bool` query parameter or a strict enum.

**Frontend does not handle specific HTTP error codes:**
- File: `src/services/api.ts`
- Issue: Every API wrapper uses a generic `if (!response.ok) throw new Error("Failed to...")`. There is no differentiation between 403 (auth), 503 (service unavailable), 500 (server error), or network failures. The UI likely shows the same generic toast for all errors.
- Fix: Inspect `response.status` and throw typed errors (`AuthError`, `ServerError`, `NetworkError`) so the UI can show appropriate messages.

**HKO fetch failures return empty data silently:**
- File: `backend/services/hko_client.py` lines 86–92
- Issue: HTTP or request errors return `None`. The orchestrator sees `raw.get("current")` as `None` and persists zero readings. This is logged at `WARNING` level, but the `/weather/current` endpoint will simply return an empty list without indicating the upstream failure.
- Fix: Store a "last fetch failed" flag or return a `503` from the weather endpoints when upstream data is stale.

---

## Deployment Concerns

**Environment variable management:**
- File: `.env.example`
- Issue: Provides clear examples, but `docker-compose.yml` expects `.env` to exist. If `.env` is missing, Docker Compose may inject empty strings rather than fail loudly. The backend then raises `RuntimeError` for missing `ADMIN_API_KEY`/`METRICS_PASSWORD`, which is good defensive behavior.
- Fix: Add a startup validation script (`scripts/check_env.py`) that verifies all required vars are present and non-empty.

**Docker health checks exist but are basic:**
- Files: `docker-compose.yml` lines 16–21, `backend/Dockerfile` lines 33–34, `backend/api/health.py`
- Issue: The backend has `/api/health` and Docker healthchecks. The frontend container has no healthcheck. The backend healthcheck only checks DB, HKO reachability, and disk space. It does not verify that the scheduler is running or that the last HKO poll succeeded.
- Fix: Add a "last successful poll within 20 minutes" check to the health endpoint.

**Frontend hot-reload volumes in production risk:**
- File: `docker-compose.yml` lines 34–41
- Issue: The frontend service mounts host source directories (`./src:/app/src:ro`). If this compose file is used in production accidentally, it exposes the host filesystem.
- Fix: Create a separate `docker-compose.prod.yml` without volume mounts, and document the dev-only nature of the main file.

**SQLite volume is host-local only:**
- File: `docker-compose.yml` line 15
- Issue: `climateshield_data` is a named Docker volume. It is persistent on the host but not backed up. A `docker volume prune` or accidental compose down + volume removal destroys the database.
- Fix: Document a backup strategy (e.g., cron job calling `/api/admin/export`) or switch to a managed database.

---

## Highest Complexity Areas

**Weather Orchestrator (590 lines, god module):**
- File: `backend/services/weather_orchestrator.py`
- Responsibilities: HKO JSON parsing, WBT/HNE calculation, Open-Meteo extension, database persistence, alert generation, counter updates, risk outlook computation, hot-night window logic, and daily HNE batch checking.
- Risk: High coupling makes unit testing difficult and increases the chance of regressions when modifying any single flow.
- Safe modification: Extract `parsers.py`, `persisters.py`, and `alert_manager.py` before adding new data sources.

**Risk scoring v2 formula (6 configurable parameters):**
- Files: `backend/services/climate/scoring_v2.py`, `backend/services/risk_config_service.py`
- Complexity: The formula `min(30, (W + H + V) × M)` with configurable thresholds, multipliers, a T8 floor rule, and fuzzy string matching on HKO warning types. Validation is comprehensive (196 lines) but the runtime matching relies on substring checks (`"signal no. 8" in w_type`), which is brittle if HKO rephrases warning text.
- Risk: A misconfigured formula can silently cap all scores at 30 or push every reading to "Purple".
- Safe modification: Any change to `scoring_v2.py` must be paired with a unit test running the `DEFAULT_CONFIG` scenarios.

**Hot night tracking across time zones:**
- Files: `backend/services/weather_orchestrator.py` lines 295–308, 463–525
- Complexity: The night window is defined as HK local time (UTC+8) 20:00–07:59. The code converts UTC to HK, computes window boundaries, then converts back to UTC for DB queries. The daily HNE check runs at 08:30 HK time and looks back 12 hours. Timezone arithmetic is easy to get wrong during DST transitions (HK does not observe DST, which is good, but the code does not document this assumption).
- Risk: If the server timezone or scheduler drift changes, the 12-hour window calculation may miss readings or double-count them.
- Safe modification: Add explicit unit tests for boundary times (e.g., 19:59 HK, 20:00 HK, 07:59 HK, 08:00 HK).

---

## Known Issues

**Bug: `NameError` in `/weather/trends` endpoint:**
- File: `backend/api/weather.py` line 410
- Code: `consecutive = get_current_consecutive_hot_nights(db, statn, date_str)`
- Problem: `statn` is not defined in the `get_weather_trends` function scope (it aggregates readings across all stations by date, not per station). This will raise `NameError: name 'statn' is not defined` whenever `peak_wbt` and `avg_rh` are both non-None.
- Fix: Remove the per-station hot-night lookup from the trends endpoint, or aggregate by station first.

**Bug: `KeyError` accessing `crs["risk_level"]` instead of `crs["state"]`:**
- Files: `backend/api/weather.py` lines 293, 417, 461
- Code: `"risk_level": crs["risk_level"] if crs else "Low"`
- Problem: `compute_risk_score_v2` returns `{"value": ..., "state": ..., ...}`. The key is `"state"`, not `"risk_level"`. This raises `KeyError` on the `/history` and `/trends` endpoints whenever a composite risk score is present.
- Fix: Replace all `crs["risk_level"]` with `crs["state"]`.

**Workaround: Forecast risk scores ignore consecutive hot nights:**
- File: `backend/services/weather_orchestrator.py` line 397
- Code: `crs = compute_risk_score_v2(wbt, 0, warnings, risk_cfg)`
- Problem: The comment admits this is a placeholder. Forecasts always use `0` for consecutive nights, so multi-day heat-streak risk is under-reported in the 9-day outlook.
- Fix: Pass the projected consecutive count based on existing hot-night data and forecast temps.

**Workaround: `SessionLocal()` created inside async Open-Meteo method:**
- File: `backend/services/weather_orchestrator.py` line 103
- Problem: `get_extended_forecast` opens a new SQLAlchemy session via `SessionLocal()` because it doesn't receive `db` as an argument. This session is never explicitly closed in that path.
- Fix: Pass the existing `db` session into the method, or use a context manager.

**Workaround: Seed failure is treated as non-critical:**
- File: `backend/main.py` lines 33–36
- Problem: If the initial HKO seed fails at startup, the database remains empty. The `/weather/current` endpoint will return `[]` until the scheduler runs (up to 10 minutes later). First-time users may see a blank dashboard.
- Fix: Retry the seed 2–3 times with backoff before yielding in the lifespan.

---

*Concerns audit: 2026-05-14*
