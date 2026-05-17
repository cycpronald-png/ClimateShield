# Code Conventions — ClimateShield

**Analysis Date:** 2026-05-17

## General Style

**No linter or formatter is configured.** There is no ESLint, Prettier, Biome, Ruff, or Black configuration in the repository. Code style is enforced only by TypeScript's compiler strict mode and developer habit.

**Indentation:** 4 spaces for Python, 2 spaces for TypeScript/TSX.

**Semicolons:** TypeScript uses semicolons consistently (e.g., `src/App.tsx`, `src/services/api.ts`).

**Trailing commas:** Not consistently used in TypeScript; Python does not use trailing commas.

**Quotes:** TypeScript mixes double and single quotes — double quotes dominate in `src/` (imports, JSX attributes), single quotes appear in some hooks (e.g., `src/hooks/useControlPlaneData.ts` uses single quotes for strings). Python uses double quotes for strings.

## Frontend Conventions

### Components

**Pattern: Functional components with named exports.**
```tsx
export function RiskScoreGauge({ readings, selectedStation }: RiskScoreGaugeProps) {
  // ...
}
```
- No default exports for components except page-level components:
  - `src/pages/RiskIntelligence.tsx` → `export default function RiskIntelligence()`
  - `src/pages/ControlPlane.tsx` → `export default function ControlPlane()`
  - `src/App.tsx` → `export default App`
- Page components use `export default`. Shared/reusable components use named exports.

**File naming: PascalCase for components.**
- `RiskScoreGauge.tsx`, `StationDetailModal.tsx`, `ForecastDashboard.tsx`
- UI primitives in `src/components/ui/`: lowercase `card.tsx`, `button.tsx`, `badge.tsx`

**UI components: Radix UI + shadcn/ui pattern.**
- `src/components/ui/*.tsx` follows the shadcn/ui `React.forwardRef` + `cn()` pattern:
```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl border bg-card text-card-foreground shadow", className)} {...props} />
))
Card.displayName = "Card"
```

### State Management

**Pattern: Local `useState` + custom hooks. No global state library.**
- `useControlPlaneData()` in `src/hooks/useControlPlaneData.ts` — fetches and manages all control plane data
- `useOfflineCache()` in `src/hooks/useOfflineCache.ts` — sessionStorage-based offline cache
- `useLastRefresh()` in `src/hooks/useLastRefresh.ts` — tracks last data refresh
- `useRetry()` from `src/context/RetryContext.tsx` — simple retry key context (increments counter to trigger refetch)

**Context usage:**
- `RetryContext` — the only React Context beyond `ThemeProvider`. Provides `retryKey` + `triggerRetry`.
- `ThemeProvider` from `src/components/theme-provider.tsx` — dark/light mode.

**Offline cache pattern:**
```typescript
const { read, write } = useOfflineCache();
const [data, setData] = useState<T>(() => read<T>("cache_key")?.data ?? []);
// On fetch success:
write("cache_key", data);
// On fetch failure:
const cached = read<T>("cache_key");
if (cached?.data.length > 0) { setData(cached.data); setIsOffline(true); }
```

### Hooks

**Naming: `use` prefix, PascalCase rest.**
- `useControlPlaneData`, `useOfflineCache`, `useLastRefresh`

**Data fetching pattern:**
```typescript
const fetchData = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const [a, b] = await Promise.all([api.weather.getX(), api.weather.getY().catch(() => fallback)]);
    setData(enriched);
    write("cache_key", enriched);
  } catch (e) {
    console.error('Fetch error:', e);
    // Fallback to cache or set error state
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  fetchData();
  const iv = setInterval(fetchData, 300000); // 5-minute poll
  return () => clearInterval(iv);
}, [fetchData, retryKey]);
```

### Routing

**React Router v7 with lazy loading:**
```tsx
const ControlPlane = lazy(() => import("./pages/ControlPlane"));
// Route config:
<Route path="/" element={<AppShell />}>
  <Route index element={<RiskIntelligence />} />
  <Route path="control-plane" element={<ControlPlane />} />
</Route>
```

