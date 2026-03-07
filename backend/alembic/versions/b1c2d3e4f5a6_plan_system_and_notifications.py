"""Add plan system to companies and create notifications table

Revision ID: b1c2d3e4f5a6
Revises: a3f2b1c0d9e8
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a3f2b1c0d9e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Plan columns on companies ──────────────────────────────
    op.add_column('companies', sa.Column('plan', sa.String(), nullable=False, server_default='free'))
    op.add_column('companies', sa.Column('drives_limit', sa.Integer(), nullable=False, server_default='2'))
    op.add_column('companies', sa.Column('drives_used', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('companies', sa.Column('plan_expires_at', sa.DateTime(), nullable=True))
    op.add_column('companies', sa.Column('plan_updated_at', sa.DateTime(), nullable=True))

    # Migrate existing companies: set status=approved, is_approved=true
    op.execute("UPDATE companies SET status = 'approved', is_approved = true WHERE status IN ('pending', 'rejected')")

    # ── Notifications table ────────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False, index=True),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_column('companies', 'plan_updated_at')
    op.drop_column('companies', 'plan_expires_at')
    op.drop_column('companies', 'drives_used')
    op.drop_column('companies', 'drives_limit')
    op.drop_column('companies', 'plan')
