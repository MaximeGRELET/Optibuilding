"""
Capteurs solaires thermiques pour l'ECS.

Modèle de rendement EN 12975 / ISO 9806 :
  η = η0 - a1·(Tm - Text)/G - a2·(Tm - Text)²/G

où :
  η0    : rendement optique (facteur intercept)
  a1    : coefficient de pertes linéaire [W/(m²·K)]
  a2    : coefficient de pertes quadratique [W/(m²·K²)]
  Tm    : température moyenne du fluide caloporteur = (T_in + T_out) / 2 [°C]
  Text  : température extérieure [°C]
  G     : irradiance sur le plan du capteur [W/m²]

Modèle ballon de stockage (1 nœud simplifié) :
  C_tank · dT_tank/dt = Q_sol - Q_drawn - U_tank·A_tank·(T_tank - T_amb)

La fraction solaire (solar fraction) = Q_sol / Q_dhw_need.

Référence : EN 12975-2, EN 15316-4-3, TRNSYS Type 1b
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np


# ─────────────────────────────────────────────────────────────
# Résultat annuel ECS solaire
# ─────────────────────────────────────────────────────────────

@dataclass
class SolarThermalResult:
    """Résultats annuels d'un système ECS solaire thermique.

    Attributes
    ----------
    e_solar_kwh        : énergie solaire utile captée [kWh/an]
    e_backup_kwh       : énergie d'appoint nécessaire [kWh/an]
    e_dhw_need_kwh     : besoin ECS total [kWh/an]
    solar_fraction     : fraction solaire f = E_sol / E_dhw []
    collector_yield    : productivité capteur [kWh/m²·an]
    monthly_solar_kwh  : énergie solaire mensuelle [kWh × 12]
    monthly_fraction   : fraction solaire mensuelle [] × 12
    """
    e_solar_kwh: float
    e_backup_kwh: float
    e_dhw_need_kwh: float
    solar_fraction: float
    collector_yield: float
    monthly_solar_kwh: list[float]
    monthly_fraction: list[float]

    def to_dict(self) -> dict:
        return {
            "e_solar_kwh": round(self.e_solar_kwh, 1),
            "e_backup_kwh": round(self.e_backup_kwh, 1),
            "e_dhw_need_kwh": round(self.e_dhw_need_kwh, 1),
            "solar_fraction": round(self.solar_fraction, 3),
            "collector_yield_kwh_m2": round(self.collector_yield, 0),
            "monthly_solar_kwh": [round(v, 1) for v in self.monthly_solar_kwh],
            "monthly_fraction": [round(v, 3) for v in self.monthly_fraction],
        }


# ─────────────────────────────────────────────────────────────
# Capteur solaire thermique
# ─────────────────────────────────────────────────────────────

@dataclass
class SolarThermalCollector:
    """Capteur solaire thermique plan ou à tubes sous vide.

    Parameters
    ----------
    area_m2     : surface aperture [m²]
    eta0        : rendement optique (zéro perte) []
    a1          : coeff. perte linéaire [W/(m²·K)]
    a2          : coeff. perte quadratique [W/(m²·K²)]
    tilt_deg    : inclinaison [°]
    azimuth_deg : azimut [°] (S=180)

    Valeurs typiques :
      Capteur plan sélectif  : η0=0.80, a1=3.5, a2=0.015
      Tube sous vide (CPC)   : η0=0.72, a1=1.5, a2=0.005
    """
    area_m2: float
    eta0: float = 0.80
    a1: float = 3.5
    a2: float = 0.015
    tilt_deg: float = 45.0
    azimuth_deg: float = 180.0

    def efficiency(self, t_mean_c: float, t_ext_c: float, g_poa_w_m2: float) -> float:
        """Rendement instantané EN 12975.

        Returns 0 si G < 50 W/m² ou η < 0.
        """
        if g_poa_w_m2 < 50.0:
            return 0.0
        dt = t_mean_c - t_ext_c
        eta = self.eta0 - self.a1 * dt / g_poa_w_m2 - self.a2 * dt ** 2 / g_poa_w_m2
        return max(0.0, eta)

    def q_useful_w(self, t_mean_c: float, t_ext_c: float, g_poa_w_m2: float) -> float:
        """Puissance utile captée [W]."""
        return self.efficiency(t_mean_c, t_ext_c, g_poa_w_m2) * g_poa_w_m2 * self.area_m2


# ─────────────────────────────────────────────────────────────
# Ballon de stockage ECS
# ─────────────────────────────────────────────────────────────

@dataclass
class DHWStorageTank:
    """Ballon de stockage ECS solaire (modèle 1 nœud).

    Parameters
    ----------
    volume_l      : volume du ballon [L]
    t_set_c       : température de consigne [°C]
    t_cold_in_c   : température eau froide réseau [°C]
    u_loss_w_m2k  : pertes thermiques surfaciques [W/(m²·K)]
    """
    volume_l: float = 300.0
    t_set_c: float = 60.0
    t_cold_in_c: float = 15.0
    u_loss_w_m2k: float = 0.5

    # Capacité thermique du ballon [J/K]
    RHO_WATER = 1000.0   # kg/m³
    CP_WATER  = 4186.0   # J/(kg·K)

    @property
    def c_tank_j_k(self) -> float:
        return self.RHO_WATER * (self.volume_l / 1000.0) * self.CP_WATER

    @property
    def area_m2(self) -> float:
        """Surface latérale approximée d'un cylindre 2:1 (h=2D)."""
        v_m3 = self.volume_l / 1000.0
        import math
        r = (v_m3 / (2.0 * math.pi)) ** (1.0 / 3.0)
        return 2.0 * math.pi * r * (2.0 * r + r)  # 2πr(h+r) avec h=2r

    def loss_w(self, t_tank_c: float, t_amb_c: float) -> float:
        """Pertes thermiques vers l'ambiance [W]."""
        return self.u_loss_w_m2k * self.area_m2 * max(0.0, t_tank_c - t_amb_c)


