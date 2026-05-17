# Project Research Summary

**Project:** ClimateShield v1.1 — Risk Score Pipeline Reliability
**Domain:** Real-time climate risk scoring dashboard with external API data pipeline
**Researched:** 2026-05-17
**Confidence:** HIGH

## Executive Summary

ClimateShield is a safety-critical climate risk dashboard used by frontline outreach workers in Hong Kong. The core problem is a null-propagation pipeline bug where missing HKO humidity data cascades through WBT computation into `composite_risk_score`, ultimately displaying "0.0/30 Safe" on the UI when conditions may actually be hazardous. Six root causes were identified across the backend pipeline, API layer, and frontend rendering. This is not a cosmetic issue — a false-zero risk score is life-threatening for teams making deployment decisions.

The recommended approach is a **dual-layer CRS guarantee**: compute and persist risk scores at write time as the primary source (enforcing the invariant `WBT != None → CRS != None`), with a shared `ensure_crs()` safety net at read time that catches any null rows that slipped through. This requires unifying the split risk vocabulary (old Critical/High/Moderate/Low vs. new Safe/Low/Yellow/Red/Purple) via a canonical `RiskState` enum, adding `DataUnavailable` as an explicit state for genuinely missing temperature data, and replacing all `x or 70.0` truthy-fallback anti-patterns with explicit `is not None` checks. Only two new dependencies are needed: structlog for structured JSON logging and Zod for frontend API response validation.

The key risks are: (1) the RH=70% humidity fallback produces plausible-looking but estimated scores that users can't distinguish from real measurements — tracking `is_estimated` is mandatory, not optional; (2) the forecast pipeline's `max_temp or 30.0` default silently injects a dangerous-domain-value phantom risk score; (3) on-the-fly CRS recomputation in some endpoints diverges from persisted scores because it uses current warnings/hot-nights data instead of historical data. All three must be addressed in the first phase to avoid replacing visible bugs with invisible ones.

## Key Findings

### Recommended Stack

The existing FastAPI + SQLAlchemy + Pydantic 2 + React stack is sound — no framework changes needed. The fix requires adding validation at data boundaries and structured observability, not replumbing the architecture.

**Core technologies (already in place):**
- **FastAPI 0.129.0**: API framework — add stricter `response_model` nullable handling
- **SQLAlchemy 2.0.46**: ORM — add CHECK constraints on `risk_level` column
- **Pydantic 2.12.5**: Schema validation — extend with `model_validator`, `field_validator`, `computed_field` (zero new deps)
- **httpx 0.27.0**: Async HTTP client — add response validation layer on top
- **APScheduler 3.11.0**: Scheduled polling — correct for single-machine scale, no Celery needed

**New additions (2 dependencies only):**
- **structlog 24.4.0+**: Structured JSON logging — makes null-propagation events queryable in Docker logs
- **Zod 3.24.2**: Runtime validation of API responses in TypeScript frontend — catches null CRS at fetch boundary

**Explicitly NOT recommended:** marshmallow (redundant with Pydantic), pandera (DataFrame-focused, overkill), OpenTelemetry/Prometheus (premature for single-machine), Sentry (overkill), Celery/Redis (massive overkill for 10-min polling), PostgreSQL migration (null-handling is a code bug, not a DB limitation).

### Expected Features

**Must have (table stakes) — P1 for v1.1:**
- **Never show 0.0/30 when data is missing** — false-zero is life-threatening for frontline workers
- **Missing-data indicator replaces null scores** — show "---" / gray badge, not "0.0"
- **WBT computed even when humidity is missing** — RH=70% fallback enforced at all 3 entry points
- **Unified risk vocabulary everywhere** — eliminate Critical/High/Moderate/Low from all code paths
- **API never returns null CRS when temp data exists** — on-the-fly recomputation as safety net
- **Stale data indicator** — show when displayed score is >30 minutes old

**Should have (competitive) — P2 for v1.2:**
- **Risk score confidence indicator** — `realtime` / `estimated` / `stale` field on API responses
- **Pipeline health audit trail** — structured log of null-handling events for debugging
- **Circuit breaker for HKO outages** — stop hammering API after extended failures

**Defer (v2+):**
- **RH fallback accuracy band** — significant UX design for uncertainty display
- **Historic DB row vocabulary migration** — read-time translation is safer than backfill
- **Multi-city expansion** — single-city focus is a deliberate constraint

### Architecture Approach

The critical architecture decision is the **dual-layer CRS guarantee**: persist-time computation as primary source (preserving historical integrity), read-time recomputation as safety net (catching any nulls that slipped through). A single shared `ensure_crs()` function replaces the current duplicated recomputation logic across 4+ endpoints. A canonical `RiskState` enum with `normalize_risk_level()` eliminates vocabulary drift at both the code and serialization boundaries via Pydantic `@computed_field`.

