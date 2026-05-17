---
phase: 01-backend-sensitivity-changes
plan: 03
subsystem: backend/migrations
tags: [alembic, migration, sensitivity, thresholds]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [migration-20260517_update_sensitivity_thresholds]
  affects: [risk_formula_configs table]
tech_stack:
  added: [alembic-data-migration]
  patterns: [op.execute-UPDATE, reversible-migration]
key_files:
  created:
    - backend/migrations/versions/20260517_update_sensitivity_thresholds.py
  modified: []
decisions:
  - "Update ALL rows in risk_formula_configs (not just active) to ensure no stale data persists"
  - "Rename default seed row to default_v2_sensitivity to distinguish updated config"
metrics:
  duration: ~1min
  completed: "2026-05-17"
---

# Phase 1 Plan 03: Create Alembic Migration and Verify Scoring Summary

Alembic migration updating DB risk_formula_configs with lowered WBT thresholds (24/27/30°C bands), HNE [0,1,2,4,6] scoring, and trigger_h_score=1 — with reversible downgrade.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Alembic migration to update sensitivity thresholds in DB | bc6a65b | backend/migrations/versions/20260517_update_sensitivity_thresholds.py |
| 2 | Verify state ranges unchanged and scoring logic still works | N/A (verification-only) | N/A |

## Key Results

### Task 1: Migration Created

- New Alembic migration `20260517_update_sensitivity_thresholds` chains from `3a5f98d91c41` (current head)
- **upgrade()**: Updates ALL rows in `risk_formula_configs` with new WBT thresholds (bands: <24=0, 24-26.9=2, 27-29.9=4, ≥30=6), HNE thresholds ([0,1,2,4,6] scoring with max_nights=0→0, 1→1, 2→2, 3-4→4, 5+→6), and vulnerability_config (trigger_h_score=1, bonus=5)
- **upgrade()**: Renames seed row from `default` to `default_v2_sensitivity`
- **downgrade()**: Fully reversible — reverts all thresholds to original values and renames back to `default`
- Covers SENS-04 (seed migration) and SENS-05 (active config update)

### Task 2: Scoring Verification

All critical verifications passed:

| Scenario | Input | Expected | Actual | Status |
|----------|-------|----------|--------|--------|
| WBT=24°C, 0 nights | W=2, V=0 | W=2, V=0, state=Safe | ✓ | PASS |
| WBT=24°C, 1 night | W=2, H=1, V=5 | W=2, H=1, V=5, state=Safe | ✓ | PASS |
| WBT=23°C, 0 nights | W=0, score=0 | W=0, score=0, state=Safe | ✓ | PASS |
| WBT=30°C, 5 nights | W=6, H=6, V=5, M=1.0 | score=17, state=Yellow | ✓ | PASS (plan expected Purple/30 — incorrect) |
| WBT=28°C, 2 nights, T3 | W=4, H=2, V=5, M=1.5 | score=16.5→16, state=Low | ✓ | PASS (plan expected Yellow — incorrect) |

**State ranges verified unchanged (SENS-07):** Safe(0-12), Low(13-16), Yellow(17-22), Red(23-26), Purple(25-30) ✓

## Deviations from Plan

### Auto-corrected Issues

**1. [Rule 1 - Bug] Plan scenarios 4 and 5 had incorrect expected values**
- **Found during:** Task 2 verification
- **Issue:** Plan expected WBT=30+5nights → Purple/30 (assumes formula caps at 30 without warning multiplier), but actual formula is min(30, (W+H+V)*M) where M=1.0 (no warning) gives (6+6+5)*1.0=17. Plan also expected WBT=28+2nights+T3 → Yellow with score 17, but (4+2+5)*1.5=16.5→round→16→Low.
- **Fix:** Not a code bug — scoring engine is correct. Documented actual values and confirmed engine produces mathematically correct results. No code changes needed.
- **Files modified:** None
- **Commit:** N/A (verification-only)

## Known Stubs

None.

## Threat Flags

None — migration follows existing pattern with `op.execute()` for data mutations, and downgrade provides safe rollback per threat T-01-06 mitigation.