from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# Valid string values
VALID_CATEGORIES = ["billing", "drive", "technical", "general"]
VALID_PRIORITIES = ["low", "medium", "high", "urgent"]
VALID_STATUSES = ["open", "in_progress", "resolved", "closed"]


class TicketCreate(BaseModel):
    title: str = Field(..., min_length=5, max_length=200, description="Short title for the ticket")
    description: str = Field(..., min_length=10, description="Detailed description of the issue")
    category: str = Field(default="general", description="One of: billing, drive, technical, general")
    priority: str = Field(default="medium", description="One of: low, medium, high, urgent")


class TicketResponse(BaseModel):
    id: int
    title: str
    description: str
    category: str
    priority: str
    status: str
    company_id: int
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminTicketResponse(TicketResponse):
    """Extended ticket response for admin - includes company details"""
    company_name: str
    company_email: str

    class Config:
        from_attributes = True


class TicketStatusUpdate(BaseModel):
    status: str = Field(..., description="One of: open, in_progress, resolved, closed")
    resolution_notes: Optional[str] = Field(
        default=None,
        description="Required when status is resolved or closed"
    )
