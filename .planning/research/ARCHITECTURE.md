# Architecture Research: Risk Score Pipeline Reliability

**Domain:** FastAPI+SQLAlchemy data pipeline — null/missing derived field propagation, vocabulary uniformity
**Researched:** 2026-05-17
**Confidence:** HIGH (codebase fully analyzed, patterns verified against FastAPI/Pydantic v2 docs)

## System Overview (Current State)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HKO External APIs                            │
│  rhrread (current)  │  fnd (forecast)  │  warnsum (warnings)        │
└────────┬────────────┴────────┬─────────┴──────────┬─────────────────┘
         │                     │                    │
         ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Weather Orchestrator                              │
│  parse_hko_to_readings()  │  parse_hko_to_forecast()  │  parse_...  │
│       │ compute WBT         │ compute WBT+CRS            │           │
│       │ fallback RH=70%     │ temp-aware streak          │           │
│       │ compute CRS v2      │                            │           │
└───────┼─────────────────────┼────────────────────────────┼───────────┘
        │                     │                            │
        ▼                     ▼                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SQLite Database                                    │
│  weather_readings   │  weather_forecast_days  │  weather_warnings   │
│  composite_risk_score: NULLable     │  composite_risk_score: NULLable│
│  risk_level: NULLable               │  risk_level: NULLable          │
│  wet_bulb_temp_c: NULLable          │  wet_bulb_peak: NULLable       │
└────────┬────────────┴──────────┬────────────────────┴───────────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Endpoints                                  │
│  /current  │  /forecast  │  /risks  │  /history  │  /live-score     │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Read DB  │ │Read DB   │ │Compute │ │Read DB   │ │Recompute     │  │
│  │Patch CRS│ │Pass CRS  │ │on fly  │ │Patch CRS │ │fresh         │  │
│  │if null  │ │as-is     │ │        │ │if null   │ │              │  │
│  └─────────┘ └──────────┘ └────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend                                    │
│  riskStates.ts (Safe/Low/Yellow/Red/Purple)  ─── v2 vocabulary ✓    │
│  RiskGrid.tsx (Critical/High/Moderate)       ─── v1 vocabulary ✗    │
│  StationDetailModal.tsx (Critical/High/Moderate) ─── v1 vocab ✗    │
│  control-plane/types.ts (low/moderate/high/critical) ── different  │
│  useControlPlaneData.ts (0-100 scale)       ─── stale computation   │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Current State | Problem |
|-----------|---------------|---------------|---------|
| `weather_orchestrator.py` | Parse HKO → persist + compute WBT/CRS | Computes CRS at persist time with RH=70% fallback | Partial fix — CRS still null when both temp and RH missing |
| `risk.py` (legacy) | `risk_level_from_wbt()` / `risk_level_from_max_temp()` | Returns Critical/High/Moderate/Low | V1 vocabulary — not v2 Safe/Low/Yellow/Red/Purple |
| `scoring_v2.py` | CRS v2 formula (W+H+V)*M, lookup_state() | Returns Safe/Low/Yellow/Red/Purple | Canonical source of truth for v2 vocabulary |
| `risk_config_service.py` | Manage RiskFormulaConfig + DEFAULT_CONFIG | state_ranges enforce exactly Safe/Low/Yellow/Red/Purple | Validates vocabs at DB level |
| `schemas.py` | Pydantic response models with from_attributes | composite_risk_score: Optional[float] = None | Null leaks through to frontend |
| `/api/weather/current` | Return latest reading per station | On-the-fly CRS patch for null (lines 79-103) | Partial — only patches readings with WBT, not all null scenarios |
| `/api/weather/forecast` | Return forecast days | Passes CRS as-is from DB | No null guard; could return null CRS |
| `/api/weather/live-score` | Recompute CRS fresh from live data | Fallback to RH=70%, recompute WBT | Best pattern but POST-only, 404 when no temp |
| `/api/weather/risks` | 7/9-day risk outlook | Uses `risk_level_from_wbt` (legacy vocab) | Returns Critical/High/Moderate/Low |
| `/api/weather/history` | Historical aggregates | Patches null CRS | Partial — uses "Safe" fallback which may mismatch |
| `/api/weather/trends` | Backward+forward trend data | Patches null CRS | Same partial fix pattern |
| Frontend `riskStates.ts` | Display risk state colors + actions | Uses Safe/Low/Yellow/Red/Purple | Correct v2 vocabulary |
| Frontend `RiskGrid.tsx` | Station risk color map | Maps Critical/High/Moderate | Stale v1 vocabulary — will get "Unknown" colors |
| Frontend `control-plane/` | Separate risk visualization | Uses low/moderate/high/critical | Completely different vocab + 0-100 scale |

