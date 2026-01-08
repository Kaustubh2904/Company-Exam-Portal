from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CompanyResponse(BaseModel):
    id: int
    company_name: str  # Changed from 'name' to 'company_name'
    username: str  # Added username field
    email: str
    logo_url: Optional[str] = None
    is_approved: bool
    status: Optional[str] = "pending"
    admin_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None  # Added missing updated_at field

    class Config:
        from_attributes = True

class CompanyApprovalUpdate(BaseModel):
    is_approved: bool
    notes: Optional[str] = None

class CollegeCreate(BaseModel):
    name: str

class CollegeResponse(BaseModel):
    id: int
    name: str
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True

class StudentGroupCreate(BaseModel):
    name: str

class StudentGroupResponse(BaseModel):
    id: int
    name: str
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True
