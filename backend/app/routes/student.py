from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from datetime import datetime
import random

from app.database.connection import get_db
from app.models.student import Student
from app.models.drive import Drive
from app.models.question import Question
from app.models.student_response import StudentResponse
from app.schemas.student import (
    StudentLoginRequest, StudentAuthResponse, ExamDataResponse,
    ExamQuestion, ViolationRequest, ViolationResponse,
    AnswerSubmission, ExamSubmissionRequest, ExamSubmissionResponse
)

router = APIRouter()

# Violation thresholds
VIOLATION_THRESHOLDS = {
    "tab_switch": 3,
    "fullscreen_exit": 3,
    "right_click": 3,
    "screenshot": 1,
    "copy": None,  # Warning only
    "paste": None  # Warning only
}

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

# Dependency to get current student from token
def get_current_student(token: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.access_token == token).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token"
        )
    if student.is_disqualified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You have been disqualified: {student.disqualification_reason}"
        )
    return student


# ============= AUTHENTICATION ROUTES =============

@router.post("/auth/login", response_model=StudentAuthResponse)
def student_login(
    request: StudentLoginRequest,
    db: Session = Depends(get_db)
):
    """Login student with email and access token"""
    student = db.query(Student).filter(
        and_(
            Student.email == request.email,
            Student.access_token == request.access_token
        )
    ).first()

    if not student:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or access token"
        )

    # Get drive info
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    # Calculate dynamic drive status
    calculated_status = get_drive_status(drive)

    return StudentAuthResponse(
        access_token=student.access_token,
        student_id=student.id,
        name=student.name,
        email=student.email,
        drive_id=drive.id,
        drive_title=drive.title,
        drive_status=calculated_status,  # Use calculated status instead of drive.status
        exam_submitted_at=student.exam_submitted_at
    )


@router.get("/auth/validate")
def validate_student_token(
    student: Student = Depends(get_current_student)
):
    """Validate if student token is still valid"""
    return {
        "valid": True,
        "student_id": student.id,
        "is_disqualified": student.is_disqualified,
        "disqualification_reason": student.disqualification_reason
    }


@router.get("/drive-info")
def get_drive_info(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get drive information including window times and exam duration"""
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    return {
        "id": drive.id,
        "title": drive.title,
        "description": drive.description,
        "category": drive.category,
        "exam_duration_minutes": drive.exam_duration_minutes,
        "window_start": drive.window_start,
        "window_end": drive.window_end,
        "actual_window_start": drive.actual_window_start,
        "actual_window_end": drive.actual_window_end,
        "status": get_drive_status(drive)  # Use calculated status
    }


# ============= EXAM ROUTES =============

@router.post("/exam/start")
def start_exam(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Start the exam - generate randomized question order and check window eligibility"""

    # Check if already started
    if student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already started"
        )

    # Check if exam is submitted
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    # Get drive
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    # Check if drive window is currently active
    now = datetime.utcnow()

    # Determine active window times (actual overrides scheduled)
    window_start = drive.actual_window_start if drive.actual_window_start else drive.window_start
    window_end = drive.actual_window_end if drive.actual_window_end else drive.window_end

    # Check if window times are configured
    if not window_start or not window_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam window times are not configured. Please contact the administrator."
        )

    # Check if current time is within window
    if now < window_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exam window has not opened yet. Opens at {window_start.isoformat()}"
        )

    if now >= window_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam window has closed. No new exams can be started."
        )

    # Check if drive is approved and not suspended
    # Note: We don't check for "live" status because that's calculated dynamically
    # Instead we check: is_approved, not suspended, and within window times (checked above)
    if not drive.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drive is not approved yet"
        )

    if drive.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drive has been suspended"
        )

    # Get all questions for this drive
    questions = db.query(Question).filter(Question.drive_id == drive.id).all()
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No questions found for this drive"
        )

    # Randomize question order
    question_ids = [q.id for q in questions]
    random.shuffle(question_ids)

    # Update student record with individual exam start time
    student.question_order = question_ids
    student.exam_started_at = now
    student.violation_details = {
        "tab_switch": 0,
        "fullscreen_exit": 0,
        "right_click": 0,
        "screenshot": 0,
        "copy": 0,
        "paste": 0
    }

    db.commit()
    db.refresh(student)

    # Calculate individual student's expected end time
    from datetime import timedelta
    if not drive.exam_duration_minutes:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Drive exam duration not configured"
        )
    student_expected_end = student.exam_started_at + timedelta(minutes=drive.exam_duration_minutes)

    print(f"DEBUG START_EXAM - exam_started_at: {student.exam_started_at}")
    print(f"DEBUG START_EXAM - duration_minutes: {drive.exam_duration_minutes}")
    print(f"DEBUG START_EXAM - expected_end: {student_expected_end}")

    return {
        "success": True,
        "message": "Exam started successfully",
        "exam_started_at": student.exam_started_at,
        "expected_end": student_expected_end,
        "exam_duration_minutes": drive.exam_duration_minutes,
        "question_order": student.question_order
    }


