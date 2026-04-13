"""
Scénarios de rénovation thermique.

Chaque RenovationAction transforme un Building en appliquant des modifications
aux éléments d'enveloppe ou aux systèmes énergétiques.

Architecture immutable : apply() retourne un nouveau Building (copie profonde).
"""

from __future__ import annotations
import copy
from dataclasses import dataclass, field
from typing import Literal

from thermal_engine.core.building import Building
from thermal_engine.core.zone import ThermalZone
from thermal_engine.core.envelope import OpaqueElement, WindowElement
from thermal_engine.core.materials import MaterialLayer
from thermal_engine.data.material_db import get_material
from thermal_engine.climate.epw_models import WeatherSeries
from thermal_engine.simulation.needs import (
    BuildingNeedsResult,
    compute_building_needs,
    CalibrationParams,
    _get_system_params,
    _SYSTEM_PARAMS,
    _COOLING_SYSTEM_PARAMS,
)


# ─────────────────────────────────────────────────────────────
# Actions de rénovation (classes)
# ─────────────────────────────────────────────────────────────

@dataclass
class RenovationAction:
    """Action de rénovation abstraite."""
    action_id: str
    label: str
    description: str
    cost_min_eur: float = 0.0
    cost_max_eur: float = 0.0

    @property
    def cost_center_eur(self) -> float:
        return (self.cost_min_eur + self.cost_max_eur) / 2.0

    def apply(self, building: Building) -> Building:
        raise NotImplementedError


@dataclass
class InsulateWalls(RenovationAction):
    insulation_material_id: str = "mineral_wool"
    insulation_thickness_m: float = 0.14

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        mat = get_material(self.insulation_material_id)
        ins_layer = MaterialLayer(material=mat, thickness_m=self.insulation_thickness_m)
        for zone in b.zones:
            new_elements = []
            for el in zone.opaque_elements:
                if el.element_type == "wall":
                    el = OpaqueElement(
                        element_id=el.element_id,
                        element_type=el.element_type,
                        layers=[ins_layer] + list(el.layers),
                        area_m2=el.area_m2,
                        azimuth_deg=el.azimuth_deg,
                        tilt_deg=el.tilt_deg,
                        absorptance_solar=el.absorptance_solar,
                        emittance_lw=el.emittance_lw,
                    )
                new_elements.append(el)
            zone.opaque_elements = new_elements
        return b


@dataclass
class InsulateRoof(RenovationAction):
    insulation_material_id: str = "mineral_wool"
    insulation_thickness_m: float = 0.25

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        mat = get_material(self.insulation_material_id)
        ins_layer = MaterialLayer(material=mat, thickness_m=self.insulation_thickness_m)
        for zone in b.zones:
            new_elements = []
            for el in zone.opaque_elements:
                if el.element_type == "roof":
                    el = OpaqueElement(
                        element_id=el.element_id,
                        element_type=el.element_type,
                        layers=[ins_layer] + list(el.layers),
                        area_m2=el.area_m2,
                        azimuth_deg=el.azimuth_deg,
                        tilt_deg=el.tilt_deg,
                    )
                new_elements.append(el)
            zone.opaque_elements = new_elements
        return b


@dataclass
class InsulateFloor(RenovationAction):
    insulation_material_id: str = "eps_insulation"
    insulation_thickness_m: float = 0.10

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        mat = get_material(self.insulation_material_id)
        ins_layer = MaterialLayer(material=mat, thickness_m=self.insulation_thickness_m)
        for zone in b.zones:
            new_elements = []
            for el in zone.opaque_elements:
                if el.element_type == "ground_floor":
                    el = OpaqueElement(
                        element_id=el.element_id,
                        element_type=el.element_type,
                        layers=[ins_layer] + list(el.layers),
                        area_m2=el.area_m2,
                        azimuth_deg=el.azimuth_deg,
                        tilt_deg=el.tilt_deg,
                    )
                new_elements.append(el)
            zone.opaque_elements = new_elements
        return b


