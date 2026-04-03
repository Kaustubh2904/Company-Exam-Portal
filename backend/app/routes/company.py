from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import csv
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import logging
import time
from app.database.connection import get_db
from app.database.config import settings
from app.models import Drive, Question, Student, College, StudentGroup, DriveTarget, Company
from app.models.student_response import StudentResponse as StudentResponseModel
from app.models.notification import Notification
from app.schemas.drive import DriveCreate, DriveUpdate, DriveResponse
from app.schemas.question import QuestionResponse
from app.schemas.student import StudentResponse
from app.schemas.email import (
    EmailTemplateUpdate, EmailTemplateResponse, EmailTemplatePreview,
    EmailTemplatePreviewResponse, EmailSendResponse, EmailStatusResponse
)
from app.schemas.company import CollegeResponse, StudentGroupResponse, NotificationResponse, PLAN_LIMITS
from app.auth import get_company_user, get_company_or_admin_user
from app.utils.email_processor import EmailTemplateProcessor, TEMPLATE_VARIABLES
from app.utils.drive_utils import get_drive_status, format_drive_response

router = APIRouter()
logger = logging.getLogger(__name__)

def run_bulk_email_task(
    students_data: list,
    subject_template: str,
    body_template: str,
    smtp_settings: dict
):
    """
    Background worker that actually sends the emails with retry logic.
    """
    logger.info(f"Starting bulk email task for {len(students_data)} students.")
    
    consecutive_hard_fails = 0
    MAX_CONSECUTIVE_FAILS = 5
    
    for student in students_data:
        # If the server/network crashed 5 times in a row, stop entirely.
        if consecutive_hard_fails >= MAX_CONSECUTIVE_FAILS:
            logger.error("Too many consecutive SMTP connection failures. Aborting background email task.")
            break

        # Render content once per student using prepared variables
        email_variables = student  # student is already a dict from prepare_email_variables
        subject = EmailTemplateProcessor.render_template(subject_template, email_variables)
        body = EmailTemplateProcessor.render_template(body_template, email_variables)

        message = MIMEMultipart()
        message["From"] = f"{smtp_settings['from_name']} <{smtp_settings['username']}>"
        # Use the standard variable name produced by prepare_email_variables
        message["To"] = student.get("student_email") or student.get("email")
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        # 2-try retry logic
        MAX_TRIES = 2
        success = False
        
        for attempt in range(1, MAX_TRIES + 1):
            server = None
            try:
                # Open a FRESH connection for each email to prevent stale timeouts
                server = smtplib.SMTP(smtp_settings["server"], smtp_settings["port"], timeout=10)
                server.starttls()
                server.login(smtp_settings["username"], smtp_settings["password"])
                
                # Send the email
                server.send_message(message)
                
                # Success!
                success = True
                consecutive_hard_fails = 0 # Reset panic circuit breaker
                logger.info(f"Sent email to {student.get('student_email') or student.get('email')} (Attempt {attempt})")
                break # BREAK OUT OF THE RETRY LOOP - We don't need attempt #2
                
            except Exception as e:
                logger.warning(f"Error sending to {student.get('student_email') or student.get('email')} (Attempt {attempt}): {str(e)}")
                # If this is the first try, wait 1 second before trying again
                if attempt < MAX_TRIES:
                    time.sleep(1)
            finally:
                # Always safely close the server connection for this attempt
                if server:
                    try:
                        server.quit()
                    except:
                        pass
        
        # If it failed all tries, record a hard fail
        if not success:
            logger.error(f"Failed to send to {student.get('student_email') or student.get('email')} after {MAX_TRIES} attempts.")
            consecutive_hard_fails += 1
            
        # Optional: Add a tiny sleep between successful emails to avoid Google rate limits
        time.sleep(0.5)

    logger.info("Bulk email task completed/exited.")


def get_effective_company_id(
    current_user: dict = Depends(get_company_or_admin_user),
    x_company_id: Optional[int] = Header(None, alias="X-Company-ID")
) -> int:
    """
    Get the effective company ID to use for the request.
    - If user is admin and X-Company-ID header is provided, use that
    - If user is company, use their own company ID (ignore header)
    - If user is admin and no header provided, raise error
    """
    if current_user["user_type"] == "company":
        # Company users can only access their own data
        return current_user["user"].id
    elif current_user["user_type"] == "admin":
        # Admin can access any company's data if company ID is provided
        if x_company_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin must provide X-Company-ID header"
            )
        return x_company_id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )


