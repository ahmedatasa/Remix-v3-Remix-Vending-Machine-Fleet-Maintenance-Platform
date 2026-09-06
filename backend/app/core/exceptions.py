from typing import Any, Dict, Optional
from fastapi import status

class AppException(Exception):
    """Base application exception with structured error metadata."""
    def __init__(
        self,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = "INTERNAL_ERROR",
        message: str = "An unexpected error occurred",
        details: Optional[Dict[str, Any]] = None
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

class AuthenticationError(AppException):
    def __init__(self, message: str = "Authentication failed or token invalid", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="AUTHENTICATION_FAILED",
            message=message,
            details=details
        )

class ForbiddenError(AppException):
    def __init__(self, message: str = "You do not have permission to perform this action", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="PERMISSION_DENIED",
            message=message,
            details=details
        )

class NotFoundError(AppException):
    def __init__(self, resource: str = "Resource", identifier: Any = None, details: Optional[Dict[str, Any]] = None):
        msg = f"{resource} with identifier '{identifier}' was not found" if identifier else f"{resource} not found"
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="NOT_FOUND",
            message=msg,
            details=details or {"resource": resource, "identifier": str(identifier)}
        )

class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict or duplicate entry", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="RESOURCE_CONFLICT",
            message=message,
            details=details
        )

class BusinessLogicError(AppException):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="BUSINESS_LOGIC_VIOLATION",
            message=message,
            details=details
        )
