from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate, ScheduleResponse, ScheduleListResponse
from app.schemas.response import Response
from app.services.schedule_service import ScheduleService
from app.database import get_db
from app.models.schedule import Schedule
from app.api.depends import get_current_user
from app.utils.responses import success_response, error_response
from datetime import datetime

router = APIRouter(
    prefix="/schedules",
    tags=["schedules"]
)

@router.post("/", response_model=Response)
async def create_schedule(
    schedule: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: Schedule = Depends(get_current_user)
):
    service = ScheduleService(db)
    schedule = await service.create_schedule(schedule_data=schedule, user_id=current_user.id)
    return success_response(data=ScheduleResponse.model_validate(schedule), message="添加日程成功")

@router.get("/", response_model=Response)
async def get_schedules(
    start_time: datetime,
    end_time: datetime,
    db: Session = Depends(get_db),
    current_user: Schedule = Depends(get_current_user)
):
    service = ScheduleService(db)
    schedules = await service.get_schedules(start_time=start_time, end_time=end_time, user_id=current_user.id)
    schedules = [ScheduleResponse.model_validate(schedule) for schedule in schedules]
    return success_response(data=ScheduleListResponse(len=len(schedules), schedules=schedules), message="获取日程成功")

@router.patch("/", response_model=Response)
async def update_schedule(
    schedule: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: Schedule = Depends(get_current_user)
):
    service = ScheduleService(db)
    updated_schedule = await service.update_schedule(schedule_data=schedule, user_id=current_user.id)
    if not updated_schedule:
        raise HTTPException(status_code=404, detail="日程不存在")
    return success_response(data=ScheduleResponse.model_validate(updated_schedule), message="修改日程成功")

@router.delete("/{schedule_id}", response_model=Response)
async def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: Schedule = Depends(get_current_user)
):
    service = ScheduleService(db)
    success = await service.delete_schedule(schedule_id=schedule_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="日程不存在")
    return success_response(message="删除日程成功")