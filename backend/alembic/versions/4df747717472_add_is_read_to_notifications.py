"""add is_read to notifications

Revision ID: 4df747717472
Revises: d3e4f5a6b7c8
Create Date: 2026-03-22 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4df747717472'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notifications', sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('notifications', 'is_read')
