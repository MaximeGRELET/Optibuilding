"""Router — /projects (CRUD)."""

import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from api.database import get_db
from api import models
from api.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    geojson: Optional[dict] = None
    calibration: Optional[dict] = None
    analysis: Optional[dict] = None
    renovation: Optional[dict] = None
    station_id: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    geojson: Optional[dict] = None
    calibration: Optional[dict] = None
    analysis: Optional[dict] = None
    renovation: Optional[dict] = None
    station_id: Optional[str] = None

    model_config = {"from_attributes": True}


def _to_out(p: models.Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "geojson":     json.loads(p.geojson)     if p.geojson     else None,
        "calibration": json.loads(p.calibration) if p.calibration else None,
        "analysis":    json.loads(p.analysis)    if p.analysis    else None,
        "renovation":  json.loads(p.renovation)  if p.renovation  else None,
        "station_id":  p.station_id,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_projects(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = db.query(models.Project).filter(models.Project.user_id == user.id).order_by(models.Project.updated_at.desc()).all()
    return [_to_out(p) for p in projects]


@router.post("", status_code=201)
def create_project(
    body: ProjectCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = models.Project(user_id=user.id, name=body.name, description=body.description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.get("/{project_id}")
def get_project(
    project_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.get(models.Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return _to_out(p)


@router.put("/{project_id}")
def update_project(
    project_id: int,
    body: ProjectUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.get(models.Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if body.name is not None:
        p.name = body.name
    if body.description is not None:
        p.description = body.description
    if body.geojson is not None:
        p.geojson = json.dumps(body.geojson)
    if body.calibration is not None:
        p.calibration = json.dumps(body.calibration)
    if body.analysis is not None:
        p.analysis = json.dumps(body.analysis)
    if body.renovation is not None:
        p.renovation = json.dumps(body.renovation)
    if body.station_id is not None:
        p.station_id = body.station_id
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.get(models.Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    db.delete(p)
    db.commit()
