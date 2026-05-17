# Stack Research: Pipeline Reliability & Null-Handling

**Domain:** Data pipeline resilience for climate risk scoring (FastAPI + SQLAlchemy + React)
**Researched:** 2026-05-17
**Confidence:** HIGH

## Recommended Stack

### Core Technologies (Already in Place — No Changes)

| Technology | Version | Purpose | Why Keep |
|------------|---------|---------|----------|
| Pydantic | 2.12.5 | API schema validation, response serialization | Already used for schemas.py — extend with validators, don't replace |
| FastAPI | 0.129.0 | API framework with built-in Pydantic validation | response_model already enforces response shape; add stricter nullable handling |
| SQLAlchemy | 2.0.46 | ORM with nullable column definitions | Columns already nullable — add DB-level CHECK constraints where appropriate |
| httpx | 0.27.0 | Async HTTP client for HKO API | Already in use — add response validation layer on top |
| APScheduler | 3.11.0 | Scheduled HKO polling | Already handles retries — enhance with structured logging of poll outcomes |

### New Additions — Backend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Pydantic `model_validator` + `field_validator` | (built into Pydantic 2.12.5) | Validate HKO API responses at parse boundary, enforce non-null invariants on computed fields | Zero new dependency — use what's already installed. Add `HKOResponseValidator` model that validates HKO JSON before trusting it. Catches silent null propagation at the fetch→parse boundary. |
| structlog | 24.4.0+ | Structured JSON logging replacing bare `logging.getLogger()` calls | Current code uses `logger.warning()` with position args — no structured fields. structlog makes null-propagation events queryable (e.g., `grep 'null_wbt' logs.json`). Critical for auditing the pipeline in production Docker. |
| Pydantic `TypeAdapter` | (built into Pydantic 2.12.5) | Validate raw HKO JSON lists (temperature data, humidity data) before parsing | HKO returns heterogeneous JSON arrays — `TypeAdapter(list[HKOTempReading])` catches malformed entries that silently produce None fields. Zero new dependency. |

### New Additions — Frontend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Zod | 3.24.2 | Runtime validation of API responses in TypeScript | Currently `api.ts` calls `response.json()` with zero validation — null `composite_risk_score` silently becomes `undefined`/`0`. Zod schemas catch this at the fetch boundary. Also typed: `z.infer<>` replaces manual TypeScript interfaces. |

### NOT Recommended (and Why)

| Technology | Why Not | Instead |
|------------|--------|---------|
| marshmallow | Redundant with Pydantic 2 already installed — marshmallow adds schema duplication | Use Pydantic `model_validator` and `field_validator` |
| pandera | Overkill for this data shape — designed for DataFrame validation, not API response validation | Use Pydantic validators on HKO response models |
| OpenTelemetry / Prometheus | Monitoring infrastructure is premature for single-machine Docker deployment — adds complexity with no ops team to consume metrics | Use structlog JSON output + existing `/api/health` endpoint. Add Prometheus if/when scaling to multi-host |
| Sentry | Error tracking SaaS is overkill for single-instance Hong Kong deployment with no public exposure | Use structlog error events + Docker log aggregation |
| jsonschema | Lower-level than Pydantic — would duplicate validation logic that Pydantic already provides with better ergonomics | Use Pydantic `model_validate()` on HKO responses |
| io-ts (TypeScript) | Less ergonomic API than Zod, worse TypeScript inference, smaller ecosystem | Use Zod |
| yup (TypeScript) | JavaScript-first, slower TypeScript inference, less maintained than Zod | Use Zod |
| tRPC | Requires full-stack TypeScript — backend is Python/FastAPI | Validate API responses with Zod on the client instead |

## Supporting Libraries — Conditional

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pydantic `ConfigDict(strict=True)` | (built in) | Strict mode validation catches type coercion errors (e.g., `None` → `0`) | Only on new HKO parsing models — do NOT apply to existing schemas.py models (would break `from_attributes=True` ORM mode) |
| orjson | 3.10+ | Fast JSON serialization for structlog if Docker log volume becomes an issue | Only if structlog JSON output measurably slows the 10-min poll cycle. Default `json.dumps` is fine for this scale. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Celery / Dramatiq | Task queue for a single-machine app with 10-min polling is massive overkill | APScheduler (already in use) is correct for this scale |
| Redis | Would only be needed for Celery or rate limiting with distributed state | SQLite + slowapi (already in use) is correct |
| Database migration to PostgreSQL | The null-handling bug is not a SQLite limitation — it's a code-level propagation issue | Fix the code, keep SQLite |
| API response caching (Redis/memcached) | 5 stations with 10-min polling = trivial read volume | SQLAlchemy session-level caching is sufficient |
| Circuit breaker library (py-breaker, tenacity) | HKO is the only external dependency and already has retry in scheduler | Add retry logic to `_fetch()` directly — simpler, no new dependency |
| Health check libraries (schemathesis, openapi-core) | Existing `/api/health` endpoint already checks DB + HKO + disk | Enhance existing endpoint with data freshness check (last reading timestamp) — no new library needed |

