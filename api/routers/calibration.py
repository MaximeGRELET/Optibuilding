"""Router — POST /calibration/simulate

Fine-grained parameter calibration against real consumption data.
Returns monthly simulated vs real comparison for interactive tuning.
"""

from __future__ import annotations
import numpy as np
from fastapi import APIRouter, HTTPException

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.simulation.needs import compute_building_needs, CalibrationParams, _calibrated_u, _default_setpoint, _default_internal_gains

from api.schemas import CalibrateRequest, CalibrationParamsSchema
from api.dependencies import get_weather
from api.routers.analysis import _extract_location

router = APIRouter(prefix="/calibration", tags=["calibration"])

# Typical heating month weights for distributing an annual total (ISO 13790 climate approximation)
_MONTH_WEIGHTS = np.array([1.4, 1.2, 1.0, 0.6, 0.2, 0.0, 0.0, 0.0, 0.1, 0.5, 1.0, 1.3])
_MONTH_WEIGHTS = _MONTH_WEIGHTS / _MONTH_WEIGHTS.sum()

# Typical cooling month weights (summer-heavy)
_COOLING_WEIGHTS = np.array([0.0, 0.0, 0.0, 0.1, 0.5, 1.2, 1.5, 1.4, 0.8, 0.2, 0.0, 0.0])
_COOLING_WEIGHTS = _COOLING_WEIGHTS / _COOLING_WEIGHTS.sum()

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


