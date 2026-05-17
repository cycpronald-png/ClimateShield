# Concerns — ClimateShield

**Analysis Date:** 2026-05-17

## Critical Concerns

**Frontend risk-score calculation diverges from backend v2 formula:**
- Files: `src/hooks/useControlPlaneData.ts` lines 55–71 vs `backend/services/climate/scoring_v2.py`
- Issue: The frontend Control Plane computes a 0–100 composite score using hardcoded threshold bands (`wbt < 28 → 0–20`, `28–29 → 20–40`, etc.) and adds `rhBonus` and `hneBonus`. The backend uses the 0–30 scoring formula `(W + H + V) × M` with DB-configurable thresholds. The two systems produce fundamentally different numbers and risk levels. The frontend "Moderate" (40–69 on 0–100) does not map to the backend "Yellow" (17–22 on 0–30). Users see inconsistent data across views.
- Impact: High — core product metric is unreliable; NGO workers may receive contradictory signals.
- Fix: Replace the frontend inline calculation with a call to `GET /weather/live-score` for each monitored station, or re-implement the v2 formula client-side using the public risk config from `GET /weather/risk-config`.

**Synthetic history in Control Plane is noise, not data:**
- File: `src/hooks/useControlPlaneData.ts` lines 89–92
- Code: `Array.from({ length: 7 }, (_, i) => { const variation = Math.sin(i) * 5; return Math.max(0, Math.min(100, compositeScore + variation)); })`
- Issue: The sparkline history is generated from a sine wave applied to the current score. It is not real historical data. Users may interpret these trends as genuine.
- Impact: High — misleading visual information for decision-making.
- Fix: Fetch actual history from `GET /weather/history?days=7` or remove the sparkline.

## Technical Debt

**Legacy scoring.py is a dead re-export:**
- File: `backend/services/climate/scoring.py` (15 lines)
- Issue: Contains only a re-export `from backend.services.climate.scoring_v2 import compute_risk_score_v2`. All old functions removed but file retained "so existing imports don't break." No code imports from `scoring.py` directly — everything either imports from `scoring_v2.py` or via `climate_engine.py`.
- Files: `backend/services/climate_engine.py` line 24 already imports from `scoring_v2`
- Impact: Minimal now, but confusing for developers who encounter the file.
- Fix: Delete `scoring.py` and update any remaining imports.

**climate_engine.py is a pure re-export wrapper:**
- File: `backend/services/climate_engine.py` (29 lines)
- Issue: Contains zero logic — only `from backend.services.climate.X import Y  # noqa: F401`. Every consumer could import directly from the domain modules. The comment says "New code should prefer importing directly from the domain modules" but the codebase still imports from `climate_engine` in 4 files.
- Files: `backend/services/weather_orchestrator.py` lines 19–31, `backend/api/weather.py` line 31
- Impact: Creates two import paths for the same API, increasing confusion.
- Fix: Migrate imports to the domain modules, then delete `climate_engine.py`.

**`_is_hk_night_window` has an off-by-one boundary:**
- File: `backend/services/weather_orchestrator.py` line 306
- Code: `return hk_dt.hour >= 20 or hk_dt.hour <= 7`
- Issue: The night window definition says "20:00–07:59 inclusive." The check `hour <= 7` includes 07:00–07:59 correctly, but a reading at exactly 08:00 would be excluded (correct). However, a reading at hour=7 minute=59 is included but hour=8 is excluded — this is correct per the spec. The real concern is that `_get_night_window_start` (lines 309–316) uses `hour=20, minute=0` as the window start, but the DB query on line 348 uses `>= window_start` which would include the starting 20:00 reading. These are consistent but undocumented.
- Impact: Low — HK has no DST so boundary drift is not a risk, but timezone assumptions are not explicit.
- Fix: Add a docstring comment explicitly stating HK does not observe DST and the window boundaries.

