"""
Chaudières : gaz, bois bûche, granulés bois.

Modèle de performance :
  - Rendement η = f(PLR) — courbe polynomiale (modulation de charge)
  - PLR = part load ratio = Q_delivered / Q_nominal
  - Pertes à l'arrêt (standby) modélisées via un terme constant

Référence : EN 15316-4-1, EN 303-5 (chaudières bois)
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np

from thermal_engine.hvac.base import HVACSystem, HVACResult


# ─────────────────────────────────────────────────────────────
# Chaudière gaz
# ─────────────────────────────────────────────────────────────

@dataclass
class GasBoiler(HVACSystem):
    """Chaudière gaz (condensation ou standard).

    Parameters
    ----------
    eta_100         : rendement à pleine charge (PCS) []
    eta_30          : rendement à 30 % de charge [] (condensation : η_30 > η_100)
    q_nominal_kw    : puissance nominale [kW]
    is_condensing   : True si condensation
    """
    eta_100: float = 0.87
    eta_30: float = 0.95
    q_nominal_kw: float = 24.0
    is_condensing: bool = False

    @property
    def name(self) -> str:
        suffix = " condensation" if self.is_condensing else " standard"
        return f"Chaudière gaz{suffix}"

    @property
    def fuel_type(self) -> str:
        return "gas"

    def eta_at_plr(self, plr: float) -> float:
        """Rendement interpolé entre η_30 et η_100 selon PLR."""
        plr = max(0.05, min(1.0, plr))
        if plr <= 0.30:
            return self.eta_30
        # Interpolation linéaire entre (0.30, η_30) et (1.0, η_100)
        t = (plr - 0.30) / 0.70
        return self.eta_30 + t * (self.eta_100 - self.eta_30)

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        if monthly_needs_kwh and len(monthly_needs_kwh) == 12:
            # Calcul mensuel pour tenir compte de la modulation de charge
            q_fuel_total = 0.0
            eta_weighted_sum = 0.0
            for q_m in monthly_needs_kwh:
                if q_m <= 0:
                    continue
                # PLR moyen mensuel estimé (hypothèse : 10 h/j de fonctionnement)
                q_max_m = self.q_nominal_kw * 24.0 * 30.0  # kWh max si plein temps
                plr = min(1.0, q_m / (q_max_m * 0.4))  # 40 % : fonctionnement partiel
                eta_m = self.eta_at_plr(max(0.10, plr))
                q_fuel = q_m / eta_m
                q_fuel_total += q_fuel
                eta_weighted_sum += eta_m * q_m
            if q_need_kwh > 0:
                eta_seasonal = eta_weighted_sum / q_need_kwh
            else:
                eta_seasonal = self.eta_100
        else:
            # Rendement moyen PLR=0.5
            eta_seasonal = self.eta_at_plr(0.5)
            q_fuel_total = q_need_kwh / eta_seasonal if eta_seasonal > 0 else 0.0

        return self._make_result(q_need_kwh, q_fuel_total, eta_seasonal)


# ─────────────────────────────────────────────────────────────
# Chaudière granulés bois (pellets)
# ─────────────────────────────────────────────────────────────

@dataclass
class WoodPelletBoiler(HVACSystem):
    """Chaudière à granulés bois avec silo de stockage.

    Performances selon EN 303-5 classe 5.
    η = 0.87 à pleine charge, 0.90 à mi-charge (modulation).
    """
    eta_100: float = 0.87
    eta_50: float = 0.90
    q_nominal_kw: float = 20.0

    @property
    def name(self) -> str:
        return "Chaudière granulés bois"

    @property
    def fuel_type(self) -> str:
        return "wood_pellets"

    def eta_at_plr(self, plr: float) -> float:
        plr = max(0.20, min(1.0, plr))
        if plr <= 0.50:
            return self.eta_50
        t = (plr - 0.50) / 0.50
        return self.eta_50 + t * (self.eta_100 - self.eta_50)

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        eta_seasonal = self.eta_at_plr(0.50)
        q_fuel = q_need_kwh / eta_seasonal if eta_seasonal > 0 else 0.0
        return self._make_result(q_need_kwh, q_fuel, eta_seasonal)


# ─────────────────────────────────────────────────────────────
# Chaudière bois bûche
# ─────────────────────────────────────────────────────────────

@dataclass
class WoodLogBoiler(HVACSystem):
    """Chaudière bois bûche à gazéification.

    Pas de modulation fine — rendement quasi-fixe à la puissance nominale.
    Complément souvent assuré par un ballon tampon.
    """
    eta_nominal: float = 0.83
    has_buffer_tank: bool = True

    @property
    def name(self) -> str:
        suffix = " + ballon tampon" if self.has_buffer_tank else ""
        return f"Chaudière bois bûche{suffix}"

    @property
    def fuel_type(self) -> str:
        return "wood"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        # Sans ballon : rendement dégradé par les démarrages fréquents
        eta = self.eta_nominal if self.has_buffer_tank else self.eta_nominal * 0.92
        q_fuel = q_need_kwh / eta if eta > 0 else 0.0
        return self._make_result(q_need_kwh, q_fuel, eta)


# ─────────────────────────────────────────────────────────────
# Chaudière fioul
# ─────────────────────────────────────────────────────────────

@dataclass
class FuelOilBoiler(HVACSystem):
    """Chaudière fioul (basse température ou condensation)."""
    eta_100: float = 0.85
    eta_30: float = 0.88
    is_condensing: bool = False

    @property
    def name(self) -> str:
        return "Chaudière fioul" + (" condensation" if self.is_condensing else "")

    @property
    def fuel_type(self) -> str:
        return "fuel_oil"

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        # PLR moyen = 0.5
        t = (0.50 - 0.30) / 0.70
        eta = self.eta_30 + t * (self.eta_100 - self.eta_30)
        q_fuel = q_need_kwh / eta if eta > 0 else 0.0
        return self._make_result(q_need_kwh, q_fuel, eta)