@dataclass
class ReplaceWindows(RenovationAction):
    new_uw_w_m2k: float = 1.3
    new_g_value: float = 0.6
    # Supporte aussi les noms alternatifs depuis le router
    new_u_value_w_m2k: float | None = None

    def __post_init__(self):
        # Réconciliation des deux noms de champ
        if self.new_u_value_w_m2k is not None and self.new_uw_w_m2k == 1.3:
            self.new_uw_w_m2k = self.new_u_value_w_m2k

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        for zone in b.zones:
            zone.windows = [
                w.with_new_properties(
                    new_uw_w_m2k=self.new_uw_w_m2k,
                    new_g_value=self.new_g_value,
                )
                for w in zone.windows
            ]
        return b


@dataclass
class ReplaceHeatingSystem(RenovationAction):
    new_system_config: dict = field(default_factory=dict)
    # Noms alternatifs depuis _build_scenario
    new_system_type: str | None = None
    new_efficiency: float | None = None

    def __post_init__(self):
        if self.new_system_type is not None and not self.new_system_config:
            eff = self.new_efficiency or _SYSTEM_PARAMS.get(self.new_system_type, {}).get("eff", 1.0)
            # Une PAC réversible couvre chauffage ET refroidissement
            covers = ["heating", "cooling"] if self.new_system_type == "reversible_hp" else ["heating"]
            self.new_system_config = {
                "system_id": f"new_{self.new_system_type}",
                "type": self.new_system_type,
                "covers": covers,
                "efficiency_nominal": eff,
                "fuel": "electricity" if "heat_pump" in (self.new_system_type or "") else "natural_gas",
            }

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        if not self.new_system_config:
            return b
        covers_new = self.new_system_config.get("covers", ["heating"])
        if isinstance(covers_new, str):
            covers_new = [covers_new]
        for zone in b.zones:
            # Supprimer les systèmes existants couvrant les mêmes services
            new_systems = [
                s for s in zone.energy_systems
                if not any(
                    c in (s.get("covers", ["heating"]) if isinstance(s.get("covers"), list) else [s.get("covers", "heating")])
                    for c in covers_new
                )
            ]
            new_systems.append(self.new_system_config)
            zone.energy_systems = new_systems
        return b


@dataclass
class InstallCoolingSystem(RenovationAction):
    """Installe un système de refroidissement autonome (split, multisplit, réseau froid)."""
    system_type: str = "split_ac"
    cop: float = 2.8

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        cool_config = {
            "system_id": f"new_{self.system_type}",
            "type": self.system_type,
            "covers": ["cooling"],
            "efficiency_nominal": self.cop,
            "fuel": "electricity",
        }
        for zone in b.zones:
            # Ne pas remplacer si une PAC réversible couvre déjà le froid
            existing_covers_cooling = any(
                "cooling" in (s.get("covers", []) if isinstance(s.get("covers"), list) else [s.get("covers", "")])
                for s in zone.energy_systems
            )
            if not existing_covers_cooling:
                zone.energy_systems.append(cool_config)
        return b


@dataclass
class InstallMVHR(RenovationAction):
    heat_recovery_efficiency: float = 0.85

    def apply(self, building: Building) -> Building:
        b = copy.deepcopy(building)
        for zone in b.zones:
            zone.heat_recovery_eff = self.heat_recovery_efficiency
            # Si pas de ventilation mécanique, en créer une
            if zone.mechanical_vent_ach <= 0:
                zone.mechanical_vent_ach = max(0.5, zone.infiltration_ach)
                zone.infiltration_ach = 0.1
        return b


# ─────────────────────────────────────────────────────────────
# Scénario de rénovation
# ─────────────────────────────────────────────────────────────

@dataclass
class RenovationScenario:
    """Ensemble d'actions de rénovation à simuler ensemble."""
    scenario_id: str
    label: str
    description: str = ""
    actions: list[RenovationAction] = field(default_factory=list)

    @property
    def total_cost_min_eur(self) -> float:
        return sum(a.cost_min_eur for a in self.actions)

    @property
    def total_cost_max_eur(self) -> float:
        return sum(a.cost_max_eur for a in self.actions)

    @property
    def total_cost_center_eur(self) -> float:
        return (self.total_cost_min_eur + self.total_cost_max_eur) / 2.0

    def apply(self, building: Building) -> Building:
        """Applique toutes les actions séquentiellement."""
        b = building
        for action in self.actions:
            b = action.apply(b)
        return b


# ─────────────────────────────────────────────────────────────
# Résultat de rénovation
# ─────────────────────────────────────────────────────────────

