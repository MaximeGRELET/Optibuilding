"""Shared dependencies — synthetic weather factory."""

from __future__ import annotations
import numpy as np
import pandas as pd
from thermal_engine.climate.epw_models import WeatherSeries, EPWLocation


def make_synthetic_weather(
    latitude_deg: float = 45.756,
    longitude_deg: float = 4.854,
    city: str = "Inconnu",
) -> WeatherSeries:
    """
    Generates an 8760-h synthetic weather series from monthly climate normals.
    Used when no EPW file is provided.
    """
    # Monthly means representative of the French climate (temperate, latitude-scaled)
    lat_factor = max(0.5, min(1.5, (50.0 - latitude_deg) / 10.0 + 1.0))

    monthly_temps = [
        3.0 * lat_factor, 4.5 * lat_factor, 8.0, 11.5, 15.5,
        19.5, 22.5, 22.0, 17.5, 12.5, 6.5, 3.5 * lat_factor,
    ]
    monthly_ghi_kwh = [30, 50, 90, 130, 155, 170, 185, 165, 120, 75, 35, 25]

    ts = pd.date_range("2023-01-01 01:00", periods=8760, freq="h")
    months = ts.month.to_numpy() - 1
    hour_of_day = ts.hour.to_numpy()

    t_base = np.array(monthly_temps)[months]
    dry_bulb = t_base + 4.0 * np.sin(np.pi * (hour_of_day - 6) / 12)

    ghi = np.zeros(8760)
    for m in range(12):
        day_h = (months == m) & (hour_of_day >= 6) & (hour_of_day <= 20)
        n_day = day_h.sum()
        if n_day > 0:
            peak = monthly_ghi_kwh[m] * 1000 / (n_day * 0.6)
            hours = hour_of_day[day_h] - 13
            ghi[day_h] = np.maximum(0, peak * np.exp(-0.5 * (hours / 4) ** 2))

    dhi = ghi * 0.3
    dni = np.maximum(0, ghi * 0.7)

    return WeatherSeries(
        location=EPWLocation(
            city=city, state_province="", country="France",
            source="synthetic", wmo_station_id="00000",
            latitude_deg=latitude_deg, longitude_deg=longitude_deg,
            timezone_offset=1.0, elevation_m=100.0,
        ),
        dry_bulb_temp_c=dry_bulb,
        dew_point_temp_c=dry_bulb - 3.0,
        relative_humidity=np.full(8760, 70.0),
        atmospheric_pressure_pa=np.full(8760, 101325.0),
        ghi_wh_m2=ghi,
        dhi_wh_m2=dhi,
        dni_wh_m2=dni,
        wind_speed_m_s=np.full(8760, 2.5),
        wind_direction_deg=np.full(8760, 180.0),
        timestamps=ts,
    )