# ─────────────────────────────────────────────────────────────
# Simulation annuelle ECS solaire
# ─────────────────────────────────────────────────────────────

def simulate_solar_thermal_annual(
    collector: SolarThermalCollector,
    tank: DHWStorageTank,
    g_poa_series_w_m2: np.ndarray,   # (8760,) irradiance POA [W/m²]
    t_ext_series_c: np.ndarray,       # (8760,) température ext [°C]
    q_dhw_need_kwh: float,            # besoin ECS annuel [kWh]
    monthly_dhw_profile: list[float] | None = None,  # répartition mensuelle (12 valeurs, somme=1)
    t_amb_tank_c: float = 15.0,       # température locale ballon (cave) [°C]
) -> SolarThermalResult:
    """Simule la production ECS solaire sur 8760 heures.

    Modèle backward-Euler sur le bilan du ballon :
      C_tank/Δt · (T_{n+1} - T_n) = Q_sol - Q_draw - Q_loss

    Si T_tank > T_set → trop-plein (capteur bridé, T_mean augmente).
    Si T_tank < T_cold_in → paradoxe (appoint assure T_set de toute façon).

    Parameters
    ----------
    collector            : capteur solaire
    tank                 : ballon de stockage
    g_poa_series_w_m2    : irradiance sur le plan du capteur [W/m²]
    t_ext_series_c       : température extérieure horaire [°C]
    q_dhw_need_kwh       : besoin ECS annuel [kWh]
    monthly_dhw_profile  : distribution mensuelle du besoin (12 valeurs normalisées)
                           Si None → uniforme.
    t_amb_tank_c         : température ambiante du local ballon [°C]

    Returns
    -------
    SolarThermalResult
    """
    n = 8760
    dt = 3600.0  # 1 heure [s]

    DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    # Profil mensuel du besoin ECS
    if monthly_dhw_profile and len(monthly_dhw_profile) == 12:
        total_p = sum(monthly_dhw_profile)
        profile = [p / total_p for p in monthly_dhw_profile]
    else:
        # Plus de besoin en hiver
        profile = [0.11, 0.10, 0.09, 0.08, 0.08, 0.07,
                   0.07, 0.07, 0.08, 0.08, 0.09, 0.08]
        s = sum(profile)
        profile = [p / s for p in profile]

    # Besoin horaire par mois [kWh/h]
    q_draw_hourly = np.zeros(n)
    h = 0
    for m, (d, frac) in enumerate(zip(DAYS, profile)):
        q_m = q_dhw_need_kwh * frac / (d * 24.0)
        q_draw_hourly[h:h + d * 24] = q_m
        h += d * 24

    # Simulation
    t_tank = tank.t_set_c  # état initial
    e_solar_series = np.zeros(n)
    e_backup_series = np.zeros(n)

    for i in range(n):
        t_ext = float(t_ext_series_c[i])
        g_poa = float(g_poa_series_w_m2[i])
        q_draw_h = float(q_draw_hourly[i]) * 3.6e6 / 3600.0  # kWh → W (puissance moy)

        # Température moyenne capteur ≈ (T_tank + T_set) / 2
        t_mean = (t_tank + tank.t_cold_in_c) / 2.0
        q_sol = collector.q_useful_w(t_mean, t_ext, g_poa)

        # Pertes ballon
        q_loss = tank.loss_w(t_tank, t_amb_tank_c)

        # Bilan thermique ballon (backward-Euler simplifié → Euler explicite 1 h)
        dq = (q_sol - q_draw_h - q_loss) * dt  # J
        t_tank_new = t_tank + dq / tank.c_tank_j_k

        # Limitation : T_tank ∈ [T_cold_in, T_set]
        if t_tank_new > tank.t_set_c:
            # Trop-plein : énergie stockée bridée
            e_stored_max = (tank.t_set_c - t_tank) * tank.c_tank_j_k / 3.6e6  # kWh
            q_sol_effective = max(0.0, q_draw_h + q_loss
                                  + e_stored_max * 3.6e6 / dt)
            t_tank_new = tank.t_set_c
        else:
            q_sol_effective = q_sol

        # Appoint : si T_tank < T_set après soutinage
        q_backup_h = 0.0
        if t_tank_new < tank.t_cold_in_c:
            t_tank_new = tank.t_cold_in_c

        # Calcul de l'énergie solaire utile et appoint [kWh]
        e_sol_h = q_sol_effective * dt / 3.6e6
        e_draw_h = q_draw_h * dt / 3.6e6

        # Appoint = ce que le solaire ne couvre pas
        e_solar_cov = min(e_sol_h, e_draw_h)
        e_backup_h  = max(0.0, e_draw_h - e_solar_cov)

        e_solar_series[i] = e_solar_cov
        e_backup_series[i] = e_backup_h
        t_tank = t_tank_new

    # Agrégation mensuelle
    monthly_solar = []
    monthly_frac  = []
    h = 0
    for m, d in enumerate(DAYS):
        e_sol_m  = float(e_solar_series[h:h + d * 24].sum())
        e_draw_m = float(q_draw_hourly[h:h + d * 24].sum())
        monthly_solar.append(e_sol_m)
        monthly_frac.append(e_sol_m / e_draw_m if e_draw_m > 0 else 0.0)
        h += d * 24

    e_solar_total = float(e_solar_series.sum())
    e_backup_total = float(e_backup_series.sum())

    return SolarThermalResult(
        e_solar_kwh=e_solar_total,
        e_backup_kwh=e_backup_total,
        e_dhw_need_kwh=q_dhw_need_kwh,
        solar_fraction=e_solar_total / q_dhw_need_kwh if q_dhw_need_kwh > 0 else 0.0,
        collector_yield=e_solar_total / collector.area_m2 if collector.area_m2 > 0 else 0.0,
        monthly_solar_kwh=monthly_solar,
        monthly_fraction=monthly_frac,
    )
