from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

# Import base from database connection to use the same instance
from app.database.connection import Base

class DriveTarget(Base):
    __tablename__ = "drive_targets"
    
    id = Column(Integer, primary_key=True, index=True)
    drive_id = Column(Integer, ForeignKey("drives.id"), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id"), nullable=True)  # Reference to master college
    custom_college_name = Column(String, nullable=True)  # For custom colleges
    student_group_id = Column(Integer, ForeignKey("student_groups.id"), nullable=True)  # Reference to master group
    custom_student_group_name = Column(String, nullable=True)  # For custom groups
    batch_year = Column(String, nullable=True)  # Optional batch/year like "2025", "2024-2025"
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    drive = relationship("Drive", back_populates="targets")
    college = relationship("College")
    student_group = relationship("StudentGroup")