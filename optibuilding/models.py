"""
Modèles de données (dataclasses) pour le moteur de calcul énergétique.
"""

from dataclasses import dataclass, field
from typing import Literal


TypeLogement  = Literal["maison", "appartement"]
NiveauIsolation = Literal["aucune", "faible", "moyenne", "bonne", "excellente"]


@dataclass
class Logement:
    """Description physique et technique du logement à analyser."""
    surface: float                  # m² habitables
    annee_construction: int         # Année de construction
    type_logement: TypeLogement     # maison | appartement
    type_chauffage: str             # Clé dans ENERGIE_CHAUFFAGE
    niveau_isolation: NiveauIsolation
    ville: str                      # Utilisée pour le facteur climatique


@dataclass
class ResultatConsommation:
    """Résultats bruts du calcul de consommation avant rénovation."""
    conso_ep_kwh_m2: float          # kWh énergie primaire / m² / an
    conso_ef_kwh_m2: float          # kWh énergie finale / m² / an
    conso_ep_totale: float          # kWh EP total / an
    conso_ef_totale: float          # kWh EF total / an
    cout_annuel_eur: float          # € / an
    emissions_co2_kg: float         # kg CO₂ / an
    classe_dpe: str                 # A à G
    label_dpe: str                  # Description verbale
    facteur_climatique: float
    facteur_isolation: float


@dataclass
class PosteDeperdition:
    """Un poste de déperdition thermique."""
    nom: str
    pourcentage: float              # % de la déperdition totale
    kwh_perdus: float               # kWh/an associés


@dataclass
class ScenarioRenovation:
    """Un scénario de rénovation avec ses impacts chiffrés."""
    niveau: str                     # leger | intermediaire | complet
    label: str
    travaux: list[str]
    gain_pct: float                 # Gain sur consommation (0–1)
    gain_kwh_ef: float              # kWh EF économisés / an
    gain_kwh_ep: float              # kWh EP économisés / an
    conso_ep_apres: float           # kWh EP/m²/an après travaux
    classe_dpe_apres: str           # Classe DPE résultante
    economie_annuelle_eur: float    # € / an économisés
    cout_min_eur: float             # Coût travaux borne basse
    cout_max_eur: float             # Coût travaux borne haute
    retour_sur_investissement_ans: float  # ROI en années (centre de fourchette)
    co2_evite_kg: float             # kg CO₂ / an évités


@dataclass
class RapportEnergetique:
    """Rapport complet produit par le moteur de calcul."""
    logement: Logement
    consommation: ResultatConsommation
    deperditions: list[PosteDeperdition]
    scenarios: list[ScenarioRenovation]
    hypotheses: list[str] = field(default_factory=list)
