"""Router — POST /analysis"""

from __future__ import annotations
import json
from fastapi import APIRouter, HTTPException

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.simulation.needs import compute_building_needs

from api.schemas import AnalysisRequest
from api.dependencies import get_weather

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("")
def run_analysis(req: AnalysisRequest) -> dict:
    """
    Compute building energy needs from a GeoJSON FeatureCollection.

    Returns DPE class, primary energy, CO₂, heating needs, and per-zone
    envelope breakdown.
    """
    # Deserialize GeoJSON via the thermal-engine loader
    geojson_dict = req.building.model_dump()
    try:
        building = load_building(geojson_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"GeoJSON invalide : {exc}") from exc

    # Extract location for synthetic weather (centroid of first zone)
    lat, lon = _extract_location(geojson_dict)
    city = geojson_dict["features"][0]["properties"].get("city", "")
    weather = get_weather(lat, lon, city, station_id=req.station_id)

    try:
        result = compute_building_needs(building, weather, method=req.method)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    d = result.to_dict()
    # Attach exterior temperature series for hourly charts
    if req.method == "hourly":
        d["t_ext_hourly"] = [round(float(v), 1) for v in weather.dry_bulb_temp_c]
    return d


def _extract_location(geojson: dict) -> tuple[float, float]:
    """Returns (lat, lon) from the centroid of the first feature's polygon."""
    try:
        coords = geojson["features"][0]["geometry"]["coordinates"][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        # WGS84 range check
        if all(-181 < x < 181 for x in lons) and all(-91 < y < 91 for y in lats):
            return sum(lats) / len(lats), sum(lons) / len(lons)
    except (KeyError, IndexError, TypeError):
        pass
    return 46.0, 2.0  # France center fallback
