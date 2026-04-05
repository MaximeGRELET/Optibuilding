"""Pydantic schemas — API request / response models."""

from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field


# ─── Shared ──────────────────────────────────────────────────────────────────

class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: list[Any]


class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: GeoJSONGeometry
    properties: dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]


# ─── Analysis ────────────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    building: GeoJSONFeatureCollection
    method: Literal["monthly", "hourly"] = "monthly"
    station_id: str | None = None   # si fourni, utilise le fichier EPW réel


class EnvelopeBreakdown(BaseModel):
    walls_kwh: float
    windows_kwh: float
    roof_kwh: float
    floor_kwh: float
    thermal_bridges_kwh: float
    ventilation_kwh: float
    walls_pct: float
    windows_pct: float
    roof_pct: float
    floor_pct: float
    thermal_bridges_pct: float
    ventilation_pct: float


class ZoneResult(BaseModel):
    zone_id: str
    zone_label: str
    zone_type: str
    floor_area_m2: float
    heating_need_kwh: float
    cooling_need_kwh: float
    total_losses_kwh: float
    solar_gains_kwh: float
    internal_gains_kwh: float
    h_t_w_k: float
    h_v_w_k: float
    heating_need_monthly: list[float]
    solar_gains_monthly: list[float]
    envelope_breakdown: dict[str, float]


class AnalysisResponse(BaseModel):
    building_id: str
    method: str
    dpe_class: str
    dpe_co2_class: str
    primary_energy_kwh_m2: float
    co2_kg_m2: float
    heating_need_kwh: float
    cooling_need_kwh: float
    dhw_need_kwh: float
    final_energy_kwh: float
    primary_energy_kwh: float
    cost_eur: float
    total_floor_area_m2: float
    zone_results: list[dict[str, Any]]


# ─── Renovation ──────────────────────────────────────────────────────────────

class InsulateWallsParams(BaseModel):
    material_id: str = "mineral_wool"
    thickness_m: float = Field(0.14, gt=0, le=0.60)
    cost_min_eur: float = Field(10000, ge=0)
    cost_max_eur: float = Field(20000, ge=0)


class InsulateRoofParams(BaseModel):
    material_id: str = "mineral_wool"
    thickness_m: float = Field(0.25, gt=0, le=0.60)
    cost_min_eur: float = Field(5000, ge=0)
    cost_max_eur: float = Field(8000, ge=0)


class InsulateFloorParams(BaseModel):
    material_id: str = "eps_insulation"
    thickness_m: float = Field(0.10, gt=0, le=0.40)
    cost_min_eur: float = Field(4000, ge=0)
    cost_max_eur: float = Field(7000, ge=0)


class ReplaceWindowsParams(BaseModel):
    u_value_w_m2k: float = Field(1.3, gt=0, le=6.0)
    g_value: float = Field(0.6, gt=0, le=1.0)
    cost_min_eur: float = Field(8000, ge=0)
    cost_max_eur: float = Field(15000, ge=0)


class ReplaceHeatingParams(BaseModel):
    system_type: Literal["gas_boiler", "heat_pump", "district_heating"] = "heat_pump"
    efficiency: float = Field(3.0, gt=0)
    cost_min_eur: float = Field(8000, ge=0)
    cost_max_eur: float = Field(14000, ge=0)


class InstallMVHRParams(BaseModel):
    heat_recovery_efficiency: float = Field(0.85, gt=0, le=1.0)
    cost_min_eur: float = Field(3000, ge=0)
    cost_max_eur: float = Field(5000, ge=0)


class CustomScenario(BaseModel):
    scenario_id: str
    label: str
    description: str = ""
    insulate_walls: InsulateWallsParams | None = None
    insulate_roof: InsulateRoofParams | None = None
    insulate_floor: InsulateFloorParams | None = None
    replace_windows: ReplaceWindowsParams | None = None
    replace_heating: ReplaceHeatingParams | None = None
    install_mvhr: InstallMVHRParams | None = None


class RenovationRequest(BaseModel):
    building: GeoJSONFeatureCollection
    method: Literal["monthly", "hourly"] = "monthly"
    station_id: str | None = None
    use_standard_scenarios: bool = True
    custom_scenarios: list[CustomScenario] = []


class ScenarioResultSummary(BaseModel):
    scenario_id: str
    scenario_label: str
    dpe_before: str
    dpe_after: str
    dpe_improvement: int
    primary_energy_before_kwh_m2: float
    primary_energy_after_kwh_m2: float
    heating_need_before_kwh: float
    heating_need_after_kwh: float
    co2_before_kg_m2: float
    co2_after_kg_m2: float
    cost_savings_eur_per_year: float
    investment_min_eur: float
    investment_max_eur: float
    investment_center_eur: float
    simple_payback_years: float


class RenovationResponse(BaseModel):
    building_id: str
    baseline: AnalysisResponse
    scenarios: list[dict[str, Any]]


# ─── Custom action simulation ─────────────────────────────────────────────────

class ActionParam(BaseModel):
    """One enabled action with its parameters."""
    action_id: str  # e.g. "insulate_walls", "replace_windows", …
    params: dict[str, Any] = {}


class SimulateActionsRequest(BaseModel):
    building: GeoJSONFeatureCollection
    method: Literal["monthly", "hourly"] = "monthly"
    actions: list[ActionParam]  # only enabled actions are sent


# ─── Calibration ─────────────────────────────────────────────────────────────

class CalibrationParamsSchema(BaseModel):
    """Per-zone (or wildcard "*") fine-tuning overrides."""
    u_walls: float | None = None
    u_roof: float | None = None
    u_floor: float | None = None
    u_windows: float | None = None
    wwr_override: float | None = None
    infiltration_ach: float | None = None
    ventilation_ach: float | None = None
    t_heating: float | None = None
    t_cooling: float | None = None
    internal_gains_w_m2: float | None = None
    altitude_m: float | None = None


class RealConsumption(BaseModel):
    """Optional real consumption data for comparison."""
    monthly_kwh: list[float] | None = None   # 12 values (metered per month)
    annual_kwh: float | None = None          # annual total to auto-distribute


class CalibrateRequest(BaseModel):
    building: GeoJSONFeatureCollection
    method: Literal["monthly", "hourly"] = "monthly"
    station_id: str | None = None
    calibration: dict[str, CalibrationParamsSchema] = {}
    real_consumption: RealConsumption | None = None
