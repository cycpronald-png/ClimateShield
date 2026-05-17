# Pitfalls Research

**Domain:** Climate risk data pipeline — null propagation, fallback values, external API resilience, risk vocabulary unification
**Researched:** 2026-05-17
**Confidence:** HIGH (codebase-verified — every pitfall traced to actual code paths in ClimateShield)

## Critical Pitfalls

### Pitfall 1: Fallback Values Mask the Absence of Real Data (RH=70% Trap)

**What goes wrong:**
When `humidity_pct` is missing from HKO, the code falls back to RH=70% and computes a WBT as if it were real data. The downstream composite_risk_score, risk_level, and UI gauge all display as if the system has a real reading. Frontline workers see a plausible-looking score (e.g., 12/30 "Safe") that was computed from guessed humidity — not measured data. The score is never flagged as estimated, so the user trusts it completely.

**Why it happens:**
The orchestrator at `weather_orchestrator.py:378-382` does `calculate_wbt(r["temp_c"], rh or 70.0)` to "fix" null WBT. The `/live-score` endpoint at `weather.py:454-456` does the same. The `calculate_wbt` function itself at `wbt.py:25-26` returns `None` on null inputs, but the callers intercept the `None` and substitute the fallback before it reaches the user. The intent was to avoid 0.0/30, but the side effect is that every data quality problem becomes invisible.

**How to avoid:**
1. Add an `is_estimated` boolean column to `WeatherReading` and set it `True` whenever a fallback humidity was used.
2. Propagate `is_estimated` through API responses and expose it in the frontend (e.g., show a small "~" or "estimated" badge next to the score).
3. Never silently substitute — always surface which data is real vs. inferred.
4. Consider a `data_quality` field: `"measured"`, `"fallback_rh"`, `"missing"` — this lets the UI render different states.

**Warning signs:**
- DB rows where `humidity_pct = 70.0` and `is_estimated` doesn't exist — you can't tell measured 70% from fallback 70%
- Risk scores that seem "too consistent" across stations when HKO omits humidity for non-Observatory stations
- No test case where RH=70% fallback is explicitly asserted to be distinct from RH=70% measured

**Phase to address:**
Phase 1 (pipeline fix) — this is the core of the 0.0/30 fix. If the fallback is added without tracking, you've replaced one visible bug (0.0/30) with an invisible bug (plausible-but-wrong score).

---

### Pitfall 2: On-the-Fly Recomputation Diverges from Persisted Scores

**What goes wrong:**
The `/current` endpoint at `weather.py:82-102` recomputes `composite_risk_score` on-the-fly for null scores. The `/history` endpoint falls back to persisted scores "to preserve historical integrity" (`weather.py:314-324`). The `/trends` endpoint does on-the-fly computation for forecast rows (`weather.py:641-650`). These three code paths produce different scores for the same timestamp because:
- The persisted score used the warnings active at fetch time; on-the-fly uses warnings active now
- The persisted score used the consecutive hot nights count at fetch time; on-the-fly uses "today's" count
- The persisted score may have used a different `RiskFormulaConfig` version if admin edited it between fetch and display

Users see their dashboard jump between different scores depending on which endpoint the frontend polls.

**Why it happens:**
There are two conflicting design goals: (a) never show null/0.0 to users, and (b) preserve historical integrity. The code tries to satisfy both by choosing different strategies per endpoint, with no shared policy. The on-the-fly logic was added as a patch for root cause #4 (null CRS propagation) without reconciling with the persisted-score-first policy in `/history`.

**How to avoid:**
1. Establish a single canonical policy: **persist the score, never recompute on read**. If the score is null, fix it at write time (in `persist_weather_data`), not at read time.
2. If on-the-fly recomputation must exist (e.g., for resilience), it must use the *same* warning set and hot-night count that were active at the reading's `recorded_at` timestamp — not "now".
3. Add a recomputation audit: log when on-the-fly recomputation fires, what the original vs. recomputed value was, and why. This prevents silent divergence.

**Warning signs:**
- Same station shows different scores on the dashboard vs. the history modal
- `/trends` forward scores shift when warnings change, even though forecast data hasn't changed
- Tests that pass with `warnings=[]` but would fail with real warning data

**Phase to address:**
Phase 1 (pipeline audit) — the audit must trace all 5+ recomputation sites and standardize the policy. Phase 2 (end-to-end verification) must assert that the dashboard, history, and trends endpoints agree on the same score for the same reading.

---

### Pitfall 3: The `risk_level_from_wbt` Function Is a Vocabulary Time Bomb