## Null CRS Propagation — Root Cause Map

The 6 identified root causes plus their current mitigation status:

```
HKO API
  │
  ├─ RH missing for non-Observatory stations ──────────────────────┐
  │                                                                 │
  ▼                                                                 ▼
parse_hko_to_readings()                                    calculate_wbt()
  │ rh=None for station                                      │ rh=None → return None
  │ fallback to HKO Obs RH                                   │
  ▼                                                         ▼
[Root 1] RH still None after fallback              [Root 2] WBT = None
  │                                                         │
  ▼                                                         ▼
persist_weather_data()                                    DB: wet_bulb_temp_c = NULL
  │ if wbt is None and temp_c: recompute with RH=70%           │
  │ BUT: this wasn't always there                              │
  ▼                                                         ▼
[Root 3] Historical rows with NULL WBT              [Root 4] /live-score 404s on NULL WBT
  │                                                         │
  ▼                                                         │
DB: composite_risk_score = NULL                     /live-score raises HTTPException
  │
  ├──────────────────────────┐
  ▼                          ▼
/current endpoint            /forecast endpoint
  │ returns null as-is         │ returns null as-is
  │ (before fix)              │
  ▼                          ▼
[Root 5] /current returned     Frontend receives
  null CRS → UI shows 0.0      null CRS → falls back
                               to ??? or 0.0
                                ▼
                         [Root 6] UI shows misleading 0.0/30
```

### Current Patch Status

| Root Cause | Mitigated? | Where | Gap |
|------------|-----------|-------|-----|
| RH missing after HKO Obs fallback | Partial | `weather_orchestrator.py` line 378-381 | RH=70% fallback added for persist, but historical rows untouched |
| `calculate_wbt()` returns None on None | Yes | `weather_orchestrator.py` line 378 | Fallback logic added |
| /live-score 404s on NULL WBT | Yes | `/live-score` line 454-456 | Now falls back to RH=70% and recomputes |
| `risk_level_from_wbt` uses v1 vocab | **No** | `risk.py` line 26-36 | Still returns Critical/High/Moderate/Low |
| /current returns null CRS as-is | Partial | `/current` line 79-103 | On-the-fly recomputation added but only for WBT != None |
| UI shows 0.0 when score unknown | **No** | Frontend | No "unknown" / "data unavailable" state |

## Recommended Architecture: Dual-Layer CRS Guarantee

### Core Principle: Persist with Guarantee, Read with Fallback

The fundamental architecture decision: **CRS should be computed at persist time as the primary source, with on-the-fly recomputation at read time as a safety net.** This is not "either/or" — it must be both, for different reasons:

1. **Persist-time computation** ensures historical data integrity — the CRS stored in the DB reflects the risk at the time of measurement, not the risk at the time of query (config may have changed)
2. **Read-time recomputation** catches any rows where persist-time computation failed or was skipped — the safety net that guarantees no null CRS reaches the frontend when temperature data exists

### Pattern 1: Write-Time Guarantee (Persist Layer)

```
                 HKO JSON
                    │
                    ▼
         ┌─────────────────────┐
         │  parse_hko_to_*()   │
         │  Extract raw data   │
         └────────┬────────────┘
                  │
                  ▼
         ┌─────────────────────────────────┐
         │  Enrichment Pipeline             │
         │                                  │
         │  1. WBT = calculate_wbt(T, RH)   │
         │     IF RH is None:               │
         │       RH = HKO Obs fallback (70%)│
         │       Recompute WBT               │
         │     IF WBT still None:            │
         │       WBT = None (cannot compute) │
         │       risk_level = "DataUnavailable" │
         │                                  │
         │  2. CRS = compute_risk_score_v2() │
         │     IF WBT is not None:           │
         │       CRS always computed         │
         │       risk_level from v2 vocab   │
         │     IF WBT is None:               │
         │       CRS = None (genuinely unknown) │
         │       risk_level = "DataUnavailable" │
         │                                  │
         │  INVARIANT: WBT != None → CRS != None │
         │  INVARIANT: CRS always uses v2 vocab │
         └────────┬────────────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  SQLite DB        │
         │  CRS: NULL only   │
         │  when WBT is NULL │
         └──────────────────┘
```

