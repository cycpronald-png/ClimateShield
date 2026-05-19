"""
Legacy Composite Risk Score (CRS) module.

All old scoring functions have been removed. The new 0-30 risk score
formula lives in backend.services.climate.scoring_v2.

This file is retained as a placeholder so existing imports don't break
until all references are fully migrated.
"""

# Re-export the new v2 scoring function for convenience
from backend.services.climate.scoring_v2 import compute_risk_score_v2  # noqa: F401

# Old constants removed — use the config from RiskFormulaConfig table instead
# CRS_THRESHOLDS, EXTENDED_RISK_BANDS, EXTENDED_WEIGHTS, EXTENDED_RAW_MAX
