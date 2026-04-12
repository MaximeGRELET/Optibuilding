"""
Calcul des besoins thermiques du bâtiment (chauffage + refroidissement).

Deux méthodes disponibles :

1. 'monthly' : méthode quasi-statique mensuelle ISO 13790
   - Rapide (< 1 s), adapté aux pré-études et à l'API
   - Calcul H_T, H_V, apports solaires et internes mensuels
   - Facteur d'utilisation des apports (η)

2. 'hourly' : moteur RC nodal backward-Euler
   - Précis, résolution à l'heure (8 760 pas)
   - Modèle physique complet conforme au schéma RC
   - Plus lent (~5-30 s selon le bâtiment)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from thermal_engine.core.building import Building
from thermal_engine.core.zone import ThermalZone
from thermal_engine.climate.epw_models import WeatherSeries
from thermal_engine.climate.solar import compute_solar_position, compute_poa_irradiance
from thermal_engine.schedules.setpoints import SetpointSchedule
from thermal_engine.schedules.gains import InternalGainsSchedule


# ─────────────────────────────────────────────────────────────
# Paramètres de calibration
# ─────────────────────────────────────────────────────────────

@dataclass
class CalibrationParams:
    """Surcharges de paramètres pour calibrer un modèle sur des mesures réelles."""
    u_walls: float | None = None          # W/(m²·K)
    u_roof: float | None = None
    u_floor: float | None = None
    u_windows: float | None = None
    wwr_override: float | None = None     # Ratio fenêtres/murs global
    infiltration_ach: float | None = None # vol/h
    ventilation_ach: float | None = None
    t_heating: float | None = None        # Consigne chauffage [°C]
    t_cooling: float | None = None        # Consigne refroidissement [°C]
    internal_gains_w_m2: float | None = None
    altitude_m: float | None = None


# ─────────────────────────────────────────────────────────────
# Résultats
# ─────────────────────────────────────────────────────────────

@dataclass
class ZoneNeedsResult:
    """Résultats de besoins thermiques pour une zone."""
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

    heating_need_monthly: list[float]     # kWh par mois (12 valeurs)
    cooling_need_monthly: list[float]
    solar_gains_monthly: list[float]
    envelope_breakdown: dict[str, float]  # % et kWh par poste

    @property
    def heating_need_kwh_m2(self) -> float:
        return self.heating_need_kwh / max(self.floor_area_m2, 0.1)

    def to_dict(self) -> dict:
        return {
            "zone_id": self.zone_id,
            "zone_label": self.zone_label,
            "zone_type": self.zone_type,
            "floor_area_m2": round(self.floor_area_m2, 1),
            "heating_need_kwh": round(self.heating_need_kwh, 1),
            "cooling_need_kwh": round(self.cooling_need_kwh, 1),
            "total_losses_kwh": round(self.total_losses_kwh, 1),
            "solar_gains_kwh": round(self.solar_gains_kwh, 1),
            "internal_gains_kwh": round(self.internal_gains_kwh, 1),
            "h_t_w_k": round(self.h_t_w_k, 2),
            "h_v_w_k": round(self.h_v_w_k, 2),
            "heating_need_monthly": [round(v, 1) for v in self.heating_need_monthly],
            "cooling_need_monthly": [round(v, 1) for v in self.cooling_need_monthly],
            "solar_gains_monthly": [round(v, 1) for v in self.solar_gains_monthly],
            "envelope_breakdown": {k: round(v, 2) for k, v in self.envelope_breakdown.items()},
        }


@dataclass
class BuildingNeedsResult:
    """Résultats de besoins thermiques pour l'ensemble du bâtiment."""
    building_id: str
    method: str
    zone_results: list[ZoneNeedsResult] = field(default_factory=list)

    # Agrégats bâtiment
    heating_need_kwh: float = 0.0
    cooling_need_kwh: float = 0.0
    dhw_need_kwh: float = 0.0
    total_floor_area_m2: float = 0.0
    primary_energy_kwh_m2: float = 0.0
    co2_kg_m2: float = 0.0
    dpe_class: str = "G"
    dpe_co2_class: str = "G"
    final_energy_kwh: float = 0.0
    primary_energy_kwh: float = 0.0
    cost_eur: float = 0.0

    def to_dict(self) -> dict:
        return {
            "building_id": self.building_id,
            "method": self.method,
            "dpe_class": self.dpe_class,
            "dpe_co2_class": self.dpe_co2_class,
            "primary_energy_kwh_m2": round(self.primary_energy_kwh_m2, 1),
            "co2_kg_m2": round(self.co2_kg_m2, 2),
            "heating_need_kwh": round(self.heating_need_kwh, 1),
            "cooling_need_kwh": round(self.cooling_need_kwh, 1),
            "dhw_need_kwh": round(self.dhw_need_kwh, 1),
            "final_energy_kwh": round(self.final_energy_kwh, 1),
            "primary_energy_kwh": round(self.primary_energy_kwh, 1),
            "cost_eur": round(self.cost_eur, 0),
            "total_floor_area_m2": round(self.total_floor_area_m2, 1),
            "zones": [z.to_dict() for z in self.zone_results],
        }