@dataclass
class RenovationResult:
    """Résultat comparatif avant/après rénovation."""
    scenario: RenovationScenario
    baseline: BuildingNeedsResult
    after: BuildingNeedsResult

    @property
    def cost_savings_eur_per_year(self) -> float:
        heat_savings = self.baseline.cost_eur - self.after.cost_eur
        cool_savings = self.baseline.cooling_cost_eur - self.after.cooling_cost_eur
        return max(0.0, heat_savings + cool_savings)

    @property
    def simple_payback_years(self) -> float:
        savings = self.cost_savings_eur_per_year
        if savings <= 0:
            return float("inf")
        return self.scenario.total_cost_center_eur / savings

    @property
    def heating_reduction_pct(self) -> float:
        if self.baseline.heating_need_kwh <= 0:
            return 0.0
        return 100.0 * (1.0 - self.after.heating_need_kwh / self.baseline.heating_need_kwh)

    @property
    def dpe_improvement(self) -> int:
        """Nombre de classes DPE gagnées (positif = amélioration)."""
        letters = ["A", "B", "C", "D", "E", "F", "G"]
        before = letters.index(self.baseline.dpe_class) if self.baseline.dpe_class in letters else 6
        after  = letters.index(self.after.dpe_class)   if self.after.dpe_class   in letters else 6
        return before - after

    def to_dict(self) -> dict:
        actions_list = [
            {"action_id": a.action_id, "label": a.label, "description": getattr(a, "description", "")}
            for a in self.scenario.actions
        ]
        before_dict = self.baseline.to_dict()
        after_dict  = self.after.to_dict()
        return {
            "scenario_id":                  self.scenario.scenario_id,
            "scenario_label":               self.scenario.label,
            "scenario_description":         self.scenario.description,
            "actions":                      actions_list,
            "investment_min_eur":           round(self.scenario.total_cost_min_eur, 0),
            "investment_max_eur":           round(self.scenario.total_cost_max_eur, 0),
            "investment_center_eur":        round(self.scenario.total_cost_center_eur, 0),
            # DPE — noms canoniques + alias frontend
            "dpe_before":    self.baseline.dpe_class,
            "dpe_after":     self.after.dpe_class,
            "baseline_dpe":  self.baseline.dpe_class,   # alias frontend
            "after_dpe":     self.after.dpe_class,      # alias frontend
            "dpe_improvement":              self.dpe_improvement,
            "dpe_co2_before":               self.baseline.dpe_co2_class,
            "dpe_co2_after":                self.after.dpe_co2_class,
            "primary_energy_before_kwh_m2": round(self.baseline.primary_energy_kwh_m2, 1),
            "primary_energy_after_kwh_m2":  round(self.after.primary_energy_kwh_m2, 1),
            "heating_need_before_kwh":      round(self.baseline.heating_need_kwh, 1),
            "heating_need_after_kwh":       round(self.after.heating_need_kwh, 1),
            "heating_reduction_pct":        round(self.heating_reduction_pct, 1),
            "heating_need_reduction_pct":   round(self.heating_reduction_pct, 1),  # alias frontend
            "co2_before_kg_m2":             round(self.baseline.co2_kg_m2, 2),
            "co2_after_kg_m2":              round(self.after.co2_kg_m2, 2),
            # Froid
            "dpe_cooling_before":           self.baseline.dpe_cooling_class,
            "dpe_cooling_after":            self.after.dpe_cooling_class,
            "cooling_need_before_kwh":      round(self.baseline.cooling_need_kwh, 1),
            "cooling_need_after_kwh":       round(self.after.cooling_need_kwh, 1),
            "cooling_need_before_kwh_m2":   round(self.baseline.cooling_need_kwh_m2, 1),
            "cooling_need_after_kwh_m2":    round(self.after.cooling_need_kwh_m2, 1),
            "cooling_system_before":        self.baseline.cooling_system_type,
            "cooling_system_after":         self.after.cooling_system_type,
            "cooling_cost_before_eur":      round(self.baseline.cooling_cost_eur, 0),
            "cooling_cost_after_eur":       round(self.after.cooling_cost_eur, 0),
            "cooling_cost_savings_eur":     round(max(0.0, self.baseline.cooling_cost_eur - self.after.cooling_cost_eur), 0),
            "cost_savings_eur_per_year":    round(self.cost_savings_eur_per_year, 0),
            "simple_payback_years":         round(self.simple_payback_years, 1) if self.simple_payback_years != float("inf") else None,
            # Résultats complets — noms canoniques + alias frontend
            "before":        before_dict,
            "after":         after_dict,
            "baseline_full": before_dict,   # alias frontend
            "after_full":    after_dict,    # alias frontend
            # Scénario structuré pour _renderScenarioActions
            "scenario": {
                "label":       self.scenario.label,
                "description": self.scenario.description,
                "actions":     actions_list,
            },
        }


