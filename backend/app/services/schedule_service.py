from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.schedule import Schedule
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate
from app.utils.responses import success_response, error_response
from datetime import datetime

class ScheduleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_schedule(self, schedule_data: ScheduleCreate, user_id: int):
        new_schedule = Schedule(**schedule_data.model_dump(), owner_id=user_id)
        self.db.add(new_schedule)
        await self.db.commit()
        await self.db.refresh(new_schedule)
        return new_schedule

    async def get_schedules(self, start_time: datetime, end_time: datetime, user_id: int):
        stmt = select(Schedule).where(
            Schedule.owner_id == user_id,
            Schedule.start_time >= start_time,
            Schedule.end_time <= end_time
        )
        result = await self.db.execute(stmt)
        schedules = result.scalars().all()
        schedules = sorted(schedules, key=lambda s: s.start_time)  # 按开始时间排序
        return schedules

    async def update_schedule(self, schedule_data: ScheduleUpdate, user_id: int):
        stmt = select(Schedule).where(
            Schedule.id == schedule_data.id,
            Schedule.owner_id == user_id
        )
        result = await self.db.execute(stmt)
        schedule = result.scalars().first()
        
        if not schedule:
            raise ValueError("日程不存在")

        for key, value in schedule_data.dict(exclude_unset=True).items():
            setattr(schedule, key, value)

        await self.db.commit()
        await self.db.refresh(schedule)
        return schedule

    async def delete_schedule(self, schedule_id: int, user_id: int):
        stmt = select(Schedule).where(
            Schedule.id == schedule_id,
            Schedule.owner_id == user_id
        )
        result = await self.db.execute(stmt)
        schedule = result.scalars().first()
        
        if not schedule:
            raise ValueError("日程不存在")

        await self.db.delete(schedule)
        await self.db.commit()
        return True