def build_engine_cal(
    geojson_dict: dict,
    req_calibration: "dict[str, CalibrationParamsSchema]",
) -> "dict[str, CalibrationParams]":
    """
    Build the engine calibration dict with correct priority:

        zone-specific calibration  >  wildcard calibration  >  GeoJSON setpoints

    GeoJSON setpoints (t_heating, t_cooling from the zone form) are treated as
    low-priority defaults that the slider overrides can replace.
    has_cooling=False (t_cooling=99) is immutable and cannot be overridden.
    """
    # 1. Collect per-zone GeoJSON setpoints as lowest-priority defaults
    geojson_defaults: dict[str, CalibrationParams] = {}
    for feat in geojson_dict.get("features", []):
        props = feat.get("properties", {})
        zone_id = str(props.get("zone_id", ""))
        if not zone_id:
            continue
        has_cooling = props.get("has_cooling", True)
        t_heat = props.get("heating_setpoint_c")
        t_cool = props.get("cooling_setpoint_c")
        effective_t_cool = (
            float(t_cool) if (t_cool is not None and has_cooling)
            else (99.0 if not has_cooling else None)
        )
        if t_heat is not None or effective_t_cool is not None:
            geojson_defaults[zone_id] = CalibrationParams(
                t_heating=float(t_heat) if t_heat is not None else None,
                t_cooling=effective_t_cool,
            )

    # 2. Separate calibration overrides into wildcard vs zone-specific
    cal_wildcard: CalibrationParams | None = None
    cal_zone: dict[str, CalibrationParams] = {}
    for key, params in req_calibration.items():
        ep = _to_engine_params(params)
        if key == "*":
            cal_wildcard = ep
        else:
            cal_zone[key] = ep

    # 3. Merge per zone: zone_cal > wildcard_cal > geojson_defaults
    engine_cal: dict[str, CalibrationParams] = {}
    _empty = CalibrationParams()
    for zone_id in set(geojson_defaults) | set(cal_zone):
        gj = geojson_defaults.get(zone_id, _empty)
        wc = cal_wildcard or _empty
        zc = cal_zone.get(zone_id, _empty)

        def _pick(attr: str, no_override_99: bool = False) -> float | None:
            gj_val = getattr(gj, attr)
            wc_val = getattr(wc, attr)
            zc_val = getattr(zc, attr)
            # has_cooling=false sentinel: t_cooling=99 cannot be cleared by calibration
            if no_override_99 and gj_val == 99.0:
                return 99.0
            return (
                zc_val if zc_val is not None else
                wc_val if wc_val is not None else
                gj_val
            )

        engine_cal[zone_id] = CalibrationParams(
            u_walls=_pick("u_walls"),
            u_roof=_pick("u_roof"),
            u_floor=_pick("u_floor"),
            u_windows=_pick("u_windows"),
            wwr_override=_pick("wwr_override"),
            infiltration_ach=_pick("infiltration_ach"),
            ventilation_ach=_pick("ventilation_ach"),
            t_heating=_pick("t_heating"),
            t_cooling=_pick("t_cooling", no_override_99=True),
            internal_gains_w_m2=_pick("internal_gains_w_m2"),
            altitude_m=_pick("altitude_m"),
        )

    # Keep wildcard so _merge_calibration can apply it to zones not explicitly listed
    if cal_wildcard:
        engine_cal["*"] = cal_wildcard

    return engine_cal


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

    engine_cal = build_engine_cal(geojson_dict, req.calibration)

    try:
        result = compute_building_needs(
            building, weather,
            method=req.method,
            calibration=engine_cal if engine_cal else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    # Aggregate monthly heating and cooling across zones
    simulated_monthly = np.zeros(12)
    simulated_cooling_monthly = np.zeros(12)
    for z in result.zone_results:
        simulated_monthly += np.array(z.heating_need_monthly or [0] * 12)
        simulated_cooling_monthly += np.array(z.cooling_need_monthly or [0] * 12)

    # Real consumption distribution (heating)
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

    # Real consumption distribution (cooling)
    real_cooling_monthly: list[float] | None = None
    if req.real_cooling_consumption:
        rc = req.real_cooling_consumption
        if rc.monthly_kwh and len(rc.monthly_kwh) == 12:
            real_cooling_monthly = [round(float(v), 1) for v in rc.monthly_kwh]
        elif rc.annual_kwh is not None:
            distributed = _COOLING_WEIGHTS * rc.annual_kwh
            real_cooling_monthly = [round(float(v), 1) for v in distributed]

    d = result.to_dict()

    # Extract effective (actual) simulation parameters for slider initialization
    effective_params = _extract_effective_params(building, engine_cal)

    return {
        "dpe_class": d.get("dpe_class"),
        "dpe_co2_class": d.get("dpe_co2_class"),
        "dpe_cooling_class": d.get("dpe_cooling_class"),
        "primary_energy_kwh_m2": d.get("primary_energy_kwh_m2"),
        "co2_kg_m2": d.get("co2_kg_m2"),
        "heating_need_kwh": d.get("heating_need_kwh"),
        "cooling_need_kwh": d.get("cooling_need_kwh"),
        "cooling_need_kwh_m2": d.get("cooling_need_kwh_m2"),
        "total_floor_area_m2": d.get("total_floor_area_m2"),
        "cost_eur": d.get("cost_eur"),
        "months": MONTH_NAMES,
        "simulated_monthly_kwh": [round(float(v), 1) for v in simulated_monthly],
        "simulated_annual_kwh": round(float(simulated_monthly.sum()), 1),
        "real_monthly_kwh": real_monthly,
        "rmse_kwh": rmse,
        "simulated_cooling_monthly_kwh": [round(float(v), 1) for v in simulated_cooling_monthly],
        "simulated_cooling_annual_kwh": round(float(simulated_cooling_monthly.sum()), 1),
        "real_cooling_monthly_kwh": real_cooling_monthly,
        "zones": d.get("zones", []),
        "effective_params": effective_params,
    }


def _extract_effective_params(building, engine_cal: dict) -> dict:
    """
    Extract area-weighted effective simulation parameters across all zones.
    These are the actual values used by the engine (before any user override),
    so calibration sliders can be initialized to the real simulation baseline.
    """
    from thermal_engine.simulation.needs import _merge_calibration

    total_wall_area = 0.0
    total_roof_area = 0.0
    total_floor_area = 0.0
    total_win_area = 0.0
    sum_u_walls = 0.0
    sum_u_roof = 0.0
    sum_u_floor = 0.0
    sum_u_win = 0.0
    sum_wwr_num = 0.0
    sum_wwr_den = 0.0
    sum_inf_vol = 0.0
    sum_vent_vol = 0.0
    total_vol = 0.0
    sum_t_heat = 0.0
    sum_t_cool = 0.0
    sum_gains_area = 0.0
    total_floor = 0.0
    sum_alt = 0.0
    n_zones = 0

    for zone in building.zones:
        cal = _merge_calibration(engine_cal, zone.zone_id)

        # U-values
        for el in zone.opaque_elements:
            u = _calibrated_u(el.element_type, el.u_value_w_m2k, cal)
            if el.element_type == "wall":
                sum_u_walls += u * el.area_m2
                total_wall_area += el.area_m2
            elif el.element_type == "roof":
                sum_u_roof += u * el.area_m2
                total_roof_area += el.area_m2
            elif el.element_type == "ground_floor":
                sum_u_floor += u * el.area_m2
                total_floor_area += el.area_m2

        for win in zone.windows:
            u = cal.u_windows if cal.u_windows is not None else win.uw_w_m2k
            sum_u_win += u * win.area_m2
            total_win_area += win.area_m2

        # WWR = window area / (wall + window area)
        wall_area = sum(el.area_m2 for el in zone.opaque_elements if el.element_type == "wall")
        win_area  = sum(w.area_m2 for w in zone.windows)
        sum_wwr_num += win_area
        sum_wwr_den += wall_area + win_area

        # Ventilation
        ach_inf  = cal.infiltration_ach if cal.infiltration_ach is not None else zone.infiltration_ach
        ach_vent = cal.ventilation_ach  if cal.ventilation_ach  is not None else zone.mechanical_vent_ach
        sum_inf_vol  += ach_inf  * zone.volume_m3
        sum_vent_vol += ach_vent * zone.volume_m3
        total_vol += zone.volume_m3

        # Setpoints & gains
        t_heat = cal.t_heating if cal.t_heating is not None else _default_setpoint(zone.usage, "heat")
        t_cool = cal.t_cooling if cal.t_cooling is not None else _default_setpoint(zone.usage, "cool")
        gains  = cal.internal_gains_w_m2 if cal.internal_gains_w_m2 is not None else _default_internal_gains(zone.usage)
        sum_t_heat   += t_heat * zone.floor_area_m2
        sum_t_cool   += t_cool * zone.floor_area_m2
        sum_gains_area += gains * zone.floor_area_m2
        total_floor  += zone.floor_area_m2

        n_zones += 1

    def _wavg(num, den):
        return round(num / den, 3) if den > 0 else None

    return {
        "u_walls":             _wavg(sum_u_walls,  total_wall_area),
        "u_roof":              _wavg(sum_u_roof,   total_roof_area),
        "u_floor":             _wavg(sum_u_floor,  total_floor_area),
        "u_windows":           _wavg(sum_u_win,    total_win_area),
        "wwr_override":        round(sum_wwr_num / sum_wwr_den, 3) if sum_wwr_den > 0 else None,
        "infiltration_ach":    round(sum_inf_vol  / total_vol, 3) if total_vol > 0 else None,
        "ventilation_ach":     round(sum_vent_vol / total_vol, 3) if total_vol > 0 else None,
        "t_heating":           round(sum_t_heat   / total_floor, 2) if total_floor > 0 else None,
        "t_cooling":           round(sum_t_cool   / total_floor, 2) if total_floor > 0 else None,
        "internal_gains_w_m2": round(sum_gains_area / total_floor, 2) if total_floor > 0 else None,
    }
