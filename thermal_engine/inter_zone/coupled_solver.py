"""
Solveur couplé multi-zones pour bâtiments à plusieurs zones thermiques.

Principe :
  - Les vecteurs d'état de toutes les zones sont concaténés en un seul vecteur T_global.
  - Les matrices C et K de chaque zone sont placées en blocs diagonaux.
  - Chaque ZoneAdjacency injecte une conductance G_adj entre les nœuds Tair des
    deux zones concernées (termes hors-diagonaux dans K_global).
  - Une seule factorisation LU du système global → résolution couplée simultanée.

Offset du bloc zone_i dans T_global = sum(n_state[zone_j], j < i)
Couplage : G_adj entre (offset_z1 + IDX_TAIR) et (offset_z2 + IDX_TAIR)
"""

from __future__ import annotations
from dataclasses import dataclass, field

import numpy as np
from scipy.linalg import lu_factor, lu_solve

from thermal_engine.core.building import Building
from thermal_engine.core.zone import ThermalZone
from thermal_engine.solver.rc_assembler import (
    IDX_TAIR, IDX_TMR,
    build_index_map, assemble_zone_matrices, ZoneIndexMap,
)
from thermal_engine.inter_zone.adjacency import ZoneAdjacency

DT_S: float = 3600.0


# ─────────────────────────────────────────────────────────────
# Résultat d'un pas de temps couplé
# ─────────────────────────────────────────────────────────────

@dataclass
class CoupledStepResult:
    """Résultat d'un pas de temps du solveur couplé.

    Attributes
    ----------
    T_zones : dict[zone_id → vecteur d'état np.ndarray]
    q_hvac  : dict[zone_id → puissance HVAC [W]] (+ = chauf, - = froid)
    """
    T_zones: dict[str, np.ndarray]
    q_hvac: dict[str, float]


# ─────────────────────────────────────────────────────────────
# Solveur couplé
# ─────────────────────────────────────────────────────────────

