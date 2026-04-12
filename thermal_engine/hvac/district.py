"""
Réseaux de chaleur et de froid urbains.

Modèle simplifié (DPE 2021 / RE 2020) :
  - Facteur d'énergie primaire : 0.77 (réseau chaleur renouvelable + récupération)
  - Facteur CO2 : réseau-dépendant (valeur ADEME 2024 ou déclaré par l'opérateur)
  - Pertes réseau intégrées dans le tarif (facturation à l'énergie livrée en sous-station)
  - Pas de modélisation du réseau lui-même (hors périmètre de la simulation de bâtiment)

Référence : Arrêté du 31 mars 2021 (DPE), décret RE 2020
"""

from __future__ import annotations
from dataclasses import dataclass

from thermal_engine.hvac.base import HVACSystem, HVACResult


# ─────────────────────────────────────────────────────────────
# Réseau de chaleur
# ─────────────────────────────────────────────────────────────

@dataclass
class DistrictHeating(HVACSystem):
    """Réseau de chaleur urbain.

    Parameters
    ----------
    ep_factor  : facteur d'énergie primaire du réseau (défaut 0.77 — RE 2020)
    co2_factor : facteur CO2 [kgCO2/kWh_final] (ADEME ou déclaré par l'opérateur)
    cost_factor: tarif [€/kWh_final] (abonnement non inclus)
    network_id : identifiant du réseau (pour traçabilité)
    """
    ep_factor: float = 0.77
    co2_factor: float = 0.080
    cost_factor: float = 0.080
    network_id: str = "generic"

    @property
    def name(self) -> str:
        return f"Réseau de chaleur ({self.network_id})"

    @property
    def fuel_type(self) -> str:
        return "district_heat"

    # Surcharge pour utiliser les facteurs déclarés (pas ceux de la table de classe)
    def _ep_factor(self) -> float:
        return self.ep_factor

    def _co2_factor(self) -> float:
        return self.co2_factor

    def _cost_factor(self) -> float:
        return self.cost_factor

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        """Le réseau livre directement l'énergie demandée (sous-station = échangeur).

        η_sous-station ≈ 1.0 (les pertes sont incluses dans le tarif réseau).
        """
        q_final = q_need_kwh  # énergie facturée = énergie livrée
        return self._make_result(q_need_kwh, q_final, seasonal_perf=1.0)


# ─────────────────────────────────────────────────────────────
# Réseau de froid
# ─────────────────────────────────────────────────────────────

@dataclass
class DistrictCooling(HVACSystem):
    """Réseau de froid urbain (eau glacée).

    EER réseau typique : 3.5–5.0 (grandes centrales très efficaces).
    Depuis le point de vue du bâtiment : énergie facturée = énergie frigorifique livrée.

    Parameters
    ----------
    ep_factor   : facteur EP (défaut 0.77)
    co2_factor  : facteur CO2 [kgCO2/kWh]
    cost_factor : tarif [€/kWh]
    eer_network : EER du réseau (indicatif, pour le reporting)
    """
    ep_factor: float = 0.77
    co2_factor: float = 0.060
    cost_factor: float = 0.060
    eer_network: float = 4.0
    network_id: str = "generic"

    @property
    def name(self) -> str:
        return f"Réseau de froid ({self.network_id})"

    @property
    def fuel_type(self) -> str:
        return "district_cool"

    def _ep_factor(self) -> float:
        return self.ep_factor

    def _co2_factor(self) -> float:
        return self.co2_factor

    def _cost_factor(self) -> float:
        return self.cost_factor

    def compute_annual(
        self,
        q_need_kwh: float,
        monthly_needs_kwh: list[float] | None = None,
        t_ext_monthly_c: list[float] | None = None,
    ) -> HVACResult:
        q_final = q_need_kwh
        return self._make_result(q_need_kwh, q_final, seasonal_perf=self.eer_network)
