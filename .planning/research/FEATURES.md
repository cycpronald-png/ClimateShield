# Feature Research

**Domain:** Real-time climate risk scoring dashboard with external API data pipeline
**Researched:** 2026-05-17
**Confidence:** HIGH (deep codebase audit + domain knowledge from 6 identified root causes)

## Feature Landscape

### Table Stakes (Users Expect These)

Features frontline outreach workers assume exist. Missing = dashboard feels unreliable or dangerous (showing 0.0/30 when conditions are actually hazardous).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Never show 0.0/30 when data is missing** | A false-zero risk score is life-threatening — teams may skip deployment assuming conditions are safe | MEDIUM | 6 root causes identified; requires fixes across WBT null fallback, CRS recomputation, live-score resilience, and UI unknown-state display |
| **Missing-data indicator replaces null scores** | Any safety dashboard must distinguish "score is 0 because safe" from "score is unknown because data is missing" | LOW | Frontend change: show "---" / "Computing..." / gray badge when `composite_risk_score` is null or unknown, not "0.0" |
| **WBT computed even when humidity is missing** | HKO omits per-station humidity in ~40% of payloads for non-Observatory stations; without fallback, WBT is None and entire score collapses to null | LOW | Already decided: RH=70% fallback (typical HK summer mean). Implementation exists partially in `persist_weather_data`; needs enforcement at `calculate_wbt` entry and `/live-score` endpoint |
| **Unified risk level vocabulary everywhere** | Mixed Critical/High/Moderate/Low (backend) vs Safe/Low/Yellow/Red/Purple (frontend) means the same score produces different labels in different views — confuses operators | MEDIUM | `risk.py` uses old vocabulary; `scoring_v2.py` uses new vocabulary; `riskStates.ts` uses new vocabulary. Must audit all 3 code paths + DB `risk_level` column values and unify |
| **API endpoints never return null risk score when temp data exists** | `/current` endpoint returns `composite_risk_score: null` as-is when DB has null, propagating the problem to frontend | LOW | On-the-fly recomputation pattern exists in `/current` (line 82-102); needs identical treatment in `/history`, `/trends`, and forecast endpoints |
| **Stale data indicator** | When HKO API is down, teams need to know whether the displayed score is from 10 minutes ago or 3 hours ago | LOW | `/last-refresh` endpoint exists; frontend `LastRefreshDisplay` component exists; needs integration with "data freshness" threshold (e.g. >30 min = stale badge) |
| **Graceful degradation on API failure** | If HKO fetch fails, the dashboard must show last-known-good data with "stale" indicator, not a blank page or zero scores | MEDIUM | `useOfflineCache` exists (sessionStorage); `OfflineBanner` exists; but neither is wired into the Risk Intelligence page data flow. Need to connect existing infrastructure. |

### Differentiators (Competitive Advantage)

