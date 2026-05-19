"""
Canonical Risk State Vocabulary — single source of truth for all risk level names.

This module defines the v2 vocabulary (Safe/Low/Yellow/Red/Purple) and provides
a normalization function to convert legacy v1 terms (Critical/High/Moderate/Low)
to their v2 equivalents. No DB migration is needed — normalize_risk_level()
converts at read time.
"""
from enum import Enum, auto
from typing import Optional


class RiskState(Enum):
    Safe = auto()
    Low = auto()
    Yellow = auto()
    Red = auto()
    Purple = auto()


V1_TO_V2 = {
    "Critical": "Purple",
    "High": "Red",
    "Moderate": "Yellow",
    "Low": "Safe",
}

_V2_NAMES = {state.name for state in RiskState}


def normalize_risk_level(level: Optional[str]) -> str:
    """Convert any v1 risk level term to v2. Passes v2 terms through unchanged.
    Returns 'Safe' for unknown/None input.

    V1→V2 mapping: Critical→Purple, High→Red, Moderate→Yellow, Low→Safe
    Note: v1 "Low" and v2 "Low" are different states. v1 "Low" (no risk) → "Safe".
    v2 "Low" (13-16 score, minor risk) passes through as "Low".
    Context determines which is meant: DB rows from legacy code use v1 "Low" = Safe.
    """
    if level is None:
        return "Safe"
    # Check if already a valid v2 state name first (v2 takes priority)
    if level in _V2_NAMES:
        return level
    # Check v1→v2 mapping
    if level in V1_TO_V2:
        return V1_TO_V2[level]
    # Try case-insensitive match for v2 names
    for name in _V2_NAMES:
        if level.lower() == name.lower():
            return name
    # Unknown input — safe default
    return "Safe"