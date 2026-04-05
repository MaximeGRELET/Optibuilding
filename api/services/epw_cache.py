"""
Service EPW : téléchargement, parsing et cache mémoire des fichiers météo.

Les fichiers sont téléchargés une seule fois depuis climate.onebuilding.org
et conservés dans un dossier temporaire pour la durée du processus.
"""

from __future__ import annotations
import tempfile
import urllib.request
import urllib.error
from pathlib import Path

from thermal_engine.climate.epw_parser import parse_epw
from thermal_engine.climate.epw_models import WeatherSeries

from api.data.epw_catalog import STATIONS_BY_ID, EPWStation

# ── Cache ─────────────────────────────────────────────────────────────────────

_cache: dict[str, WeatherSeries] = {}
_tmpdir = Path(tempfile.mkdtemp(prefix="optibuilding_epw_"))


def get_weather(station_id: str) -> WeatherSeries:
    """
    Retourne le WeatherSeries pour une station, depuis le cache ou en le
    téléchargeant + parsant à la demande.

    Raises
    ------
    ValueError  si station_id inconnu
    RuntimeError  si le téléchargement échoue
    """
    if station_id in _cache:
        return _cache[station_id]

    station = STATIONS_BY_ID.get(station_id)
    if station is None:
        raise ValueError(f"Station inconnue : {station_id!r}")

    weather = _download_and_parse(station)
    _cache[station_id] = weather
    return weather


def _download_and_parse(station: EPWStation) -> WeatherSeries:
    dest = _tmpdir / f"{station.station_id}.epw"

    if not dest.exists():
        try:
            req = urllib.request.Request(
                station.url,
                headers={"User-Agent": "OptiBuilding/1.0 (energy simulation)"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                dest.write_bytes(resp.read())
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Impossible de télécharger le fichier EPW pour '{station.city}' "
                f"({station.url}). Vérifiez la connexion réseau. Détail : {exc}"
            ) from exc

    try:
        return parse_epw(dest)
    except Exception as exc:
        # Supprimer le fichier corrompu pour forcer un re-téléchargement
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"Erreur lors du parsing du fichier EPW pour '{station.city}' : {exc}"
        ) from exc


def cache_status() -> dict[str, bool]:
    """Retourne quelles stations sont déjà en cache."""
    return {sid: sid in _cache for sid in STATIONS_BY_ID}
