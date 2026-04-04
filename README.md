# OptiBuilding

Moteur de calcul énergétique des bâtiments en Python — analyse physique des déperditions thermiques, classification DPE et simulation de scénarios de rénovation.

---

## Vue d'ensemble

OptiBuilding est structuré en deux bibliothèques complémentaires :

| Package | Rôle |
|---|---|
| `optibuilding/` | Moteur v1 — estimations statistiques (ratios kWh/m²/an) |
| `optibuilding_physics/` | Moteur v2 — calcul physique complet (ISO 13790, EPW, GeoJSON) |

---

## Installation

```bash
pip install numpy pandas scipy shapely
```

---

## Utilisation rapide

### 1. Décrire le bâtiment (GeoJSON)

Chaque bâtiment est un fichier `FeatureCollection` GeoJSON.  
Chaque `Feature` représente une **zone thermique**, décrite par :
- son **emprise 2D** (polygone WGS84 ou métrique)
- sa **hauteur** et son **nombre de niveaux**
- la **composition de son enveloppe** (couches de matériaux)
- ses **systèmes énergétiques** et sa **ventilation**

```json
{
  "type": "FeatureCollection",
  "properties": {
    "building_id": "mon_batiment",
    "name": "Maison Lyon",
    "location": { "city": "Lyon", "latitude": 45.756, "longitude": 4.854 }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[4.854, 45.756], [4.8543, 45.756],
                          [4.8543, 45.7563], [4.854, 45.7563], [4.854, 45.756]]]
      },
      "properties": {
        "zone_id": "zone_principale",
        "usage": "residential",
        "height_m": 6.0,
        "n_floors": 2,
        "year_built": 1978,
        "envelope": {
          "walls": {
            "composition": {
              "layers": [
                { "material_id": "brick_hollow",  "thickness_m": 0.20 },
                { "material_id": "mineral_wool",  "thickness_m": 0.10 },
                { "material_id": "plasterboard",  "thickness_m": 0.013 }
              ]
            }
          },
          "windows": {
            "wwr_by_orientation": { "north": 0.15, "south": 0.35, "east": 0.20, "west": 0.20 },
            "glazing": { "uw_w_m2k": 2.8, "g_value": 0.70 }
          }
        },
        "ventilation": { "type": "natural", "air_change_rate_h": 0.6 },
        "energy_systems": [
          { "system_id": "chaudiere", "type": "gas_boiler", "fuel": "natural_gas",
            "covers": ["heating", "dhw"], "efficiency_nominal": 0.87 }
        ]
      }
    }
  ]
}
```

### 2. Charger le fichier EPW

