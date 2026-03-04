from pydantic import BaseModel
from typing import Any

class Response(BaseModel):
    code: int = 0
    message: str = ""
    data: Any = {}
