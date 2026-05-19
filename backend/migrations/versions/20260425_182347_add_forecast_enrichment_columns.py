"""Add composite_risk_score and wet_bulb_peak to weather_forecast_days

Revision ID: 20260425_182347
Revises: a1b2c3d4e5f6
Create Date: 2026-04-25 18:23:47

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260425_182347'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('weather_forecast_days', sa.Column('composite_risk_score', sa.Float(), nullable=True))
    op.add_column('weather_forecast_days', sa.Column('wet_bulb_peak', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('weather_forecast_days', 'wet_bulb_peak')
    op.drop_column('weather_forecast_days', 'composite_risk_score')
