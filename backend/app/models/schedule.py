from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class Schedule(Base):
    __tablename__ = 'schedules'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=True)
    lng: Mapped[Float] = mapped_column(Float, nullable=False)
    lat: Mapped[Float] = mapped_column(Float, nullable=False)
    location_name: Mapped[str] = mapped_column(String, nullable=False)
    amap_poi_id: Mapped[str] = mapped_column(String, nullable=False)

    owner: Mapped["User"] = relationship("User", back_populates="schedules")

    def __repr__(self):
        return f"<Schedule(id={self.id}, title={self.title}, start_time={self.start_time}, end_time={self.end_time})>"