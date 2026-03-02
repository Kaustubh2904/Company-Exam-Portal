from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.connection import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    # Category as string - billing, drive, technical, general
    category = Column(String, default="general")

    # Priority as string - low, medium, high, urgent
    priority = Column(String, default="medium")

    # Status as string - open, in_progress, resolved, closed
    status = Column(String, default="open")

    # Company that raised the ticket
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    # Resolution details
    resolution_notes = Column(Text, nullable=True)
    resolved_by = Column(String, nullable=True)  # admin username as string
    resolved_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    company = relationship("Company", back_populates="tickets")

    def __repr__(self):
        return f"<Ticket(id={self.id}, title='{self.title}', status='{self.status}', company_id={self.company_id})>"