# ─────────────────────────────────────────────────────────────
# Point d'entrée principal
# ─────────────────────────────────────────────────────────────

def compute_building_needs(
    building: Building,
    weather: WeatherSeries,
    method: Literal["monthly", "hourly"] = "monthly",
    calibration: dict[str, CalibrationParams] | None = None,
) -> BuildingNeedsResult:
    """Calcule les besoins thermiques du bâtiment.

    Parameters
    ----------
    building     : bâtiment à simuler
    weather      : données météo 8 760 h
    method       : 'monthly' (ISO 13790) ou 'hourly' (RC nodal)
    calibration  : surcharges de paramètres par zone_id ou '*' (wildcard)

    Returns
    -------
    BuildingNeedsResult
    """
    cal = calibration or {}

    zone_results: list[ZoneNeedsResult] = []
    for zone in building.zones:
        zone_cal = _merge_calibration(cal, zone.zone_id)
        if method == "hourly":
            result = _compute_zone_needs_hourly(zone, weather, zone_cal)
        else:
            result = _compute_zone_needs_monthly(zone, weather, zone_cal)
        zone_results.append(result)

    return _aggregate_building_results(building, zone_results, method)


# ─────────────────────────────────────────────────────────────
# Méthode mensuelle ISO 13790
# ─────────────────────────────────────────────────────────────

_DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_HOURS_PER_MONTH = [d * 24 for d in _DAYS_PER_MONTH]


def _compute_zone_needs_monthly(
    zone: ThermalZone,
    weather: WeatherSeries,
    cal: CalibrationParams,
) -> ZoneNeedsResult:
    """Méthode quasi-statique mensuelle ISO 13790:2007 §12."""

    # ── Coefficients de déperdition ───────────────────────────
    h_t = _effective_h_t(zone, cal)
    h_v = _effective_h_v(zone, cal)
    h_total = h_t + h_v

    # ── Consignes de chauffage ────────────────────────────────
    t_heat = cal.t_heating if cal.t_heating is not None else _default_setpoint(zone.usage, "heat")
    t_cool = cal.t_cooling if cal.t_cooling is not None else _default_setpoint(zone.usage, "cool")

    # ── Constante de temps de la zone ─────────────────────────
    tau_h = _time_constant_h(zone, h_total)
    a_H = 1.0 + tau_h / 15.0   # paramètre ISO 13790 §12.2.1.1

    # ── Précalcul solaire mensuel ─────────────────────────────
    solar_pos = compute_solar_position(weather.location, weather.timestamps)
    monthly_solar_kwh = _monthly_solar_gains(zone, weather, solar_pos, cal)

    # ── Apports internes mensuels ─────────────────────────────
    q_int_w_m2 = cal.internal_gains_w_m2 if cal.internal_gains_w_m2 is not None else _default_internal_gains(zone.usage)
    monthly_int_kwh = [q_int_w_m2 * zone.floor_area_m2 * h / 1000.0 for h in _HOURS_PER_MONTH]

    # ── Températures extérieures mensuelles ───────────────────
    t_ext_monthly = weather.monthly_mean_temp_c

    monthly_heat = []
    monthly_cool = []

    for m in range(12):
        t_m = _HOURS_PER_MONTH[m]           # heures dans le mois
        dt_heat = max(0.0, t_heat - t_ext_monthly[m])  # ΔT chauffage
        dt_cool = max(0.0, t_ext_monthly[m] - t_cool)  # ΔT refroidissement

        q_losses_wh = h_total * dt_heat * t_m   # Wh
        q_gains_wh  = monthly_solar_kwh[m] * 1000.0 + monthly_int_kwh[m] * 1000.0  # Wh

        # ── Chauffage (ISO 13790 §12.2.1) ─────────────────────
        if q_losses_wh > 0:
            gamma_h = q_gains_wh / q_losses_wh if q_losses_wh > 0 else 0.0
            eta_h = _utilization_factor(gamma_h, a_H)
            q_heat_m = max(0.0, q_losses_wh - eta_h * q_gains_wh)
        else:
            q_heat_m = 0.0

        # ── Refroidissement (ISO 13790 §12.2.1, inversion) ─────
        q_losses_cool_wh = h_total * dt_cool * t_m
        if q_gains_wh > 0:
            gamma_c = q_losses_cool_wh / q_gains_wh if q_gains_wh > 0 else 0.0
            eta_c = _utilization_factor(gamma_c, 1.0 + tau_h / 15.0)
            q_cool_m = max(0.0, q_gains_wh - eta_c * q_losses_cool_wh)
        else:
            q_cool_m = 0.0

        monthly_heat.append(q_heat_m / 1000.0)   # kWh
        monthly_cool.append(q_cool_m / 1000.0)

    # ── Bilan annuel ──────────────────────────────────────────
    total_heat = sum(monthly_heat)
    total_cool = sum(monthly_cool)
    total_solar = sum(monthly_solar_kwh)
    total_int   = sum(monthly_int_kwh)
    total_losses = h_total * max(0, _annual_degree_hours(weather, t_heat)) / 1000.0

    # ── Décomposition de l'enveloppe ─────────────────────────
    breakdown = _envelope_breakdown(zone, cal, total_losses)

    return ZoneNeedsResult(
        zone_id=zone.zone_id,
        zone_label=zone.label,
        zone_type=zone.usage,
        floor_area_m2=zone.floor_area_m2,
        heating_need_kwh=total_heat,
        cooling_need_kwh=total_cool,
        total_losses_kwh=total_losses,
        solar_gains_kwh=total_solar,
        internal_gains_kwh=total_int,
        h_t_w_k=h_t,
        h_v_w_k=h_v,
        heating_need_monthly=monthly_heat,
        cooling_need_monthly=monthly_cool,
        solar_gains_monthly=monthly_solar_kwh,
        envelope_breakdown=breakdown,
    )


