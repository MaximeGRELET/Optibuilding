# Thermal Engine — Documentation technique

Moteur de calcul thermique physique d'OptiBuilding.

Implémente la chaîne complète de simulation énergétique du bâtiment : besoins de chauffage/refroidissement, systèmes HVAC, confort thermique, énergies renouvelables et couplage multi-zones.

---

## Normes de référence

| Module | Norme |
|--------|-------|
| Besoins thermiques (mensuel) | ISO 13790:2008 — méthode quasi-statique |
| Besoins thermiques (horaire) | Schéma RC nodal 5R1C |
| Confort thermique PMV/PPD | ISO 7730:2005 + ASHRAE 55-2023 |
| Performance PAC | EN 14825:2022, EN 14511 |
| Capteurs solaires thermiques | EN 12975 / ISO 9806 |
| Données météo | Format EPW (EnergyPlus Weather) |

---

## Structure des modules

```
thermal_engine/
├── core/               # Objets du domaine physique
│   ├── materials.py    # Material, MaterialLayer
│   ├── envelope.py     # OpaqueElement, WindowElement, InternalMass
│   ├── zone.py         # ThermalZone
│   └── building.py     # Building (agrégat de zones)
│
├── climate/            # Données météorologiques
│   ├── epw_parser.py   # parse_epw() — lecteur fichiers EPW
│   ├── epw_models.py   # WeatherSeries, EPWLocation
│   ├── solar.py        # Position solaire, irradiance POA
│   └── sky_model.py    # Modèle de ciel (diffus isotrope)
│
├── simulation/         # Calcul des besoins thermiques
│   ├── needs.py        # compute_building_needs(), CalibrationParams
│   └── renovation.py   # simulate_renovation(), build_standard_scenarios()
│
├── solver/             # Moteur RC nodal (méthode horaire)
│   ├── rc_assembler.py       # Assemblage matrices C, K, vecteurs B
│   ├── zone_solver.py        # Intégration backward-Euler
│   └── building_simulator.py # Simulation complète 8 760 h
│
├── hvac/               # Systèmes de chauffage, refroidissement, ECS
│   ├── base.py         # HVACSystem (ABC), HVACResult, facteurs EP/CO2/coût
│   ├── boilers.py      # GasBoiler, WoodPelletBoiler, WoodLogBoiler, FuelOilBoiler
│   ├── heat_pumps.py   # AirWaterHeatPump, GroundSourceHeatPump, AirAirHeatPump, ReversibleHeatPump
│   ├── district.py     # DistrictHeating, DistrictCooling
│   ├── dhw.py          # ElectricWaterHeater, HeatPumpWaterHeater, BoilerDHW, DistrictDHW
│   └── multi_service.py # MultiServiceHeatPump (chauffage + ECS + froid)
│
├── comfort/            # Confort thermique
│   ├── pmv_ppd.py      # compute_pmv(), compute_ppd() — ISO 7730:2005
│   ├── operative_temp.py    # operative_temperature(), adaptive_comfort_temperature()
│   └── comfort_indicators.py # ComfortResult, compute_comfort_indicators()
│
├── renewables/         # Énergies renouvelables
│   ├── pv.py           # PVSystem, PVAnnualResult — modèle NOCT
│   └── solar_thermal.py # SolarThermalCollector, DHWStorageTank, simulate_solar_thermal_annual()
│
├── inter_zone/         # Couplage thermique multi-zones
│   ├── adjacency.py    # ZoneAdjacency, detect_adjacencies_from_geojson()
│   └── coupled_solver.py # CoupledBuildingSolver, CoupledStepResult
│
├── io/
│   └── geojson_loader.py # load_building() — GeoJSON → Building
│
├── data/
│   ├── material_db.py  # MATERIAL_DATABASE — base de données matériaux
│   └── epw/            # Fichiers EPW bundlés (13 stations françaises)
│
├── schedules/
│   ├── setpoints.py    # SetpointSchedule — consignes chauffage/refroidissement
│   └── gains.py        # InternalGainsSchedule — apports internes
│
└── results/
    └── reports.py      # build_analysis_report(), build_renovation_report()
```

---

## API publique

### Chargement d'un bâtiment

```python
from thermal_engine import load_building

building = load_building("mon_batiment.geojson")
# ou depuis un dict Python :
building = load_building(geojson_dict)
```

### Calcul des besoins thermiques

