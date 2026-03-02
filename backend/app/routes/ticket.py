from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import logging

from app.database.connection import get_db
from app.models.ticket import Ticket
from app.models.company import Company
from app.schemas.ticket import (
    TicketCreate,
    TicketResponse,
    TicketStatusUpdate,
    AdminTicketResponse,
    VALID_CATEGORIES,
    VALID_PRIORITIES,
    VALID_STATUSES,
)
from app.auth import get_company_user, get_admin_user

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Company Ticket Router  →  mounted at  /api/company/tickets
# ──────────────────────────────────────────────────────────────
company_ticket_router = APIRouter()


@company_ticket_router.post("/raise", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def raise_ticket(
    ticket_data: TicketCreate,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_company_user),
):
    """Company raises a new support ticket to admin"""

    if ticket_data.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category '{ticket_data.category}'. Must be one of: {VALID_CATEGORIES}",
        )

    if ticket_data.priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority '{ticket_data.priority}'. Must be one of: {VALID_PRIORITIES}",
        )

    new_ticket = Ticket(
        title=ticket_data.title,
        description=ticket_data.description,
        category=ticket_data.category,
        priority=ticket_data.priority,
        status="open",
        company_id=current_company.id,
    )

    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    logger.info(f"Ticket #{new_ticket.id} raised by company '{current_company.company_name}'")
    return new_ticket


@company_ticket_router.get("/my-tickets", response_model=List[TicketResponse])
def get_my_tickets(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_company_user),
):
    """Company views all of their raised tickets (newest first)"""
    tickets = (
        db.query(Ticket)
        .filter(Ticket.company_id == current_company.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return tickets


@company_ticket_router.get("/my-tickets/{ticket_id}", response_model=TicketResponse)
def get_my_ticket_by_id(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_company_user),
):
    """Company views a specific ticket by ID"""
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id, Ticket.company_id == current_company.id)
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket #{ticket_id} not found",
        )
    return ticket


# ──────────────────────────────────────────────────────────────
# Admin Ticket Router  →  mounted at  /api/admin
# ──────────────────────────────────────────────────────────────
admin_ticket_router = APIRouter()


def _build_admin_response(ticket: Ticket) -> dict:
    """Helper to build admin ticket response dict with company details"""
    return {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "company_id": ticket.company_id,
        "resolution_notes": ticket.resolution_notes,
        "resolved_by": ticket.resolved_by,
        "resolved_at": ticket.resolved_at,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "company_name": ticket.company.company_name,
        "company_email": ticket.company.email,
    }


@admin_ticket_router.get("/tickets", response_model=List[AdminTicketResponse])
def get_all_tickets(
    status_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin=Depends(get_admin_user),
):
    """
    Admin views all tickets. Supports optional query filters:
    - status_filter: open | in_progress | resolved | closed
    - category_filter: billing | drive | technical | general
    - priority_filter: low | medium | high | urgent
    """

    if status_filter and status_filter not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status_filter '{status_filter}'. Must be one of: {VALID_STATUSES}",
        )
    if category_filter and category_filter not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category_filter '{category_filter}'. Must be one of: {VALID_CATEGORIES}",
        )
    if priority_filter and priority_filter not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority_filter '{priority_filter}'. Must be one of: {VALID_PRIORITIES}",
        )

    query = db.query(Ticket).join(Company, Ticket.company_id == Company.id)

    if status_filter:
        query = query.filter(Ticket.status == status_filter)
    if category_filter:
        query = query.filter(Ticket.category == category_filter)
    if priority_filter:
        query = query.filter(Ticket.priority == priority_filter)

    tickets = query.order_by(Ticket.created_at.desc()).all()
    return [_build_admin_response(t) for t in tickets]


@admin_ticket_router.get("/tickets/{ticket_id}", response_model=AdminTicketResponse)
def get_ticket_detail(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_admin_user),
):
    """Admin views details of a specific ticket including company info"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket #{ticket_id} not found",
        )
    return _build_admin_response(ticket)


@admin_ticket_router.put("/tickets/{ticket_id}/status", response_model=AdminTicketResponse)
def update_ticket_status(
    ticket_id: int,
    update_data: TicketStatusUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_admin_user),
):
    """
    Admin updates the status of a ticket and optionally adds resolution notes.
    Resolution notes are required when setting status to 'resolved' or 'closed'.
    """

    if update_data.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{update_data.status}'. Must be one of: {VALID_STATUSES}",
        )

    if update_data.status in ["resolved", "closed"] and not update_data.resolution_notes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="resolution_notes is required when setting status to 'resolved' or 'closed'",
        )

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket #{ticket_id} not found",
        )

    ticket.status = update_data.status
    ticket.updated_at = datetime.utcnow()

    if update_data.status in ["resolved", "closed"]:
        ticket.resolution_notes = update_data.resolution_notes
        ticket.resolved_by = current_admin.username
        ticket.resolved_at = datetime.utcnow()

    db.commit()
    db.refresh(ticket)

    logger.info(
        f"Ticket #{ticket_id} status updated to '{update_data.status}' by admin '{current_admin.username}'"
    )
    return _build_admin_response(ticket)