Features that set ClimateShield apart from basic weather displays. Not required for baseline safety, but dramatically improve operational confidence.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Risk score confidence indicator** | Show how reliable the current score is (real-time vs estimated vs stale), enabling teams to adjust confidence in their deployment decisions | MEDIUM | Requires a `data_quality` or `confidence` field: `realtime` (full data), `estimated` (RH fallback used), `stale` (data older than threshold). Attach to API responses and display in UI. |
| **Pipeline health audit trail** | Log every point where null propagation was prevented (fallback triggered, score recomputed, old vocabulary translated) so operators can trust the system and developers can debug | MEDIUM | `audit_logger` infrastructure exists but only used for admin resets. Extend to record: WBT fallback events, CRS recomputation events, vocabulary translation events. Store in existing `GenerationCounter` or new `PipelineAuditLog` table. |
| **RH fallback accuracy indicator** | Show when the 70% RH fallback is in play and how far it might be from reality (e.g. ±5°C WBT uncertainty band) | MEDIUM | Requires computing WBT at RH=60% and RH=80% to show a range. Complex to display nicely. Consider for v1.2. |
| **Automatic vocabulary migration for historic DB rows** | When unifying vocabulary, old DB rows still have `risk_level: "Critical"` — migrate them to "Purple" so historical data is consistent | HIGH | DB migration script + backfill. Risky if historic labels had different semantic ranges. Consider read-time translation instead: map old→new at API boundary without mutating historical data. |
| **Data pipeline circuit breaker** | If HKO is down for >1 hour, stop trying and switch to "degraded mode" indicator instead of burning API calls on every 10-min poll | MEDIUM | Pattern exists in `_scheduled_refresh` retry logic. Extend with circuit-breaker state tracking (consecutive failures count, open/half-open/closed state). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Aggressive retry on HKO failure (every 1 minute)** | "We need data ASAP, retry faster!" | HKO rate-limits; faster retries can get IP banned. Also masks upstream outages instead of degrading gracefully. | Exponential backoff with max 1-hour retry (already partially implemented in `_scheduled_refresh`). Show "data stale" badge instead of hammering API. |
| **Backfill missing scores in historical DB rows** | "Historical records with null scores look broken" | Backfilling re-runs current formula against old data. Formula may change (admin-editable thresholds), making backfilled scores inconsistent with contemporaneous scores. Also risk updating rows that other systems may depend on. | On-the-fly recomputation at read time (already in `/current`, `/history`). Persist only re-computed scores going forward. Display "estimated" badge for computed-from-fallback scores. |
| **Auto-reconnect with instant data refresh on network recovery** | "When internet comes back, show latest data immediately" | Creates race conditions if a scheduled poll fires at the same time. Also, instant refresh after long outage can cause jarring score jumps that confuse operators. | Let scheduled poll handle recovery (10-min interval). Add manual "Refresh Now" button (already exists). On recovery, show "data restored" notification, not instant silent update. |
| **"Unknown" risk level as a 6th state** | "We need a state for when data is missing" | The 5-state system (Safe/Low/Yellow/Red/Purple) is deliberately simple for frontline workers. Adding "Unknown" as a 6th color-coded state adds cognitive load. | Keep 5 states. When score is unknown, show "---" / gray badge / "Computing risk score..." text. This is a *display* concern, not a new risk level. The current `stateFromScore()` should never receive null; it's the pipeline's job to never let null reach it. |
| **Per-station humidity interpolation from surrounding stations** | "If station X humidity is missing, average the nearest stations" | HKO station network is sparse (5 stations); averaging creates false precision and can be wildly off during localized weather (thunderstorms). | Use the HKO Observatory RH as proxy (already implemented). This is a known-better-than-missing approach. Interpolation adds complexity without meaningful accuracy gain. |

## Feature Dependencies

```
[Unified Risk Vocabulary]
    └──blocks──> [Pipeline Audit Trail]
                     └──requires──> [Consistent risk level labels in log messages]

[WBT Null Fallback (RH=70%)]
    └──enables──> [Never Show 0.0/30]
                     └──requires──> [Missing-Data UI Indicator]
    └──enables──> [Risk Score Confidence Indicator]

[On-the-Fly CRS Recomputation]
    └──enables──> [Never Show 0.0/30]
    └──requires──> [Unified Risk Vocabulary] (recomputed scores must use new labels)

[Stale Data Indicator]
    └──requires──> [Graceful Degradation on API Failure]

[Data Pipeline Circuit Breaker]
    └──conflicts──> [Aggressive Retry] (mutually exclusive strategies)
```

### Dependency Notes