### Types

**TypeScript strict mode enabled** (`tsconfig.app.json`):
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

**Type files:** Co-located `types.ts` per section:
- `src/sections/risk-intelligence/types.ts`
- `src/sections/control-plane/types.ts`
- `src/pages/donate/types.ts`

**Interface naming:** PascalCase with no `I` prefix:
```typescript
export interface WeatherReading { ... }
export interface District { ... }
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
```

**`any` usage:** Used liberally for API responses (e.g., `src/services/api.ts` uses `data: any` parameter; `src/hooks/useControlPlaneData.ts` casts `(r: any)` from API responses).

### API Client

**Pattern:** Object literal with nested namespaces — `src/services/api.ts`:
```typescript
const API_BASE = "/api";
export const api = {
  donate: { createPledge: async (data: any) => { ... } },
  admin: { getDonations: async () => { ... } },
  weather: { getCurrent: async () => { ... } },
  agents: { getStatus: async () => { ... } },
};
```
- All methods use native `fetch()` — no Axios or similar library.
- Standard pattern: `if (!response.ok) throw new Error("..."); return response.json();`
- No request interceptors, no auth headers for public endpoints.
- Admin endpoints pass password in request body or `X-Admin-Password` header.

### Import Organization

**Order (observed):**
1. React imports (`useState`, `useEffect`, `useCallback`, etc.)
2. Third-party imports (`react-router-dom`, `sonner`, `lucide-react`)
3. `@/` aliased imports (components, services, hooks, types)
4. Relative imports (sibling components)

**Path alias:** `@/` → `./src/` (configured in `vite.config.ts` and `tsconfig.app.json`)

### Notifications

**Toast notifications via `sonner`:**
```tsx
import { toast } from 'sonner';
toast.success(result.message || "Success message");
toast.error("Error message");
```

## Backend Conventions

### API Structure

**FastAPI with APIRouter per domain:**
- `backend/api/weather.py` — prefix `/api/weather`
- `backend/api/donor.py` — prefix `/api/donor`
- `backend/api/admin.py` — prefix `/api/admin`
- `backend/api/health.py` — prefix `/api/health`

**Router registration in `backend/main.py`:**
```python
app.include_router(donor.router)
app.include_router(admin.router)
app.include_router(weather.router)
app.include_router(health.router)
```

### Python Naming

**Files:** `snake_case.py` — `weather_orchestrator.py`, `hko_client.py`, `scoring_v2.py`, `risk_config_service.py`

**Classes:** `PascalCase` — `HKOClient`, `RiskOutlook`, `DonorProfile`

**Functions:** `snake_case` — `compute_risk_score_v2()`, `calculate_wbt()`, `get_active_risk_config()`

**Constants:** `UPPER_SNAKE_CASE` — `WBT_THRESHOLDS`, `HNE_THRESHOLD`, `BASE_URL`, `DEFAULT_CONFIG`

**Private helpers:** Prefixed with `_` — `_check_password()`, `_psr_to_prob()`, `_active_typhoon_signal()`, `_ensure_risk_columns()`

### Pydantic Schemas

**Pattern: BaseModel inheritance chain** in `backend/schemas.py`:
```python
class DonationItemBase(BaseModel):
    item_type: str
    quantity: int = Field(gt=0)

class DonationItemCreate(DonationItemBase):
    pass

class DonationItemResponse(DonationItemBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
```

**Naming convention:**
- `*Base` — shared fields
- `*Create` — request body validation
- `*Response` — response serialization with `model_config = ConfigDict(from_attributes=True)`

**Field defaults:** Use `Optional[T] = None` for nullable fields, literal defaults for required defaults (e.g., `status: str = "active"`).

### SQLAlchemy Models

