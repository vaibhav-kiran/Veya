from pydantic import BaseModel

from typing import Optional

class TranscriptionOutput(BaseModel):

    success: bool

    text: Optional[str] = None

    language: Optional[str] = None

    error: Optional[str] = None