**agent_event_bus.py is a stub:**
- File: `backend/services/agent_event_bus.py` (16 lines)
- Issue: All functions are stubs — `emit_agent_log` just logs to standard logger, `get_recent_events` returns `[]`, `event_generator` is an empty generator. The "Agent Council" concept was removed but the module remains.
- Impact: Every scheduler call passes through this stub with no functional effect.
- Fix: Either remove the module and replace `emit_agent_log` calls with direct `logger.info`, or implement basic in-memory event storage for the /agents/stream endpoint.

## Architecture Smells

**WeatherOrchestrator is a god module (625 lines):**
- File: `backend/services/weather_orchestrator.py`
- Responsibilities: HKO JSON parsing (3 parse functions), WBT/HNE enrichment, Open-Meteo extension, database persistence of readings/forecasts/warnings, alert generation, counter updates, risk outlook computation, hot-night window logic, daily HNE batch checking, and warning lifecycle management.
- Coupling: Depends on `hko_client`, `open_meteo_client`, `counters`, `climate_engine` (7 functions), `risk_config_service`, `models`, and `SessionLocal`.
- Risk: Any change to parsing, persistence, alerts, or scoring ripples through this one file. Unit testing requires mocking all 7+ dependencies.
- Fix: Extract into `parsers.py` (HKO JSON parsing), `persisters.py` (DB writes + counter increments), and `alert_manager.py` (alert deduplication + lifecycle).

**weather.py API router is 788 lines with duplicated logic:**
- File: `backend/api/weather.py`
- Issue: The `/history` endpoint (lines 234–360) and `/trends` endpoint (lines 505–631) share nearly identical aggregation logic — grouping readings by date, computing peak_wbt, avg_rh, HNE fallback, and composite risk score recomputation. Both contain the same `if persisted_score is not None ... elif peak_wbt is not None and avg_rh is not None ...` block.
- Risk: Bug fixes applied to one path may be missed in the other.
- Fix: Extract a shared `build_daily_aggregate(group, db)` helper function.

**State ranges have intentional overlap (Purple 25–30, Red 23–26):**
- File: `backend/services/risk_config_service.py` lines 38–43
- Code: `{"name": "Red", "min": 23, "max": 26}` and `{"name": "Purple", "min": 25, "max": 30}`
- Issue: Scores 25 and 26 are in both Red and Purple ranges. The `lookup_state` function resolves this by checking Purple first (priority order), but the overlap is non-obvious and the `validate_risk_config` function enforces "no gaps" by requiring `s["min"] == prev["max"] + 1`, which would reject this overlap.
- Impact: Contradiction between the default config (overlap) and the validator (no overlap). Custom configs cannot have overlaps. The current default config passes validation only because the sorted check would flag it.
- Fix: Either make ranges non-overlapping (Red 23–24, Purple 25–30) or update the validator to allow intentional overlaps when a priority order is specified.

## Security Concerns

**Admin donation endpoint has no auth:**
- File: `backend/api/admin.py` lines 254–268
- Issue: `GET /api/admin/donations` and `GET /api/admin/donations/{pledge_id}` have no password check, no API key dependency, and no `@limiter.limit`. The `auth` module exists (`backend/auth.py`) but is never imported in `admin.py`. Any unauthenticated user can list all donation pledges including donor names, emails, phone numbers, and company affiliations.
- Impact: Critical — PII exposure.
- Fix: Add `Depends(auth.get_api_key)` or the admin password check to these endpoints.

**Admin export endpoint has no auth:**
- File: `backend/api/admin.py` lines 34–128
- Issue: `GET /api/admin/export` dumps the entire database (all weather readings, forecasts, warnings, alerts, counters, and all donation data with PII) to JSON. No authentication required.
- Impact: Critical — full database exfiltration including donor PII.
- Fix: Add authentication. Same for `POST /api/admin/import`.

**Donor pledge endpoint has no rate limiting:**
- File: `backend/api/donor.py` lines 9–17
- Issue: `POST /api/donor/pledge` is completely open — no auth, no rate limit, no CAPTCHA. Can be abused for spam submissions or denial-of-service.
- Impact: Medium — no protection against automated abuse.
- Fix: Add `@limiter.limit("5/minute")` and consider adding a CAPTCHA or honeypot field.