@router.get("/drives", response_model=List[DriveResponse])
def get_company_drives(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_effective_company_id)
):
    """Get all drives for the authenticated company or admin viewing a specific company"""
    drives = db.query(Drive).filter(
        Drive.company_id == company_id  # Show all drives so company can see status
    ).offset(skip).limit(limit).all()

    # Add counts for each drive and calculate dynamic status
    result = []
    for drive in drives:
        drive_dict = format_drive_response(drive, db)
        drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
        drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
        drive_dict["status"] = get_drive_status(drive)
        result.append(drive_dict)

    return result

@router.post("/drives", response_model=DriveResponse)
def create_drive(
    drive_data: DriveCreate,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Create a new drive with window-based timing system"""

    # Validate that we have at least one target
    if not drive_data.targets:
        raise HTTPException(status_code=400, detail="At least one target must be specified")

    # Calculate window duration in minutes
    window_duration = drive_data.window_end - drive_data.window_start
    window_duration_minutes = int(window_duration.total_seconds() / 60)

    # Convert timezone-aware datetimes to naive UTC if needed
    # Pydantic may parse ISO strings with 'Z' as timezone-aware UTC datetimes
    # SQLAlchemy expects naive datetimes (which represent UTC)
    window_start_naive = drive_data.window_start.replace(tzinfo=None) if drive_data.window_start.tzinfo else drive_data.window_start
    window_end_naive = drive_data.window_end.replace(tzinfo=None) if drive_data.window_end.tzinfo else drive_data.window_end

    # Create the drive with new window fields
    drive = Drive(
        company_id=company.id,
        title=drive_data.title,
        description=drive_data.description,
        category=drive_data.category,
        window_start=window_start_naive,
        window_end=window_end_naive,
        exam_duration_minutes=drive_data.exam_duration_minutes,
        duration_minutes=window_duration_minutes,  # Store the calculated window duration
        status="draft",
    )

    db.add(drive)
    db.flush()  # Get the drive ID without committing

    # Create drive targets
    for target_data in drive_data.targets:
        # Create custom colleges and student groups if provided
        if target_data.custom_college_name:
            existing_college = db.query(College).filter(College.name == target_data.custom_college_name).first()
            if not existing_college:
                new_college = College(name=target_data.custom_college_name, is_approved=False)
                db.add(new_college)
                db.flush()

        if target_data.custom_student_group_name:
            existing_group = db.query(StudentGroup).filter(StudentGroup.name == target_data.custom_student_group_name).first()
            if not existing_group:
                new_group = StudentGroup(name=target_data.custom_student_group_name, is_approved=False)
                db.add(new_group)
                db.flush()

        # Create drive target
        drive_target = DriveTarget(
            drive_id=drive.id,
            college_id=target_data.college_id,
            custom_college_name=target_data.custom_college_name,
            student_group_id=target_data.student_group_id,
            custom_student_group_name=target_data.custom_student_group_name,
            batch_year=target_data.batch_year
        )
        db.add(drive_target)

    db.commit()
    db.refresh(drive)

    # Load the drive with targets for response
    drive_with_targets = db.query(Drive).filter(Drive.id == drive.id).first()
    drive_dict = format_drive_response(drive_with_targets, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
    return drive_dict

@router.get("/drives/{drive_id}", response_model=DriveResponse)
def get_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get a specific drive"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
    return drive_dict

@router.put("/drives/{drive_id}", response_model=DriveResponse)
def update_drive(
    drive_id: int,
    drive_data: DriveUpdate,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Update a drive with window-based timing system"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Only allow updates for draft or upcoming drives
    current_status = get_drive_status(drive)
    if current_status in ("live", "ended"):
        raise HTTPException(status_code=400, detail=f"Cannot update a {current_status} drive")

    # Update basic fields
    if drive_data.title is not None:
        drive.title = drive_data.title
    if drive_data.description is not None:
        drive.description = drive_data.description
    if drive_data.category is not None:
        drive.category = drive_data.category
    if drive_data.exam_duration_minutes is not None:
        drive.exam_duration_minutes = drive_data.exam_duration_minutes
    if drive_data.window_start is not None:
        # Convert timezone-aware datetime to naive UTC if needed
        window_start_naive = drive_data.window_start.replace(tzinfo=None) if drive_data.window_start.tzinfo else drive_data.window_start
        drive.window_start = window_start_naive
    if drive_data.window_end is not None:
        # Convert timezone-aware datetime to naive UTC if needed
        window_end_naive = drive_data.window_end.replace(tzinfo=None) if drive_data.window_end.tzinfo else drive_data.window_end
        drive.window_end = window_end_naive

    # Recalculate duration_minutes if window times changed
    if drive_data.window_start is not None or drive_data.window_end is not None:
        if drive.window_start and drive.window_end:
            window_duration = drive.window_end - drive.window_start
            drive.duration_minutes = int(window_duration.total_seconds() / 60)

    # Update targets if provided
    if drive_data.targets is not None:
        # Remove existing targets
        db.query(DriveTarget).filter(DriveTarget.drive_id == drive_id).delete()

        # Add new targets
        for target_data in drive_data.targets:
            # Create custom colleges and student groups if provided
            if target_data.custom_college_name:
                existing_college = db.query(College).filter(College.name == target_data.custom_college_name).first()
                if not existing_college:
                    new_college = College(name=target_data.custom_college_name, is_approved=False)
                    db.add(new_college)
                    db.flush()

            if target_data.custom_student_group_name:
                existing_group = db.query(StudentGroup).filter(StudentGroup.name == target_data.custom_student_group_name).first()
                if not existing_group:
                    new_group = StudentGroup(name=target_data.custom_student_group_name, is_approved=False)
                    db.add(new_group)
                    db.flush()

            # Create drive target
            drive_target = DriveTarget(
                drive_id=drive.id,
                college_id=target_data.college_id,
                custom_college_name=target_data.custom_college_name,
                student_group_id=target_data.student_group_id,
                custom_student_group_name=target_data.custom_student_group_name,
                batch_year=target_data.batch_year
            )
            db.add(drive_target)

    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
    return drive_dict

@router.delete("/drives/{drive_id}")
def delete_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Delete a drive"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Only allow deletion of draft or upcoming drives
    current_status = get_drive_status(drive)
    if current_status in ("live", "ended"):
        raise HTTPException(status_code=400, detail=f"Cannot delete a {current_status} drive")

    db.delete(drive)
    db.commit()

    return {"message": "Drive deleted successfully"}

@router.put("/drives/{drive_id}/publish", response_model=DriveResponse)
def publish_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Publish a draft drive — moves it to 'upcoming' so it can be started later"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if drive.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft drives can be published")

    # Check the drive has questions and students before allowing publish
    question_count = db.query(Question).filter(Question.drive_id == drive_id).count()
    if question_count == 0:
        raise HTTPException(status_code=400, detail="Drive must have at least one question before publishing")

    student_count = db.query(Student).filter(Student.drive_id == drive_id).count()
    if student_count == 0:
        raise HTTPException(status_code=400, detail="Drive must have at least one student before publishing")

    drive.status = "upcoming"
    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = question_count
    drive_dict["student_count"] = student_count
    return drive_dict

@router.post("/drives/{drive_id}/duplicate", response_model=DriveResponse)
def duplicate_drive(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Duplicate a drive with all its questions and targets"""
    original_drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not original_drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Block duplication of completed drives
    current_status = get_drive_status(original_drive)
    if current_status == "completed":
        raise HTTPException(status_code=400, detail="Completed drives cannot be duplicated")

    # Create new drive copying only description, category, and exam duration
    # window times, actual times, and approval state are reset
    new_drive = Drive(
        company_id=company.id,
        title=f"Copy of {original_drive.title}",
        description=original_drive.description,
        category=original_drive.category,
        window_start=None,
        window_end=None,
        exam_duration_minutes=original_drive.exam_duration_minutes,
        duration_minutes=None,
        status="draft",
        is_approved=False
    )

    db.add(new_drive)
    db.flush()  # Get the ID for the new drive

    # Copy all targets
    for target in original_drive.targets:
        new_target = DriveTarget(
            drive_id=new_drive.id,
            college_id=target.college_id,
            custom_college_name=target.custom_college_name,
            student_group_id=target.student_group_id,
            custom_student_group_name=target.custom_student_group_name,
            batch_year=target.batch_year
        )
        db.add(new_target)

    # Copy all questions
    original_questions = db.query(Question).filter(Question.drive_id == drive_id).all()
    for question in original_questions:
        new_question = Question(
            drive_id=new_drive.id,
            question_text=question.question_text,
            option_a=question.option_a,
            option_b=question.option_b,
            option_c=question.option_c,
            option_d=question.option_d,
            correct_answer=question.correct_answer,
            points=question.points
        )
        db.add(new_question)

    # Copy pre-exam students (only those who have not started the exam yet)
    original_students = db.query(Student).filter(
        Student.drive_id == drive_id,
        Student.exam_started_at == None
    ).all()
    for student in original_students:
        new_student = Student(
            drive_id=new_drive.id,
            company_id=company.id,
            name=student.name,
            email=student.email,
            roll_number=student.roll_number,
            phone=student.phone,
            college_name=student.college_name,
            student_group_name=student.student_group_name,
            access_token=student.access_token
        )
        db.add(new_student)

    db.commit()
    db.refresh(new_drive)

    drive_dict = format_drive_response(new_drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == new_drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == new_drive.id).count()
    return drive_dict

# Question management routes
@router.get("/drives/{drive_id}/questions", response_model=List[QuestionResponse])
def get_drive_questions(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get all questions for a drive"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    questions = db.query(Question).filter(Question.drive_id == drive_id).all()
    return questions

@router.get("/drives/{drive_id}/students", response_model=List[StudentResponse])
def get_drive_students(
    drive_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_effective_company_id)
):
    """Get all students for a drive (accessible by company owner or admin)"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company_id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    students = db.query(Student).filter(Student.drive_id == drive_id).all()
    return students

# Reference data endpoints for targeting
@router.get("/colleges", response_model=List[CollegeResponse])
def get_approved_colleges(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get all approved colleges for targeting"""
    colleges = db.query(College).filter(College.is_approved == True).all()
    return colleges

@router.get("/student-groups", response_model=List[StudentGroupResponse])
def get_approved_student_groups(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get all approved student groups for targeting"""
    groups = db.query(StudentGroup).filter(StudentGroup.is_approved == True).all()
    return groups

# Email Template Management
@router.get("/email-template", response_model=EmailTemplateResponse)
def get_email_template(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get company's email template"""
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "subject_template": company_obj.email_subject_template,
        "body_template": company_obj.email_body_template,
        "use_custom_template": company_obj.use_custom_template,
        "template_updated_at": company_obj.template_updated_at,
        "available_variables": TEMPLATE_VARIABLES
    }

@router.put("/email-template", response_model=EmailTemplateResponse)
def update_email_template(
    template_data: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Update company's email template"""
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    # Validate templates
    subject_validation = EmailTemplateProcessor.validate_template(template_data.subject_template)
    body_validation = EmailTemplateProcessor.validate_template(template_data.body_template)

    if not subject_validation['is_valid']:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid variables in subject template: {subject_validation['invalid_variables']}"
        )

    if not body_validation['is_valid']:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid variables in body template: {body_validation['invalid_variables']}"
        )

    # Update template
    company_obj.email_subject_template = template_data.subject_template
    company_obj.email_body_template = template_data.body_template
    company_obj.use_custom_template = template_data.use_custom_template
    company_obj.template_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(company_obj)

    return {
        "subject_template": company_obj.email_subject_template,
        "body_template": company_obj.email_body_template,
        "use_custom_template": company_obj.use_custom_template,
        "template_updated_at": company_obj.template_updated_at,
        "available_variables": TEMPLATE_VARIABLES
    }

