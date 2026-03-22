from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


PLAN_LIMITS = {
    "free": 2,
    "basic": 5,
    "pro": 10,
    "premium": 15,
}


class CompanyResponse(BaseModel):
    id: int
    company_name: str
    username: str
    email: str
    logo_url: Optional[str] = None
    status: Optional[str] = "approved"
    # Plan info
    plan: str = "free"
    drives_limit: int = 2
    drives_used: int = 0
    plan_expires_at: Optional[datetime] = None
    plan_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CompanyProfileResponse(BaseModel):
    """Slim profile response for /company/profile"""
    id: int
    company_name: str
    username: str
    email: str
    logo_url: Optional[str] = None
    plan: str
    drives_limit: int
    drives_used: int
    drives_remaining: int
    plan_expires_at: Optional[datetime] = None
    plan_updated_at: Optional[datetime] = None
    plan_active: bool  # False when plan is expired (falls back to free rules)
    created_at: datetime

    class Config:
        from_attributes = True


class CompanyPlanUpdate(BaseModel):
    """Admin sets the plan for a company"""
    plan: str  # free, basic, pro, premium, custom
    drives_limit: Optional[int] = None  # Required when plan=custom, ignored otherwise


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


class NotificationResponse(BaseModel):
    id: int
    company_id: int
    type: str  # plan_change, drive_status, admin_message
    title: str
    message: str
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AdminNotifyRequest(BaseModel):
    title: str
    message: str
