"""
Assemblage des matrices RC pour une zone thermique.

Construit les matrices C (capacité) et K (conductance) du système :

    C · dT/dt = K · T + f(t)

Convention de la matrice K :
  K[i,j] > 0  →  conductance entre les nœuds i et j (hors-diagonale)
  K[i,i] < 0  →  somme des conductances sortantes (conservation de l'énergie)

Le vecteur d'état T est indexé selon ZoneIndexMap (voir build_index_map).

Structure du vecteur d'état :
  [0]           → Tair
  [1]           → Tmr (température rayonnante moyenne)
  [2..2+2n_w-1] → par fenêtre : Twin_ext, Twin_int
  [après win]   → par élément opaque : couches 0..k-1 (ext→int)
  [après env]   → par masse interne : Tim1 (surface), Tim2 (noyau)
"""

from __future__ import annotations
from dataclasses import dataclass, field

import numpy as np

from thermal_engine.core.zone import ThermalZone
from thermal_engine.core.envelope import OpaqueElement, WindowElement, InternalMass


# ─────────────────────────────────────────────────────────────
# Carte d'index du vecteur d'état
# ─────────────────────────────────────────────────────────────

IDX_TAIR = 0
IDX_TMR  = 1

# Capacité fictive attribuée au nœud Tmr [J/K]
# Tmr est quasi-statique (pas de masse physique) mais la matrice doit rester
# définie positive. Cette valeur est ~100× plus petite que la capacité air.
C_TMR_FICTIF_J_K = 2000.0


@dataclass
class ZoneIndexMap:
    """Correspondance nom_nœud → indice dans le vecteur d'état.

    Attributes
    ----------
    n           : taille totale du vecteur d'état
    idx_windows : {element_id: (idx_ext, idx_int)}
    idx_envelope: {element_id: [idx_layer_0, ..., idx_layer_k-1]}
    idx_masses  : {mass_id: (idx_tim1, idx_tim2)}
    """
    n: int
    idx_windows:  dict[str, tuple[int, int]]
    idx_envelope: dict[str, list[int]]
    idx_masses:   dict[str, tuple[int, int]]


def build_index_map(zone: ThermalZone) -> ZoneIndexMap:
    """Construit la carte d'index pour une zone."""
    idx_windows:  dict[str, tuple[int, int]] = {}
    idx_envelope: dict[str, list[int]]       = {}
    idx_masses:   dict[str, tuple[int, int]] = {}

    cursor = 2  # 0=Tair, 1=Tmr

    for win in zone.windows:
        idx_windows[win.element_id] = (cursor, cursor + 1)
        cursor += 2

    for el in zone.opaque_elements:
        idx_envelope[el.element_id] = list(range(cursor, cursor + el.n_nodes))
        cursor += el.n_nodes

    for mass in zone.internal_masses:
        idx_masses[mass.mass_id] = (cursor, cursor + 1)
        cursor += 2

    return ZoneIndexMap(n=cursor, idx_windows=idx_windows,
                        idx_envelope=idx_envelope, idx_masses=idx_masses)


# ─────────────────────────────────────────────────────────────
# Assembleur
# ─────────────────────────────────────────────────────────────

def assemble_zone_matrices(
    zone: ThermalZone,
    idx_map: ZoneIndexMap | None = None,
) -> tuple[np.ndarray, np.ndarray, ZoneIndexMap]:
    """Assemble les matrices C et K pour la zone.

    Parameters
    ----------
    zone    : zone thermique à modéliser
    idx_map : carte d'index préalablement calculée (optionnel)

    Returns
    -------
    C       : vecteur diagonal des capacités [J/K]  shape (n,)
    K       : matrice de conductances [W/K]          shape (n, n)
    idx_map : carte d'index utilisée
    """
    if idx_map is None:
        idx_map = build_index_map(zone)

    n = idx_map.n
    C = np.zeros(n)
    K = np.zeros((n, n))

    # ── Nœud Tair ─────────────────────────────────────────────
    C[IDX_TAIR] = zone.c_air_j_k

    # ── Nœud Tmr (capacité fictive) ────────────────────────────
    C[IDX_TMR] = C_TMR_FICTIF_J_K

    # ── Ventilation + infiltration (Tair → Text) ───────────────
    # Terme diagonal uniquement — la contribution de Text va dans f(t)
    g_vent = zone.g_vent_effective_w_k
    K[IDX_TAIR, IDX_TAIR] -= g_vent

    # ── Ponts thermiques (Tair → Text) ────────────────────────
    K[IDX_TAIR, IDX_TAIR] -= zone.thermal_bridge_w_k

    # ── Fenêtres ───────────────────────────────────────────────
    for win in zone.windows:
        _add_window(C, K, idx_map, win)

    # ── Éléments opaques ──────────────────────────────────────
    for el in zone.opaque_elements:
        _add_opaque_element(C, K, idx_map, el)

    # ── Masses internes ───────────────────────────────────────
    for mass in zone.internal_masses:
        _add_internal_mass(C, K, idx_map, mass)

    return C, K, idx_map