@router.post("/email-template/preview", response_model=EmailTemplatePreviewResponse)
def preview_email_template(
    preview_data: EmailTemplatePreview,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Preview email template with sample data"""
    sample_data = EmailTemplateProcessor.get_sample_data()

    # Use company name if available
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if company_obj:
        sample_data['company_name'] = company_obj.company_name

    rendered_subject = EmailTemplateProcessor.render_template(
        preview_data.subject_template,
        sample_data
    )
    rendered_body = EmailTemplateProcessor.render_template(
        preview_data.body_template,
        sample_data
    )

    return {
        "rendered_subject": rendered_subject,
        "rendered_body": rendered_body,
        "sample_data_used": sample_data
    }

# Email Sending
@router.post("/drives/{drive_id}/email-students", response_model=EmailSendResponse)
def email_students(
    drive_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Send login credentials to students via email (Background Task)"""
    # Validate email configuration
    if not settings.smtp_username or not settings.smtp_password:
        raise HTTPException(
            status_code=500,
            detail="Email configuration not complete. Please check SMTP settings."
        )

    # Get drive and validate
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    drive_status = get_drive_status(drive)
    if drive_status != "upcoming":
        raise HTTPException(status_code=400, detail="Drive must be in 'upcoming' status before emailing students")

    # Get students
    students = db.query(Student).filter(Student.drive_id == drive_id).all()
    if not students:
        raise HTTPException(status_code=400, detail="No students found for this drive")

    # Get company template
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    # 1. Package the specific SMTP settings needed
    smtp_settings = {
        "server": settings.smtp_server,
        "port": settings.smtp_port,
        "username": settings.smtp_username,
        "password": settings.smtp_password,
        "from_name": settings.smtp_from_name
    }

    # Prepare templates and per-student variables using the processor
    subject_template = company_obj.email_subject_template
    body_template = company_obj.email_body_template

    # 4. Build per-student variable dicts using EmailTemplateProcessor
    student_data_list = []
    for s in students:
        vars_dict = EmailTemplateProcessor.prepare_email_variables(s, drive, company_obj)
        # ensure the 'student_email' key exists for message 'To'
        vars_dict.setdefault('student_email', s.email)
        student_data_list.append(vars_dict)

    # Kick off the background task using templates
    background_tasks.add_task(
        run_bulk_email_task,
        student_data_list,
        subject_template,
        body_template,
        smtp_settings
    )

    # Return INSTANTLY
    return {
        "success": True,
        "message": f"Queued {len(students)} emails for background sending. They will be sent shortly.",
        "sent_count": 0, # They are queued, not sent yet.
        "failed_count": 0,
        "total_students": len(students),
        "failed_emails": []
    }

@router.get("/drives/{drive_id}/email-status", response_model=EmailStatusResponse)
def get_email_status(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Check if drive is ready for emailing students"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    student_count = db.query(Student).filter(Student.drive_id == drive_id).count()
    company_obj = db.query(Company).filter(Company.id == company.id).first()

    # Check email configuration
    email_configured = bool(settings.smtp_username and settings.smtp_password)

    # Generate preview
    if company_obj:
        sample_data = EmailTemplateProcessor.get_sample_data()
        sample_data['company_name'] = company_obj.company_name
        sample_data['drive_title'] = drive.title

        preview_subject = EmailTemplateProcessor.render_template(
            company_obj.email_subject_template, sample_data
        )[:100] + "..."
        preview_body = EmailTemplateProcessor.render_template(
            company_obj.email_body_template, sample_data
        )[:200] + "..."

        template_preview = {
            "subject": preview_subject,
            "body": preview_body
        }
    else:
        template_preview = {"subject": "Template not found", "body": ""}

    drive_status_val = get_drive_status(drive)
    # Only upcoming drives are allowed to send emails now
    can_send = drive_status_val == "upcoming" and student_count > 0 and email_configured

    status_message = (
        "Ready to send emails" if can_send
        else "Drive not published yet" if drive_status_val == "draft"
        else "Emails can only be sent before exam starts (upcoming status)" if drive_status_val == "live"
        else "No students found" if student_count == 0
        else "Email not configured" if not email_configured
        else "Unknown error"
    )

    return {
        "drive_id": drive_id,
        "drive_title": drive.title,
        "is_approved": (company_obj.status == "approved") if company_obj else False,
        "student_count": student_count,
        "can_send_emails": can_send,
        "status_message": status_message,
        "template_preview": template_preview,
        "using_custom_template": company_obj.use_custom_template if company_obj else False,
        "email_configured": email_configured
    }

# Bulk Upload Endpoints
@router.post("/drives/{drive_id}/upload-questions")
async def upload_questions_csv(
    drive_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Upload questions from CSV file. Expected columns: question, option_a, option_b, option_c, option_d, correct_answer, points"""
    # Verify drive ownership
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Only allow question uploads for draft drives
    if get_drive_status(drive) not in ("draft", "upcoming"):
        raise HTTPException(status_code=400, detail="Cannot upload questions to a live or ended drive")

    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        # Read CSV content
        content = await file.read()
        csv_data = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_data))

        added_count = 0
        error_count = 0
        errors = []

        for row_num, row in enumerate(csv_reader, start=2):  # Start from row 2 (after header)
            try:
                # Validate required fields
                required_fields = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
                missing_fields = [field for field in required_fields if not row.get(field, '').strip()]

                if missing_fields:
                    errors.append(f"Row {row_num}: Missing fields: {', '.join(missing_fields)}")
                    error_count += 1
                    continue

                # Validate correct_answer is one of the provided options
                option_a = row['option_a'].strip()
                option_b = row['option_b'].strip()
                option_c = row['option_c'].strip()
                option_d = row['option_d'].strip()
                correct_answer = row['correct_answer'].strip()

                if correct_answer not in [option_a, option_b, option_c, option_d]:
                    errors.append(f"Row {row_num}: correct_answer must match one of the four options exactly")
                    error_count += 1
                    continue

                # Create question
                question = Question(
                    drive_id=drive_id,
                    question_text=row['question'].strip(),
                    option_a=option_a,
                    option_b=option_b,
                    option_c=option_c,
                    option_d=option_d,
                    correct_answer=correct_answer,
                    points=int(row.get('points', 1))
                )

                db.add(question)
                added_count += 1

            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
                error_count += 1

        db.commit()

        return {
            "success": True,
            "message": f"Upload completed. Added {added_count} questions, {error_count} errors.",
            "added_count": added_count,
            "error_count": error_count,
            "errors": errors[:10]  # Limit to first 10 errors
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")

@router.post("/drives/{drive_id}/upload-students")
async def upload_students_csv(
    drive_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Upload students from CSV file. Expected columns: name, email, roll_number, phone, college, student_group"""
    # Verify drive ownership
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        # Read CSV content
        content = await file.read()
        csv_data = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_data))

        added_count = 0
        error_count = 0
        errors = []

        for row_num, row in enumerate(csv_reader, start=2):  # Start from row 2 (after header)
            try:
                # Validate required fields
                required_fields = ['name', 'email', 'roll_number']
                missing_fields = [field for field in required_fields if not row.get(field, '').strip()]

                if missing_fields:
                    errors.append(f"Row {row_num}: Missing fields: {', '.join(missing_fields)}")
                    error_count += 1
                    continue

                # Check if student already exists for this drive
                existing_student = db.query(Student).filter(
                    Student.drive_id == drive_id,
                    Student.email == row['email'].strip().lower()
                ).first()

                if existing_student:
                    errors.append(f"Row {row_num}: Student with email {row['email']} already exists")
                    error_count += 1
                    continue

                college_name = row.get('college', '').strip()
                group_name = row.get('student_group', '').strip()

                # Create student
                student = Student(
                    drive_id=drive_id,
                    company_id=company.id,
                    name=row['name'].strip(),
                    email=row['email'].strip().lower(),
                    roll_number=row['roll_number'].strip(),
                    phone=row.get('phone', '').strip() or None,
                    college_name=college_name or None,
                    student_group_name=group_name or None,
                )

                db.add(student)
                added_count += 1

            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
                error_count += 1

        db.commit()

        return {
            "success": True,
            "message": f"Upload completed. Added {added_count} students, {error_count} errors.",
            "added_count": added_count,
            "error_count": error_count,
            "errors": errors[:10]  # Limit to first 10 errors
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")


# Exam Control Endpoints
@router.post("/drives/{drive_id}/start")
def start_exam(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Start the exam window - allows students to login and begin their individual exam duration"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Drive must be in 'upcoming' status (published) to start
    current_status = get_drive_status(drive)
    if current_status != "upcoming":
        raise HTTPException(
            status_code=400,
            detail=f"Only 'upcoming' drives can be started (current status: {current_status})"
        )

    if drive.actual_window_start:
        raise HTTPException(status_code=400, detail="Exam window has already been started")

    # ── Plan check ─────────────────────────────────────────────
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    # Lazy expiry check — if plan expired, treat as free (limit = 2)
    now = datetime.utcnow()
    effective_limit = company_obj.drives_limit
    if company_obj.plan_expires_at and now > company_obj.plan_expires_at:
        # Plan has expired — fall back to free-tier limit
        effective_limit = PLAN_LIMITS.get("free", 2)

    if company_obj.drives_used >= effective_limit:
        if company_obj.plan_expires_at and now > company_obj.plan_expires_at:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Your plan has expired and you have used all {effective_limit} free-tier drives. "
                    "Please contact admin to renew your plan."
                )
            )
        raise HTTPException(
            status_code=403,
            detail=(
                f"Drive limit reached ({company_obj.drives_used}/{effective_limit} drives used). "
                "Please contact admin to upgrade your plan."
            )
        )
    # ── End plan check ─────────────────────────────────────────

    # Calculate the window duration from scheduled times
    if not drive.window_start or not drive.window_end:
        raise HTTPException(status_code=400, detail="Drive must have window_start and window_end times set")

    # Set actual_window_start to now
    now = datetime.utcnow()
    drive.actual_window_start = now

    # Calculate actual window end time.
    # Invariant: actual_window_end = actual_window_start + window_duration_minutes
    # Use duration_minutes if set (= window_end - window_start at creation time),
    # otherwise fall back to the scheduled window length.
    if drive.duration_minutes:
        window_duration_minutes = drive.duration_minutes
    else:
        window_duration_minutes = int((drive.window_end - drive.window_start).total_seconds() / 60)

    drive.actual_window_end = drive.actual_window_start + timedelta(minutes=window_duration_minutes)

    # Increment the company's drives_used counter
    company_obj.drives_used = (company_obj.drives_used or 0) + 1

    # Mark drive as live
    drive.status = "live"

    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()

    return {
        "success": True,
        "message": "Exam window started successfully. Students can now login and begin their exam.",
        "drive": drive_dict
    }


@router.post("/drives/{drive_id}/end")
def end_exam(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Manually end the exam window - closes login access and auto-submits all active exams"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if not drive.actual_window_start:
        raise HTTPException(status_code=400, detail="Cannot end exam window that hasn't been started")

    # Check if already manually ended (actual_window_end exists and is in the past)
    if drive.actual_window_end and drive.actual_window_end < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Exam window has already ended")

    # Set the actual window end time immediately (override any calculated end time)
    now = datetime.utcnow()
    drive.actual_window_end = now
    drive.status = "ended"

    # Auto-submit all students who are currently taking the exam
    students_in_progress = db.query(Student).filter(
        Student.drive_id == drive.id,
        Student.exam_started_at.isnot(None),
        Student.exam_submitted_at.is_(None)
    ).all()

    submitted_count = 0
    for student in students_in_progress:
        student.exam_submitted_at = now
        submitted_count += 1

    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()

    return {
        "success": True,
        "message": f"Exam window ended successfully. {submitted_count} students' exams were auto-submitted.",
        "auto_submitted_count": submitted_count,
        "drive": drive_dict
    }


@router.get("/drives/{drive_id}/exam-status")
def get_exam_status(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get the current exam status for the drive window"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    student_count = db.query(Student).filter(Student.drive_id == drive_id).count()
    has_students = student_count > 0
    now = datetime.utcnow()

    # actual_window_end is always set at start time (= actual_window_start + duration_minutes)
    # and overwritten to now if the exam is ended manually early.
    # So time_remaining is simply actual_window_end - now while the exam is ongoing.
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
    elif now >= drive.actual_window_end:
        exam_state = "ended"
    else:
        exam_state = "ongoing"

    return {
        "drive_id": drive_id,
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
        "status": get_drive_status(drive),
        "has_students": has_students,
        "student_count": student_count
    }


# ============= RESULTS ROUTES =============

@router.get("/drives/{drive_id}/results")
def get_drive_results(
    drive_id: int,
    min_percentage: Optional[float] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_effective_company_id)
):
    """Get results for all students in a drive with optional percentage filter"""

    # Verify drive belongs to company
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company_id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Get all students for this drive
    students = db.query(Student).filter(
        Student.drive_id == drive_id
    ).all()

    results = []
    for student in students:
        # Calculate percentage
        percentage = None
        if student.total_marks and student.total_marks > 0:
            percentage = (student.score / student.total_marks) * 100

        # Apply filter if specified
        if min_percentage is not None:
            if percentage is None or percentage < min_percentage:
                continue

        results.append({
            "id": student.id,
            "name": student.name,
            "email": student.email,
            "roll_number": student.roll_number,
            "phone": student.phone,
            "college_name": student.college_name,
            "student_group_name": student.student_group_name,
            "score": student.score,
            "total_marks": student.total_marks,
            "percentage": round(percentage, 2) if percentage is not None else None,
            "exam_started_at": student.exam_started_at,
            "exam_submitted_at": student.exam_submitted_at,
            "is_disqualified": student.is_disqualified,
            "disqualification_reason": student.disqualification_reason,
        })

    return {
        "drive_id": drive_id,
        "drive_title": drive.title,
        "total_students": len(students),
        "filtered_students": len(results),
        "results": results
    }


@router.get("/drives/{drive_id}/results/export")
def export_drive_results(
    drive_id: int,
    format: str = "summary",  # "summary" or "detailed"
    db: Session = Depends(get_db),
    company_id: int = Depends(get_effective_company_id)
):
    """Export drive results as CSV (summary or detailed format)"""
    # Verify drive belongs to company
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company_id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    # Get all students for this drive
    students = db.query(Student).filter(
        Student.drive_id == drive_id
    ).all()

    if format == "summary":
        # Summary CSV: Name, Email, Roll Number, College, Student Group, Score, Total, Percentage, Status, Is_Disqualified
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow([
            "Name", "Email", "Roll Number", "College", "Student Group", "Score", "Total",
            "Percentage", "Status", "Is_Disqualified"
        ])

        # Write data
        for student in students:
            percentage = None
            status = "Not Started"

            if student.is_disqualified:
                status = "Disqualified"
            elif student.exam_submitted_at:
                status = "Submitted"
                if student.total_marks and student.total_marks > 0:
                    percentage = (student.score / student.total_marks) * 100
            elif student.exam_started_at:
                status = "In Progress"

            writer.writerow([
                student.name,
                student.email,
                student.roll_number or "",
                student.college_name or "",
                student.student_group_name or "",
                student.score if student.score is not None else "",
                student.total_marks if student.total_marks is not None else "",
                f"{percentage:.2f}" if percentage is not None else "",
                status,
                "Yes" if student.is_disqualified else "No"
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=drive_{drive_id}_results_summary.csv"
            }
        )

    elif format == "detailed":
        # Detailed CSV: All summary columns + individual question columns (Q1, Q2, ...)
        output = io.StringIO()
        writer = csv.writer(output)

        # Get all questions for this drive to determine number of columns
        questions = db.query(Question).filter(
            Question.drive_id == drive_id
        ).order_by(Question.id).all()

        num_questions = len(questions)
        question_headers = [f"Q{i+1}" for i in range(num_questions)]

        # Write header
        header = [
            "Name", "Email", "Roll Number", "College", "Student Group", "Score", "Total",
            "Percentage", "Status", "Is_Disqualified"
        ] + question_headers
        writer.writerow(header)

        # Write data for each student
        for student in students:
            percentage = None
            status = "Not Started"

            if student.is_disqualified:
                status = "Disqualified"
            elif student.exam_submitted_at:
                status = "Submitted"
                if student.total_marks and student.total_marks > 0:
                    percentage = (student.score / student.total_marks) * 100
            elif student.exam_started_at:
                status = "In Progress"

            # Get student's responses
            responses = db.query(StudentResponseModel).filter(
                StudentResponseModel.student_id == student.id
            ).all()

            # Create a mapping of question_id to response
            response_map = {r.question_id: r for r in responses}

            # Build question answers based on student's question_order
            question_answers = []
            if student.question_order:
                for q_id in student.question_order:
                    response = response_map.get(q_id)
                    if response:
                        # Show selected option and correctness
                        if response.selected_option:
                            correct_marker = "✓" if response.is_correct else "✗"
                            question_answers.append(f"{response.selected_option.upper()} {correct_marker}")
                        else:
                            question_answers.append("Not Answered")
                    else:
                        question_answers.append("Not Answered")
            else:
                # If no question order (exam not started), fill with empty
                question_answers = [""] * num_questions

            # Pad or trim to match number of questions
            while len(question_answers) < num_questions:
                question_answers.append("")
            question_answers = question_answers[:num_questions]

            row = [
                student.name,
                student.email,
                student.roll_number or "",
                student.college_name or "",
                student.student_group_name or "",
                student.score if student.score is not None else "",
                student.total_marks if student.total_marks is not None else "",
                f"{percentage:.2f}" if percentage is not None else "",
                status,
                "Yes" if student.is_disqualified else "No"
            ] + question_answers

            writer.writerow(row)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=drive_{drive_id}_results_detailed.csv"
            }
        )

    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid format. Use 'summary' or 'detailed'"
        )


