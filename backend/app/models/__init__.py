# Import all models to make them available when importing from app.models
from app.models.admin import Admin
from app.models.company import Company
from app.models.college import College
from app.models.student_group import StudentGroup
from app.models.drive import Drive
from app.models.question import Question
from app.models.drive_target import DriveTarget
from app.models.student import Student
from app.models.student_response import StudentResponse

# Export all models
__all__ = [
    "Admin",
    "Company",
    "College",
    "StudentGroup",
    "Drive",
    "Question",
    "DriveTarget",
    "Student",
    "StudentResponse"
]
