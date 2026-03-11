"""drop legacy approval fields from drives and companies

Removes:
  drives.is_approved, drives.admin_notes
  companies.is_approved, companies.admin_notes, companies.reviewed_at, companies.reviewed_by

These were used by the old admin-approval workflow which has been replaced by
the plan-based drive allocation system (free/basic/pro/premium/custom).
Status on both tables is now the single source of truth.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    # ── drives table ──────────────────────────────────────────
    with op.batch_alter_table('drives', schema=None) as batch_op:
        batch_op.drop_column('is_approved')
        batch_op.drop_column('admin_notes')

    # ── companies table ───────────────────────────────────────
    # admin_notes, reviewed_at, reviewed_by already removed in c2d3e4f5a6b7
    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.drop_column('is_approved')


def downgrade():
    # ── companies table ───────────────────────────────────────
    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_approved', sa.Boolean(), nullable=True, server_default='true'))

    # ── drives table ──────────────────────────────────────────
    with op.batch_alter_table('drives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('admin_notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('is_approved', sa.Boolean(), nullable=True, server_default='false'))
