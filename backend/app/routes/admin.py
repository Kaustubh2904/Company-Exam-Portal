from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
from app.database.connection import get_db
from app.models import Company, Drive, College, StudentGroup, Question
from app.models.student import Student
from app.models.student_response import StudentResponse as StudentResponseModel
from app.models.notification import Notification
from app.schemas.company import (
    CompanyResponse, CompanyApprovalUpdate, CollegeResponse, StudentGroupResponse,
    CompanyPlanUpdate, NotificationResponse, AdminNotifyRequest, PLAN_LIMITS
)
from app.schemas.drive import DriveResponse, AdminDriveApprovalUpdate
from app.auth import get_admin_user
from app.utils.drive_utils import get_drive_status, format_drive_response

LOGOS_DIR = Path(__file__).parent.parent.parent / "static" / "logos"


def _delete_company_logo(logo_url: str) -> None:
    """Remove logo file from disk if it exists"""
    if not logo_url:
        return
    filename = logo_url.split("/")[-1]
    logo_path = LOGOS_DIR / filename
    if logo_path.exists():
        logo_path.unlink()

router = APIRouter()

@router.get("/companies", response_model=List[CompanyResponse])
def get_all_companies(
    skip: int = 0,
    limit: int = 100,
    status_filter: str = "all",  # approved, suspended, all
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get all companies (admin only)"""
    query = db.query(Company)
    
    if status_filter == "approved":
        query = query.filter(Company.status == "approved")
    elif status_filter == "suspended":
        query = query.filter(Company.status == "suspended")
    # "all" shows everything
    
    companies = query.offset(skip).limit(limit).all()
    return companies

@router.delete("/companies/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Delete company account"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if company has any drives
    if company.company_drives:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete company with existing drives. Please handle drives first."
        )
    
    db.delete(company)
    db.commit()
    
    return {"message": "Company deleted successfully"}


@router.put("/companies/{company_id}/suspend")
def suspend_company(
    company_id: int,
    data: Optional[dict] = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Suspend a company account"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.status == "suspended":
        raise HTTPException(status_code=400, detail="Company is already suspended")

    company.status = "suspended"
    company.is_approved = False
    company.admin_notes = (data or {}).get("reason", "Suspended by admin")
    company.reviewed_at = datetime.utcnow()
    company.reviewed_by = admin.username

    db.commit()
    db.refresh(company)
    return {"message": "Company suspended", "company_id": company_id}


@router.put("/companies/{company_id}/unsuspend")
def unsuspend_company(
    company_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Re-activate a suspended company"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.status != "suspended":
        raise HTTPException(status_code=400, detail="Company is not suspended")

    company.status = "approved"
    company.is_approved = True
    company.reviewed_at = datetime.utcnow()
    company.reviewed_by = admin.username

    db.commit()
    db.refresh(company)
    return {"message": "Company reactivated", "company_id": company_id}


@router.put("/companies/{company_id}/set-plan", response_model=CompanyResponse)
def set_company_plan(
    company_id: int,
    plan_data: CompanyPlanUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Assign a plan to a company. For 'custom' plan, drives_limit must be provided."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    valid_plans = {"free", "basic", "pro", "premium", "custom"}
    if plan_data.plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {', '.join(sorted(valid_plans))}")

    if plan_data.plan == "custom":
        if plan_data.drives_limit is None or plan_data.drives_limit < 1:
            raise HTTPException(status_code=400, detail="drives_limit must be a positive integer for custom plan")
        new_limit = plan_data.drives_limit
    else:
        new_limit = PLAN_LIMITS[plan_data.plan]

    company.plan = plan_data.plan
    company.drives_limit = new_limit
    company.plan_updated_at = datetime.utcnow()

    # Set expiry 30 days from now for non-free plans
    if plan_data.plan == "free":
        company.plan_expires_at = None
    else:
        company.plan_expires_at = datetime.utcnow() + timedelta(days=30)

    # Send a notification to the company
    notification = Notification(
        company_id=company_id,
        type="plan_change",
        title=f"Your plan has been updated to {plan_data.plan.capitalize()}",
        message=(
            f"Your account plan has been updated to {plan_data.plan.capitalize()} "
            f"by the admin. You now have {new_limit} drive(s) allowed."
            + (
                f" Plan expires on {company.plan_expires_at.strftime('%Y-%m-%d')}."
                if company.plan_expires_at else " This plan does not expire."
            )
        ),
    )
    db.add(notification)

    db.commit()
    db.refresh(company)
    return company


@router.post("/companies/{company_id}/notify")
def notify_company(
    company_id: int,
    notify_data: AdminNotifyRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Send a custom notification message to a specific company"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    notification = Notification(
        company_id=company_id,
        type="admin_message",
        title=notify_data.title,
        message=notify_data.message,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    return {"message": "Notification sent", "notification_id": notification.id}


@router.get("/notifications", response_model=List[NotificationResponse])
def get_all_notifications(
    company_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get all sent notifications (admin log). Optionally filter by company."""
    query = db.query(Notification)
    if company_id:
        query = query.filter(Notification.company_id == company_id)
    notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
    return notifications

@router.get("/drives", response_model=List[DriveResponse])
def get_all_drives(
    skip: int = 0,
    limit: int = 100,
    status_filter: str = "all",  # all, draft, upcoming, live, ended, suspended
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get drives (admin view)"""
    drives = db.query(Drive).offset(skip).limit(limit).all()

    result = []
    for drive in drives:
        computed = get_drive_status(drive)
        if status_filter != "all" and computed != status_filter:
            continue
        drive_dict = format_drive_response(drive, db)
        result.append(drive_dict)

    return result

@router.put("/drives/{drive_id}/suspend")
def suspend_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Suspend a drive and delete all student responses. Drive, questions, and students are preserved."""
    drive = db.query(Drive).filter(Drive.id == drive_id).first()
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    
    if drive.status == "suspended":
        raise HTTPException(status_code=400, detail="Drive is already suspended")
    
    # If exam is ongoing, end it immediately by setting actual_window_end
    was_ongoing = False
    if drive.actual_window_start and not drive.actual_window_end:
        drive.actual_window_end = datetime.utcnow()
        was_ongoing = True
    
    # Delete all student responses for this drive
    # Get all students for this drive
    students = db.query(Student).filter(Student.drive_id == drive_id).all()
    student_ids = [s.id for s in students]
    
    # Delete all responses
    deleted_responses = 0
    if student_ids:
        deleted_responses = db.query(StudentResponseModel).filter(
            StudentResponseModel.student_id.in_(student_ids)
        ).delete(synchronize_session=False)
    
    # Reset student exam state (keep uploaded student data but clear exam progress)
    for student in students:
        student.exam_started_at = None
        student.exam_submitted_at = None
        student.question_order = None
        student.score = None
        student.total_marks = None
    
    # Mark drive as suspended and reset actual window times
    drive.status = "suspended"
    drive.actual_window_start = None
    drive.actual_window_end = None

    # Notify the company
    notif = Notification(
        company_id=drive.company_id,
        type="drive_status",
        title=f"Drive '{drive.title}' has been suspended",
        message=(
            f"Your drive '{drive.title}' has been suspended by the admin. "
            f"{deleted_responses} student response(s) were cleared. "
            "Please contact support if you believe this is an error."
        ),
    )
    db.add(notif)
    
    db.commit()
    db.refresh(drive)
    
    message = f"Drive suspended successfully. {deleted_responses} student responses deleted."
    if was_ongoing:
        message += " Ongoing exam was immediately ended."
    
    return {
        "message": message,
        "drive_id": drive_id,
        "status": drive.status,
        "exam_ended": was_ongoing,
        "responses_deleted": deleted_responses,
        "students_preserved": len(students)
    }

@router.put("/drives/{drive_id}/reactivate")
def reactivate_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Reactivate a suspended drive"""
    drive = db.query(Drive).filter(Drive.id == drive_id).first()
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    
    if drive.status != "suspended":
        raise HTTPException(status_code=400, detail="Only suspended drives can be reactivated")
    
    drive.status = "upcoming"
    
    db.commit()
    db.refresh(drive)
    
    return {
        "message": "Drive reactivated successfully",
        "drive_id": drive_id,
        "status": drive.status
    }

@router.get("/drives/{drive_id}/detail")
def get_drive_detail(
    drive_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get detailed view of a drive including questions and students for admin review"""
    drive = db.query(Drive).filter(Drive.id == drive_id).first()
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")
    
    # Get basic drive info
    drive_info = format_drive_response(drive, db)
    
    # Get questions
    questions = db.query(Question).filter(Question.drive_id == drive_id).all()
    questions_data = []
    for q in questions:
        questions_data.append({
            "id": q.id,
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_answer": q.correct_answer,
            "points": q.points,
            "created_at": q.created_at
        })
    
    # Get students
    students = db.query(Student).filter(Student.drive_id == drive_id).all()
    students_data = []
    for s in students:
        students_data.append({
            "id": s.id,
            "roll_number": s.roll_number,
            "email": s.email,
            "name": s.name,
            "created_at": s.created_at
        })
    
    # Get company info
    company_info = None
    if drive.company_id:
        company = db.query(Company).filter(Company.id == drive.company_id).first()
        if company:
            company_info = {
                "id": company.id,
                "company_name": company.company_name,
                "username": company.username,
                "email": company.email,
                "logo_url": company.logo_url,
                "status": company.status,
                "created_at": company.created_at
            }
    
    return {
        "drive": drive_info,
        "company": company_info,
        "questions": questions_data,
        "students": students_data,
        "stats": {
            "total_questions": len(questions_data),
            "total_students": len(students_data),
            "total_points": sum(q["points"] for q in questions_data)
        }
    }

@router.get("/colleges", response_model=List[CollegeResponse])
def get_all_colleges(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get all colleges"""
    colleges = db.query(College).all()
    return colleges

@router.get("/colleges/pending")
def get_pending_custom_colleges(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get custom colleges that need approval"""
    from sqlalchemy import text
    
    # Get distinct custom college names that don't exist in College table
    query = text("""
        SELECT DISTINCT dt.custom_college_name as name,
               COUNT(*) as usage_count,
               MIN(d.created_at) as first_used
        FROM drive_targets dt
        JOIN drives d ON dt.drive_id = d.id
        WHERE dt.custom_college_name IS NOT NULL
        AND dt.custom_college_name NOT IN (
            SELECT name FROM colleges WHERE is_approved = true
        )
        GROUP BY dt.custom_college_name
        ORDER BY first_used ASC
    """)
    
    result = db.execute(query)
    pending_colleges = []
    for row in result:
        pending_colleges.append({
            "name": row.name,
            "usage_count": row.usage_count,
            "first_used": row.first_used
        })
    
    return pending_colleges

@router.put("/colleges/approve-custom")
def approve_custom_college(
    college_data: dict,  # {"name": "MIT"}
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Approve custom college and update all references"""
    from app.models import DriveTarget
    
    custom_name = college_data.get("name")
    if not custom_name:
        raise HTTPException(status_code=400, detail="College name is required")
    
    # Check if this college already exists
    existing_college = db.query(College).filter(College.name == custom_name).first()
    if existing_college:
        if existing_college.is_approved:
            raise HTTPException(status_code=400, detail="College already approved")
        # If exists but not approved, approve it
        new_college = existing_college
        new_college.is_approved = True
    else:
        # Create new approved college
        new_college = College(name=custom_name, is_approved=True)
        db.add(new_college)
        db.flush()  # To get the ID
    
    # Update all DriveTargets that use this custom name to reference the approved college
    custom_targets = db.query(DriveTarget).filter(
        DriveTarget.custom_college_name == custom_name
    ).all()
    
    for target in custom_targets:
        target.college_id = new_college.id
        target.custom_college_name = None  # Clear custom name
    
    db.commit()
    
    return {
        "message": "College approved successfully", 
        "college": {"id": new_college.id, "name": new_college.name},
        "updated_targets": len(custom_targets)
    }

@router.put("/colleges/{college_id}/approve")
def approve_college(
    college_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Approve existing college"""
    college = db.query(College).filter(College.id == college_id).first()
    if not college:
        raise HTTPException(status_code=404, detail="College not found")
    
    college.is_approved = True
    db.commit()
    
    return {"message": "College approved successfully"}

@router.get("/student-groups", response_model=List[StudentGroupResponse])
def get_all_student_groups(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get all student groups"""
    groups = db.query(StudentGroup).all()
    return groups

@router.get("/student-groups/pending")
def get_pending_custom_student_groups(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get custom student groups that need approval"""
    from sqlalchemy import text
    
    # Get distinct custom student group names that don't exist in StudentGroup table
    query = text("""
        SELECT DISTINCT dt.custom_student_group_name as name,
               COUNT(*) as usage_count,
               MIN(d.created_at) as first_used
        FROM drive_targets dt
        JOIN drives d ON dt.drive_id = d.id
        WHERE dt.custom_student_group_name IS NOT NULL
        AND dt.custom_student_group_name NOT IN (
            SELECT name FROM student_groups WHERE is_approved = true
        )
        GROUP BY dt.custom_student_group_name
        ORDER BY first_used ASC
    """)
    
    result = db.execute(query)
    pending_groups = []
    for row in result:
        pending_groups.append({
            "name": row.name,
            "usage_count": row.usage_count,
            "first_used": row.first_used
        })
    
    return pending_groups

@router.put("/student-groups/approve-custom")
def approve_custom_student_group(
    group_data: dict,  # {"name": "aimlds"}
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Approve custom student group and update all references"""
    from app.models import DriveTarget
    
    custom_name = group_data.get("name")
    if not custom_name:
        raise HTTPException(status_code=400, detail="Group name is required")
    
    # Check if this group already exists
    existing_group = db.query(StudentGroup).filter(StudentGroup.name == custom_name).first()
    if existing_group:
        if existing_group.is_approved:
            raise HTTPException(status_code=400, detail="Student group already approved")
        # If exists but not approved, approve it
        new_group = existing_group
        new_group.is_approved = True
    else:
        # Create new approved student group
        new_group = StudentGroup(name=custom_name, is_approved=True)
        db.add(new_group)
        db.flush()  # To get the ID
    
    # Update all DriveTargets that use this custom name to reference the approved group
    custom_targets = db.query(DriveTarget).filter(
        DriveTarget.custom_student_group_name == custom_name
    ).all()
    
    for target in custom_targets:
        target.student_group_id = new_group.id
        target.custom_student_group_name = None  # Clear custom name
    
    db.commit()
    
    return {
        "message": "Student group approved successfully", 
        "group": {"id": new_group.id, "name": new_group.name},
        "updated_targets": len(custom_targets)
    }

@router.put("/student-groups/{group_id}/approve")
def approve_student_group(
    group_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Approve existing student group"""
    group = db.query(StudentGroup).filter(StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Student group not found")
    
    group.is_approved = True
    db.commit()
    
    return {"message": "Student group approved successfully"}

# New endpoints for managing colleges and student groups
@router.post("/colleges")
def create_college(
    college_data: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Create a new college"""
    # Check if college already exists
    existing = db.query(College).filter(College.name == college_data["name"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="College already exists")
    
    college = College(name=college_data["name"], is_approved=True)
    db.add(college)
    db.commit()
    db.refresh(college)
    
    return {"message": "College created successfully", "college": college}

@router.put("/colleges/{college_id}")
def update_college(
    college_id: int,
    college_data: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Update college details"""
    college = db.query(College).filter(College.id == college_id).first()
    if not college:
        raise HTTPException(status_code=404, detail="College not found")
    
    # Check if new name conflicts with existing college
    if college_data.get("name") and college_data["name"] != college.name:
        existing = db.query(College).filter(College.name == college_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="College name already exists")
        college.name = college_data["name"]
    
    if "is_approved" in college_data:
        college.is_approved = college_data["is_approved"]
    
    db.commit()
    db.refresh(college)
    
    return {"message": "College updated successfully", "college": college}

@router.delete("/colleges/{college_id}")
def delete_college(
    college_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Delete a college"""
    college = db.query(College).filter(College.id == college_id).first()
    if not college:
        raise HTTPException(status_code=404, detail="College not found")
    
    db.delete(college)
    db.commit()
    
    return {"message": "College deleted successfully"}

@router.post("/student-groups")
def create_student_group(
    group_data: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Create a new student group"""
    # Check if group already exists
    existing = db.query(StudentGroup).filter(StudentGroup.name == group_data["name"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student group already exists")
    
    group = StudentGroup(name=group_data["name"], is_approved=True)
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return {"message": "Student group created successfully", "group": group}

@router.put("/student-groups/{group_id}")
def update_student_group(
    group_id: int,
    group_data: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Update student group details"""
    group = db.query(StudentGroup).filter(StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Student group not found")
    
    # Check if new name conflicts with existing group
    if group_data.get("name") and group_data["name"] != group.name:
        existing = db.query(StudentGroup).filter(StudentGroup.name == group_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Student group name already exists")
        group.name = group_data["name"]
    
    if "is_approved" in group_data:
        group.is_approved = group_data["is_approved"]
    
    db.commit()
    db.refresh(group)
    
    return {"message": "Student group updated successfully", "group": group}

@router.delete("/student-groups/{group_id}")
def delete_student_group(
    group_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Delete a student group"""
    group = db.query(StudentGroup).filter(StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Student group not found")
    
    db.delete(group)
    db.commit()
    
    return {"message": "Student group deleted successfully"}

@router.get("/drives/{drive_id}/exam-status")
def get_exam_status_admin(
    drive_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user)
):
    """Get exam status for a drive (Admin view)"""
    drive = db.query(Drive).filter(Drive.id == drive_id).first()
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    now = datetime.utcnow()
    student_count = len(drive.students)
    has_students = student_count > 0

    # actual_window_end is always set at start time (= actual_window_start + duration_minutes)
    # and overwritten to now if the exam is ended manually early.
    if drive.actual_window_start and drive.actual_window_end:
        seconds_left = (drive.actual_window_end - now).total_seconds()
        time_remaining_seconds = max(0, int(seconds_left))
        time_remaining_minutes = max(0.0, seconds_left / 60)
    else:
        time_remaining_seconds = None
        time_remaining_minutes = None

    # Exam state
    if not drive.actual_window_start:
        exam_state = "not_started"
    elif drive.actual_window_end and now >= drive.actual_window_end:
        exam_state = "ended"
    else:
        exam_state = "ongoing"

    return {
        "drive_id": drive.id,
        "exam_state": exam_state,
        "actual_window_start": drive.actual_window_start,
        "actual_window_end": drive.actual_window_end,
        "window_start": drive.window_start,
        "window_end": drive.window_end,
        "exam_duration_minutes": drive.exam_duration_minutes,
        "time_remaining": time_remaining_seconds,
        "time_remaining_minutes": time_remaining_minutes,
        "can_start": get_drive_status(drive) == "upcoming" and not drive.actual_window_start and has_students,
        "can_end": drive.actual_window_start and drive.actual_window_end and now < drive.actual_window_end,
        "is_approved": drive.is_approved,
        "has_students": has_students,
        "student_count": student_count
    }