**What:** At persist time, guarantee that `wet_bulb_temp_c != None` implies `composite_risk_score != None`. Use the RH=70% fallback aggressively. If WBT is still None (no temperature data at all), set `risk_level = "DataUnavailable"` explicitly rather than null.

**When to use:** Every `persist_weather_data()` call — the write path.

**Trade-offs:**
- Pro: Historical data reflects risk at measurement time, not query time
- Pro: Query performance — no recomputation needed for hot path
- Pro: Admin config changes don't silently rewrite historical scores
- Con: Cannot retroactively fix old NULL rows without a backfill migration
- Con: Slightly more complex persist logic (but already exists, just needs hardening)

### Pattern 2: Read-Time Safety Net (API Layer)

```python
# New shared utility: backend/services/crs_resolver.py

def ensure_crs(reading: models.WeatherReading, db: Session) -> tuple[float | None, str]:
    """
    Guarantee: if temperature data exists, return a valid CRS.
    
    Returns (composite_risk_score, risk_level) using:
    1. Persisted values (if both present and CRS not null)
    2. On-the-fly recomputation (if CRS null but WBT present)
    3. (None, "DataUnavailable") only when genuinely no temperature data
    
    Always returns v2 vocabulary for risk_level.
    """
    # Fast path: already persisted
    if reading.composite_risk_score is not None and reading.risk_level is not None:
        # Vocabulary fixup: translate any v1 vocab that slipped through
        level = _normalize_risk_level(reading.risk_level)
        return reading.composite_risk_score, level
    
    # WBT exists but CRS missing — recompute
    wbt = reading.wet_bulb_temp_c
    if wbt is None and reading.temp_c is not None:
        rh = reading.humidity_pct or 70.0
        wbt = calculate_wbt(reading.temp_c, rh)
    
    if wbt is not None:
        risk_cfg = get_active_risk_config(db)
        today_hk = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
        consecutive = get_current_consecutive_hot_nights(db, reading.station, today_hk)
        warnings = _get_active_warnings(db)
        result = compute_risk_score_v2(wbt, consecutive, warnings, risk_cfg)
        return result["value"], result["state"]
    
    # No temperature data — genuinely unavailable
    return None, "DataUnavailable"
```

**What:** A single shared function `ensure_crs()` that every API endpoint calls before returning weather data. Implements the guarantee: if WBT exists, CRS exists.

**When to use:** Every API endpoint that returns `composite_risk_score` or `risk_level` to the frontend.

**Trade-offs:**
- Pro: Single authority for CRS resolution — no duplicated logic across endpoints
- Pro: Catches any historical NULL CRS that slipped through persist
- Pro: Forces vocabulary normalization at read time
- Con: Slight query-time cost (risk_cfg + hot_nights lookup for null rows)
- Con: Uses current config for historical recomputation (acceptable: safety > historical exactness)

### Pattern 3: Pydantic Computed Field for Risk Level (Schema Layer)

```python
# Enhanced schemas.py — use computed_field for guaranteed CRS + normalized vocab

class WeatherReadingResponse(WeatherReadingBase):
    id: int
    created_at: datetime
    hne: Optional[float] = None
    nightly_hne: Optional[float] = None
    composite_risk_score: Optional[float] = None
    wet_bulb_peak: Optional[float] = None
    
    @computed_field
    @property
    def risk_level(self) -> str:
        """Normalized risk level using v2 vocabulary.
        Falls back to score-derived state if persisted level uses v1 vocab.
        Returns 'DataUnavailable' when no temperature data exists.
        """
        raw = self._risk_level_raw  # from ORM
        if raw in V2_STATES:
            return raw
        # Derive from score if available
        if self.composite_risk_score is not None:
            # Use config-based lookup
            return _score_to_v2_state(self.composite_risk_score)
        return "DataUnavailable"
    
    model_config = ConfigDict(from_attributes=True)
```

