"""
thermal_engine — Moteur de calcul thermique physique OptiBuilding.

API publique (compatible avec main_physics.py et les routers API).
"""

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.climate.epw_parser import parse_epw
from thermal_engine.climate.epw_models import WeatherSeries, EPWLocation
from thermal_engine.simulation.needs import (
    compute_building_needs,
    CalibrationParams,
    BuildingNeedsResult,
)
from thermal_engine.simulation.renovation import (
    simulate_renovation,
    simulate_multiple_scenarios,
    build_standard_scenarios,
    RenovationScenario,
    InsulateWalls,
    InsulateRoof,
    InsulateFloor,
    ReplaceWindows,
    ReplaceHeatingSystem,
    InstallMVHR,
)
from thermal_engine.results.reports import (
    build_analysis_report,
    build_renovation_report,
    save_report,
)

# ── Phase 2 : HVAC, confort, ENR ─────────────────────────────
from thermal_engine.hvac import (
    HVACSystem, HVACResult,
    GasBoiler, WoodPelletBoiler, WoodLogBoiler, FuelOilBoiler,
    AirWaterHeatPump, GroundSourceHeatPump, AirAirHeatPump, ReversibleHeatPump,
    DistrictHeating, DistrictCooling,
    ElectricWaterHeater, HeatPumpWaterHeater, BoilerDHW, DistrictDHW,
    dhw_annual_need_kwh, MultiServiceHeatPump,
)
from thermal_engine.comfort import (
    ThermalComfortInputs,
    compute_pmv, compute_ppd, compute_pmv_ppd,
    operative_temperature, adaptive_comfort_temperature,
    ComfortResult, compute_comfort_indicators,
)
from thermal_engine.renewables import (
    PVSystem, PVAnnualResult,
    SolarThermalCollector, DHWStorageTank,
    SolarThermalResult, simulate_solar_thermal_annual,
)
from thermal_engine.inter_zone import (
    ZoneAdjacency, detect_adjacencies_from_geojson,
    CoupledBuildingSolver, CoupledStepResult,
)

__version__ = "2.0.0"

__all__ = [
    # IO
    "load_building",
    # Météo
    "parse_epw", "WeatherSeries", "EPWLocation",
    # Simulation besoins
    "compute_building_needs", "CalibrationParams", "BuildingNeedsResult",
    # Rénovation
    "simulate_renovation", "simulate_multiple_scenarios", "build_standard_scenarios",
    "RenovationScenario",
    "InsulateWalls", "InsulateRoof", "InsulateFloor",
    "ReplaceWindows", "ReplaceHeatingSystem", "InstallMVHR",
    # Rapports
    "build_analysis_report", "build_renovation_report", "save_report",
    # HVAC
    "HVACSystem", "HVACResult",
    "GasBoiler", "WoodPelletBoiler", "WoodLogBoiler", "FuelOilBoiler",
    "AirWaterHeatPump", "GroundSourceHeatPump", "AirAirHeatPump", "ReversibleHeatPump",
    "DistrictHeating", "DistrictCooling",
    "ElectricWaterHeater", "HeatPumpWaterHeater", "BoilerDHW", "DistrictDHW",
    "dhw_annual_need_kwh", "MultiServiceHeatPump",
    # Confort
    "ThermalComfortInputs",
    "compute_pmv", "compute_ppd", "compute_pmv_ppd",
    "operative_temperature", "adaptive_comfort_temperature",
    "ComfortResult", "compute_comfort_indicators",
    # Renouvelables
    "PVSystem", "PVAnnualResult",
    "SolarThermalCollector", "DHWStorageTank",
    "SolarThermalResult", "simulate_solar_thermal_annual",
    # Inter-zones
    "ZoneAdjacency", "detect_adjacencies_from_geojson",
    "CoupledBuildingSolver", "CoupledStepResult",
]
