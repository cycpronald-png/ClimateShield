"""
Vocabulary module tests — VOCAB-01.

Tests for RiskState enum, V1_TO_V2 mapping, and normalize_risk_level().
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.climate.vocabulary import RiskState, V1_TO_V2, normalize_risk_level


class TestRiskStateEnum:
    """VOCAB-01: RiskState enum has exactly 5 members matching v2 state names."""

    def test_enum_has_five_members(self):
        assert len(RiskState) == 5

    def test_enum_members(self):
        names = {state.name for state in RiskState}
        assert names == {"Safe", "Low", "Yellow", "Red", "Purple"}

    def test_no_data_unavailable_member(self):
        assert not hasattr(RiskState, "DataUnavailable")


class TestV1ToV2Mapping:
    """VOCAB-01: V1→V2 mapping dict has correct mappings."""

    def test_critical_to_purple(self):
        assert V1_TO_V2["Critical"] == "Purple"

    def test_high_to_red(self):
        assert V1_TO_V2["High"] == "Red"

    def test_moderate_to_yellow(self):
        assert V1_TO_V2["Moderate"] == "Yellow"

    def test_low_to_safe(self):
        assert V1_TO_V2["Low"] == "Safe"

    def test_mapping_has_four_entries(self):
        assert len(V1_TO_V2) == 4


class TestNormalizeRiskLevel:
    """VOCAB-01: normalize_risk_level() converts v1→v2, passes v2 through, defaults unknown."""

    def test_v1_critical_to_purple(self):
        assert normalize_risk_level("Critical") == "Purple"

    def test_v1_high_to_red(self):
        assert normalize_risk_level("High") == "Red"

    def test_v1_moderate_to_yellow(self):
        assert normalize_risk_level("Moderate") == "Yellow"

    def test_v1_low_maps_to_safe_in_dict(self):
        """V1_TO_V2 dict maps Low→Safe, but normalize_risk_level('Low') returns 'Low'
        because v2 'Low' (13-16 score) takes priority over v1 mapping."""
        assert V1_TO_V2["Low"] == "Safe"

    def test_normalize_low_returns_low(self):
        """normalize_risk_level('Low') returns 'Low' — v2 state name takes priority."""
        assert normalize_risk_level("Low") == "Low"

    def test_v2_purple_passthrough(self):
        assert normalize_risk_level("Purple") == "Purple"

    def test_v2_red_passthrough(self):
        assert normalize_risk_level("Red") == "Red"

    def test_v2_yellow_passthrough(self):
        assert normalize_risk_level("Yellow") == "Yellow"

    def test_v2_low_passthrough(self):
        assert normalize_risk_level("Low") == "Low"

    def test_v2_safe_passthrough(self):
        assert normalize_risk_level("Safe") == "Safe"

    def test_none_returns_safe(self):
        assert normalize_risk_level(None) == "Safe"

    def test_unknown_string_returns_safe(self):
        assert normalize_risk_level("unknown_string") == "Safe"

    def test_empty_string_returns_safe(self):
        assert normalize_risk_level("") == "Safe"


class TestLegacyDeletion:
    """VOCAB-02: Legacy functions must not exist anywhere in the codebase."""

    def test_risk_level_from_wbt_deleted(self):
        from services.climate import risk
        assert not hasattr(risk, "risk_level_from_wbt"), "risk_level_from_wbt must be deleted"

    def test_risk_level_from_max_temp_deleted(self):
        from services.climate import risk
        assert not hasattr(risk, "risk_level_from_max_temp"), "risk_level_from_max_temp must be deleted"

    def test_wbt_thresholds_deleted(self):
        from services.climate import risk
        assert not hasattr(risk, "WBT_THRESHOLDS"), "WBT_THRESHOLDS must be deleted"

    def test_no_legacy_imports_in_package(self):
        import services.climate as climate_pkg
        assert not hasattr(climate_pkg, "risk_level_from_wbt")
        assert not hasattr(climate_pkg, "risk_level_from_max_temp")

    def test_no_legacy_imports_in_engine(self):
        import services.climate_engine as engine
        assert not hasattr(engine, "risk_level_from_wbt")
        assert not hasattr(engine, "risk_level_from_max_temp")

    def test_vocabulary_importable_from_package(self):
        from services.climate import RiskState, V1_TO_V2, normalize_risk_level
        assert RiskState.Purple.value is not None