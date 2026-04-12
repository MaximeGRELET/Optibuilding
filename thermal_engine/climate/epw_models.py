"""
Modèles de données météorologiques.

EPWLocation : localisation géographique de la station.
WeatherSeries : série temporelle horaire (8 760 h) des variables climatiques.
"""

from __future__ import annotations
from dataclasses import dataclass, field

import numpy as np
import pandas as pd


# ─────────────────────────────────────────────────────────────
# Localisation
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class EPWLocation:
    """Coordonnées et métadonnées d'une station météo (format EPW)."""
    city: str
    state_province: str
    country: str
    source: str                  # "EPW" | "synthetic"
    wmo_station_id: str
    latitude_deg: float          # °N (positif = Nord)
    longitude_deg: float         # °E (positif = Est)
    timezone_offset: float       # UTC offset [h]
    elevation_m: float           # Altitude [m ASL]


# ─────────────────────────────────────────────────────────────
# Série météo horaire
# ─────────────────────────────────────────────────────────────

@dataclass
class WeatherSeries:
    """Série climatique horaire annuelle (8 760 timesteps d'une heure).

    Toutes les grandeurs radiatives sont en Wh/m² par heure (= W/m² moyenné).
    Les températures sont en °C.

    Attributes
    ----------
    location              : métadonnées géographiques
    dry_bulb_temp_c       : température sèche [°C]
    dew_point_temp_c      : température de rosée [°C]
    relative_humidity     : humidité relative [%]
    atmospheric_pressure_pa : pression atmosphérique [Pa]
    ghi_wh_m2             : rayonnement global horizontal (GHI) [Wh/m²]
    dhi_wh_m2             : rayonnement diffus horizontal (DHI) [Wh/m²]
    dni_wh_m2             : rayonnement direct normal (DNI) [Wh/m²]
    wind_speed_m_s        : vitesse du vent [m/s]
    wind_direction_deg    : direction du vent [° depuis le Nord]
    timestamps            : index de dates (DatetimeIndex, 8 760 éléments)
    """
    location: EPWLocation
    dry_bulb_temp_c: np.ndarray          # (8760,)
    dew_point_temp_c: np.ndarray         # (8760,)
    relative_humidity: np.ndarray        # (8760,)
    atmospheric_pressure_pa: np.ndarray  # (8760,)
    ghi_wh_m2: np.ndarray               # (8760,)
    dhi_wh_m2: np.ndarray               # (8760,)
    dni_wh_m2: np.ndarray               # (8760,)
    wind_speed_m_s: np.ndarray          # (8760,)
    wind_direction_deg: np.ndarray      # (8760,)
    timestamps: pd.DatetimeIndex        # (8760,)

    # ── Propriétés dérivées ───────────────────────────────────

    def heating_degree_days(self, base_c: float = 18.0) -> float:
        """Degrés-jours de chauffage (base T_base) [°C·j]."""
        daily_mean = self.dry_bulb_temp_c.reshape(365, 24).mean(axis=1)
        return float(np.maximum(0.0, base_c - daily_mean).sum())

    def cooling_degree_days(self, base_c: float = 26.0) -> float:
        """Degrés-jours de refroidissement [°C·j]."""
        daily_mean = self.dry_bulb_temp_c.reshape(365, 24).mean(axis=1)
        return float(np.maximum(0.0, daily_mean - base_c).sum())

    @property
    def t_ground_c(self) -> np.ndarray:
        """Température du sol [°C] — approximation Kusuda-Achenbach simplifiée.

        T_ground(h) ≈ T_mean - A·cos(2π(h - h_min)/8760)
        où A = demi-amplitude des variations mensuelles, h_min = heure du min annuel.
        """
        t = self.dry_bulb_temp_c
        t_mean = float(t.mean())
        monthly_means = np.array([
            t[i * 730:(i + 1) * 730].mean() for i in range(12)
        ])
        amplitude = (monthly_means.max() - monthly_means.min()) / 2.0
        h_min = int(np.argmin(monthly_means)) * 730 + 365  # centre du mois le plus froid
        h = np.arange(8760, dtype=float)
        return t_mean - amplitude * np.cos(2.0 * np.pi * (h - h_min) / 8760.0)

    @property
    def monthly_ghi_kwh_m2(self) -> np.ndarray:
        """GHI mensuel total [kWh/m²]. Shape (12,)."""
        days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        out = np.zeros(12)
        h = 0
        for m, nd in enumerate(days_per_month):
            nh = nd * 24
            out[m] = self.ghi_wh_m2[h:h + nh].sum() / 1000.0
            h += nh
        return out

    @property
    def monthly_mean_temp_c(self) -> np.ndarray:
        """Température extérieure mensuelle moyenne [°C]. Shape (12,)."""
        days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        out = np.zeros(12)
        h = 0
        for m, nd in enumerate(days_per_month):
            nh = nd * 24
            out[m] = self.dry_bulb_temp_c[h:h + nh].mean()
            h += nh
        return out
