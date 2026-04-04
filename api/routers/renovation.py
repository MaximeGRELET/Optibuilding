"""Router — POST /renovation"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException

from thermal_engine.io.geojson_loader import load_building
from thermal_engine.simulation.renovation import (
    InsulateWalls,
    InsulateRoof,
    InsulateFloor,
    ReplaceWindows,
    ReplaceHeatingSystem,
    InstallMVHR,
    RenovationScenario,
    simulate_multiple_scenarios,
    build_standard_scenarios,
)

from thermal_engine.simulation.needs import compute_building_needs
from thermal_engine.simulation.renovation import simulate_renovation

from api.schemas import RenovationRequest, CustomScenario, SimulateActionsRequest
from api.dependencies import make_synthetic_weather
from api.routers.analysis import _extract_location

router = APIRouter(prefix="/renovation", tags=["renovation"])


@router.post("")
def run_renovation(req: RenovationRequest) -> dict:
    """
    Simulate renovation scenarios against a building baseline.

    Pass `use_standard_scenarios: true` to get the 3 built-in scenarios
    (Confort+, Rénovation RT, BBC), or provide `custom_scenarios` to define
    your own combination of actions.
    """
    geojson_dict = req.building.model_dump()
    try:
        building = load_building(geojson_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"GeoJSON invalide : {exc}") from exc

    lat, lon = _extract_location(geojson_dict)
    city = geojson_dict["features"][0]["properties"].get("city", "")
    weather = make_synthetic_weather(lat, lon, city)

    # Build scenarios list
    if req.use_standard_scenarios:
        scenarios = build_standard_scenarios(building)
    else:
        if not req.custom_scenarios:
            raise HTTPException(
                status_code=422,
                detail="Fournir au moins un scénario dans custom_scenarios ou activer use_standard_scenarios.",
            )
        scenarios = [_build_scenario(s) for s in req.custom_scenarios]

    try:
        # simulate_multiple_scenarios computes baseline internally
        results = simulate_multiple_scenarios(building, scenarios, weather, method=req.method)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    baseline = results[0].baseline if results else None
    return {
        "building_id": building.building_id,
        "baseline": baseline.to_dict() if baseline else {},
        "scenarios": [r.to_dict() for r in results],
    }


@router.post("/simulate")
def simulate_actions(req: SimulateActionsRequest) -> dict:
    """
    Simulate a custom set of enabled actions against a building baseline.

    Only the actions present in the `actions` list are applied (i.e. only
    send the ones the user has toggled on). Returns baseline + after result.
    """
    geojson_dict = req.building.model_dump()
    try:
        building = load_building(geojson_dict)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"GeoJSON invalide : {exc}") from exc

    if not req.actions:
        raise HTTPException(status_code=422, detail="Aucune action activée.")

    lat, lon = _extract_location(geojson_dict)
    city = geojson_dict["features"][0]["properties"].get("city", "")
    weather = make_synthetic_weather(lat, lon, city)

    try:
        actions = [_action_from_param(a) for a in req.actions]
        scenario = RenovationScenario(
            scenario_id="custom",
            label="Sélection personnalisée",
            description="Actions sélectionnées manuellement",
            actions=actions,
        )
        baseline = compute_building_needs(building, weather, method=req.method)
        result = simulate_renovation(building, scenario, weather, baseline=baseline)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur de simulation : {exc}") from exc

    return result.to_dict()


# ── Action factory ────────────────────────────────────────────────────────────

_ACTION_DEFAULTS = {
    "insulate_walls":   {"material_id": "mineral_wool", "thickness_m": 0.14, "cost_min_eur": 10000, "cost_max_eur": 20000},
    "insulate_roof":    {"material_id": "mineral_wool", "thickness_m": 0.25, "cost_min_eur": 5000,  "cost_max_eur": 8000},
    "insulate_floor":   {"material_id": "eps_insulation","thickness_m": 0.10, "cost_min_eur": 4000,  "cost_max_eur": 7000},
    "replace_windows":  {"new_uw_w_m2k": 1.3,            "g_value": 0.6,      "cost_min_eur": 8000,  "cost_max_eur": 15000},
    "replace_heating":  {"system_type": "heat_pump", "efficiency": 3.2, "cost_min_eur": 8000, "cost_max_eur": 14000},
    "install_mvhr":     {"heat_recovery_efficiency": 0.85,"cost_min_eur": 3000,"cost_max_eur": 5000},
}

from api.schemas import ActionParam  # noqa: E402 — local import to avoid circular


def _action_from_param(a: ActionParam):
    p = {**_ACTION_DEFAULTS.get(a.action_id, {}), **a.params}
    aid = a.action_id

    if aid == "insulate_walls":
        return InsulateWalls(
            action_id=aid, label="Isolation des murs", description="ITE ou ITI",
            insulation_material_id=p["material_id"],
            insulation_thickness_m=float(p["thickness_m"]),
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    if aid == "insulate_roof":
        return InsulateRoof(
            action_id=aid, label="Isolation toiture", description="Combles ou toiture-terrasse",
            insulation_material_id=p["material_id"],
            insulation_thickness_m=float(p["thickness_m"]),
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    if aid == "insulate_floor":
        return InsulateFloor(
            action_id=aid, label="Isolation plancher bas", description="Sous dalle",
            insulation_material_id=p["material_id"],
            insulation_thickness_m=float(p["thickness_m"]),
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    if aid == "replace_windows":
        return ReplaceWindows(
            action_id=aid, label="Remplacement vitrages", description="Double ou triple vitrage",
            new_uw_w_m2k=float(p.get("u_value_w_m2k", p.get("new_uw_w_m2k", 1.3))),
            new_g_value=float(p.get("g_value", 0.6)),
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    if aid == "replace_heating":
        sys_type = p.get("system_type", "heat_pump")
        efficiency = float(p.get("efficiency", 3.2))
        return ReplaceHeatingSystem(
            action_id=aid, label="Remplacement chauffage", description=f"Système : {sys_type}",
            new_system_config={
                "system_id": f"new_{sys_type}",
                "type": sys_type,
                "covers": "heating",
                "efficiency_nominal": efficiency,
                "fuel": "electricity" if sys_type in ("heat_pump", "electric_direct") else "natural_gas",
            },
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    if aid == "install_mvhr":
        return InstallMVHR(
            action_id=aid, label="VMC double flux", description="Récupération de chaleur",
            heat_recovery_efficiency=float(p["heat_recovery_efficiency"]),
            cost_min_eur=p["cost_min_eur"], cost_max_eur=p["cost_max_eur"],
        )
    raise ValueError(f"Action inconnue : {aid}")


def _build_scenario(cs: CustomScenario) -> RenovationScenario:
    """Convert a CustomScenario schema into a RenovationScenario domain object."""
    actions = []

    if cs.insulate_walls:
        p = cs.insulate_walls
        actions.append(InsulateWalls(
            action_id=f"{cs.scenario_id}_walls",
            label="Isolation des murs",
            description="ITE ou ITI",
            insulation_material_id=p.material_id,
            insulation_thickness_m=p.thickness_m,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if cs.insulate_roof:
        p = cs.insulate_roof
        actions.append(InsulateRoof(
            action_id=f"{cs.scenario_id}_roof",
            label="Isolation de la toiture",
            description="Isolation combles ou toiture-terrasse",
            insulation_material_id=p.material_id,
            insulation_thickness_m=p.thickness_m,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if cs.insulate_floor:
        p = cs.insulate_floor
        actions.append(InsulateFloor(
            action_id=f"{cs.scenario_id}_floor",
            label="Isolation du plancher bas",
            description="Isolation sous dalle",
            insulation_material_id=p.material_id,
            insulation_thickness_m=p.thickness_m,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if cs.replace_windows:
        p = cs.replace_windows
        actions.append(ReplaceWindows(
            action_id=f"{cs.scenario_id}_windows",
            label="Remplacement des vitrages",
            description="Double ou triple vitrage",
            new_u_value_w_m2k=p.u_value_w_m2k,
            new_g_value=p.g_value,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if cs.replace_heating:
        p = cs.replace_heating
        actions.append(ReplaceHeatingSystem(
            action_id=f"{cs.scenario_id}_heating",
            label="Remplacement système de chauffage",
            description=f"Nouveau système : {p.system_type}",
            new_system_type=p.system_type,
            new_efficiency=p.efficiency,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if cs.install_mvhr:
        p = cs.install_mvhr
        actions.append(InstallMVHR(
            action_id=f"{cs.scenario_id}_mvhr",
            label="Installation VMC double flux",
            description="Récupération de chaleur sur air extrait",
            heat_recovery_efficiency=p.heat_recovery_efficiency,
            cost_min_eur=p.cost_min_eur,
            cost_max_eur=p.cost_max_eur,
        ))

    if not actions:
        raise ValueError(f"Le scénario '{cs.scenario_id}' ne contient aucune action.")

    return RenovationScenario(
        scenario_id=cs.scenario_id,
        label=cs.label,
        description=cs.description,
        actions=actions,
    )
