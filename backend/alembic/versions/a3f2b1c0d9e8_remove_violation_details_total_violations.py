"""remove violation_details and total_violations from students

Revision ID: a3f2b1c0d9e8
Revises: 2fc001c425a8
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a3f2b1c0d9e8'
down_revision = '2fc001c425a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('students', 'violation_details')
    op.drop_column('students', 'total_violations')


def downgrade() -> None:
    op.add_column('students', sa.Column('total_violations', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('students', sa.Column('violation_details', sa.JSON(), nullable=True))
