from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime

class DriveTargetCreate(BaseModel):
    college_id: Optional[int] = None  # From master college list
    custom_college_name: Optional[str] = None  # Custom college name
    student_group_id: Optional[int] = None  # From master student group list
    custom_student_group_name: Optional[str] = None  # Custom student group
    batch_year: Optional[str] = None  # Optional batch/year

class DriveTargetResponse(BaseModel):
    id: int
    college_id: Optional[int] = None
    custom_college_name: Optional[str] = None
    student_group_id: Optional[int] = None
    custom_student_group_name: Optional[str] = None
    batch_year: Optional[str] = None
    college_name: Optional[str] = None  # Resolved college name
    student_group_name: Optional[str] = None  # Resolved student group name

    class Config:
        from_attributes = True

class DriveCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str  # Technical MCQ, Aptitude MCQ, HR MCQ, Coding MCQ, etc.
    targets: List[DriveTargetCreate]  # List of targeting configurations
    window_start: datetime  # Active window start time
    window_end: datetime  # Active window end time
    exam_duration_minutes: int  # Duration per student

    @field_validator('window_end')
    @classmethod
    def validate_window_end(cls, v, info):
        if 'window_start' in info.data and v <= info.data['window_start']:
            raise ValueError('window_end must be after window_start')
        return v

    @field_validator('exam_duration_minutes')
    @classmethod
    def validate_exam_duration(cls, v, info):
        if 'window_start' in info.data and 'window_end' in info.data:
            window_duration_minutes = int((info.data['window_end'] - info.data['window_start']).total_seconds() / 60)
            if v >= window_duration_minutes:
                raise ValueError(f'exam_duration_minutes ({v}) must be less than window duration ({window_duration_minutes} minutes)')
        return v

class DriveUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    targets: Optional[List[DriveTargetCreate]] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    exam_duration_minutes: Optional[int] = None

class DriveResponse(BaseModel):
    id: int
    company_id: int
    company_name: Optional[str] = None  # Company name for display
    title: str
    description: Optional[str] = None
    category: Optional[str] = None  # Can be null for legacy drives
    targets: List[DriveTargetResponse] = []

    # Window times
    window_start: Optional[datetime] = None  # Can be null for draft drives
    window_end: Optional[datetime] = None    # Can be null for draft drives
    actual_window_start: Optional[datetime] = None
    actual_window_end: Optional[datetime] = None

    # Duration
    exam_duration_minutes: Optional[int] = None  # Can be null for legacy drives

    # Counts (added dynamically)
    question_count: Optional[int] = None
    student_count: Optional[int] = None

    # Legacy fields (can be None, only for old migration purposes)
    question_type: Optional[str] = None
    duration_minutes: Optional[int] = None
    scheduled_start: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None

    status: str  # draft, submitted, approved, rejected, upcoming, live, completed, suspended
    is_approved: bool
    admin_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DriveStatusUpdate(BaseModel):
    status: str  # draft, submitted, approved, rejected, upcoming, live, ongoing, completed

class AdminDriveApprovalUpdate(BaseModel):
    is_approved: bool
    admin_notes: Optional[str] = None
