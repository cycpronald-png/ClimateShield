"""add counter reset log

Revision ID: d177f3a57304
Revises: 3c51a1f1df57
Create Date: 2026-04-29 18:02:45.536788

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd177f3a57304'
down_revision: Union[str, Sequence[str], None] = '3c51a1f1df57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'counter_reset_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reset_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('counter_reset_log')
