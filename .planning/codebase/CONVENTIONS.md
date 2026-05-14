# Coding Conventions

**Analysis Date:** 2026-05-14

## Naming Conventions

### Files
- **Python**: `snake_case`
  - Examples: `weather_orchestrator.py`, `climate_engine.py`, `risk_config_service.py`, `hko_client.py`
- **TypeScript/React**: `PascalCase` for components, `camelCase` for utilities
  - Examples: `RiskGrid.tsx`, `StationDetailModal.tsx`, `Dashboard.tsx`, `api.ts`

### Functions
- **Python**: `snake_case`
  - Examples: `calculate_wbt`, `get_extended_forecast`, `persist_weather_data`, `increment_counter`, `_check_password`
- **TypeScript**: `camelCase`
  - Examples: `getHistory`, `setLoading`, `onStationSelect`, `ackAlert`

### Variables
- **Python**: `snake_case`
  - Examples: `readings_persisted`, `forecast_days_persisted`, `max_wbt`, `two_hours_ago`
- **TypeScript**: `camelCase`
  - Examples: `selectedStationId`, `riskColorMap`, `viewMode`, `activeWarnings`

### Types
- **Python classes**: `PascalCase`
  - Examples: `WeatherOrchestrator`, `HKOClient`, `OpenMeteoClient`, `_MetricsRequest`
- **TypeScript interfaces/types**: `PascalCase`
  - Examples: `WeatherReading`, `WeatherForecastDay`, `RiskLevel`, `CompositeRiskScore`, `StationDetailModalProps`

### React Components
- **Components**: `PascalCase` function name + filename match
  - Examples: `RiskGrid`, `StationDetailModal`, `Dashboard`, `RiskCard`
- **Props interfaces**: Component name + `Props`
  - Example: `RiskGridProps`, `StationDetailModalProps`, `DashboardProps`

### Constants
- **Python module-level**: `UPPER_SNAKE_CASE`
  - Examples: `MONITORED_STATIONS`, `BASE_URL`, `HNE_THRESHOLD`, `COUNTER_NAMES`

### Private/Internal
- **Python**: Leading underscore for private functions and classes
  - Examples: `_check_password`, `_parse_iso_datetime`, `_safe_float`, `_MetricsRequest`
- **TypeScript**: No strong convention for private members; relies on module boundaries

## Type System

### Python Type Hints
- Uses `typing` module extensively throughout the backend
- Common patterns from `backend/api/weather.py` and `backend/services/*.py`:
```python
from typing import List, Optional, Dict, Any

def get_current_weather(db: Session = Depends(get_db)) -> List[schemas.WeatherReadingResponse]:
async def get_forecast(
    beta_14day: bool = False,
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(get_orchestrator),
) -> List[schemas.WeatherForecastDayResponse]:
```
- Pydantic `BaseModel` used for request validation:
```python
class _MetricsRequest(BaseModel):
    password: str = Field(..., min_length=1)
```
- SQLAlchemy ORM types used for database models
- Return type annotations present on most public functions
- Some older-style imports still used (`List`, `Optional` from `typing` rather than built-in generics)

### TypeScript Patterns
- Strict mode enabled (`strict: true` in `tsconfig.app.json`)
- Explicit interface definitions in domain modules:
```typescript
// src/sections/risk-intelligence/types.ts
export interface WeatherReading {
    id: number;
    station: string;
    temp_c?: number;
    risk_level: string;
    recorded_at: string;
}
```
- `any` used sparingly for API payload shapes in `src/services/api.ts`:
```typescript
createPledge: async (data: any) => { ... }
updateRiskConfig: async (password: string, config: any) => { ... }
```
- Union types for nullable values: `signal: string | null`, `onStationDetail?: (station: WeatherReading) => void`
- Type-only imports use `import type`:
```typescript
import type { WeatherReading } from '../types';
import type { District } from "@/sections/control-plane/types";
```

## Import Organization

### Python
**Order:**
1. Standard library imports
2. Third-party imports (FastAPI, Pydantic, SQLAlchemy, httpx)
3. Local application imports (`backend.*`)

**Example from `backend/api/weather.py`:**
```python
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend import models, schemas
from backend.services.counters import get_all_counters, reset_counters
```

**Pattern:** Absolute imports only. All local imports prefixed with `backend.`.

### TypeScript
**Order:**
1. React imports
2. Third-party libraries (lucide-react, etc.)
3. Local absolute imports (`@/services/*`, `@/components/*`, `@/lib/*`)
4. Relative imports (sibling files, parent types)

**Example from `src/sections/risk-intelligence/components/StationDetailModal.tsx`:**
```typescript
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/services/api';
import type { WeatherReading, WeatherHistoryItem } from '../types';
```

**Path Aliases:**
- `@/` maps to `./src/` via Vite config and TypeScript paths
- Used for all cross-module imports
- Relative paths (`../types`) only for sibling/co-located files

## Error Handling

