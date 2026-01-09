from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

# Import base from database connection to use the same instance
from app.database.connection import Base

class Drive(Base):
    __tablename__ = "drives"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False)  # Technical MCQ, Aptitude MCQ, HR MCQ, Coding MCQ

    # Window times (scheduled by company) - stored as UTC in database
    window_start = Column(DateTime(timezone=False), nullable=True)  # Scheduled start of active window (UTC)
    window_end = Column(DateTime(timezone=False), nullable=True)  # Scheduled end of active window (UTC)

    # Actual window times (when manually started/ended) - stored as UTC in database
    actual_window_start = Column(DateTime(timezone=False), nullable=True)  # When window actually opened (UTC)
    actual_window_end = Column(DateTime(timezone=False), nullable=True)  # When window actually closed (UTC)

    # Exam duration per student
    exam_duration_minutes = Column(Integer, nullable=False)  # How long each student gets
    duration_minutes = Column(Integer, nullable=True)

    status = Column(String, default="draft")  # draft, submitted, approved, rejected, upcoming, live, completed, suspended
    is_approved = Column(Boolean, default=False)
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", back_populates="company_drives")
    questions = relationship("Question", back_populates="drive", cascade="all, delete-orphan")
    targets = relationship("DriveTarget", back_populates="drive", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="drive", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Drive(id={self.id}, title='{self.title}', status='{self.status}')>"