**What:** Use Pydantic `@computed_field` to normalize risk_level at serialization time. This guarantees the frontend receives consistent v2 vocabulary regardless of what's in the DB.

**When to use:** All Pydantic response models that include `risk_level`.

**Trade-offs:**
- Pro: Vocabulary uniformity guaranteed at the serialization boundary
- Pro: Clean separation — DB can have mixed vocab during migration, API always returns v2
- Pro: No DB migration needed for vocab change
- Con: Requires storing raw `risk_level` separately from computed field name
- Con: Computed fields don't work with `response_model_exclude_none=True` easily (need testing)

### Pattern 4: Unified Risk Vocabulary Enum

```python
# New: backend/services/climate/vocabulary.py

from enum import Enum

class RiskState(str, Enum):
    """Canonical risk state vocabulary for ClimateShield v2.
    
    Every API endpoint, DB column, and frontend component MUST use
    these exact values. No synonyms permitted.
    """
    SAFE = "Safe"
    LOW = "Low"
    YELLOW = "Yellow"
    RED = "Red"
    PURPLE = "Purple"
    DATA_UNAVAILABLE = "DataUnavailable"

# Legacy vocabulary mapping for migration
V1_TO_V2_MAP = {
    "Critical": RiskState.PURPLE,
    "High": RiskState.RED,
    "Moderate": RiskState.YELLOW,
    "Low": RiskState.LOW,   # ambiguous — v1 "Low" maps to v2 "Low"
}

def normalize_risk_level(raw: str | None) -> str:
    """Normalize any risk level string to v2 vocabulary.
    Returns 'DataUnavailable' for None or unrecognized values.
    """
    if raw is None:
        return RiskState.DATA_UNAVAILABLE
    if raw in {s.value for s in RiskState}:
        return raw
    return V1_TO_V2_MAP.get(raw, RiskState.DATA_UNAVAILABLE).value
```

**What:** A single canonical enum + normalizer that every module imports. No module should hardcode risk level strings.

**When to use:** Everywhere — replaces `risk_level_from_wbt()`, direct string comparisons, and frontend RiskLevel types.

**Trade-offs:**
- Pro: Single source of truth — compiler enforces vocabulary
- Pro: `DataUnavailable` is a first-class state (not null, not "Safe")
- Pro: V1→V2 mapping handles existing DB data during migration
- Con: Need to update all import sites
- Con: Need frontend TypeScript enum to match exactly

## Data Flow: Complete CRS Lifecycle

### Write Path (HKO → DB)

```
HKO rhrread JSON
    │
    ▼
parse_hko_to_readings()
    │ Extract temp_c, humidity_pct per station
    │ If RH missing: attempt HKO Observatory fallback
    │
    ▼
persist_weather_data()
    │
    ├─ For each reading:
    │   ├─ wbt = calculate_wbt(temp_c, rh)
    │   ├─ IF wbt is None AND temp_c exists:
    │   │    rh = rh or 70.0   ← RH=70% fallback
    │   │    wbt = calculate_wbt(temp_c, rh)
    │   │    reading.humidity_pct = rh  ← persist the fallback RH
    │   ├─ IF wbt is not None:
    │   │    crs = compute_risk_score_v2(wbt, consecutive, warnings, risk_cfg)
    │   │    reading.composite_risk_score = crs["value"]
    │   │    reading.risk_level = crs["state"]   ← always v2 vocab
    │   ├─ ELSE (no temp data at all):
    │   │    reading.composite_risk_score = None
    │   │    reading.risk_level = "DataUnavailable"  ← explicit, not null
    │   └─ reading.wet_bulb_peak = wbt
    │
    └─ db.add(WeatherReading(**reading))
```

### Read Path (DB → API → Frontend)