### Python Backend
**Try/catch patterns:**
```python
# Specific exception types, return None for transient failures
try:
    response = await self._client.get(...)
    response.raise_for_status()
    return response.json()
except httpx.HTTPStatusError as e:
    logger.warning("HKOClient HTTP error %s: %s", e.response.status_code, e)
    return None
except httpx.RequestError as e:
    logger.warning("HKOClient request error: %s", e)
    return None
except Exception:
    logger.exception("Unexpected error")
    return None
```

**FastAPI error responses:**
```python
# Use HTTPException with status codes
if not alert:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

if not _check_password(req.password):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Invalid password",
    )
```

**Defensive patterns:**
- Check for empty data before processing: `if not data: return []`
- Guard against `None` with explicit checks before operations
- Use `next()` with generator expressions for safe lookups:
```python
nightly_hne_val = next(
    (r.nightly_hne for r in group if r.nightly_hne is not None),
    None
)
```

### TypeScript Frontend
**API error handling in `src/services/api.ts`:**
```typescript
const response = await fetch(`${API_BASE}/weather/current`);
if (!response.ok) throw new Error("Failed to fetch current weather");
return response.json();
```

**Component-level error handling:**
```typescript
async function load() {
    setLoading(true);
    try {
        const data = await api.weather.getHistory(7, stationName);
        setHistory(data.history || []);
    } catch (e) {
        console.error('Failed to load station history', e);
    } finally {
        setLoading(false);
    }
}
```

**Patterns:**
- Always check `response.ok` before parsing JSON
- Throw descriptive `Error` instances for upstream handling
- Some admin endpoints have stub implementations (console.log + mock return)

## Async Patterns

### Python FastAPI Endpoints
- Use `async def` for I/O-bound operations (database, external APIs)
- Use `def` for simple database reads (FastAPI handles sync DB queries in threadpool)
```python
# Async for external API + DB write
@router.get("/forecast")
async def get_forecast(
    beta_14day: bool = False,
    db: Session = Depends(get_db),
    orchestrator: WeatherOrchestrator = Depends(get_orchestrator),
):

# Sync for simple DB read
@router.get("/current")
def get_current_weather(db: Session = Depends(get_db)):
```

- Concurrent fetching with `asyncio.gather`:
```python
results = await asyncio.gather(
    self.fetch_current_weather(lang),
    self.fetch_forecast(lang),
    self.fetch_warnings(lang),
    self.fetch_local_forecast(lang),
)
```

### Frontend Async Data Fetching
- Uses native `fetch` API wrapped in async functions
- Pattern in `src/services/api.ts`:
```typescript
getCurrent: async () => {
    const response = await fetch(`${API_BASE}/weather/current`);
    if (!response.ok) throw new Error("Failed to fetch current weather");
    return response.json();
},
```

- React component pattern with cleanup guard:
```typescript
useEffect(() => {
    if (!open || !station) return;
    let mounted = true;
    async function load() {
        try {
            const data = await api.weather.getHistory(7, stationName);
            if (!mounted) return;
            setHistory(data.history);
        } catch (e) {
            console.error('Failed to load', e);
        } finally {
            if (mounted) setLoading(false);
        }
    }
    load();
    return () => { mounted = false; };
}, [open, station]);
```

## Code Style

### Linting and Formatting
- **TypeScript**: No ESLint or Prettier config files detected. Relies on TypeScript compiler strictness:
  - `strict: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `noUncheckedSideEffectImports: true`
- **Python**: No explicit linter configuration in `pyproject.toml` (no ruff, black, or flake8 settings detected)

### Comments and Docstrings
**Python:**
- Module-level docstrings describe purpose:
```python
"""
Weather Orchestrator
Parses HKO JSON responses, persists to DB, computes WBT/HNE/risk outlook,
and creates SystemAlerts when thresholds are breached.
"""
```
- Function docstrings for public API endpoints:
```python
def get_current_weather(db: Session = Depends(get_db)):
    """
    Return the most recent weather reading per station (last 2 hours).
    """
```
- Inline comments with `#` for logic explanation and section headers:
```python
# ============================================================
# Public endpoints (no auth required for basic weather data)
# ============================================================
```

**TypeScript:**
- Minimal inline comments
- JSX comments with `{/* */}`
- Section headers in components:
```tsx
{/* Current Reading */}
{/* HNE History */}
```

### Spacing and Formatting
- **Python**: 2 blank lines between top-level functions/classes, 1 blank line between methods
- **TypeScript**: Consistent 2-space indentation (inferred from component files)
- **JSX**: Multi-line prop formatting with consistent indentation

### Code Organization
- Python endpoints grouped with section comments (Public, Auth-required, Alert endpoints)
- TypeScript components co-located in feature directories (`src/sections/{feature}/components/`)
- Barrel/utility re-export pattern used in `backend/services/climate_engine.py` for backward compatibility

---

*Convention analysis: 2026-05-14*