**Pattern: Classical `Column()` style** in `backend/models.py` (not Mapped/Declarative):
```python
class WeatherReading(Base):
    __tablename__ = "weather_readings"
    id = Column(Integer, primary_key=True, index=True)
    temp_c = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
```

**String enums:** Enum values stored as `String` columns, not `Enum` type:
```python
donation_type = Column(String, nullable=False)  # Store enum as string for simplicity
```

**Timestamps:** `DateTime(timezone=True)` with `default=datetime.datetime.now` and `onupdate=datetime.datetime.now`.

**Relationships:** Explicit `relationship()` with `back_populates`.

### Service Layer

**Pattern: Module-level functions (not classes) for most services.**
- `backend/services/climate/scoring_v2.py` — pure functions: `compute_risk_score_v2()`, `lookup_wbt_score()`
- `backend/services/climate/wbt.py` — pure function: `calculate_wbt()`
- `backend/services/risk_config_service.py` — pure functions: `get_active_risk_config()`, `validate_risk_config()`

**Singleton clients (classes):**
- `HKOClient` in `backend/services/hko_client.py` — `hko = HKOClient()` module singleton
- Similar pattern for `open_meteo` in `backend/services/open_meteo_client.py`

**Re-export wrapper pattern:** `backend/services/climate_engine.py` re-exports from submodules with `# noqa: F401`:
```python
from backend.services.climate.wbt import calculate_wbt, calculate_wbgt  # noqa: F401
```

### Database Session

**Dependency injection pattern:**
```python
from backend.database import get_db

def endpoint(db: Session = Depends(get_db)):
    ...
```

**Session lifecycle:** `get_db()` yields a session with `try/finally: db.close()`.

### Docstrings

**Module-level docstrings:** Present for service modules:
```python
"""
HKO Open Data Async Client (Best Practice: Shared httpx.AsyncClient via lifespan).
"""
```

**Function docstrings:** Present for public API endpoints and complex functions:
```python
def compute_risk_score_v2(wbt, consecutive_hot_nights, active_warnings, config):
    """
    Compute the new 0-30 risk score using the Update_For.md formula.
    ...
    """
```

**Style:** Google-style with `Args:` and `Returns:` sections.

## CSS/Tailwind Patterns

**Tailwind CSS v4** with `@tailwindcss/vite` plugin (no `tailwind.config.js` — v4 uses CSS-first config).

**Class composition via `cn()` utility** in `src/lib/utils.ts`:
```typescript
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
```

**Dark mode:** Explicit `dark:` variant classes throughout (no automatic dark mode):
```tsx
<div className="bg-white dark:bg-zinc-950" />
<span className="text-zinc-900 dark:text-zinc-100" />
```

**Color palette:** Zinc-based neutrals with specific semantic colors:
- Risk levels: `bg-emerald-500` (Safe), `bg-blue-500` (Low), `bg-yellow-500` (Yellow), `bg-red-500` (Red), `bg-purple-500` (Purple)
- Brand accent: `text-violet-700 dark:text-violet-500`

**Layout pattern:** Sidebar + main content with responsive break at `lg:`:
```tsx
<div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 lg:flex-row">
  <aside className="hidden w-64 ... lg:flex" />
  <main className="flex-1 min-w-0 overflow-hidden flex flex-col" />
</div>
```

**Common utility classes observed:**
- `rounded-xl`, `rounded-lg` — card and container corners
- `border-b` — section dividers
- `p-6`, `px-6`, `py-1` — consistent spacing
- `text-xs`, `text-sm`, `text-base` — typographic scale
- `space-y-3`, `space-y-2` — vertical spacing within cards
- `gap-2`, `gap-4` — flex item spacing

## Error Handling

### Frontend

**ErrorBoundary:** Class component wrapping the entire app in `src/components/ErrorBoundary.tsx`:
```tsx
export class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error): State { ... }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
}
```