**Alert acknowledgment has no auth:**
- File: `backend/api/weather.py` lines 704–718
- Issue: `POST /weather/alerts/{alert_id}/ack` allows any unauthenticated user to dismiss system alerts. An attacker could acknowledge all alerts, hiding critical heat warnings from NGO workers.
- Impact: Medium — alert suppression attack.
- Fix: Require admin auth for alert acknowledgment.

**State ranges validation inconsistency with default config overlap:**
- File: `backend/services/risk_config_service.py` lines 134–159
- Issue: `validate_risk_config` at line 155 requires `s["min"] == prev["max"] + 1`, enforcing no overlaps. But `DEFAULT_CONFIG` (lines 38–43) has overlapping Red (23–26) and Purple (25–30). Calling `validate_risk_config(DEFAULT_CONFIG)` would raise ValueError. Yet `reset_risk_config` (line 187–196) creates a config from `DEFAULT_CONFIG` without calling `validate_risk_config`.
- Impact: The default configuration is never validated. If `upsert_risk_config` is called with the default config, it will fail.
- Fix: Either make DEFAULT_CONFIG non-overlapping (Red 23–24, Purple 25–30) or update the validator to support overlap resolution with priority ordering.

## Performance Concerns

**N+1 query pattern in night-window HNE calculation:**
- File: `backend/services/weather_orchestrator.py` lines 346–351
- Code: Inside `for r in readings:`, each iteration queries `db.query(models.WeatherReading).filter_by(station=r["station"]).filter(...).all()`. For ~20 stations, this generates ~20 separate DB queries per persistence cycle.
- Impact: Medium — increases DB load on every 10-minute poll.
- Fix: Batch the query with `station IN (...)` and build a dict before the loop.

**Repeated risk-config DB hits inside request handlers:**
- File: `backend/api/weather.py` lines 302, 559, 610
- Issue: `get_active_risk_config(db)` is called inside per-date loops in `/history`, `/trends` backward, and `/trends` forward. The config rarely changes; each call is a `SELECT ... WHERE is_active = True ... ORDER BY id DESC LIMIT 1` query.
- Impact: Medium — for `/history?days=90`, this could be 90+ identical queries.
- Fix: Call `get_active_risk_config(db)` once at the top of the endpoint and pass the result through.

**Unbounded database export:**
- File: `backend/api/admin.py` line 56
- Code: `db.query(WeatherReading).all()` — loads every row into memory.
- Issue: With ~2,880 readings/day, the table grows ~85K rows/month. After 6 months, an export consumes hundreds of MB of RAM.
- Impact: Medium — eventual OOM in production.
- Fix: Stream records using a generator-based JSON encoder or paginate the export.

**No data retention policy:**
- Files: `backend/models.py`, `backend/services/scheduler.py`
- Issue: `WeatherReading` rows accumulate indefinitely (~2,880/day × 365 = ~1M rows/year). No scheduled job purges old data. SQLite file size grows unbounded.
- Impact: Medium — degrading query performance over time, especially the `recorded_at`-filtered queries.
- Fix: Add a monthly cron job to archive readings older than 90 days and delete from the main table.

**Counter increment commits per call inside loops:**
- File: `backend/services/counters.py` line 37
- Code: `db.commit()` inside `increment_counter`, called multiple times in `persist_weather_data`.
- Issue: Each `increment_counter` call commits the transaction. In `persist_weather_data` (lines 456–465), 5–6 counter increments happen, each causing a separate commit inside an already-open transaction from the orchestrator.
- Impact: Low — SQLite WAL mitigates write contention, but unnecessary fsync pressure.
- Fix: Accumulate counter changes and commit once at the end of `persist_weather_data`.

## Reliability Concerns

**Silent failure on hot-night persistence produces stale risk scores:**
- File: `backend/services/weather_orchestrator.py` lines 369–371
- Code: `try: persist_hot_night_counts(db, today_hk) except Exception: logger.exception("Failed to persist hot night counts")`
- Issue: If `persist_hot_night_counts` fails, the function continues to compute risk scores using `get_current_consecutive_hot_nights`, which reads from the `ConsecutiveHotNights` table. If that table is stale, consecutive counts are wrong, producing incorrect `(W + H + V) × M` scores that get committed to the DB.
- Impact: High — incorrect risk scores are persisted and displayed to NGO workers.
- Fix: If hot-night persistence fails, set `risk_level = "Unknown"` and `composite_risk_score = None` for all readings, or skip the entire persist cycle.

