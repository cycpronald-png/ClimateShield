"""Add W=1 WBT scoring band for 22-23.9°C

Revision ID: 20260517_add_wbt_score_1_band
Revises: 20260517_update_sensitivity_thresholds
Create Date: 2026-05-17

Adds a new WBT scoring band (score=1) for WBT 22-23.9°C so that
warm-humid conditions typical of Hong Kong summers produce non-zero
risk scores. Shifts the zero-score band down to < 21.9°C.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260517_add_wbt_score_1_band'
down_revision: Union[str, Sequence[str], None] = '20260517_update_sensitivity_thresholds'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE risk_formula_configs
        SET wbt_thresholds = '[
            {"max_temp": 21.9, "score": 0},
            {"min_temp": 22, "max_temp": 23.9, "score": 1},
            {"min_temp": 24, "max_temp": 26.9, "score": 2},
            {"min_temp": 27, "max_temp": 29.9, "score": 4},
            {"min_temp": 30, "score": 6}
        ]'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE risk_formula_configs
        SET wbt_thresholds = '[
            {"max_temp": 23.9, "score": 0},
            {"min_temp": 24, "max_temp": 26.9, "score": 2},
            {"min_temp": 27, "max_temp": 29.9, "score": 4},
            {"min_temp": 30, "score": 6}
        ]'
    """)