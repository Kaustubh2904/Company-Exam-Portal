from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import csv
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from app.database.connection import get_db
from app.database.config import settings
from app.models import Drive, Question, Student, College, StudentGroup, DriveTarget, Company
from app.schemas.drive import DriveCreate, DriveUpdate, DriveResponse, DriveStatusUpdate
from app.schemas.question import QuestionResponse
from app.schemas.student import StudentResponse
from app.schemas.email import (
    EmailTemplateUpdate, EmailTemplateResponse, EmailTemplatePreview,
    EmailTemplatePreviewResponse, EmailSendResponse, EmailStatusResponse
)
from app.schemas.company import CollegeResponse, StudentGroupResponse
from app.auth import get_company_user, get_company_or_admin_user
from app.utils.email_processor import EmailTemplateProcessor, TEMPLATE_VARIABLES

router = APIRouter()

def get_drive_status(drive: Drive) -> str:
    """Calculate drive status on-the-fly based on current time and window times"""
    if drive.status == "suspended":
        return "suspended"
    if drive.status in ["draft", "submitted", "rejected"]:
        return drive.status
    if not drive.is_approved:
        return drive.status

    now = datetime.utcnow()

    # Check if drive has been manually ended
    if drive.actual_window_end and now >= drive.actual_window_end:
        return "completed"

    # Check if drive is manually started and still active
    if drive.actual_window_start:
        # Calculate when window should end based on actual start
        if drive.window_start and drive.window_end:
            window_duration = drive.window_end - drive.window_start
            expected_end = drive.actual_window_start + window_duration
            if now >= expected_end:
                return "completed"
            return "live"

    # Check scheduled window times
    if drive.window_start and drive.window_end:
        if now >= drive.window_end:
            return "completed"
        if now >= drive.window_start:
            return "live"
        if now < drive.window_start:
            return "upcoming"

    return drive.status

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

def format_drive_response(drive: Drive, db: Session):
    """Format drive response with resolved target information"""
    targets = []
    for target in drive.targets:
        college_name = None
        student_group_name = None

        if target.college_id:
            college = db.query(College).filter(College.id == target.college_id).first()
            college_name = college.name if college else None
        elif target.custom_college_name:
            college_name = target.custom_college_name

        if target.student_group_id:
            group = db.query(StudentGroup).filter(StudentGroup.id == target.student_group_id).first()
            student_group_name = group.name if group else None
        elif target.custom_student_group_name:
            student_group_name = target.custom_student_group_name

        targets.append({
            "id": target.id,
            "college_id": target.college_id,
            "custom_college_name": target.custom_college_name,
            "student_group_id": target.student_group_id,
            "custom_student_group_name": target.custom_student_group_name,
            "batch_year": target.batch_year,
            "college_name": college_name,
            "student_group_name": student_group_name
        })

    # Get company name
    company = db.query(Company).filter(Company.id == drive.company_id).first()
    company_name = company.company_name if company else None

    return {
        "id": drive.id,
        "company_id": drive.company_id,
        "company_name": company_name,
        "title": drive.title,
        "description": drive.description,
        "category": drive.category or "Technical MCQ",  # Default if null
        "targets": targets,
        "window_start": drive.window_start,  # May be null, but schema allows it
        "window_end": drive.window_end,      # May be null, but schema allows it
        "actual_window_start": drive.actual_window_start,
        "actual_window_end": drive.actual_window_end,
        "exam_duration_minutes": drive.exam_duration_minutes or 60,  # Default if null
        "duration_minutes": drive.duration_minutes,  # Window duration in minutes
        "status": drive.status,
        "is_approved": drive.is_approved,
        "admin_notes": drive.admin_notes,
        "created_at": drive.created_at,
        "updated_at": drive.updated_at
    }

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
        # Override status with calculated status if approved
        if drive.is_approved:
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
        status="draft"
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

    # Only allow updates if drive is not approved yet
    if drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot update approved drive")

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
            print(f"DEBUG: Recalculated duration_minutes: {drive.duration_minutes}")

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

    # Only allow deletion if drive is not approved yet
    if drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot delete approved drive")

    db.delete(drive)
    db.commit()

    return {"message": "Drive deleted successfully"}

@router.put("/drives/{drive_id}/submit", response_model=DriveResponse)
def submit_drive_for_approval(
    drive_id: int,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Submit drive for admin approval"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if drive.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft drives can be submitted")

    # Check if drive has questions and students
    question_count = db.query(Question).filter(Question.drive_id == drive_id).count()
    if question_count == 0:
        raise HTTPException(status_code=400, detail="Drive must have at least one question to submit")

    student_count = db.query(Student).filter(Student.drive_id == drive_id).count()
    if student_count == 0:
        raise HTTPException(status_code=400, detail="Drive must have at least one student to submit")

    drive.status = "submitted"
    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
    return drive_dict

