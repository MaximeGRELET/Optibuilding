"""
Confort thermique PMV/PPD — ISO 7730:2005 (Fanger).

PMV (Predicted Mean Vote) : -3 (très froid) à +3 (très chaud)
PPD (Predicted Percentage Dissatisfied) : 0–100 %

Équation de Fanger :
  PMV = (0.303·exp(-0.036·M) + 0.028) · L

où L est la charge thermique du corps (W) :
  L = M - W - H_conv - H_rad - E_sw - E_res - C_res

Résolution itérative pour la température de surface du vêtement (T_cl).

Référence : ISO 7730:2005 Annexe C, ASHRAE 55-2023
"""

from __future__ import annotations
import math
from dataclasses import dataclass


# ─────────────────────────────────────────────────────────────
# Constantes physiques
# ─────────────────────────────────────────────────────────────

STEFAN_BOLTZMANN = 5.67e-8   # W/(m²·K⁴)
BODY_AREA_DU_BOIS = 1.8      # m² — surface corporelle standard (De Bois)


# ─────────────────────────────────────────────────────────────
# Données d'entrée PMV
# ─────────────────────────────────────────────────────────────

@dataclass
class ThermalComfortInputs:
    """Paramètres d'entrée pour le calcul PMV/PPD.

    Attributes
    ----------
    t_air_c       : température de l'air [°C]
    t_mrt_c       : température radiante moyenne [°C]
    v_air_m_s     : vitesse relative de l'air [m/s]
    rh_percent    : humidité relative [%]
    met           : activité métabolique [met] — 1 met = 58.15 W/m²
    clo           : isolation vestimentaire [clo] — 1 clo = 0.155 m²·K/W
    """
    t_air_c: float
    t_mrt_c: float
    v_air_m_s: float = 0.1
    rh_percent: float = 50.0
    met: float = 1.2          # bureau assis (1.0), debout léger (1.2)
    clo: float = 1.0          # tenue d'intérieur standard hiver


# ─────────────────────────────────────────────────────────────
# Calcul PMV
# ─────────────────────────────────────────────────────────────

def compute_pmv(inp: ThermalComfortInputs) -> float:
    """Calcule le PMV selon ISO 7730:2005 Annexe C.

    Returns
    -------
    pmv : float dans [-3, +3] (clampé)
    """
    ta  = inp.t_air_c
    tr  = inp.t_mrt_c
    vr  = max(0.0, inp.v_air_m_s)
    rh  = inp.rh_percent
    met = inp.met
    clo = inp.clo

    # ── Conversions ───────────────────────────────────────────
    M   = met * 58.15           # W/m²  métabolisme
    W   = 0.0                   # W/m²  travail mécanique extérieur (0 pour occupants)
    Icl = clo * 0.155           # m²K/W isolation vêtements
    # ISO 7730:2005 Eq.(6) : fcl en fonction de Icl [m²K/W], pas de clo !
    fcl = (1.0 + 1.29 * Icl) if Icl <= 0.078 else (1.05 + 0.645 * Icl)

    # ── Pression vapeur partielle [Pa] ────────────────────────
    # ISO 7730:2005 Eq.(9) : pa [Pa] = rh [%] × 10 × exp(16.6536 - 4030.18/(ta+235))
    pa = rh * 10.0 * math.exp(16.6536 - 4030.18 / (ta + 235.0))

    # ── Température de surface du vêtement (algorithme ISO 7730 rescalé) ──
    # xn = (tcl + 273.15)/100 — évite les dépassements sur T^4.
    # Référence : ISO 7730:2005 Annexe C.
    ta_k  = ta + 273.15
    tr_k  = tr + 273.15

    # Constantes pré-calculées
    p1 = Icl * fcl
    p2 = p1 * 3.96
    p3 = p1 * 100.0
    p4 = p1 * ta_k
    p5 = 308.7 - 0.028 * (M - W) + p2 * (tr_k / 100.0) ** 4

    # ISO 7730:2005 §C.1 : hc selon vitesse de l'air
    # Pour var < 0.2 m/s → convection naturelle seule (pas de terme forcé)
    # Pour var ≥ 0.2 m/s → hc = max(12.1√v, 2.38·ΔT^0.25)
    USE_FORCED = vr >= 0.2
    hcf = 12.1 * math.sqrt(vr) if USE_FORCED else 0.0

    # Estimation initiale
    tcl_init = ta_k + (35.5 - ta) / (3.5 * Icl + 0.1)
    xn = tcl_init / 100.0
    xf = xn * 0.9

    for _ in range(200):
        xf = (xf + xn) / 2.0
        hcn = 2.38 * abs(100.0 * xf - ta_k) ** 0.25
        hc  = max(hcf, hcn)
        xn_new = (p5 + p4 * hc - p2 * xf ** 4) / (100.0 + p3 * hc)
        if abs(xn_new - xf) < 1e-6:
            xn = xn_new
            break
        xn = xn_new

    hcn_final = 2.38 * abs(100.0 * xn - ta_k) ** 0.25
    hc = max(hcf, hcn_final)
    tcl_k = 100.0 * xn
    tcl   = tcl_k - 273.15

    # ── Charge thermique L [W/m²] ──────────────────────────────
    HL3 = 3.96 * fcl * (xn ** 4 - (tr_k / 100.0) ** 4)   # rayonnement
    HL4 = fcl * hc * (tcl - ta)                             # convection

    # Pertes latentes : sudation, respiration
    HL1 = 3.05e-3 * (5733.0 - 6.99 * (M - W) - pa)   # diffusion cutanée
    HL2 = max(0.0, 0.42 * ((M - W) - 58.15))          # sudation thermorégulée
    HL5 = 1.7e-5 * M * (5867.0 - pa)                  # respiration latente
    HL6 = 0.0014 * M * (34.0 - ta)                    # respiration sensible

    # Charge nette (bilan thermique du corps)
    L = (M - W) - HL1 - HL2 - HL3 - HL4 - HL5 - HL6

    # ── PMV ───────────────────────────────────────────────────
    pmv = (0.303 * math.exp(-0.036 * M) + 0.028) * L
    return max(-3.0, min(3.0, pmv))


def compute_ppd(pmv: float) -> float:
    """Calcule le PPD depuis le PMV selon ISO 7730.

    PPD = 100 - 95·exp(-(0.03353·PMV⁴ + 0.2179·PMV²))

    Returns
    -------
    ppd : [%] dans [5, 100]
    """
    ppd = 100.0 - 95.0 * math.exp(-(0.03353 * pmv ** 4 + 0.2179 * pmv ** 2))
    return max(5.0, min(100.0, ppd))


def compute_pmv_ppd(inp: ThermalComfortInputs) -> tuple[float, float]:
    """Retourne (PMV, PPD) pour les conditions données."""
    pmv = compute_pmv(inp)
    ppd = compute_ppd(pmv)
    return pmv, ppd
