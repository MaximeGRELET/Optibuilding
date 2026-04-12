"""
Eau Chaude Sanitaire (ECS).

Besoins ECS :
  - Résidentiel : 25 kWh/(m²·an) (DPE 2021, forfait)
  - Tertiaire : profil horaire selon usage

Systèmes ECS :
  - Chauffe-eau électrique (résistance, ballon)
  - Chauffe-eau thermodynamique (PAC sur air ambiant ou air extrait VMC)
  - Chaudière murale (préparateur instantané ou semi-instantané)
  - Production collective (réseau de chaleur, PAC collective)

Référence : RE 2020, DPE 2021, NF EN 15316-3
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum

from thermal_engine.hvac.base import HVACSystem, HVACResult


# ─────────────────────────────────────────────────────────────
# Besoins ECS forfaitaires
# ─────────────────────────────────────────────────────────────

DHW_NEED_KWH_M2_AN_RESIDENTIAL = 25.0   # kWh/(m²·an) — DPE 2021
DHW_NEED_KWH_M2_AN_OFFICE      = 3.0
DHW_NEED_KWH_M2_AN_HOTEL       = 55.0
DHW_NEED_KWH_M2_AN_RESTAURANT  = 30.0

DHW_NEEDS_BY_USAGE: dict[str, float] = {
    "residential": DHW_NEED_KWH_M2_AN_RESIDENTIAL,
    "office":      DHW_NEED_KWH_M2_AN_OFFICE,
    "hotel":       DHW_NEED_KWH_M2_AN_HOTEL,
    "restaurant":  DHW_NEED_KWH_M2_AN_RESTAURANT,
    "retail":      2.0,
    "school":      5.0,
}


def dhw_annual_need_kwh(floor_area_m2: float, usage: str = "residential") -> float:
    """Besoin ECS annuel [kWh] selon l'usage et la surface."""
    factor = DHW_NEEDS_BY_USAGE.get(usage, DHW_NEED_KWH_M2_AN_RESIDENTIAL)
    return floor_area_m2 * factor


# ─────────────────────────────────────────────────────────────
# Chauffe-eau électrique à résistance
# ─────────────────────────────────────────────────────────────

@dataclass
class ElectricWaterHeater(HVACSystem):
    """Ballon électrique à résistance (CET résistif).

    η ≈ 0.95 (pertes de stockage ~5 %).

    Parameters
    ----------
    eta_storage : rendement stockage (pertes ballon) []
    volume_l    : volume du ballon [L]
    """
    eta_storage: float = 0.95
    volume_l: float = 200.0

    @property
    def name(self) -> str:
        return f"Chauffe-eau électrique {self.volume_l:.0f} L"

    @property
    def fuel_type(self) -> str:
        return "electricity"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        q_final = q_need_kwh / self.eta_storage
        return self._make_result(q_need_kwh, q_final, self.eta_storage)


# ─────────────────────────────────────────────────────────────
# Chauffe-eau thermodynamique (PAC sur air)
# ─────────────────────────────────────────────────────────────

@dataclass
class HeatPumpWaterHeater(HVACSystem):
    """Chauffe-eau thermodynamique (COP ≈ 2.5–3.5 selon T_air).

    Source : air ambiant (intérieur ou extérieur), ou air extrait VMC.

    Parameters
    ----------
    cop_rated   : COP nominal (A15 → eau 55 °C) []
    delta_cop_per_k : dégradation COP par degré sous 15 °C source []
    """
    cop_rated: float = 3.0
    delta_cop_per_k: float = 0.06

    @property
    def name(self) -> str:
        return "Chauffe-eau thermodynamique"

    @property
    def fuel_type(self) -> str:
        return "electricity"

    def _cop_at_t(self, t_source: float) -> float:
        correction = max(0.0, (15.0 - t_source) * self.delta_cop_per_k)
        return max(1.2, self.cop_rated - correction)

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        if (monthly_needs_kwh and len(monthly_needs_kwh) == 12
                and t_ext_monthly_c and len(t_ext_monthly_c) == 12):
            total = sum(q for q in monthly_needs_kwh if q > 0)
            cop_sum = 0.0
            for q_m, t_e in zip(monthly_needs_kwh, t_ext_monthly_c):
                if q_m <= 0:
                    continue
                cop_m = self._cop_at_t(t_e)
                cop_sum += cop_m * q_m
            scop = cop_sum / total if total > 0 else self.cop_rated
        else:
            scop = self._cop_at_t(10.0)  # source à 10 °C (intérieur hiver moyen)

        q_elec = q_need_kwh / scop if scop > 0 else 0.0
        return self._make_result(q_need_kwh, q_elec, scop)


# ─────────────────────────────────────────────────────────────
# Préparateur ECS couplé à une chaudière
# ─────────────────────────────────────────────────────────────

@dataclass
class BoilerDHW(HVACSystem):
    """ECS produite par une chaudière (instantané ou semi-instantané).

    Le rendement de production ECS est différent du rendement chauffage
    (modulation + pertes de distribution).

    Parameters
    ----------
    fuel          : 'gas', 'wood_pellets', 'fuel_oil', 'biogas'
    eta_production: rendement de production ECS []
    """
    fuel: str = "gas"
    eta_production: float = 0.80

    @property
    def name(self) -> str:
        return f"ECS chaudière {self.fuel}"

    @property
    def fuel_type(self) -> str:
        return self.fuel

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        q_final = q_need_kwh / self.eta_production
        return self._make_result(q_need_kwh, q_final, self.eta_production)


# ─────────────────────────────────────────────────────────────
# ECS réseau de chaleur
# ─────────────────────────────────────────────────────────────

@dataclass
class DistrictDHW(HVACSystem):
    """ECS produite par un réseau de chaleur (sous-station).

    Parameters
    ----------
    ep_factor   : facteur EP du réseau
    co2_factor  : facteur CO2 [kgCO2/kWh]
    cost_factor : tarif [€/kWh]
    """
    ep_factor_val: float = 0.77
    co2_factor_val: float = 0.080
    cost_factor_val: float = 0.080

    @property
    def name(self) -> str:
        return "ECS réseau de chaleur"

    @property
    def fuel_type(self) -> str:
        return "district_heat"

    def _ep_factor(self) -> float:
        return self.ep_factor_val

    def _co2_factor(self) -> float:
        return self.co2_factor_val

    def _cost_factor(self) -> float:
        return self.cost_factor_val

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        return self._make_result(q_need_kwh, q_need_kwh, seasonal_perf=1.0)
