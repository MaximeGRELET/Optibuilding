"""
Classes de base pour les systèmes HVAC.

Tout système HVAC dérive de HVACSystem et implémente :
  - compute(q_need_w, ...) → HVACResult
  - annual_summary(q_needs_kwh) → dict

HVACResult contient l'énergie finale consommée (fuel ou électricité),
l'énergie primaire, les émissions CO2 et le coût.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


# ─────────────────────────────────────────────────────────────
# Résultat d'une simulation HVAC
# ─────────────────────────────────────────────────────────────

@dataclass
class HVACResult:
    """Résultat annuel d'un système HVAC.

    Attributes
    ----------
    q_need_kwh        : besoin thermique net du bâtiment [kWh]
    q_delivered_kwh   : énergie thermique délivrée au bâtiment [kWh]
    q_final_kwh       : énergie finale consommée (gaz, bois, élec…) [kWh]
    q_primary_kwh     : énergie primaire [kWh]
    co2_kg            : émissions CO2 [kg]
    cost_eur          : coût énergétique [€]
    system_name       : nom du système
    fuel_type         : type d'énergie ('gas', 'electricity', 'wood', 'district_heat'…)
    seasonal_perf     : performance saisonnière (COP moyen, η moyen…)
    """
    q_need_kwh: float
    q_delivered_kwh: float
    q_final_kwh: float
    q_primary_kwh: float
    co2_kg: float
    cost_eur: float
    system_name: str = "unknown"
    fuel_type: str = "unknown"
    seasonal_perf: float = 1.0

    def to_dict(self) -> dict:
        return {
            "system_name": self.system_name,
            "fuel_type": self.fuel_type,
            "q_need_kwh": round(self.q_need_kwh, 1),
            "q_delivered_kwh": round(self.q_delivered_kwh, 1),
            "q_final_kwh": round(self.q_final_kwh, 1),
            "q_primary_kwh": round(self.q_primary_kwh, 1),
            "co2_kg": round(self.co2_kg, 1),
            "cost_eur": round(self.cost_eur, 2),
            "seasonal_perf": round(self.seasonal_perf, 3),
        }


# ─────────────────────────────────────────────────────────────
# Classe de base abstraite
# ─────────────────────────────────────────────────────────────

class HVACSystem(ABC):
    """Système HVAC abstrait.

    Sous-classes concrètes :
      GasBoiler, WoodPelletBoiler, WoodLogBoiler,
      AirWaterHeatPump, GroundSourceHeatPump, AirAirHeatPump,
      DistrictHeating, DistrictCooling,
      MultiServiceSystem
    """

    # Facteurs énergie primaire et émissions CO2 par vecteur énergétique
    # Sources : RE 2020 / ADEME / arrêté DPE 2021
    EP_FACTORS: dict[str, float] = {
        "gas":            1.0,
        "electricity":    2.3,    # RE 2020 (0.327 kgCO2/kWh)
        "fuel_oil":       1.0,
        "wood":           0.6,
        "wood_pellets":   0.6,
        "district_heat":  0.77,
        "district_cool":  0.77,
        "biogas":         0.5,
    }

    CO2_FACTORS: dict[str, float] = {  # kgCO2/kWh_final
        "gas":            0.227,
        "electricity":    0.052,   # mix France 2024
        "fuel_oil":       0.324,
        "wood":           0.030,
        "wood_pellets":   0.030,
        "district_heat":  0.080,
        "district_cool":  0.060,
        "biogas":         0.050,
    }

    COST_FACTORS: dict[str, float] = {  # €/kWh_final
        "gas":            0.115,
        "electricity":    0.2516,
        "fuel_oil":       0.130,
        "wood":           0.050,
        "wood_pellets":   0.065,
        "district_heat":  0.080,
        "district_cool":  0.060,
        "biogas":         0.095,
    }

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def fuel_type(self) -> str:
        ...

    @abstractmethod
    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """Calcule les consommations annuelles depuis le besoin thermique.

        Parameters
        ----------
        q_need_kwh        : besoin annuel [kWh]
        monthly_needs_kwh : besoins mensuels [kWh×12] (optionnel, améliore la précision)
        t_ext_monthly_c   : températures ext moyennes mensuelles [°C×12] (pour COP)

        Returns
        -------
        HVACResult
        """
        ...

    # ── Helpers communs ───────────────────────────────────────

    def _ep_factor(self) -> float:
        return self.EP_FACTORS.get(self.fuel_type, 1.0)

    def _co2_factor(self) -> float:
        return self.CO2_FACTORS.get(self.fuel_type, 0.2)

    def _cost_factor(self) -> float:
        return self.COST_FACTORS.get(self.fuel_type, 0.1)

    def _make_result(
        self,
        q_need_kwh: float,
        q_final_kwh: float,
        seasonal_perf: float,
    ) -> HVACResult:
        """Construit un HVACResult à partir de l'énergie finale."""
        return HVACResult(
            q_need_kwh=q_need_kwh,
            q_delivered_kwh=q_need_kwh,  # idéal : besoin = livré
            q_final_kwh=q_final_kwh,
            q_primary_kwh=q_final_kwh * self._ep_factor(),
            co2_kg=q_final_kwh * self._co2_factor(),
            cost_eur=q_final_kwh * self._cost_factor(),
            system_name=self.name,
            fuel_type=self.fuel_type,
            seasonal_perf=seasonal_perf,
        )