**Scheduler jobs silently swallow all exceptions:**
- File: `backend/services/scheduler.py` lines 41–43, 58–60, 78–80, 101–103
- Issue: Every job catches `Exception`, logs it, and continues. No alerting, no retry beyond the one explicit retry in `_scheduled_refresh`, no monitoring integration.
- Impact: Medium — a failing HKO poll could go unnoticed for hours if the log is not actively monitored.
- Fix: Add an "unhealthy" flag to the health endpoint that checks `last_refresh` success and age. Integrate with an error-tracking service.

**HKO fetch failures return empty data to users:**
- File: `backend/services/hko_client.py` lines 86–92
- Issue: HTTP or request errors return `None`. The orchestrator sees `raw.get("current")` as falsy and persists zero readings. The `/weather/current` endpoint returns `[]` with HTTP 200, not HTTP 503. Users see an empty dashboard with no explanation.
- Impact: Medium — silent data gaps during HKO outages.
- Fix: Return HTTP 503 when data is stale (e.g., no readings in last 20 minutes), and surface the last-fetch error in the response.

**Seed failure at startup leaves DB empty:**
- File: `backend/main.py` lines 33–36
- Code: `try: await seed_weather_data() except Exception: logger.exception("Seed failed (non-critical)")`
- Issue: If the initial HKO seed fails, the DB is empty and the scheduler won't run its first poll for up to 10 minutes. First-time users see a blank dashboard.
- Impact: Low — transient on startup, but bad first impression.
- Fix: Retry the seed 2–3 times with exponential backoff before yielding.

**Open-Meteo `get_extended_forecast` creates leaky session:**
- File: `backend/services/weather_orchestrator.py` lines 102–108
- Code: `db_session = SessionLocal()` inside a `try/finally` block that calls `db_session.close()`. But if an exception occurs between lines 104 and 107 before `finally`, and the `finally` block itself fails, the session leaks. More importantly, this method does not receive the caller's `db` session, creating a separate transaction that commits independently.
- Impact: Low — session is closed in `finally`, but the separate transaction can write stale risk config.
- Fix: Pass `db: Session` as a parameter to `get_extended_forecast`.

## Maintainability Concerns

**Duplicate HNE fallback logic in two endpoints:**
- Files: `backend/api/weather.py` lines 279–287 (`/history`) and lines 536–544 (`/trends`)
- Code: Nearly identical block: `temps_ordered = [r.temp_c for r in sorted(group, ...) if r.temp_c is not None]; hne = calculate_hne(temps_ordered) if len(temps_ordered) >= 3 else 0.0`
- Fix: Extract into a shared helper `compute_hne_from_group(group)`.

**Duplicate risk-score recomputation in three code paths:**
- Files: `backend/api/weather.py` lines 299–305 (`/history`), lines 556–562 (`/trends` backward), lines 608–616 (`/trends` forward)
- Code: Same pattern — check persisted score, fallback to `compute_risk_score_v2(peak_wbt, consecutive, [], risk_cfg)`.
- Fix: Extract into `build_daily_aggregate(group, db, risk_cfg)`.

**Duplicate forecast streak projection logic:**
- Files: `backend/api/weather.py` lines 610–616 (`/trends` forward) and `backend/services/weather_orchestrator.py` lines 424–427
- Code: Both implement temperature-aware hot-night streak projection: `if min_temp >= 28: current_streak += 1 else: current_streak = 0`.
- Fix: Extract into a shared `project_hot_night_streak(forecasts, initial_streak)` function in `backend/services/climate/hot_nights_tracker.py`.

