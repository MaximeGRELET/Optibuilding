"""Systèmes HVAC : chaudières, PAC, réseaux, ECS, multi-services."""

from thermal_engine.hvac.base import HVACSystem, HVACResult
from thermal_engine.hvac.boilers import (
    GasBoiler,
    WoodPelletBoiler,
    WoodLogBoiler,
    FuelOilBoiler,
)
from thermal_engine.hvac.heat_pumps import (
    AirWaterHeatPump,
    GroundSourceHeatPump,
    AirAirHeatPump,
    ReversibleHeatPump,
    BiQuadraticCOP,
)
from thermal_engine.hvac.district import (
    DistrictHeating,
    DistrictCooling,
)
from thermal_engine.hvac.dhw import (
    ElectricWaterHeater,
    HeatPumpWaterHeater,
    BoilerDHW,
    DistrictDHW,
    dhw_annual_need_kwh,
    DHW_NEEDS_BY_USAGE,
)
from thermal_engine.hvac.multi_service import MultiServiceHeatPump

__all__ = [
    "HVACSystem",
    "HVACResult",
    "GasBoiler",
    "WoodPelletBoiler",
    "WoodLogBoiler",
    "FuelOilBoiler",
    "AirWaterHeatPump",
    "GroundSourceHeatPump",
    "AirAirHeatPump",
    "ReversibleHeatPump",
    "BiQuadraticCOP",
    "DistrictHeating",
    "DistrictCooling",
    "ElectricWaterHeater",
    "HeatPumpWaterHeater",
    "BoilerDHW",
    "DistrictDHW",
    "dhw_annual_need_kwh",
    "DHW_NEEDS_BY_USAGE",
    "MultiServiceHeatPump",
]