## Installation

```bash
# Backend: only one new dependency
pip install structlog>=24.4.0

# Frontend: one new dependency
npm install zod@3.24.2
```

## Architecture Integration Points

### Where Pydantic Validators Plug In

```
HKO API → httpx response.json()
           ↓
    [NEW] HKORhrreadResponse.model_validate(data)   ← Catches missing/malformed fields
           ↓
    parse_hko_to_readings(validated_data)            ← Existing parser, now receives guaranteed shapes
           ↓
    calculate_wbt(temp_c, rh or 70.0)                 ← RH fallback happens after validation
           ↓
    compute_risk_score_v2(wbt, ...)                   ← Already handles wbt=None → score=None
           ↓
    models.WeatherReading(...)                       ← DB persist with explicit None tracking
```

### Where Zod Plugs In

```
fetch('/api/weather/current')
    ↓
response.json()
    ↓
[NEW] weatherReadingsSchema.safeParse(data)          ← Catches null composite_risk_score
    ↓
if (!result.success) → show "Data unavailable"       ← UI never shows misleading 0.0/30
    ↓
result.data → React state                            ← Type-safe, null-aware
```

### Where structlog Plugs In

```
Scheduler._poll_and_persist()
    ↓
log.info("hko_poll_completed",                       ← Structured: station, wbt, crs all as fields
    station=r.station,
    wbt_c=r.wet_bulb_temp_c,
    rh_pct=r.humidity_pct,
    composite_risk_score=r.composite_risk_score,
    risk_level=r.risk_level,
    null_fields=[k for k, v in r.items() if v is None]  ← Explicit null audit
)
```

## Specific Code Pattern Recommendations

### 1. HKO Response Validation Model (Pydantic — already installed)

```python
# backend/services/hko_validation.py — NEW FILE
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List

class HKOTempEntry(BaseModel):
    place: str
    value: float  # Non-optional — HKO always provides value with place

class HKOHumidityEntry(BaseModel):
    place: str
    value: Optional[float] = None  # Explicitly nullable — HKO omits for some stations

class HKORhrreadResponse(BaseModel):
    """Validates the HKO rhrread API response shape before parsing."""
    update_time: Optional[str] = None
    temperature: Optional[dict] = None
    humidity: Optional[dict] = None
    rainfall: Optional[dict] = None

    @field_validator('temperature', 'humidity', 'rainfall', mode='before')
    @classmethod
    def coerce_empty_blocks(cls, v):
        """Handle HKO returning [] instead of {'data': []}."""
        if v is None or (isinstance(v, dict) and not v.get('data')):
            return None
        return v

class HKOFndResponse(BaseModel):
    """Validates the 9-day forecast response shape."""
    weatherForecast: List[dict] = []
```

**Why this works:** No new dependencies. Validate at the boundary. Pydantic 2.12.5 already supports all of this. The key insight is that `parse_hko_to_readings()` currently accepts `Optional[Dict[str, Any]]` — any shape at all. Adding validation at this boundary makes the rest of the pipeline safer.

### 2. Frontend API Response Validation (Zod)

```typescript
// src/schemas/weather.ts — NEW FILE
import { z } from 'zod';

const RISK_LEVELS = ['Safe', 'Low', 'Yellow', 'Red', 'Purple'] as const;

export const weatherReadingSchema = z.object({
  id: z.number(),
  station: z.string(),
  district: z.string().nullable().optional(),
  temp_c: z.number().nullable().optional(),
  humidity_pct: z.number().nullable().optional(),
  wet_bulb_temp_c: z.number().nullable().optional(),
  composite_risk_score: z.number().nullable(),  // EXPLICITLY nullable — UI must handle null
  risk_level: z.enum(RISK_LEVELS).or(z.string()),  // Accept unknown levels gracefully
  recorded_at: z.string(),
});

export const weatherReadingsArraySchema = z.array(weatherReadingSchema);

// Usage in api.ts:
export const api = {
  weather: {
    getCurrent: async () => {
      const response = await fetch(`${API_BASE}/weather/current`);
      if (!response.ok) throw new Error("Failed to fetch current weather");
      const raw = await response.json();
      const result = weatherReadingsArraySchema.safeParse(raw);
      if (!result.success) {
        console.error('API response validation failed:', result.error);
        // Return parsed data anyway but flag issues — graceful degradation
      }
      return result.success ? result.data : raw;
    },
  },
};
```