**Fragile threshold access via `__defaults__`:**
- File: `backend/services/weather_orchestrator.py` line 548
- Code: `calculate_hne.__defaults__[0]` — retrieves the default threshold (28.0) by positional index.
- Fix: Import and use the `HNE_THRESHOLD` constant from `backend/services/climate/hne.py` (already exported as `HNE_THRESHOLD = 17.7` for the extreme check, but the base threshold of 28.0 is positional-only).

**Broad `except Exception` blocks (20 occurrences):**
- Files: Backend Python modules contain 20 bare `except Exception` handlers.
- Impact: Swallows specific errors (e.g., `KeyError`, `AttributeError`) that should propagate as programming errors. Makes debugging harder.
- Fix: Narrow catch blocks to specific expected exceptions (e.g., `except httpx.HTTPStatusError`, `except OperationalError`).

## Scalability Concerns

**SQLite single-writer limitation:**
- File: `backend/database.py` lines 8–22
- Issue: `NullPool` means no connection reuse; each checkout creates a new connection. SQLite supports only one concurrent writer. If the app scales to multiple worker processes (Gunicorn, Kubernetes replicas), writes will fail with "database is locked."
- Impact: Blocks horizontal scaling beyond a single process.
- Fix: For multi-process deployment, migrate to PostgreSQL. The `DATABASE_URL` env var already supports this. Update `docker-compose.prod.yml` with a PostgreSQL service.

**Polling architecture with no push/SSE for weather updates:**
- Files: `backend/services/scheduler.py`, `src/hooks/useControlPlaneData.ts` line 136
- Issue: Frontend polls every 5 minutes (`setInterval(..., 300000)`). Backend polls HKO every 10 minutes. No WebSocket or SSE channel exists to push updates. With many concurrent frontend clients, each poll hits the DB independently.
- Impact: With 100 concurrent users, 100 DB queries every 5 minutes = ~1,200/hour just for current weather.
- Fix: Add SSE endpoint for real-time weather updates, or add HTTP cache headers (`Cache-Control: max-age=60`) to public weather endpoints.

**WeatherWarning deduplication creates full table scan:**
- File: `backend/services/weather_orchestrator.py` lines 438–453
- Issue: `db.query(models.WeatherWarning).filter(status == "active").all()` loads all active warnings, then iterates to check for duplicates. As warning history grows, this scan becomes expensive.
- Impact: Low currently — warning count is small. But could be problematic if warning types proliferate.
- Fix: Use a targeted query: `db.query(models.WeatherWarning).filter(WeatherWarning.warning_type.in_(current_types)).all()`.

## Recently Fixed

**CORS origins now configurable via env var:**
- File: `backend/main.py` lines 60–68
- Fixed: CORS origins loaded from `CORS_ORIGINS` env var (comma-separated), with localhost as fallback. Previously hardcoded to `["http://localhost:5173", "http://localhost:3000"]`.

**Admin password no longer has hardcoded default:**
- File: `backend/api/admin.py` line 25
- Fixed: `os.getenv("ADMIN_PASSWORD")` with no fallback. Previously `os.getenv("ADMIN_PASSWORD", "climateshield")`.

**Admin password moved from URL query params to HTTP header:**
- Files: `backend/api/admin.py` lines 308–318, `src/services/api.ts` lines 23–28
- Fixed: `GET /api/admin/risk-config` now reads `X-Admin-Password` header instead of `?password=...` query param.

**Rate limiting added via SlowAPI:**
- Files: `backend/limiter.py`, `backend/api/weather.py`
- Fixed: Custom broken rate limiter (Python 3.12 syntax in 3.11 container) replaced with `slowapi`. `POST /weather/refresh` → 3/min, `POST /weather/verify-password` → 5/min.

**Import-time env-var validation moved to request-time:**
- File: `backend/api/admin.py` lines 28–31
- Fixed: `ADMIN_PASSWORD` RuntimeError moved from module import to `_check_admin_password()` function. Prevents Docker boot failures when env vars are injected after import.

**File upload size limit added:**
- File: `backend/api/admin.py` lines 140–150
- Fixed: Import endpoint streams in 64KB chunks with 50MB hard cap.

**Historical scores now use persisted values:**
- Files: `backend/api/weather.py` lines 291–305, 547–562
- Fixed: `/history` and `/trends` endpoints now prefer persisted `composite_risk_score` and `risk_level` from DB rows. Only recompute as fallback when no persisted score exists.

