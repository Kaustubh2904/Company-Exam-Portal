from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

# Import base from database connection to use the same instance
from app.database.connection import Base

class StudentResponse(Base):
    __tablename__ = "student_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    drive_id = Column(Integer, ForeignKey("drives.id", ondelete="CASCADE"), nullable=False)
    
    # Response data
    selected_option = Column(String(1), nullable=True)  # 'a', 'b', 'c', 'd' or None if not answered
    is_correct = Column(Boolean, nullable=True)
    marked_for_review = Column(Boolean, default=False)
    answered_at = Column(DateTime, nullable=True)
    
    # Relationships
    student = relationship("Student", back_populates="responses")
    question = relationship("Question")
    drive = relationship("Drive")
    
    def __repr__(self):
        return f"<StudentResponse(student_id={self.student_id}, question_id={self.question_id}, selected_option='{self.selected_option}')>"
