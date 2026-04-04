"""Router — GET /materials"""

from __future__ import annotations
from fastapi import APIRouter
from thermal_engine.data.material_db import MATERIAL_DATABASE

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("")
def list_materials() -> dict:
    """Return all available materials with their thermal properties."""
    return {
        mat_id: {
            "id": mat_id,
            "description": mat.description,
            "lambda_w_mk": mat.lambda_w_mk,
            "rho_kg_m3": mat.rho_kg_m3,
            "cp_j_kgk": mat.cp_j_kgk,
        }
        for mat_id, mat in MATERIAL_DATABASE.items()
    }