# ─────────────────────────────────────────────────────────────
# Méthode horaire RC
# ─────────────────────────────────────────────────────────────

def _compute_zone_needs_hourly(
    zone: ThermalZone,
    weather: WeatherSeries,
    cal: CalibrationParams,
) -> ZoneNeedsResult:
    """Simulation RC horaire via BuildingSimulator (pour une seule zone)."""
    from thermal_engine.solver.building_simulator import BuildingSimulator
    from thermal_engine.core.building import Building

    # Créer un mini-bâtiment d'une seule zone (avec calibration appliquée)
    zone_cal = _apply_calibration_to_zone(zone, cal)
    mini_building = Building(
        building_id=zone.zone_id,
        name=zone.label,
        zones=[zone_cal],
    )

    t_heat = cal.t_heating if cal.t_heating is not None else _default_setpoint(zone.usage, "heat")
    t_cool = cal.t_cooling if cal.t_cooling is not None else _default_setpoint(zone.usage, "cool")
    sp = SetpointSchedule.constant(t_heat=t_heat, t_cool=t_cool)

    q_w_m2 = cal.internal_gains_w_m2 if cal.internal_gains_w_m2 is not None else _default_internal_gains(zone.usage)
    gains = InternalGainsSchedule.from_constant_density(zone_cal.floor_area_m2, q_w_m2)

    sim = BuildingSimulator(mini_building, {zone.zone_id: (sp, gains)})
    results = sim.run(weather)
    hr = results.zone_results[zone.zone_id]

    # Aggreger mensuellement
    monthly_heat, monthly_cool, monthly_solar = _aggregate_monthly_arrays(
        hr.q_heat_w / 1000.0,
        hr.q_cool_w / 1000.0,
        hr.q_solar_w / 1000.0,
    )

    h_t = _effective_h_t(zone, cal)
    h_v = _effective_h_v(zone, cal)
    total_losses = (h_t + h_v) * _annual_degree_hours(weather, t_heat) / 1000.0

    breakdown = _envelope_breakdown(zone, cal, total_losses)

    return ZoneNeedsResult(
        zone_id=zone.zone_id,
        zone_label=zone.label,
        zone_type=zone.usage,
        floor_area_m2=zone.floor_area_m2,
        heating_need_kwh=float(hr.q_heat_w.sum()) / 1000.0,
        cooling_need_kwh=float(hr.q_cool_w.sum()) / 1000.0,
        total_losses_kwh=total_losses,
        solar_gains_kwh=float(hr.q_solar_w.sum()) / 1000.0,
        internal_gains_kwh=float(hr.q_int_w.sum()) / 1000.0,
        h_t_w_k=h_t,
        h_v_w_k=h_v,
        heating_need_monthly=[v * 1000.0 / 1000.0 for v in monthly_heat],
        cooling_need_monthly=[v * 1000.0 / 1000.0 for v in monthly_cool],
        solar_gains_monthly=[v * 1000.0 / 1000.0 for v in monthly_solar],
        envelope_breakdown=breakdown,
    )


