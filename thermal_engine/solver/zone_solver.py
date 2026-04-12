"""
Solveur horaire backward-Euler pour une zone thermique.

Principe de résolution :
    (C/Δt − K) · T_{n+1} = (C/Δt) · T_n + f_{n+1}

La matrice A = C/Δt − K est constante → factorisation LU préalable.

Mode HVAC idéal (calcul de besoins) :
    1. Résoudre librement → T_air_libre
    2. Si T_air_libre < T_sp_chaud → imposer T_air = T_sp_chaud
    3. Si T_air_libre > T_sp_froid → imposer T_air = T_sp_froid
    4. Back-compute Q_hvac depuis le bilan du nœud air

L'imposition de consigne utilise la méthode d'élimination de ligne.
"""

from __future__ import annotations
import numpy as np
from scipy.linalg import lu_factor, lu_solve

from thermal_engine.core.zone import ThermalZone
from thermal_engine.core.envelope import OpaqueElement, WindowElement
from thermal_engine.solver.rc_assembler import (
    ZoneIndexMap, IDX_TAIR, IDX_TMR,
    build_index_map, assemble_zone_matrices,
)

DT_S: float = 3600.0   # pas de temps = 1 heure [s]

# Fraction des apports solaires transmis vers Tmr (reste → Tair)
SOLAR_RAD_FRAC: float = 0.63   # ISO 13790 / ASHRAE 140


