from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class QuestionResponse(BaseModel):
    id: int
    drive_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str
    points: int
    created_at: datetime

    class Config:
        from_attributes = True
