"""Router — POST /calibration/simulate

Fine-grained parameter calibration against real consumption data.
Returns monthly simulated vs real comparison for interactive tuning.
"""

from __future__ import annotations
import numpy as np
from fastapi import APIRouter, HTTPException

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.simulation.needs import compute_building_needs, CalibrationParams

from api.schemas import CalibrateRequest, CalibrationParamsSchema
from api.dependencies import get_weather
from api.routers.analysis import _extract_location

router = APIRouter(prefix="/calibration", tags=["calibration"])

# Typical heating month weights for distributing an annual total (ISO 13790 climate approximation)
_MONTH_WEIGHTS = np.array([1.4, 1.2, 1.0, 0.6, 0.2, 0.0, 0.0, 0.0, 0.1, 0.5, 1.0, 1.3])
_MONTH_WEIGHTS = _MONTH_WEIGHTS / _MONTH_WEIGHTS.sum()

MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
               "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]


def _to_engine_params(s: CalibrationParamsSchema) -> CalibrationParams:
    return CalibrationParams(
        u_walls=s.u_walls,
        u_roof=s.u_roof,
        u_floor=s.u_floor,
        u_windows=s.u_windows,
        wwr_override=s.wwr_override,
        infiltration_ach=s.infiltration_ach,
        ventilation_ach=s.ventilation_ach,
        t_heating=s.t_heating,
        t_cooling=s.t_cooling,
        internal_gains_w_m2=s.internal_gains_w_m2,
        altitude_m=s.altitude_m,
    )


@router.post("/simulate")
def calibrate_simulate(req: CalibrateRequest) -> dict:
    """
    Run a building needs simulation with calibration overrides.

    - calibration["*"]  applies to every zone (wildcard)
    - calibration["zone_id"] applies to that specific zone only
    - Per-zone values take precedence over the wildcard

    Returns monthly simulated heating needs vs optional real consumption,
    plus DPE/EP summary for the calibrated parameters.
    """
    geojson_dict = req.building.model_dump()
    try:
        building = load_building(geojson_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"GeoJSON invalide : {exc}") from exc

    lat, lon = _extract_location(geojson_dict)
    city = geojson_dict["features"][0]["properties"].get("city", "")
    weather = get_weather(lat, lon, city, station_id=req.station_id)

    # Build calibration dict for the engine
    engine_cal: dict[str, CalibrationParams] = {}
    for key, params in req.calibration.items():
        engine_cal[key] = _to_engine_params(params)

    try:
        result = compute_building_needs(
            building, weather,
            method=req.method,
            calibration=engine_cal if engine_cal else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    # Aggregate monthly heating across zones
    simulated_monthly = np.zeros(12)
    for z in result.zone_results:
        monthly = np.array(z.heating_need_monthly or [0] * 12)
        simulated_monthly += monthly

    # Real consumption distribution
    real_monthly: list[float] | None = None
    if req.real_consumption:
        rc = req.real_consumption
        if rc.monthly_kwh and len(rc.monthly_kwh) == 12:
            real_monthly = [round(float(v), 1) for v in rc.monthly_kwh]
        elif rc.annual_kwh is not None:
            distributed = _MONTH_WEIGHTS * rc.annual_kwh
            real_monthly = [round(float(v), 1) for v in distributed]

    # RMSE vs real (if available)
    rmse: float | None = None
    if real_monthly:
        diff = simulated_monthly - np.array(real_monthly)
        rmse = round(float(np.sqrt(np.mean(diff ** 2))), 1)

    d = result.to_dict()

    return {
        "dpe_class": d.get("dpe_class"),
        "dpe_co2_class": d.get("dpe_co2_class"),
        "primary_energy_kwh_m2": d.get("primary_energy_kwh_m2"),
        "co2_kg_m2": d.get("co2_kg_m2"),
        "heating_need_kwh": d.get("heating_need_kwh"),
        "total_floor_area_m2": d.get("total_floor_area_m2"),
        "cost_eur": d.get("cost_eur"),
        "months": MONTH_NAMES,
        "simulated_monthly_kwh": [round(float(v), 1) for v in simulated_monthly],
        "simulated_annual_kwh": round(float(simulated_monthly.sum()), 1),
        "real_monthly_kwh": real_monthly,
        "rmse_kwh": rmse,
        "zones": d.get("zones", []),
    }
