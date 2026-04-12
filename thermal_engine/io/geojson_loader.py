"""
Chargement d'un bâtiment depuis un fichier ou dictionnaire GeoJSON.

Format attendu : FeatureCollection où chaque Feature est une zone thermique.
Voir examples/batiment_mixte_lyon.geojson pour un exemple complet.
"""

from __future__ import annotations
import json
import math
from pathlib import Path
from typing import Any

from thermal_engine.core.materials import MaterialLayer
from thermal_engine.core.envelope import OpaqueElement, WindowElement, InternalMass
from thermal_engine.core.zone import ThermalZone
from thermal_engine.core.building import Building
from thermal_engine.data.material_db import MATERIAL_DATABASE, get_material


# Rapport fenêtres/murs par défaut si non spécifié dans le GeoJSON
_DEFAULT_WWR: dict[str, float] = {
    "north": 0.15, "south": 0.25, "east": 0.15, "west": 0.15,
}

# Azimuts des orientations cardinales [°] — convention 0=N, 90=E, 180=S, 270=W
_ORIENTATION_AZIMUTH: dict[str, float] = {
    "north": 0.0, "east": 90.0, "south": 180.0, "west": 270.0,
}

# Mapping des clés d'orientation abrégées (frontend) vers les clés complètes
_ORIENT_KEY_MAP: dict[str, str] = {
    "N": "north", "S": "south", "E": "east", "W": "west", "O": "west",
    "north": "north", "south": "south", "east": "east", "west": "west",
}

# Mapping des types de zone frontend vers les usages loader
_ZONE_TYPE_MAP: dict[str, str] = {
    "residential": "residential",
    "office": "office",
    "commercial": "commercial",
    "industrial": "industrial",
    "education": "education",
    "healthcare": "healthcare",
}

# Estimation du facteur de ponts thermiques selon la qualité déclarée
_THERMAL_BRIDGE_FACTOR: dict[str, float] = {
    "none":    0.00,  # Bâtiment avec traitement parfait des ponts
    "good":    0.02,  # Bâtiment récent bien conçu
    "default": 0.05,  # Défaut RE 2020 (5 % des déperditions par paroi)
    "poor":    0.10,  # Bâtiment ancien non traité
}


# ─────────────────────────────────────────────────────────────
# Point d'entrée public
# ─────────────────────────────────────────────────────────────

def load_building(source: str | Path | dict) -> Building:
    """Charge un Building depuis un GeoJSON (fichier ou dict Python).

    Parameters
    ----------
    source : chemin vers un fichier .geojson, ou dict déjà parsé

    Returns
    -------
    Building avec toutes ses zones thermiques
    """
    if isinstance(source, (str, Path)):
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"GeoJSON introuvable : {path}")
        with path.open(encoding="utf-8") as fh:
            geojson = json.load(fh)
    else:
        geojson = source

    _validate_geojson(geojson)

    building_id = (
        geojson.get("id")
        or geojson.get("properties", {}).get("building_id", "building_001")
    )
    name = geojson.get("properties", {}).get("name", building_id)

    zones = [_parse_zone(feat) for feat in geojson["features"]]

    return Building(building_id=str(building_id), name=str(name), zones=zones)


# ─────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────

def _validate_geojson(g: dict) -> None:
    if g.get("type") != "FeatureCollection":
        raise ValueError("GeoJSON : 'type' doit être 'FeatureCollection'.")
    if not isinstance(g.get("features"), list) or not g["features"]:
        raise ValueError("GeoJSON : 'features' doit être une liste non vide.")


# ─────────────────────────────────────────────────────────────
# Parsing d'une zone (Feature GeoJSON)
# ─────────────────────────────────────────────────────────────

