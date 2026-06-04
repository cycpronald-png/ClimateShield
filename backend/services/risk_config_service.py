"""
Risk Configuration Service

Handles loading, validating, and persisting the admin-editable
risk formula configuration from the database.

The configuration shape is described by a Pydantic v2 model (per
Context7/Pydantic v2 best practices) so that:
  * OpenAPI schemas are auto-generated for the admin endpoints
  * Field- and model-level validation replaces ad-hoc ValueError checks
  * TypeScript clients can be generated from the JSON schema
"""
from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from backend import models


# --------------------------------------------------------------------------- #
# Pydantic v2 schema                                                          #
# --------------------------------------------------------------------------- #

STATE_NAMES = ("Safe", "Low", "Yellow", "Red", "Purple")


class WBTBand(BaseModel):
    """A single wet-bulb temperature scoring band."""

    model_config = ConfigDict(extra="forbid")

    min_temp: float | None = None
    max_temp: float | None = None
    score: float = Field(ge=0)


class HNEBand(BaseModel):
    """A single consecutive-hot-nights scoring band."""

    model_config = ConfigDict(extra="forbid")

    min_nights: int | None = None
    max_nights: int | None = None
    score: float = Field(ge=0)


class VulnerabilityConfig(BaseModel):
    """Trigger/cap configuration for the V (vulnerability) component."""

    model_config = ConfigDict(extra="forbid")

    trigger_h_score: int = Field(ge=0)
    bonus: int = Field(ge=0)