**What goes wrong:**
`risk.py:26-36` defines `risk_level_from_wbt()` which returns `"Critical"`, `"High"`, `"Moderate"`, or `"Low"`. This is the **old vocabulary** (Critical/High/Moderate/Low). The v2 scoring engine (`scoring_v2.py:87-107`) returns `"Purple"`, `"Red"`, `"Yellow"`, `"Low"`, or `"Safe"`. Both functions write to `risk_level` in the same `WeatherReading` table and `SystemAlert` table. The result: the database contains a mix of old and new vocabulary strings, and the frontend has to handle both.

The `risk_level_from_wbt` function is still called in three places:
1. `weather_orchestrator.py:496` — auto-alert creation uses old vocabulary for `risk_level`
2. `risk.py:135` — `compute_risk_outlook` via `risk_level_from_wbt` returns old vocabulary
3. `risk.py:252` — `aggregate_station_wbts` returns old vocabulary

The frontend `types.ts:1` already declares the union type `'Safe' | 'Low' | 'Yellow' | 'Red' | 'Purple' | 'Low' | 'Moderate' | 'High' | 'Critical'` — note `Low` appears twice and the old terms are mixed in. This is a ticking time bomb.

**Why it happens:**
The v2 scoring engine was added as new code alongside the old v1 functions. No one removed or redirected the old functions. The re-export wrapper at `climate_engine.py` makes both APIs equally accessible, so importers naturally use whichever was available first.

**How to avoid:**
1. **Delete `risk_level_from_wbt` and `risk_level_from_max_temp`.** Replace all call sites with `compute_risk_score_v2(...)` → `result["state"]`.
2. **Database migration:** Add a SQL migration that maps old vocabulary to new: `Critical→Purple`, `High→Red`, `Moderate→Yellow`, `Low→Low`, empty→`Safe`.
3. **Constrain `risk_level` column:** Add a CHECK constraint or use a Python enum so the DB rejects old vocabulary strings at write time.
4. **Frontend type cleanup:** Remove `'Moderate' | 'High' | 'Critical'` from `RiskLevel` type. Add a runtime decoder that maps any old values to the nearest new value (defensive).

**Warning signs:**
- Test assertions that compare `risk_level` strings start failing inconsistently
- UI renders unknown colors or missing action text for old vocabulary values
- Database query `SELECT DISTINCT risk_level FROM weather_readings` returns 8+ distinct values

**Phase to address:**
Phase 1 (vocabulary unification) — this is the explicit target. But it must include the DB migration and the API-level validation, not just changing Python code. If only the Python code is changed, old rows in the DB still carry old vocabulary and will leak through API endpoints.

---

### Pitfall 4: Null CRS Replaced with "Safe" or 0.0 — Neither Is Correct

**What goes wrong:**
In the orchestrator at `weather_orchestrator.py:388-390`, when WBT is null after fallback, `composite_risk_score` is set to `None` and `risk_level` is set to `"Safe"`. In `/trends` at `weather.py:601`, `crs["value"] if crs else 0.0` converts None → 0.0. The UI then shows "0.0/30 Safe" — which is the exact visible symptom that this milestone is supposed to fix.

The problem: there's a legitimate difference between "we measured the weather and it's safe" (score=2, state=Safe) vs. "we couldn't measure the weather" (score=None, state=Unknown). The code conflates these, and 0.0/30 + "Safe" makes it look like the system is reporting safe conditions when it actually has no data.

**Why it happens:**
The `risk_level` column on `WeatherReading` is `String, nullable=True` (models.py:141). There's no `"Unknown"` state defined in the vocabulary. The `RiskStateMeta` in the frontend only defines 5 states (Safe/Low/Yellow/Red/Purple). There's no design for "no data available" as a distinct visual state.

**How to avoid:**
1. Add `"Unknown"` as a 6th risk state: grey color, "Data Unavailable" message, no action text.
2. Frontend `riskStates.ts` must handle `Unknown` with a distinct rendering (grey badge, pulsing "?" icon, explicit "data missing" message).
3. API responses must use `risk_level: "Unknown"` and `composite_risk_score: null` (not 0.0) when data is missing.
4. Frontend must never render a gauge value of 0.0 without first checking if `risk_level === "Unknown"`.

**Warning signs:**
- Users report "score stays at 0.0" after a fix
- Gauge shows green/Safe when HKO has an outage
- Test assertions that `composite_risk_score == 0.0` for null-data cases — these are wrong

