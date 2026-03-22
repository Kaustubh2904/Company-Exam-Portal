from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.connection import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)

    # Type of notification
    type = Column(String, nullable=False)  # plan_change, drive_status, admin_message

    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    company = relationship("Company", back_populates="notifications")

    def __repr__(self):
        return f"<Notification(id={self.id}, company_id={self.company_id}, type='{self.type}')>"
