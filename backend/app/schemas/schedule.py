from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ScheduleBase(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    description: Optional[str] = None
    lng: float
    lat: float
    location_name: str
    amap_poi_id: str

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleUpdate(ScheduleBase):
    id: int

class ScheduleResponse(ScheduleBase):
    id: int
    model_config = {"from_attributes": True}

class ScheduleListResponse(BaseModel):
    len: int
    schedules: List[ScheduleResponse]