```
API Endpoint
    │
    ▼
Query DB for readings
    │
    ▼
For each reading: ensure_crs(reading, db)
    │
    ├─ CRS exists + v2 vocab → return as-is
    ├─ CRS exists + v1 vocab → normalize_risk_level() → v2
    ├─ CRS null + WBT exists → recompute → v2
    └─ CRS null + no temp   → (None, "DataUnavailable")
    │
    ▼
Pydantic serialization
    │ @computed_field normalizes risk_level
    │ Optional[float] with exclude_none
    │
    ▼
Frontend receives:
    │ composite_risk_score: number | null  (null = genuinely no data)
    │ risk_level: "Safe"|"Low"|"Yellow"|"Red"|"Purple"|"DataUnavailable"
    │
    ▼
Frontend rendering:
    ├─ "DataUnavailable" → gray badge "No Temp Data"
    ├─ composite_risk_score: null → gauge shows "--" not "0.0"
    └─ v2 states → correct colors from riskStates.ts
```

## Vocabulary Drift Audit: Current Locations

### V1 Vocabulary (Critical/High/Moderate/Low) — MUST MIGRATE

| File | Line | Current | Migration Action |
|------|------|---------|-----------------|
| `backend/services/climate/risk.py` | 18-23 | `WBT_THRESHOLDS` dict with Critical/High/Moderate keys | Replace with v2 state_ranges from config, or remove if only used by `risk_level_from_wbt()` |
| `backend/services/climate/risk.py` | 26-36 | `risk_level_from_wbt()` returns Critical/High/Moderate/Low | Refactor to use `normalize_risk_level()` + scoring_v2 state_ranges, or delete and route all callers through scoring_v2 |
| `backend/services/climate/risk.py` | 39-49 | `risk_level_from_max_temp()` returns Critical/High/Moderate/Low | Same — refactor or delete |
| `backend/services/climate/risk.py` | 152-175 | `_generate_advisory()` checks Critical/High/Moderate/Low | Remap to v2 equivalents (Critical→Purple, High→Red, Moderate→Yellow, Low→Low) |
| `backend/services/climate/risk.py` | 207-212 | `should_create_alert()` checks Critical threshold | Acceptable internally — alert type is not user-facing vocab |
| `backend/services/weather_orchestrator.py` | 496 | `risk_level_from_wbt(max_wbt)` for alert creation | Uses v1 vocab — change to v2 or use scoring_v2 |
| `backend/services/weather_orchestrator.py` | 558 | `risk_level="Critical"` in HNE alert | Alert-specific — acceptable if internal, but should use `RiskState.PURPLE.value` |
| `backend/api/weather.py` | 324, 591 | `persisted_state or "Safe"` fallback | Correct v2 fallback — no change needed |
| `src/risk-intelligence/types.ts` | 1 | `RiskLevel` union includes v1+v2 | Remove Critical, Moderate, High from union |
| `src/risk-intelligence/components/RiskGrid.tsx` | 18-20 | `riskColorMap` has Critical/High/Moderate | Replace with v2 color map from riskStates.ts |
| `src/risk-intelligence/components/StationDetailModal.tsx` | 20-22 | Same v1 color map | Replace with v2 |
| `src/risk-intelligence/components/WarningsCard.tsx` | 44-56 | Critical/High/Moderate labels | These are warning severity, not risk state — may be acceptable but should be distinguished |
| `src/control-plane/types.ts` | 1 | `low/moderate/high/critical` | Completely different vocab — needs full v2 alignment |
| `src/hooks/useControlPlaneData.ts` | 73-76 | Maps 0-100 scale to low/moderate/high/critical | Needs rewrite to use CRS 0-30 scale + v2 vocab |

### V2 Vocabulary (Safe/Low/Yellow/Red/Purple) — CANONICAL

| File | Line | Status | Notes |
|------|------|--------|-------|
| `backend/services/climate/scoring_v2.py` | 96-107 | Canonical | `lookup_state()` with priority order |
| `backend/services/risk_config_service.py` | 38-43 | Canonical | DEFAULT_CONFIG state_ranges |
| `backend/services/risk_config_service.py` | 139 | Canonical validator | Enforces exactly 5 v2 states |
| `src/risk-intelligence/utils/riskStates.ts` | 11-16 | Canonical frontend | STATE_META matches v2 |

### Proposed New Vocabulary: DataUnavailable

| Concept | Current Handling | Proposed |
|---------|-----------------|----------|
| No temperature data at all | None/null → "Safe" fallback on some paths, 0.0 on UI | Explicit "DataUnavailable" state with gray badge |