# ============= PROFILE ROUTE =============

@router.get("/profile")
def get_company_profile(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get the authenticated company's profile including plan info"""
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    now = datetime.utcnow()
    plan_active = not (company_obj.plan_expires_at and now > company_obj.plan_expires_at)
    effective_limit = company_obj.drives_limit if plan_active else PLAN_LIMITS.get("free", 2)
    drives_remaining = max(0, effective_limit - (company_obj.drives_used or 0))

    return {
        "id": company_obj.id,
        "company_name": company_obj.company_name,
        "username": company_obj.username,
        "email": company_obj.email,
        "logo_url": company_obj.logo_url,
        "plan": company_obj.plan,
        "drives_limit": effective_limit,
        "drives_used": company_obj.drives_used or 0,
        "drives_remaining": drives_remaining,
        "plan_expires_at": company_obj.plan_expires_at,
        "plan_updated_at": company_obj.plan_updated_at,
        "plan_active": plan_active,
        "created_at": company_obj.created_at,
    }


# ============= NOTIFICATION ROUTES =============

@router.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Get all notifications for the authenticated company (last 90 days)"""
    cutoff = datetime.utcnow() - timedelta(days=90)
    notifications = (
        db.query(Notification)
        .filter(
            Notification.company_id == company.id,
            Notification.created_at >= cutoff
        )
        .order_by(Notification.created_at.desc())
        .all()
    )
    return notifications

@router.put("/notifications/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Mark a specific notification as read"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.company_id == company.id
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    
    return {"success": True, "message": "Notification marked as read"}

@router.put("/notifications/read-all")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Mark all unread notifications as read for the authenticated company"""
    notifications = db.query(Notification).filter(
        Notification.company_id == company.id,
        Notification.is_read == False
    ).all()

    count = len(notifications)
    if count > 0:
        for notification in notifications:
            notification.is_read = True
        db.commit()

    return {"success": True, "message": f"{count} notifications marked as read", "updated_count": count}
