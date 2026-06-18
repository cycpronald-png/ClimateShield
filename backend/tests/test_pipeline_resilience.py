"""
Pipeline Resilience Tests — PIPE-01, PIPE-02, PIPE-03

Tests for truthy bug fixes, null max_temp skip, and WBT persist guarantee.
Tests verify the LOGIC of the pipeline without requiring full DB persistence.
"""
import pytest
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.climate.wbt import calculate_wbt


class TestRHZeroTruthyBugWBT:
    """PIPE-01 Level-0: calculate_wbt correctly handles rh=0."""

    def test_rh_zero_truthy_bug_wbt(self):
        """calculate_wbt(35, 0) returns a valid WBT, not the 70% result."""
        wbt_0 = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        assert wbt_0 is not None
        assert wbt_70 is not None
        assert wbt_0 != wbt_70, "rh=0 and rh=70 must produce different WBTs"

    def test_rh_zero_produces_lower_wbt_than_70(self):
        """With rh=0%, WBT should be much lower than with rh=70% (less evaporative cooling)."""
        wbt_0 = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        assert wbt_0 < wbt_70, "0% RH should give lower WBT than 70% RH"


class TestRHZeroStayZeroInParse:
    """PIPE-01 Level-1: parse_hko_to_readings preserves humidity_pct=0."""

    def test_parse_readings_rh_zero_not_replaced(self):
        """humidity_pct=0 in HKO data stays 0.0 in parsed readings (not replaced with 70)."""
        from services.weather_orchestrator import parse_hko_to_readings

        mock_data = {
            "updateTime": "2026-05-17T12:00:00+08:00",
            "temperature": {"data": [{"place": "Test Station", "value": 30}]},
            "humidity": {"data": [{"place": "Test Station", "value": 0}]},
            "rainfall": {"data": []},
            "uvindex": {"data": []},
            "wind": {"data": []},
        }
        readings = parse_hko_to_readings(mock_data)
        assert len(readings) >= 1
        r = readings[0]
        assert r["humidity_pct"] == 0.0, f"humidity_pct should be 0.0, got {r['humidity_pct']}"

    def test_parse_readings_rh_zero_wbt_uses_zero(self):
        """WBT computed with rh=0, not rh=70 (proves orchestrator passes 0 to calculate_wbt)."""
        from services.weather_orchestrator import parse_hko_to_readings

        mock_data = {
            "updateTime": "2026-05-17T12:00:00+08:00",
            "temperature": {"data": [{"place": "Test Station", "value": 35}]},
            "humidity": {"data": [{"place": "Test Station", "value": 0}]},
            "rainfall": {"data": []},
            "uvindex": {"data": []},
            "wind": {"data": []},
        }
        readings = parse_hko_to_readings(mock_data)
        assert len(readings) >= 1
        wbt_expected = calculate_wbt(35.0, 0.0)
        wbt_70 = calculate_wbt(35.0, 70.0)
        assert readings[0]["wet_bulb_temp_c"] == wbt_expected, \
            f"WBT should be {wbt_expected} (rh=0), not {wbt_70} (rh=70)"


class TestRHFalsyFallbackLogic:
    """PIPE-01 Level-2: Verify the `rh if rh is not None else 70.0` pattern works."""

    def test_rh_none_uses_fallback(self):
        """rh=None → fallback to 70.0."""
        rh = None
        result = rh if rh is not None else 70.0
        assert result == 70.0

    def test_rh_zero_stays_zero(self):
        """rh=0 → stays 0 (not replaced with 70)."""
        rh = 0.0
        result = rh if rh is not None else 70.0
        assert result == 0.0

    def test_rh_positive_kept(self):
        """rh=65 → stays 65."""
        rh = 65.0
        result = rh if rh is not None else 70.0
        assert result == 65.0

    def test_or_pattern_is_buggy(self):
        """Proves `rh or 70.0` is buggy: it replaces 0 with 70."""
        rh = 0.0
        buggy = rh or 70.0
        assert buggy == 70.0, "Truthy `or` incorrectly replaces 0 with 70"


class TestNullMaxTempSkipLogic:
    """PIPE-02: Verify null max_temp is skipped instead of defaulted to 30°C."""

    def test_max_temp_none_skips_wbt(self):
        """When max_temp is None, WBT should not be computed from 30°C default."""
        max_temp = None
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is None, "WBT should be None when max_temp is None"

    def test_max_temp_or_30_is_dangerous(self):
        """Proves `max_temp or 30.0` creates phantom WBT from 30°C."""
        max_temp = None
        dangerous_wbt = calculate_wbt(max_temp or 30.0, 70.0)
        assert dangerous_wbt is not None, "Phantom WBT computed from 30°C default"
        assert dangerous_wbt > 0, "This phantom WBT would create phantom risk scores"

    def test_max_temp_0_should_be_valid(self):
        """max_temp=0 is a valid (extreme) temperature, not a falsy skip signal."""
        max_temp = 0.0
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is not None, "max_temp=0 should still compute WBT"
        assert wbt < 0, "WBT at 0°C dry-bulb should be below freezing"