```python
from thermal_engine import compute_building_needs, CalibrationParams, parse_epw

weather = parse_epw("Paris_CDG.epw")

# Méthode mensuelle (rapide, < 1 s)
result = compute_building_needs(building, weather, method="monthly")

# Méthode horaire RC (précis, 5-30 s)
result = compute_building_needs(building, weather, method="hourly")

print(result.dpe_class)                  # "D"
print(result.primary_energy_kwh_m2)      # 185.3
print(result.heating_need_kwh)           # 12450.0
```

Avec calibration :
```python
cal = {"*": CalibrationParams(u_walls=1.2, infiltration_ach=0.8, t_heating=19.5)}
result = compute_building_needs(building, weather, calibration=cal)
```

### Scénarios de rénovation

```python
from thermal_engine import (
    build_standard_scenarios, simulate_renovation,
    simulate_multiple_scenarios,
    InsulateWalls, InsulateRoof, ReplaceWindows, InstallMVHR,
)

# 3 scénarios pré-définis (Confort+, Rénovation RT, BBC)
scenarios = build_standard_scenarios(building)
results = simulate_multiple_scenarios(building, scenarios, weather)

for r in results:
    print(f"{r.scenario.label}: {r.dpe_before} → {r.dpe_after}, économie {r.cost_savings_eur_per_year:.0f} €/an")

# Scénario personnalisé
from thermal_engine import RenovationScenario
custom = RenovationScenario(
    scenario_id="ma_reno",
    label="Mon scénario",
    description="Isolation + VMC",
    actions=[
        InsulateWalls(insulation_material_id="mineral_wool", insulation_thickness_m=0.14,
                      cost_min_eur=10000, cost_max_eur=18000),
        InsulateRoof(insulation_material_id="mineral_wool", insulation_thickness_m=0.25,
                     cost_min_eur=5000, cost_max_eur=8000),
        InstallMVHR(heat_recovery_efficiency=0.85, cost_min_eur=3000, cost_max_eur=5000),
    ],
)
result = simulate_renovation(building, custom, weather)
print(result.heating_reduction_pct)   # ex. 52.3 %
```

### HVAC

```python
from thermal_engine import AirWaterHeatPump, GasBoiler, dhw_annual_need_kwh

# Chaudière gaz avec dégradation à charge partielle
boiler = GasBoiler(efficiency_nominal=0.90)
r = boiler.compute_annual(q_need_kwh=15000, monthly_needs_kwh=[...], t_ext_monthly_c=[...])
print(r.fuel_kwh, r.primary_energy_kwh, r.co2_kg, r.cost_eur)

# PAC air/eau avec SCOP saisonnier
pac = AirWaterHeatPump(q_nominal_heat_kw=12.0, t_sink_heat_c=45.0)
r = pac.compute_annual(15000, monthly_needs_kwh=[...], t_ext_monthly_c=[...])
print(r.cop_or_scop)   # ex. 2.8

# Besoin ECS
q_dhw = dhw_annual_need_kwh(n_occupants=4, usage="residential")  # ≈ 2200 kWh
```

### Confort thermique PMV/PPD

```python
from thermal_engine import ThermalComfortInputs, compute_pmv_ppd

inp = ThermalComfortInputs(
    t_air_c=21.0,
    t_mrt_c=19.5,
    v_air_m_s=0.1,
    rh_percent=50.0,
    met=1.2,    # bureau debout léger
    clo=1.0,    # tenue intérieure hiver
)
pmv, ppd = compute_pmv_ppd(inp)
# pmv ≈ -0.2  (légèrement frais), ppd ≈ 6 %
```

### Photovoltaïque

```python
from thermal_engine import PVSystem

pv = PVSystem(
    area_m2=20.0,
    eta_module=0.20,
    tilt_deg=35.0,
    azimuth_deg=180.0,
)
result = pv.simulate_annual(g_poa_series_w_m2=weather.solar_poa, t_ext_series_c=weather.t_ext)
print(result.e_ac_kwh)             # ex. 3800 kWh/an
print(result.specific_yield_kwh_kwp)  # ex. 1050 kWh/kWp
```

### Solaire thermique ECS

```python
from thermal_engine import SolarThermalCollector, DHWStorageTank, simulate_solar_thermal_annual

collector = SolarThermalCollector(area_m2=4.0, eta0=0.80, a1=3.5, a2=0.015)
tank = DHWStorageTank(volume_l=300, t_set_c=60.0)

result = simulate_solar_thermal_annual(
    collector, tank,
    g_poa_series_w_m2=weather.solar_poa,
    t_ext_series_c=weather.t_ext,
    q_dhw_need_kwh=2200,
)
print(result.solar_fraction)      # ex. 0.67
print(result.collector_yield)     # ex. 370 kWh/m²/an
```