**Major components:**
1. **`vocabulary.py`** — Canonical `RiskState` enum (Safe/Low/Yellow/Red/Purple/DataUnavailable) + V1→V2 mapping + `normalize_risk_level()` — zero dependencies, foundation for everything else
2. **`crs_resolver.py`** — Shared `ensure_crs()` function for all API endpoints — single authority for CRS resolution, replaces 4+ duplicated implementations
3. **`hko_validation.py`** — Pydantic models for HKO API response shape validation at parse boundary — catches malformed HKO JSON before it enters the pipeline
4. **`weather.ts` (Zod schemas)** — Frontend API response validation at fetch boundary — catches null CRS before React rendering
5. **`risk.py` refactor** — Delete `risk_level_from_wbt()` and `risk_level_from_max_temp()`, route all callers through scoring_v2

### Critical Pitfalls

1. **RH=70% fallback masks missing data** — Without an `is_estimated` flag, fallback and measured 70% humidity are indistinguishable. Adding the fallback without tracking replaces a visible bug (0.0/30) with an invisible bug (plausible-but-wrong score). **Prevention:** Add `is_estimated` boolean column; propagate through API and UI.

2. **On-the-fly recomputation diverges from persisted scores** — `/current` recomputes using today's warnings, `/history` uses persisted values, `/trends` mixes both. Same reading produces different scores across views. **Prevention:** Persist-time computation as primary; read-time recomputation only as null-safety net; add audit log.

3. **`risk_level_from_wbt` is a vocabulary time bomb** — Still returns Critical/High/Moderate/Low in 3 call sites; writes old vocabulary to DB and SystemAlert tables. **Prevention:** Delete function; route all callers through `compute_risk_score_v2` + `normalize_risk_level()`.

4. **`max_temp or 30.0` injects phantom risk scores** — 30°C is a high-risk domain value, not a safe neutral default. Missing forecast days get Yellow-range scores that never existed in HKO data. **Prevention:** Skip days with null max_temp, never substitute domain-meaningful defaults.

5. **`rh or 70.0` breaks on humidity=0** — Python truthiness treats 0 the same as None. **Prevention:** Replace all `x or 70.0` with `x if x is not None else 70.0`.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Vocabulary Centralization & Data Boundary Validation
**Rationale:** Vocabulary is the foundation — every other change depends on consistent risk level naming. HKO validation at the parse boundary catches bad data before it enters the pipeline. Both have zero external dependencies.
**Delivers:** Canonical `RiskState` enum, `normalize_risk_level()`, V1→V2 mapping, HKO response validation models, Zod schemas on frontend, structlog configuration
**Addresses:** Unified risk vocabulary (table stakes), never-show-0.0 (foundation)
**Avoids:** Pitfall 3 (vocabulary time bomb) — eliminates old vocabulary at the code level; Pitfall 1 (fallback masking) — sets up is_estimated tracking
**Stack:** Pydantic model_validator/field_validator/TypeAdapter (built-in), Zod 3.24.2, structlog 24.4.0+

### Phase 2: CRS Guarantee Pipeline (Write + Read)
**Rationale:** With vocabulary established as the authority, fix the pipeline itself — enforce the `WBT != None → CRS != None` invariant at persist time and add the shared `ensure_crs()` safety net at read time. Replace all `x or 70.0` anti-patterns and `max_temp or 30.0` phantom defaults.
**Delivers:** Hardened `persist_weather_data()` with RH fallback tracking (`is_estimated`), `ensure_crs()` resolver for all endpoints, elimination of truthy-fallback anti-patterns, forecast skip for null max_temp
**Addresses:** WBT null fallback (table stakes), API never returns null CRS (table stakes), never-show-0.0 (pipeline side)
**Avoids:** Pitfall 1 (fallback masking — adds `is_estimated`), Pitfall 2 (score divergence — single `ensure_crs()` authority), Pitfall 4 (null→0.0), Pitfall 5 (max_temp or 30.0), Pitfall 6 (rh or 70.0 truthy bug)
**Stack:** Pydantic computed_field for normalized risk_level serialization

### Phase 3: Legacy Code & Frontend Cleanup
**Rationale:** With the pipeline fixed and guaranteed, eliminate all remaining v1 vocabulary from code — delete `risk_level_from_wbt`/`risk_level_from_max_temp`, update alert generation, fix frontend `RiskGrid.tsx`/`StationDetailModal.tsx` color maps, rewrite `control-plane/` types and data hooks.
**Delivers:** Deletion of legacy risk functions, unified frontend RiskLevel type, control-plane v2 alignment, `DataUnavailable` UI state (gray badge, "---" gauge)
**Addresses:** Unified risk vocabulary (frontend), missing-data UI indicator (table stakes), stale data freshness badge
**Avoids:** Pitfall 3 residual (DB still has old vocab — but Pydantic computed_field normalizes at read time)
**Stack:** Zod runtime validation for API responses, structured logging for vocabulary migration audit

### Phase 4: Data Integrity & DB Migration
**Rationale:** With code fixed, address the historical data — backfill NULL CRS rows where WBT exists, migrate old vocabulary strings in DB, add CHECK constraints, and verify end-to-end that all endpoints agree on scores.
**Delivers:** DB migration for old-vocabulary rows, NULL CRS backfill, CHECK constraint on risk_level, retention policy for growing readings table
**Addresses:** Graceful degradation wiring (P2), pipeline audit trail foundation
**Avoids:** Pitfall 2 residual (verify on-the-fly vs persisted score agreement), performance trap (growing table without retention)

