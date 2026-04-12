"""
Éléments d'enveloppe d'une zone thermique.

OpaqueElement : paroi multicouche (mur, toiture, plancher)
WindowElement  : vitrage (modèle 2-nœuds Twin_ext / Twin_int)
InternalMass   : masse thermique interne (mobilier, cloisons)

Chaque OpaqueElement est un réseau RC 1D :
  - un nœud par couche de matériau
  - côté extérieur couplé à Text/Tsky via h_ext
  - côté intérieur couplé à Tair (convection) et Tmr (rayonnement)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

from thermal_engine.core.materials import Material, MaterialLayer
from thermal_engine.data.material_db import get_material


# ── Coefficients de surface par défaut ────────────────────────────────────────
# EN ISO 6946 / ASHRAE 90.1

H_EXT_CONV_W_M2K: float = 17.8    # Convection externe (vent ~3 m/s)
H_EXT_RAD_W_M2K: float  = 4.5     # Rayonnement GL externe (linéarisé, ~10°C)
H_INT_CONV_WALL_W_M2K: float = 2.5 # Convection interne verticale
H_INT_CONV_ROOF_W_M2K: float = 5.0 # Convection interne horizontale (plafond chaud)
H_INT_CONV_FLOOR_W_M2K: float = 0.7# Convection interne horizontale (plancher froid)
H_INT_RAD_W_M2K: float  = 5.0     # Rayonnement GL interne (linéarisé, ~20°C, ε=0,9)

# Résistances surfaciques standard EN ISO 6946 [m²K/W]
RSI_WALL: float  = 0.13
RSE_WALL: float  = 0.04
RSI_ROOF: float  = 0.10
RSE_ROOF: float  = 0.04
RSI_FLOOR: float = 0.17
RSE_FLOOR: float = 0.04


# ─────────────────────────────────────────────────────────────
# Élément opaque (paroi multicouche)
# ─────────────────────────────────────────────────────────────

@dataclass
class OpaqueElement:
    """Paroi opaque multicouche avec réseau RC nodal.

    Chaque couche correspond à un nœud thermique.

    Parameters
    ----------
    element_id      : identifiant unique
    element_type    : 'wall' | 'roof' | 'ground_floor'
    layers          : couches de la paroi, de l'extérieur vers l'intérieur
    area_m2         : surface totale de l'élément [m²]
    azimuth_deg     : azimut [°] — 0=N, 90=E, 180=S, 270=W (non utilisé pour sol/toit)
    tilt_deg        : inclinaison [°] — 90=vertical (murs), 0=horizontal (toit/sol)
    absorptance_solar : absorption solaire extérieure [-]
    emittance_lw    : émissivité grande longueur d'onde extérieure [-]
    rsi_m2k_w       : résistance surfacique intérieure [m²K/W]
    rse_m2k_w       : résistance surfacique extérieure [m²K/W]
    """
    element_id: str
    element_type: Literal["wall", "roof", "ground_floor"]
    layers: list[MaterialLayer]
    area_m2: float
    azimuth_deg: float = 180.0        # Sud par défaut
    tilt_deg: float = 90.0            # Vertical par défaut
    absorptance_solar: float = 0.6
    emittance_lw: float = 0.9
    rsi_m2k_w: float = field(init=False)
    rse_m2k_w: float = field(init=False)

    def __post_init__(self) -> None:
        if not self.layers:
            raise ValueError(f"Élément '{self.element_id}' : au moins une couche requise.")
        if self.area_m2 <= 0:
            raise ValueError(f"Élément '{self.element_id}' : area_m2 doit être > 0.")
        # Attribution des résistances surfaciques selon le type
        if self.element_type == "wall":
            self.rsi_m2k_w = RSI_WALL
            self.rse_m2k_w = RSE_WALL
        elif self.element_type == "roof":
            self.rsi_m2k_w = RSI_ROOF
            self.rse_m2k_w = RSE_ROOF
        else:  # ground_floor
            self.rsi_m2k_w = RSI_FLOOR
            self.rse_m2k_w = RSE_FLOOR

    @property
    def n_nodes(self) -> int:
        """Nombre de nœuds RC = nombre de couches."""
        return len(self.layers)

    @property
    def u_value_w_m2k(self) -> float:
        """Coefficient U global [W/(m²·K)] incluant résistances surfaciques."""
        r_total = (
            self.rse_m2k_w
            + sum(lay.resistance_m2k_w for lay in self.layers)
            + self.rsi_m2k_w
        )
        return 1.0 / r_total if r_total > 0 else 0.0

    @property
    def h_ext_w_m2k(self) -> float:
        """Conductance de surface extérieure globale [W/(m²·K)] = 1/Rse."""
        return 1.0 / self.rse_m2k_w if self.rse_m2k_w > 0 else 0.0

    @property
    def h_ext_conv_w_m2k(self) -> float:
        """Convection externe [W/(m²·K)]."""
        return H_EXT_CONV_W_M2K

    @property
    def h_ext_rad_w_m2k(self) -> float:
        """Rayonnement externe linéarisé [W/(m²·K)]."""
        return H_EXT_RAD_W_M2K

    @property
    def h_int_conv_w_m2k(self) -> float:
        """Convection interne [W/(m²·K)] selon le type de paroi."""
        if self.element_type == "roof":
            return H_INT_CONV_ROOF_W_M2K
        if self.element_type == "ground_floor":
            return H_INT_CONV_FLOOR_W_M2K
        return H_INT_CONV_WALL_W_M2K

    @property
    def h_int_rad_w_m2k(self) -> float:
        """Rayonnement interne linéarisé [W/(m²·K)]."""
        return H_INT_RAD_W_M2K

    def add_insulation_layer(
        self,
        material_id: str,
        thickness_m: float,
        position: Literal["exterior", "interior"] = "exterior",
    ) -> "OpaqueElement":
        """Retourne une copie avec une couche d'isolant supplémentaire.

        Parameters
        ----------
        material_id : identifiant du matériau dans MATERIAL_DATABASE
        thickness_m : épaisseur de la couche [m]
        position    : 'exterior' (côté ext) ou 'interior' (côté int)
        """
        mat = get_material(material_id)
        new_layer = MaterialLayer(material=mat, thickness_m=thickness_m)
        if position == "exterior":
            new_layers = [new_layer] + list(self.layers)
        else:
            new_layers = list(self.layers) + [new_layer]
        return OpaqueElement(
            element_id=self.element_id,
            element_type=self.element_type,
            layers=new_layers,
            area_m2=self.area_m2,
            azimuth_deg=self.azimuth_deg,
            tilt_deg=self.tilt_deg,
            absorptance_solar=self.absorptance_solar,
            emittance_lw=self.emittance_lw,
        )


# ─────────────────────────────────────────────────────────────
# Vitrage (2 nœuds RC)
# ─────────────────────────────────────────────────────────────

@dataclass
class WindowElement:
    """Vitrage modélisé comme réseau RC 2-nœuds (Twin_ext, Twin_int).

    Le vitrage transmet le rayonnement solaire selon le coefficient g,
    et dissipe de la chaleur selon le U-value.

    Parameters
    ----------
    element_id       : identifiant unique
    area_m2          : surface totale (cadre + vitrage) [m²]
    uw_w_m2k         : U-value du vitrage complet [W/(m²·K)]
    g_value          : facteur solaire (SHGC) [-]
    azimuth_deg      : azimut [°]
    tilt_deg         : inclinaison [°]
    frame_factor     : fraction vitrée [-] (1 − fraction cadre)
    """
    element_id: str
    area_m2: float
    uw_w_m2k: float
    g_value: float
    azimuth_deg: float = 180.0
    tilt_deg: float = 90.0
    frame_factor: float = 0.70       # Fraction vitrée
    absorptance_ext_pane: float = 0.10  # Absorption de la vitre extérieure

    def __post_init__(self) -> None:
        if self.area_m2 <= 0:
            raise ValueError(f"Fenêtre '{self.element_id}' : area_m2 doit être > 0.")

    @property
    def area_glazing_m2(self) -> float:
        """Surface vitrée nette [m²]."""
        return self.area_m2 * self.frame_factor

    @property
    def solar_heat_gain_coeff(self) -> float:
        """SHGC effectif = g × frame_factor."""
        return self.g_value * self.frame_factor

    # ── Paramètres RC du vitrage ──────────────────────────────
    # Capacité d'une vitre 4 mm (verre standard) [J/(m²·K)]
    _CAP_PER_M2: float = 2500.0 * 750.0 * 0.004  # ≈ 7 500 J/(m²·K)

    @property
    def cap_ext_j_k(self) -> float:
        """Capacité nœud externe [J/K]."""
        return self._CAP_PER_M2 * self.area_glazing_m2

    @property
    def cap_int_j_k(self) -> float:
        """Capacité nœud interne [J/K]."""
        return self._CAP_PER_M2 * self.area_glazing_m2

    @property
    def g_inter_w_k(self) -> float:
        """Conductance entre les deux nœuds vitrage [W/K] = U × A."""
        return self.uw_w_m2k * self.area_glazing_m2

    @property
    def h_ext_w_m2k(self) -> float:
        """Conductance de surface extérieure [W/(m²·K)]."""
        return H_EXT_CONV_W_M2K + H_EXT_RAD_W_M2K

    @property
    def h_int_conv_w_m2k(self) -> float:
        return H_INT_CONV_WALL_W_M2K

    @property
    def h_int_rad_w_m2k(self) -> float:
        return H_INT_RAD_W_M2K

    def with_new_properties(
        self, new_uw_w_m2k: float | None = None, new_g_value: float | None = None
    ) -> "WindowElement":
        """Retourne une copie avec de nouvelles propriétés optiques."""
        return WindowElement(
            element_id=self.element_id,
            area_m2=self.area_m2,
            uw_w_m2k=new_uw_w_m2k if new_uw_w_m2k is not None else self.uw_w_m2k,
            g_value=new_g_value if new_g_value is not None else self.g_value,
            azimuth_deg=self.azimuth_deg,
            tilt_deg=self.tilt_deg,
            frame_factor=self.frame_factor,
        )


# ─────────────────────────────────────────────────────────────
# Masse interne (2 nœuds RC : Tim1 surface, Tim2 noyau)
# ─────────────────────────────────────────────────────────────

@dataclass
class InternalMass:
    """Masse thermique interne : mobilier, cloisons, planchers intermédiaires.

    Modèle 2-nœuds (d'après le schéma RC du projet) :
    - Tim1 : nœud de surface (échanges avec Tair via convection et Tmr via rayonnement)
    - Tim2 : nœud de noyau  (échange uniquement avec Tim1 par conduction)

    Parameters
    ----------
    mass_id          : identifiant unique
    area_m2          : surface d'échange effective [m²]
    surface_material : matériau du nœud de surface (demi-épaisseur)
    core_material    : matériau du nœud de noyau (demi-épaisseur)
    h_conv_w_m2k     : convection surface–Tair [W/(m²·K)]
    h_rad_w_m2k      : rayonnement surface–Tmr  [W/(m²·K)]
    """
    mass_id: str
    area_m2: float
    surface_material: MaterialLayer   # Tim1 (couche externe)
    core_material: MaterialLayer      # Tim2 (couche interne)
    h_conv_w_m2k: float = 2.5
    h_rad_w_m2k: float = 5.0

    @property
    def cap_surface_j_k(self) -> float:
        """Capacité du nœud de surface [J/K]."""
        return self.surface_material.thermal_mass_j_m2k * self.area_m2

    @property
    def cap_core_j_k(self) -> float:
        """Capacité du nœud de noyau [J/K]."""
        return self.core_material.thermal_mass_j_m2k * self.area_m2

    @property
    def g_surface_core_w_k(self) -> float:
        """Conductance surface–noyau [W/K]."""
        r_half_surf = self.surface_material.resistance_m2k_w
        r_half_core = self.core_material.resistance_m2k_w
        r_total = r_half_surf + r_half_core
        return self.area_m2 / r_total if r_total > 0 else 0.0
