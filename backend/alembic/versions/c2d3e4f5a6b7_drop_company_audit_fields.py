"""Drop admin_notes, reviewed_at, reviewed_by from companies

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('companies', 'admin_notes')
    op.drop_column('companies', 'reviewed_at')
    op.drop_column('companies', 'reviewed_by')


def downgrade() -> None:
    op.add_column('companies', sa.Column('reviewed_by', sa.String(), nullable=True))
    op.add_column('companies', sa.Column('reviewed_at', sa.DateTime(), nullable=True))
    op.add_column('companies', sa.Column('admin_notes', sa.Text(), nullable=True))
