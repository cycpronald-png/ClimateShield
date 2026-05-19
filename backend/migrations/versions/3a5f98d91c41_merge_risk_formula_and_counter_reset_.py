"""Merge risk formula and counter reset branches

Revision ID: 3a5f98d91c41
Revises: 20260514_add_risk_formula_config, d177f3a57304
Create Date: 2026-05-14 23:38:47.359468

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a5f98d91c41'
down_revision: Union[str, Sequence[str], None] = ('20260514_add_risk_formula_config', 'd177f3a57304')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
