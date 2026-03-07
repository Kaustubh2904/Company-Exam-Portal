from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Drive, College, StudentGroup, Company


def get_drive_status(drive: Drive) -> str:
    """
    Calculate the canonical drive status based on the stored status field and actual window times.

    Lifecycle:
        draft     → (publish) → upcoming → (start) → live → (end / time expired) → ended

    The `status` column stores the last deliberate state set by a company or backend action.
    `actual_window_start/end` determine whether a live drive has auto-ended.
    """
    # Suspended is an admin override — always return it as-is
    if drive.status == "suspended":
        return "suspended"

    # If the drive has been manually ended or its window has expired, it is ended
    if drive.actual_window_end:
        now = datetime.utcnow()
        if now >= drive.actual_window_end:
            return "ended"

    # If the exam window has been opened, it is currently live
    if drive.actual_window_start:
        return "live"

    # Return the stored status for draft / upcoming
    return drive.status  # "draft" or "upcoming"


def format_drive_response(drive: Drive, db: Session) -> dict:
    """Format drive response with resolved target names and company info"""
    targets = []
    for target in drive.targets:
        college_name = target.custom_college_name
        if not college_name and target.college_id:
            college = db.query(College).filter(College.id == target.college_id).first()
            college_name = college.name if college else "Unknown College"

        group_name = target.custom_student_group_name
        if not group_name and target.student_group_id:
            group = db.query(StudentGroup).filter(StudentGroup.id == target.student_group_id).first()
            group_name = group.name if group else "Unknown Group"

        targets.append({
            "id": target.id,
            "college_id": target.college_id,
            "custom_college_name": target.custom_college_name,
            "college_name": college_name,
            "student_group_id": target.student_group_id,
            "custom_student_group_name": target.custom_student_group_name,
            "student_group_name": group_name,
            "batch_year": target.batch_year
        })

    # Get company information
    company_name = "Unknown Company"
    if drive.company_id:
        company = db.query(Company).filter(Company.id == drive.company_id).first()
        company_name = company.company_name if company else "Unknown Company"

    return {
        "id": drive.id,
        "company_id": drive.company_id,
        "company_name": company_name,
        "title": drive.title,
        "description": drive.description,
        "category": drive.category,
        "targets": targets,
        "window_start": drive.window_start,
        "window_end": drive.window_end,
        "actual_window_start": drive.actual_window_start,
        "actual_window_end": drive.actual_window_end,
        "exam_duration_minutes": drive.exam_duration_minutes,
        "duration_minutes": drive.duration_minutes,
        "status": get_drive_status(drive),
        "is_approved": drive.is_approved,
        "admin_notes": drive.admin_notes,
        "created_at": drive.created_at,
        "updated_at": drive.updated_at
    }