# ─────────────────────────────────────────────────────────────
# Helpers : ajout de conductance symétrique
# ─────────────────────────────────────────────────────────────

def _couple(K: np.ndarray, i: int, j: int, G: float) -> None:
    """Ajoute une conductance symétrique G [W/K] entre les nœuds i et j."""
    K[i, i] -= G
    K[j, j] -= G
    K[i, j] += G
    K[j, i] += G


# ─────────────────────────────────────────────────────────────
# Fenêtres (2 nœuds RC : Twin_ext, Twin_int)
# ─────────────────────────────────────────────────────────────

def _add_window(
    C: np.ndarray,
    K: np.ndarray,
    idx: ZoneIndexMap,
    win: WindowElement,
) -> None:
    i_ext, i_int = idx.idx_windows[win.element_id]
    A_g = win.area_glazing_m2

    # Capacités
    C[i_ext] = win.cap_ext_j_k
    C[i_int] = win.cap_int_j_k

    # Conductance entre les deux nœuds vitrage (U × A)
    _couple(K, i_ext, i_int, win.g_inter_w_k)

    # Nœud externe ↔ extérieur (Text et Tsky) — contribue au vecteur f
    # Terme diagonal seulement (la source de chaleur Text va dans f)
    g_ext = win.h_ext_w_m2k * A_g
    K[i_ext, i_ext] -= g_ext

    # Nœud interne ↔ Tair (convection)
    g_int_conv = win.h_int_conv_w_m2k * A_g
    _couple(K, i_int, IDX_TAIR, g_int_conv)

    # Nœud interne ↔ Tmr (rayonnement)
    g_int_rad = win.h_int_rad_w_m2k * A_g
    _couple(K, i_int, IDX_TMR, g_int_rad)


# ─────────────────────────────────────────────────────────────
# Éléments opaques (1 nœud par couche)
# ─────────────────────────────────────────────────────────────

def _add_opaque_element(
    C: np.ndarray,
    K: np.ndarray,
    idx: ZoneIndexMap,
    el: OpaqueElement,
) -> None:
    A = el.area_m2
    indices = idx.idx_envelope[el.element_id]
    layers = el.layers

    # ── Capacités (1 par couche) ──────────────────────────────
    for layer, i in zip(layers, indices):
        C[i] = layer.thermal_mass_j_m2k * A

    # ── Conductances inter-couches ────────────────────────────
    # Entre couche j et couche j+1 : G = A / (R_j/2 + R_{j+1}/2)
    for j in range(len(layers) - 1):
        r_half_j   = layers[j].resistance_m2k_w / 2.0
        r_half_jp1 = layers[j + 1].resistance_m2k_w / 2.0
        G_inter = A / (r_half_j + r_half_jp1)
        _couple(K, indices[j], indices[j + 1], G_inter)

    # ── Surface extérieure (nœud 0) ───────────────────────────
    # G_ext = A / (Rse + R_0/2)  →  couplage diagonal (Text dans f)
    r_half_ext = layers[0].resistance_m2k_w / 2.0
    g_ext = A / (el.rse_m2k_w + r_half_ext)
    K[indices[0], indices[0]] -= g_ext
    # Note : pour les planchers sur sol, le terme de forçage utilisera Tground au lieu de Text.
    # Cela est géré dans le vecteur de forçage f, pas dans K.

    # ── Surface intérieure (dernier nœud) ─────────────────────
    i_int = indices[-1]
    r_half_int = layers[-1].resistance_m2k_w / 2.0

    # Convection → Tair
    g_si_conv = A * el.h_int_conv_w_m2k / (1.0 + el.h_int_conv_w_m2k * r_half_int)
    _couple(K, i_int, IDX_TAIR, g_si_conv)

    # Rayonnement → Tmr
    g_si_rad = A * el.h_int_rad_w_m2k / (1.0 + el.h_int_rad_w_m2k * r_half_int)
    _couple(K, i_int, IDX_TMR, g_si_rad)


# ─────────────────────────────────────────────────────────────
# Masses internes (2 nœuds RC : Tim1, Tim2)
# ─────────────────────────────────────────────────────────────

def _add_internal_mass(
    C: np.ndarray,
    K: np.ndarray,
    idx: ZoneIndexMap,
    mass: InternalMass,
) -> None:
    i_tim1, i_tim2 = idx.idx_masses[mass.mass_id]

    # Capacités
    C[i_tim1] = mass.cap_surface_j_k
    C[i_tim2] = mass.cap_core_j_k

    # Tim1 ↔ Tim2 (conduction)
    _couple(K, i_tim1, i_tim2, mass.g_surface_core_w_k)

    # Tim1 ↔ Tair (convection)
    _couple(K, i_tim1, IDX_TAIR, mass.h_conv_w_m2k * mass.area_m2)

    # Tim1 ↔ Tmr (rayonnement)
    _couple(K, i_tim1, IDX_TMR, mass.h_rad_w_m2k * mass.area_m2)
