"""Sérialisation JSON des résultats d'analyse et de rénovation."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

from thermal_engine.simulation.needs import BuildingNeedsResult
from thermal_engine.climate.epw_models import WeatherSeries


def build_analysis_report(
    result: BuildingNeedsResult,
    weather: WeatherSeries,
    metadata: dict | None = None,
) -> dict:
    """Construit le rapport d'analyse énergétique au format JSON.

    Parameters
    ----------
    result   : résultat de compute_building_needs
    weather  : données météo utilisées pour la simulation
    metadata : métadonnées libres (analyste, date, version…)

    Returns
    -------
    dict JSON-sérialisable
    """
    loc = weather.location
    report = {
        "type": "analysis_report",
        "metadata": metadata or {},
        "weather": {
            "city": loc.city,
            "country": loc.country,
            "latitude_deg": loc.latitude_deg,
            "longitude_deg": loc.longitude_deg,
            "source": loc.source,
            "heating_degree_days": round(weather.heating_degree_days(), 1),
            "annual_ghi_kwh_m2": round(float(weather.ghi_wh_m2.sum()) / 1000.0, 1),
        },
        "result": result.to_dict(),
    }
    return report


def build_renovation_report(
    results: list,  # list[RenovationResult]
    weather: WeatherSeries,
    metadata: dict | None = None,
) -> dict:
    """Construit le rapport de scénarios de rénovation.

    Parameters
    ----------
    results  : liste de RenovationResult
    weather  : données météo
    metadata : métadonnées libres

    Returns
    -------
    dict JSON-sérialisable
    """
    loc = weather.location
    baseline_dict = results[0].baseline.to_dict() if results else {}
    return {
        "type": "renovation_report",
        "metadata": metadata or {},
        "weather": {
            "city": loc.city,
            "country": loc.country,
            "source": loc.source,
        },
        "baseline": baseline_dict,
        "scenarios": [r.to_dict() for r in results],
    }


def save_report(report: dict, path: str) -> None:
    """Écrit un rapport dict → fichier JSON.

    Parameters
    ----------
    report : dictionnaire à sérialiser
    path   : chemin du fichier de sortie
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    def _default(obj: Any) -> Any:
        """Convertit les types non-JSON (numpy, etc.)."""
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        raise TypeError(f"Objet non sérialisable : {type(obj)}")

    with p.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False, default=_default)