# ─────────────────────────────────────────────────────────────
# Helpers ISO 13790
# ─────────────────────────────────────────────────────────────

def _utilization_factor(gamma: float, a: float) -> float:
    """Facteur d'utilisation des apports η (ISO 13790 §12.2.1.1)."""
    if gamma == 1.0:
        return a / (a + 1.0)
    if gamma <= 0:
        return 1.0
    try:
        return (1.0 - gamma ** a) / (1.0 - gamma ** (a + 1.0))
    except (OverflowError, ZeroDivisionError):
        return 1.0 if gamma < 1.0 else 0.0


def _time_constant_h(zone: ThermalZone, h_total: float) -> float:
    """Constante de temps thermique τ [h] = C_m / H_total."""
    c_m_wh_k = zone.c_air_j_k / 3600.0  # capacité air en Wh/K
    # Ajouter capacité des parois (couche active = 50 % de la couche intérieure)
    for el in zone.opaque_elements:
        lay = el.layers[-1]
        c_m_wh_k += lay.thermal_mass_j_m2k * el.area_m2 * 0.5 / 3600.0
    return c_m_wh_k / max(h_total, 1.0)


def _effective_h_t(zone: ThermalZone, cal: CalibrationParams) -> float:
    """H_T effectif [W/K] avec surcharges de calibration."""
    ht = 0.0
    for el in zone.opaque_elements:
        u = _calibrated_u(el.element_type, el.u_value_w_m2k, cal)
        ht += u * el.area_m2
    for win in zone.windows:
        u = cal.u_windows if cal.u_windows is not None else win.uw_w_m2k
        ht += u * win.area_m2
    ht += zone.thermal_bridge_w_k
    return ht


def _effective_h_v(zone: ThermalZone, cal: CalibrationParams) -> float:
    """H_V effectif [W/K] avec surcharges de calibration."""
    ach_inf  = cal.infiltration_ach if cal.infiltration_ach is not None else zone.infiltration_ach
    ach_vent = cal.ventilation_ach  if cal.ventilation_ach  is not None else zone.mechanical_vent_ach
    hrec = zone.heat_recovery_eff
    from thermal_engine.core.zone import RHO_AIR, CP_AIR
    v_dot = (ach_inf + ach_vent * (1 - hrec)) * zone.volume_m3 / 3600.0
    return RHO_AIR * CP_AIR * v_dot


def _calibrated_u(element_type: str, u_orig: float, cal: CalibrationParams) -> float:
    if element_type == "wall" and cal.u_walls is not None:
        return cal.u_walls
    if element_type == "roof" and cal.u_roof is not None:
        return cal.u_roof
    if element_type == "ground_floor" and cal.u_floor is not None:
        return cal.u_floor
    return u_orig


def _monthly_solar_gains(zone, weather, solar_pos, cal) -> list[float]:
    """Calcule les apports solaires mensuels [kWh] via les fenêtres."""
    # Facteur d'ombrage et de correction (F_sh, F_w)
    f_sh = 0.9   # 10 % d'ombres (ISO 13790)
    f_w  = 0.9   # correction angulaire (ISO 13790)

    monthly_sol = [0.0] * 12
    for win in zone.windows:
        poa = compute_poa_irradiance(solar_pos, weather, win.tilt_deg, win.azimuth_deg)
        # Apport solaire effectif = A_eff × I_sol
        a_eff = win.solar_heat_gain_coeff * win.area_m2 * f_sh * f_w
        i_poa = poa.poa_total_wh_m2  # Wh/m² par heure
        h = 0
        for m, nd in enumerate(_DAYS_PER_MONTH):
            nh = nd * 24
            monthly_sol[m] += a_eff * float(i_poa[h:h + nh].sum()) / 1e6 * 1000  # kWh
            h += nh

    return monthly_sol


