"""
Catalogue des stations météo EPW TMY disponibles.

Source : climate.onebuilding.org — TMYx 2004-2018
Licence : Creative Commons (CC BY 4.0)
Page d'accueil : https://climate.onebuilding.org/

Une station représentative par région métropolitaine de France.
Les fichiers EPW sont bundlés dans api/data/epw/{station_id}.epw
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class EPWStation:
    station_id: str        # identifiant interne (= nom du fichier EPW)
    label: str             # affichage UI
    region: str            # région administrative
    city: str              # ville de la station
    wmo: str               # code WMO
    latitude: float
    longitude: float
    altitude_m: float


STATIONS: list[EPWStation] = [
    EPWStation(
        station_id="paris",
        label="Paris-Orly — Île-de-France",
        region="Île-de-France",
        city="Paris",
        wmo="071490",
        latitude=48.72, longitude=2.38, altitude_m=89,
    ),
    EPWStation(
        station_id="lille",
        label="Lille-Lesquin — Hauts-de-France",
        region="Hauts-de-France",
        city="Lille",
        wmo="070150",
        latitude=50.57, longitude=3.10, altitude_m=47,
    ),
    EPWStation(
        station_id="strasbourg",
        label="Strasbourg-Entzheim — Grand Est",
        region="Grand Est",
        city="Strasbourg",
        wmo="071900",
        latitude=48.55, longitude=7.63, altitude_m=150,
    ),
    EPWStation(
        station_id="lyon",
        label="Lyon-Bron — Auvergne-Rhône-Alpes",
        region="Auvergne-Rhône-Alpes",
        city="Lyon",
        wmo="074800",
        latitude=45.73, longitude=5.08, altitude_m=200,
    ),
    EPWStation(
        station_id="marseille",
        label="Marseille-Provence — PACA",
        region="Provence-Alpes-Côte d'Azur",
        city="Marseille",
        wmo="076500",
        latitude=43.43, longitude=5.22, altitude_m=36,
    ),
    EPWStation(
        station_id="toulouse",
        label="Toulouse-Blagnac — Occitanie",
        region="Occitanie",
        city="Toulouse",
        wmo="076300",
        latitude=43.63, longitude=1.37, altitude_m=152,
    ),
    EPWStation(
        station_id="bordeaux",
        label="Bordeaux-Mérignac — Nouvelle-Aquitaine",
        region="Nouvelle-Aquitaine",
        city="Bordeaux",
        wmo="075100",
        latitude=44.83, longitude=-0.69, altitude_m=47,
    ),
    EPWStation(
        station_id="nantes",
        label="Nantes-Atlantique — Pays de la Loire",
        region="Pays de la Loire",
        city="Nantes",
        wmo="072220",
        latitude=47.15, longitude=-1.60, altitude_m=26,
    ),
    EPWStation(
        station_id="rennes",
        label="Rennes-Saint-Jacques — Bretagne",
        region="Bretagne",
        city="Rennes",
        wmo="071300",
        latitude=48.07, longitude=-1.73, altitude_m=36,
    ),
    EPWStation(
        station_id="caen",
        label="Caen-Carpiquet — Normandie",
        region="Normandie",
        city="Caen",
        wmo="070270",
        latitude=49.18, longitude=-0.45, altitude_m=67,
    ),
    EPWStation(
        station_id="orleans",
        label="Orléans-Bricy — Centre-Val de Loire",
        region="Centre-Val de Loire",
        city="Orléans",
        wmo="072490",
        latitude=47.98, longitude=1.77, altitude_m=125,
    ),
    EPWStation(
        station_id="dijon",
        label="Dijon-Bourgogne — Bourgogne-Franche-Comté",
        region="Bourgogne-Franche-Comté",
        city="Dijon",
        wmo="072800",
        latitude=47.27, longitude=5.09, altitude_m=221,
    ),
    EPWStation(
        station_id="ajaccio",
        label="Ajaccio-Bonaparte — Corse",
        region="Corse",
        city="Ajaccio",
        wmo="077610",
        latitude=41.92, longitude=8.80, altitude_m=4,
    ),
]

# Index par station_id pour lookup O(1)
STATIONS_BY_ID: dict[str, EPWStation] = {s.station_id: s for s in STATIONS}
