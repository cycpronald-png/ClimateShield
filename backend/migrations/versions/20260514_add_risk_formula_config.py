"""Add risk formula config and consecutive hot nights tables

Revision ID: 20260514_add_risk_formula_config
Revises: 13ec0d4a9aed
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import String, Integer, Boolean, DateTime, JSON, Float


revision: str = '20260514_add_risk_formula_config'
down_revision: Union[str, Sequence[str], None] = '13ec0d4a9aed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create risk_formula_configs table
    op.create_table('risk_formula_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('wbt_thresholds', sa.JSON(), nullable=False),
        sa.Column('hne_thresholds', sa.JSON(), nullable=False),
        sa.Column('vulnerability_config', sa.JSON(), nullable=False),
        sa.Column('warning_multipliers', sa.JSON(), nullable=False),
        sa.Column('t8_floor', sa.JSON(), nullable=False),
        sa.Column('state_ranges', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create consecutive_hot_nights table
    op.create_table('consecutive_hot_nights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('station', sa.String(), nullable=False),
        sa.Column('date', sa.String(), nullable=False),
        sa.Column('consecutive_count', sa.Integer(), nullable=False, default=0),
        sa.Column('is_hot_night', sa.Boolean(), default=False),
        sa.Column('min_temp', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('station', 'date', name='uq_station_date_hot_nights')
    )
    op.create_index(op.f('ix_consecutive_hot_nights_station'), 'consecutive_hot_nights', ['station'], unique=False)
    op.create_index(op.f('ix_consecutive_hot_nights_date'), 'consecutive_hot_nights', ['date'], unique=False)

    # Insert default risk formula config from Update_For.md
    op.execute("""
        INSERT INTO risk_formula_configs (name, is_active, wbt_thresholds, hne_thresholds, vulnerability_config, warning_multipliers, t8_floor, state_ranges)
        VALUES (
            'default',
            1,
            '[
                {"max_temp": 25.9, "score": 0},
                {"min_temp": 26, "max_temp": 27, "score": 2},
                {"min_temp": 28, "max_temp": 29, "score": 4},
                {"min_temp": 30, "score": 6}
            ]',
            '[
                {"max_nights": 1, "score": 0},
                {"min_nights": 2, "max_nights": 2, "score": 1},
                {"min_nights": 3, "max_nights": 4, "score": 2},
                {"min_nights": 5, "score": 4}
            ]',
            '{"trigger_h_score": 2, "bonus": 5}',
            '{
                "none": 1.0,
                "thunderstorm_or_amber_rain": 1.2,
                "t1_or_red_rain": 1.5,
                "t3": 1.5,
                "black_rain": 2.0,
                "t8": 3.0
            }',
            '{"enabled": true, "min_score": 27}',
            '[
                {"name": "Safe", "min": 0, "max": 12},
                {"name": "Low", "min": 13, "max": 16},
                {"name": "Yellow", "min": 17, "max": 22},
                {"name": "Red", "min": 23, "max": 26},
                {"name": "Purple", "min": 25, "max": 30}
            ]'
        )
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_consecutive_hot_nights_date'), table_name='consecutive_hot_nights')
    op.drop_index(op.f('ix_consecutive_hot_nights_station'), table_name='consecutive_hot_nights')
    op.drop_table('consecutive_hot_nights')
    op.drop_table('risk_formula_configs')
