"""Update sensitivity thresholds in risk_formula_configs

Revision ID: 20260517_update_sensitivity_thresholds
Revises: 3a5f98d91c41
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260517_update_sensitivity_thresholds'
down_revision: Union[str, Sequence[str], None] = '3a5f98d91c41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE risk_formula_configs
        SET wbt_thresholds = '[
            {"max_temp": 23.9, "score": 0},
            {"min_temp": 24, "max_temp": 26.9, "score": 2},
            {"min_temp": 27, "max_temp": 29.9, "score": 4},
            {"min_temp": 30, "score": 6}
        ]',
        hne_thresholds = '[
            {"max_nights": 0, "score": 0},
            {"min_nights": 1, "max_nights": 1, "score": 1},
            {"min_nights": 2, "max_nights": 2, "score": 2},
            {"min_nights": 3, "max_nights": 4, "score": 4},
            {"min_nights": 5, "score": 6}
        ]',
        vulnerability_config = '{"trigger_h_score": 1, "bonus": 5}'
    """)
    # Update the 'default' seed row name to reflect sensitivity change
    op.execute("""
        UPDATE risk_formula_configs
        SET name = 'default_v2_sensitivity'
        WHERE name = 'default'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE risk_formula_configs
        SET wbt_thresholds = '[
            {"max_temp": 25.9, "score": 0},
            {"min_temp": 26, "max_temp": 27, "score": 2},
            {"min_temp": 28, "max_temp": 29, "score": 4},
            {"min_temp": 30, "score": 6}
        ]',
        hne_thresholds = '[
            {"max_nights": 1, "score": 0},
            {"min_nights": 2, "max_nights": 2, "score": 1},
            {"min_nights": 3, "max_nights": 4, "score": 2},
            {"min_nights": 5, "score": 4}
        ]',
        vulnerability_config = '{"trigger_h_score": 2, "bonus": 5}'
    """)
    op.execute("""
        UPDATE risk_formula_configs
        SET name = 'default'
        WHERE name = 'default_v2_sensitivity'
    """)