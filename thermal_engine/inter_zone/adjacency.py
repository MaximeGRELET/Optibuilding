"""
Détection et modélisation des adjacences thermiques inter-zones.

Une ZoneAdjacency représente une surface partagée entre deux zones :
- plancher/plafond (zones superposées, même empreinte)
- paroi de séparation (zones côte à côte, arête commune)

La conductance thermique G_adj = U_adj × A_adj [W/K] est injectée
dans la matrice globale du CoupledBuildingSolver comme couplage entre Tair_z1 et Tair_z2.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field

from thermal_engine.core.materials import MaterialLayer
from thermal_engine.data.material_db import get_material


# ─────────────────────────────────────────────────────────────
# Données d'une adjacence
# ─────────────────────────────────────────────────────────────

@dataclass
class ZoneAdjacency:
    """Surface partagée entre deux zones thermiques.

    Parameters
    ----------
    zone_id_1       : identifiant de la première zone
    zone_id_2       : identifiant de la deuxième zone
    area_m2         : surface de la partition [m²]
    surface_type    : 'floor_ceiling' | 'partition_wall'
    layers          : composition de la partition (ext → int)
                      Si None → utiliser u_value_w_m2k directement
    u_value_w_m2k   : U-value de la partition [W/(m²·K)]
                      Calculé depuis layers si fourni, sinon valeur directe
    """
    zone_id_1: str
    zone_id_2: str
    area_m2: float
    surface_type: str = "floor_ceiling"  # 'floor_ceiling' | 'partition_wall'
    layers: list[MaterialLayer] | None = None
    _u_override: float | None = None

    @property
    def u_value_w_m2k(self) -> float:
        if self._u_override is not None:
            return self._u_override
        if self.layers:
            r_si = 0.10  # résistance surfacique intérieure (dalle)
            r_tot = r_si * 2 + sum(l.resistance_m2k_w for l in self.layers)
            return 1.0 / r_tot if r_tot > 0 else 0.0
        # Valeur par défaut selon le type
        return 1.5 if self.surface_type == "floor_ceiling" else 1.0

    @property
    def conductance_w_k(self) -> float:
        """Conductance totale de la surface partagée [W/K]."""
        return self.u_value_w_m2k * self.area_m2

    @classmethod
    def from_u_value(
        cls,
        zone_id_1: str,
        zone_id_2: str,
        area_m2: float,
        u_value_w_m2k: float,
        surface_type: str = "floor_ceiling",
    ) -> "ZoneAdjacency":
        """Construit une adjacence depuis un U-value direct."""
        adj = cls(zone_id_1=zone_id_1, zone_id_2=zone_id_2,
                  area_m2=area_m2, surface_type=surface_type)
        adj._u_override = u_value_w_m2k
        return adj

    @classmethod
    def concrete_floor_ceiling(
        cls,
        zone_id_1: str,
        zone_id_2: str,
        area_m2: float,
        thickness_m: float = 0.20,
    ) -> "ZoneAdjacency":
        """Plancher/plafond béton type (dalle standard)."""
        mat = get_material("concrete_dense")
        layers = [MaterialLayer(material=mat, thickness_m=thickness_m)]
        return cls(
            zone_id_1=zone_id_1,
            zone_id_2=zone_id_2,
            area_m2=area_m2,
            surface_type="floor_ceiling",
            layers=layers,
        )


# ─────────────────────────────────────────────────────────────
# Détection automatique depuis le GeoJSON
# ─────────────────────────────────────────────────────────────

def detect_adjacencies_from_geojson(geojson: dict) -> list[ZoneAdjacency]:
    """Détecte automatiquement les adjacences thermiques entre zones GeoJSON.

    Deux zones sont adjacentes si :
    1. Elles partagent la même empreinte (même polygone) → plancher/plafond
    2. Elles partagent une arête commune → cloison de séparation

    Parameters
    ----------
    geojson : FeatureCollection GeoJSON avec properties de zone

    Returns
    -------
    Liste de ZoneAdjacency détectées
    """
    features = geojson.get("features", [])
    adjacencies: list[ZoneAdjacency] = []
    n = len(features)

    for i in range(n):
        for j in range(i + 1, n):
            feat_a = features[i]
            feat_b = features[j]
            props_a = feat_a.get("properties", {})
            props_b = feat_b.get("properties", {})

            zone_id_a = str(props_a.get("zone_id", feat_a.get("id", f"zone_{i}")))
            zone_id_b = str(props_b.get("zone_id", feat_b.get("id", f"zone_{j}")))

            geom_a = feat_a.get("geometry", {})
            geom_b = feat_b.get("geometry", {})

            area_a = _polygon_area_m2(geom_a)
            area_b = _polygon_area_m2(geom_b)

            # ── Test 1 : empreintes identiques → plancher/plafond ──────
            shared_area = _shared_polygon_area(geom_a, geom_b)
            if shared_area > 1.0:
                # Surface partagée = min des deux emprises (en cas de chevauchement partiel)
                adj_area = min(shared_area, min(area_a, area_b))
                adjacencies.append(
                    ZoneAdjacency.concrete_floor_ceiling(zone_id_a, zone_id_b, adj_area)
                )
                continue

            # ── Test 2 : arête commune → cloison verticale ─────────────
            shared_edge_length = _shared_edge_length_m(geom_a, geom_b)
            if shared_edge_length > 0.5:
                # Hauteur partagée = min des deux hauteurs de zone
                h_a = float(props_a.get("height_m", 3.0))
                h_b = float(props_b.get("height_m", 3.0))
                partition_area = shared_edge_length * min(h_a, h_b)
                adjacencies.append(
                    ZoneAdjacency.from_u_value(
                        zone_id_a, zone_id_b,
                        partition_area,
                        u_value_w_m2k=1.5,   # cloison béton/brique standard
                        surface_type="partition_wall",
                    )
                )

    return adjacencies


# ─────────────────────────────────────────────────────────────
# Helpers géométriques
# ─────────────────────────────────────────────────────────────

def _polygon_coords_m(geometry: dict) -> list[tuple[float, float]]:
    """Convertit les coordonnées GeoJSON WGS84 → mètres (projection locale)."""
    try:
        coords = geometry["coordinates"][0]
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        lat_ref = sum(lats) / len(lats)
        m_per_lat = 111320.0
        m_per_lon = 111320.0 * math.cos(math.radians(lat_ref))
        return [
            ((c[0] - lons[0]) * m_per_lon, (c[1] - lats[0]) * m_per_lat)
            for c in coords
        ]
    except (KeyError, IndexError, TypeError):
        return []


def _polygon_area_m2(geometry: dict) -> float:
    pts = _polygon_coords_m(geometry)
    if len(pts) < 3:
        return 0.0
    n = len(pts)
    area = sum(
        pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
        for i in range(n)
    )
    return abs(area) / 2.0


def _shared_polygon_area(geom_a: dict, geom_b: dict) -> float:
    """Estime la surface partagée entre deux polygones (intersection)."""
    pts_a = _polygon_coords_m(geom_a)
    pts_b = _polygon_coords_m(geom_b)
    if not pts_a or not pts_b:
        return 0.0

    # Bounding boxes
    ax_min = min(p[0] for p in pts_a); ax_max = max(p[0] for p in pts_a)
    ay_min = min(p[1] for p in pts_a); ay_max = max(p[1] for p in pts_a)
    bx_min = min(p[0] for p in pts_b); bx_max = max(p[0] for p in pts_b)
    by_min = min(p[1] for p in pts_b); by_max = max(p[1] for p in pts_b)

    # Intersection des bounding boxes
    ix_min = max(ax_min, bx_min); ix_max = min(ax_max, bx_max)
    iy_min = max(ay_min, by_min); iy_max = min(ay_max, by_max)

    if ix_max <= ix_min or iy_max <= iy_min:
        return 0.0

    return (ix_max - ix_min) * (iy_max - iy_min)


def _shared_edge_length_m(geom_a: dict, geom_b: dict, tol: float = 0.5) -> float:
    """Calcule la longueur totale des arêtes communes entre deux polygones [m]."""
    pts_a = _polygon_coords_m(geom_a)
    pts_b = _polygon_coords_m(geom_b)
    if not pts_a or not pts_b:
        return 0.0

    def _edges(pts):
        return [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]

    total_shared = 0.0
    for ea in _edges(pts_a):
        for eb in _edges(pts_b):
            length = _edge_overlap_length(ea, eb, tol)
            total_shared += length
    return total_shared


def _edge_overlap_length(
    e1: tuple, e2: tuple, tol: float = 0.5
) -> float:
    """Longueur du segment en commun entre deux arêtes colinéaires [m]."""
    (x1, y1), (x2, y2) = e1
    (x3, y3), (x4, y4) = e2

    dx1, dy1 = x2 - x1, y2 - y1
    dx2, dy2 = x4 - x3, y4 - y3
    len1 = math.hypot(dx1, dy1)
    len2 = math.hypot(dx2, dy2)

    if len1 < tol or len2 < tol:
        return 0.0

    # Vérifier la colinéarité (produit vectoriel nul)
    cross = abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2)
    if cross > 0.01:  # pas colinéaires (> ~0.6°)
        return 0.0

    # Projection du segment 2 sur le segment 1
    t3 = ((x3 - x1) * dx1 + (y3 - y1) * dy1) / (len1 * len1)
    t4 = ((x4 - x1) * dx1 + (y4 - y1) * dy1) / (len1 * len1)
    tmin = max(0.0, min(t3, t4))
    tmax = min(1.0, max(t3, t4))

    if tmax <= tmin:
        return 0.0

    # Vérifier que les arêtes sont bien superposées (distance < tol)
    mid_t = (tmin + tmax) / 2.0
    mx = x1 + mid_t * dx1; my = y1 + mid_t * dy1
    mid_s = ((mx - x3) * dx2 + (my - y3) * dy2) / (len2 * len2)
    mid_s = max(0.0, min(1.0, mid_s))
    px = x3 + mid_s * dx2; py = y3 + mid_s * dy2
    dist = math.hypot(mx - px, my - py)

    if dist > tol:
        return 0.0

    return (tmax - tmin) * len1