def _normalize_envelope(env: dict) -> dict:
    """Normalise l'enveloppe du format frontend vers le format loader.

    Accepte :
    - ``walls/roof/ground_floor.layers`` (frontend) → ``composition.layers``
    - ``windows.u_value_w_m2k`` (frontend) → ``glazing.uw_w_m2k``
    - Clés d'orientation abrégées ``S/N/E/W/O`` → ``south/north/east/west``
    """
    env = dict(env)
    for key in ("walls", "roof", "ground_floor"):
        if key in env:
            section = dict(env[key])
            if "layers" in section and "composition" not in section:
                section["composition"] = {"layers": section.pop("layers")}
            env[key] = section

    if "windows" in env:
        win = dict(env["windows"])
        glazing = dict(win.get("glazing", {}))
        # Accept flat u_value_w_m2k / g_value / frame_factor at window level
        for src, dst in (("u_value_w_m2k", "uw_w_m2k"), ("g_value", "g_value"), ("frame_factor", "frame_factor")):
            if src in win and dst not in glazing:
                glazing[dst] = win[src]
        if glazing:
            win["glazing"] = glazing
        # Normalize orientation keys
        if "wwr_by_orientation" in win:
            win["wwr_by_orientation"] = {
                _ORIENT_KEY_MAP.get(k, k): v
                for k, v in win["wwr_by_orientation"].items()
            }
        env["windows"] = win
    return env


def _normalize_props(props: dict) -> dict:
    """Accepte le format GeoJSON du frontend (noms de propriétés alternatifs).

    Toutes les conversions sont non-destructives : si la clé canonique existe
    déjà, elle est conservée telle quelle.
    """
    p = dict(props)

    # n_floors ← floors
    if "n_floors" not in p and "floors" in p:
        p["n_floors"] = p["floors"]

    # year_built ← construction_year
    if "year_built" not in p and "construction_year" in p:
        p["year_built"] = p["construction_year"]

    # usage ← zone_type
    if "usage" not in p and "zone_type" in p:
        p["usage"] = _ZONE_TYPE_MAP.get(str(p["zone_type"]), str(p["zone_type"]))

    # construction_class ← thermal_mass_class
    if "construction_class" not in p and "thermal_mass_class" in p:
        p["construction_class"] = p["thermal_mass_class"]

    # ventilation ← top-level infiltration_ach / mechanical_vent_ach / heat_recovery_eff
    if "ventilation" not in p:
        vent: dict[str, Any] = {}
        if "infiltration_ach" in p:
            vent["air_change_rate_h"] = p["infiltration_ach"]
        if "mechanical_vent_ach" in p:
            vent["type"] = "mechanical"
            vent["air_change_rate_h"] = p.get("mechanical_vent_ach", p.get("infiltration_ach", 0.5))
        if "heat_recovery_eff" in p:
            vent["heat_recovery_efficiency"] = p["heat_recovery_eff"]
        if vent:
            p["ventilation"] = vent

    # energy_systems ← energy_system (singular dict)
    if "energy_systems" not in p and "energy_system" in p:
        es = p["energy_system"]
        p["energy_systems"] = [es] if isinstance(es, dict) else list(es)

    # envelope normalization
    if "envelope" in p:
        p["envelope"] = _normalize_envelope(p["envelope"])

    return p


