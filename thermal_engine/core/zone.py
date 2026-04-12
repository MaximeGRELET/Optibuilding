"""
Zone thermique uniforme.

ThermalZone regroupe tous les éléments physiques d'une zone et expose
les paramètres nécessaires à l'assemblage du réseau RC.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

from thermal_engine.core.envelope import OpaqueElement, WindowElement, InternalMass

# Propriétés de l'air à 20°C
RHO_AIR: float = 1.204    # kg/m³
CP_AIR: float  = 1006.0   # J/(kg·K)


@dataclass
class ThermalZone:
    """Zone thermique unique (volume d'air à température uniforme).

    Le vecteur d'état RC de la zone est organisé comme suit :
        [0]     → Tair (nœud air)
        [1]     → Tmr  (nœud radiatif moyen — réseau étoile)
        [2..3]  → Twin_ext_win0, Twin_int_win0  (1ère fenêtre)
        [4..5]  → Twin_ext_win1, Twin_int_win1  (2e fenêtre)
        ...
        [k]     → nœud couche 0 de l'élément opaque 0 (ext)
        [k+1]   → nœud couche 1, etc.
        ...
        [m]     → Tim1_mass0, Tim2_mass0  (1ère masse interne)
        ...

    Parameters
    ----------
    zone_id             : identifiant unique
    label               : nom lisible
    usage               : type d'usage (résidentiel, bureau, commerce…)
    floor_area_m2       : surface de plancher [m²]
    volume_m3           : volume [m³]
    opaque_elements     : parois opaques (murs, toit, sol)
    windows             : vitrages
    internal_masses     : masses internes
    infiltration_ach    : taux de renouvellement d'air par infiltration [vol/h]
    mechanical_vent_ach : taux de ventilation mécanique [vol/h]
    heat_recovery_eff   : efficacité récupération VMC [-] (0 à 1)
    thermal_bridge_w_k  : Σ(ψ·L) des ponts thermiques [W/K]
    year_built          : année de construction (pour DPE et valeurs par défaut)
    """
    zone_id: str
    label: str
    usage: str
    floor_area_m2: float
    volume_m3: float
    opaque_elements: list[OpaqueElement] = field(default_factory=list)
    windows: list[WindowElement] = field(default_factory=list)
    internal_masses: list[InternalMass] = field(default_factory=list)

    infiltration_ach: float = 0.5
    mechanical_vent_ach: float = 0.5
    heat_recovery_eff: float = 0.0
    thermal_bridge_w_k: float = 0.0
    year_built: int = 1980

    # Système énergétique (pour calcul EP et CO₂)
    energy_systems: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.floor_area_m2 <= 0:
            raise ValueError(f"Zone '{self.zone_id}' : floor_area_m2 doit être > 0.")
        if self.volume_m3 <= 0:
            raise ValueError(f"Zone '{self.zone_id}' : volume_m3 doit être > 0.")

    # ── Paramètres thermiques de l'air ───────────────────────

    @property
    def air_mass_kg(self) -> float:
        """Masse d'air de la zone [kg]."""
        return self.volume_m3 * RHO_AIR

    @property
    def c_air_j_k(self) -> float:
        """Capacité thermique de l'air [J/K]."""
        return self.air_mass_kg * CP_AIR

    # ── Conductances de ventilation ───────────────────────────

    @property
    def g_vent_effective_w_k(self) -> float:
        """Conductance effective ventilation+infiltration vers l'extérieur [W/K].

        G_eff = ρ·cp · (V_inf + V_vent·(1−η_rec)) / 3600
        """
        v_inf = self.infiltration_ach * self.volume_m3
        v_vent = self.mechanical_vent_ach * self.volume_m3 * (1.0 - self.heat_recovery_eff)
        return RHO_AIR * CP_AIR * (v_inf + v_vent) / 3600.0

    # ── Taille du vecteur d'état ──────────────────────────────

    @property
    def n_envelope_nodes(self) -> int:
        """Nombre total de nœuds dans les éléments opaques."""
        return sum(el.n_nodes for el in self.opaque_elements)

    @property
    def n_window_nodes(self) -> int:
        """2 nœuds par fenêtre."""
        return len(self.windows) * 2

    @property
    def n_mass_nodes(self) -> int:
        """2 nœuds par masse interne."""
        return len(self.internal_masses) * 2

    @property
    def n_state(self) -> int:
        """Taille totale du vecteur d'état (= nombre de nœuds thermiques)."""
        return 2 + self.n_window_nodes + self.n_envelope_nodes + self.n_mass_nodes

    # ── Coefficients de déperdition (méthode mensuelle ISO 13790) ──

    @property
    def h_t_w_k(self) -> float:
        """Coefficient de déperdition par transmission H_T [W/K].

        H_T = Σ(A_i·U_i) + H_ponts
        H_ponts par défaut = 5 % de Σ(A_i·U_i)  (niveau "défaut" RE 2020 Annexe VII)
        """
        ht = sum(el.u_value_w_m2k * el.area_m2 for el in self.opaque_elements)
        ht += sum(win.uw_w_m2k * win.area_m2 for win in self.windows)
        ht += self.thermal_bridge_w_k
        return ht

    @property
    def h_v_w_k(self) -> float:
        """Coefficient de déperdition par ventilation H_V [W/K]."""
        return self.g_vent_effective_w_k

    @property
    def total_internal_surface_m2(self) -> float:
        """Somme des surfaces intérieures [m²] pour le réseau radiatif."""
        surf = sum(el.area_m2 for el in self.opaque_elements)
        surf += sum(win.area_glazing_m2 for win in self.windows)
        surf += sum(m.area_m2 for m in self.internal_masses)
        return surf