## Anti-Patterns

### Anti-Pattern 1: Null = Safe (Silent Default)

**What people do:** Return "Safe" or 0.0 when `composite_risk_score` is null.
**Why it's wrong:** A missing CRS is not the same as a zero CRS. "Safe" implies measured and verified low risk. Null means the measurement is absent. Displaying "0.0/30" for missing data is actively dangerous — it tells frontline workers conditions are fine when they might not be.
**Do this instead:** Return `None` for `composite_risk_score` and `"DataUnavailable"` for `risk_level` when temperature data is genuinely missing. Frontend must render an explicit "No Data" state with gray/striped styling, never a green gauge.

### Anti-Pattern 2: Recompute at Every Read (No Persist)

**What people do:** Store raw data only, always compute CRS on the fly at query time.
**Why it's wrong:** (1) Risk formula config may change between persist and query, silently rewriting historical scores. (2) Query-time recomputation of every row is expensive and adds latency. (3) The historical view should show what the risk was at the time of measurement, not what it would be under current config.
**Do this instead:** Compute and persist CRS at write time as the primary value. Use read-time recomputation only as a safety net for rows where persist-time computation failed.

### Anti-Pattern 3: Vocabulary Mixing (No Central Authority)

**What people do:** Each module defines its own risk level names — `Critical` over here, `Purple` over there, `critical` on the frontend.
**Why it's wrong:** DB stores "Critical" from old code, API returns it, frontend doesn't recognize it → renders blank. Or frontend synthesizes its own 0-100 scale that doesn't match the backend 0-30 scale at all.
**Do this instead:** Single `RiskState` enum in backend, single `RiskStateMeta` type on frontend. Every module imports from there. Pydantic computed fields normalize any residual v1 values at the API boundary.

### Anti-Pattern 4: Duplicated CRS Logic Across Endpoints

**What people do:** Copy-paste the CRS recomputation logic into each endpoint that needs it (already happening in `/current`, `/history`, `/trends`).
**Why it's wrong:** Three copies of similar-but-not-identical CRS resolution code. Bug fixes must be applied to all copies. Inconsistencies creep in (one endpoint handles nulls, another doesn't).
**Do this instead:** Single `ensure_crs()` function that every endpoint calls. One place to fix, one behavior to test.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| HKO rhrread | HTTP fetch → parse → persist | RH missing for non-Observatory stations — fallback chain: HKO Obs RH → 70% default → None |
| HKO fnd | HTTP fetch → parse → persist | Forecast CRS computed with temp-aware hot night projection |
| HKO warnsum | HTTP fetch → parse → persist | Warning type deduplication at persist and read time |
| Open-Meteo (optional) | HTTP fetch → extend forecast days 10-14 | Opens its own DB session for risk_cfg — session lifecycle risk |

### Internal Boundaries

| Boundary | Communication | Current Issues |
|----------|---------------|---------------|
| Orchestrator → DB | Direct SQLAlchemy session | CRS computed at persist, null propagates if WBT missing |
| DB → API Endpoints | ORM model via Pydantic from_attributes | Null CRS leaks through; no shared CRS resolution |
| API → Frontend | JSON over HTTP | Mixed v1/v2 vocabulary; control-plane uses entirely different scale |
| risk.py → scoring_v2.py | scoring.py re-exports scoring_v2 | risk.py still exports `risk_level_from_wbt()` with v1 vocab |
| Frontend risk-intelligence → control-plane | Separate type systems | Completely different risk vocabularies |

### New Components to Build

| Component | Type | Purpose | Depends On |
|-----------|------|---------|------------|
| `backend/services/climate/vocabulary.py` | New module | Canonical `RiskState` enum + `normalize_risk_level()` + V1→V2 map | None |
| `backend/services/crs_resolver.py` | New module | `ensure_crs()` — shared CRS guarantee for all API endpoints | vocabulary.py, scoring_v2, risk_config_service, hot_nights_tracker |
| `backend/services/climate/risk.py` refactor | Modify | Replace `risk_level_from_wbt/max_temp` with v2-aware functions, or route all callers through scoring_v2 | vocabulary.py |
| Frontend `RiskLevel` type cleanup | Modify | Remove v1 states from TypeScript union; add DataUnavailable | vocabulary.py (as source of truth) |
| Frontend `control-plane/` vocabulary | Modify | Align with v2 Safe/Low/Yellow/Red/Purple; migrate off 0-100 scale | API CRS responses |
| DB backfill migration | New | Fix historical NULL CRS rows where WBT exists | scoring_v2, risk_config defaults |

