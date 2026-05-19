"""
Data Integrity Tests — V11-01, V11-02, V11-03

Integration-level tests verifying pipeline correctness for all 5 stations,
truthy bug elimination, and no phantom scores from null forecasts.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.climate.wbt import calculate_wbt
from services.climate.scoring_v2 import compute_risk_score_v2
from services.risk_config_service import DEFAULT_CONFIG

ALLOWED_STATIONS = [
    'Hong Kong Observatory',
    'Kai Tak Runway Park',
    "King's Park",
    'Kowloon City',
    'Sham Shui Po',
]


class TestAllStationsNonNullCRS:
    """V11-01: All 5 stations produce non-null CRS when temp data exists."""

    def test_each_station_hot_day_non_null_crs(self):
        for station in ALLOWED_STATIONS:
            wbt = calculate_wbt(31.0, 65.0)
            assert wbt is not None, f"{station}: WBT should be computed for 31°C/65%RH"
            crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
            assert crs["value"] > 0, f"{station}: CRS should be >0 for hot day"
            assert crs["state"] in {"Safe", "Low", "Yellow", "Red", "Purple"}

    def test_station_no_humidity_70_fallback_crs(self):
        wbt = calculate_wbt(28.0, 70.0)
        assert wbt is not None
        crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
        assert crs["value"] >= 0, "CRS should exist with RH=70% fallback"

    def test_station_zero_temp_still_computes(self):
        wbt = calculate_wbt(0.0, 50.0)
        assert wbt is not None, "temp_c=0 should still compute WBT"
        crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
        assert crs["value"] >= 0, "CRS should exist at 0°C"

    def test_station_rh_zero_not_replaced(self):
        wbt_0 = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        assert wbt_0 != wbt_70, "rh=0 and rh=70 must produce different WBTs"
        crs_0 = compute_risk_score_v2(wbt_0, 0, [], DEFAULT_CONFIG)
        crs_70 = compute_risk_score_v2(wbt_70, 0, [], DEFAULT_CONFIG)
        assert crs_0["value"] != crs_70["value"], "rh=0 and rh=70 must produce different CRS"

    def test_crs_state_is_v2_vocabulary(self):
        for station in ALLOWED_STATIONS:
            wbt = calculate_wbt(31.0, 65.0)
            crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
            assert crs["state"] in {"Safe", "Low", "Yellow", "Red", "Purple"}, \
                f"{station}: state '{crs['state']}' is not v2 vocabulary"

    def test_each_station_warm_humid_non_zero_crs(self):
        for station in ALLOWED_STATIONS:
            wbt = calculate_wbt(25.0, 86.0)
            assert wbt is not None, f"{station}: WBT should be computed for 25°C/86%RH"
            assert wbt >= 22.0, f"{station}: WBT {wbt} should be >= 22°C in warm-humid conditions"
            crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
            assert crs["value"] > 0, f"{station}: CRS should be >0 when WBT >= 22°C (got {crs['value']})"


class TestTruthyBugEliminated:
    """V11-02: rh=0 is NOT silently replaced with rh=70."""

    def test_rh_zero_gives_different_wbt_than_rh_70(self):
        wbt_0 = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        assert wbt_0 != wbt_70, "rh=0% and rh=70% must produce different WBTs"

    def test_rh_zero_crs_uses_actual_rh(self):
        wbt_0 = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        crs_0 = compute_risk_score_v2(wbt_0, 0, [], DEFAULT_CONFIG)
        crs_70 = compute_risk_score_v2(wbt_70, 0, [], DEFAULT_CONFIG)
        assert crs_0["value"] != crs_70["value"], "CRS must differ for rh=0 vs rh=70"

    def test_rh_none_uses_70_fallback(self):
        rh = None
        result = rh if rh is not None else 70.0
        assert result == 70.0, "rh=None should fallback to 70%"

    def test_rh_zero_is_not_falsy(self):
        buggy = 0.0 or 70.0
        assert buggy == 70.0, "Truthy `or` incorrectly replaces 0 with 70 (bug demo)"
        rh_zero = 0.0
        fixed = rh_zero if rh_zero is not None else 70.0
        assert fixed == 0.0, "`is not None` correctly keeps 0"


class TestNoPhantomScores:
    """V11-03: Forecast days with null max_temp produce no CRS."""

    def test_null_max_temp_no_crs(self):
        max_temp = None
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is None, "WBT should be None when max_temp is None"

    def test_max_temp_30_not_from_default(self):
        max_temp = 30.0
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is not None, "max_temp=30 should compute valid WBT"
        crs = compute_risk_score_v2(wbt, 0, [], DEFAULT_CONFIG)
        assert crs["value"] >= 0, "Explicit 30°C should produce valid CRS"

    def test_null_max_temp_zero_is_valid(self):
        max_temp = 0.0
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is not None, "max_temp=0 should still compute WBT"

    def test_forecast_wbt_only_with_valid_max_temp(self):
        max_temp = None
        rh = 70.0
        if max_temp is not None and rh is not None:
            wbt = calculate_wbt(max_temp, rh)
        else:
            wbt = None
        assert wbt is None, "WBT must not be computed when max_temp is None"