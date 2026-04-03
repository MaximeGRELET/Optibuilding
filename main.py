"""
Point d'entrée — exemples d'utilisation du moteur OptiBuilding.
"""

import sys
import io

# Force UTF-8 sur la sortie standard (nécessaire sous Windows)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from optibuilding import Logement, analyser_logement, formater_rapport


def exemple_maison_ancienne() -> None:
    """Maison des années 60 chauffée au gaz, isolation faible, à Lyon."""
    logement = Logement(
        surface             = 110,
        annee_construction  = 1965,
        type_logement       = "maison",
        type_chauffage      = "gaz_naturel",
        niveau_isolation    = "faible",
        ville               = "lyon",
    )
    rapport = analyser_logement(logement)
    print(formater_rapport(rapport))


def exemple_appartement_annees_80() -> None:
    """Appartement des années 80 en électricité effet Joule à Paris."""
    logement = Logement(
        surface             = 65,
        annee_construction  = 1983,
        type_logement       = "appartement",
        type_chauffage      = "electrique_effet_joule",
        niveau_isolation    = "moyenne",
        ville               = "paris",
    )
    rapport = analyser_logement(logement)
    print(formater_rapport(rapport))


def exemple_maison_recente_pac() -> None:
    """Maison RT 2012 équipée d'une PAC air/eau à Bordeaux."""
    logement = Logement(
        surface             = 130,
        annee_construction  = 2015,
        type_logement       = "maison",
        type_chauffage      = "pac_air_eau",
        niveau_isolation    = "bonne",
        ville               = "bordeaux",
    )
    rapport = analyser_logement(logement)
    print(formater_rapport(rapport))


def exemple_passoire_thermique() -> None:
    """Maison d'avant-guerre au fioul, aucune isolation, à Strasbourg."""
    logement = Logement(
        surface             = 140,
        annee_construction  = 1935,
        type_logement       = "maison",
        type_chauffage      = "fioul",
        niveau_isolation    = "aucune",
        ville               = "strasbourg",
    )
    rapport = analyser_logement(logement)
    print(formater_rapport(rapport))


if __name__ == "__main__":
    print("\n" + "=" * 68)
    print("  OPTIBUILDING — Démo multi-logements")
    print("=" * 68)

    print("\n\n[CAS 1] Maison années 60 — Gaz naturel — Isolation faible — Lyon")
    exemple_maison_ancienne()

    print("\n\n[CAS 2] Appartement années 80 — Électricité — Paris")
    exemple_appartement_annees_80()

    print("\n\n[CAS 3] Maison RT 2012 — PAC air/eau — Bordeaux")
    exemple_maison_recente_pac()

    print("\n\n[CAS 4] Passoire thermique — Avant-guerre — Fioul — Strasbourg")
    exemple_passoire_thermique()
