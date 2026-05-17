# ClimateShield

## What This Is

A real-time climate risk awareness dashboard for Hong Kong homeless outreach teams. The Hong Kong Observatory (HKO) provides public weather data but does not provide wet-bulb temperature or evidence-based metrics reflecting what homeless people actually experience on the street. ClimateShield fills this gap by computing WBT-based composite risk scores, predicting upcoming dangerous conditions, and consolidating everything into a single actionable dashboard — enabling outreach teams to deploy the right person, at the right time, to the right location, before extreme weather hits.

## Core Value

Instant risk recognition and predictive early warning — frontline workers must see the risk state at a glance (Safe/Yellow/Red/Purple) and know what's coming next so they can act before conditions endanger homeless people.

## Requirements

### Validated

- ✓ Real-time HKO weather data ingestion with 10-minute polling — existing
- ✓ Composite 0-30 risk score computation (WBT + HNE + Vulnerability × Warning Multiplier) — existing
- ✓ 5-station monitoring (HKO, Kai Tak, Kings Park, Kowloon City, Sham Shui Po) — existing
- ✓ WBT time-series graph (15-40°C Y-axis, 5 risk bands, pulsing current marker) — existing
- ✓ 9-day forecast with hot night excess projection and temperature-aware streak logic — existing
- ✓ Live risk score endpoint with full component breakdown (W, H, V, M) — existing
- ✓ Risk score gauge with friendly status messages ("Safe — No Immediate Risk") and theoretical max bar — existing
- ✓ Warning deduplication (both orchestrator-level and endpoint-level) — existing
- ✓ Admin-editable risk formula parameters (WBT thresholds, trigger_h_score, multipliers) — existing
- ✓ Lowered WBT thresholds (24/27/30/33°C) for homeless-exposure sensitivity — Phase 1
- ✓ HNE vulnerability trigger at H>=1 (single hot night) — Phase 1
- ✓ Frontend/backend DEFAULT_CONFIG synchronized with new sensitivity values — Phase 1
- ✓ Donation pledge system with drop-off locations and impact tracking — existing
- ✓ Docker deployment with frontend + backend containers — existing

### Active

- [ ] Fix 14-Day Risk Outlook displaying /20 scale — investigate whether display-only or uses old scoring formula, then fix to consistent /30 scale across all views
- [ ] Extended forecast horizon beyond 9 days for strategic outreach planning and supply stockpiling
- [ ] Proactive alert system (push notifications, SMS, or messaging app) when risk state changes (deferred to future stage)

### Out of Scope

- Additional HKO monitoring stations beyond current 5 — current coverage sufficient for outreach districts
- Street-level microclimate sensors or IoT data integration — HKO + Open-Meteo only for reliability
- Mobile native app — web-first responsive dashboard
- Multi-city/regional expansion — Hong Kong focused
- Historical climate trend analysis or seasonal comparison — not critical for frontline operations

## Context

- HKO publishes open weather data but lacks WBT and evidence-based street-level risk metrics
- Homeless outreach teams previously operated without data-driven risk assessment, relying on experience and general weather forecasts
- The WBT composite risk framework (0-30 scale) was designed specifically for this use case: WBT directly measures heat stress the body experiences, HNE captures consecutive dangerous nights, vulnerability triggers when sustained heat compounds, and warnings multiply risk during typhoon/rainstorm events
- **Sensitivity problem**: Current WBT thresholds (25.9/28.9/31.9C) are too high for the homeless use case - at ~22-24C HKO WBT the score is 0, but homeless people are already exposed at these temperatures. New thresholds (24/27/30/33C) will shift scores to activate at milder conditions
- **HNE trigger too conservative**: H>=2 (3-4 nights) means vulnerability does not kick in until sustained heat is already severe. H>=1 (1+ night) will trigger earlier intervention
- **14-Day /20 inconsistency**: The 14-Day Risk Outlook still shows scores like "6/20" and status messages referencing the old /20 scale - needs investigation and fix to /30
- The 5 tracked stations cover the key districts where homeless outreach operates
- Frontline workers need simple, at-a-glance risk states — they do NOT need detailed score breakdowns during active operations (breakdown panel was removed per user feedback)
- Theoretical max bar (30/30) provides context for how severe the current score is relative to worst-case
- Temperature-aware hot night projection: if forecast min_temp >= 28°C the streak continues (+1), otherwise resets to 0 — reflects actual homeless exposure risk

## Constraints

- **Tech Stack**: React 19 + TypeScript + Vite + FastAPI + SQLAlchemy + SQLite — established and working
- **Data Sources**: HKO API + Open-Meteo only — no other data sources for reliability and government trust
- **Deployment**: Docker Desktop (macOS/Windows) — single-machine deployment for now
- **Stations**: Exactly 5 HKO network stations — no expansion planned
- **Scale**: Single-city (Hong Kong), single-team usage — not designed for multi-org yet
- **Auth**: Single shared admin password (lazy evaluation) — sufficient for current deployment
- **Database**: SQLite — adequate for single-instance deployment, no concurrent write concerns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 0-30 composite risk scale (not 0-100) | Matches observable risk states (Safe/Low/Yellow/Red/Purple) without false precision | ✓ Good |
| WBT as primary risk driver (not dry-bulb temperature) | WBT measures heat stress the body actually experiences, including humidity | ✓ Good |
| HNE trigger at H>=2 (not H>=3) | HNE scores [0,1,2,4] - value 2 maps to 3-4 consecutive nights | ⚠️ Revisit — lowering to H>=1 for earlier intervention |
| **NEW: Lower WBT thresholds (24/27/30/33°C)** | Current thresholds too high for homeless exposure at milder conditions | ✓ Good — Phase 1 |
| **NEW: Lower HNE trigger to H>=1** | One hot night already endangers homeless people; earlier intervention saves lives | ✓ Good — Phase 1 |
| **NEW: Fix 14-Day /20 → /30 inconsistency** | All UI must use unified /30 scale; /20 legacy display undermines trust | — Pending |
| Priority-ordered state lookup (Purple > Red > Yellow > Low > Safe) | Overlap zones between bands — worst case wins for safety | ✓ Good |
| Removed score breakdown panel from gauge | Confused frontline workers during active operations — they need state + message, not formula | ✓ Good |
| Dashboard-only alerts (no push/SMS yet) | Teams check proactively; push alerts deferred to future stage | — Pending |
| 9-day forecast horizon | Matches HKO forecast data; longer horizon needed for strategic planning | ⚠️ Revisit — need extended horizon |
| SQLite over PostgreSQL | Single-instance deployment, no concurrent writes, simpler ops | ✓ Good |
| Docker deployment | Reproducible across macOS/Windows, no environment drift | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-17 after Phase 1 completion*