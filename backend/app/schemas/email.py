from pydantic import BaseModel, validator
from datetime import datetime
from typing import Optional, Dict

class EmailTemplateBase(BaseModel):
    subject_template: str
    body_template: str
    use_custom_template: bool = True

    @validator('subject_template')
    def validate_subject_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Subject template cannot be empty')
        return v

    @validator('body_template')
    def validate_body_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Body template cannot be empty')
        return v

class EmailTemplateUpdate(EmailTemplateBase):
    pass

class EmailTemplateResponse(EmailTemplateBase):
    template_updated_at: Optional[datetime] = None
    available_variables: Dict[str, str] = {}

    class Config:
        from_attributes = True

class EmailTemplatePreview(BaseModel):
    subject_template: str
    body_template: str

class EmailTemplatePreviewResponse(BaseModel):
    rendered_subject: str
    rendered_body: str
    sample_data_used: Dict[str, str]

class EmailSendResponse(BaseModel):
    success: bool
    message: str
    sent_count: int
    failed_count: int
    total_students: int
    failed_emails: list = []

class EmailStatusResponse(BaseModel):
    drive_id: int
    drive_title: str
    is_approved: bool
    student_count: int
    can_send_emails: bool
    status_message: str
    template_preview: dict
    using_custom_template: bool
    email_configured: bool