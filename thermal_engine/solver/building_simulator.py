"""
Orchestration de la simulation horaire multi-zones.

BuildingSimulator gère :
1. Précalcul des irradiances POA pour toutes les orientations uniques
2. Calcul de la température de ciel
3. Boucle horaire (8 760 pas de temps) sur toutes les zones
4. Accumulation des résultats
"""

from __future__ import annotations
from dataclasses import dataclass, field

import numpy as np

from thermal_engine.core.building import Building
from thermal_engine.core.zone import ThermalZone
from thermal_engine.core.envelope import OpaqueElement
from thermal_engine.climate.epw_models import WeatherSeries
from thermal_engine.climate.solar import compute_solar_position, compute_poa_irradiance
from thermal_engine.climate.sky_model import sky_temperature_c
from thermal_engine.schedules.setpoints import SetpointSchedule
from thermal_engine.schedules.gains import InternalGainsSchedule
from thermal_engine.solver.zone_solver import ZoneSolver


@dataclass
class ZoneHourlyResult:
    """Résultats horaires d'une zone (8 760 valeurs)."""
    zone_id: str
    t_air_c: np.ndarray         # Température air [°C]
    q_hvac_w: np.ndarray        # Puissance HVAC [W] (+chaud, -froid)
    q_heat_w: np.ndarray        # Puissance de chauffage [W] (≥ 0)
    q_cool_w: np.ndarray        # Puissance de refroidissement [W] (≥ 0)
    q_solar_w: np.ndarray       # Gains solaires [W]
    q_int_w: np.ndarray         # Gains internes [W]


@dataclass
class BuildingSimulationResults:
    """Résultats complets d'une simulation horaire bâtiment."""
    building_id: str
    zone_results: dict[str, ZoneHourlyResult] = field(default_factory=dict)

    def get_zone(self, zone_id: str) -> ZoneHourlyResult:
        return self.zone_results[zone_id]

    @property
    def t_ext_c(self) -> np.ndarray:
        """Température extérieure (récupérée depuis le premier résultat)."""
        for r in self.zone_results.values():
            return np.zeros(8760)
        return np.zeros(8760)


