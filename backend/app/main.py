from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from app.routes import auth_router, admin_router, company_router
from app.routes.student import router as student_router
from app.database import create_tables
from app.database.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("app.log") if settings.environment != "development" else logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Company Exam Portal API...")
    logger.info("📊 Initializing database...")
    
    try:
        create_tables()
        logger.info("✅ Database initialized successfully!")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down Company Exam Portal API...")

# Create FastAPI app
app = FastAPI(
    title="Company Exam Portal API",
    description="Backend API for Company Exam Portal - Admin and Company Management System",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS based on environment
# Allow both frontend-react (5173) and student-portal (5174)
default_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
]

allowed_origins = settings.allowed_origins.split(",") if hasattr(settings, 'allowed_origins') and settings.allowed_origins else default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if settings.environment == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error" if settings.environment == "production" else str(exc)}
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# Include API routes
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(company_router, prefix="/api/company", tags=["Company"])
app.include_router(student_router, prefix="/api/student", tags=["Student"])

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "Company Exam Portal API",
        "version": "1.0.0",
        "environment": settings.environment,
        "docs": "/docs",
        "redoc": "/redoc"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for production monitoring"""
    try:
        # Test database connection
        from app.database.connection import engine
        from sqlalchemy import text
        
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        return {
            "status": "healthy", 
            "message": "API is running",
            "version": "1.0.0",
            "environment": settings.environment,
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "message": "Database connection failed",
                "version": "1.0.0",
                "environment": settings.environment,
                "database": "disconnected",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e) if settings.debug else "Database unavailable"
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
