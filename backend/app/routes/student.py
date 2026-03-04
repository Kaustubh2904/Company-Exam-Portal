from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime, timedelta
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
from app.routes.company import get_drive_status

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

VALID_VIOLATION_TYPES = set(VIOLATION_THRESHOLDS.keys())

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

    # Drive must have been manually started by the company
    if not drive.actual_window_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam has not been started by the company yet"
        )

    # Check if exam window has already ended
    if drive.actual_window_end and now >= drive.actual_window_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam window has closed. No new exams can be started."
        )

    # Check if drive is approved and not suspended
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
    if not drive.exam_duration_minutes:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Drive exam duration not configured"
        )
    student_expected_end = student.exam_started_at + timedelta(minutes=drive.exam_duration_minutes)

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
            points=q.points
        )
        for q in ordered_questions
    ]

    # Calculate expected end time based on individual student's start time
    expected_end = None

    if student.exam_started_at:
        if not drive.exam_duration_minutes:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Drive exam duration not configured"
            )
        expected_end = student.exam_started_at + timedelta(minutes=drive.exam_duration_minutes)

    response_data = ExamDataResponse(
        drive_id=drive.id,
        drive_title=drive.title,
        drive_description=drive.description,
        exam_duration_minutes=drive.exam_duration_minutes,
        window_start=drive.window_start,
        actual_window_start=drive.actual_window_start,
        actual_window_end=drive.actual_window_end,
        expected_end=expected_end,
        question_count=len(exam_questions),
        total_marks=total_marks,
        questions=exam_questions,
        student_question_order=question_order,
        exam_started_at=student.exam_started_at
    )

    return response_data

@router.post("/exam/violation", response_model=ViolationResponse)
def record_violation(
    request: ViolationRequest,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """
    Record an anti-cheat violation and auto-disqualify the student if the
    per-drive threshold for that violation type is reached.

    Threshold values are stored on the Drive.  A threshold of None means
    the violation is tracked as a warning but never triggers disqualification.
    """

    # Check if exam started
    if not student.exam_started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam not started yet"
        )

    # Check if already submitted/disqualified
    if student.exam_submitted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam already submitted"
        )

    # Validate violation type
    if request.violation_type not in VALID_VIOLATION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid violation type. Must be one of: {', '.join(VALID_VIOLATION_TYPES)}"
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

    # Increment violation count
    violations[request.violation_type] = violations.get(request.violation_type, 0) + 1
    student.violation_details = violations

    # Calculate total violations
    total_violations = sum(violations.values())
    student.total_violations = total_violations

    # --- Auto-disqualification check ---
    # Use global thresholds (same for all drives)
    effective_threshold = VIOLATION_THRESHOLDS.get(request.violation_type)

    is_disqualified = False
    disqualification_reason = None

    if effective_threshold is not None and violations[request.violation_type] >= effective_threshold:
        # Threshold reached — auto-disqualify
        disqualification_reason = (
            f"Exceeded {request.violation_type.replace('_', ' ')} limit "
            f"({violations[request.violation_type]}/{effective_threshold})"
        )
        student.is_disqualified = True
        student.disqualification_reason = disqualification_reason
        student.exam_submitted_at = datetime.utcnow()
        student.score = 0
        # Calculate total marks from all drive questions
        drive = db.query(Drive).filter(Drive.id == student.drive_id).first()
        if drive:
            all_questions = db.query(Question).filter(Question.drive_id == drive.id).all()
            student.total_marks = sum(q.points for q in all_questions)
        else:
            student.total_marks = 0
        is_disqualified = True

    db.commit()
    db.refresh(student)

    return ViolationResponse(
        success=True,
        is_disqualified=is_disqualified,
        disqualification_reason=disqualification_reason,
        current_violations=violations,
        total_violations=total_violations
    )


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

    # Server-side timer check: accept late submissions but flag them
    now = datetime.utcnow()
    if drive.exam_duration_minutes and student.exam_started_at:
        student_deadline = student.exam_started_at + timedelta(minutes=drive.exam_duration_minutes)
        if now > student_deadline:
            # Accept and score it — frontend should have auto-submitted on timer expiry,
            # this is just a safety net for slow networks / delayed requests
            pass

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
            # Map selected letter to its full option text, then compare
            # against correct_answer (stored as full text in DB)
            option_map = {
                'A': question.option_a,
                'B': question.option_b,
                'C': question.option_c,
                'D': question.option_d,
            }
            selected_text = option_map.get(answer.selected_option.strip().upper())
            if selected_text is not None and selected_text.strip().upper() == question.correct_answer.strip().upper():
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
            answered_at=now
        )
        db.add(response)

    # Update student record
    student.score = score
    student.total_marks = total_marks
    student.exam_submitted_at = now

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
