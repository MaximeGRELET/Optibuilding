"""
Production photovoltaïque (PV).

Modèle physique :
  P_dc [W] = G_poa [W/m²] × η_module × A_m2 × (1 - β_T × (T_cell - T_STC))
  T_cell = T_ext + G_poa × (NOCT - 20) / 800    [°C]  (modèle NOCT)
  P_ac   = P_dc × η_inverter(PLR)

Autoconsommation vs injection réseau :
  E_consumed = min(E_pv, E_demand)
  E_injected  = max(0, E_pv - E_demand)

Référence : IEC 61853-1, IEC 61724, PVGIS methodology
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np


# ─────────────────────────────────────────────────────────────
# Résultat annuel PV
# ─────────────────────────────────────────────────────────────

@dataclass
class PVAnnualResult:
    """Résultats annuels d'un système PV.

    Attributes
    ----------
    e_pv_kwh          : production PV brute [kWh/an]
    e_consumed_kwh    : autoconsommation [kWh/an]
    e_injected_kwh    : injection réseau [kWh/an]
    e_from_grid_kwh   : énergie soutirée au réseau [kWh/an]
    peak_power_kwp    : puissance crête installée [kWp]
    specific_yield    : productivité spécifique [kWh/kWp·an]
    performance_ratio : PR = E_ac / (G_annual × A × η_stc) []
    monthly_kwh       : production mensuelle [kWh × 12]
    """
    e_pv_kwh: float
    e_consumed_kwh: float
    e_injected_kwh: float
    e_from_grid_kwh: float
    peak_power_kwp: float
    specific_yield: float
    performance_ratio: float
    monthly_kwh: list[float]

    def to_dict(self) -> dict:
        return {
            "e_pv_kwh": round(self.e_pv_kwh, 1),
            "e_consumed_kwh": round(self.e_consumed_kwh, 1),
            "e_injected_kwh": round(self.e_injected_kwh, 1),
            "e_from_grid_kwh": round(self.e_from_grid_kwh, 1),
            "peak_power_kwp": round(self.peak_power_kwp, 2),
            "specific_yield_kwh_kwp": round(self.specific_yield, 0),
            "performance_ratio": round(self.performance_ratio, 3),
            "monthly_kwh": [round(v, 1) for v in self.monthly_kwh],
        }


# ─────────────────────────────────────────────────────────────
# Système PV
# ─────────────────────────────────────────────────────────────

@dataclass
class PVSystem:
    """Système photovoltaïque (toiture ou façade).

    Parameters
    ----------
    area_m2         : surface active des modules [m²]
    eta_module      : rendement module STC (1000 W/m², 25 °C) []
    tilt_deg        : inclinaison des panneaux [°] (0=horizontal, 90=vertical)
    azimuth_deg     : azimut [°] (N=0, E=90, S=180, W=270)
    beta_t          : coefficient de température [-1/°C] (défaut 0.0035 Si)
    noct_c          : NOCT (Normal Operating Cell Temperature) [°C] (défaut 45)
    eta_inverter    : rendement onduleur moyen [] (défaut 0.97)
    eta_cables      : pertes câblage [] (défaut 0.98)
    eta_soiling     : pertes salissures / ombrage [] (défaut 0.95)
    """
    area_m2: float
    eta_module: float = 0.20
    tilt_deg: float = 30.0
    azimuth_deg: float = 180.0
    beta_t: float = 0.0035
    noct_c: float = 45.0
    eta_inverter: float = 0.97
    eta_cables: float = 0.98
    eta_soiling: float = 0.95

    @property
    def peak_power_kwp(self) -> float:
        """Puissance crête STC [kWp]."""
        return self.area_m2 * self.eta_module * 1.0  # 1000 W/m² / 1000

    @property
    def system_efficiency(self) -> float:
        """Rendement global hors module (onduleur × câbles × salissures)."""
        return self.eta_inverter * self.eta_cables * self.eta_soiling

    def t_cell(self, t_ext_c: float, g_poa_w_m2: float) -> float:
        """Température cellule via modèle NOCT [°C]."""
        return t_ext_c + g_poa_w_m2 * (self.noct_c - 20.0) / 800.0

    def p_dc_w(self, g_poa_w_m2: float, t_cell_c: float) -> float:
        """Puissance DC [W] en fonction de l'irradiance et la température cellule."""
        if g_poa_w_m2 <= 0:
            return 0.0
        temp_correction = 1.0 - self.beta_t * (t_cell_c - 25.0)
        return g_poa_w_m2 * self.eta_module * self.area_m2 * max(0.0, temp_correction)

    def p_ac_w(self, g_poa_w_m2: float, t_ext_c: float) -> float:
        """Puissance AC [W] injectée sur le réseau interne."""
        tc = self.t_cell(t_ext_c, g_poa_w_m2)
        p_dc = self.p_dc_w(g_poa_w_m2, tc)
        return p_dc * self.system_efficiency

    def simulate_annual(
        self,
        g_poa_series_w_m2: np.ndarray,   # irradiance POA horaire [W/m²] (8760,)
        t_ext_series_c: np.ndarray,       # température extérieure [°C] (8760,)
        e_demand_series_kwh: np.ndarray | None = None,  # consommation horaire [kWh]
    ) -> PVAnnualResult:
        """Simule la production PV sur 8760 heures.

        Parameters
        ----------
        g_poa_series_w_m2   : irradiance sur le plan des panneaux [W/m²]
        t_ext_series_c      : température extérieure horaire [°C]
        e_demand_series_kwh : demande électrique horaire [kWh] (pour autoconso)
                              Si None, toute la production est considérée autoconsommée.

        Returns
        -------
        PVAnnualResult
        """
        n = len(g_poa_series_w_m2)
        p_ac = np.array([
            self.p_ac_w(float(g_poa_series_w_m2[i]), float(t_ext_series_c[i]))
            for i in range(n)
        ])
        e_pv_kwh_series = p_ac / 1000.0  # W → kWh (pas 1h)

        if e_demand_series_kwh is not None:
            e_consumed = np.minimum(e_pv_kwh_series, e_demand_series_kwh)
            e_injected = np.maximum(0.0, e_pv_kwh_series - e_demand_series_kwh)
            e_from_grid = np.maximum(0.0, e_demand_series_kwh - e_pv_kwh_series)
        else:
            e_consumed  = e_pv_kwh_series.copy()
            e_injected  = np.zeros(n)
            e_from_grid = np.zeros(n)

        e_pv_total = float(e_pv_kwh_series.sum())
        peak_kwp   = self.peak_power_kwp

        # Performance Ratio
        g_poa_total = float(g_poa_series_w_m2.sum())  # Wh/m²
        if g_poa_total > 0 and self.eta_module > 0:
            e_ref = g_poa_total * self.area_m2 * self.eta_module / 1000.0  # kWh
            pr = e_pv_total / e_ref if e_ref > 0 else 0.0
        else:
            pr = 0.0

        # Production mensuelle
        DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        monthly = []
        h = 0
        for d in DAYS:
            monthly.append(float(e_pv_kwh_series[h:h + d * 24].sum()))
            h += d * 24

        return PVAnnualResult(
            e_pv_kwh=e_pv_total,
            e_consumed_kwh=float(e_consumed.sum()),
            e_injected_kwh=float(e_injected.sum()),
            e_from_grid_kwh=float(e_from_grid.sum()),
            peak_power_kwp=peak_kwp,
            specific_yield=e_pv_total / peak_kwp if peak_kwp > 0 else 0.0,
            performance_ratio=pr,
            monthly_kwh=monthly,
        )
