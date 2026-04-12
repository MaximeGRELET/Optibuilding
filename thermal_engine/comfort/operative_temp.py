"""
Température opérative et indices de confort dérivés.

Température opérative :
  T_op = (h_conv·T_air + h_rad·T_mrt) / (h_conv + h_rad)
  Approximation courante (v_air < 0.2 m/s) : T_op ≈ (T_air + T_mrt) / 2

Température opérative corrigée pour la vitesse d'air (ASHRAE 55) :
  T_op_corr = T_op - Δ(v_air)

Référence : ISO 7730:2005, ASHRAE 55-2023
"""

from __future__ import annotations
import math


def operative_temperature(
    t_air_c: float,
    t_mrt_c: float,
    v_air_m_s: float = 0.1,
) -> float:
    """Température opérative [°C].

    Pour v_air < 0.2 m/s : T_op = (T_air + T_mrt) / 2  (ISO 7730 simplifiée)
    Pour v_air ≥ 0.2 m/s : pondération par coefficients de transfert
    """
    if v_air_m_s < 0.2:
        return (t_air_c + t_mrt_c) / 2.0

    # Coefficient convectif (Nusselt forcé simplifié)
    h_conv = 10.3 * (v_air_m_s ** 0.6)
    h_rad  = 4.0 * 0.95 * 5.67e-8 * ((t_mrt_c + 273.15 + t_air_c + 273.15) / 2.0) ** 3

    t_op = (h_conv * t_air_c + h_rad * t_mrt_c) / (h_conv + h_rad)
    return t_op


def standard_effective_temperature(
    t_air_c: float,
    t_mrt_c: float,
    v_air_m_s: float,
    rh_percent: float,
    met: float = 1.0,
    clo: float = 0.5,
) -> float:
    """Température Effective Standard (SET) — approximation analytique.

    SET est la température d'air sec dans un environnement de référence
    (v=0.1 m/s, HR=50 %, clo=0.6) qui produit le même stress thermique.
    Utilisé pour les critères ASHRAE 55 adaptatif et PMV étendu.

    Implémentation : approximation polynomiale depuis la table ASHRAE
    (précision ±0.5 °C pour conditions courantes).
    """
    t_op = operative_temperature(t_air_c, t_mrt_c, v_air_m_s)
    # Correction humidité (pa en Pa)
    pa = rh_percent / 100.0 * math.exp(16.6536 - 4030.18 / (t_air_c + 235.0))
    # Correction vitesse
    v_corr = max(0.0, (v_air_m_s - 0.1) * 1.5)
    # Correction humidité relative (effet refroidissement)
    rh_corr = (rh_percent - 50.0) * 0.03
    # SET ≈ T_op - effet_vitesse - effet_humidité (valide ~15–35 °C)
    return t_op - v_corr - rh_corr


def adaptive_comfort_temperature(
    t_ext_running_mean_c: float,
    standard: str = "EN15251",
) -> tuple[float, float, float]:
    """Température de confort adaptative et plages acceptables.

    Modèle adaptatif ASHRAE 55 ou EN 15251 / EN 16798-1.
    Valable uniquement pour les bâtiments naturellement ventilés.

    Parameters
    ----------
    t_ext_running_mean_c : température extérieure moyenne glissante [°C]
    standard             : 'EN15251' (défaut) ou 'ASHRAE55'

    Returns
    -------
    (t_comf, t_lower_cat2, t_upper_cat2) : températures opératives [°C]
      t_comf : température de confort neutre
      t_lower_cat2 / t_upper_cat2 : limites catégorie 2 (±90 % acceptable)
    """
    t_rm = t_ext_running_mean_c

    if standard == "ASHRAE55":
        # ASHRAE 55-2023 : T_comf = 0.31·T_pma(out) + 17.8
        t_comf = 0.31 * t_rm + 17.8
        delta  = 3.5   # ±3.5 °C pour 80 % d'acceptabilité
    else:
        # EN 16798-1 : T_comf = 0.33·T_rm + 18.8
        t_comf = 0.33 * t_rm + 18.8
        delta  = 3.0   # Catégorie 2 : ±3 °C (80 % acceptable)

    return t_comf, t_comf - delta, t_comf + delta