class ZoneSolver:
    """Solveur backward-Euler pour une zone thermique.

    L'assemblage matriciel et la factorisation LU sont réalisés une seule
    fois à l'initialisation. À chaque heure, on résout le système linéaire
    et on applique les consignes de température si nécessaire.

    Parameters
    ----------
    zone : zone thermique
    dt_s : pas de temps [s] (défaut 3 600 s = 1 heure)
    """

    def __init__(self, zone: ThermalZone, dt_s: float = DT_S) -> None:
        self.zone = zone
        self.dt = dt_s

        self.idx_map = build_index_map(zone)
        self.C, self.K, _ = assemble_zone_matrices(zone, self.idx_map)
        self.n = self.idx_map.n

        # Matrice système constante A = C/Δt − K
        self._A = np.diag(self.C / self.dt) - self.K
        self._lu_A, self._piv_A = lu_factor(self._A)

    # ── Initialisation de l'état ──────────────────────────────

    def initial_state(self, t_air_init: float = 18.0) -> np.ndarray:
        """Vecteur d'état initial uniforme [°C]."""
        return np.full(self.n, t_air_init)

    # ── Construction du vecteur de forçage f(t) ───────────────

    def build_forcing_vector(
        self,
        t_ext: float,         # Température extérieure [°C]
        t_sky: float,         # Température de ciel [°C]
        t_ground: float,      # Température du sol [°C]
        solar_poa: dict[str, float],    # {element_id: irradiance POA [W/m²]}
        solar_win: dict[str, float],    # {element_id: irradiance sur vitre [W/m²]}
        q_int_conv_w: float,  # Apports internes convectifs [W]
        q_int_rad_w: float,   # Apports internes radiatifs [W]
        q_hvac_conv_w: float = 0.0,  # Puissance HVAC convective injectée [W]
        q_hvac_rad_w: float = 0.0,   # Puissance HVAC radiative injectée [W]
    ) -> np.ndarray:
        """Construit le vecteur de forçage f(t) [W] pour l'heure courante.

        Les termes en T_ext, T_sky et T_ground ne font pas partie de la matrice K
        (T_ext est une frontière connue, pas un nœud du vecteur d'état).
        """
        zone = self.zone
        idx = self.idx_map
        f = np.zeros(self.n)

        # ── Ventilation + infiltration → Tair ─────────────────
        f[IDX_TAIR] += zone.g_vent_effective_w_k * t_ext

        # ── Ponts thermiques → Tair ───────────────────────────
        f[IDX_TAIR] += zone.thermal_bridge_w_k * t_ext

        # ── Apports internes ──────────────────────────────────
        f[IDX_TAIR] += q_int_conv_w
        f[IDX_TMR] += q_int_rad_w

        # ── HVAC injectée ─────────────────────────────────────
        f[IDX_TAIR] += q_hvac_conv_w
        f[IDX_TMR] += q_hvac_rad_w

        # ── Fenêtres ──────────────────────────────────────────
        for win in zone.windows:
            i_ext, i_int = idx.idx_windows[win.element_id]
            A_g = win.area_glazing_m2

            # Surface ext ← Text (convection + rayonnement combinés dans h_ext)
            f[i_ext] += win.h_ext_w_m2k * A_g * t_ext

            # Apport solaire absorbé par la vitre extérieure
            I_poa = solar_win.get(win.element_id, 0.0)
            f[i_ext] += win.absorptance_ext_pane * I_poa * A_g

            # Apport solaire transmis → zone (convectif + radiatif)
            q_sol_transmitted = win.solar_heat_gain_coeff * I_poa * win.area_m2
            f[IDX_TAIR] += q_sol_transmitted * (1.0 - SOLAR_RAD_FRAC)
            f[IDX_TMR]  += q_sol_transmitted * SOLAR_RAD_FRAC

        # ── Éléments opaques ──────────────────────────────────
        for el in zone.opaque_elements:
            indices = idx.idx_envelope[el.element_id]
            A = el.area_m2
            layers = el.layers

            r_half_ext = layers[0].resistance_m2k_w / 2.0
            g_ext = A / (el.rse_m2k_w + r_half_ext)

            # Choisir la température de frontière extérieure
            if el.element_type == "ground_floor":
                t_boundary = t_ground
                # Pas de rayonnement solaire sur sol (enterré)
                q_solar_ext = 0.0
            else:
                # Température sol-air effective (convection + rayonnement sky)
                h_ce = el.h_ext_conv_w_m2k
                h_re = el.h_ext_rad_w_m2k
                h_se = h_ce + h_re
                # T_sol-air = T_ext + alpha*I_sol/h_se (effet solaire)
                # Correction rayonnement sky (température effective inférieure à Text)
                t_boundary = (h_ce * t_ext + h_re * t_sky) / h_se
                I_poa_el = solar_poa.get(el.element_id, 0.0)
                q_solar_ext = el.absorptance_solar * I_poa_el * A

            f[indices[0]] += g_ext * t_boundary
            f[indices[0]] += q_solar_ext  # absorption solaire sur nœud extérieur

        return f

    # ── Un pas de temps ───────────────────────────────────────

    def step(
        self,
        T_prev: np.ndarray,
        f: np.ndarray,
        sp_heat_c: float | None,
        sp_cool_c: float | None,
    ) -> tuple[np.ndarray, float]:
        """Effectue un pas de temps backward-Euler.

        Parameters
        ----------
        T_prev   : vecteur d'état au pas précédent [°C]
        f        : vecteur de forçage [W] pour le pas courant
        sp_heat_c: consigne de chauffage [°C] (None = pas de limite)
        sp_cool_c: consigne de refroidissement [°C] (None = pas de limite)

        Returns
        -------
        T_new   : nouveau vecteur d'état [°C]
        q_hvac  : puissance HVAC [W] — positif = chauffage, négatif = froid
        """
        # Second membre : C/Δt · T_n + f
        rhs = (self.C / self.dt) * T_prev + f

        # ── Résolution libre (sans HVAC) ──────────────────────
        T_free = lu_solve((self._lu_A, self._piv_A), rhs)
        t_air_free = float(T_free[IDX_TAIR])

        # ── Test de consigne ──────────────────────────────────
        if sp_heat_c is not None and t_air_free < sp_heat_c:
            T_new, q_hvac = self._impose_setpoint(T_free, rhs, sp_heat_c)
        elif sp_cool_c is not None and t_air_free > sp_cool_c:
            T_new, q_hvac = self._impose_setpoint(T_free, rhs, sp_cool_c)
        else:
            T_new, q_hvac = T_free, 0.0

        return T_new, q_hvac

    # ── Imposition de consigne ────────────────────────────────

    def _impose_setpoint(
        self,
        T_free: np.ndarray,
        rhs: np.ndarray,
        t_sp: float,
    ) -> tuple[np.ndarray, float]:
        """Résout le système avec T_air = t_sp imposé.

        Méthode d'élimination de ligne :
        - La ligne i_air de A est remplacée par une équation identité
        - Les autres lignes sont modifiées pour éliminer la colonne i_air
        - Q_hvac = résidu du bilan d'énergie sur le nœud air

        Returns
        -------
        T_new  : vecteur d'état avec T_air = t_sp
        q_hvac : puissance HVAC nécessaire [W]
        """
        i = IDX_TAIR

        # Sauvegarder la ligne originale pour le back-compute
        A_row_orig = self._A[i, :].copy()
        rhs_orig_i = rhs[i]

        # Construire le système modifié
        A_mod  = self._A.copy()
        rhs_mod = rhs.copy()

        # Substituer T_air = t_sp dans toutes les autres lignes
        for j in range(self.n):
            if j != i:
                rhs_mod[j] -= A_mod[j, i] * t_sp
                A_mod[j, i] = 0.0
                A_mod[i, j] = 0.0

        # Ligne i : identité
        A_mod[i, :] = 0.0
        A_mod[i, i] = 1.0
        rhs_mod[i]  = t_sp

        T_new = np.linalg.solve(A_mod, rhs_mod)

        # Back-compute : Q_hvac = résidu sur le nœud air
        q_hvac = float(A_row_orig @ T_new - rhs_orig_i)

        return T_new, q_hvac
