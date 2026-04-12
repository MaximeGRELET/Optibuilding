"""
Système multi-services : PAC couvrant chauffage + ECS + refroidissement.

Un seul équipement assure plusieurs services avec une gestion de priorité :
  1. ECS (priorité haute — besoin continu)
  2. Chauffage (mode hiver)
  3. Refroidissement (mode été)

La PAC passe d'un mode à l'autre ; les performances sont calculées pour chaque
service séparément puis agrégées en un bilan électrique global.

Exemples de systèmes modélisés :
  - PAC air/eau avec bouclier ECS intégré (type Atlantic Alfea Extensa, Daikin Altherma)
  - PAC géothermique multi-services
  - Système VRF avec récupération de chaleur (chauffage + froid simultanés)
"""

from __future__ import annotations
from dataclasses import dataclass, field

from thermal_engine.hvac.base import HVACSystem, HVACResult
from thermal_engine.hvac.heat_pumps import (
    AirWaterHeatPump, GroundSourceHeatPump, ReversibleHeatPump,
    BiQuadraticCOP, _COEFFS_AIR_WATER_HEAT, _COEFFS_AIR_WATER_COOL,
)


@dataclass
class MultiServiceHeatPump:
    """PAC multi-services : chauffage + ECS + refroidissement (optionnel).

    Partage la même unité extérieure pour les trois services, avec priorité ECS.
    Le bilan électrique est la somme des consommations des trois services.

    Parameters
    ----------
    q_nominal_heat_kw : puissance nominale chauffage [kW]
    q_nominal_cool_kw : puissance nominale refroidissement [kW] (0 = sans froid)
    q_nominal_dhw_kw  : puissance nominale ECS [kW]
    cop_heat          : COP nominal chauffage (A7/W45)
    cop_dhw           : COP nominal ECS (A15/W55)
    eer_cool          : EER nominal refroidissement (A35/W7)
    source_type       : 'air' ou 'ground'
    t_ground_mean_c   : température sol moyen (si source_type='ground') [°C]
    """
    q_nominal_heat_kw: float = 12.0
    q_nominal_cool_kw: float = 0.0
    q_nominal_dhw_kw: float = 3.0
    cop_heat: float = 3.20
    cop_dhw: float = 2.80
    eer_cool: float = 2.80
    source_type: str = "air"
    t_ground_mean_c: float = 12.0

    # Courbes bi-quadratiques
    _bq_heat: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_HEAT), init=False, repr=False)
    _bq_cool: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_COOL), init=False, repr=False)

    @property
    def name(self) -> str:
        cool = " + froid" if self.q_nominal_cool_kw > 0 else ""
        src = "géo" if self.source_type == "ground" else "air"
        return f"PAC {src}/eau multi-services (chaud + ECS{cool})"

    def _t_source_monthly(self, t_ext_monthly: list[float] | None) -> list[float]:
        """Température source mensuelle selon le type."""
        if self.source_type == "ground":
            return [self.t_ground_mean_c] * 12
        return t_ext_monthly if t_ext_monthly else [7.0] * 12

    def compute_annual_heating(
        self,
        q_heat_need_kwh: float,
        monthly_heat_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """Bilan chauffage."""
        t_src = self._t_source_monthly(t_ext_monthly_c)

        if monthly_heat_kwh and len(monthly_heat_kwh) == 12:
            total = sum(q for q in monthly_heat_kwh if q > 0)
            cop_sum = 0.0
            for q_m, ts in zip(monthly_heat_kwh, t_src):
                if q_m <= 0:
                    continue
                cop_m = self._bq_heat(ts, 45.0) if self.source_type == "air" else self.cop_heat
                cop_sum += cop_m * q_m
            scop = cop_sum / total if total > 0 else self.cop_heat
        else:
            scop = self.cop_heat

        q_elec = q_heat_need_kwh / scop if scop > 0 else 0.0
        result = HVACResult(
            q_need_kwh=q_heat_need_kwh,
            q_delivered_kwh=q_heat_need_kwh,
            q_final_kwh=q_elec,
            q_primary_kwh=q_elec * HVACSystem.EP_FACTORS["electricity"],
            co2_kg=q_elec * HVACSystem.CO2_FACTORS["electricity"],
            cost_eur=q_elec * HVACSystem.COST_FACTORS["electricity"],
            system_name=self.name + " [chauffage]",
            fuel_type="electricity",
            seasonal_perf=scop,
        )
        return result

    def compute_annual_dhw(
        self,
        q_dhw_need_kwh: float,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """Bilan ECS."""
        t_src = self._t_source_monthly(t_ext_monthly_c)
        t_src_mean = sum(t_src) / 12.0
        cop_dhw = max(1.5,
            self._bq_heat(t_src_mean, 55.0) * 0.90  # Déclassement ECS (T_départ plus haute)
            if self.source_type == "air" else self.cop_dhw
        )
        q_elec = q_dhw_need_kwh / cop_dhw if cop_dhw > 0 else 0.0
        return HVACResult(
            q_need_kwh=q_dhw_need_kwh,
            q_delivered_kwh=q_dhw_need_kwh,
            q_final_kwh=q_elec,
            q_primary_kwh=q_elec * HVACSystem.EP_FACTORS["electricity"],
            co2_kg=q_elec * HVACSystem.CO2_FACTORS["electricity"],
            cost_eur=q_elec * HVACSystem.COST_FACTORS["electricity"],
            system_name=self.name + " [ECS]",
            fuel_type="electricity",
            seasonal_perf=cop_dhw,
        )

    def compute_annual_cooling(
        self,
        q_cool_need_kwh: float,
        monthly_cool_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult | None:
        """Bilan refroidissement (None si système non réversible)."""
        if self.q_nominal_cool_kw <= 0:
            return None

        t_src = self._t_source_monthly(t_ext_monthly_c)

        if monthly_cool_kwh and len(monthly_cool_kwh) == 12:
            total = sum(q for q in monthly_cool_kwh if q > 0)
            eer_sum = 0.0
            for q_m, ts in zip(monthly_cool_kwh, t_src):
                if q_m <= 0:
                    continue
                eer_m = self._bq_cool(ts, 7.0) if self.source_type == "air" else self.eer_cool
                eer_sum += eer_m * q_m
            seer = eer_sum / total if total > 0 else self.eer_cool
        else:
            seer = self.eer_cool

        q_elec = q_cool_need_kwh / seer if seer > 0 else 0.0
        return HVACResult(
            q_need_kwh=q_cool_need_kwh,
            q_delivered_kwh=q_cool_need_kwh,
            q_final_kwh=q_elec,
            q_primary_kwh=q_elec * HVACSystem.EP_FACTORS["electricity"],
            co2_kg=q_elec * HVACSystem.CO2_FACTORS["electricity"],
            cost_eur=q_elec * HVACSystem.COST_FACTORS["electricity"],
            system_name=self.name + " [froid]",
            fuel_type="electricity",
            seasonal_perf=seer,
        )

    def compute_annual_total(
        self,
        q_heat_need_kwh: float,
        q_dhw_need_kwh: float,
        q_cool_need_kwh: float = 0.0,
        monthly_heat_kwh: list[float] | None = None,
        monthly_cool_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> dict[str, HVACResult]:
        """Calcule les trois services et retourne un dict par service."""
        results: dict[str, HVACResult] = {}

        results["heating"] = self.compute_annual_heating(
            q_heat_need_kwh, monthly_heat_kwh, t_ext_monthly_c)
        results["dhw"] = self.compute_annual_dhw(
            q_dhw_need_kwh, t_ext_monthly_c)

        if q_cool_need_kwh > 0:
            cool_res = self.compute_annual_cooling(
                q_cool_need_kwh, monthly_cool_kwh, t_ext_monthly_c)
            if cool_res:
                results["cooling"] = cool_res

        return results