- **Unified Risk Vocabulary blocks Pipeline Audit Trail:** Can't log which vocabulary was used if the vocabulary is still inconsistent. Fix vocabulary first, then add audit logging.
- **WBT Null Fallback enables Never Show 0.0/30:** The 0.0/30 bug's root cause #1 is WBT returning None when RH is missing. The fallback is a prerequisite for the fix.
- **On-the-Fly CRS Recomputation requires Unified Vocabulary:** If `/current` recomputes a score using `scoring_v2.py` (which returns new vocabulary), but `risk.py` still uses old vocabulary, the same reading could produce two different `risk_level` values depending on which code path computes it.
- **Stale Data Indicator requires Graceful Degradation:** You can't show "stale" if the app crashes when HKO is down. Degradation must come first.
- **Circuit Breaker conflicts with Aggressive Retry:** These are opposite strategies for handling HKO downtime. Circuit breaker (stop trying) is correct for a safety dashboard — stale data with an indicator is safer than hammering the API and risking rate-limit bans.

## MVP Definition (v1.1 Milestone)

### Fix Now (v1.1 — This Milestone)

Minimum needed to eradicate the 0.0/30 display problem and achieve pipeline reliability.

- [ ] **WBT null fallback (RH=70%)** — enforced at all 3 entry points: `persist_weather_data`, `/live-score`, `calculate_wbt` — eliminates root cause #1 and #2
- [ ] **On-the-fly CRS recomputation** — extend to `/history`, `/trends`, and forecast endpoints — eliminates root cause #3 and #5
- [ ] **Missing-data UI indicator** — RiskScoreGauge shows "---" and gray badge when score unknown, never "0.0" — eliminates root cause #6
- [ ] **Unified risk vocabulary** — replace Critical→Purple, High→Red, Moderate→Yellow in `risk.py`, `_generate_advisory`, `should_create_alert`, `run_hne_daily_check`, and all DB writes — eliminates root cause #4
- [ ] **Stale data freshness badge** — wire `LastRefreshDisplay` into Risk Intelligence page; show visual indicator when data >30 minutes old

### Add After Pipeline Is Fixed (v1.2)

Features to add once the core reliability baseline is established.

- [ ] **Risk score confidence indicator** — `realtime` / `estimated` / `stale` field on API responses (trigger: field operators report uncertainty about score accuracy)
- [ ] **Pipeline audit trail** — structured log of null-handling events (trigger: need to debug why a score looks wrong)
- [ ] **Circuit breaker for HKO outages** — (trigger: HKO goes down for extended period and system shows degraded behavior)
- [ ] **Push/SMS alert system** — (trigger: teams not checking dashboard proactively enough)

### Future Consideration (v2+)

- [ ] **RH fallback accuracy band** — (defer: requires significant UX design for uncertainty display; not urgent if confidence indicator exists)
- [ ] **Historic DB row vocabulary migration** — (defer: read-time translation is safer; only migrate if reporting/analytics needs consistent labels)
- [ ] **Multi-city expansion** — (defer: single-city focus is deliberate constraint)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| WBT null fallback (RH=70%) | HIGH (eliminates false-zero) | LOW (3 insertion points, trivial logic) | P1 |
| Missing-data UI indicator | HIGH (safety-critical display fix) | LOW (frontend conditional, no API change) | P1 |
| Unified risk vocabulary | HIGH (eliminates mixed-state confusion) | MEDIUM (6+ code locations, DB reads, backward compat) | P1 |
| On-the-fly CRS recomputation | HIGH (prevents null through API) | LOW (pattern already exists, extend to 3 more endpoints) | P1 |
| Stale data freshness badge | MEDIUM (operators know data age) | LOW (existing infrastructure, wire up) | P1 |
| Graceful degradation wiring | MEDIUM (prevents blank dashboard on offline) | MEDIUM (connect useOfflineCache to Risk Intelligence data hooks) | P2 |
| Risk score confidence indicator | MEDIUM (enables trust decisions) | MEDIUM (new API field + frontend display) | P2 |
| Pipeline audit trail | LOW-MEDIUM (debugging tool) | MEDIUM (new table + logging points) | P2 |
| Circuit breaker | LOW (HKO rarely down >1 hour) | MEDIUM (state machine + scheduler changes) | P3 |
| RH fallback accuracy band | LOW (nice-to-have uncertainty display) | HIGH (significant UX + math) | P3 |

