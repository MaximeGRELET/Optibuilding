"""
Démonstration du moteur physique OptiBuilding Physics.

Usage :
  python main_physics.py [chemin_epw]

Si aucun fichier EPW n'est fourni, le moteur génère des données climatiques
synthétiques représentatives de Lyon (pour test sans fichier EPW).
"""

import sys
import json
import numpy as np
from pathlib import Path

# ─── Imports du moteur physique ───────────────────────────────────────────────
from optibuilding_physics import (
    load_building,
    parse_epw,
    compute_building_needs,
    simulate_multiple_scenarios,
    build_standard_scenarios,
    build_analysis_report,
    build_renovation_report,
    save_report,
)
from optibuilding_physics.climate.epw_models import WeatherSeries, EPWLocation


# ─────────────────────────────────────────────────────────────────────────────
# Données climatiques synthétiques (si pas de fichier EPW)
# ─────────────────────────────────────────────────────────────────────────────

def _synthetic_weather_lyon() -> WeatherSeries:
    """
    Génère une série météo synthétique représentative de Lyon.
    Utilisée uniquement pour les tests sans fichier EPW réel.
    """
    import pandas as pd

    # Températures mensuelles moyennes Lyon (°C)
    monthly_temps = [3.0, 4.5, 8.0, 11.5, 15.5, 19.5, 22.5, 22.0, 17.5, 12.5, 6.5, 3.5]
    # Rayonnement global mensuel approximatif Lyon (kWh/m²/mois)
    monthly_ghi_kwh = [30, 50, 90, 130, 155, 170, 185, 165, 120, 75, 35, 25]

    ts = pd.date_range("2023-01-01 01:00", periods=8760, freq="h")
    months = ts.month.to_numpy() - 1   # 0-indexé

    # Température horaire : sinusoïde diurne superposée à la moyenne mensuelle
    t_monthly = np.array(monthly_temps)
    t_base = t_monthly[months]
    hour_of_day = ts.hour.to_numpy()
    t_diurnal = 4.0 * np.sin(np.pi * (hour_of_day - 6) / 12)   # ±4°C
    dry_bulb = t_base + t_diurnal + np.random.normal(0, 0.5, 8760)

    # Rayonnement horaire : distribution gaussienne pendant les heures de jour
    ghi_monthly_wh = np.array(monthly_ghi_kwh) * 1000   # kWh → Wh
    ghi = np.zeros(8760)
    for m in range(12):
        mask = months == m
        n_h = mask.sum()
        daylight = (hour_of_day >= 6) & (hour_of_day <= 20)
        day_h = mask & daylight
        n_day = day_h.sum()
        if n_day > 0:
            peak = ghi_monthly_wh[m] / (n_day * 0.6)
            hour_peak = 12
            hours = hour_of_day[day_h] - hour_peak
            ghi[day_h] = np.maximum(0, peak * np.exp(-0.5 * (hours / 3) ** 2))

    dhi = ghi * 0.35
    dni = np.where(ghi > 50, (ghi - dhi) / np.maximum(0.01, np.sin(np.radians(30))), 0)

    location = EPWLocation(
        city="Lyon", state_province="Auvergne-Rhône-Alpes", country="France",
        source="synthetic", wmo_station_id="07481",
        latitude_deg=45.756, longitude_deg=4.854,
        timezone_offset=1.0, elevation_m=200.0,
    )

    return WeatherSeries(
        location               = location,
        dry_bulb_temp_c        = dry_bulb,
        dew_point_temp_c       = dry_bulb - 3.0,
        relative_humidity      = np.full(8760, 70.0),
        atmospheric_pressure_pa= np.full(8760, 101325.0),
        ghi_wh_m2              = ghi,
        dhi_wh_m2              = dhi,
        dni_wh_m2              = np.maximum(0, dni),
        wind_speed_m_s         = np.maximum(0, np.random.exponential(2.5, 8760)),
        wind_direction_deg     = np.random.uniform(0, 360, 8760),
        timestamps             = ts,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Démo principale
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  OPTIBUILDING PHYSICS v2 — Moteur de calcul énergétique")
    print("=" * 70)

    # ─── 1. Chargement du bâtiment ────────────────────────────────
    geojson_path = Path(__file__).parent / "examples" / "batiment_mixte_lyon.geojson"
    print(f"\n[1] Chargement du bâtiment : {geojson_path.name}")
    building = load_building(geojson_path)
    print(f"    → {building.name}")
    print(f"    → {building.n_zones} zones, {building.total_floor_area_m2:.0f} m² total")
    for z in building.zones:
        print(f"       • {z.label} — {z.floor_area_m2:.0f} m² — "
              f"U_mur={z.envelope.walls.u_value_w_m2k:.2f} W/m²K")

    # ─── 2. Données climatiques ────────────────────────────────────
    epw_path = sys.argv[1] if len(sys.argv) > 1 else None
    if epw_path and Path(epw_path).exists():
        print(f"\n[2] Chargement EPW : {epw_path}")
        weather = parse_epw(epw_path)
    else:
        print("\n[2] Aucun fichier EPW fourni → données synthétiques Lyon")
        weather = _synthetic_weather_lyon()

    loc = weather.location
    print(f"    → {loc.city}, {loc.country} "
          f"({loc.latitude_deg:.2f}°N, {loc.longitude_deg:.2f}°E)")
    print(f"    → T_moy = {float(weather.dry_bulb_temp_c.mean()):.1f}°C  |  "
          f"DJC18 = {weather.heating_degree_days(18):.0f}  |  "
          f"GHI = {float(weather.ghi_wh_m2.sum())/1000:.0f} kWh/m²/an")

    # ─── 3. Calcul de référence ────────────────────────────────────
    print("\n[3] Calcul des besoins énergétiques (méthode mensuelle ISO 13790)...")
    baseline = compute_building_needs(building, weather, method="monthly")

    print(f"\n    ┌─ BÂTIMENT ACTUEL ───────────────────────────────────┐")
    print(f"    │  Classe DPE           : {baseline.dpe_class}                       │")
    print(f"    │  Énergie primaire     : {baseline.primary_energy_kwh_m2:>7.1f} kWh EP/m²/an   │")
    print(f"    │  CO₂                  : {baseline.co2_kg_m2:>7.2f} kg CO₂/m²/an  │")
    print(f"    │  Besoin chauffage     : {baseline.heating_need_kwh:>9,.0f} kWh/an        │")
    print(f"    │  Besoin ECS           : {baseline.dhw_need_kwh:>9,.0f} kWh/an        │")
    print(f"    │  Facture estimée      : {baseline.cost_eur:>9,.0f} €/an          │")
    print(f"    └─────────────────────────────────────────────────────┘")

    for z in baseline.zone_results:
        print(f"\n    Zone : {z.zone_label} ({z.floor_area_m2:.0f} m²)")
        bd = z.envelope_breakdown
        print(f"      Déperditions totales   : {z.total_losses_kwh:,.0f} kWh/an")
        print(f"      ├─ Murs                : {bd.get('walls_pct', 0):.1f}%  ({bd.get('walls_kwh',0):,.0f} kWh)")
        print(f"      ├─ Vitrages            : {bd.get('windows_pct', 0):.1f}%  ({bd.get('windows_kwh',0):,.0f} kWh)")
        print(f"      ├─ Toiture             : {bd.get('roof_pct', 0):.1f}%  ({bd.get('roof_kwh',0):,.0f} kWh)")
        print(f"      ├─ Plancher            : {bd.get('floor_pct', 0):.1f}%  ({bd.get('floor_kwh',0):,.0f} kWh)")
        print(f"      ├─ Ponts thermiques    : {bd.get('thermal_bridges_pct', 0):.1f}%  ({bd.get('thermal_bridges_kwh',0):,.0f} kWh)")
        print(f"      └─ Ventilation         : {bd.get('ventilation_pct', 0):.1f}%  ({bd.get('ventilation_kwh',0):,.0f} kWh)")
        print(f"      Apports solaires       : {z.solar_gains_kwh:,.0f} kWh/an")
        print(f"      Apports internes       : {z.internal_gains_kwh:,.0f} kWh/an")
        print(f"      → Besoin chauffage net : {z.heating_need_kwh:,.0f} kWh/an")

    # ─── 4. Scénarios de rénovation ────────────────────────────────
    print("\n[4] Simulation des scénarios de rénovation...")
    scenarios = build_standard_scenarios(building)
    results   = simulate_multiple_scenarios(building, scenarios, weather, method="monthly")

    print(f"\n    {'Scénario':<28} {'DPE':>4}  {'EP kWh/m²':>10}  "
          f"{'Économie €/an':>14}  {'Invest. €':>12}  {'ROI (ans)':>10}")
    print("    " + "─" * 84)

    # Ligne de référence
    print(f"    {'Situation actuelle':<28} {baseline.dpe_class:>4}  "
          f"{baseline.primary_energy_kwh_m2:>10.1f}  "
          f"{'—':>14}  {'—':>12}  {'—':>10}")

    for res in results:
        print(f"    {res.scenario.label:<28} {res.after.dpe_class:>4}  "
              f"{res.after.primary_energy_kwh_m2:>10.1f}  "
              f"{res.cost_savings_eur_per_year:>13,.0f} €  "
              f"{res.scenario.total_cost_center_eur:>10,.0f} €  "
              f"{res.simple_payback_years:>9.1f}")

    # ─── 5. Export JSON ───────────────────────────────────────────
    print("\n[5] Export des rapports JSON...")
    output_dir = Path(__file__).parent / "examples" / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Rapport d'analyse
    analysis_report = build_analysis_report(baseline, weather, {"analyste": "OptiBuilding Demo"})
    analysis_path = output_dir / "analyse_energetique.json"
    save_report(analysis_report, str(analysis_path))
    print(f"    → {analysis_path}")

    # Rapport de rénovation
    reno_report = build_renovation_report(results, weather)
    reno_path = output_dir / "scenarios_renovation.json"
    save_report(reno_report, str(reno_path))
    print(f"    → {reno_path}")

    print("\n" + "=" * 70)
    print("  Calcul terminé.")
    print("=" * 70)


if __name__ == "__main__":
    main()
