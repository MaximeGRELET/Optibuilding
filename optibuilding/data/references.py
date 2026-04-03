"""
Données de référence pour le moteur de calcul énergétique.
Sources : ADEME, RT 2012, RE 2020, DPE réglementaire français.
"""

# ─────────────────────────────────────────────────────────────
# Ratios de consommation de base (kWh EP/m²/an)
# selon l'époque de construction et le type de logement.
# Représentent la consommation AVANT rénovation en énergie primaire.
# ─────────────────────────────────────────────────────────────
RATIO_CONSOMMATION_BASE: dict[str, dict[str, float]] = {
    "maison": {
        "avant_1948":   480,   # Aucune réglementation thermique
        "1948_1974":    380,   # Avant tout standard thermique
        "1975_1981":    280,   # RT 1974 (premier choc pétrolier)
        "1982_1988":    220,   # RT 1982
        "1989_2000":    180,   # RT 1988
        "2001_2005":    150,   # RT 2000
        "2006_2012":    120,   # RT 2005
        "2013_2020":     80,   # RT 2012
        "apres_2020":    50,   # RE 2020
    },
    "appartement": {
        "avant_1948":   380,
        "1948_1974":    300,
        "1975_1981":    240,
        "1982_1988":    190,
        "1989_2000":    160,
        "2001_2005":    135,
        "2006_2012":    110,
        "2013_2020":     70,
        "apres_2020":    45,
    },
}

# ─────────────────────────────────────────────────────────────
# Facteurs climatiques — correction zonale (base = Paris)
# Zones H1a / H1b / H1c = Nord / H2 = Centre / H3 = Sud
# ─────────────────────────────────────────────────────────────
FACTEURS_CLIMATIQUES: dict[str, float] = {
    # Zone H1 — très froide
    "lille":       1.20,
    "strasbourg":  1.22,
    "metz":        1.18,
    "reims":       1.12,
    "amiens":      1.15,
    # Zone H1b — froide (référence Paris)
    "paris":       1.00,
    "rouen":       0.98,
    "caen":        0.95,
    "rennes":      0.90,
    "nantes":      0.88,
    # Zone H2 — tempérée
    "lyon":        1.05,
    "grenoble":    1.10,
    "clermont":    1.08,
    "bordeaux":    0.85,
    "toulouse":    0.82,
    "montpellier": 0.75,
    # Zone H3 — douce (méditerranéenne)
    "marseille":   0.70,
    "nice":        0.65,
    "ajaccio":     0.60,
    # Altitude / montagne
    "montagne":    1.30,
    # Défaut si ville inconnue
    "defaut":      1.00,
}

# ─────────────────────────────────────────────────────────────
# Facteurs de correction selon le niveau d'isolation actuel
# ─────────────────────────────────────────────────────────────
FACTEURS_ISOLATION: dict[str, float] = {
    "aucune":      1.30,   # Murs, toiture et plancher non isolés
    "faible":      1.10,   # Quelques éléments isolés partiellement
    "moyenne":     1.00,   # Isolation standard de l'époque
    "bonne":       0.85,   # Isolation performante (ex. ITE récente)
    "excellente":  0.70,   # BBC, passif
}

# ─────────────────────────────────────────────────────────────
# Coefficient de conversion énergie finale → énergie primaire
# et facteurs d'émission CO₂ (kg CO₂/kWh final)
# ─────────────────────────────────────────────────────────────
ENERGIE_CHAUFFAGE: dict[str, dict[str, float]] = {
    "gaz_naturel": {
        "label":        "Gaz naturel",
        "coeff_ep":     1.0,   # Énergie primaire = finale pour fossile
        "co2_kwh":      0.227, # kg CO₂/kWh final
        "cout_kwh":     0.115, # €/kWh (tarif réglementé 2024)
        "efficacite":   0.85,  # Rendement chaudière standard
    },
    "gaz_condensation": {
        "label":        "Chaudière gaz à condensation",
        "coeff_ep":     1.0,
        "co2_kwh":      0.227,
        "cout_kwh":     0.115,
        "efficacite":   1.05,  # COP > 1 grâce à la récupération condensation
    },
    "fioul": {
        "label":        "Fioul domestique",
        "coeff_ep":     1.0,
        "co2_kwh":      0.324,
        "cout_kwh":     0.145,
        "efficacite":   0.80,
    },
    "electrique_effet_joule": {
        "label":        "Électricité effet Joule",
        "coeff_ep":     2.3,   # Facteur énergie primaire électricité France
        "co2_kwh":      0.052, # Mix électrique français
        "cout_kwh":     0.2516,
        "efficacite":   1.00,
    },
    "pac_air_air": {
        "label":        "Pompe à chaleur air/air",
        "coeff_ep":     2.3,
        "co2_kwh":      0.052,
        "cout_kwh":     0.2516,
        "efficacite":   2.80,  # COP moyen annuel SCOP
    },
    "pac_air_eau": {
        "label":        "Pompe à chaleur air/eau",
        "coeff_ep":     2.3,
        "co2_kwh":      0.052,
        "cout_kwh":     0.2516,
        "efficacite":   3.20,
    },
    "bois_granules": {
        "label":        "Poêle / chaudière bois granulés",
        "coeff_ep":     1.0,
        "co2_kwh":      0.030, # Biomasse : cycle CO₂ quasi neutre
        "cout_kwh":     0.065,
        "efficacite":   0.90,
    },
    "reseau_chaleur": {
        "label":        "Réseau de chaleur urbain",
        "coeff_ep":     0.77,
        "co2_kwh":      0.109,
        "cout_kwh":     0.090,
        "efficacite":   1.00,
    },
}

