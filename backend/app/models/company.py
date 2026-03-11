from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime

# Import base from database connection to use the same instance
from app.database.connection import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    logo_url = Column(String, nullable=True)

    # Status — companies are auto-approved on registration
    status = Column(String, default="approved")  # approved, suspended

    # Plan-based drive access
    plan = Column(String, default="free")  # free, basic, pro, premium, custom
    drives_limit = Column(Integer, default=2)  # max drives allowed under current plan
    drives_used = Column(Integer, default=0)   # cumulative count of drives that went live
    plan_expires_at = Column(DateTime, nullable=True)   # NULL = never expires (free tier)
    plan_updated_at = Column(DateTime, nullable=True)   # when admin last changed the plan

    # Email template fields
    email_subject_template = Column(Text, default="Exam Invitation - {{drive_title}}")
    email_body_template = Column(Text, default="""Dear {{student_name}},

You have been selected for the recruitment drive: {{drive_title}}

Your login credentials are:
• Email: {{student_email}}
• Access Token: {{access_token}}
• Login URL: {{login_url}}

Drive Details:
• Start Time: {{start_time}}
• Duration: {{duration}} minutes

Please keep your access token secure and use it to login at the scheduled time.

Best of luck with your exam!

Regards,
{{company_name}} Team

---
This is an automated email. Please do not reply to this message.""")
    use_custom_template = Column(Boolean, default=False)
    template_updated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company_drives = relationship("Drive", back_populates="company", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="company", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="company", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="company", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Company(id={self.id}, name='{self.company_name}', status='{self.status}')>"
