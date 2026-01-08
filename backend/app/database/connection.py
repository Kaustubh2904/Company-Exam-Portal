from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.exc import SQLAlchemyError
import logging
from app.database.config import settings

logger = logging.getLogger(__name__)

# Convert database URL to use psycopg3 driver
def get_database_url():
    """Convert database URL to psycopg3 format"""
    db_url = settings.database_url
    
    # If URL starts with postgresql://, replace with postgresql+psycopg://
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif not db_url.startswith("postgresql+psycopg://"):
        # If it doesn't have a driver specified, add psycopg
        db_url = db_url.replace("postgresql", "postgresql+psycopg", 1)
    
    return db_url

# Create engine with proper connection pooling and error handling
try:
    engine = create_engine(
        get_database_url(),
        pool_pre_ping=True,  # Validate connections before use
        pool_recycle=3600,   # Recycle connections every hour
        pool_size=5,         # Connection pool size
        max_overflow=10,     # Additional connections allowed
        echo=False  # Disable SQL query logging
    )
except Exception as e:
    logger.error(f"❌ Failed to create database engine: {str(e)}")
    logger.error(f"Database URL format: {get_database_url().split('@')[0]}@...")  # Log URL without password
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Database dependency with proper error handling"""
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