**Fetch errors:** `try/catch` with error state + offline fallback:
```typescript
try {
  const data = await api.weather.getCurrent();
} catch (e) {
  console.error('Fetch error:', e);
  const cached = read("cache_key");
  if (cached?.data.length > 0) { setData(cached.data); setIsOffline(true); }
  else { setError(e instanceof Error ? e.message : 'Failed to load data'); }
}
```

**API error pattern in `src/services/api.ts`:**
```typescript
if (!response.ok) throw new Error("Failed to fetch ...");
// For some admin endpoints, parse error body:
if (!response.ok) {
  const err = await response.json();
  throw new Error(err.detail || "Failed to update");
}
```

**Offline detection:** Listens for `navigator.onLine` events, shows `OfflineBanner` component.

### Backend

**HTTP exceptions via FastAPI:**
```python
raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid password")
```

**Non-critical external API failures:** Return `None` and log warning:
```python
except httpx.HTTPStatusError as e:
    logger.warning("HKOClient HTTP error %s for %s: %s", e.response.status_code, data_type, e)
    return None
```

**Database operations:** Explicit `db.commit()` / `db.rollback()` in import/export endpoints.

**Seed failures:** Caught but non-blocking:
```python
try:
    await seed_weather_data()
except Exception:
    logger.exception("Seed failed (non-critical)")
```

## Logging

### Frontend

**Console-based only.** No structured logging framework.
- `console.error()` — fetch failures, React mount errors
- `console.warn()` — non-critical issues (metrics load failure)
- `console.log()` — app mount confirmation

### Backend

**Python `logging` module.** Module-level loggers:
```python
logger = logging.getLogger(__name__)
logger.warning("HKOClient HTTP error ...")
logger.exception("Seed failed (non-critical)")
```

**Audit logging:** Separate system using `RotatingFileHandler` in `backend/services/audit_logger.py`:
```python
audit_log(action="reset_metrics", ip=ip, details="all counters reset")
```
- JSON format: `{"timestamp": "...", "action": "...", "ip": "...", "details": "..."}`
- Configurable path via `AUDIT_LOG_PATH` env var (default `/app/backend/data/audit.log`)
- 10MB max file size, 5 rotating backups

## API Response Format

**Success responses:**
- List endpoints return arrays: `GET /api/weather/current` → `List[WeatherReadingResponse]`
- Detail endpoints return objects: `GET /api/weather/risks` → `{"risk_7_day": {...}, "risk_9_day": {...}, ...}`
- Mutation endpoints return `{"success": True, "message": "...", ...}`

**Error responses:**
- FastAPI default: `{"detail": "Error message"}` via `HTTPException`
- Custom detail in some endpoints: `{"detail": "Invalid password"}`

**Paginated endpoints** use `skip`/`limit` query params (not cursor-based):
```python
def get_donations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
```

**Empty data responses:**
```python
return {"history": [], "message": "No data available for the requested window."}
return {"readings": [], "message": f"No readings for {station} in last {hours}h."}
```

## Database Conventions

**ORM:** SQLAlchemy 2.x with classical `Column()` declarations (not `Mapped[]` / `Annotated` style).

**Declarative base:** `from backend.database import Base` — uses legacy `declarative_base()`.

**Migrations:** Alembic with migration files in `backend/migrations/versions/`.

**Default database:** SQLite (`climateshield.db`) for development, PostgreSQL supported via `DATABASE_URL`.

**SQLite pragmas:** WAL mode, NORMAL synchronous, MEMORY temp store (in `backend/database.py`).

**Schema evolution fallback:** `_ensure_risk_columns()` in `database.py` uses `ALTER TABLE` for adding columns when Alembic hasn't been run.

**Column conventions:**
- `id = Column(Integer, primary_key=True, index=True)` — auto-increment PK
- `created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)` — UTC timestamps
- `updated_at = Column(DateTime(timezone=True), onupdate=datetime.datetime.now)` — auto-update
- Float columns: `Column(Float, nullable=True)` for measurements
- JSON columns: `Column(JSON, nullable=False)` for configurable data (risk formula config)

---

*Convention analysis: 2026-05-17*