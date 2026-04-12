"""
Modèle physique des matériaux de construction.

Chaque Material est une couche homogène caractérisée par ses propriétés
thermiques intrinsèques (λ, ρ, cp) sans épaisseur fixée — l'épaisseur est
fournie au moment de la constitution de la paroi.

Un MaterialLayer associe un Material à une épaisseur.
"""

from __future__ import annotations
from dataclasses import dataclass


# ─────────────────────────────────────────────────────────────
# Matériau homogène (propriétés intrinsèques)
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Material:
    """Propriétés thermophysiques d'un matériau homogène.

    Attributes
    ----------
    id : identifiant unique (clé dans MATERIAL_DATABASE)
    description : nom lisible
    lambda_w_mk : conductivité thermique λ  [W/(m·K)]
    rho_kg_m3   : masse volumique ρ          [kg/m³]
    cp_j_kgk    : chaleur spécifique massique cp  [J/(kg·K)]
    """
    id: str
    description: str
    lambda_w_mk: float   # W/(m·K)
    rho_kg_m3: float     # kg/m³
    cp_j_kgk: float      # J/(kg·K)

    def __post_init__(self) -> None:
        if self.lambda_w_mk <= 0:
            raise ValueError(f"[{self.id}] lambda_w_mk doit être > 0 (reçu : {self.lambda_w_mk})")
        if self.rho_kg_m3 <= 0:
            raise ValueError(f"[{self.id}] rho_kg_m3 doit être > 0 (reçu : {self.rho_kg_m3})")
        if self.cp_j_kgk <= 0:
            raise ValueError(f"[{self.id}] cp_j_kgk doit être > 0 (reçu : {self.cp_j_kgk})")

    @property
    def rho_cp_j_m3k(self) -> float:
        """Capacité volumique ρ·cp [J/(m³·K)]."""
        return self.rho_kg_m3 * self.cp_j_kgk


# ─────────────────────────────────────────────────────────────
# Couche de matériau (matériau + épaisseur)
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MaterialLayer:
    """Association d'un matériau et d'une épaisseur.

    Attributes
    ----------
    material  : matériau homogène
    thickness_m : épaisseur [m]
    """
    material: Material
    thickness_m: float   # m

    def __post_init__(self) -> None:
        if self.thickness_m <= 0:
            raise ValueError(
                f"Épaisseur de couche invalide ({self.material.id}) : {self.thickness_m} m"
            )

    @property
    def resistance_m2k_w(self) -> float:
        """Résistance thermique R = e/λ  [m²·K/W]."""
        return self.thickness_m / self.material.lambda_w_mk

    @property
    def thermal_mass_j_m2k(self) -> float:
        """Capacité thermique surfacique ρ·cp·e  [J/(m²·K)]."""
        return self.material.rho_cp_j_m3k * self.thickness_m
