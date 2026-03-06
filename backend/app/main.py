from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from app.routes import auth_router, admin_router, company_router, company_ticket_router, admin_ticket_router
from app.routes.student import router as student_router
from app.database import seed_initial_data
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

    try:
        seed_initial_data()
        logger.info("✅ Seed data ready!")
    except Exception as e:
        logger.error(f"❌ Seed data failed: {str(e)}")
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

default_origins = [
    "http://localhost:5300",
    "http://localhost:5301",
    "http://127.0.0.1:5300",
    "http://127.0.0.1:5301"
]

env_origins = (
    [o.strip() for o in settings.allowed_origins.split(",")]
    if hasattr(settings, "allowed_origins") and settings.allowed_origins
    else []
)

allowed_origins = list(set(default_origins + env_origins))
logger.info(f"✅ CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
app.include_router(company_ticket_router, prefix="/api/company/tickets", tags=["Company Tickets"])
app.include_router(admin_ticket_router, prefix="/api/admin", tags=["Admin Tickets"])

# Serve static files (company logos etc.)
static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

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
    db_status = "connected"
    redis_status = "connected"

    try:
        from app.database.connection import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Health check DB failed: {str(e)}")
        db_status = "disconnected"

    try:
        from app.utils.redis_client import get_redis
        r = get_redis()
        if r is None:
            redis_status = "unavailable"
        else:
            r.ping()
    except Exception as e:
        logger.error(f"Health check Redis failed: {str(e)}")
        redis_status = "disconnected"

    overall = "healthy" if db_status == "connected" else "unhealthy"

    payload = {
        "status": overall,
        "version": "1.0.0",
        "environment": settings.environment,
        "database": db_status,
        "redis": redis_status,
        "timestamp": datetime.utcnow().isoformat()
    }

    if overall == "unhealthy":
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
