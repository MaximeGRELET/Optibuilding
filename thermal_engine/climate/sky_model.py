"""
Modèles de température de ciel et rayonnement grande longueur d'onde (GLO).

Références :
- Clark & Allen (1978) pour T_sky
- Berdahl & Martin (1984) pour la correction nébulosité
- Stefan-Boltzmann pour le flux GLO descendant
"""

from __future__ import annotations
import numpy as np

# Constante de Stefan-Boltzmann [W/(m²·K⁴)]
SIGMA: float = 5.670374419e-8


def sky_temperature_c(
    dry_bulb_c: np.ndarray,
    dew_point_c: np.ndarray,
    opaque_sky_cover_tenths: np.ndarray | None = None,
) -> np.ndarray:
    """Température radiative du ciel [°C].

    Modèle Clark-Allen :
        ε_sky_clear = 0.787 + 0.764·ln(T_dp / 273.15)
        T_sky = T_db·ε_sky^0.25  (en K)

    Correction Berdahl-Martin pour nébulosité (facultatif) :
        ε_sky = ε_clear · (1 + 0.0224·N - 0.0035·N² + 0.00028·N³)
        où N = couverture nuageuse [0–10 dixièmes]

    Parameters
    ----------
    dry_bulb_c : température sèche [°C]  shape (n,)
    dew_point_c : température de rosée [°C]  shape (n,)
    opaque_sky_cover_tenths : couverture nuageuse opaque [0–10]  shape (n,), optionnel

    Returns
    -------
    t_sky_c : np.ndarray  shape (n,)  [°C]
    """
    t_db_k = dry_bulb_c + 273.15
    t_dp_k = np.clip(dew_point_c + 273.15, 220.0, t_db_k)

    # Emissivité de ciel clair
    eps_clear = 0.787 + 0.764 * np.log(np.maximum(t_dp_k / 273.15, 0.01))
    eps_clear = np.clip(eps_clear, 0.5, 1.0)

    # Correction nébulosité
    if opaque_sky_cover_tenths is not None:
        n = np.clip(opaque_sky_cover_tenths, 0.0, 10.0)
        eps_sky = eps_clear * (1.0 + 0.0224 * n - 0.0035 * n ** 2 + 0.00028 * n ** 3)
        eps_sky = np.clip(eps_sky, eps_clear, 1.0)
    else:
        eps_sky = eps_clear

    t_sky_k = t_db_k * eps_sky ** 0.25
    return t_sky_k - 273.15


def longwave_sky_irradiance_w_m2(t_sky_c: np.ndarray) -> np.ndarray:
    """Rayonnement grande longueur d'onde descendant du ciel [W/m²].

        L↓ = σ · T_sky⁴

    Parameters
    ----------
    t_sky_c : température de ciel [°C]  shape (n,)

    Returns
    -------
    L_down : np.ndarray  [W/m²]
    """
    return SIGMA * (t_sky_c + 273.15) ** 4


def sky_view_factor(tilt_deg: float) -> float:
    """Facteur de vue ciel pour une surface inclinée.

        F_sky = (1 + cos β) / 2
        F_ground = (1 − cos β) / 2

    Parameters
    ----------
    tilt_deg : inclinaison de la surface [°] — 0 = horizontal, 90 = vertical

    Returns
    -------
    f_sky : facteur de vue vers le ciel
    """
    beta = np.radians(tilt_deg)
    return float((1.0 + np.cos(beta)) / 2.0)


def linearized_radiation_coefficient_w_m2k(
    t_surface_c: float = 20.0,
    t_sky_c: float = 5.0,
    emissivity: float = 0.9,
) -> float:
    """Coefficient de rayonnement linéarisé h_r [W/(m²·K)].

    h_r = 4 · σ · ε · T_m³
    où T_m = (T_surf + T_sky) / 2  [K]

    Utilisé pour linéariser les échanges radiatifs dans la matrice RC.
    """
    t_m = (t_surface_c + t_sky_c) / 2.0 + 273.15
    return 4.0 * SIGMA * emissivity * t_m ** 3