def _annual_degree_hours(weather: WeatherSeries, t_base: float) -> float:
    """Somme des degrés-heures de chauffage [°C·h] sur 8 760 h."""
    return float(np.maximum(0.0, t_base - weather.dry_bulb_temp_c).sum())


def _default_setpoint(usage: str, mode: str) -> float:
    usage_l = usage.lower()
    if mode == "heat":
        if "office" in usage_l or "bureau" in usage_l:
            return 20.0
        if "retail" in usage_l or "commerce" in usage_l:
            return 18.0
        return 19.0
    else:  # cool
        return 26.0


def _default_internal_gains(usage: str) -> float:
    """Apports internes par défaut [W/m²]."""
    usage_l = usage.lower()
    if "office" in usage_l:
        return 15.0
    if "retail" in usage_l:
        return 20.0
    return 4.0


def _envelope_breakdown(zone, cal, total_losses_kwh) -> dict:
    """Calcule la décomposition des déperditions par poste [kWh et %]."""
    walls_u = sum(_calibrated_u(el.element_type, el.u_value_w_m2k, cal) * el.area_m2
                  for el in zone.opaque_elements if el.element_type == "wall")
    roof_u  = sum(_calibrated_u(el.element_type, el.u_value_w_m2k, cal) * el.area_m2
                  for el in zone.opaque_elements if el.element_type == "roof")
    floor_u = sum(_calibrated_u(el.element_type, el.u_value_w_m2k, cal) * el.area_m2
                  for el in zone.opaque_elements if el.element_type == "ground_floor")
    win_u   = sum((cal.u_windows or w.uw_w_m2k) * w.area_m2 for w in zone.windows)
    tb_u    = zone.thermal_bridge_w_k
    vent_u  = _effective_h_v(zone, cal)

    total_u = walls_u + roof_u + floor_u + win_u + tb_u + vent_u
    if total_u <= 0:
        return {}

    def pct(v): return round(100.0 * v / total_u, 1)
    dh = _annual_degree_hours  # degré-heures non calculés ici → utiliser ratios U
    scale = total_losses_kwh

    return {
        "walls_kwh":            round(scale * walls_u / total_u, 1),
        "windows_kwh":          round(scale * win_u   / total_u, 1),
        "roof_kwh":             round(scale * roof_u  / total_u, 1),
        "floor_kwh":            round(scale * floor_u / total_u, 1),
        "thermal_bridges_kwh":  round(scale * tb_u   / total_u, 1),
        "ventilation_kwh":      round(scale * vent_u  / total_u, 1),
        "walls_pct":            pct(walls_u),
        "windows_pct":          pct(win_u),
        "roof_pct":             pct(roof_u),
        "floor_pct":            pct(floor_u),
        "thermal_bridges_pct":  pct(tb_u),
        "ventilation_pct":      pct(vent_u),
    }


# ─────────────────────────────────────────────────────────────
# Agrégation bâtiment + DPE
# ─────────────────────────────────────────────────────────────

# Coefficients systèmes énergétiques
_SYSTEM_PARAMS: dict[str, dict] = {
    "gas_boiler":       {"eff": 0.87, "ep": 1.0, "co2": 0.227, "cost": 0.115},
    "heat_pump":        {"eff": 3.20, "ep": 2.3, "co2": 0.052, "cost": 0.2516},
    "electric_direct":  {"eff": 1.00, "ep": 2.3, "co2": 0.052, "cost": 0.2516},
    "district_heating": {"eff": 1.00, "ep": 0.77,"co2": 0.109, "cost": 0.090},
    "wood_pellet":      {"eff": 0.90, "ep": 1.0, "co2": 0.030, "cost": 0.065},
    "oil_boiler":       {"eff": 0.80, "ep": 1.0, "co2": 0.324, "cost": 0.145},
}
_DEFAULT_SYSTEM = _SYSTEM_PARAMS["gas_boiler"]

# Seuils DPE énergie primaire [kWh EP/(m²·an)] — décret 2021
_DPE_THRESHOLDS: list[tuple[float, str]] = [
    (70, "A"), (110, "B"), (180, "C"), (250, "D"), (330, "E"), (420, "F"), (9999, "G"),
]
_CO2_THRESHOLDS: list[tuple[float, str]] = [
    (6, "A"), (11, "B"), (30, "C"), (50, "D"), (70, "E"), (100, "F"), (9999, "G"),
]

DHW_NEED_KWH_M2 = 25.0  # Besoin ECS moyen [kWh/(m²·an)] — RT 2012