@router.get("/exam/questions", response_model=ExamDataResponse)
def get_exam_questions(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get all exam questions in the student's randomized order"""

    # Check if exam started
    if not student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not started yet. Call /exam/start first"
        )

    # Check if already submitted
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    # Get drive
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    # Get questions in the randomized order
    question_order = student.question_order
    if not question_order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question order not generated"
        )

    # Fetch questions
    questions = db.query(Question).filter(
        Question.id.in_(question_order)
    ).all()

    # Sort questions according to student's order
    questions_dict = {q.id: q for q in questions}
    ordered_questions = [questions_dict[qid] for qid in question_order if qid in questions_dict]

    # Calculate total marks
    total_marks = sum(q.points for q in ordered_questions)

    # Convert to response schema (without correct_answer)
    exam_questions = [
        ExamQuestion(
            id=q.id,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            marks=q.points
        )
        for q in ordered_questions
    ]

    # Calculate expected end time based on individual student's start time
    expected_end = None
    print(f"DEBUG - Checking expected_end calculation")
    print(f"DEBUG - student.exam_started_at: {student.exam_started_at}")
    print(f"DEBUG - drive.exam_duration_minutes: {drive.exam_duration_minutes}")

    if student.exam_started_at:
        if not drive.exam_duration_minutes:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Drive exam duration not configured"
            )
        from datetime import timedelta
        expected_end = student.exam_started_at + timedelta(minutes=drive.exam_duration_minutes)

        # Debug logging
        print(f"DEBUG - Student exam_started_at: {student.exam_started_at}")
        print(f"DEBUG - Drive exam_duration_minutes: {drive.exam_duration_minutes}")
        print(f"DEBUG - Calculated expected_end: {expected_end}")
        print(f"DEBUG - Current time: {datetime.utcnow()}")
        print(f"DEBUG - Time difference (seconds): {(expected_end - datetime.utcnow()).total_seconds()}")
    else:
        print(f"DEBUG - exam_started_at is None! This means exam hasn't been started via /exam/start endpoint")

    response_data = ExamDataResponse(
        drive_id=drive.id,
        drive_title=drive.title,
        drive_description=drive.description,
        duration_minutes=drive.exam_duration_minutes,  # Use new field
        scheduled_start=drive.window_start,  # Use new field
        actual_start=drive.actual_window_start,  # Use new field
        actual_end=drive.actual_window_end,  # Use new field
        expected_end=expected_end,
        question_count=len(exam_questions),
        total_marks=total_marks,
        questions=exam_questions,
        student_question_order=question_order,
        exam_started_at=student.exam_started_at
    )

    # Convert to dict and ensure all datetimes are properly serialized as UTC ISO strings
    response_dict = response_data.model_dump()

    # Helper function to serialize datetime to UTC ISO string
    def serialize_datetime(dt):
        if isinstance(dt, datetime):
            return dt.isoformat() + 'Z'
        return dt

    # Ensure all datetime fields are properly serialized
    if response_dict.get('exam_started_at'):
        response_dict['exam_started_at'] = serialize_datetime(response_dict['exam_started_at'])
    if response_dict.get('expected_end'):
        response_dict['expected_end'] = serialize_datetime(response_dict['expected_end'])
    if response_dict.get('actual_end'):
        response_dict['actual_end'] = serialize_datetime(response_dict['actual_end'])
    if response_dict.get('scheduled_start'):
        response_dict['scheduled_start'] = serialize_datetime(response_dict['scheduled_start'])
    if response_dict.get('actual_start'):
        response_dict['actual_start'] = serialize_datetime(response_dict['actual_start'])

    return response_dict

