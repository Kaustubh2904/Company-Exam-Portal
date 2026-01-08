from pydantic_settings import BaseSettings
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from app directory (where this config file is)
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

class Settings(BaseSettings):
    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:password@localhost:5432/company_exam_portal")
    
    # Security
    secret_key: str = os.getenv("SECRET_KEY", "change-this-secret-key-in-production")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # Admin credentials
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin123")
    
    # Environment
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # CORS
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001")
    
    # Email settings
    smtp_server: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_name: str = os.getenv("SMTP_FROM_NAME", "Company Recruitment Team")

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
