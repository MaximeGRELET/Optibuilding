"""
Calcul de la position solaire et de l'irradiance sur surfaces inclinées (POA).

Position solaire : algorithme de Spencer / NREL simplifié.
POA : modèle de diffus isotrope (Liu-Jordan) ou Hay-Davies.

Convention d'azimut (surfaces et soleil) :
    0° = Nord, 90° = Est, 180° = Sud, 270° = Ouest
"""

from __future__ import annotations
from dataclasses import dataclass

import numpy as np
import pandas as pd

from thermal_engine.climate.epw_models import EPWLocation, WeatherSeries


# ─────────────────────────────────────────────────────────────
# Résultats position solaire
# ─────────────────────────────────────────────────────────────

@dataclass
class SolarPosition:
    """Position du soleil pour chaque heure de l'année.

    Attributes
    ----------
    elevation_deg    : élévation solaire [°] au-dessus de l'horizon (> 0 = jour)
    azimuth_deg      : azimut solaire [°] — convention 0=N, 90=E, 180=S, 270=W
    zenith_deg       : angle zénithal [°] = 90 - élévation
    hour_angle_deg   : angle horaire solaire [°]
    declination_deg  : déclinaison solaire [°]
    """
    elevation_deg: np.ndarray     # (8760,)
    azimuth_deg: np.ndarray       # (8760,)
    zenith_deg: np.ndarray        # (8760,)
    hour_angle_deg: np.ndarray    # (8760,)
    declination_deg: np.ndarray   # (8760,)


@dataclass
class POAComponents:
    """Irradiance sur un plan incliné (Plane Of Array).

    Attributes
    ----------
    poa_direct_wh_m2        : composante directe (beam) [Wh/m²]
    poa_diffuse_sky_wh_m2   : diffus ciel [Wh/m²]
    poa_diffuse_ground_wh_m2: diffus sol réfléchi [Wh/m²]
    poa_total_wh_m2         : irradiance totale [Wh/m²]
    aoi_deg                 : angle d'incidence sur la surface [°]
    """
    poa_direct_wh_m2: np.ndarray          # (8760,)
    poa_diffuse_sky_wh_m2: np.ndarray     # (8760,)
    poa_diffuse_ground_wh_m2: np.ndarray  # (8760,)
    poa_total_wh_m2: np.ndarray           # (8760,)
    aoi_deg: np.ndarray                   # (8760,)


# ─────────────────────────────────────────────────────────────
# Position solaire
# ─────────────────────────────────────────────────────────────

def compute_solar_position(
    location: EPWLocation,
    timestamps: pd.DatetimeIndex,
) -> SolarPosition:
    """Calcule la position du soleil pour chaque heure.

    Algorithme : Spencer (1971) pour la déclinaison et l'équation du temps,
    standard astronomique pour l'angle horaire.

    Parameters
    ----------
    location   : localisation géographique de la station
    timestamps : index de dates (8 760 h)

    Returns
    -------
    SolarPosition avec arrays (8760,)
    """
    lat_rad = np.radians(location.latitude_deg)

    # ── Jour de l'année (1 à 365) ─────────────────────────────
    day_of_year = timestamps.day_of_year.to_numpy().astype(float)

    # ── Angle de position dans l'année [rad] ─────────────────
    B = 2.0 * np.pi * (day_of_year - 1.0) / 365.0

    # ── Déclinaison solaire [°] — Spencer ─────────────────────
    decl_deg = (
        180.0 / np.pi * (
            0.006918
            - 0.399912 * np.cos(B)
            + 0.070257 * np.sin(B)
            - 0.006758 * np.cos(2 * B)
            + 0.000907 * np.sin(2 * B)
            - 0.002697 * np.cos(3 * B)
            + 0.00148  * np.sin(3 * B)
        )
    )
    decl_rad = np.radians(decl_deg)

    # ── Équation du temps [min] — Spencer ────────────────────
    eot_min = (
        229.18 * (
            0.000075
            + 0.001868 * np.cos(B)
            - 0.032077 * np.sin(B)
            - 0.014615 * np.cos(2 * B)
            - 0.04089  * np.sin(2 * B)
        )
    )

    # ── Temps solaire vrai [h] ────────────────────────────────
    # TSV = heure locale + EoT [h] + (lon - 15*tz) / 15
    hour_local = timestamps.hour.to_numpy().astype(float) - 0.5  # milieu de l'heure
    lon_correction = (location.longitude_deg - 15.0 * location.timezone_offset) / 15.0
    true_solar_time = hour_local + eot_min / 60.0 + lon_correction

    # ── Angle horaire solaire [°] ─────────────────────────────
    hour_angle_deg = 15.0 * (true_solar_time - 12.0)
    hour_angle_rad = np.radians(hour_angle_deg)

    # ── Élévation solaire [°] ─────────────────────────────────
    sin_elev = (
        np.sin(lat_rad) * np.sin(decl_rad)
        + np.cos(lat_rad) * np.cos(decl_rad) * np.cos(hour_angle_rad)
    )
    sin_elev = np.clip(sin_elev, -1.0, 1.0)
    elev_rad = np.arcsin(sin_elev)
    elev_deg = np.degrees(elev_rad)

    # ── Azimut solaire [°] — convention 0=N, 90=E, 180=S ─────
    cos_az = np.where(
        np.cos(elev_rad) > 1e-6,
        (np.sin(decl_rad) - np.sin(lat_rad) * sin_elev) / (np.cos(lat_rad) * np.cos(elev_rad)),
        0.0,
    )
    cos_az = np.clip(cos_az, -1.0, 1.0)
    az_rad = np.arccos(cos_az)  # [0, π] — 0=N direction côté matin

    # Correction côté après-midi (angle horaire > 0 → Ouest)
    az_deg = np.where(hour_angle_deg > 0, 360.0 - np.degrees(az_rad), np.degrees(az_rad))

    return SolarPosition(
        elevation_deg=elev_deg,
        azimuth_deg=az_deg,
        zenith_deg=90.0 - elev_deg,
        hour_angle_deg=hour_angle_deg,
        declination_deg=decl_deg,
    )