**Phase to address:**
Phase 1 (pipeline fix + UI unknown-state handling) — must be done together. Fixing only the backend will still show 0.0 through the frontend's `crs["value"] if crs else 0.0` fallback.

---

### Pitfall 5: Forecast WBT Computation Uses `max_temp or 30.0` — A Hardcoded Default That Looks Like Real Data

**What goes wrong:**
At `weather_orchestrator.py:426`, the forecast WBT calculation uses `calculate_wbt(max_temp or 30.0, avg_rh)`. If HKO's forecast is missing `max_temp` for a day, the code silently substitutes 30°C and computes a WBT as if that were a real forecast. At 30°C with 70% RH, WBT ≈ 25.8°C, giving a score around 13-17 — firmly in Yellow territory. This is a phantom dangerous-reading that never existed in HKO's data.

**Why it happens:**
Python's `or` operator for fallback values is idiomatic and compact. The developer wrote `max_temp or 30.0` without considering that 30°C is a high-risk value for this domain — it's not a safe neutral default, it's within the danger zone. The same pattern appears at `weather.py:641`: `calculate_wbt(f.max_temp or 30, ...)`.

**How to avoid:**
1. Replace `max_temp or 30.0` with explicit null-check: `if max_temp is None: skip this forecast day`. Let the downstream code handle the missing day gracefully.
2. Never use domain-meaningful values as defaults. If you need a default temperature, use 0°C or -1°C (clearly wrong) rather than 30°C (plausibly right but dangerous).
3. Add an explicit test: "when HKO forecast has null max_temp, the day is excluded from WBT computation" (not "the day gets 30°C WBT").

**Warning signs:**
- Forecast shows suspiciously consistent 30°C-based scores on days when HKO data is sparse
- Extended forecast (Open-Meteo) shows different scores than HKO for overlapping days, and the difference is exactly what you'd expect from substituting 30°C vs. real max_temp
- Test mock data that uses 30°C as a "neutral" test value — this masks the bug in tests

**Phase to address:**
Phase 1 (pipeline audit) — this is a silent data corruption bug in the persist layer.

---

### Pitfall 6: `rh or 70.0` Pattern Is Truthy but Wrong for 0%

**What goes wrong:**
Across the codebase, `rh or 70.0` is used as a fallback for missing humidity. But Python's `or` returns the right operand when the left is *any* falsy value, including `0`. If HKO ever reports `humidity_pct = 0` (admittedly unlikely but possible in extreme dry conditions), the code would replace 0% humidity with 70% — completely inverting the risk assessment. A 0% humidity reading in Hong Kong would be anomalous and worth alerting on; replacing it with 70% would hide a real data anomaly.

**Why it happens:**
Python's truthiness doesn't distinguish `0` from `None`. The `or` pattern is used as a shorthand for "use fallback if missing", but `0` is a valid (if rare) humidity reading.

**How to avoid:**
1. Replace all `rh or 70.0` with `rh if rh is not None else 70.0` — explicit `is not None` check.
2. Audit all numeric fallbacks: search for `or <number>` patterns and replace with `is not None` guards.
3. Add a test: `calculate_wbt(35, 0)` should compute a valid WBT (very dry, very low WBT), not trigger the 70% fallback.

**Warning signs:**
- WBT values that seem "too reasonable" when humidity readings are at extreme lows
- A grep for ` or 70` across the codebase returns more than 0 results after the fix

