from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import timedelta
from pathlib import Path
import uuid
from app.database.connection import get_db
from app.models import Admin, Company
from app.schemas.auth import AdminLogin, CompanyLogin, Token
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.database.config import settings

ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/jpg"}
LOGO_MAX_SIZE_MB = 2
LOGOS_DIR = Path(__file__).parent.parent.parent / "static" / "logos"

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
def company_register(
    company_name: str = Form(...),
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Company registration with logo upload (requires admin approval)"""

    # ── Validate logo ──────────────────────────────────────────
    if logo.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid logo type '{logo.content_type}'. Only PNG and JPEG are allowed.",
        )
    logo_contents = logo.file.read()
    size_mb = len(logo_contents) / (1024 * 1024)
    if size_mb > LOGO_MAX_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Logo too large ({size_mb:.1f} MB). Maximum allowed size is {LOGO_MAX_SIZE_MB} MB.",
        )

    # ── Check duplicates ───────────────────────────────────────
    if db.query(Company).filter(Company.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(Company).filter(Company.username == username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")

    # ── Save logo to disk ──────────────────────────────────────
    ext = "png" if logo.content_type == "image/png" else "jpg"
    # Temp filename using username (company ID not yet known); renamed if needed
    filename = f"reg_{username}_{uuid.uuid4().hex}.{ext}"
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    logo_path = LOGOS_DIR / filename
    with open(logo_path, "wb") as f:
        f.write(logo_contents)

    # ── Create company ─────────────────────────────────────────
    hashed_password = get_password_hash(password)
    company = Company(
        company_name=company_name,
        username=username,
        email=email,
        hashed_password=hashed_password,
        logo_url=f"/static/logos/{filename}",
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
