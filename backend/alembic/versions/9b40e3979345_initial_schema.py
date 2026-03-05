"""initial schema - create all tables

Revision ID: 9b40e3979345
Revises: 
Create Date: 2026-03-02 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b40e3979345'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. admins — no FKs
    op.create_table('admins',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_admins_id'), 'admins', ['id'], unique=False)
    op.create_index(op.f('ix_admins_username'), 'admins', ['username'], unique=True)

    # 2. colleges — no FKs
    op.create_table('colleges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_approved', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_colleges_id'), 'colleges', ['id'], unique=False)

    # 3. student_groups — no FKs
    op.create_table('student_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_approved', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_student_groups_id'), 'student_groups', ['id'], unique=False)

    # 4. companies — no FKs
    op.create_table('companies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('logo_url', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('is_approved', sa.Boolean(), nullable=True),
        sa.Column('email_subject_template', sa.Text(), nullable=True),
        sa.Column('email_body_template', sa.Text(), nullable=True),
        sa.Column('use_custom_template', sa.Boolean(), nullable=True),
        sa.Column('template_updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_companies_id'), 'companies', ['id'], unique=False)
    op.create_index(op.f('ix_companies_username'), 'companies', ['username'], unique=True)
    op.create_index(op.f('ix_companies_email'), 'companies', ['email'], unique=True)

    # 5. drives — FK → companies
    op.create_table('drives',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('window_start', sa.DateTime(timezone=False), nullable=True),
        sa.Column('window_end', sa.DateTime(timezone=False), nullable=True),
        sa.Column('actual_window_start', sa.DateTime(timezone=False), nullable=True),
        sa.Column('actual_window_end', sa.DateTime(timezone=False), nullable=True),
        sa.Column('exam_duration_minutes', sa.Integer(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('is_approved', sa.Boolean(), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_drives_id'), 'drives', ['id'], unique=False)

    # 6. drive_targets — FKs → drives, colleges, student_groups
    op.create_table('drive_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('drive_id', sa.Integer(), nullable=False),
        sa.Column('college_id', sa.Integer(), nullable=True),
        sa.Column('custom_college_name', sa.String(), nullable=True),
        sa.Column('student_group_id', sa.Integer(), nullable=True),
        sa.Column('custom_student_group_name', sa.String(), nullable=True),
        sa.Column('batch_year', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ),
        sa.ForeignKeyConstraint(['drive_id'], ['drives.id'], ),
        sa.ForeignKeyConstraint(['student_group_id'], ['student_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_drive_targets_id'), 'drive_targets', ['id'], unique=False)

    # 7. questions — FK → drives
    op.create_table('questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('drive_id', sa.Integer(), nullable=False),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('option_a', sa.String(), nullable=False),
        sa.Column('option_b', sa.String(), nullable=False),
        sa.Column('option_c', sa.String(), nullable=False),
        sa.Column('option_d', sa.String(), nullable=False),
        sa.Column('correct_answer', sa.String(), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['drive_id'], ['drives.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_questions_id'), 'questions', ['id'], unique=False)

    # 8. students — FKs → drives, companies
    op.create_table('students',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('drive_id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('roll_number', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('college_name', sa.String(), nullable=True),
        sa.Column('student_group_name', sa.String(), nullable=True),
        sa.Column('access_token', sa.String(36), nullable=False),
        sa.Column('question_order', sa.JSON(), nullable=True),
        sa.Column('exam_started_at', sa.DateTime(), nullable=True),
        sa.Column('exam_submitted_at', sa.DateTime(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.Column('total_marks', sa.Integer(), nullable=True),
        sa.Column('violation_details', sa.JSON(), nullable=True),
        sa.Column('total_violations', sa.Integer(), nullable=True),
        sa.Column('is_disqualified', sa.Boolean(), nullable=True),
        sa.Column('disqualification_reason', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['drive_id'], ['drives.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('access_token')
    )
    op.create_index(op.f('ix_students_id'), 'students', ['id'], unique=False)
    op.create_index(op.f('ix_students_email'), 'students', ['email'], unique=False)
    op.create_index(op.f('ix_students_roll_number'), 'students', ['roll_number'], unique=False)
    op.create_index(op.f('ix_students_access_token'), 'students', ['access_token'], unique=True)

    # 9. student_responses — FKs → students, questions, drives
    op.create_table('student_responses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('drive_id', sa.Integer(), nullable=False),
        sa.Column('selected_option', sa.String(1), nullable=True),
        sa.Column('is_correct', sa.Boolean(), nullable=True),
        sa.Column('marked_for_review', sa.Boolean(), nullable=True),
        sa.Column('answered_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['drive_id'], ['drives.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_student_responses_id'), 'student_responses', ['id'], unique=False)

    # 10. tickets — FK → companies
    op.create_table('tickets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('priority', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('resolved_by', sa.String(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tickets_id'), 'tickets', ['id'], unique=False)


def downgrade() -> None:
    # Drop in reverse FK-safe order
    op.drop_index(op.f('ix_tickets_id'), table_name='tickets')
    op.drop_table('tickets')

    op.drop_index(op.f('ix_student_responses_id'), table_name='student_responses')
    op.drop_table('student_responses')

    op.drop_index(op.f('ix_students_access_token'), table_name='students')
    op.drop_index(op.f('ix_students_roll_number'), table_name='students')
    op.drop_index(op.f('ix_students_email'), table_name='students')
    op.drop_index(op.f('ix_students_id'), table_name='students')
    op.drop_table('students')

    op.drop_index(op.f('ix_questions_id'), table_name='questions')
    op.drop_table('questions')

    op.drop_index(op.f('ix_drive_targets_id'), table_name='drive_targets')
    op.drop_table('drive_targets')

    op.drop_index(op.f('ix_drives_id'), table_name='drives')
    op.drop_table('drives')

    op.drop_index(op.f('ix_companies_email'), table_name='companies')
    op.drop_index(op.f('ix_companies_username'), table_name='companies')
    op.drop_index(op.f('ix_companies_id'), table_name='companies')
    op.drop_table('companies')

    op.drop_index(op.f('ix_student_groups_id'), table_name='student_groups')
    op.drop_table('student_groups')

    op.drop_index(op.f('ix_colleges_id'), table_name='colleges')
    op.drop_table('colleges')

    op.drop_index(op.f('ix_admins_username'), table_name='admins')
    op.drop_index(op.f('ix_admins_id'), table_name='admins')
    op.drop_table('admins')