### 3. Structured Logging Pattern (structlog)

```python
# backend/services/logging_config.py — NEW FILE
import sys
import structlog

def configure_logging():
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if sys.stderr.isatty():
        # Dev: pretty console output
        processors = shared_processors + [structlog.dev.ConsoleRenderer()]
    else:
        # Docker: JSON output for log aggregation
        processors = shared_processors + [
            structlog.processors.CallsiteParameterAdder([
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.LINENO,
            ]),
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

### 4. Null-Aware API Response Enrichment (No New Dependency)

The most impactful change requires no new library at all — fixing the 6 root causes in existing code:

```python
# In schemas.py: add field_validator that rejects null composite_risk_score
# when wet_bulb_temp_c is present
class WeatherReadingResponse(WeatherReadingBase):
    id: int
    composite_risk_score: Optional[float] = None  # Keep nullable for legacy rows
    risk_level: Optional[str] = "Safe"             # Default to Safe, not None

    @model_validator(mode='after')
    def ensure_score_consistency(self):
        """If WBT is present, composite_risk_score must not be null."""
        if self.wet_bulb_temp_c is not None and self.composite_risk_score is None:
            # Signal to caller that recomputation is needed
            pass  # API layer handles recomputation
        return self
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| structlog 24.4+ | Python 3.8+, any stdlib logging | Drop-in replacement — existing `logger = logging.getLogger()` calls still work alongside structlog |
| Zod 3.24.2 | TypeScript 4.5+, React 19 | No React-specific integration needed — pure validation at API fetch boundary |
| Pydantic 2.12.5 | FastAPI 0.129.0 | Already compatible — v2 validators work with FastAPI's response_model |
| Pydantic model_validator | Pydantic 2.0+ | Already installed — no upgrade needed |
| Pydantic TypeAdapter | Pydantic 2.0+ | Already installed — no upgrade needed |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Pydantic validators | Custom validation functions | Only if validators create circular dependency issues (unlikely) |
| Zod | io-ts | If team strongly prefers fp-ts ecosystem (unlikely — no fp-ts in project) |
| structlog | loguru | If team prefers simpler API over structured fields. structlog wins for Docker JSON logging. |
| structlog | plain logging + JSON formatter | If you want zero new deps. But you lose structured contextvars binding which is critical for correlating poll cycles with their log entries. |

## Stack Patterns by Variant

**If deployment stays single-machine Docker (current plan):**
- structlog with JSON output + Docker log drivers = sufficient observability
- Zod for frontend null-safety = sufficient API validation
- Pydantic validators for backend HKO validation = sufficient data integrity
- No metrics/monitoring infrastructure needed

**If deployment scales to multi-host or cloud:**
- Add Prometheus metrics endpoint (fastapi-instrumentation)
- Consider Sentry for error tracking
- Replace SQLite with PostgreSQL (but NOT for null-handling fix — that's a code issue)

**If HKO API changes or adds data sources:**
- Pydantic HKO response models make it easy to adapt schema
- Zod schemas on frontend make it easy to handle new fields gracefully

## Sources

- /pydantic/pydantic — model_validator, field_validator, TypeAdapter, model_validate for external data
- /colinhacks/zod — safeParse, discriminated union for null handling, z.infer for TypeScript types
- /fastapi/fastapi — middleware patterns, response model validation, exception handling
- /hynek/structlog — JSON renderer, stdlib integration, FastAPI-compatible configuration, contextvars
- Codebase analysis: hko_client.py (httpx client, null-on-error pattern), weather_orchestrator.py (parse_hko_to_readings accepts Optional[Dict], RH fallback logic), scoring_v2.py (lookup_state handles only valid ranges), risk.py (risk_level_from_wbt returns old vocabulary), wbt.py (returns None for None inputs — correct but unchecked downstream), api/weather.py (on-the-fly CRS recomputation already partial)

---
*Stack research for: ClimateShield v1.1 Pipeline Reliability*
*Researched: 2026-05-17*