**Days query parameter bounded:**
- File: `backend/api/weather.py` line 236
- Fixed: `days: int = Query(7, ge=1, le=90)` prevents unbounded queries.

**Production Docker Compose added:**
- File: `docker-compose.prod.yml`
- Fixed: No host volume mounts, no hot-reload, named volumes, restart policy `always`.

**Warning deduplication added in orchestrator:**
- File: `backend/services/weather_orchestrator.py` lines 447–453
- Fixed: `existing_active_types = {db_w.warning_type for db_w in active_db_warnings}; new_warnings = [w for w in warnings if w["warning_type"] not in existing_active_types]` prevents duplicate active warnings per type.

**Warning deduplication added in /live-score endpoint:**
- File: `backend/api/weather.py` lines 439–445
- Fixed: Deduplicates warnings by `warning_type` before passing to `compute_risk_score_v2`.

**trigger_h_score fix in v2 scoring:**
- File: `backend/services/climate/scoring_v2.py` line 136
- Fixed: `v = vuln["bonus"] if h >= vuln["trigger_h_score"] else 0` — Vulnerability constant V is now applied when `H >= trigger_h_score` (default: H ≥ 2), correctly matching the Update_For.md spec ("if H ≥ 3 consecutive hot nights" maps to HNE threshold score of 2).

**Forecast hot-night streak projection implemented:**
- Files: `backend/services/weather_orchestrator.py` lines 424–427, `backend/api/weather.py` lines 610–616
- Fixed: Forecasts now project consecutive hot night streaks based on `min_temp >= 28°C` instead of using a hardcoded 0.

## Known Issues

**Frontend Control Plane score does not match backend v2 formula:**
- File: `src/hooks/useControlPlaneData.ts` lines 62–71
- Status: Unfixed. Frontend uses a 0–100 inline calculation that is completely different from the backend's 0–30 `(W + H + V) × M` formula. Risk levels are computed on the wrong scale.
- Workaround: The Risk Intelligence section uses backend-sourced scores. Only the Control Plane grid cards are affected.

**Frontend sparkline history is synthetic sine wave:**
- File: `src/hooks/useControlPlaneData.ts` lines 89–92
- Status: Unfixed. `Math.sin(i) * 5` applied to current score produces fake 7-point trend.

**State ranges overlap in DEFAULT_CONFIG:**
- File: `backend/services/risk_config_service.py` lines 38–43
- Status: Design choice. Red (23–26) and Purple (25–30) overlap at 25–26. `lookup_state` resolves by checking Purple first. But `validate_risk_config` would reject this overlap. Default config is never validated.
- Workaround: Don't call `validate_risk_config(DEFAULT_CONFIG)`; use `upsert_risk_config` for custom configs only.

**Admin donation/export endpoints are unauthenticated:**
- Files: `backend/api/admin.py` lines 34–128, 254–268
- Status: Not secured. Any unauthenticated user can export the entire database or list all donations with PII.
- Priority: Critical.

**Alert acknowledgment is unauthenticated:**
- File: `backend/api/weather.py` lines 704–718
- Status: Not secured. Any user can dismiss critical heat alerts.

**`_is_hk_night_window` midnight boundary undocumented:**
- File: `backend/services/weather_orchestrator.py` line 306
- Code: `hk_dt.hour >= 20 or hk_dt.hour <= 7` — The `or` makes hours 0–7 part of the night even though they belong to the next calendar day. A reading at 03:00 HK on May 17 is considered part of the night window that started May 16 at 20:00. This is correct per the HNE definition but not documented.

**Missing database indexes on composite queries:**
- File: `backend/models.py`
- Issue: `WeatherReading` has individual indexes on `station` and `recorded_at` but no composite index. The orchestrator's night-window query (lines 346–349) filters by `station` AND `recorded_at` range. A composite index `(station, recorded_at)` would significantly improve performance.
- Impact: Medium — night-window queries become full table scans as data grows.

---

*Concerns audit: 2026-05-17*