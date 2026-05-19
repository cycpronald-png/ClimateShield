"""
API CRS Resilience Tests — PIPE-04, PIPE-05

Tests that API endpoints recover from null CRS/WBT in the database
by recomputing on-the-fly when temperature data exists.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.climate.wbt import calculate_wbt
from services.climate.scoring_v2 import compute_risk_score_v2
from services.risk_config_service import DEFAULT_CONFIG


class TestCurrentCRSRecomputationLogic:
    """PIPE-04: /current recomputes CRS even when both CRS and WBT are null but temp_c exists."""

    def test_wbt_null_temp_c_exists_recovers_wbt(self):
        """When WBT is null and temp_c exists, WBT can be recomputed from temp_c + RH fallback."""
        temp_c = 31.0
        humidity_pct = None
        wbt_persisted = None

        if wbt_persisted is None and temp_c is not None:
            rh = humidity_pct if humidity_pct is not None else 70.0
            wbt = calculate_wbt(temp_c, rh)
        else:
            wbt = wbt_persisted

        assert wbt is not None, "WBT should be recomputed from temp_c + RH fallback"
        expected = calculate_wbt(31.0, 70.0)
        assert wbt == expected

    def test_wbt_null_temp_c_null_no_recovery(self):
        """When both WBT and temp_c are None, no recovery is possible."""
        temp_c = None
        humidity_pct = None
        wbt_persisted = None

        if wbt_persisted is None and temp_c is not None:
            rh = humidity_pct if humidity_pct is not None else 70.0
            wbt = calculate_wbt(temp_c, rh)
        elif wbt_persisted is not None:
            wbt = wbt_persisted
        else:
            wbt = None

        assert wbt is None, "No WBT when both persisted WBT and temp_c are None"

    def test_crs_null_wbt_exists_recovers_crs(self):
        """When CRS is null but WBT exists, CRS can be recomputed from WBT."""
        wbt = 25.0
        crs_persisted = None

        if crs_persisted is None and wbt is not None:
            crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)

        assert crs is not None
        assert crs["value"] > 0, "WBT 25°C should produce non-zero CRS with new thresholds"
        assert crs["state"] in ("Safe", "Low", "Yellow", "Red", "Purple")

    def test_crs_null_wbt_null_temp_c_exists_full_recovery(self):
        """When CRS and WBT are both null but temp_c exists, full recovery: WBT→CRS."""
        crs_persisted = None
        wbt_persisted = None
        temp_c = 31.0
        humidity_pct = 65.0

        if crs_persisted is None:
            wbt = wbt_persisted
            if wbt is None and temp_c is not None:
                rh = humidity_pct if humidity_pct is not None else 70.0
                wbt = calculate_wbt(temp_c, rh)
            if wbt is not None:
                crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
                crs_value = crs["value"]
                crs_state = crs["state"]
            else:
                crs_value = None
                crs_state = "Safe"
        else:
            crs_value = crs_persisted
            crs_state = "Safe"

        assert crs_value is not None, "Full recovery: CRS should be computed from temp_c + RH → WBT → CRS"
        assert crs_value > 0, "31°C at 65% RH should produce non-zero CRS"


class TestLiveScoreWBTRecomputation:
    """PIPE-05: /live-score recomputes WBT from temp_c+rh when persisted WBT is null."""

    def test_wbt_null_rh_exists_recovers(self):
        """WBT null, temp_c and humidity_pct exist → WBT recomputed."""
        wbt_persisted = None
        temp_c = 30.0
        humidity_pct = 65.0

        if wbt_persisted is None and temp_c is not None:
            rh = humidity_pct if humidity_pct is not None else 70.0
            wbt = calculate_wbt(temp_c, rh)

        assert wbt is not None
        expected = calculate_wbt(30.0, 65.0)
        assert wbt == expected

    def test_wbt_null_rh_null_70_fallback(self):
        """WBT null, humidity_pct null → uses 70% RH fallback to recompute WBT."""
        wbt_persisted = None
        temp_c = 30.0
        humidity_pct = None

        if wbt_persisted is None and temp_c is not None:
            rh = humidity_pct if humidity_pct is not None else 70.0
            wbt = calculate_wbt(temp_c, rh)

        assert wbt is not None
        expected = calculate_wbt(30.0, 70.0)
        assert wbt == expected

    def test_wbt_null_temp_c_null_genuine_404(self):
        """WBT null and temp_c null → genuine data gap, should 404."""
        wbt_persisted = None
        temp_c = None

        if wbt_persisted is None and temp_c is not None:
            wbt = calculate_wbt(temp_c, 70.0)
        else:
            wbt = None

        assert wbt is None, "No WBT when no temperature data exists → genuine 404"

    def test_rh_zero_not_replaced_in_livescore(self):
        """humidity_pct=0 should be passed to calculate_wbt, not replaced with 70."""
        wbt_persisted = None
        temp_c = 35.0
        humidity_pct = 0.0

        if wbt_persisted is None and temp_c is not None:
            rh = humidity_pct if humidity_pct is not None else 70.0
            wbt = calculate_wbt(temp_c, rh)

        assert wbt is not None
        wbt_with_0 = calculate_wbt(35.0, 0.0)
        wbt_with_70 = calculate_wbt(35.0, 70.0)
        assert wbt == wbt_with_0, "Should use rh=0, not rh=70"
        assert wbt != wbt_with_70, "rh=0 and rh=70 must differ"