"""
Indicateurs de confort thermique annuels.

Calcule des métriques agrégées sur les 8760 heures d'occupation :
  - Heures d'inconfort PMV (|PMV| > 0.5 → hors catégorie B)
  - Degrés-heures d'inconfort (chaud et froid)
  - PMV moyen pondéré par l'occupation
  - PPD moyen
  - Température opérative moyenne / min / max
  - ASHRAE 55 : heures hors plage adaptative (bâtiments ventilés nat.)

Référence : EN 15251, ISO 7730, ASHRAE 55-2023
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np

from thermal_engine.comfort.pmv_ppd import (
    ThermalComfortInputs, compute_pmv_ppd,
)
from thermal_engine.comfort.operative_temp import (
    operative_temperature,
)


# ─────────────────────────────────────────────────────────────
# Résultat de confort
# ─────────────────────────────────────────────────────────────

@dataclass
class ComfortResult:
    """Résultats de confort thermique annuels pour une zone.

    Attributes
    ----------
    pmv_hourly          : série PMV horaire (8760 valeurs)
    ppd_hourly          : série PPD horaire [%] (8760 valeurs)
    t_op_hourly         : température opérative horaire [°C] (8760)
    occupied_hours      : masque booléen des heures d'occupation

    Indicateurs agrégés (heures d'occupation uniquement) :
    pmv_mean            : PMV moyen pondéré occupation
    ppd_mean            : PPD moyen [%]
    hours_discomfort_b  : heures hors catégorie B (|PMV|>0.5) [h]
    hours_too_hot       : heures PMV > 1.0 [h]
    hours_too_cold      : heures PMV < -1.0 [h]
    degree_hours_heat   : degrés-heures inconfort chaud (T_op - T_lim_sup) [°C·h]
    degree_hours_cool   : degrés-heures inconfort froid (T_lim_inf - T_op) [°C·h]
    t_op_mean_c         : température opérative moyenne [°C]
    t_op_max_c          : température opérative max [°C]
    t_op_min_c          : température opérative min [°C]
    """
    pmv_hourly: np.ndarray
    ppd_hourly: np.ndarray
    t_op_hourly: np.ndarray
    occupied_hours: np.ndarray

    # Agrégats (calculés dans __post_init__)
    pmv_mean: float = field(init=False)
    ppd_mean: float = field(init=False)
    hours_discomfort_b: float = field(init=False)
    hours_too_hot: float = field(init=False)
    hours_too_cold: float = field(init=False)
    degree_hours_heat: float = field(init=False)
    degree_hours_cool: float = field(init=False)
    t_op_mean_c: float = field(init=False)
    t_op_max_c: float = field(init=False)
    t_op_min_c: float = field(init=False)

    # Limites de température opérative catégorie B (EN 15251)
    T_OP_MAX_B: float = field(default=26.0, init=False, repr=False)
    T_OP_MIN_B: float = field(default=20.0, init=False, repr=False)

    def __post_init__(self) -> None:
        occ = self.occupied_hours.astype(bool)
        n_occ = occ.sum()

        if n_occ == 0:
            self.pmv_mean = 0.0
            self.ppd_mean = 5.0
            self.hours_discomfort_b = 0.0
            self.hours_too_hot = 0.0
            self.hours_too_cold = 0.0
            self.degree_hours_heat = 0.0
            self.degree_hours_cool = 0.0
            self.t_op_mean_c = 20.0
            self.t_op_max_c = 20.0
            self.t_op_min_c = 20.0
            return

        pmv_occ = self.pmv_hourly[occ]
        ppd_occ = self.ppd_hourly[occ]
        t_op_occ = self.t_op_hourly[occ]

        self.pmv_mean  = float(np.mean(pmv_occ))
        self.ppd_mean  = float(np.mean(ppd_occ))
        self.hours_discomfort_b = float(np.sum(np.abs(pmv_occ) > 0.5))
        self.hours_too_hot  = float(np.sum(pmv_occ > 1.0))
        self.hours_too_cold = float(np.sum(pmv_occ < -1.0))

        # Degrés-heures inconfort thermique (basé sur T_op catégorie B)
        self.degree_hours_heat = float(
            np.sum(np.maximum(0.0, t_op_occ - self.T_OP_MAX_B))
        )
        self.degree_hours_cool = float(
            np.sum(np.maximum(0.0, self.T_OP_MIN_B - t_op_occ))
        )
        self.t_op_mean_c = float(np.mean(t_op_occ))
        self.t_op_max_c  = float(np.max(t_op_occ))
        self.t_op_min_c  = float(np.min(t_op_occ))

    def to_dict(self) -> dict:
        """Résumé des indicateurs (sans les séries horaires)."""
        return {
            "pmv_mean": round(self.pmv_mean, 3),
            "ppd_mean_pct": round(self.ppd_mean, 1),
            "hours_discomfort_cat_b": round(self.hours_discomfort_b, 0),
            "hours_too_hot": round(self.hours_too_hot, 0),
            "hours_too_cold": round(self.hours_too_cold, 0),
            "degree_hours_heat": round(self.degree_hours_heat, 1),
            "degree_hours_cool": round(self.degree_hours_cool, 1),
            "t_op_mean_c": round(self.t_op_mean_c, 1),
            "t_op_max_c": round(self.t_op_max_c, 1),
            "t_op_min_c": round(self.t_op_min_c, 1),
        }


# ─────────────────────────────────────────────────────────────
# Calcul des indicateurs de confort sur 8760 h
# ─────────────────────────────────────────────────────────────

def compute_comfort_indicators(
    t_air_series: np.ndarray,      # [°C] shape (8760,)
    t_mrt_series: np.ndarray,      # [°C] shape (8760,)
    v_air_m_s: float = 0.1,
    rh_series: np.ndarray | None = None,   # [%] optionnel
    met: float = 1.2,
    clo_summer: float = 0.5,
    clo_winter: float = 1.0,
    occupied_hours: np.ndarray | None = None,  # masque booléen (8760,)
) -> ComfortResult:
    """Calcule PMV/PPD et température opérative sur toute l'année.

    Parameters
    ----------
    t_air_series   : température de l'air [°C] par heure
    t_mrt_series   : température radiante moyenne [°C] par heure
    v_air_m_s      : vitesse d'air moyenne [m/s] (constante)
    rh_series      : humidité relative [%] (défaut 50 % si None)
    met            : activité métabolique [met]
    clo_summer     : isolation vestimentaire été (mai–sept) [clo]
    clo_winter     : isolation vestimentaire hiver [clo]
    occupied_hours : masque heures d'occupation (True = occupé)
                     Si None : toutes les heures sont occupées.

    Returns
    -------
    ComfortResult
    """
    n = 8760
    if len(t_air_series) != n or len(t_mrt_series) != n:
        raise ValueError("Les séries doivent comporter 8760 valeurs")

    rh = rh_series if rh_series is not None else np.full(n, 50.0)
    occ = occupied_hours if occupied_hours is not None else np.ones(n, dtype=bool)

    pmv_arr  = np.zeros(n)
    ppd_arr  = np.zeros(n)
    t_op_arr = np.zeros(n)

    # Déterminer les mois pour l'adaptation vestimentaire
    # Heure → mois (0-based) : mois k commence à heure 24*sum(days[:k])
    DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    month_of_hour = np.zeros(n, dtype=int)
    h = 0
    for m, d in enumerate(DAYS_PER_MONTH):
        month_of_hour[h:h + d * 24] = m
        h += d * 24

    SUMMER_MONTHS = {4, 5, 6, 7, 8}  # mai–sept (0-based)

    for i in range(n):
        clo = clo_summer if month_of_hour[i] in SUMMER_MONTHS else clo_winter
        inp = ThermalComfortInputs(
            t_air_c=float(t_air_series[i]),
            t_mrt_c=float(t_mrt_series[i]),
            v_air_m_s=v_air_m_s,
            rh_percent=float(rh[i]),
            met=met,
            clo=clo,
        )
        pmv_arr[i], ppd_arr[i] = compute_pmv_ppd(inp)
        t_op_arr[i] = operative_temperature(
            float(t_air_series[i]),
            float(t_mrt_series[i]),
            v_air_m_s,
        )

    return ComfortResult(
        pmv_hourly=pmv_arr,
        ppd_hourly=ppd_arr,
        t_op_hourly=t_op_arr,
        occupied_hours=occ.astype(float),
    )
