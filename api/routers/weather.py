"""Router — GET /weather"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException

from api.data.epw_catalog import STATIONS, STATIONS_BY_ID
from api.services.epw_cache import get_weather, cache_status

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/library")
def get_library() -> dict:
    """Liste toutes les stations EPW disponibles."""
    return {
        "stations": [
            {
                "station_id": s.station_id,
                "label":      s.label,
                "region":     s.region,
                "city":       s.city,
                "wmo":        s.wmo,
                "latitude":   s.latitude,
                "longitude":  s.longitude,
                "altitude_m": s.altitude_m,
                "cached":     s.station_id in cache_status() and cache_status()[s.station_id],
            }
            for s in STATIONS
        ]
    }


@router.get("/epw/{station_id}/preview")
def preview_station(station_id: str) -> dict:
    """
    Télécharge et parse le fichier EPW d'une station (si pas déjà en cache)
    et retourne un résumé : températures mensuelles moyennes, ensoleillement, etc.
    """
    if station_id not in STATIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Station inconnue : {station_id}")

    station = STATIONS_BY_ID[station_id]

    try:
        weather = get_weather(station_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    import numpy as np
    import pandas as pd

    ts = weather.timestamps
    months = ts.month.to_numpy()  # 1–12
    t = weather.dry_bulb_temp_c
    ghi = weather.ghi_wh_m2

    monthly_t_mean  = [round(float(t[months == m].mean()), 1) for m in range(1, 13)]
    monthly_t_min   = [round(float(t[months == m].min()),  1) for m in range(1, 13)]
    monthly_t_max   = [round(float(t[months == m].max()),  1) for m in range(1, 13)]
    monthly_ghi_kwh = [round(float(ghi[months == m].sum() / 1000), 0) for m in range(1, 13)]

    return {
        "station_id":    station.station_id,
        "city":          station.city,
        "region":        station.region,
        "latitude":      station.latitude,
        "longitude":     station.longitude,
        "altitude_m":    station.altitude_m,
        "wmo":           station.wmo,
        "t_annual_mean_c":   round(float(t.mean()), 1),
        "t_annual_min_c":    round(float(t.min()), 1),
        "t_annual_max_c":    round(float(t.max()), 1),
        "ghi_annual_kwh_m2": round(float(ghi.sum() / 1000), 0),
        "months":            ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"],
        "monthly_t_mean_c":  monthly_t_mean,
        "monthly_t_min_c":   monthly_t_min,
        "monthly_t_max_c":   monthly_t_max,
        "monthly_ghi_kwh":   monthly_ghi_kwh,
    }