class CoupledBuildingSolver:
    """Solveur backward-Euler couplé pour un bâtiment multi-zones.

    Parameters
    ----------
    building      : bâtiment avec toutes ses zones thermiques
    adjacencies   : liste des adjacences inter-zones (conductances de couplage)
    dt_s          : pas de temps [s] (défaut 3 600 s = 1 h)
    """

    def __init__(
        self,
        building: Building,
        adjacencies: list[ZoneAdjacency],
        dt_s: float = DT_S,
    ) -> None:
        self.building = building
        self.adjacencies = adjacencies
        self.dt = dt_s

        self.zones: list[ThermalZone] = building.zones

        # ── Cartes d'index et matrices par zone ─────────────────
        self._idx_maps: dict[str, ZoneIndexMap] = {}
        self._C_blocks: dict[str, np.ndarray] = {}
        self._K_blocks: dict[str, np.ndarray] = {}

        for zone in self.zones:
            idx = build_index_map(zone)
            C, K, _ = assemble_zone_matrices(zone, idx)
            self._idx_maps[zone.zone_id] = idx
            self._C_blocks[zone.zone_id] = C
            self._K_blocks[zone.zone_id] = K

        # ── Offsets globaux ──────────────────────────────────────
        # offset[zone_id] = premier indice du bloc de cette zone dans T_global
        self._offsets: dict[str, int] = {}
        cursor = 0
        for zone in self.zones:
            self._offsets[zone.zone_id] = cursor
            cursor += self._idx_maps[zone.zone_id].n
        self._n_total = cursor

        # ── Assemblage du système global ─────────────────────────
        self._C_global = np.zeros(self._n_total)
        self._K_global = np.zeros((self._n_total, self._n_total))

        # Blocs diagonaux
        for zone in self.zones:
            off = self._offsets[zone.zone_id]
            n_z = self._idx_maps[zone.zone_id].n
            C_z = self._C_blocks[zone.zone_id]
            K_z = self._K_blocks[zone.zone_id]
            self._C_global[off:off + n_z] = C_z
            self._K_global[off:off + n_z, off:off + n_z] = K_z

        # Couplages inter-zones
        self._inject_adjacency_conductances()

        # ── Factorisation LU ──────────────────────────────────────
        A_global = np.diag(self._C_global / self.dt) - self._K_global
        self._A_global = A_global
        self._lu, self._piv = lu_factor(A_global)

    # ─────────────────────────────────────────────────────────
    # Injection des conductances de couplage
    # ─────────────────────────────────────────────────────────

    def _inject_adjacency_conductances(self) -> None:
        """Ajoute les conductances inter-zones dans K_global."""
        zone_ids = {z.zone_id for z in self.zones}
        for adj in self.adjacencies:
            if adj.zone_id_1 not in zone_ids or adj.zone_id_2 not in zone_ids:
                continue  # adjacence hors du bâtiment — ignorer
            G = adj.conductance_w_k
            i = self._offsets[adj.zone_id_1] + IDX_TAIR
            j = self._offsets[adj.zone_id_2] + IDX_TAIR
            # Conductance symétrique entre Tair_z1 et Tair_z2
            self._K_global[i, i] -= G
            self._K_global[j, j] -= G
            self._K_global[i, j] += G
            self._K_global[j, i] += G

    # ─────────────────────────────────────────────────────────
    # État initial
    # ─────────────────────────────────────────────────────────

    def initial_state(self, t_air_init: float = 18.0) -> np.ndarray:
        """Vecteur d'état global initial (température uniforme)."""
        return np.full(self._n_total, t_air_init)

    def split_state(self, T_global: np.ndarray) -> dict[str, np.ndarray]:
        """Découpe T_global en sous-vecteurs par zone."""
        result: dict[str, np.ndarray] = {}
        for zone in self.zones:
            off = self._offsets[zone.zone_id]
            n_z = self._idx_maps[zone.zone_id].n
            result[zone.zone_id] = T_global[off:off + n_z]
        return result

    # ─────────────────────────────────────────────────────────
    # Construction du vecteur de forçage global
    # ─────────────────────────────────────────────────────────

    def build_global_forcing_vector(
        self,
        per_zone_forcing: dict[str, np.ndarray],
    ) -> np.ndarray:
        """Assemble le vecteur de forçage global depuis les forçages par zone.

        Parameters
        ----------
        per_zone_forcing : {zone_id: vecteur f(t) de taille n_zone [W]}
                           Calculé avec ZoneSolver.build_forcing_vector() pour chaque zone.

        Returns
        -------
        f_global : vecteur de forçage global [W] shape (n_total,)
        """
        f_global = np.zeros(self._n_total)
        for zone_id, f_z in per_zone_forcing.items():
            if zone_id not in self._offsets:
                continue
            off = self._offsets[zone_id]
            n_z = self._idx_maps[zone_id].n
            f_global[off:off + n_z] = f_z
        return f_global

    # ─────────────────────────────────────────────────────────
    # Un pas de temps couplé
    # ─────────────────────────────────────────────────────────

    def step(
        self,
        T_prev_global: np.ndarray,
        f_global: np.ndarray,
        setpoints_heat: dict[str, float | None],
        setpoints_cool: dict[str, float | None],
    ) -> CoupledStepResult:
        """Effectue un pas de temps backward-Euler couplé.

        Parameters
        ----------
        T_prev_global    : vecteur d'état global au pas précédent [°C]
        f_global         : vecteur de forçage global [W]
        setpoints_heat   : {zone_id: T_sp_chaud [°C] ou None}
        setpoints_cool   : {zone_id: T_sp_froid [°C] ou None}

        Returns
        -------
        CoupledStepResult avec T_zones et q_hvac par zone
        """
        # Second membre global
        rhs = (self._C_global / self.dt) * T_prev_global + f_global

        # ── Résolution libre ──────────────────────────────────
        T_free = lu_solve((self._lu, self._piv), rhs)

        # ── Déterminer les zones nécessitant un forçage HVAC ─
        zones_to_impose: dict[str, float] = {}
        for zone in self.zones:
            zid = zone.zone_id
            off = self._offsets[zid]
            t_air_free = float(T_free[off + IDX_TAIR])
            sp_h = setpoints_heat.get(zid)
            sp_c = setpoints_cool.get(zid)
            if sp_h is not None and t_air_free < sp_h:
                zones_to_impose[zid] = sp_h
            elif sp_c is not None and t_air_free > sp_c:
                zones_to_impose[zid] = sp_c

        # ── Sans contraintes : retour direct ─────────────────
        if not zones_to_impose:
            q_hvac = {zone.zone_id: 0.0 for zone in self.zones}
            T_zones = self.split_state(T_free)
            return CoupledStepResult(T_zones=T_zones, q_hvac=q_hvac)

        # ── Imposition de consigne multi-zones ───────────────
        T_new, q_hvac_dict = self._impose_setpoints(rhs, zones_to_impose)
        T_zones = self.split_state(T_new)

        q_hvac: dict[str, float] = {}
        for zone in self.zones:
            q_hvac[zone.zone_id] = q_hvac_dict.get(zone.zone_id, 0.0)

        return CoupledStepResult(T_zones=T_zones, q_hvac=q_hvac)

    # ─────────────────────────────────────────────────────────
    # Imposition de consigne (élimination de ligne — multi-zones)
    # ─────────────────────────────────────────────────────────

    def _impose_setpoints(
        self,
        rhs: np.ndarray,
        zones_to_impose: dict[str, float],
    ) -> tuple[np.ndarray, dict[str, float]]:
        """Résout le système couplé avec T_air imposé pour certaines zones.

        Pour chaque zone avec consigne active :
          - La ligne i_air (index global) de A est remplacée par l'identité
          - La colonne i_air est éliminée des autres lignes
          - Q_hvac est back-calculé depuis le résidu de la ligne originale

        Returns
        -------
        T_new       : vecteur d'état global modifié [°C]
        q_hvac_dict : {zone_id: Q_hvac [W]}
        """
        imposed_indices: dict[int, float] = {}  # {global_idx_air: t_sp}
        for zid, t_sp in zones_to_impose.items():
            i_global = self._offsets[zid] + IDX_TAIR
            imposed_indices[i_global] = t_sp

        A_mod = self._A_global.copy()
        rhs_mod = rhs.copy()

        # Sauvegarder les lignes originales avant modification
        original_rows: dict[int, np.ndarray] = {
            i: self._A_global[i, :].copy() for i in imposed_indices
        }
        original_rhs: dict[int, float] = {
            i: float(rhs[i]) for i in imposed_indices
        }

        # Élimination de colonne pour chaque T_air imposé
        for i_air, t_sp in imposed_indices.items():
            # Éliminer la colonne i_air dans toutes les autres lignes
            for j in range(self._n_total):
                if j not in imposed_indices:
                    rhs_mod[j] -= A_mod[j, i_air] * t_sp
                    A_mod[j, i_air] = 0.0
            # Zeroing la ligne et la colonne de i_air
            A_mod[i_air, :] = 0.0
            A_mod[:, i_air] = 0.0
            # Identité sur la ligne
            A_mod[i_air, i_air] = 1.0
            rhs_mod[i_air] = t_sp

        T_new = np.linalg.solve(A_mod, rhs_mod)

        # Back-compute Q_hvac pour chaque zone imposée
        q_hvac_dict: dict[str, float] = {}
        for zid, t_sp in zones_to_impose.items():
            i_global = self._offsets[zid] + IDX_TAIR
            row_orig = original_rows[i_global]
            rhs_orig_i = original_rhs[i_global]
            q_hvac_dict[zid] = float(row_orig @ T_new - rhs_orig_i)

        return T_new, q_hvac_dict
