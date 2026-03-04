from pydantic import BaseModel, EmailStr
from typing import Optional

class AdminLogin(BaseModel):
    username: str
    password: str

class CompanyLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