# ─────────────────────────────────────────────────────────────
# Irradiance sur surface inclinée (POA)
# ─────────────────────────────────────────────────────────────

def compute_poa_irradiance(
    solar_pos: SolarPosition,
    weather: WeatherSeries,
    tilt_deg: float,
    azimuth_deg: float,
    ground_reflectance: float = 0.20,
    use_haydavies: bool = True,
) -> POAComponents:
    """Calcule l'irradiance sur un plan incliné (POA).

    Parameters
    ----------
    solar_pos         : position solaire précalculée
    weather           : données météo (GHI, DHI, DNI)
    tilt_deg          : inclinaison de la surface [°] — 0=horizontal, 90=vertical
    azimuth_deg       : azimut de la surface [°] — 0=N, 90=E, 180=S, 270=W
    ground_reflectance: albédo du sol (défaut 0,20)
    use_haydavies     : utiliser le modèle Hay-Davies pour le diffus (sinon isotrope)

    Returns
    -------
    POAComponents
    """
    beta = np.radians(tilt_deg)
    surf_az_rad = np.radians(azimuth_deg)
    sun_az_rad = np.radians(solar_pos.azimuth_deg)
    sun_elev_rad = np.radians(solar_pos.elevation_deg)
    sun_zen_rad = np.radians(solar_pos.zenith_deg)

    # ── Angle d'incidence (AOI) ────────────────────────────────
    # cos(AOI) = cos(β)·sin(elev) + sin(β)·cos(elev)·cos(az_sun - az_surf)
    az_rel = sun_az_rad - surf_az_rad
    cos_aoi = (
        np.cos(beta) * np.sin(sun_elev_rad)
        + np.sin(beta) * np.cos(sun_elev_rad) * np.cos(az_rel)
    )
    cos_aoi = np.clip(cos_aoi, 0.0, 1.0)

    # Masque nuit (soleil sous l'horizon)
    sun_up = solar_pos.elevation_deg > 0.0

    # ── Composante directe ─────────────────────────────────────
    poa_direct = np.where(sun_up, weather.dni_wh_m2 * cos_aoi, 0.0)
    poa_direct = np.maximum(0.0, poa_direct)

    # ── Composante diffuse ciel ────────────────────────────────
    f_sky = (1.0 + np.cos(beta)) / 2.0  # facteur de vue ciel

    if use_haydavies:
        # Modèle Hay-Davies : fraction anisotrope
        # Rayonnement extraterrestre horizontal [Wh/m²]
        day_of_year = weather.timestamps.day_of_year.to_numpy().astype(float)
        I0 = 1361.0 * (1.0 + 0.033 * np.cos(2 * np.pi * day_of_year / 365.0))
        cos_zen = np.cos(sun_zen_rad)
        I0_h = np.where(sun_up, I0 * np.maximum(cos_zen, 0.087), 87.0)  # évite /0

        Rb = np.where(sun_up & (cos_aoi > 0), cos_aoi / np.maximum(cos_zen, 0.087), 0.0)
        f_aniso = np.where(I0_h > 0, weather.dni_wh_m2 / np.maximum(I0_h, 1.0), 0.0)
        f_aniso = np.clip(f_aniso, 0.0, 1.0)
        poa_diff_sky = weather.dhi_wh_m2 * (f_aniso * Rb + (1.0 - f_aniso) * f_sky)
    else:
        # Modèle isotrope (Liu-Jordan)
        poa_diff_sky = weather.dhi_wh_m2 * f_sky

    poa_diff_sky = np.maximum(0.0, poa_diff_sky)

    # ── Réflexion sol ─────────────────────────────────────────
    f_ground = (1.0 - np.cos(beta)) / 2.0
    poa_diff_ground = np.maximum(0.0, weather.ghi_wh_m2 * ground_reflectance * f_ground)

    poa_total = poa_direct + poa_diff_sky + poa_diff_ground
    aoi_deg = np.degrees(np.arccos(np.clip(cos_aoi, 0.0, 1.0)))

    return POAComponents(
        poa_direct_wh_m2=poa_direct,
        poa_diffuse_sky_wh_m2=poa_diff_sky,
        poa_diffuse_ground_wh_m2=poa_diff_ground,
        poa_total_wh_m2=poa_total,
        aoi_deg=aoi_deg,
    )


def precompute_poa_by_orientation(
    weather: WeatherSeries,
    orientations: list[tuple[float, float]],  # [(tilt, azimuth), ...]
) -> dict[tuple[float, float], np.ndarray]:
    """Précalcule les POA totaux [Wh/m²] pour un ensemble d'orientations.

    Optimisation : factorisation solaire hors de la boucle de simulation.

    Parameters
    ----------
    weather       : données météo
    orientations  : liste de (tilt_deg, azimuth_deg) uniques

    Returns
    -------
    dict {(tilt, azimuth): poa_total_wh_m2 (8760,)}
    """
    solar_pos = compute_solar_position(weather.location, weather.timestamps)
    result: dict[tuple[float, float], np.ndarray] = {}
    for tilt, az in orientations:
        poa = compute_poa_irradiance(solar_pos, weather, tilt, az)
        result[(tilt, az)] = poa.poa_total_wh_m2
    return result