def _parse_zone(feature: dict) -> ThermalZone:
    props = _normalize_props(feature.get("properties", {}))
    geom  = feature.get("geometry", {})

    zone_id    = str(props.get("zone_id", feature.get("id", "zone_001")))
    zone_label = str(props.get("zone_label", zone_id))
    usage      = str(props.get("usage", "residential"))
    height_m   = float(props.get("height_m", 3.0))
    n_floors   = int(props.get("n_floors", 1))
    year_built = int(props.get("year_built", 1980))

    # ── Géométrie ─────────────────────────────────────────────
    footprint_m2  = _polygon_area_m2(geom)
    floor_area_m2 = footprint_m2 * n_floors   # surface utile totale (SHON)
    volume_m3     = footprint_m2 * height_m   # volume volumétrique
    perimeter_m   = _polygon_perimeter_m(geom)

    # ── Enveloppe ─────────────────────────────────────────────
    env_props    = props.get("envelope", {})
    tb_quality   = env_props.get("thermal_bridge_quality", "default")
    tb_factor    = _THERMAL_BRIDGE_FACTOR.get(tb_quality, 0.05)

    opaque_elements: list[OpaqueElement] = []
    windows: list[WindowElement] = []

    # Murs
    walls_comp = _parse_composition(env_props.get("walls", {}).get("composition", {}))
    win_props  = env_props.get("windows", {})
    glaz_props = win_props.get("glazing", {})
    wwr_by_or  = win_props.get("wwr_by_orientation", _DEFAULT_WWR)

    wall_height_m = height_m / n_floors  # hauteur par niveau
    for orient, az_deg in _ORIENTATION_AZIMUTH.items():
        wall_area_gross = (perimeter_m / 4.0) * wall_height_m * n_floors
        wwr = wwr_by_or.get(orient, 0.15)
        win_area = wall_area_gross * wwr
        wall_area_net = wall_area_gross - win_area

        if wall_area_net > 0.01 and walls_comp:
            opaque_elements.append(OpaqueElement(
                element_id=f"{zone_id}_wall_{orient}",
                element_type="wall",
                layers=walls_comp,
                area_m2=wall_area_net,
                azimuth_deg=az_deg,
                tilt_deg=90.0,
            ))

        if win_area > 0.01:
            windows.append(WindowElement(
                element_id=f"{zone_id}_win_{orient}",
                area_m2=win_area,
                uw_w_m2k=float(glaz_props.get("uw_w_m2k", 2.8)),
                g_value=float(glaz_props.get("g_value", 0.70)),
                frame_factor=float(glaz_props.get("frame_factor", 0.70)),
                azimuth_deg=az_deg,
                tilt_deg=90.0,
            ))

    # Toiture
    roof_comp = _parse_composition(env_props.get("roof", {}).get("composition", {}))
    if roof_comp:
        opaque_elements.append(OpaqueElement(
            element_id=f"{zone_id}_roof",
            element_type="roof",
            layers=roof_comp,
            area_m2=footprint_m2,
            azimuth_deg=0.0,
            tilt_deg=0.0,
        ))
    elif props.get("has_roof", True) or not env_props.get("roof"):
        # Toiture par défaut si absente (béton + isolant)
        opaque_elements.append(_default_roof(zone_id, footprint_m2))

    # Plancher bas (sol ou dalle)
    if props.get("is_ground_floor", False):
        gf_comp = _parse_composition(env_props.get("ground_floor", {}).get("composition", {}))
        if not gf_comp:
            gf_comp = _default_ground_floor_layers()
        opaque_elements.append(OpaqueElement(
            element_id=f"{zone_id}_ground_floor",
            element_type="ground_floor",
            layers=gf_comp,
            area_m2=footprint_m2,
            azimuth_deg=0.0,
            tilt_deg=0.0,
        ))

    # ── Masse interne ─────────────────────────────────────────
    internal_masses = [_make_internal_mass(zone_id, floor_area_m2, props.get("construction_class", "medium"))]

    # ── Ventilation ───────────────────────────────────────────
    vent_props = props.get("ventilation", {})
    infil_ach  = float(vent_props.get("air_change_rate_h", 0.5))
    hrec_eff   = float(vent_props.get("heat_recovery_efficiency", 0.0))
    mech_ach   = infil_ach if vent_props.get("type", "natural") != "natural" else 0.0
    infil_ach  = min(infil_ach, 0.5) if mech_ach > 0 else infil_ach

    # ── Ponts thermiques ──────────────────────────────────────
    ht_opaque = sum(el.u_value_w_m2k * el.area_m2 for el in opaque_elements)
    ht_glazing = sum(w.uw_w_m2k * w.area_m2 for w in windows)
    tb_w_k = tb_factor * (ht_opaque + ht_glazing)

    # ── Systèmes énergétiques ─────────────────────────────────
    energy_systems = props.get("energy_systems", [])

    return ThermalZone(
        zone_id=zone_id,
        label=zone_label,
        usage=usage,
        floor_area_m2=floor_area_m2,
        volume_m3=volume_m3,
        opaque_elements=opaque_elements,
        windows=windows,
        internal_masses=internal_masses,
        infiltration_ach=infil_ach,
        mechanical_vent_ach=mech_ach,
        heat_recovery_eff=hrec_eff,
        thermal_bridge_w_k=tb_w_k,
        year_built=year_built,
        energy_systems=energy_systems,
    )


# ─────────────────────────────────────────────────────────────
# Helpers géométriques
# ─────────────────────────────────────────────────────────────