**Phase to address:**
Phase 1 (pipeline fix) — search and replace across all Python files. This is cheap to fix but easy to miss.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `x or 70.0` fallback | Avoids null propagation with 1 line of code | Breaks when x=0 (truthy check); masks missing data | Never — use `x if x is not None else 70.0` |
| On-the-fly CRS recomputation at API read time | Avoids 0.0/30 display without DB migration | Scores diverge from persisted values; historical integrity lost | Only as emergency patch — must be replaced with write-time fix |
| `max_temp or 30.0` forecast default | Keeps forecast computation running when data is incomplete | Substitutes a dangerous value (30°C) silently; phantom risk scores | Never — skip the day or use clearly-wrong sentinel like -999 |
| Mixing old and new risk vocabulary in same DB column | Avoids migration work; both vocabularies "work" | Frontend union type grows; color/lookups break on old values; alert dedup mismatches | Never — do the vocabulary migration before declaring the feature done |
| `response_model_exclude_none=True` on `/current` | Cleaner API response; no `null` fields shown | Hides the difference between "missing" and "not applicable"; frontend can't distinguish unknown from zero | Only if all `None` values are truly "not applicable" — never for risk scores |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| HKO rhrread API | Assuming all stations report humidity; HKO often omits RH for non-Observatory stations | Build the humidity lookup with explicit fallback chain: per-station → HKO Observatory → null flag |
| HKO fnd forecast API | Trusting all fields are present; `forecastMintemp.value` can be null even on valid forecast days | Use `_safe_float()` with explicit handling; treat null min/max_temp as "skip this day from WBT computation" |
| HKO warnsum API | Assuming warning `signal` field is always present and parseable | Guard with `try/except` for signal parsing (already partially done at `weather.py:532-535` but not in persister) |
| Open-Meteo hourly API | Assuming arrays are same length across `time`, `temperature_2m_max`, `relative_humidity_2m_mean` | Validate array lengths before indexing; guard with `if i < len(rh) else None` |
| SQLAlchemy WeatherReading model | Setting `composite_risk_score = None` silently when WBT is null; SQLite allows null in Float column without complaint | Add a CHECK constraint or application-level validation; never write null CRS when temp data exists; use "Unknown" state |
| Frontend riskStates.ts ↔ Backend state_ranges config | Assuming frontend and backend use the same 5-state vocabulary; they can drift independently | Single source of truth: backend `/risk-config` endpoint should be the authority; frontend derives from it, with fallback to static copy |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| On-the-fly CRS recomputation in `/current` endpoint | API latency spikes when many readings have null CRS (e.g., after HKO outage) | Fix null CRS at write time; batch recompute stale rows in a migration | 10+ readings with null CRS on every request |
| `get_active_risk_config(db)` called per reading in loops | N+1 DB query pattern in `persist_weather_data` (currently mitigated by caching `risk_cfg` variable, but `/current` recomputation loops call it per-reading without caching) | Cache `risk_cfg` outside loops; load once per request | Not currently broken, but fragile — a refactor could easily introduce N+1 |
| SQLite concurrent writes from scheduler + manual refresh | Write contention during `/refresh` + scheduled poll overlap | `max_instances=1` on scheduler jobs mitigates this; but manual refresh has no such guard | Two concurrent `/refresh` calls during scheduler poll |
| Growing `weather_readings` table with no retention policy | Table scan times increase; `/history` endpoint slows | Add a retention policy (e.g., delete readings older than 90 days); add index on `recorded_at` (already exists) | 100K+ rows (months of 10-min readings) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `risk_level` column accepts arbitrary strings | An admin config change or code bug could write a value like `"Admin"` or `"exec(base64...)"` that frontend renders as HTML | Add CHECK constraint on `risk_level` column; use Python Enum for validation; sanitize on API read |
| Manual `/refresh` endpoint has no auth | Anyone can trigger HKO fetches at rate-limit (3/min), potentially causing upstream rate-limiting or IP bans from HKO | Add authentication to `/refresh` (shared admin password already exists) |
| `METRICS_PASSWORD` required at import time | If env var is missing, app crashes with `RuntimeError`; no fallback for development | Use `os.getenv("METRICS_PASSWORD", "dev")` with warning log in dev mode |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing 0.0/30 "Safe" when data is missing | Outreach workers think conditions are safe and don't deploy — dangerous when they're actually extreme | Show "Data Unavailable" with grey/unknown state; differentiate from measured 0.0/30 |
| Fallback RH=70% producing plausible-looking scores | Workers trust estimated scores as much as measured scores; estimated scores may be off by ±3°C WBT | Show "~" or "estimated" badge; show "last confirmed reading at [time]" when data is stale |
| Vocabulary mix showing "Critical" on some views and "Purple" on others | Confusion about severity; "Critical" sounds worse than "Purple" to a non-technical user | Unified vocabulary before any UI changes; if both must coexist temporarily, add a mapping tooltip |
| Gauge shows score during HKO outage as if live | Workers think fresh data when it's actually hours old | Show "last updated: X minutes ago" prominently; grey out gauge if data is >30 min stale |

## "Looks Done But Isn't" Checklist

