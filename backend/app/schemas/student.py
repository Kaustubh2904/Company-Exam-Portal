from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict

# Schema for student login request
class StudentLoginRequest(BaseModel):
    email: EmailStr
    access_token: str

# Schema for student authentication response
class StudentAuthResponse(BaseModel):
    access_token: str
    student_id: int
    name: str
    email: str
    drive_id: int
    drive_title: str
    drive_status: str
    exam_submitted_at: Optional[datetime] = None

# Schema for individual question in exam
class ExamQuestion(BaseModel):
    id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    marks: int

    class Config:
        from_attributes = True

# Schema for exam data response
class ExamDataResponse(BaseModel):
    drive_id: int
    drive_title: str
    drive_description: Optional[str] = None
    duration_minutes: int  # Required - exam duration per student
    scheduled_start: Optional[datetime] = None  # Window start
    actual_start: Optional[datetime] = None  # Actual window start
    actual_end: Optional[datetime] = None  # Actual window end
    expected_end: Optional[datetime] = None  # Calculated: student.exam_started_at + duration
    question_count: int
    total_marks: int
    questions: List[ExamQuestion]
    student_question_order: List[int]
    exam_started_at: Optional[datetime] = None

# Schema for submitting a violation
class ViolationRequest(BaseModel):
    violation_type: str  # 'tab_switch', 'fullscreen_exit', 'right_click', 'screenshot', 'copy', 'paste'

# Schema for violation response
class ViolationResponse(BaseModel):
    success: bool
    is_disqualified: bool
    disqualification_reason: Optional[str]
    current_violations: Dict[str, int]
    total_violations: int

# Schema for individual answer submission
class AnswerSubmission(BaseModel):
    question_id: int
    selected_option: Optional[str]  # 'a', 'b', 'c', 'd' or None
    marked_for_review: bool = False

# Schema for exam submission request
class ExamSubmissionRequest(BaseModel):
    answers: List[AnswerSubmission]

# Schema for exam submission response
class ExamSubmissionResponse(BaseModel):
    success: bool
    score: int
    total_marks: int
    percentage: float
    submitted_at: datetime

# Schema for student response (full model response)
class StudentResponse(BaseModel):
    id: int
    drive_id: int
    company_id: int
    name: str
    email: EmailStr
    roll_number: Optional[str] = None
    phone: Optional[str] = None
    college_name: Optional[str] = None
    student_group_name: Optional[str] = None
    access_token: str
    question_order: Optional[List[int]] = None
    exam_started_at: Optional[datetime] = None
    exam_submitted_at: Optional[datetime] = None
    score: Optional[int] = None
    total_marks: Optional[int] = None
    violation_details: Optional[Dict[str, int]] = None
    total_violations: int = 0
    is_disqualified: bool = False
    disqualification_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Schema for student result (for company viewing)
class StudentResultResponse(BaseModel):
    id: int
    name: str
    email: str
    roll_number: Optional[str]
    phone: Optional[str]
    college_name: Optional[str]
    student_group_name: Optional[str]
    score: Optional[int]
    total_marks: Optional[int]
    percentage: Optional[float]
    exam_started_at: Optional[datetime]
    exam_submitted_at: Optional[datetime]
    is_disqualified: bool
    disqualification_reason: Optional[str]
    violation_details: Optional[Dict[str, int]]
    total_violations: int = 0

    class Config:
        from_attributes = True