# ─────────────────────────────────────────────────────────────
# Fonctions de simulation
# ─────────────────────────────────────────────────────────────

def simulate_renovation(
    building: Building,
    scenario: RenovationScenario,
    weather: WeatherSeries,
    method: Literal["monthly", "hourly"] = "monthly",
    baseline: BuildingNeedsResult | None = None,
    calibration: dict[str, CalibrationParams] | None = None,
) -> RenovationResult:
    """Simule un scénario de rénovation et retourne le comparatif avant/après.

    Parameters
    ----------
    building    : bâtiment de référence (avant rénovation)
    scenario    : scénario à appliquer
    weather     : données météo
    method      : méthode de calcul ('monthly' ou 'hourly')
    baseline    : résultat de référence pré-calculé (évite un double calcul)
    calibration : paramètres de calibration
    """
    if baseline is None:
        baseline = compute_building_needs(building, weather, method, calibration)

    renovated = scenario.apply(building)
    after = compute_building_needs(renovated, weather, method, calibration)

    return RenovationResult(scenario=scenario, baseline=baseline, after=after)


def simulate_multiple_scenarios(
    building: Building,
    scenarios: list[RenovationScenario],
    weather: WeatherSeries,
    method: Literal["monthly", "hourly"] = "monthly",
    calibration: dict[str, CalibrationParams] | None = None,
) -> list[RenovationResult]:
    """Simule plusieurs scénarios avec baseline partagé (optimisation).

    Parameters
    ----------
    building   : bâtiment de référence
    scenarios  : liste de scénarios à comparer
    weather    : données météo
    method     : 'monthly' ou 'hourly'
    calibration: paramètres de calibration

    Returns
    -------
    Liste de RenovationResult dans le même ordre que scenarios.
    """
    # Calcul du baseline une seule fois
    baseline = compute_building_needs(building, weather, method, calibration)

    return [
        simulate_renovation(building, s, weather, method, baseline=baseline)
        for s in scenarios
    ]


