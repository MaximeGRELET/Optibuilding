"""
Service EPW : chargement et cache mémoire des fichiers météo locaux.

Les fichiers EPW (TMYx 2004-2018, source : climate.onebuilding.org, CC BY 4.0)
sont bundlés dans api/data/epw/ et chargés à la demande.
"""

from __future__ import annotations
from pathlib import Path

from thermal_engine.climate.epw_parser import parse_epw
from thermal_engine.climate.epw_models import WeatherSeries

from api.data.epw_catalog import STATIONS_BY_ID

# ── Chemins ───────────────────────────────────────────────────────────────────

_EPW_DIR = Path(__file__).parent.parent / "data" / "epw"

# ── Cache ─────────────────────────────────────────────────────────────────────

_cache: dict[str, WeatherSeries] = {}


def get_weather(station_id: str) -> WeatherSeries:
    """
    Retourne le WeatherSeries pour une station, depuis le cache ou en le
    parsant depuis le fichier EPW bundlé.

    Raises
    ------
    ValueError   si station_id inconnu
    RuntimeError si le fichier EPW local est manquant ou corrompu
    """
    if station_id in _cache:
        return _cache[station_id]

    if station_id not in STATIONS_BY_ID:
        raise ValueError(f"Station inconnue : {station_id!r}")

    epw_path = _EPW_DIR / f"{station_id}.epw"
    if not epw_path.exists():
        raise RuntimeError(
            f"Fichier EPW manquant pour la station '{station_id}' "
            f"(attendu : {epw_path})"
        )

    try:
        weather = parse_epw(epw_path)
    except Exception as exc:
        raise RuntimeError(
            f"Erreur lors du parsing du fichier EPW pour '{station_id}' : {exc}"
        ) from exc

    _cache[station_id] = weather
    return weather


def cache_status() -> dict[str, bool]:
    """Retourne quelles stations sont déjà en cache mémoire."""
    return {sid: sid in _cache for sid in STATIONS_BY_ID}
