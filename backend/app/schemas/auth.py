from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class AdminLogin(BaseModel):
    username: str
    password: str

class CompanyRegister(BaseModel):
    company_name: str
    username: str
    email: EmailStr
    password: str
    logo_url: Optional[str] = None

class CompanyLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    is_approved: Optional[bool] = None
    created_at: datetime

    class Config:
        from_attributes = True