# ─────────────────────────────────────────────────────────────
# Seuils DPE énergie primaire (kWh EP/m²/an) — décret 2021
# ─────────────────────────────────────────────────────────────
SEUILS_DPE: list[tuple[float, str, str]] = [
    (70,   "A", "Très performant"),
    (110,  "B", "Performant"),
    (180,  "C", "Assez performant"),
    (250,  "D", "Peu performant"),
    (330,  "E", "Énergivore"),
    (420,  "F", "Très énergivore"),
    (float("inf"), "G", "Passoire thermique"),
]

# ─────────────────────────────────────────────────────────────
# Répartition typique des déperditions thermiques
# (% de la déperdition totale par poste)
# Valeurs moyennes patrimoine bâti français (ADEME 2022)
# ─────────────────────────────────────────────────────────────
DEPERDITIONS_BASE: dict[str, dict[str, float]] = {
    "maison": {
        "toiture_combles":   25,
        "murs":              25,
        "fenetres_portes":   13,
        "plancher_bas":      10,
        "ponts_thermiques":  10,
        "ventilation_air":   17,
    },
    "appartement": {
        "toiture_combles":    8,   # Moins impactant (logements intermédiaires)
        "murs":              30,
        "fenetres_portes":   15,
        "plancher_bas":       7,
        "ponts_thermiques":  10,
        "ventilation_air":   30,   # Ventilation plus critique en collectif
    },
}

# ─────────────────────────────────────────────────────────────
# Scénarios de rénovation — gains et coûts typiques
# Sources : ADEME, Agence Nationale de l'Habitat (ANAH), FFB 2024
# ─────────────────────────────────────────────────────────────
SCENARIOS_RENOVATION: dict[str, dict] = {
    "leger": {
        "label":  "Rénov. légère",
        "travaux": [
            "Isolation des combles perdus (R ≥ 7 m².K/W)",
            "Remplacement des fenêtres simple vitrage → double vitrage performant",
            "Régulation / programmation du chauffage (thermostat connecté)",
        ],
        "gain_pct":       0.25,   # Gain moyen sur consommation totale
        "cout_min_m2":    50,     # €/m² de surface habitable
        "cout_max_m2":    90,
        "duree_vie_ans":  25,
    },
    "intermediaire": {
        "label":  "Rénov. intermédiaire",
        "travaux": [
            "Isolation des combles perdus (R ≥ 7 m².K/W)",
            "Isolation des murs par l'extérieur ou l'intérieur (R ≥ 3,7 m².K/W)",
            "Remplacement des menuiseries (Uw ≤ 1,3 W/m².K)",
            "Ventilation mécanique contrôlée double flux",
            "Optimisation du système de chauffage existant ou remplacement partiel",
        ],
        "gain_pct":       0.45,
        "cout_min_m2":   150,
        "cout_max_m2":   220,
        "duree_vie_ans":  30,
    },
    "complet": {
        "label":  "Rénov. globale BBC",
        "travaux": [
            "Isolation des combles (R ≥ 7 m².K/W)",
            "Isolation des murs par l'extérieur (R ≥ 4,5 m².K/W)",
            "Isolation du plancher bas (R ≥ 3 m².K/W)",
            "Menuiseries triple vitrage ou double vitrage haute performance (Uw ≤ 1,0 W/m².K)",
            "VMC double flux avec récupérateur de chaleur (η ≥ 75 %)",
            "Pompe à chaleur air/eau ou géothermique",
            "Traitement des ponts thermiques",
        ],
        "gain_pct":       0.70,
        "cout_min_m2":   350,
        "cout_max_m2":   550,
        "duree_vie_ans":  40,
    },
}
