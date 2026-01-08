from .auth import router as auth_router
from .admin import router as admin_router
from .company import router as company_router

__all__ = ["auth_router", "admin_router", "company_router"]
