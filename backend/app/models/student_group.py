from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime

# Import base from database connection to use the same instance
from app.database.connection import Base

class StudentGroup(Base):
    __tablename__ = "student_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    is_approved = Column(Boolean, default=True)  # Pre-approved groups are True
    created_at = Column(DateTime, default=datetime.utcnow)