"""
Parseur de fichiers EPW (EnergyPlus Weather).

Format EnergyPlus :
- Ligne 1  : LOCATION
- Lignes 2-8 : en-têtes descriptifs
- Lignes 9-8768 : 8 760 lignes de données horaires
"""

from __future__ import annotations
from pathlib import Path

import numpy as np
import pandas as pd

from thermal_engine.climate.epw_models import EPWLocation, WeatherSeries


# Colonnes EPW (index 0-based, format EnergyPlus v8+)
_COL_YEAR        = 0
_COL_MONTH       = 1
_COL_DAY         = 2
_COL_HOUR        = 3   # 1-24 (EPW : 1 = 00h01-01h00)
_COL_MINUTE      = 4
_COL_DRY_BULB    = 6
_COL_DEW_POINT   = 7
_COL_RH          = 8
_COL_PRESSURE    = 9
_COL_GHI         = 13  # Global Horizontal Irradiation [Wh/m²]
_COL_DNI         = 14  # Direct Normal Irradiation     [Wh/m²]
_COL_DHI         = 15  # Diffuse Horizontal Irradiation[Wh/m²]
_COL_SKY_COVER   = 22  # Opaque Sky Cover [0-10]
_COL_WIND_DIR    = 20  # Wind Direction [°]
_COL_WIND_SPEED  = 21  # Wind Speed [m/s]


def parse_epw(path: str | Path) -> WeatherSeries:
    """Lit un fichier EPW et retourne un WeatherSeries.

    Parameters
    ----------
    path : chemin vers le fichier .epw

    Returns
    -------
    WeatherSeries avec 8 760 timesteps horaires

    Raises
    ------
    FileNotFoundError : si le fichier n'existe pas
    ValueError        : si le format est incorrect
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Fichier EPW introuvable : {path}")

    with path.open(encoding="latin-1") as fh:
        lines = fh.readlines()

    if len(lines) < 9:
        raise ValueError("Fichier EPW invalide : moins de 9 lignes")

    # ── Ligne 1 : LOCATION ────────────────────────────────────
    location = _parse_location_line(lines[0])

    # ── Lignes 9-8768 : données horaires ──────────────────────
    data_lines = lines[8:]
    if len(data_lines) < 8760:
        raise ValueError(
            f"Fichier EPW incomplet : {len(data_lines)} lignes de données (8 760 attendues)"
        )
    data_lines = data_lines[:8760]

    rows = [line.strip().split(",") for line in data_lines]
    arr = np.array(rows, dtype=object)

    def col_float(idx: int, default: float = 0.0) -> np.ndarray:
        """Extrait une colonne, remplace les manquants par default."""
        try:
            vals = arr[:, idx].astype(float)
            vals = np.where(np.isnan(vals), default, vals)
            return vals
        except (IndexError, ValueError):
            return np.full(8760, default)

    dry_bulb   = col_float(_COL_DRY_BULB)
    dew_point  = col_float(_COL_DEW_POINT)
    rh         = np.clip(col_float(_COL_RH, 50.0), 0.0, 100.0)
    pressure   = np.where(col_float(_COL_PRESSURE) < 50000, 101325.0,
                          col_float(_COL_PRESSURE))
    ghi        = np.maximum(0.0, col_float(_COL_GHI))
    dni        = np.maximum(0.0, col_float(_COL_DNI))
    dhi        = np.maximum(0.0, col_float(_COL_DHI))
    wind_dir   = col_float(_COL_WIND_DIR)
    wind_speed = np.maximum(0.0, col_float(_COL_WIND_SPEED))

    # EPW heure 1 = 00h01–01h00 → on décale pour que l'index 0 = 01h00 du 1er janvier
    ts = pd.date_range("2023-01-01 01:00", periods=8760, freq="h")

    return WeatherSeries(
        location=location,
        dry_bulb_temp_c=dry_bulb,
        dew_point_temp_c=dew_point,
        relative_humidity=rh,
        atmospheric_pressure_pa=pressure,
        ghi_wh_m2=ghi,
        dhi_wh_m2=dhi,
        dni_wh_m2=dni,
        wind_speed_m_s=wind_speed,
        wind_direction_deg=wind_dir,
        timestamps=ts,
    )


def _parse_location_line(line: str) -> EPWLocation:
    """Extrait les métadonnées depuis la première ligne LOCATION du fichier EPW."""
    parts = [p.strip() for p in line.split(",")]
    # Formato : LOCATION,City,State/Province,Country,Source,WMO,Lat,Lon,TZ,Elev
    try:
        return EPWLocation(
            city=parts[1] if len(parts) > 1 else "Unknown",
            state_province=parts[2] if len(parts) > 2 else "",
            country=parts[3] if len(parts) > 3 else "",
            source=parts[4] if len(parts) > 4 else "EPW",
            wmo_station_id=parts[5] if len(parts) > 5 else "000000",
            latitude_deg=float(parts[6]) if len(parts) > 6 else 0.0,
            longitude_deg=float(parts[7]) if len(parts) > 7 else 0.0,
            timezone_offset=float(parts[8]) if len(parts) > 8 else 0.0,
            elevation_m=float(parts[9]) if len(parts) > 9 else 0.0,
        )
    except (ValueError, IndexError) as exc:
        raise ValueError(f"Ligne LOCATION EPW malformée : {exc}\n  → {line!r}") from exc
