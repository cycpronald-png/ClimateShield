---
phase: 01-backend-sensitivity-changes
plan: 01
subsystem: api
tags: [risk-scoring, wbt, hne, vulnerability, sensitivity, config]

# Dependency graph
requires: []
provides:
  - Lowered WBT thresholds (24/27/30°C bands) in DEFAULT_CONFIG
  - Lowered HNE vulnerability trigger (trigger_h_score=1) in DEFAULT_CONFIG
  - Shifted HNE scores so H=1 is valid and triggers vulnerability
  - Fixed validate_risk_config to allow intentional state range overlaps
affects: [01-02-PLAN, 01-03-PLAN, frontend-risk-formula-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [tdd-red-green-for-config-changes]

key-files:
  created: [backend/tests/__init__.py, backend/tests/test_risk_config_sensitivity.py]
  modified: [backend/services/risk_config_service.py]

key-decisions:
  - "Allowed intentional state range overlaps in validate_risk_config (Red/Purple overlap at 25-26) since lookup_state resolves via priority order"
  - "HNE scores shifted from [0,1,2,4] to [0,1,2,4,6] so trigger_h_score=1 references a valid HNE score"

patterns-established:
  - "TDD for config changes: write tests for threshold values first, then update config"

requirements-completed: [SENS-01, SENS-02, SENS-03]

# Metrics
duration: 1min
completed: 2026-05-17
---

# Phase 1 Plan 1: Backend Sensitivity Changes Summary

**Lowered WBT thresholds to 24/27/30°C bands, HNE trigger to H>=1, shifted HNE scores to [0,1,2,4,6], fixed validator overlap handling**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-17T07:43:36Z
- **Completed:** 2026-05-17T07:44:58Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- WBT 24°C now produces score 2 (was 0) — scores activate at milder conditions matching homeless exposure
- Single hot night (H=1) triggers vulnerability V=5 (was V=0 because trigger required H>=2)
- HNE scores shifted to [0,1,2,4,6] so trigger_h_score=1 references a valid score
- Fixed validate_risk_config to allow intentional Red/Purple state overlap (25-26)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update DEFAULT_CONFIG with lowered WBT thresholds and HNE trigger** - TDD with 2 commits:
   - `b531477` (test) - RED: 12 failing tests for new threshold expectations
   - `d9b2af5` (feat) - GREEN: DEFAULT_CONFIG updated, validator fixed, all 19 tests pass

_Note: TDD task had test → feat commits_

## Files Created/Modified
- `backend/services/risk_config_service.py` - Updated DEFAULT_CONFIG with lowered WBT/HNE thresholds, fixed validator overlap handling
- `backend/tests/test_risk_config_sensitivity.py` - 19 tests covering WBT mapping, HNE mapping, vulnerability trigger, and config validation

## Decisions Made
- Allowed intentional state range overlaps in validate_risk_config — the Red/Purple overlap at scores 25-26 is by design (priority order: Purple > Red), so the validator should not reject it. Changed gap/overlap check to only reject gaps (uncovered scores), not overlaps.
- HNE scores shifted from [0,1,2,4] to [0,1,2,4,6] so that trigger_h_score=1 references a valid HNE score. Score 6 for 5+ nights is higher than the previous 4, reflecting increased severity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed validate_risk_config rejecting intentional state range overlaps**
- **Found during:** Task 1 (implementation)
- **Issue:** validate_risk_config enforced strict contiguous ranges (no overlaps), but DEFAULT_CONFIG intentionally has Red(23-26)/Purple(25-30) overlap resolved by priority order in lookup_state. The validator rejected its own DEFAULT_CONFIG — this was a pre-existing bug.
- **Fix:** Changed overlap detection to gap detection: `s["min"] > prev["max"] + 1` rejects gaps but allows overlaps. Updated comment from "no gaps/overlaps" to "overlaps allowed (resolved by priority order)".
- **Files modified:** backend/services/risk_config_service.py
- **Verification:** validate_risk_config(DEFAULT_CONFIG) passes, all 19 tests pass
- **Committed in:** d9b2af5 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — validator bug)
**Impact on plan:** Fix was required for validate_risk_config to pass with the new config. No scope creep — the validator now correctly handles the existing design pattern.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend DEFAULT_CONFIG updated, ready for frontend RiskFormulaPanel alignment (01-02-PLAN)
- Ready for Alembic migration that persists new defaults to database (01-03-PLAN)
- Scoring integrity is preserved: validate_risk_config passes, lookup functions work with new thresholds

## Self-Check: PASSED

- All created/modified files exist on disk
- Both commits (b531477, d9b2af5) found in git log
- validate_risk_config(DEFAULT_CONFIG) passes
- 19/19 tests pass

---
*Phase: 01-backend-sensitivity-changes*
*Completed: 2026-05-17*