class BuildingSimulator:
    """Simulateur horaire multi-zones.

    Parameters
    ----------
    building      : bâtiment multi-zones
    zone_configs  : {zone_id: (SetpointSchedule, InternalGainsSchedule)}
                    Les zones non référencées utilisent des valeurs par défaut.
    dt_s          : pas de temps [s] (défaut 3 600 s)
    """

    def __init__(
        self,
        building: Building,
        zone_configs: dict[str, tuple[SetpointSchedule, InternalGainsSchedule]],
        dt_s: float = 3600.0,
    ) -> None:
        self.building = building
        self.zone_configs = zone_configs
        self.dt_s = dt_s

    def run(self, weather: WeatherSeries) -> BuildingSimulationResults:
        """Lance la simulation horaire 8 760 h.

        Returns
        -------
        BuildingSimulationResults avec les séries horaires par zone.
        """
        # ── 1. Précalcul solaire (orientations uniques) ───────
        poa_cache = self._precompute_poa(weather)

        # ── 2. Température de ciel ────────────────────────────
        t_sky_arr = sky_temperature_c(weather.dry_bulb_temp_c, weather.dew_point_temp_c)
        t_ground_arr = weather.t_ground_c
        t_ext_arr = weather.dry_bulb_temp_c

        # ── 3. Initialisation des solveurs ────────────────────
        solvers: dict[str, ZoneSolver] = {}
        states:  dict[str, np.ndarray] = {}
        configs: dict[str, tuple[SetpointSchedule, InternalGainsSchedule]] = {}

        for zone in self.building.zones:
            solvers[zone.zone_id] = ZoneSolver(zone, self.dt_s)
            states[zone.zone_id]  = solvers[zone.zone_id].initial_state()
            if zone.zone_id in self.zone_configs:
                configs[zone.zone_id] = self.zone_configs[zone.zone_id]
            else:
                # Valeurs par défaut selon l'usage
                sp = SetpointSchedule.from_usage(zone.usage)
                gains = InternalGainsSchedule.from_usage(zone.usage, zone.floor_area_m2)
                configs[zone.zone_id] = (sp, gains)

        # ── 4. Tableaux de résultats ──────────────────────────
        results_raw: dict[str, dict[str, list]] = {
            zid: {"t_air": [], "q_hvac": [], "q_solar": [], "q_int": []}
            for zid in solvers
        }

        # ── 5. Boucle horaire ─────────────────────────────────
        for h in range(8760):
            t_ext    = float(t_ext_arr[h])
            t_sky    = float(t_sky_arr[h])
            t_ground = float(t_ground_arr[h])

            for zone in self.building.zones:
                zid     = zone.zone_id
                solver  = solvers[zid]
                sp, gains = configs[zid]

                # POA par élément de la zone
                solar_poa, solar_win = self._get_solar_by_element(
                    zone, poa_cache, h
                )

                # Apports internes
                q_int = float(gains.sensible_w[h])
                q_int_rad  = q_int * gains.radiant_fraction
                q_int_conv = q_int * (1.0 - gains.radiant_fraction)

                # Gains solaires totaux (pour bilan)
                q_sol_total = (
                    sum(solar_poa.values()) * 0  # absorption parois (stockée, pas gain direct)
                    + sum(
                        win.solar_heat_gain_coeff * solar_win.get(win.element_id, 0.0) * win.area_m2
                        for win in zone.windows
                    )
                )

                # Vecteur de forçage
                f = solver.build_forcing_vector(
                    t_ext=t_ext,
                    t_sky=t_sky,
                    t_ground=t_ground,
                    solar_poa=solar_poa,
                    solar_win=solar_win,
                    q_int_conv_w=q_int_conv,
                    q_int_rad_w=q_int_rad,
                )

                # Consignes de l'heure courante
                sp_heat = float(sp.heating_sp_c[h])
                sp_cool = float(sp.cooling_sp_c[h])

                # Pas de temps
                T_new, q_hvac = solver.step(
                    T_prev=states[zid],
                    f=f,
                    sp_heat_c=sp_heat,
                    sp_cool_c=sp_cool,
                )
                states[zid] = T_new

                results_raw[zid]["t_air"].append(float(T_new[0]))
                results_raw[zid]["q_hvac"].append(q_hvac)
                results_raw[zid]["q_solar"].append(q_sol_total)
                results_raw[zid]["q_int"].append(q_int)

        # ── 6. Assembler les résultats ────────────────────────
        zone_results: dict[str, ZoneHourlyResult] = {}
        for zone in self.building.zones:
            zid = zone.zone_id
            q_hvac_arr = np.array(results_raw[zid]["q_hvac"])
            zone_results[zid] = ZoneHourlyResult(
                zone_id=zid,
                t_air_c=np.array(results_raw[zid]["t_air"]),
                q_hvac_w=q_hvac_arr,
                q_heat_w=np.maximum(0.0, q_hvac_arr),
                q_cool_w=np.maximum(0.0, -q_hvac_arr),
                q_solar_w=np.array(results_raw[zid]["q_solar"]),
                q_int_w=np.array(results_raw[zid]["q_int"]),
            )

        return BuildingSimulationResults(
            building_id=self.building.building_id,
            zone_results=zone_results,
        )

    # ── Précalcul POA ─────────────────────────────────────────

    def _precompute_poa(
        self,
        weather: WeatherSeries,
    ) -> dict[tuple[float, float], np.ndarray]:
        """Précalcule les irradiances POA pour toutes les orientations uniques."""
        orientations: set[tuple[float, float]] = set()
        for zone in self.building.zones:
            for el in zone.opaque_elements:
                orientations.add((el.tilt_deg, el.azimuth_deg))
            for win in zone.windows:
                orientations.add((win.tilt_deg, win.azimuth_deg))

        solar_pos = compute_solar_position(weather.location, weather.timestamps)
        poa_cache: dict[tuple[float, float], np.ndarray] = {}
        for tilt, az in orientations:
            poa = compute_poa_irradiance(solar_pos, weather, tilt, az)
            poa_cache[(tilt, az)] = poa.poa_total_wh_m2  # Wh/m² = W/m² sur 1 h

        return poa_cache

    def _get_solar_by_element(
        self,
        zone: ThermalZone,
        poa_cache: dict[tuple[float, float], np.ndarray],
        h: int,
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Retourne les irradiances POA [W/m²] pour l'heure h, par élément."""
        solar_poa: dict[str, float] = {}
        solar_win: dict[str, float] = {}

        for el in zone.opaque_elements:
            key = (el.tilt_deg, el.azimuth_deg)
            solar_poa[el.element_id] = float(poa_cache.get(key, np.zeros(8760))[h])

        for win in zone.windows:
            key = (win.tilt_deg, win.azimuth_deg)
            solar_win[win.element_id] = float(poa_cache.get(key, np.zeros(8760))[h])

        return solar_poa, solar_win
