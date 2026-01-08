from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

# Import base from database connection to use the same instance
from app.database.connection import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    drive_id = Column(Integer, ForeignKey("drives.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    # Student info fields
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    roll_number = Column(String, nullable=True, index=True)
    phone = Column(String, nullable=True)
    college_name = Column(String, nullable=True)
    student_group_name = Column(String, nullable=True)

    # Authentication
    access_token = Column(String(36), unique=True, nullable=False, index=True, default=lambda: str(uuid.uuid4()))

    # Exam progress fields
    question_order = Column(JSON, nullable=True)  # Array of question IDs in randomized order
    exam_started_at = Column(DateTime, nullable=True)
    exam_submitted_at = Column(DateTime, nullable=True)

    # Results
    score = Column(Integer, nullable=True)
    total_marks = Column(Integer, nullable=True)

    # Anti-cheat fields
    violation_details = Column(JSON, nullable=True)  # {tab_switch: 0, fullscreen_exit: 0, right_click: 0, screenshot: 0, copy: 0, paste: 0}
    total_violations = Column(Integer, default=0)  # Total count of all violations
    is_disqualified = Column(Boolean, default=False)
    disqualification_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    drive = relationship("Drive", back_populates="students")
    company = relationship("Company", back_populates="students")
    responses = relationship("StudentResponse", back_populates="student", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Student(name='{self.name}', email='{self.email}', drive_id={self.drive_id})>"