def build_standard_scenarios(building: Building) -> list[RenovationScenario]:
    """Génère les 3 scénarios de rénovation standards.

    Scénarios :
    1. Confort+ : isolation combles + menuiseries (léger)
    2. Rénovation RT : isolation complète envelope (intermédiaire)
    3. BBC Réno : rénovation globale vers niveau BBC (ambitieux)
    """
    total_area = building.total_floor_area_m2

    # ── Scénario 1 : Confort+ ─────────────────────────────────
    scenario_light = RenovationScenario(
        scenario_id="confort_plus",
        label="Confort+",
        description="Isolation des combles, remplacement des fenêtres et climatisation split.",
        actions=[
            InsulateRoof(
                action_id="ins_roof_light",
                label="Isolation toiture",
                description="Isolation combles perdus (R ≥ 7 m²K/W)",
                insulation_material_id="mineral_wool",
                insulation_thickness_m=0.24,
                cost_min_eur=60.0 * total_area,
                cost_max_eur=100.0 * total_area,
            ),
            ReplaceWindows(
                action_id="win_light",
                label="Remplacement vitrages",
                description="Double vitrage performant (Uw ≤ 1,6 W/m²K)",
                new_uw_w_m2k=1.6,
                new_g_value=0.62,
                cost_min_eur=8000.0,
                cost_max_eur=15000.0,
            ),
            InstallCoolingSystem(
                action_id="cool_light",
                label="Climatisation split",
                description="Unités split (COP 2,8) pour le refroidissement",
                system_type="split_ac",
                cop=2.8,
                cost_min_eur=3000.0,
                cost_max_eur=6000.0,
            ),
        ],
    )

    # ── Scénario 2 : Rénovation RT ────────────────────────────
    scenario_medium = RenovationScenario(
        scenario_id="renovation_rt",
        label="Rénovation RT",
        description="Isolation complète de l'enveloppe + VMC + climatisation multisplit.",
        actions=[
            InsulateWalls(
                action_id="ins_walls_med",
                label="Isolation murs (ITE)",
                description="Isolation thermique par l'extérieur (R ≥ 3,7 m²K/W)",
                insulation_material_id="mineral_wool",
                insulation_thickness_m=0.14,
                cost_min_eur=150.0 * total_area,
                cost_max_eur=220.0 * total_area,
            ),
            InsulateRoof(
                action_id="ins_roof_med",
                label="Isolation toiture",
                description="Isolation combles (R ≥ 7 m²K/W)",
                insulation_material_id="mineral_wool",
                insulation_thickness_m=0.25,
                cost_min_eur=50.0 * total_area,
                cost_max_eur=80.0 * total_area,
            ),
            ReplaceWindows(
                action_id="win_med",
                label="Menuiseries performantes",
                description="Double vitrage (Uw ≤ 1,3 W/m²K)",
                new_uw_w_m2k=1.3,
                new_g_value=0.60,
                cost_min_eur=10000.0,
                cost_max_eur=18000.0,
            ),
            InstallMVHR(
                action_id="mvhr_med",
                label="VMC double flux",
                description="Ventilation avec récupération de chaleur (η = 80 %)",
                heat_recovery_efficiency=0.80,
                cost_min_eur=3000.0,
                cost_max_eur=5000.0,
            ),
            InstallCoolingSystem(
                action_id="cool_med",
                label="Climatisation multisplit",
                description="Système multisplit (COP 3,0) pour le refroidissement",
                system_type="multisplit",
                cop=3.0,
                cost_min_eur=5000.0,
                cost_max_eur=10000.0,
            ),
        ],
    )

    # ── Scénario 3 : BBC Réno ─────────────────────────────────
    scenario_heavy = RenovationScenario(
        scenario_id="bbc_reno",
        label="BBC Réno",
        description="Rénovation globale vers label BBC Rénovation avec PAC réversible (DPE B/A).",
        actions=[
            InsulateWalls(
                action_id="ins_walls_bbc",
                label="Super-isolation murs (ITE)",
                description="ITE haute performance (R ≥ 4,5 m²K/W)",
                insulation_material_id="mineral_wool",
                insulation_thickness_m=0.18,
                cost_min_eur=200.0 * total_area,
                cost_max_eur=300.0 * total_area,
            ),
            InsulateRoof(
                action_id="ins_roof_bbc",
                label="Isolation toiture maximale",
                description="Isolation combles (R ≥ 10 m²K/W)",
                insulation_material_id="mineral_wool",
                insulation_thickness_m=0.35,
                cost_min_eur=70.0 * total_area,
                cost_max_eur=110.0 * total_area,
            ),
            InsulateFloor(
                action_id="ins_floor_bbc",
                label="Isolation plancher bas",
                description="Isolation sous dalle (R ≥ 3 m²K/W)",
                insulation_material_id="eps_insulation",
                insulation_thickness_m=0.10,
                cost_min_eur=30.0 * total_area,
                cost_max_eur=50.0 * total_area,
            ),
            ReplaceWindows(
                action_id="win_bbc",
                label="Triple vitrage",
                description="Fenêtres triple vitrage (Uw ≤ 0,8 W/m²K)",
                new_uw_w_m2k=0.80,
                new_g_value=0.50,
                cost_min_eur=15000.0,
                cost_max_eur=25000.0,
            ),
            InstallMVHR(
                action_id="mvhr_bbc",
                label="VMC double flux HR",
                description="Ventilation double flux haute efficacité (η = 90 %)",
                heat_recovery_efficiency=0.90,
                cost_min_eur=4000.0,
                cost_max_eur=6000.0,
            ),
            ReplaceHeatingSystem(
                action_id="hp_bbc",
                label="PAC réversible air/eau",
                description="PAC réversible pour chauffage, ECS et refroidissement (COP 3,5)",
                new_system_type="reversible_hp",
                new_efficiency=3.50,
                cost_min_eur=12000.0,
                cost_max_eur=20000.0,
            ),
        ],
    )

    return [scenario_light, scenario_medium, scenario_heavy]
