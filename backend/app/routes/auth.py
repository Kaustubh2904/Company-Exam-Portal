from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from app.database.connection import get_db
from app.models import Admin, Company
from app.schemas.auth import AdminLogin, CompanyLogin, CompanyRegister, Token, UserResponse
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.database.config import settings

router = APIRouter()

@router.post("/admin/login", response_model=Token)
def admin_login(admin_data: AdminLogin, db: Session = Depends(get_db)):
    """Admin login"""
    # Check if admin exists, if not create default admin
    admin = db.query(Admin).filter(Admin.username == admin_data.username).first()
    
    if not admin:
        # Create default admin if doesn't exist
        if admin_data.username == settings.admin_username and admin_data.password == settings.admin_password:
            hashed_password = get_password_hash(settings.admin_password)
            admin = Admin(username=settings.admin_username, password_hash=hashed_password)
            db.add(admin)
            db.commit()
            db.refresh(admin)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
    
    if not verify_password(admin_data.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(admin.id), "user_type": "admin"},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/company/register", response_model=dict)
def company_register(company_data: CompanyRegister, db: Session = Depends(get_db)):
    """Company registration (requires admin approval)"""
    # Check if email already exists
    existing_company = db.query(Company).filter(Company.email == company_data.email).first()
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if username already exists
    existing_username = db.query(Company).filter(Company.username == company_data.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new company
    hashed_password = get_password_hash(company_data.password)
    company = Company(
        company_name=company_data.company_name,
        username=company_data.username,
        email=company_data.email,
        hashed_password=hashed_password,
        logo_url=company_data.logo_url
    )
    
    db.add(company)
    db.commit()
    db.refresh(company)
    
    return {"message": "Company registered successfully. Waiting for admin approval."}

@router.post("/company/login", response_model=Token)
def company_login(company_data: CompanyLogin, db: Session = Depends(get_db)):
    """Company login"""
    company = db.query(Company).filter(Company.username == company_data.username).first()
    
    if not company or not verify_password(company_data.password, company.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    if not company.is_approved:
        # Provide more specific error messages based on company status
        company_status = getattr(company, 'status', 'pending')
        if company_status == 'rejected':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company account has been rejected by admin. Please contact support."
            )
        elif company_status == 'suspended':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company account has been suspended. Please contact admin."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Company account is pending admin approval"
            )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(company.id), "user_type": "company"},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
