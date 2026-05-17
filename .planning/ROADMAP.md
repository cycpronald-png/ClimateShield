# Roadmap: ClimateShield

## Overview

Increase risk sensitivity to match actual homeless exposure thresholds (lower WBT bands ~2°C, lower HNE trigger to H>=1), fix the 14-Day Risk Outlook /20 scale inconsistency to unified /30, then verify everything end-to-end before deployment.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Backend Sensitivity Changes** - Lower WBT thresholds and HNE trigger so risk scores activate at milder conditions
- [ ] **Phase 2: Frontend Scale Consistency** - Fix 14-Day Risk Outlook /20 → /30 scale throughout the frontend
- [ ] **Phase 3: End-to-End Verification** - Validate sensitivity changes produce correct scores, /20 is gone, build and deploy clean

## Phase Details

### Phase 1: Backend Sensitivity Changes
**Goal**: Risk scores activate at milder conditions matching actual homeless exposure — WBT ≥24°C produces non-zero score, single hot night triggers vulnerability
**Depends on**: Nothing (first phase, brownfield codebase)
**Requirements**: SENS-01, SENS-02, SENS-03, SENS-04, SENS-05, SENS-06, SENS-07
**Success Criteria** (what must be TRUE):
  1. A station reporting WBT of 24°C produces a non-zero WBT component score (was 0 before the threshold change)
  2. A single hot night (1 consecutive night with min_temp >= 28°C) triggers vulnerability (V > 0), whereas previously 2+ nights were required
  3. Admin RiskFormulaPanel displays and allows editing of the new threshold values (wb_t1=24, wb_t2=27, wb_t3=30, wb_t4=33, trigger_h_score=1)
  4. Risk states (Safe/Low/Yellow/Red/Purple) and their 0-30 score boundaries (0-12, 13-16, 17-22, 23-26, 27-30) remain unchanged
**Plans**: TBD

### Phase 2: Frontend Scale Consistency
**Goal**: All UI displays use the unified /30 risk scale with no /20 artifacts — 14-Day Outlook, Peak Risk, and status messages all consistent
**Depends on**: Nothing (independent of Phase 1 — /20 issue is display/formula, not threshold logic)
**Requirements**: SCAL-01, SCAL-02, SCAL-03, SCAL-04, SCAL-05
**Success Criteria** (what must be TRUE):
  1. 14-Day Risk Outlook shows every score as X/30 with state labels from the 0-30 framework (never X/20)
  2. All "Peak Risk" entries in 14-Day Outlook display scores with /30 denominator and correct state labels
  3. Status messages in 14-Day Outlook derive state from the 0-30 composite risk lookup, not a /20 scale
  4. No hardcoded /20 references or old percentage-scale logic remain anywhere in the frontend codebase
**Plans**: TBD
**UI hint**: yes

### Phase 3: End-to-End Verification
**Goal**: All sensitivity and scale changes are verified correct, buildable, and deployable
**Depends on**: Phase 1, Phase 2 (verifies both sets of changes together)
**Requirements**: VERI-01, VERI-02, VERI-03, VERI-04, VERI-05
**Success Criteria** (what must be TRUE):
  1. Current HKO WBT in the ~22-24°C range produces non-zero risk scores at stations where WBT >= 24°C (confirming SENS-01 works)
  2. A single hot night (min_temp >= 28°C) produces vulnerability (V > 0) in risk calculation (confirming SENS-02 works)
  3. 14-Day Risk Outlook shows consistent /30 scale throughout with no /20 artifacts visible anywhere (confirming SCAL changes)
  4. TypeScript compiles with 0 errors and Vite build succeeds
  5. Docker containers rebuild and deploy with all changes applied
**Plans**: TBD

## Progress

**Execution Order:**
Phases 1 and 2 are independent and can execute in parallel. Phase 3 requires both to complete.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Sensitivity Changes | 0/? | Not started | - |
| 2. Frontend Scale Consistency | 0/? | Not started | - |
| 3. End-to-End Verification | 0/? | Not started | - |