### Phase Ordering Rationale

- **Vocabulary first (Phase 1)** because vocabulary unification blocks the audit trail, blocks CRS recomputation (recomputed scores must use v2 labels), and is a prerequisite for `ensure_crs()` which must output v2 vocabulary.
- **Pipeline fix second (Phase 2)** because it depends on vocabulary.py being established and it's the highest-value change — it eliminates the 0.0/30 bug at the source.
- **Legacy cleanup third (Phase 3)** because frontend changes depend on the API guarantee from Phase 2; and deleting `risk_level_from_wbt` is safe only after all endpoints guarantee v2 output.
- **DB migration last (Phase 4)** because it's lower urgency — Pydantic computed_field normalizes old values at read time during Phases 2-3, so the DB can contain mixed vocabulary temporarily without affecting users.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** HKO API response shape validation — needs to verify exact JSON structure of rhrread/fnd/warnsum endpoints against live API (current research based on codebase parsing, not direct API docs)
- **Phase 2:** `is_estimated` column — needs schema migration strategy consideration (Alembic? manual SQL?) and backfill heuristic for existing rows
- **Phase 4:** DB backfill migration for historical NULL CRS — needs performance testing with actual data volume; may need batch processing strategy

Phases with standard patterns (skip research-phase):
- **Phase 1 (vocabulary.py + Zod):** Enum + normalizer pattern is well-documented; Zod schema definition is straightforward
- **Phase 3 (frontend cleanup):** Standard React/TypeScript type refactoring; color map alignment

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Stack already in production; only 2 new lightweight deps (structlog, Zod). Pydantic validators use built-in features of already-installed v2.12.5. Verified against Context7 docs. |
| Features | HIGH | Deep codebase audit identified 6 specific root causes with line numbers. Feature dependencies mapped. Existing infrastructure to leverage documented. Competitor analysis validates approach. |
| Architecture | HIGH | Dual-layer CRS guarantee derived from codebase analysis. Architecture patterns verified against FastAPI/Pydantic v2 docs. Build order based on dependency analysis. Scaling considerations addressed. |
| Pitfalls | HIGH | Every pitfall traced to actual code paths with file:line references. Recovery strategies documented. "Looks Done But Isn't" checklist catches common incomplete fixes. |

**Overall confidence:** HIGH

### Gaps to Address

- **HKO API response shape:** Validation models based on reverse-engineering from codebase parsing, not official HKO API documentation. Verify against live API responses during Phase 1 planning.
- **`is_estimated` backfill heuristic:** Cannot perfectly distinguish fallback RH=70% from measured RH=70% in historical data. Use station-based heuristic (non-Observatory stations with RH=70.0 are likely fallback) — accept ~90% accuracy.
- **Control-plane 0-100 scale rewrite:** `useControlPlaneData.ts` maps a completely different 0-100 scale to its own risk vocabulary. Migration path needs design — it's not a simple string replacement.
- **DB migration tooling:** No Alembic or migration framework is currently in use. Need to decide between adding Alembic or using manual SQL scripts for the CHECK constraint and vocabulary backfill.
- **Concurrent refresh protection:** Manual `/refresh` endpoint has no concurrency guard against scheduled polls. Race condition risk needs addressing — either add a lock or queue refreshes.

## Sources

### Primary (HIGH confidence)
- `/pydantic/pydantic` — model_validator, field_validator, TypeAdapter, model_validate, computed_field, from_attributes
- `/colinhacks/zod` — safeParse, nullable handling, z.infer for TypeScript types
- `/fastapi/fastapi` — response_model validation, middleware patterns, exception handling
- `/hynek/structlog` — JSON renderer, stdlib integration, FastAPI-compatible configuration, contextvars
- ClimateShield codebase: full analysis of weather_orchestrator.py, wbt.py, risk.py, scoring_v2.py, weather.py API, scheduler.py, schemas.py, models.py, RiskScoreGauge.tsx, riskStates.ts, api.ts

### Secondary (MEDIUM confidence)
- TanStack Query docs (Context7) — `placeholderData` / `keepPreviousData` patterns for avoiding blank states
- Weather.gov, Met Office, BoM — reference implementations for public weather dashboard null-handling patterns (based on public-facing UI observation, not code access)
- SQLAlchemy null handling semantics for Float columns
- Python truthiness documentation for `or` vs `is not None` distinction

### Tertiary (LOW confidence)
- HKO Open Data API exact response shapes — inferred from codebase parsing, not verified against live API or official schema docs
- SQLite concurrent write behavior under scheduler + manual refresh overlap — theoretical analysis, not load-tested
- Open-Meteo hourly API consistency guarantees — based on codebase integration code, not official docs

---
*Research completed: 2026-05-17*
*Ready for roadmap: yes*