## Suggested Build Order

Based on dependency analysis:

### Phase 1: Vocabulary Centralization (Foundation)

1. **Create `backend/services/climate/vocabulary.py`** — RiskState enum, normalize_risk_level(), V1_TO_V2_MAP
2. **Update `scoring_v2.py`** — Import RiskState instead of hardcoded strings in `lookup_state()`
3. **Update `risk_config_service.py`** — Validate against RiskState enum values

No external dependencies. Pure code refactor. Can be tested in isolation.

### Phase 2: CRS Resolver (Safety Net)

4. **Create `backend/services/crs_resolver.py`** — ensure_crs() + helper for batch resolution
5. **Wire `/current` endpoint** — Replace inline recomputation with ensure_crs()
6. **Wire `/forecast` endpoint** — Add CRS null guard currently missing
7. **Wire `/history` endpoint** — Replace duplicated logic with ensure_crs()
8. **Wire `/trends` endpoint** — Same
9. **Wire `/live-score` endpoint** — ensure_crs() for consistency, keep fresh recomputation as primary

Depends on Phase 1 (vocabulary.py).

### Phase 3: Legacy Vocabulary Elimination

10. **Refactor `risk.py`** — Replace risk_level_from_wbt() with v2-aware version or delete
11. **Update `_generate_advisory()`** — Map Critical→Purple, High→Red, etc.
12. **Update `weather_orchestrator.py`** — Replace risk_level_from_wbt() calls with v2 functions
13. **Fix frontend `types.ts`** — Remove v1 from RiskLevel union
14. **Replace frontend RiskGrid.tsx / StationDetailModal.tsx color maps** — Use riskStates.ts
15. **Rewrite `useControlPlaneData.ts`** — Use backend CRS/risk_level instead of client-side 0-100 computation
16. **Update `control-plane/types.ts`** — Align RiskLevel with v2

Depends on Phase 2 (all endpoints guaranteed to return v2 vocab).

### Phase 4: Data Integrity

17. **DB backfill migration** — Find all WeatherReading rows where WBT is not null but CRS is null; recompute using v2 defaults
18. **Same for WeatherForecastDay** — Recompute NULL forecast CRS
19. **Add "DataUnavailable" risk_level** — Update schema to support this state; ensure frontend handles it

Depends on Phase 3 (vocabulary guarantee).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1-5 users, single-team) | In-process recomputation is fine — SQLite handles it, ~5ms per request |
| 10-50 concurrent users | Add CRS caching: memoize ensure_crs() results with 5-min TTL keyed by reading.id |
| Multi-org deployment | CRS recomputation must use per-org RiskFormulaConfig; caching needs org-scoped keys |

### Scaling Priorities

1. **First bottleneck:** DB query load from `ensure_crs()` hitting `get_active_risk_config()` + `get_current_consecutive_hot_nights()` per reading. Fix: cache risk_config at module level with 60s TTL.
2. **Second bottleneck:** Backfill migration on large historical dataset. Fix: batch process 1000 rows at a time with progress tracking.

## Sources

- FastAPI response_model documentation: https://fastapi.tiangolo.com/tutorial/response-model/ (HIGH confidence, Context7 verified)
- Pydantic v2 `computed_field` decorator: https://pydantic.dev/docs/validation/latest/concepts/fields (HIGH confidence, Context7 verified)
- Pydantic v2 `from_attributes` (ORM mode): https://pydantic.dev/docs/validation/latest/concepts/models (HIGH confidence, Context7 verified)
- ClimateShield codebase: direct analysis of models.py, schemas.py, weather_orchestrator.py, api/weather.py, climate/risk.py, climate/scoring_v2.py, risk_config_service.py, riskStates.ts, types.ts, useControlPlaneData.ts (HIGH confidence, primary source)

---
*Architecture research for: ClimateShield v1.1 Risk Score Pipeline Reliability*
*Researched: 2026-05-17*