**Priority key:**
- P1: Must have for v1.1 — eliminate 0.0/30 and achieve pipeline reliability
- P2: Should have once core is stable — trust and observability
- P3: Nice to have, future consideration

## Competitor/Reference Feature Analysis

| Feature | Weather.gov (US) | Met Office (UK) | BoM (Australia) | ClimateShield Approach |
|---------|-------------------|-----------------|-----------------|----------------------|
| Null/missing data handling | Shows "N/A" or dashes for missing station data; never zero | Shows "--" or "Data unavailable" | Shows "No data" label; retains last reading | Show "---" + gray badge; retain last score with "stale" indicator |
| Stale data indicator | Timestamp displayed per station | "Last updated" header with auto-refresh | Data freshness color coding (green/amber/red based on age) | Last-refresh timestamp + >30min visual warning |
| API failure graceful degradation | Cached last reading shown with stale timestamp | Falls back to summary forecast if detailed data unavailable | Shows last observation with "observation may be delayed" banner | Show last-known-good + stale badge; manual refresh available |
| Risk level vocabulary | Fixed NWS tiers (None/Advisory/Watch/Warning) | Fixed Met Office color bands | Fixed BoM warning tiers (Advice/Watch/Warning/Emergency) | Fixed 5-state system (Safe/Low/Yellow/Red/Purple); no ad-hoc levels |
| Data quality flags | QC flags on station data (V=verified, P=preliminary) | Quality flags on observations | Data quality indicators | Confidence indicator: realtime / estimated / stale |

## Existing Infrastructure to Leverage

| Existing Component | Feature It Supports | Gap to Fill |
|--------------------|---------------------|-------------|
| `useOfflineCache` (sessionStorage) | Graceful degradation | Not wired into Risk Intelligence data fetch hooks |
| `OfflineBanner` component | Stale data indicator | Not rendered in Risk Intelligence page layout |
| `LastRefreshDisplay` component | Data freshness | Exists but needs integration with Risk Intelligence page |
| `/last-refresh` API endpoint | Data freshness | Returns timestamp; frontend doesn't poll it from Risk page |
| `ErrorBoundary` component | Crash resilience | Generic React error boundary; doesn't handle partial data failure |
| `audit_logger` service | Pipeline audit trail | Only used for metrics reset; needs extension for null-handling events |
| `health_service.py` | System health | Checks DB + HKO + disk; could add "data freshness" check |
| `GenerationCounter` model | Impact tracking | Could pivot for pipeline event counters (fallback_count, recomputation_count) |

## Sources

- Codebase audit: Full read of `weather_orchestrator.py`, `wbt.py`, `risk.py`, `scoring_v2.py`, `weather.py` API, `scheduler.py`, `RiskScoreGauge.tsx`, `riskStates.ts`, `api.ts`, `schemas.py`, `models.py`, `useOfflineCache.ts`, `OfflineBanner.tsx`, `ErrorBoundary.tsx`, `health_service.py`, `last_refresh.py`
- PROJECT.md v1.1 milestone context: 6 root causes for 0.0/30 documented with specificity
- TanStack Query docs (Context7): `placeholderData` / `keepPreviousData` patterns for avoiding blank states during data transitions — validates our "show last-known-good" approach
- FastAPI/Pydantic docs (Context7): `response_model_exclude_none` and Optional field patterns — confirms null propagation is a schema design decision, not an accident
- Weather.gov, Met Office, BoM: Reference implementations for public weather dashboard null-handling patterns (MEDIUM confidence — based on public-facing UI observation, not code access)

---
*Feature research for: ClimateShield v1.1 Risk Score Reliability*
*Researched: 2026-05-17*