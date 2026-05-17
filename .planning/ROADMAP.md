# Roadmap: ClimateShield

## Overview

v1.0 (complete): Increased risk sensitivity to match homeless exposure thresholds, unified /30 scale. v1.1: Eradicate 0.0/30 display bug by fixing every null-propagation point in the HKO→DB→API→UI pipeline, eliminate vocabulary drift, and audit the full data pipeline for silent failures.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): v1.0 milestone work (COMPLETE)
- Integer phases (4, 5, 6, 7): v1.1 milestone work
- Decimal phases (4.1, 4.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 (COMPLETE)

- [x] **Phase 1: Backend Sensitivity Changes** - Lower WBT thresholds and HNE trigger so risk scores activate at milder conditions
- [x] **Phase 2: Frontend Scale Consistency** - Fix 14-Day Risk Outlook /20 → /30 scale throughout the frontend
- [x] **Phase 3: End-to-End Verification** - Validate sensitivity changes produce correct scores, /20 is gone, build and deploy clean

### v1.1: Risk Score Reliability

- [ ] **Phase 4: Pipeline Resilience** - Fix truthy bugs and null-propagation so CRS is never null when temp data exists
- [ ] **Phase 5: Vocabulary Unification** - Canonical RiskState enum, delete legacy functions, normalize all code paths to Safe/Low/Yellow/Red/Purple
- [ ] **Phase 6: Frontend Reliability** - Gray badge for unknown scores, remove legacy color mappings, clean RiskLevel type
- [ ] **Phase 7: Data Integrity Verification** - All 5 stations produce non-null CRS, truthy bug eliminated, no phantom scores, build+tests pass

## Phase Details

### Phase 1: Backend Sensitivity Changes (COMPLETE)
**Goal**: Risk scores activate at milder conditions matching actual homeless exposure
**Depends on**: Nothing (first phase, brownfield codebase)
**Requirements**: SENS-01, SENS-02, SENS-03, SENS-04, SENS-05, SENS-06, SENS-07
**Success Criteria**:
  1. WBT of 24°C produces non-zero WBT component score
  2. Single hot night triggers vulnerability (V > 0)
  3. Admin RiskFormulaPanel displays and edits new thresholds
  4. Risk states and 0-30 boundaries unchanged
**Plans**: 3/3 complete

### Phase 2: Frontend Scale Consistency (COMPLETE)
**Goal**: All UI displays use unified /30 risk scale
**Depends on**: Nothing (independent of Phase 1)
**Requirements**: SCAL-01, SCAL-02, SCAL-03, SCAL-04, SCAL-05
**Success Criteria**:
  1. 14-Day Risk Outlook shows X/30 with state labels
  2. Peak Risk entries display /30 denominator
  3. Status messages derive from 0-30 lookup
  4. No /20 references remain
**Plans**: 2/2 complete

### Phase 3: End-to-End Verification (COMPLETE)
**Goal**: All changes verified correct, buildable, deployable
**Depends on**: Phase 1, Phase 2
**Requirements**: VERI-01, VERI-02, VERI-03, VERI-04, VERI-05
**Success Criteria**:
  1. WBT >=24°C produces non-zero scores
  2. Single hot night triggers V > 0
  3. /30 scale consistent everywhere
  4. TypeScript 0 errors, Vite build succeeds
  5. Docker containers rebuild and deploy
**Plans**: 1/1 complete

### Phase 4: Pipeline Resilience
**Goal**: Fix every null-propagation point so `composite_risk_score` is never null when temperature data exists — eliminate truthy bugs and dangerous defaults
**Depends on**: Nothing (bug fixes in existing code)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria**:
  1. `rh or 70.0` replaced with `rh if rh is not None else 70.0` everywhere — `rh=0` no longer silently replaced with `rh=70`
  2. `max_temp or 30.0` replaced — null max_temp days skipped, no phantom scores from 30°C default
  3. `persist_weather_data()` guarantees WBT computed for any reading with `temp_c` (RH=70% fallback)
  4. `/api/weather/current` recomputes CRS on-the-fly for readings with null `composite_risk_score` but non-null WBT
  5. `/api/weather/live-score` recomputes WBT from `temp_c+rh` when persisted WBT is null, no longer 404s
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Fix truthy bugs (rh or 70.0 → is not None), null max_temp skip, persist WBT guarantee
- [ ] 04-02-PLAN.md — Harden /current CRS recomputation and /live-score WBT fallback

### Phase 5: Vocabulary Unification
**Goal**: Single canonical vocabulary (Safe/Low/Yellow/Red/Purple) across all backend code paths — delete legacy functions, normalize all DB reads
**Depends on**: Phase 4 (pipeline must be stable before vocabulary migration)
**Requirements**: VOCAB-01, VOCAB-02, VOCAB-03
**Success Criteria**:
  1. `vocabulary.py` contains `RiskState` enum, V1→V2 mapping dict, and `normalize_risk_level()` — no other code defines risk level names
  2. `risk_level_from_wbt()` and `risk_level_from_max_temp()` deleted — zero callers remain
  3. All `SystemAlert` and alert generation code outputs v2 vocabulary terms only
**Plans**: TBD

### Phase 6: Frontend Reliability
**Goal**: Frontend never shows misleading 0.0/30 Safe — unknown/missing data shows gray "---" badge; all color mappings use v2 vocabulary only
**Depends on**: Phase 5 (frontend must match unified backend vocabulary)
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria**:
  1. RiskScoreGauge shows gray badge + "---" + "Computing risk score…" when score is unknown (not "0.0/30 Safe")
  2. RiskGrid and StationDetailModal color map contains only Safe/Low/Yellow/Red/Purple entries
  3. `types.ts` RiskLevel type is `'Safe' | 'Low' | 'Yellow' | 'Red' | 'Purple'` only — no duplicates, no legacy terms
**Plans**: TBD
**UI hint**: yes

### Phase 7: Data Integrity Verification
**Goal**: Verify the full pipeline produces correct, non-null risk scores for all 5 stations with real HKO data
**Depends on**: Phase 4, Phase 5, Phase 6 (verifies all v1.1 changes together)
**Requirements**: V11-01, V11-02, V11-03, V11-04
**Success Criteria**:
  1. All 5 stations produce non-null `composite_risk_score` when any temperature data exists
  2. `rh=0` is not silently replaced with `rh=70` (truthy bug eliminated)
  3. Forecast days with null `max_temp` produce no CRS (no phantom scores)
  4. TypeScript 0 errors, Vite build succeeds, all backend tests pass
**Plans**: TBD

## Progress

**Execution Order:**
Phase 4 can start immediately (bug fixes). Phase 5 depends on Phase 4 stability. Phase 6 depends on Phase 5 vocabulary. Phase 7 verifies all.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Sensitivity Changes | 3/3 | Complete | 2026-05-17 |
| 2. Frontend Scale Consistency | 2/2 | Complete | 2026-05-17 |
| 3. End-to-End Verification | 1/1 | Complete | 2026-05-17 |
| 4. Pipeline Resilience | 0/2 | Planned | - |
| 5. Vocabulary Unification | 0/? | Not started | - |
| 6. Frontend Reliability | 0/? | Not started | - |
| 7. Data Integrity Verification | 0/? | Not started | - |

---
*Roadmap updated: 2026-05-17 — v1.1 phases 4-7 added*