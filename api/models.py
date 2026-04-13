"""ORM models — User and Project."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship

from api.database import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), unique=True, index=True, nullable=False)
    hashed_pw  = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=_now)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(String(500), default="")
    # Serialised JSON blobs — stored as TEXT
    geojson     = Column(Text, default=None)       # building GeoJSON
    calibration = Column(Text, default=None)       # calibration params
    analysis    = Column(Text, default=None)       # last analysis result
    renovation  = Column(Text, default=None)       # last renovation result
    station_id  = Column(String(100), default=None)
    created_at  = Column(DateTime, default=_now)
    updated_at  = Column(DateTime, default=_now, onupdate=_now)

    owner = relationship("User", back_populates="projects")
