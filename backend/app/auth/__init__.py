from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import Admin, Company
from app.auth.security import verify_token

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated user (admin or company)"""
    token = credentials.credentials
    payload = verify_token(token)
    
    user_type = payload.get("user_type")
    user_id = payload.get("sub")
    
    if not user_type or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Convert user_id from string to integer since JWT payload stores it as string
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )
    
    if user_type == "admin":
        user = db.query(Admin).filter(Admin.id == user_id).first()
    elif user_type == "company":
        user = db.query(Company).filter(Company.id == user_id).first()
        if user and not user.is_approved:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company account not approved"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user type"
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return {"user": user, "user_type": user_type}

def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Ensure current user is admin"""
    if current_user["user_type"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user["user"]

def get_company_user(current_user: dict = Depends(get_current_user)):
    """Ensure current user is company"""
    if current_user["user_type"] != "company":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company access required"
        )
    return current_user["user"]

def get_company_or_admin_user(current_user: dict = Depends(get_current_user)):
    """Allow both admin and company access - admin can access any company data"""
    if current_user["user_type"] not in ["admin", "company"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Company access required"
        )
    return current_user