Les fichiers EPW (EnergyPlus Weather) sont disponibles sur [energyplus.net/weather](https://energyplus.net/weather).

```python
from optibuilding_physics import load_building, parse_epw, compute_building_needs

building = load_building("mon_batiment.geojson")
weather  = parse_epw("FRA_Lyon.epw")
```

### 3. Calculer les besoins énergétiques

```python
# Méthode mensuelle ISO 13790 (standard DPE)
result = compute_building_needs(building, weather, method="monthly")

print(result.dpe_class)                # "D"
print(result.primary_energy_kwh_m2)   # 211.7 kWh EP/m²/an
print(result.cost_eur)                 # 8 734 €/an
```

### 4. Simuler des scénarios de rénovation

```python
from optibuilding_physics import (
    build_standard_scenarios,
    simulate_multiple_scenarios,
    build_renovation_report,
    save_report,
)

# Génère automatiquement 3 scénarios (léger / intermédiaire / BBC)
scenarios = build_standard_scenarios(building)
results   = simulate_multiple_scenarios(building, scenarios, weather)

for res in results:
    print(f"{res.scenario.label:<30} DPE: {res.after.dpe_class}  "
          f"ROI: {res.simple_payback_years:.1f} ans  "
          f"Économie: {res.cost_savings_eur_per_year:,.0f} €/an")

# Export JSON pour interface
report = build_renovation_report(results, weather)
save_report(report, "scenarios.json")
```

### 5. Composer ses propres actions de rénovation

```python
from optibuilding_physics import (
    RenovationScenario, InsulateWalls, ReplaceWindows,
    ReplaceHeatingSystem, InstallMVHR, simulate_renovation,
)

scenario = RenovationScenario(
    scenario_id = "custom",
    label       = "Ma rénovation",
    description = "ITE + PAC + VMC double flux",
    actions     = [
        InsulateWalls(
            action_id="ite", label="ITE laine de roche",
            description="R=4.5 m²K/W",
            insulation_material_id="mineral_wool_hd",
            insulation_thickness_m=0.16,
            position="exterior",
            cost_min_eur=18_000, cost_max_eur=25_000,
        ),
        ReplaceHeatingSystem(
            action_id="pac", label="PAC air/eau",
            description="SCOP 3.5",
            new_system_config={
                "system_id": "pac", "type": "heat_pump_air_water",
                "fuel": "electricity", "covers": ["heating", "dhw"],
                "efficiency_nominal": 3.5,
            },
            cost_min_eur=12_000, cost_max_eur=18_000,
        ),
        InstallMVHR(
            action_id="vmc", label="VMC double flux",
            description="η=85%",
            heat_recovery_efficiency=0.85,
            cost_min_eur=6_000, cost_max_eur=9_000,
        ),
    ],
)

result = simulate_renovation(building, scenario, weather)
print(result.to_dict())
```

---

## Architecture

```
optibuilding_physics/
├── core/
│   ├── geometry.py       # Emprise 2D → surfaces, azimuths, adjacences (Shapely)
│   ├── thermal.py        # U-values ISO 6946, U-sol ISO 13370, H_T, inertie
│   ├── ventilation.py    # H_V, VMC double flux, infiltrations
│   ├── solar.py          # Position solaire (Spencer), irradiance Hay-Davies
│   ├── schedules.py      # Profils d'occupation par usage
│   └── systems.py        # PAC (COP Carnot), chaudières, DPE
│
├── climate/
│   └── epw_parser.py     # Parse les fichiers .epw → WeatherSeries (8760 h)
│
├── models/
│   ├── building.py       # Building, Zone, EnvelopeConfig
│   ├── materials.py      # MaterialLayer, LayeredComposition
│   └── energy_systems.py # GasBoiler, HeatPump, SolarThermal, VentilationSystem
│
├── simulation/
│   ├── needs.py          # ISO 13790 mensuel + simulation horaire RC
│   └── renovation.py     # Actions immuables + RenovationScenario
│
├── io/
│   ├── geojson_loader.py # GeoJSON → BuildingModel
│   └── report_builder.py # Rapports JSON
│
└── data/
    ├── material_db.py          # ~30 matériaux (λ, ρ, Cp) selon EN ISO 10456
    └── thermal_bridges_db.py   # Coefficients Ψ selon EN ISO 14683
```

### Flux de données

```
GeoJSON  ──► geojson_loader ──► BuildingModel ─┐
EPW      ──► epw_parser     ──► WeatherSeries  ─┤─► compute_building_needs ──► BuildingNeedsResult
                                                 │
RenovationScenario ──► actions.apply(building) ──┘         │
                                                            ▼
                                                     save_report → JSON
```

---

## Méthodes de calcul

### Besoins thermiques — ISO 13790

**Méthode mensuelle** (défaut, rapide) :
- Calcul du coefficient H_T (transmission) par élément d'enveloppe
- Calcul du coefficient H_V (ventilation + infiltrations)
- Apports solaires via irradiance Hay-Davies sur chaque fenêtre
- Facteur d'utilisation des apports η selon la constante de temps thermique τ
- Besoin net : `Q_H = max(0, Q_pertes - η × Q_apports)`

**Méthode horaire** (optionnelle, plus précise) :
- Modèle RC à 1 nœud, schéma d'Euler implicite
- Résolution sur les 8760 heures de l'année EPW

### Ponts thermiques
Coefficients Ψ selon EN ISO 14683, 3 niveaux de qualité (`default` / `improved` / `optimised`).

### Plancher bas sur terre-plein
U-value selon EN ISO 13370 (dimension caractéristique B').

### DPE
Double critère décret 2021 : max(classe EP, classe CO₂).

### Systèmes énergétiques
- **PAC** : COP instantané = fraction du COP de Carnot × f(T_source, T_départ)
- **Chaudières** : rendement nominal × correction charge partielle
- **Solaire thermique** : modèle EN ISO 9806 (η = η₀ - a₁·ΔT/G - a₂·ΔT²/G)

---

## Schéma GeoJSON — propriétés disponibles

### Au niveau du bâtiment (`FeatureCollection.properties`)

| Champ | Type | Description |
|---|---|---|
| `building_id` | string | Identifiant unique |
| `name` | string | Nom du bâtiment |
| `location.city` | string | Ville |
| `location.latitude` | float | Latitude WGS84 |
| `location.longitude` | float | Longitude WGS84 |

### Au niveau de la zone (`Feature.properties`)

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `zone_id` | string | — | Identifiant unique de la zone |
| `usage` | string | `"residential"` | `residential` / `office` / `retail` / `restaurant` / `school` |
| `height_m` | float | 3.0 | Hauteur totale de la zone [m] |
| `n_floors` | int | auto | Nombre de niveaux |
| `year_built` | int | 1975 | Année de construction |
| `is_ground_floor` | bool | true | Contact avec le sol |
| `construction_class` | string | `"medium"` | Inertie : `very_light` / `light` / `medium` / `heavy` / `very_heavy` |
| `envelope.walls.composition.layers` | array | selon époque | Couches de matériaux |
| `envelope.windows.wwr_by_orientation` | dict | selon époque | Ratio vitrage/mur par orientation |
| `envelope.thermal_bridge_quality` | string | `"default"` | `default` / `improved` / `optimised` |
| `ventilation.type` | string | `"natural"` | `natural` / `mec_extract` / `mec_double_flux` |
| `ventilation.air_change_rate_h` | float | selon époque | Taux de renouvellement [vol/h] |
| `energy_systems` | array | selon époque | Liste des systèmes énergétiques |

### Types de systèmes (`energy_systems[].type`)

| Type | Description |
|---|---|
| `gas_boiler` | Chaudière gaz standard |
| `condensing_boiler` | Chaudière gaz à condensation |
| `fuel_oil_boiler` | Chaudière fioul |
| `electric_resistance` | Chauffage électrique effet Joule |
| `heat_pump_air_water` | PAC air/eau |
| `heat_pump_ground_water` | PAC eau/eau (nappe ou géothermie) |
| `wood_boiler` | Chaudière biomasse (granulés, plaquettes, bûches) |
| `district_heating` | Réseau de chaleur urbain |
| `solar_thermal` | Capteurs solaires thermiques |

### Matériaux disponibles (sélection)

| `material_id` | Description | λ [W/m·K] |
|---|---|---|
| `concrete_dense` | Béton lourd | 2.30 |
| `brick_hollow` | Brique creuse | 0.32 |
| `stone_limestone` | Pierre calcaire | 1.40 |
| `mineral_wool` | Laine minérale | 0.035 |
| `mineral_wool_hd` | Laine minérale HD | 0.032 |
| `eps_insulation` | Polystyrène expansé | 0.038 |
| `xps_insulation` | Polystyrène extrudé | 0.034 |
| `pur_pir_insulation` | PUR / PIR | 0.022 |
| `wood_fiber` | Fibre de bois | 0.038 |
| `cellulose_blown` | Ouate de cellulose | 0.040 |
| `plasterboard` | Plaque de plâtre | 0.21 |

Liste complète : [`optibuilding_physics/data/material_db.py`](optibuilding_physics/data/material_db.py)

---

## Démo

```bash
# Sans fichier EPW (données synthétiques Lyon)
python -X utf8 main_physics.py

# Avec un fichier EPW réel
python -X utf8 main_physics.py path/to/FRA_Lyon.epw
```

Les rapports JSON sont exportés dans `examples/output/`.

---

## Dépendances

| Librairie | Usage |
|---|---|
| `numpy` | Calculs vectorisés sur 8760 heures |
| `pandas` | Séries temporelles EPW, agrégation mensuelle |
| `scipy` | (réservé pour extensions futures) |
| `shapely` | Géométrie 2D : aires, adjacences entre zones |
