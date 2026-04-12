"""Couplage thermique inter-zones."""

from thermal_engine.inter_zone.adjacency import (
    ZoneAdjacency,
    detect_adjacencies_from_geojson,
)
from thermal_engine.inter_zone.coupled_solver import (
    CoupledBuildingSolver,
    CoupledStepResult,
)

__all__ = [
    "ZoneAdjacency",
    "detect_adjacencies_from_geojson",
    "CoupledBuildingSolver",
    "CoupledStepResult",
]
