"""Add HKO weather tables

Revision ID: a1b2c3d4e5f6
Revises: e93db34a6dca
Create Date: 2026-04-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e93db34a6dca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('weather_readings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('station', sa.String(), nullable=False),
        sa.Column('district', sa.String(), nullable=True),
        sa.Column('temp_c', sa.Float(), nullable=True),
        sa.Column('humidity_pct', sa.Float(), nullable=True),
        sa.Column('rainfall_mm', sa.Float(), nullable=True),
        sa.Column('wind_kmh', sa.Float(), nullable=True),
        sa.Column('wind_direction', sa.String(), nullable=True),
        sa.Column('uv_index', sa.Float(), nullable=True),
        sa.Column('wet_bulb_temp_c', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weather_readings_station'), 'weather_readings', ['station'], unique=False)
    op.create_index(op.f('ix_weather_readings_recorded_at'), 'weather_readings', ['recorded_at'], unique=False)

    op.create_table('weather_forecast_days',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('forecast_date', sa.String(), nullable=False),
        sa.Column('forecast_day_index', sa.Integer(), nullable=False),
        sa.Column('min_temp', sa.Float(), nullable=True),
        sa.Column('max_temp', sa.Float(), nullable=True),
        sa.Column('min_rh', sa.Float(), nullable=True),
        sa.Column('max_rh', sa.Float(), nullable=True),
        sa.Column('weather_desc', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.String(), nullable=True),
        sa.Column('wind', sa.String(), nullable=True),
        sa.Column('psr', sa.String(), nullable=True),
        sa.Column('icon_code', sa.Integer(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weather_forecast_days_forecast_date'), 'weather_forecast_days', ['forecast_date'], unique=False)

    op.create_table('weather_warnings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('warning_type', sa.String(), nullable=False),
        sa.Column('signal', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('issue_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weather_warnings_warning_type'), 'weather_warnings', ['warning_type'], unique=False)

    op.create_table('system_alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('district', sa.String(), nullable=True),
        sa.Column('risk_level', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('target_group', sa.String(), nullable=True),
        sa.Column('source_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_alerts_alert_type'), 'system_alerts', ['alert_type'], unique=False)
    op.create_index(op.f('ix_system_alerts_district'), 'system_alerts', ['district'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_system_alerts_district'), table_name='system_alerts')
    op.drop_index(op.f('ix_system_alerts_alert_type'), table_name='system_alerts')
    op.drop_table('system_alerts')
    op.drop_index(op.f('ix_weather_warnings_warning_type'), table_name='weather_warnings')
    op.drop_table('weather_warnings')
    op.drop_index(op.f('ix_weather_forecast_days_forecast_date'), table_name='weather_forecast_days')
    op.drop_table('weather_forecast_days')
    op.drop_index(op.f('ix_weather_readings_recorded_at'), table_name='weather_readings')
    op.drop_index(op.f('ix_weather_readings_station'), table_name='weather_readings')
    op.drop_table('weather_readings')
