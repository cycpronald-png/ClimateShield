# Requirements: ClimateShield

**Defined:** 2026-05-17
**Core Value:** Instant risk recognition and predictive early warning — frontline workers must see the risk state at a glance and know what's coming next so they can act before conditions endanger homeless people.

## v1 Requirements

### Risk Sensitivity

- [x] **SENS-01**: WBT scoring bands use lowered thresholds: WBT < 24°C = 0, 24–27°C = 2, 27–30°C = 4, ≥30°C = 6 (shifted ~2°C down from 25.9/28.9/31.9)
- [x] **SENS-02**: HNE vulnerability triggers at H>=1 (1+ consecutive hot night) instead of H>=2, so outreach teams are alerted after a single dangerous night
- [x] **SENS-03**: `DEFAULT_CONFIG` in `risk_config_service.py` updated with new WBT thresholds (wb_t1=24, wb_t2=27, wb_t3=30, wb_t4=33) and trigger_h_score=1
- [x] **SENS-04**: DB seed migration updated with new default thresholds and trigger_h_score
- [x] **SENS-05**: Active risk config in running DB updated to reflect new thresholds
- [x] **SENS-06**: Admin RiskFormulaPanel reflects and can edit the new threshold values
- [x] **SENS-07**: Risk states (Safe/Low/Yellow/Red/Purple) and their score ranges remain 0-30 with same boundaries (0-12, 13-16, 17-22, 23-26, 25-30)

### Scale Consistency

- [ ] **SCAL-01**: 14-Day Risk Outlook displays scores on /30 scale (not /20) — investigate whether computation also uses old formula
- [ ] **SCAL-02**: All "Peak Risk" displays in 14-Day Outlook show scores as X/30 with state labels matching 0-30 framework
- [ ] **SCAL-03**: All status messages in 14-Day Outlook reference /30 scale (e.g., "Score 6" shows state from 0-30 lookup, not /20)
- [ ] **SCAL-04**: ForecastComparison component uses composite_risk_score (0-30) for all displays, no residual /20 references
- [ ] **SCAL-05**: Audit entire frontend for any remaining hardcoded /20 references or old percentage-scale logic

### Verification

- [ ] **VERI-01**: After WBT threshold change, current HKO WBT ~22-24°C produces non-zero scores at stations where WBT >= 24°C
- [ ] **VERI-02**: After HNE trigger change, a single hot night (min_temp >= 28°C) triggers vulnerability (V > 0)
- [ ] **VERI-03**: 14-Day Risk Outlook shows consistent /30 scale throughout with no /20 artifacts
- [ ] **VERI-04**: TypeScript compiles cleanly (0 errors), Vite build succeeds
- [ ] **VERI-05**: Docker containers rebuild and deploy with all changes

## v2 Requirements

### Extended Forecast

- **FCST-01**: Forecast horizon extended beyond 9 days for strategic outreach planning
- **FCST-02**: HNE projection logic works with extended forecast data

### Proactive Alerts

- **ALRT-01**: Push notifications when risk state changes (e.g., Safe → Yellow)
- **ALRT-02**: Daily digest summary of upcoming risk conditions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Additional monitoring stations | Current 5 stations sufficient for outreach districts |
| Street-level sensor integration | HKO + Open-Meteo only for reliability |
| Mobile native app | Web-first responsive dashboard |
| Multi-city expansion | Hong Kong focused |
| Historical climate trend analysis | Not critical for frontline operations |
| Changing risk state boundaries (0-12, 13-16, etc.) | State ranges remain the same; only input thresholds change |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SENS-01 | Phase 1 | Complete |
| SENS-02 | Phase 1 | Complete |
| SENS-03 | Phase 1 | Complete |
| SENS-04 | Phase 1 | Complete |
| SENS-05 | Phase 1 | Complete |
| SENS-06 | Phase 1 | Complete |
| SENS-07 | Phase 1 | Complete |
| SCAL-01 | Phase 2 | Pending |
| SCAL-02 | Phase 2 | Pending |
| SCAL-03 | Phase 2 | Pending |
| SCAL-04 | Phase 2 | Pending |
| SCAL-05 | Phase 2 | Pending |
| VERI-01 | Phase 3 | Pending |
| VERI-02 | Phase 3 | Pending |
| VERI-03 | Phase 3 | Pending |
| VERI-04 | Phase 3 | Pending |
| VERI-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-17*
*Last updated: 2026-05-17 after roadmap creation*