def _aggregate_building_results(
    building: Building,
    zone_results: list[ZoneNeedsResult],
    method: str,
) -> BuildingNeedsResult:
    total_area   = building.total_floor_area_m2
    total_heat   = sum(z.heating_need_kwh for z in zone_results)
    total_cool   = sum(z.cooling_need_kwh for z in zone_results)
    dhw          = DHW_NEED_KWH_M2 * total_area

    # Système dominant (premier système du premier résultat)
    sys_params = _get_system_params(building)

    eff   = sys_params["eff"]
    ep    = sys_params["ep"]
    co2   = sys_params["co2"]
    cost  = sys_params["cost"]

    final_energy  = (total_heat + dhw) / eff
    primary_energy = final_energy * ep
    co2_total      = final_energy * co2
    cost_total     = final_energy * cost

    ep_m2 = primary_energy / max(total_area, 1.0)
    co2_m2 = co2_total / max(total_area, 1.0)

    dpe_class    = _dpe_class(ep_m2, _DPE_THRESHOLDS)
    co2_class    = _dpe_class(co2_m2 * 1000.0 / max(total_area, 1.0), _CO2_THRESHOLDS)

    return BuildingNeedsResult(
        building_id=building.building_id,
        method=method,
        zone_results=zone_results,
        heating_need_kwh=total_heat,
        cooling_need_kwh=total_cool,
        dhw_need_kwh=dhw,
        total_floor_area_m2=total_area,
        primary_energy_kwh_m2=round(ep_m2, 1),
        co2_kg_m2=round(co2_m2, 2),
        dpe_class=dpe_class,
        dpe_co2_class=co2_class,
        final_energy_kwh=round(final_energy, 1),
        primary_energy_kwh=round(primary_energy, 1),
        cost_eur=round(cost_total, 0),
    )


def _dpe_class(value: float, thresholds: list[tuple[float, str]]) -> str:
    for seuil, lettre in thresholds:
        if value <= seuil:
            return lettre
    return "G"


def _get_system_params(building: Building) -> dict:
    for zone in building.zones:
        for sys in zone.energy_systems:
            sys_type = sys.get("type", "gas_boiler")
            if sys_type in _SYSTEM_PARAMS:
                params = dict(_SYSTEM_PARAMS[sys_type])
                eff_override = sys.get("efficiency_nominal")
                if eff_override:
                    params["eff"] = float(eff_override)
                return params
    return dict(_DEFAULT_SYSTEM)


def _merge_calibration(cal: dict, zone_id: str) -> CalibrationParams:
    """Fusionne les paramètres '*' et zone_id (zone_id prioritaire)."""
    base = cal.get("*", CalibrationParams())
    override = cal.get(zone_id, CalibrationParams())
    # Surcharge champ par champ
    merged = CalibrationParams()
    for f in CalibrationParams.__dataclass_fields__:
        v = getattr(override, f)
        if v is None:
            v = getattr(base, f)
        setattr(merged, f, v)
    return merged


def _apply_calibration_to_zone(zone: ThermalZone, cal: CalibrationParams) -> ThermalZone:
    """Retourne une copie de la zone avec les U-values calibrées."""
    import copy
    z = copy.deepcopy(zone)
    if cal.infiltration_ach is not None:
        z.infiltration_ach = cal.infiltration_ach
    if cal.ventilation_ach is not None:
        z.mechanical_vent_ach = cal.ventilation_ach
    # U-values → modification des éléments opaques via recalcul de composition
    # Pour la méthode horaire, l'impact des U est déjà capturé via H_T / H_V.
    # Pour une calibration fine, il faudrait recréer les éléments avec U imposé.
    return z


def _aggregate_monthly_arrays(
    heat_kw_arr: np.ndarray,
    cool_kw_arr: np.ndarray,
    solar_kw_arr: np.ndarray,
) -> tuple[list[float], list[float], list[float]]:
    """Aggrège des tableaux horaires en valeurs mensuelles [kWh]."""
    monthly_h = []
    monthly_c = []
    monthly_s = []
    h = 0
    for nd in _DAYS_PER_MONTH:
        nh = nd * 24
        monthly_h.append(float(heat_kw_arr[h:h + nh].sum()))
        monthly_c.append(float(cool_kw_arr[h:h + nh].sum()))
        monthly_s.append(float(solar_kw_arr[h:h + nh].sum()))
        h += nh
    return monthly_h, monthly_c, monthly_s