class T8Floor(BaseModel):
    """T8 minimum-score floor rule."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool
    min_score: int = Field(ge=0, le=30)


class StateRange(BaseModel):
    """One severity band in the state lookup table."""

    model_config = ConfigDict(extra="forbid")

    name: str
    min: int = Field(ge=0, le=30)
    max: int = Field(ge=0, le=30)


class RiskConfig(BaseModel):
    """Full admin-editable risk formula configuration."""

    model_config = ConfigDict(extra="forbid")

    wbt_thresholds: List[WBTBand] = Field(min_length=1)
    hne_thresholds: List[HNEBand] = Field(min_length=1)
    vulnerability_config: VulnerabilityConfig
    warning_multipliers: Dict[str, float] = Field(min_length=1)
    t8_floor: T8Floor
    state_ranges: List[StateRange] = Field(min_length=5, max_length=5)

    # --- field-level validators ------------------------------------------- #

    @field_validator("warning_multipliers")
    @classmethod
    def _multipliers_at_least_one(cls, v: Dict[str, float]) -> Dict[str, float]:
        for key, val in v.items():
            if val < 1.0:
                raise ValueError(
                    f"warning_multipliers['{key}'] must be >= 1.0, got {val}"
                )
        return v

    # --- model-level validators ------------------------------------------- #

    @model_validator(mode="after")
    def _validate_wbt_thresholds(self) -> "RiskConfig":
        prev_max: float | None = None
        for i, band in enumerate(self.wbt_thresholds):
            if i > 0 and band.score < self.wbt_thresholds[i - 1].score:
                raise ValueError(
                    f"wbt_thresholds[{i}]: score must not decrease from previous band"
                )
            if (
                prev_max is not None
                and band.min_temp is not None
                and band.min_temp <= prev_max
            ):
                raise ValueError(
                    f"wbt_thresholds[{i}]: overlaps or touches previous band "
                    f"(min_temp {band.min_temp} <= prev max {prev_max})"
                )
            prev_max = band.max_temp
        return self

    @model_validator(mode="after")
    def _validate_hne_thresholds(self) -> "RiskConfig":
        prev_max: int | None = None
        for i, band in enumerate(self.hne_thresholds):
            if i > 0 and band.score < self.hne_thresholds[i - 1].score:
                raise ValueError(
                    f"hne_thresholds[{i}]: score must not decrease from previous band"
                )
            if (
                prev_max is not None
                and band.min_nights is not None
                and band.min_nights <= prev_max
            ):
                raise ValueError(
                    f"hne_thresholds[{i}]: overlaps previous band"
                )
            prev_max = band.max_nights

        # trigger_h_score must match a real HNE score so the vulnerability
        # bonus has a meaningful trigger
        valid_h_scores = {b.score for b in self.hne_thresholds}
        if self.vulnerability_config.trigger_h_score not in valid_h_scores:
            raise ValueError(
                f"vulnerability_config.trigger_h_score "
                f"({self.vulnerability_config.trigger_h_score}) must match "
                f"an existing HNE score: {sorted(valid_h_scores)}"
            )
        return self

    @model_validator(mode="after")
    def _validate_state_ranges(self) -> "RiskConfig":
        actual = {s.name for s in self.state_ranges}
        expected = set(STATE_NAMES)
        if actual != expected:
            raise ValueError(
                f"state_ranges must contain exactly {expected}, got {actual}"
            )

        sorted_states = sorted(self.state_ranges, key=lambda s: s.min)
        if sorted_states[0].min != 0:
            raise ValueError("state_ranges must start at 0")
        if sorted_states[-1].max != 30:
            raise ValueError("state_ranges must end at 30")

        for i, s in enumerate(sorted_states):
            if s.min > s.max:
                raise ValueError(
                    f"state_ranges[{s.name}]: min ({s.min}) > max ({s.max})"
                )
            if i > 0:
                prev = sorted_states[i - 1]
                # Overlaps are allowed (priority order resolves them) but
                # uncovered scores are not — every 0..30 integer must hit
                # at least one state.
                if s.min > prev.max + 1:
                    raise ValueError(
                        f"state_ranges gap between {prev.name} (max={prev.max}) "
                        f"and {s.name} (min={s.min}): scores "
                        f"{prev.max + 1}-{s.min - 1} uncovered"
                    )
        return self

    @model_validator(mode="after")
    def _validate_t8_floor_within_purple(self) -> "RiskConfig":
        if not self.t8_floor.enabled:
            return self
        purple = next(s for s in self.state_ranges if s.name == "Purple")
        if (
            self.t8_floor.min_score < purple.min
            or self.t8_floor.min_score > purple.max
        ):
            raise ValueError(
                f"t8_floor.min_score ({self.t8_floor.min_score}) must be within "
                f"Purple range [{purple.min}-{purple.max}]"
            )
        return self


# --------------------------------------------------------------------------- #
# Defaults                                                                    #
# --------------------------------------------------------------------------- #

DEFAULT_CONFIG_DICT: Dict[str, Any] = {
    "wbt_thresholds": [
        {"max_temp": 21.9, "score": 0},
        {"min_temp": 22, "max_temp": 23.9, "score": 1},
        {"min_temp": 24, "max_temp": 26.9, "score": 2},
        {"min_temp": 27, "max_temp": 29.9, "score": 4},
        {"min_temp": 30, "max_temp": 34.4, "score": 6},
        {"min_temp": 34.5, "score": 8},
    ],
    "hne_thresholds": [
        {"max_nights": 0, "score": 0},
        {"min_nights": 1, "max_nights": 1, "score": 1},
        {"min_nights": 2, "max_nights": 2, "score": 2},
        {"min_nights": 3, "max_nights": 4, "score": 4},
        {"min_nights": 5, "score": 6},
    ],
    "vulnerability_config": {"trigger_h_score": 1, "bonus": 5},
    "warning_multipliers": {
        "none": 1.0,
        "thunderstorm_or_amber_rain": 2.0,
        "t1_or_red_rain": 1.5,
        "t3": 1.5,
        "black_rain": 2.0,
        "t8": 3.0,
    },
    "t8_floor": {"enabled": True, "min_score": 27},
    "state_ranges": [
        {"name": "Safe", "min": 0, "max": 12},
        {"name": "Low", "min": 13, "max": 16},
        {"name": "Yellow", "min": 17, "max": 22},
        {"name": "Red", "min": 23, "max": 26},
        {"name": "Purple", "min": 25, "max": 30},
    ],
}

# Backwards-compat alias — older tests/callers still reference this name.
DEFAULT_CONFIG = DEFAULT_CONFIG_DICT


# --------------------------------------------------------------------------- #
# Service surface                                                             #
# --------------------------------------------------------------------------- #

def get_active_risk_config(db: Session) -> Dict[str, Any]:
    """Load the active risk formula config from DB, or return default if none exists."""
    config = (
        db.query(models.RiskFormulaConfig)
        .filter(models.RiskFormulaConfig.is_active == True)  # noqa: E712
        .order_by(models.RiskFormulaConfig.id.desc())
        .first()
    )
    if not config:
        return DEFAULT_CONFIG_DICT
    return {
        "wbt_thresholds": config.wbt_thresholds,
        "hne_thresholds": config.hne_thresholds,
        "vulnerability_config": config.vulnerability_config,
        "warning_multipliers": config.warning_multipliers,
        "t8_floor": config.t8_floor,
        "state_ranges": config.state_ranges,
    }


def validate_risk_config(config: Dict[str, Any]) -> RiskConfig:
    """Validate a risk formula configuration dict.

    Returns the parsed ``RiskConfig`` on success so callers can reuse the
    validated object without re-parsing. Raises ``ValueError`` (wrapped from
    ``pydantic.ValidationError``) with descriptive messages on failure.
    """
    return RiskConfig.model_validate(config)


def upsert_risk_config(db: Session, config: Dict[str, Any]) -> RiskConfig:
    """Replace the active config with a new one (after validation)."""
    validated = validate_risk_config(config)
    # Deactivate all existing rows
    db.query(models.RiskFormulaConfig).update({"is_active": False})
    # Insert new active config
    new_config = models.RiskFormulaConfig(
        name="custom",
        is_active=True,
        wbt_thresholds=[b.model_dump() for b in validated.wbt_thresholds],
        hne_thresholds=[b.model_dump() for b in validated.hne_thresholds],
        vulnerability_config=validated.vulnerability_config.model_dump(),
        warning_multipliers=validated.warning_multipliers,
        t8_floor=validated.t8_floor.model_dump(),
        state_ranges=[s.model_dump() for s in validated.state_ranges],
    )
    db.add(new_config)
    db.commit()
    return validated


def reset_risk_config(db: Session) -> None:
    """Reset to the built-in default configuration."""
    db.query(models.RiskFormulaConfig).update({"is_active": False})
    default = models.RiskFormulaConfig(
        name="default",
        is_active=True,
        **DEFAULT_CONFIG_DICT,
    )
    db.add(default)
    db.commit()