- [ ] **RH=70% fallback:** Often missing — `is_estimated` flag on the DB row and API response; without it, fallback and measured are indistinguishable
- [ ] **Vocabulary unification:** Often missing — DB migration for existing rows with old vocabulary (Critical/High/Moderate/Low → Purple/Red/Yellow/Low); if only new writes are fixed, old rows leak through
- [ ] **0.0/30 fix:** Often missing — frontend still has `crs["value"] if crs else 0.0` patterns that convert null to 0.0; fixing only the backend doesn't fix the visible symptom
- [ ] **On-the-fly recomputation:** Often missing — assertion that on-the-fly and persisted scores agree for the same reading; without this, divergence is invisible
- [ ] **`rh or 70.0` cleanup:** Often missing — grep for `or 70` after the fix returns 0 results; easily missed in code review
- [ ] **`max_temp or 30.0` cleanup:** Often missing — forecast days with null max_temp should be excluded, not substituted; test coverage for this specific case
- [ ] **SystemAlert risk_level:** Often missing — `risk_level_from_wbt()` at `weather_orchestrator.py:496` still writes old vocabulary to SystemAlert; alerts use old vocabulary even after v2 engine conversion
- [ ] **Frontend `RiskLevel` type:** Often missing — union type still includes `'Moderate' | 'High' | 'Critical'` after backend unification; runtime decoder needed for old DB values

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| RH=70% fallback without `is_estimated` flag | MEDIUM | Add `is_estimated` column; backfill based on `humidity_pct = 70.0 AND station != 'Hong Kong Observatory'` heuristic; not 100% accurate but better than nothing |
| Mixed vocabulary in DB | LOW | SQL UPDATE: `SET risk_level = CASE risk_level WHEN 'Critical' THEN 'Purple' WHEN 'High' THEN 'Red' WHEN 'Moderate' THEN 'Yellow' ELSE risk_level END` — deterministic mapping |
| Diverged on-the-fly vs. persisted scores | MEDIUM | Batch recompute all rows with null CRS using historical warning data; add monitoring assertion at API level |
| `max_temp or 30.0` phantom risk scores | HIGH | Hard to detect after the fact — the forecast day looks valid. Must audit all `WeatherForecastDay` rows where `wet_bulb_peak` is suspiciously consistent (~25.8°C for 30°C+70%RH). Consider re-fetching historical forecasts. |
| `rh or 70.0` breaking on rh=0 | LOW | One-line fix per occurrence; regression test added; no data recovery needed since 0% RH is extraordinarily unlikely in HK |
| On-the-fly CRS recomputation causing latency | LOW | Fix null CRS at write time; run batch update on existing null rows; disable on-the-fly code path |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| RH=70% fallback without tracking | Phase 1 (pipeline fix) | Assert `is_estimated` column exists; grep for `or 70.` returns 0; test `calculate_wbt(35, 0)` computes correctly |
| On-the-fly vs. persisted score divergence | Phase 1 (pipeline audit) | Assert `/current`, `/history`, `/trends` return same CRS for same reading within 10 min window |
| `risk_level_from_wbt` old vocabulary | Phase 1 (vocabulary unification) | `SELECT DISTINCT risk_level FROM weather_readings` returns exactly 6 values (5 states + Unknown); `risk_level_from_wbt` function deleted |
| Null CRS → 0.0/30 "Safe" | Phase 1 (pipeline fix + UI) | Frontend renders grey/unknown state for null CRS; never renders 0.0/30 Safe for missing data |
| `max_temp or 30.0` phantom scores | Phase 1 (pipeline audit) | Forecast WBT computation skips days with null max_temp; no day has WBT computed from 30.0 default |
| `rh or 70.0` truthy bug | Phase 1 (pipeline fix) | Grep for `or 70` returns 0; test `calculate_wbt(35, 0.0)` returns valid WBT, not fallback |
| Mixed vocabulary in DB | Phase 1 (vocabulary unification) | DB migration runs; all old-vocabulary rows updated; CHECK constraint added |
| Frontend union type with old vocab | Phase 1 (vocabulary unification) | TypeScript `RiskLevel` type contains only 6 values; runtime decoder handles any old values from DB |
| Growing readings table | Phase 2 (end-to-end verification) | `/history` endpoint responds in <500ms with 90 days of data; retention policy documented |

## Sources

- Codebase analysis: `weather_orchestrator.py`, `weather.py`, `risk.py`, `scoring_v2.py`, `wbt.py`, `models.py`, `riskStates.ts`, `types.ts`
- Root cause inventory from PROJECT.md (6 root causes documented)
- `hne.py` for HNE threshold reference (17.7 °C·h)
- Python truthiness documentation for `or` vs `is not None` distinction
- SQLite null handling semantics for Float columns
- HKO Open Data API observed behavior: humidity omission for non-Observatory stations

---
*Pitfalls research for: ClimateShield v1.1 Risk Score Reliability pipeline*
*Researched: 2026-05-17*