---

## Format GeoJSON d'entrée

Le loader accepte deux formats : le format **canonique** (complet) et le format **frontend** (simplifié, produit par `buildGeoJSON()`).

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[lon, lat], ...]]
    },
    "properties": {
      "zone_id": "zone_1",
      "zone_type": "residential",
      "height_m": 9.0,
      "floors": 3,
      "construction_year": 1975,
      "is_ground_floor": true,
      "has_roof": true,
      "thermal_mass_class": "medium",
      "infiltration_ach": 0.7,
      "energy_system": {
        "type": "gas_boiler",
        "efficiency_nominal": 0.87,
        "fuel": "natural_gas"
      },
      "envelope": {
        "walls": {
          "layers": [
            {"material_id": "brick_hollow", "thickness_m": 0.22},
            {"material_id": "mineral_wool", "thickness_m": 0.10}
          ]
        },
        "roof": {
          "layers": [
            {"material_id": "concrete_dense", "thickness_m": 0.20},
            {"material_id": "mineral_wool", "thickness_m": 0.20}
          ]
        },
        "ground_floor": {
          "layers": [{"material_id": "concrete_dense", "thickness_m": 0.20}]
        },
        "windows": {
          "u_value_w_m2k": 1.4,
          "g_value": 0.60,
          "wwr_by_orientation": {"S": 0.25, "N": 0.10, "E": 0.15, "O": 0.15}
        }
      }
    }
  }]
}
```

**Correspondances acceptées** (format frontend → format interne) :

| Frontend | Interne |
|----------|---------|
| `floors` | `n_floors` |
| `construction_year` | `year_built` |
| `zone_type` | `usage` |
| `thermal_mass_class` | `construction_class` |
| `infiltration_ach` | `ventilation.air_change_rate_h` |
| `energy_system` (dict) | `energy_systems` (liste) |
| `envelope.walls.layers` | `envelope.walls.composition.layers` |
| `windows.u_value_w_m2k` | `windows.glazing.uw_w_m2k` |
| Orientations `S/N/E/O` | `south/north/east/west` |

---

## Matériaux disponibles

| ID | Matériau | λ (W/m·K) | ρ (kg/m³) |
|----|----------|-----------|-----------|
| `concrete_dense` | Béton lourd | 1.75 | 2300 |
| `brick_hollow` | Brique creuse | 0.40 | 800 |
| `brick_solid` | Brique pleine | 0.77 | 1800 |
| `mineral_wool` | Laine minérale | 0.035 | 15 |
| `eps_insulation` | EPS (polystyrène) | 0.038 | 20 |
| `xps_insulation` | XPS | 0.034 | 35 |
| `wood_soft` | Bois résineux | 0.13 | 500 |
| `wood_hard` | Bois feuillu | 0.18 | 700 |
| `gypsum_board` | Plaque de plâtre | 0.25 | 900 |
| `screed` | Chape ciment | 1.40 | 2000 |
| `bitumen_membrane` | Membrane bitume | 0.23 | 1100 |
| `glass` | Vitrage | 1.00 | 2500 |

---

## Modèles physiques

### Méthode mensuelle (ISO 13790)

Calcul du coefficient de déperdition global H = H_T + H_V :

- **H_T** : transmission par l'enveloppe (murs, toiture, plancher, fenêtres, ponts thermiques)
- **H_V** : ventilation et infiltration avec récupération de chaleur

Besoin de chauffage mensuel avec facteur d'utilisation des apports η :
```
Q_heat = max(0, Q_losses − η · Q_gains)
η = f(γ, aH)  avec γ = Q_gains / Q_losses
```

### Méthode horaire (RC nodal 5R1C)

Schéma thermique équivalent ISO 13790 Annexe C :
- 5 résistances : H_tr_is, H_tr_w, H_tr_ms, H_tr_em, H_ve
- 1 capacité : C_m (masse thermique de la zone)
- Intégration backward-Euler à pas horaire

### PAC — COP bi-quadratique (EN 14825)

```
COP = a0 + a1·Ts + a2·Ts² + a3·Tk + a4·Tk² + a5·Ts·Tk
```
- Ts = température source (air extérieur ou sol)
- Tk = température puits (départ réseau)
- SCOP saisonnier pondéré par les besoins mensuels

### PMV — Fanger (ISO 7730:2005)

Algorithme itératif rescalé (xn = (T_cl + 273.15) / 100) pour la convergence de la température de surface du vêtement, puis calcul de la charge thermique L et du vote PMV.

---

## Licence

MIT — Maxime Grelet
