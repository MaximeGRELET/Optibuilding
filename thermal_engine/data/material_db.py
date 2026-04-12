"""
Base de données des matériaux de construction.

Sources : CSTB, EN ISO 10456:2007, RE 2020.
Toutes les valeurs sont des propriétés intrinsèques sans épaisseur.
"""

from __future__ import annotations
from thermal_engine.core.materials import Material


MATERIAL_DATABASE: dict[str, Material] = {
    # ── Bétons et ciments ──────────────────────────────────────────────────────
    "concrete_dense": Material(
        id="concrete_dense",
        description="Béton lourd armé",
        lambda_w_mk=2.10, rho_kg_m3=2300, cp_j_kgk=880,
    ),
    "concrete_aerated": Material(
        id="concrete_aerated",
        description="Béton cellulaire (AAC)",
        lambda_w_mk=0.12, rho_kg_m3=600, cp_j_kgk=1000,
    ),
    "concrete_medium": Material(
        id="concrete_medium",
        description="Béton semi-lourd",
        lambda_w_mk=1.35, rho_kg_m3=1800, cp_j_kgk=880,
    ),
    "screed": Material(
        id="screed",
        description="Chape ciment",
        lambda_w_mk=1.40, rho_kg_m3=2000, cp_j_kgk=840,
    ),
    # ── Briques ───────────────────────────────────────────────────────────────
    "brick_hollow": Material(
        id="brick_hollow",
        description="Brique creuse (alvéolée)",
        lambda_w_mk=0.48, rho_kg_m3=1200, cp_j_kgk=840,
    ),
    "brick_solid": Material(
        id="brick_solid",
        description="Brique pleine",
        lambda_w_mk=0.76, rho_kg_m3=1800, cp_j_kgk=840,
    ),
    "brick_monomur": Material(
        id="brick_monomur",
        description="Brique monomur (R≈1,2 m²K/W pour 37,5 cm)",
        lambda_w_mk=0.19, rho_kg_m3=800, cp_j_kgk=840,
    ),
    # ── Plaques et enduits ────────────────────────────────────────────────────
    "plasterboard": Material(
        id="plasterboard",
        description="Plaque de plâtre (BA13)",
        lambda_w_mk=0.25, rho_kg_m3=900, cp_j_kgk=1000,
    ),
    "plaster_coating": Material(
        id="plaster_coating",
        description="Enduit plâtre (enduit intérieur)",
        lambda_w_mk=0.35, rho_kg_m3=1000, cp_j_kgk=840,
    ),
    "render_cement": Material(
        id="render_cement",
        description="Enduit ciment extérieur",
        lambda_w_mk=0.87, rho_kg_m3=1800, cp_j_kgk=840,
    ),
    # ── Isolants ──────────────────────────────────────────────────────────────
    "mineral_wool": Material(
        id="mineral_wool",
        description="Laine minérale (verre ou roche) — λ=0,035",
        lambda_w_mk=0.035, rho_kg_m3=30, cp_j_kgk=840,
    ),
    "mineral_wool_hd": Material(
        id="mineral_wool_hd",
        description="Laine minérale haute densité — λ=0,040",
        lambda_w_mk=0.040, rho_kg_m3=70, cp_j_kgk=840,
    ),
    "eps_insulation": Material(
        id="eps_insulation",
        description="Polystyrène expansé (EPS) — λ=0,036",
        lambda_w_mk=0.036, rho_kg_m3=20, cp_j_kgk=1450,
    ),
    "xps_insulation": Material(
        id="xps_insulation",
        description="Polystyrène extrudé (XPS) — λ=0,033",
        lambda_w_mk=0.033, rho_kg_m3=32, cp_j_kgk=1450,
    ),
    "pur_insulation": Material(
        id="pur_insulation",
        description="Mousse polyuréthane (PUR) — λ=0,024",
        lambda_w_mk=0.024, rho_kg_m3=40, cp_j_kgk=1400,
    ),
    "wood_fiber": Material(
        id="wood_fiber",
        description="Fibre de bois (isolant biosourcé) — λ=0,040",
        lambda_w_mk=0.040, rho_kg_m3=160, cp_j_kgk=2100,
    ),
    "hemp_wool": Material(
        id="hemp_wool",
        description="Laine de chanvre (biosourcé) — λ=0,039",
        lambda_w_mk=0.039, rho_kg_m3=35, cp_j_kgk=1700,
    ),
    # ── Bois et dérivés ───────────────────────────────────────────────────────
    "wood_soft": Material(
        id="wood_soft",
        description="Bois résineux (pin, épicéa)",
        lambda_w_mk=0.13, rho_kg_m3=600, cp_j_kgk=1600,
    ),
    "wood_hard": Material(
        id="wood_hard",
        description="Bois dur (chêne, hêtre)",
        lambda_w_mk=0.18, rho_kg_m3=800, cp_j_kgk=1600,
    ),
    "plywood": Material(
        id="plywood",
        description="Contreplaqué",
        lambda_w_mk=0.17, rho_kg_m3=700, cp_j_kgk=1600,
    ),
    "osb": Material(
        id="osb",
        description="Panneau OSB",
        lambda_w_mk=0.13, rho_kg_m3=650, cp_j_kgk=1700,
    ),
    "timber_frame": Material(
        id="timber_frame",
        description="Ossature bois (valeur équivalente)",
        lambda_w_mk=0.13, rho_kg_m3=600, cp_j_kgk=1600,
    ),
    # ── Pierres et granulats ──────────────────────────────────────────────────
    "stone_limestone": Material(
        id="stone_limestone",
        description="Pierre calcaire",
        lambda_w_mk=1.70, rho_kg_m3=2200, cp_j_kgk=840,
    ),
    "stone_granite": Material(
        id="stone_granite",
        description="Granit",
        lambda_w_mk=3.50, rho_kg_m3=2700, cp_j_kgk=840,
    ),
    # ── Étanchéité et complexes ───────────────────────────────────────────────
    "bitumen_membrane": Material(
        id="bitumen_membrane",
        description="Membrane bitumineuse (étanchéité)",
        lambda_w_mk=0.23, rho_kg_m3=1100, cp_j_kgk=1000,
    ),
    "air_gap": Material(
        id="air_gap",
        description="Lame d'air faiblement ventilée (R≈0,18 m²K/W pour 2 cm)",
        lambda_w_mk=0.18, rho_kg_m3=1.2, cp_j_kgk=1005,
    ),
    # ── Verre ─────────────────────────────────────────────────────────────────
    "glass": Material(
        id="glass",
        description="Verre silicocalcaire (vitre)",
        lambda_w_mk=1.00, rho_kg_m3=2500, cp_j_kgk=750,
    ),
}


def get_material(material_id: str) -> Material:
    """Retourne un matériau par son identifiant.

    Raises
    ------
    KeyError : si l'identifiant est inconnu.
    """
    try:
        return MATERIAL_DATABASE[material_id]
    except KeyError:
        available = ", ".join(sorted(MATERIAL_DATABASE))
        raise KeyError(
            f"Matériau inconnu : '{material_id}'. "
            f"Matériaux disponibles : {available}"
        ) from None