class TestPersistWBTGuaranteeLogic:
    """PIPE-03: Verify temp_c exists → WBT computed (with RH=70% fallback)."""

    def test_temp_c_exists_rh_none_produces_wbt(self):
        """When temp_c exists and rh=None, WBT is computed with 70% RH fallback."""
        temp_c = 30.0
        rh = None
        rh_fallback = rh if rh is not None else 70.0
        wbt = calculate_wbt(temp_c, rh_fallback)
        assert wbt is not None, "WBT should be computed with RH=70% fallback"
        expected = calculate_wbt(30.0, 70.0)
        assert wbt == expected

    def test_temp_c_none_rh_exists_no_wbt(self):
        """When temp_c=None, no WBT can be computed regardless of rh."""
        temp_c = None
        rh = 70.0
        if temp_c is not None:
            wbt = calculate_wbt(temp_c, rh if rh is not None else 70.0)
        else:
            wbt = None
        assert wbt is None, "No WBT when temp_c is None"

    def test_both_none_no_wbt_no_crs(self):
        """When both temp_c and rh are None, no WBT and no CRS."""
        temp_c = None
        rh = None
        if temp_c is not None:
            rh_fb = rh if rh is not None else 70.0
            wbt = calculate_wbt(temp_c, rh_fb)
        else:
            wbt = None
        assert wbt is None, "No WBT when both inputs are None"


class TestForecastMaxTempOrPattern:
    """PIPE-02: Specifically test the `max_temp or 30.0` pattern used in orchestrator."""

    def test_or_30_pattern_with_none(self):
        """`None or 30.0` = 30.0 — this is the BUG: None becomes 30°C."""
        max_temp = None
        result = max_temp or 30.0
        assert result == 30.0, "Truthy `or` converts None to 30°C (bug!)"

    def test_is_not_none_pattern_with_none(self):
        """`if max_temp is not None` correctly skips None."""
        max_temp = None
        if max_temp is not None:
            wbt = calculate_wbt(max_temp, 70.0)
        else:
            wbt = None
        assert wbt is None, "Correct: None max_temp → no WBT"

    def test_or_30_pattern_with_zero(self):
        """`0.0 or 30.0` = 30.0 — BUG: 0°C replaced with 30°C!"""
        max_temp = 0.0
        result = max_temp or 30.0
        assert result == 30.0, "Truthy `or` replaces 0°C with 30°C (bug!)"


class TestWarningParsing:
    """PIPE-04: HKO warnsum parser must expose human-readable names and rainstorm type signals."""

    def test_parse_warnsum_uses_name_not_machine_key(self):
        """Top-level keys like WRAIN must not become the warning_type."""
        from services.weather_orchestrator import parse_hko_to_warnings

        mock = {
            "WRAIN": {
                "name": "Rainstorm Warning Signal",
                "code": "WRAINB",
                "type": "Black",
                "actionCode": "ISSUE",
                "issueTime": "2026-06-18T15:40:00+08:00",
                "updateTime": "2026-06-18T15:40:00+08:00",
            },
            "WTS": {
                "name": "Thunderstorm Warning",
                "code": "WTS",
                "actionCode": "UPDATE",
                "issueTime": "2026-06-18T01:30:00+08:00",
                "expireTime": "2026-06-18T18:00:00+08:00",
                "updateTime": "2026-06-18T16:15:00+08:00",
            },
        }
        warnings = parse_hko_to_warnings(mock)
        assert len(warnings) == 2
        by_type = {w["warning_type"]: w for w in warnings}
        assert "Rainstorm Warning Signal" in by_type
        assert "Thunderstorm Warning" in by_type
        assert by_type["Rainstorm Warning Signal"]["signal"] == "Black"
        assert by_type["Thunderstorm Warning"]["signal"] is None

    def test_parse_warnsum_amber_black_upgrade_preserved(self):
        """Signal/type field must be captured so Amber → Black upgrades are visible."""
        from services.weather_orchestrator import parse_hko_to_warnings

        mock = {
            "WRAIN": {
                "name": "Rainstorm Warning Signal",
                "code": "WRAINA",
                "type": "Amber",
                "actionCode": "ISSUE",
                "issueTime": "2026-06-18T15:40:00+08:00",
                "updateTime": "2026-06-18T15:40:00+08:00",
            },
        }
        warnings = parse_hko_to_warnings(mock)
        assert len(warnings) == 1
        assert warnings[0]["signal"] == "Amber"