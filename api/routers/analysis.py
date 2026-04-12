"""Router — POST /analysis"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.simulation.needs import compute_building_needs, CalibrationParams

from api.schemas import AnalysisRequest
from api.dependencies import get_weather

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("")
def run_analysis(req: AnalysisRequest) -> dict:
    """
    Compute building energy needs from a GeoJSON FeatureCollection.

    Returns DPE class, primary energy, CO₂, heating/cooling needs, and
    per-zone envelope breakdown.

    Per-zone setpoints (heating_setpoint_c / cooling_setpoint_c) embedded in
    the GeoJSON properties are automatically applied as CalibrationParams.
    Additional overrides can be passed via the `calibration` field.
    """
    geojson_dict = req.building.model_dump()
    try:
        building = load_building(geojson_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"GeoJSON invalide : {exc}") from exc

    lat, lon = _extract_location(geojson_dict)
    city = geojson_dict["features"][0]["properties"].get("city", "")
    weather = get_weather(lat, lon, city, station_id=req.station_id)

    # Build calibration: start from GeoJSON per-zone setpoints, then merge
    # any explicit overrides from the request body.
    from api.routers.calibration import _to_engine_params
    engine_cal: dict[str, CalibrationParams] = {}

    # 1. Per-zone setpoints from GeoJSON properties
    for feat in geojson_dict.get("features", []):
        props = feat.get("properties", {})
        zone_id = str(props.get("zone_id", ""))
        t_heat = props.get("heating_setpoint_c")
        t_cool = props.get("cooling_setpoint_c")
        if zone_id and (t_heat is not None or t_cool is not None):
            engine_cal[zone_id] = CalibrationParams(
                t_heating=float(t_heat) if t_heat is not None else None,
                t_cooling=float(t_cool) if t_cool is not None else None,
            )

    # 2. Merge explicit calibration overrides from request (win over GeoJSON)
    for zone_key, schema_params in req.calibration.items():
        ep = _to_engine_params(schema_params)
        if zone_key in engine_cal:
            # Merge: keep GeoJSON setpoints unless explicitly overridden
            existing = engine_cal[zone_key]
            engine_cal[zone_key] = CalibrationParams(
                u_walls=ep.u_walls,
                u_roof=ep.u_roof,
                u_floor=ep.u_floor,
                u_windows=ep.u_windows,
                wwr_override=ep.wwr_override,
                infiltration_ach=ep.infiltration_ach,
                ventilation_ach=ep.ventilation_ach,
                t_heating=ep.t_heating if ep.t_heating is not None else existing.t_heating,
                t_cooling=ep.t_cooling if ep.t_cooling is not None else existing.t_cooling,
                internal_gains_w_m2=ep.internal_gains_w_m2,
                altitude_m=ep.altitude_m,
            )
        else:
            engine_cal[zone_key] = ep

    try:
        result = compute_building_needs(
            building, weather, method=req.method,
            calibration=engine_cal if engine_cal else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    d = result.to_dict()
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
