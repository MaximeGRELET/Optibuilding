"""Modèle bâtiment : collection de zones thermiques."""

from __future__ import annotations
from dataclasses import dataclass, field

from thermal_engine.core.zone import ThermalZone


@dataclass
class Building:
    """Bâtiment composé d'une ou plusieurs zones thermiques.

    Parameters
    ----------
    building_id : identifiant unique
    name        : nom lisible
    zones       : liste de zones thermiques
    """
    building_id: str
    name: str
    zones: list[ThermalZone] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.zones:
            raise ValueError(f"Bâtiment '{self.building_id}' : au moins une zone requise.")

    @property
    def n_zones(self) -> int:
        return len(self.zones)

    @property
    def total_floor_area_m2(self) -> float:
        return sum(z.floor_area_m2 for z in self.zones)

    def get_zone(self, zone_id: str) -> ThermalZone:
        for z in self.zones:
            if z.zone_id == zone_id:
                return z
        raise KeyError(f"Zone '{zone_id}' introuvable dans le bâtiment '{self.building_id}'.")
