from typing import Generic, List, Optional, TypeVar, Any, Dict
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginatedMeta(BaseModel):
    page: int
    page_size: int
    total_records: int
    total_pages: int
    has_next: bool
    has_previous: bool

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    meta: PaginatedMeta

class MessageResponse(BaseModel):
    message: str
    success: bool = True
    data: Optional[Dict[str, Any]] = None

class ErrorResponse(BaseModel):
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