def _polygon_area_m2(geometry: dict) -> float:
    """Calcule la surface d'un polygone GeoJSON en m².

    Utilise la formule de Gauss avec projection locale WGS84→m.
    """
    try:
        coords = geometry["coordinates"][0]  # anneau extérieur
        if len(coords) < 3:
            return 100.0
        # Centroïde pour projection
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        lat_ref = sum(lats) / len(lats)
        # 1° lat ≈ 111 320 m ; 1° lon ≈ 111 320 × cos(lat) m
        m_per_lat = 111320.0
        m_per_lon = 111320.0 * math.cos(math.radians(lat_ref))
        x = [(c[0] - lons[0]) * m_per_lon for c in coords]
        y = [(c[1] - lats[0]) * m_per_lat for c in coords]
        # Formule de Gauss-Shoelace
        n = len(x)
        area = 0.0
        for i in range(n - 1):
            area += x[i] * y[i + 1] - x[i + 1] * y[i]
        return abs(area) / 2.0 or 100.0
    except (KeyError, IndexError, TypeError):
        return 100.0


def _polygon_perimeter_m(geometry: dict) -> float:
    """Calcule le périmètre d'un polygone GeoJSON en m."""
    try:
        coords = geometry["coordinates"][0]
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        lat_ref = sum(lats) / len(lats)
        m_per_lat = 111320.0
        m_per_lon = 111320.0 * math.cos(math.radians(lat_ref))
        perim = 0.0
        for i in range(len(coords) - 1):
            dx = (coords[i + 1][0] - coords[i][0]) * m_per_lon
            dy = (coords[i + 1][1] - coords[i][1]) * m_per_lat
            perim += math.hypot(dx, dy)
        return perim or 40.0
    except (KeyError, IndexError, TypeError):
        return 40.0


# ─────────────────────────────────────────────────────────────
# Helpers composition de paroi
# ─────────────────────────────────────────────────────────────

def _parse_composition(comp_dict: dict) -> list[MaterialLayer]:
    """Construit la liste de MaterialLayer depuis le dict GeoJSON 'composition'."""
    layers_raw = comp_dict.get("layers", [])
    layers: list[MaterialLayer] = []
    for raw in layers_raw:
        mat_id = raw.get("material_id", "concrete_dense")
        thickness = float(raw.get("thickness_m", 0.20))
        try:
            mat = get_material(mat_id)
        except KeyError:
            mat = get_material("concrete_dense")
        layers.append(MaterialLayer(material=mat, thickness_m=thickness))
    return layers


def _default_roof(zone_id: str, floor_area_m2: float) -> OpaqueElement:
    """Crée une toiture par défaut (béton + isolant minéral)."""
    from thermal_engine.core.materials import MaterialLayer
    layers = [
        MaterialLayer(material=get_material("concrete_dense"), thickness_m=0.20),
        MaterialLayer(material=get_material("mineral_wool"), thickness_m=0.10),
        MaterialLayer(material=get_material("bitumen_membrane"), thickness_m=0.005),
    ]
    return OpaqueElement(
        element_id=f"{zone_id}_roof",
        element_type="roof",
        layers=layers,
        area_m2=floor_area_m2,
        azimuth_deg=0.0,
        tilt_deg=0.0,
    )


def _default_ground_floor_layers() -> list[MaterialLayer]:
    """Couches par défaut pour le plancher sur sol."""
    return [
        MaterialLayer(material=get_material("concrete_dense"), thickness_m=0.20),
        MaterialLayer(material=get_material("screed"), thickness_m=0.05),
    ]


def _make_internal_mass(
    zone_id: str,
    floor_area_m2: float,
    construction_class: str,
) -> InternalMass:
    """Crée une masse interne type selon la classe de construction.

    construction_class :
        'heavy' → béton (forte inertie)
        'medium' → brique (inertie moyenne)
        'light' → bois/ossature (faible inertie)
    """
    from thermal_engine.core.materials import MaterialLayer

    cc = construction_class.lower()
    if cc == "heavy":
        surf_mat = MaterialLayer(get_material("concrete_dense"), 0.10)
        core_mat = MaterialLayer(get_material("concrete_dense"), 0.10)
        area_factor = 2.5
    elif cc == "light":
        surf_mat = MaterialLayer(get_material("wood_soft"), 0.03)
        core_mat = MaterialLayer(get_material("wood_soft"), 0.05)
        area_factor = 1.5
    else:  # medium
        surf_mat = MaterialLayer(get_material("brick_hollow"), 0.10)
        core_mat = MaterialLayer(get_material("brick_hollow"), 0.10)
        area_factor = 2.0

    return InternalMass(
        mass_id=f"{zone_id}_internal_mass",
        area_m2=floor_area_m2 * area_factor,
        surface_material=surf_mat,
        core_material=core_mat,
    )
