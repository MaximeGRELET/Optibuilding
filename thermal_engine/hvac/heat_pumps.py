"""
Pompes à chaleur (PAC) — tous types.

Modèle de performance :
  COP = f(T_source, T_sink) via équation bi-quadratique EN 14825 / EN 14511.
  Pour le chauffage : T_source = Text (air) ou Tsol (géothermie), T_sink = T_départ réseau.
  Pour le refroidissement : T_source = T_local, T_sink = Text (air) ou sol.

Dégradation à charge partielle : COP_real = COP_rated × Cd(PLR)
  Cd(PLR) = PLR / (Cc + (1-Cc)×PLR)  avec Cc = coefficient de dégradation (défaut 0.25)

Référence : EN 14825:2022, ASHRAE Handbook HVAC Systems & Equipment
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
import numpy as np

from thermal_engine.hvac.base import HVACSystem, HVACResult


# ─────────────────────────────────────────────────────────────
# Courbe COP bi-quadratique
# ─────────────────────────────────────────────────────────────

class BiQuadraticCOP:
    """COP = a0 + a1·Ts + a2·Ts² + a3·Tk + a4·Tk² + a5·Ts·Tk

    Ts = température source [°C], Tk = température condensation/puits [°C]
    """

    def __init__(self, coeffs: tuple[float, ...]) -> None:
        if len(coeffs) != 6:
            raise ValueError("6 coefficients requis pour la courbe bi-quadratique")
        self._c = coeffs

    def __call__(self, t_source: float, t_sink: float) -> float:
        c = self._c
        cop = (c[0]
               + c[1] * t_source
               + c[2] * t_source ** 2
               + c[3] * t_sink
               + c[4] * t_sink ** 2
               + c[5] * t_source * t_sink)
        return max(1.0, cop)  # COP plancher = 1 (résistance électrique)


# Coefficients typiques PAC air/eau (source : EnergyPlus Engineering Reference)
_COEFFS_AIR_WATER_HEAT = (3.68, 0.0559, 0.000, -0.0367, 0.000, 0.000)
_COEFFS_AIR_WATER_COOL = (3.19, 0.0371, 0.000, -0.0509, 0.000, 0.000)
_COEFFS_GEO_HEAT       = (4.50, 0.0480, 0.000, -0.0320, 0.000, 0.000)
_COEFFS_GEO_COOL       = (3.80, 0.0300, 0.000, -0.0420, 0.000, 0.000)


# ─────────────────────────────────────────────────────────────
# Classe de base PAC
# ─────────────────────────────────────────────────────────────

class HeatPump(HVACSystem):
    """PAC générique — sous-classes concrètes ci-dessous."""

    # Températures de départ réseau par défaut [°C]
    T_SINK_HEAT_DEFAULT = 45.0   # plancher chauffant basse température
    T_SINK_COOL_DEFAULT = 7.0    # eau glacée

    # Dégradation à charge partielle (EN 14825)
    CC_DEGRADATION = 0.25

    @property
    def fuel_type(self) -> str:
        return "electricity"

    def _degradation_factor(self, plr: float) -> float:
        """Cd(PLR) selon EN 14825."""
        plr = max(0.05, min(1.0, plr))
        return plr / (self.CC_DEGRADATION + (1.0 - self.CC_DEGRADATION) * plr)

    def _seasonal_cop(
        self,
        cop_curve: BiQuadraticCOP,
        monthly_needs_kwh: list[float],
        t_source_monthly: list[float],
        t_sink: float,
        q_nominal_kw: float,
    ) -> float:
        """Calcule le COP saisonnier (SCOP) pondéré par les besoins mensuels.

        Pas de correction PLR dans le calcul mensuel : les PAC inverter modernes
        ont une dégradation à charge partielle très faible (Cc ≈ 0.05–0.10).
        """
        total_need = sum(monthly_needs_kwh)
        if total_need <= 0:
            return 3.0
        cop_sum = 0.0
        for q_m, ts in zip(monthly_needs_kwh, t_source_monthly):
            if q_m <= 0:
                continue
            cop_rated = cop_curve(ts, t_sink)
            cop_sum += cop_rated * q_m
        return cop_sum / total_need


# ─────────────────────────────────────────────────────────────
# PAC air/eau (chauffage + optionnel refroidissement réversible)
# ─────────────────────────────────────────────────────────────

@dataclass
class AirWaterHeatPump(HeatPump):
    """PAC air/eau (split ou monobloc).

    Peut assurer le chauffage seul ou chauffage + rafraîchissement (réversible).

    Parameters
    ----------
    q_nominal_heat_kw : puissance calorifique nominale à A7/W35 [kW]
    q_nominal_cool_kw : puissance frigorifique nominale (0 = non réversible) [kW]
    t_sink_heat_c     : température de départ en mode chaud [°C]
    t_sink_cool_c     : température de départ en mode froid [°C]
    """
    q_nominal_heat_kw: float = 10.0
    q_nominal_cool_kw: float = 0.0
    t_sink_heat_c: float = HeatPump.T_SINK_HEAT_DEFAULT
    t_sink_cool_c: float = HeatPump.T_SINK_COOL_DEFAULT

    _cop_heat: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_HEAT), init=False, repr=False)
    _cop_cool: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_COOL), init=False, repr=False)

    @property
    def name(self) -> str:
        suffix = " réversible" if self.q_nominal_cool_kw > 0 else ""
        return f"PAC air/eau{suffix}"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        if (monthly_needs_kwh and len(monthly_needs_kwh) == 12
                and t_ext_monthly_c and len(t_ext_monthly_c) == 12):
            scop = self._seasonal_cop(
                self._cop_heat,
                monthly_needs_kwh,
                t_ext_monthly_c,
                self.t_sink_heat_c,
                self.q_nominal_heat_kw,
            )
        else:
            # COP à condition nominale A7/W45
            scop = self._cop_heat(7.0, self.t_sink_heat_c) * self._degradation_factor(0.5)

        q_elec = q_need_kwh / scop if scop > 0 else 0.0
        return self._make_result(q_need_kwh, q_elec, scop)


# ─────────────────────────────────────────────────────────────
# PAC géothermique (sol/eau)
# ─────────────────────────────────────────────────────────────

@dataclass
class GroundSourceHeatPump(HeatPump):
    """PAC géothermique (capteur horizontal ou sonde verticale).

    La source est le sol dont la température varie peu (≈ 10–14 °C selon prof.).

    Parameters
    ----------
    q_nominal_heat_kw : puissance nominale [kW]
    t_ground_mean_c   : température moyenne du sol [°C]
    """
    q_nominal_heat_kw: float = 10.0
    t_ground_mean_c: float = 12.0
    t_sink_heat_c: float = 45.0

    _cop_heat: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_GEO_HEAT), init=False, repr=False)

    @property
    def name(self) -> str:
        return "PAC géothermique sol/eau"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        # Source sol : température quasi-constante → COP stable
        cop = self._cop_heat(self.t_ground_mean_c, self.t_sink_heat_c)
        cop_eff = cop * self._degradation_factor(0.6)  # PLR moyen plus élevé (sol stable)
        q_elec = q_need_kwh / cop_eff if cop_eff > 0 else 0.0
        return self._make_result(q_need_kwh, q_elec, cop_eff)


# ─────────────────────────────────────────────────────────────
# PAC air/air (climatisation + chauffage)
# ─────────────────────────────────────────────────────────────

@dataclass
class AirAirHeatPump(HeatPump):
    """PAC air/air (split mural, VRV/VRF).

    Adapté aux zones sans distribution hydraulique (appartements, bureaux).

    Parameters
    ----------
    cop_rated_heat : COP nominal en mode chauffage (A7/A20) []
    eer_rated_cool : EER nominal en mode refroidissement (A35/A27) []
    """
    cop_rated_heat: float = 3.5
    eer_rated_cool: float = 3.2
    # Dégradation à T_ext basse (correction linéaire)
    delta_cop_per_k: float = 0.04   # perte de COP par °C sous 7 °C source

    @property
    def name(self) -> str:
        return "PAC air/air (split)"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        if (monthly_needs_kwh and len(monthly_needs_kwh) == 12
                and t_ext_monthly_c and len(t_ext_monthly_c) == 12):
            total = sum(monthly_needs_kwh)
            cop_sum = 0.0
            for q_m, t_e in zip(monthly_needs_kwh, t_ext_monthly_c):
                if q_m <= 0:
                    continue
                # Correction linéaire du COP selon T_ext
                correction = max(0.0, (7.0 - t_e) * self.delta_cop_per_k)
                cop_m = max(1.5, self.cop_rated_heat - correction)
                cop_sum += cop_m * q_m
            scop = cop_sum / total if total > 0 else self.cop_rated_heat
        else:
            scop = self.cop_rated_heat

        q_elec = q_need_kwh / scop if scop > 0 else 0.0
        return self._make_result(q_need_kwh, q_elec, scop)


# ─────────────────────────────────────────────────────────────
# PAC réversible (chauffage + refroidissement sur le même circuit)
# ─────────────────────────────────────────────────────────────

@dataclass
class ReversibleHeatPump(HeatPump):
    """PAC réversible air/eau ou air/air couvrant chaud ET froid.

    Gère séparément les besoins de chauffage et de refroidissement.

    Parameters
    ----------
    q_nominal_heat_kw : puissance nominale chauffage [kW]
    q_nominal_cool_kw : puissance nominale refroidissement [kW]
    cop_heat          : COP nominal chauffage (A7/W45) []
    eer_cool          : EER nominal refroidissement (A35/W7) []
    """
    q_nominal_heat_kw: float = 12.0
    q_nominal_cool_kw: float = 10.0
    cop_heat: float = 3.20
    eer_cool: float = 2.80

    _bq_heat: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_HEAT), init=False, repr=False)
    _bq_cool: BiQuadraticCOP = field(
        default_factory=lambda: BiQuadraticCOP(_COEFFS_AIR_WATER_COOL), init=False, repr=False)

    @property
    def name(self) -> str:
        return "PAC réversible air/eau"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """q_need_kwh = besoin de chauffage (>0). Refroidissement géré séparément."""
        if (monthly_needs_kwh and len(monthly_needs_kwh) == 12
                and t_ext_monthly_c and len(t_ext_monthly_c) == 12):
            total = sum(q for q in monthly_needs_kwh if q > 0)
            cop_sum = 0.0
            for q_m, t_e in zip(monthly_needs_kwh, t_ext_monthly_c):
                if q_m <= 0:
                    continue
                cop_m = self._bq_heat(t_e, 45.0)
                cop_sum += cop_m * q_m
            scop = cop_sum / total if total > 0 else self.cop_heat
        else:
            scop = self.cop_heat

        q_elec = q_need_kwh / scop if scop > 0 else 0.0
        return self._make_result(q_need_kwh, q_elec, scop)

    def compute_annual_cooling(
        self,
        q_cool_need_kwh: float,
        monthly_cool_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """Calcule les consommations pour le refroidissement seul."""
        if (monthly_cool_kwh and len(monthly_cool_kwh) == 12
                and t_ext_monthly_c and len(t_ext_monthly_c) == 12):
            total = sum(q for q in monthly_cool_kwh if q > 0)
            eer_sum = 0.0
            for q_m, t_e in zip(monthly_cool_kwh, t_ext_monthly_c):
                if q_m <= 0:
                    continue
                eer_m = self._bq_cool(t_e, 7.0)
                eer_sum += eer_m * q_m
            seer = eer_sum / total if total > 0 else self.eer_cool
        else:
            seer = self.eer_cool

        q_elec = q_cool_need_kwh / seer if seer > 0 else 0.0
        return self._make_result(q_cool_need_kwh, q_elec, seer)
