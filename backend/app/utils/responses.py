from typing import Any, Optional
from app.schemas.response import Response

def create_response(
    code: int,
    message: str,
    data: Optional[Any] = None
) -> Response:
    return Response(
        code=code,
        message=message,
        data=data if data is not None else {}
    )

def success_response(data=None, message="成功"):
    return create_response(0, message, data)

def error_response(code, message):
    return create_response(code, message)