@router.put("/drives/{drive_id}/status", response_model=DriveResponse)
def update_drive_status(
    drive_id: int,
    status_data: DriveStatusUpdate,
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Update drive status (start/stop)"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if not drive.is_approved:
        raise HTTPException(status_code=400, detail="Drive not approved by admin")

    drive.status = status_data.status
    db.commit()
    db.refresh(drive)

    drive_dict = format_drive_response(drive, db)
    drive_dict["question_count"] = db.query(Question).filter(Question.drive_id == drive.id).count()
    drive_dict["student_count"] = db.query(Student).filter(Student.drive_id == drive.id).count()
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

    # Create new drive with copied data
    new_drive = Drive(
        company_id=company.id,
        title=f"{original_drive.title} (Copy)",
        description=original_drive.description,
        category=original_drive.category or "Technical MCQ",  # Default category if None
        window_start=None,  # Reset schedule
        window_end=None,    # Reset schedule
        exam_duration_minutes=original_drive.exam_duration_minutes or 60,  # Default 60 minutes if None
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

@router.post("/drives/{drive_id}/questions/csv-upload")
def upload_questions_csv(
    drive_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Upload questions from CSV file. Expected columns: question, option_a, option_b, option_c, option_d, correct_answer, points"""
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot add questions to approved drive")

    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV format")

    try:
        content = file.file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(content))

        required_columns = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
        if not all(col in csv_reader.fieldnames for col in required_columns):
            raise HTTPException(status_code=400, detail=f"CSV must contain columns: {', '.join(required_columns)}")

        questions = []
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 because of header
            try:
                points = int(row.get('points', 1))

                # Validate correct_answer is one of the options
                options = [row['option_a'], row['option_b'], row['option_c'], row['option_d']]
                if row['correct_answer'] not in options:
                    raise ValueError(f"Row {row_num}: correct_answer must be one of the provided options")

                question = Question(
                    drive_id=drive_id,
                    question_text=row['question'].strip(),
                    option_a=row['option_a'].strip(),
                    option_b=row['option_b'].strip(),
                    option_c=row['option_c'].strip(),
                    option_d=row['option_d'].strip(),
                    correct_answer=row['correct_answer'].strip(),
                    points=points
                )
                questions.append(question)

            except (ValueError, KeyError) as e:
                raise HTTPException(status_code=400, detail=f"Error in row {row_num}: {str(e)}")

        if not questions:
            raise HTTPException(status_code=400, detail="No valid questions found in CSV")

        db.add_all(questions)
        db.commit()

        return {"message": f"Successfully uploaded {len(questions)} questions from CSV"}

    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File encoding not supported. Please use UTF-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")

@router.post("/drives/{drive_id}/students/csv-upload")
def upload_students_csv(
    drive_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Upload students from CSV file. Expected columns: name, email, roll_number, phone, college, student_group"""
    import uuid

    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot add students to approved drive")

    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV format")

    try:
        content = file.file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(content))

        required_columns = ['name', 'email', 'roll_number']
        if not all(col in csv_reader.fieldnames for col in required_columns):
            raise HTTPException(
                status_code=400,
                detail=f"CSV must contain columns: {', '.join(required_columns)}. Optional: phone, college, student_group"
            )

        students = []
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 because of header
            try:
                # Check if student already exists in this drive (by email)
                existing_student = db.query(Student).filter(
                    Student.drive_id == drive_id,
                    Student.email == row['email'].strip().lower()
                ).first()

                if existing_student:
                    continue  # Skip duplicate students

                # Generate unique access token
                access_token = str(uuid.uuid4())

                student = Student(
                    drive_id=drive_id,
                    company_id=company.id,
                    name=row['name'].strip(),
                    email=row['email'].strip().lower(),
                    roll_number=row['roll_number'].strip(),
                    phone=row.get('phone', '').strip() if row.get('phone', '').strip() else None,
                    college_name=row.get('college', '').strip() if row.get('college', '').strip() else None,
                    student_group_name=row.get('student_group', '').strip() if row.get('student_group', '').strip() else None,
                    access_token=access_token
                )
                students.append(student)

            except (ValueError, KeyError) as e:
                raise HTTPException(status_code=400, detail=f"Error in row {row_num}: {str(e)}")

        if not students:
            raise HTTPException(status_code=400, detail="No new students found in CSV (duplicates skipped)")

        db.add_all(students)
        db.commit()

        return {
            "message": f"Successfully uploaded {len(students)} new students from CSV",
            "count": len(students)
        }

    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File encoding not supported. Please use UTF-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")

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
    db: Session = Depends(get_db),
    company: dict = Depends(get_company_user)
):
    """Send login credentials to students via email (only for approved drives)"""
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

    if not drive.is_approved:
        raise HTTPException(status_code=400, detail="Drive must be approved before emailing students")

    # Get students
    students = db.query(Student).filter(Student.drive_id == drive_id).all()
    if not students:
        raise HTTPException(status_code=400, detail="No students found for this drive")

    # Get company template
    company_obj = db.query(Company).filter(Company.id == company.id).first()
    if not company_obj:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        # Create SMTP session
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)

        sent_count = 0
        failed_emails = []

        for student in students:
            try:
                # Prepare email variables
                email_variables = EmailTemplateProcessor.prepare_email_variables(
                    student, drive, company_obj
                )

                # Render email content
                subject = EmailTemplateProcessor.render_template(
                    company_obj.email_subject_template,
                    email_variables
                )
                body = EmailTemplateProcessor.render_template(
                    company_obj.email_body_template,
                    email_variables
                )

                # Create email message
                message = MIMEMultipart()
                message["From"] = f"{settings.smtp_from_name} <{settings.smtp_username}>"
                message["To"] = student.email
                message["Subject"] = subject

                # Attach body
                message.attach(MIMEText(body, "plain"))

                # Send email
                server.send_message(message)
                sent_count += 1

            except Exception as e:
                failed_emails.append({
                    "student_roll": student.roll_number,
                    "student_email": student.email,
                    "error": str(e)
                })

        # Close SMTP session
        server.quit()

        return {
            "success": True,
            "message": f"Email sending completed",
            "sent_count": sent_count,
            "failed_count": len(failed_emails),
            "total_students": len(students),
            "failed_emails": failed_emails
        }

    except smtplib.SMTPAuthenticationError:
        raise HTTPException(
            status_code=400,
            detail="Email authentication failed. Please check SMTP credentials."
        )
    except smtplib.SMTPConnectError:
        raise HTTPException(
            status_code=500,
            detail="Could not connect to SMTP server. Please check your internet connection."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email server error: {str(e)}")

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

    can_send = drive.is_approved and student_count > 0 and email_configured

    status_message = (
        "Ready to send emails" if can_send
        else "Drive not approved" if not drive.is_approved
        else "No students found" if student_count == 0
        else "Email not configured" if not email_configured
        else "Unknown error"
    )

    return {
        "drive_id": drive_id,
        "drive_title": drive.title,
        "is_approved": drive.is_approved,
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
    """Upload questions from CSV file"""
    # Verify drive ownership
    drive = db.query(Drive).filter(
        Drive.id == drive_id,
        Drive.company_id == company.id
    ).first()

    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found")

    if drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot upload questions to approved drive")

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
                required_fields = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
                missing_fields = [field for field in required_fields if not row.get(field, '').strip()]

                if missing_fields:
                    errors.append(f"Row {row_num}: Missing fields: {', '.join(missing_fields)}")
                    error_count += 1
                    continue

                # Validate correct answer
                correct_answer = row['correct_answer'].strip().upper()
                if correct_answer not in ['A', 'B', 'C', 'D']:
                    errors.append(f"Row {row_num}: Correct answer must be A, B, C, or D")
                    error_count += 1
                    continue

                # Create question
                question = Question(
                    drive_id=drive_id,
                    question_text=row['question_text'].strip(),
                    option_a=row['option_a'].strip(),
                    option_b=row['option_b'].strip(),
                    option_c=row['option_c'].strip(),
                    option_d=row['option_d'].strip(),
                    correct_answer=correct_answer,
                    difficulty=row.get('difficulty', 'medium').strip().lower(),
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
    """Upload students from CSV file"""
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
                    Student.email == row['email'].strip()
                ).first()

                if existing_student:
                    errors.append(f"Row {row_num}: Student with email {row['email']} already exists")
                    error_count += 1
                    continue

                # Get or create college
                college_name = row.get('college', '').strip()
                college = None
                if college_name:
                    college = db.query(College).filter(College.name == college_name).first()
                    if not college:
                        # Create new college (will need admin approval)
                        college = College(name=college_name, is_approved=False)
                        db.add(college)
                        db.flush()  # To get the college ID

                # Get or create student group
                group_name = row.get('student_group', '').strip()
                student_group = None
                if group_name:
                    student_group = db.query(StudentGroup).filter(StudentGroup.name == group_name).first()
                    if not student_group:
                        # Create new student group (will need admin approval)
                        student_group = StudentGroup(name=group_name, is_approved=False)
                        db.add(student_group)
                        db.flush()  # To get the group ID

                # Create student
                student = Student(
                    drive_id=drive_id,
                    name=row['name'].strip(),
                    email=row['email'].strip(),
                    roll_number=row['roll_number'].strip(),
                    college_id=college.id if college else None,
                    student_group_id=student_group.id if student_group else None
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

    if not drive.is_approved:
        raise HTTPException(status_code=400, detail="Cannot start exam for unapproved drive")

    if drive.actual_window_start:
        raise HTTPException(status_code=400, detail="Exam window has already been started")

    # Calculate the window duration from scheduled times
    if not drive.window_start or not drive.window_end:
        raise HTTPException(status_code=400, detail="Drive must have window_start and window_end times set")

    # Set actual_window_start to now
    now = datetime.utcnow()
    drive.actual_window_start = now

    # Calculate actual window end time based on exam requirements
    # duration_minutes = how long the window should stay open
    # exam_duration_minutes = how long each student gets after they start
    if drive.duration_minutes:
        # Use the intended window duration
        window_duration_minutes = drive.duration_minutes
        print(f"DEBUG: Using duration_minutes for window: {drive.duration_minutes} minutes")
    elif drive.exam_duration_minutes:
        # Fallback: If no window duration set, use exam duration + reasonable buffer
        # This ensures late-starting students can complete their exam
        buffer_minutes = max(60, drive.exam_duration_minutes // 3)  # At least 1 hour buffer, or 33% of exam time
        window_duration_minutes = drive.exam_duration_minutes + buffer_minutes
        print(f"DEBUG: No duration_minutes set, calculated from exam_duration_minutes: {drive.exam_duration_minutes} + {buffer_minutes} buffer = {window_duration_minutes} minutes")
    else:
        # Fallback to scheduled window duration for backward compatibility
        scheduled_duration = drive.window_end - drive.window_start
        window_duration_minutes = int(scheduled_duration.total_seconds() / 60)
        print(f"DEBUG: Using scheduled window duration fallback: {window_duration_minutes} minutes")

    # Set the actual window end time
    drive.actual_window_end = now + timedelta(minutes=window_duration_minutes)
    
    print(f"DEBUG: actual_window_start: {drive.actual_window_start}")
    print(f"DEBUG: actual_window_end: {drive.actual_window_end}")
    print(f"DEBUG: total window duration: {window_duration_minutes} minutes")

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
    drive.status = "completed"

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

    # Check if students exist
    student_count = db.query(Student).filter(Student.drive_id == drive_id).count()
    has_students = student_count > 0

    # Calculate time remaining until window closes
    time_remaining_minutes = None
    now = datetime.utcnow()

    # Determine which window end time to use
    window_end = drive.actual_window_end if drive.actual_window_end else drive.window_end

    if drive.actual_window_start and window_end and not drive.actual_window_end:
        # Exam is ongoing, calculate time until window closes
        time_until_close = window_end - now
        time_remaining_minutes = time_until_close.total_seconds() / 60

        # If window has passed, it should be auto-closed
        if time_remaining_minutes <= 0:
            time_remaining_minutes = 0

    # Determine exam state
    if not drive.actual_window_start:
        exam_state = "not_started"
    elif drive.actual_window_end:
        # If actual_window_end exists, check if it's in the past or very close to now (within 1 second)
        time_diff = (now - drive.actual_window_end).total_seconds()
        if time_diff >= -1:  # If ended in the past or within 1 second from now
            exam_state = "ended"
        else:
            # End time is in the future
            exam_state = "ongoing"
    elif drive.actual_window_start:
        exam_state = "ongoing"
    else:
        exam_state = "not_started"

    # Convert time remaining to seconds for consistency
    time_remaining_seconds = int(time_remaining_minutes * 60) if time_remaining_minutes and time_remaining_minutes > 0 else None

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
        "can_start": drive.is_approved and not drive.actual_window_start and has_students,
        "can_end": drive.actual_window_start and not drive.actual_window_end,
        "status": get_drive_status(drive),
        "is_approved": drive.is_approved,
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
            "violation_details": student.violation_details
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
    from fastapi.responses import StreamingResponse
    from app.models.student_response import StudentResponse as StudentResponseModel

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
