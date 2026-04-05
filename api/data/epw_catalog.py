"""
Catalogue des stations météo EPW TMY disponibles gratuitement.

Source : climate.onebuilding.org — TMYx 2004-2018
Licence : Creative Commons (CC BY 4.0)
Page d'accueil : https://climate.onebuilding.org/

Une station représentative par région métropolitaine de France.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class EPWStation:
    station_id: str        # identifiant interne
    label: str             # affichage UI
    region: str            # région administrative
    city: str              # ville de la station
    wmo: str               # code WMO
    latitude: float
    longitude: float
    altitude_m: float
    url: str               # URL de téléchargement directe


STATIONS: list[EPWStation] = [
    EPWStation(
        station_id="paris",
        label="Paris-Orly — Île-de-France",
        region="Île-de-France",
        city="Paris",
        wmo="071490",
        latitude=48.72, longitude=2.38, altitude_m=89,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/IDF_Ile-de-France/FRA_IDF_Paris.Orly.071490_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="lille",
        label="Lille-Lesquin — Hauts-de-France",
        region="Hauts-de-France",
        city="Lille",
        wmo="070650",
        latitude=50.57, longitude=3.10, altitude_m=47,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/NPdC_Nord-Pas-de-Calais/FRA_NPdC_Lille-Lesquin.AP.070650_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="strasbourg",
        label="Strasbourg-Entzheim — Grand Est",
        region="Grand Est",
        city="Strasbourg",
        wmo="071900",
        latitude=48.55, longitude=7.63, altitude_m=150,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/AL_Alsace/FRA_AL_Strasbourg-Entzheim.AP.071900_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="lyon",
        label="Lyon-Bron — Auvergne-Rhône-Alpes",
        region="Auvergne-Rhône-Alpes",
        city="Lyon",
        wmo="074810",
        latitude=45.73, longitude=5.08, altitude_m=200,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/RA_Rhone-Alpes/FRA_RA_Lyon-Bron.AP.074810_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="marseille",
        label="Marseille-Marignane — PACA",
        region="Provence-Alpes-Côte d'Azur",
        city="Marseille",
        wmo="076500",
        latitude=43.43, longitude=5.22, altitude_m=36,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/PAC_Provence-Alpes-Cote-d-Azur/FRA_PAC_Marseille-Marignane.AP.076500_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="toulouse",
        label="Toulouse-Blagnac — Occitanie",
        region="Occitanie",
        city="Toulouse",
        wmo="076300",
        latitude=43.63, longitude=1.37, altitude_m=152,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/MP_Midi-Pyrenees/FRA_MP_Toulouse-Blagnac.AP.076300_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="bordeaux",
        label="Bordeaux-Mérignac — Nouvelle-Aquitaine",
        region="Nouvelle-Aquitaine",
        city="Bordeaux",
        wmo="075100",
        latitude=44.83, longitude=-0.69, altitude_m=47,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/AQ_Aquitaine/FRA_AQ_Bordeaux-Merignac.AP.075100_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="nantes",
        label="Nantes-Atlantique — Pays de la Loire",
        region="Pays de la Loire",
        city="Nantes",
        wmo="072220",
        latitude=47.15, longitude=-1.60, altitude_m=26,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/PL_Pays-de-la-Loire/FRA_PL_Nantes-Atlantique.AP.072220_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="rennes",
        label="Rennes-Saint-Jacques — Bretagne",
        region="Bretagne",
        city="Rennes",
        wmo="072300",
        latitude=48.07, longitude=-1.73, altitude_m=36,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/BR_Bretagne/FRA_BR_Rennes-Saint-Jacques.AP.072300_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="caen",
        label="Caen-Carpiquet — Normandie",
        region="Normandie",
        city="Caen",
        wmo="071230",
        latitude=49.18, longitude=-0.45, altitude_m=67,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/BN_Basse-Normandie/FRA_BN_Caen-Carpiquet.AP.071230_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="orleans",
        label="Orléans-Bricy — Centre-Val de Loire",
        region="Centre-Val de Loire",
        city="Orléans",
        wmo="071350",
        latitude=47.98, longitude=1.77, altitude_m=125,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/CE_Centre/FRA_CE_Orleans-Bricy.AP.071350_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="dijon",
        label="Dijon-Bourgogne — Bourgogne-Franche-Comté",
        region="Bourgogne-Franche-Comté",
        city="Dijon",
        wmo="074720",
        latitude=47.27, longitude=5.09, altitude_m=221,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/BO_Bourgogne/FRA_BO_Dijon-Bourgogne.AP.074720_TMYx.2004-2018.epw",
    ),
    EPWStation(
        station_id="ajaccio",
        label="Ajaccio — Corse",
        region="Corse",
        city="Ajaccio",
        wmo="078970",
        latitude=41.92, longitude=8.80, altitude_m=4,
        url="https://climate.onebuilding.org/WMO_Region_6_Europe/FRA_France/CO_Corse/FRA_CO_Ajaccio.AP.078970_TMYx.2004-2018.epw",
    ),
]

# Index par station_id pour lookup O(1)
STATIONS_BY_ID: dict[str, EPWStation] = {s.station_id: s for s in STATIONS}