@router.post("/exam/violation", response_model=ViolationResponse)
def record_violation(
    request: ViolationRequest,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Record a violation and check if student should be disqualified"""

    # Check if exam started
    if not student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not started yet"
        )

    # Check if already submitted
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    # Validate violation type
    if request.violation_type not in VIOLATION_THRESHOLDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid violation type"
        )

    # Get current violations
    violations = student.violation_details or {
        "tab_switch": 0,
        "fullscreen_exit": 0,
        "right_click": 0,
        "screenshot": 0,
        "copy": 0,
        "paste": 0
    }

    print(f"DEBUG: Before increment - {request.violation_type}: {violations[request.violation_type]}")

    # Increment violation count
    violations[request.violation_type] += 1
    student.violation_details = violations

    # Calculate total violations
    total_violations = sum(violations.values())
    student.total_violations = total_violations

    print(f"DEBUG: After increment - {request.violation_type}: {violations[request.violation_type]}")
    print(f"DEBUG: Total violations: {total_violations}")

    db.commit()
    db.refresh(student)

    print(f"DEBUG: Final response - violations: {violations}, total: {total_violations}")

    return ViolationResponse(
        success=True,
        is_disqualified=False,  # Always false since disqualification is handled by frontend
        disqualification_reason=None,
        current_violations=violations,
        total_violations=total_violations
    )


@router.post("/exam/disqualify")
def disqualify_student(
    request: dict,  # {violation_type: str, reason: str}
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Immediately disqualify student for exceeding violation threshold"""

    # Check if exam started
    if not student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not started yet"
        )

    # Check if already submitted
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    violation_type = request.get("violation_type")
    reason = request.get("reason")

    if not violation_type or not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="violation_type and reason are required"
        )

    # Update student record
    student.is_disqualified = True
    student.disqualification_reason = reason

    # Mark exam as submitted with 0 score
    student.exam_submitted_at = datetime.utcnow()
    student.score = 0
    student.total_marks = 0

    # Calculate total violations from violation_details
    violations = student.violation_details or {}
    total_violations = sum(violations.values())
    student.total_violations = total_violations

    db.commit()
    db.refresh(student)

    print(f"DEBUG: Student {student.id} DISQUALIFIED! Reason: {reason}, Total violations: {total_violations}")

    return {
        "success": True,
        "message": "Student disqualified successfully",
        "disqualification_reason": reason,
        "total_violations": total_violations
    }


@router.post("/exam/submit", response_model=ExamSubmissionResponse)
def submit_exam(
    request: ExamSubmissionRequest,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Submit exam with all answers"""

    # Check if exam started
    if not student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not started yet"
        )

    # Check if already submitted
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    # Get drive to calculate total marks from ALL questions
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    # Get ALL questions for this drive to calculate correct total_marks
    all_questions = db.query(Question).filter(Question.drive_id == drive.id).all()
    total_marks = sum(q.points for q in all_questions)

    # Get questions for scoring (only those that were answered)
    question_ids = [ans.question_id for ans in request.answers]
    questions = db.query(Question).filter(
        Question.id.in_(question_ids)
    ).all()
    questions_dict = {q.id: q for q in questions}

    # Calculate score and save responses
    score = 0

    for answer in request.answers:
        question = questions_dict.get(answer.question_id)
        if not question:
            continue

        is_correct = False

        if answer.selected_option:
            selected = answer.selected_option.upper()
            correct = question.correct_answer.upper()

            if selected == correct:
                score += question.points
                is_correct = True
            elif selected == 'A' and correct == question.option_a.upper():
                score += question.points
                is_correct = True
            elif selected == 'B' and correct == question.option_b.upper():
                score += question.points
                is_correct = True
            elif selected == 'C' and correct == question.option_c.upper():
                score += question.points
                is_correct = True
            elif selected == 'D' and correct == question.option_d.upper():
                score += question.points
                is_correct = True

        # Create student response record
        response = StudentResponse(
            student_id=student.id,
            question_id=answer.question_id,
            drive_id=student.drive_id,
            selected_option=answer.selected_option,
            is_correct=is_correct,
            marked_for_review=answer.marked_for_review,
            answered_at=datetime.utcnow()
        )
        db.add(response)

    # Update student record
    student.score = score
    student.total_marks = total_marks
    student.exam_submitted_at = datetime.utcnow()

    db.commit()
    db.refresh(student)

    percentage = (score / total_marks * 100) if total_marks > 0 else 0

    return ExamSubmissionResponse(
        success=True,
        score=score,
        total_marks=total_marks,
        percentage=round(percentage, 2),
        submitted_at=student.exam_submitted_at
    )


@router.get("/exam/result")
def get_exam_result(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get student's exam result"""

    # Check if exam submitted
    if not student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not submitted yet"
        )

    # Get drive to calculate correct total_marks from ALL questions
    drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Drive not found"
        )

    # Recalculate total_marks from ALL questions (fix for old submissions with wrong stored total_marks)
    all_questions = db.query(Question).filter(Question.drive_id == drive.id).all()
    correct_total_marks = sum(q.points for q in all_questions)

    # Use the correct total_marks for percentage calculation
    # Handle case where score is None (exam manually ended without submission)
    score = student.score if student.score is not None else 0
    percentage = (score / correct_total_marks * 100) if correct_total_marks > 0 else 0

    # Calculate total violations
    total_violations = student.total_violations or 0

    return {
        "score": score,
        "total_marks": correct_total_marks,  # Return correct total_marks
        "percentage": round(percentage, 2),
        "submitted_at": student.exam_submitted_at,
        "is_disqualified": student.is_disqualified,
        "disqualification_reason": student.disqualification_reason,
        "total_violations": total_violations,
        "violation_details": student.violation_details
    }
