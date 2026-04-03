"""
Moteur de calcul énergétique principal.

Méthodologie :
  1. Détermination du ratio de référence kWh EP/m²/an selon l'époque + type
  2. Application des corrections climatique et isolation
  3. Conversion EP → EF via le rendement du système de chauffage
  4. Calcul coût et CO₂
  5. Attribution de la classe DPE (seuils décret 2021)
  6. Répartition des déperditions par poste
  7. Génération des 3 scénarios de rénovation
"""

from .models import (
    Logement, ResultatConsommation, PosteDeperdition,
    ScenarioRenovation, RapportEnergetique,
)
from .data.references import (
    RATIO_CONSOMMATION_BASE, FACTEURS_CLIMATIQUES, FACTEURS_ISOLATION,
    ENERGIE_CHAUFFAGE, SEUILS_DPE, DEPERDITIONS_BASE, SCENARIOS_RENOVATION,
)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _periode_construction(annee: int) -> str:
    """Retourne la clé de période de construction."""
    if annee < 1948:
        return "avant_1948"
    elif annee <= 1974:
        return "1948_1974"
    elif annee <= 1981:
        return "1975_1981"
    elif annee <= 1988:
        return "1982_1988"
    elif annee <= 2000:
        return "1989_2000"
    elif annee <= 2005:
        return "2001_2005"
    elif annee <= 2012:
        return "2006_2012"
    elif annee <= 2020:
        return "2013_2020"
    else:
        return "apres_2020"


def _facteur_climatique(ville: str) -> float:
    """Retourne le facteur climatique correspondant à la ville (insensible à la casse)."""
    ville_norm = ville.strip().lower()
    # Recherche exacte puis recherche partielle
    if ville_norm in FACTEURS_CLIMATIQUES:
        return FACTEURS_CLIMATIQUES[ville_norm]
    for cle, facteur in FACTEURS_CLIMATIQUES.items():
        if cle in ville_norm or ville_norm in cle:
            return facteur
    return FACTEURS_CLIMATIQUES["defaut"]


def _classe_dpe(conso_ep_m2: float) -> tuple[str, str]:
    """Retourne (lettre, label) selon les seuils DPE 2021."""
    for seuil, lettre, label in SEUILS_DPE:
        if conso_ep_m2 <= seuil:
            return lettre, label
    return "G", "Passoire thermique"


def _valider_logement(logement: Logement) -> None:
    """Lève ValueError si les paramètres du logement sont incohérents."""
    if logement.surface <= 0:
        raise ValueError(f"Surface invalide : {logement.surface} m²")
    if logement.annee_construction < 1800 or logement.annee_construction > 2026:
        raise ValueError(f"Année de construction invalide : {logement.annee_construction}")
    if logement.type_logement not in ("maison", "appartement"):
        raise ValueError(f"Type de logement invalide : {logement.type_logement}")
    if logement.type_chauffage not in ENERGIE_CHAUFFAGE:
        types_valides = ", ".join(ENERGIE_CHAUFFAGE.keys())
        raise ValueError(
            f"Type de chauffage inconnu : '{logement.type_chauffage}'. "
            f"Valeurs acceptées : {types_valides}"
        )
    if logement.niveau_isolation not in FACTEURS_ISOLATION:
        raise ValueError(f"Niveau d'isolation invalide : {logement.niveau_isolation}")


# ─────────────────────────────────────────────────────────────
# Calcul de consommation
# ─────────────────────────────────────────────────────────────

def calculer_consommation(logement: Logement) -> ResultatConsommation:
    """
    Calcule la consommation énergétique annuelle du logement.

    Retourne un objet ResultatConsommation.
    """
    _valider_logement(logement)

    chauffage = ENERGIE_CHAUFFAGE[logement.type_chauffage]
    periode   = _periode_construction(logement.annee_construction)
    ratio_ref = RATIO_CONSOMMATION_BASE[logement.type_logement][periode]
    f_clim    = _facteur_climatique(logement.ville)
    f_iso     = FACTEURS_ISOLATION[logement.niveau_isolation]

    # Énergie primaire corrigée (kWh EP/m²/an)
    conso_ep_m2 = ratio_ref * f_clim * f_iso

    # Énergie finale (kWh EF/m²/an) : EP / (coeff_ep × efficacite)
    # Le coeff_ep convertit EF → EP ; on divise pour revenir à EF.
    conso_ef_m2 = conso_ep_m2 / (chauffage["coeff_ep"] * chauffage["efficacite"])

    # Totaux annuels
    conso_ep_tot = conso_ep_m2 * logement.surface
    conso_ef_tot = conso_ef_m2 * logement.surface

    # Coût annuel et émissions CO₂
    cout_annuel   = conso_ef_tot * chauffage["cout_kwh"]
    emissions_co2 = conso_ef_tot * chauffage["co2_kwh"]

    classe, label = _classe_dpe(conso_ep_m2)

    return ResultatConsommation(
        conso_ep_kwh_m2   = round(conso_ep_m2, 1),
        conso_ef_kwh_m2   = round(conso_ef_m2, 1),
        conso_ep_totale   = round(conso_ep_tot, 0),
        conso_ef_totale   = round(conso_ef_tot, 0),
        cout_annuel_eur   = round(cout_annuel, 0),
        emissions_co2_kg  = round(emissions_co2, 0),
        classe_dpe        = classe,
        label_dpe         = label,
        facteur_climatique= f_clim,
        facteur_isolation = f_iso,
    )


# ─────────────────────────────────────────────────────────────
# Déperditions thermiques
# ─────────────────────────────────────────────────────────────

def calculer_deperditions(
    logement: Logement,
    conso_ef_totale: float,
) -> list[PosteDeperdition]:
    """
    Répartit la consommation totale sur les postes de déperdition.

    Les ratios DEPERDITIONS_BASE varient selon l'isolation déclarée pour
    refléter l'atténuation de certains postes déjà traités.
    """
    base = dict(DEPERDITIONS_BASE[logement.type_logement])

    # Ajustement qualitatif : si l'isolation est bonne, les murs et toiture
    # pèsent moins et la ventilation prend relativement plus de poids.
    if logement.niveau_isolation in ("bonne", "excellente"):
        base["toiture_combles"]  = max(base["toiture_combles"] - 8, 5)
        base["murs"]             = max(base["murs"] - 8, 10)
        base["ventilation_air"] += 10
    elif logement.niveau_isolation == "aucune":
        base["toiture_combles"] += 5
        base["murs"]            += 5
        base["ventilation_air"] -= 5

    # Normalisation pour que la somme = 100 %
    total_pct = sum(base.values())
    postes = []
    for nom, pct_raw in base.items():
        pct_norm  = pct_raw / total_pct * 100
        kwh_perdus = conso_ef_totale * pct_norm / 100
        postes.append(PosteDeperdition(
            nom        = nom.replace("_", " ").capitalize(),
            pourcentage= round(pct_norm, 1),
            kwh_perdus = round(kwh_perdus, 0),
        ))

    return sorted(postes, key=lambda p: p.pourcentage, reverse=True)


# ─────────────────────────────────────────────────────────────
# Scénarios de rénovation
# ─────────────────────────────────────────────────────────────

def calculer_scenarios(
    logement: Logement,
    consommation: ResultatConsommation,
) -> list[ScenarioRenovation]:
    """
    Génère les 3 scénarios de rénovation (léger, intermédiaire, complet).

    Les gains sont appliqués sur l'énergie finale puis reconvertis en EP.
    """
    chauffage = ENERGIE_CHAUFFAGE[logement.type_chauffage]
    scenarios = []

    for niveau, params in SCENARIOS_RENOVATION.items():
        gain_pct      = params["gain_pct"]
        gain_kwh_ef   = consommation.conso_ef_totale * gain_pct
        gain_kwh_ep   = gain_kwh_ef * chauffage["coeff_ep"] * chauffage["efficacite"]
        conso_ep_apres_tot  = consommation.conso_ep_totale - gain_kwh_ep
        conso_ep_apres_m2   = conso_ep_apres_tot / logement.surface
        classe_apres, _     = _classe_dpe(max(conso_ep_apres_m2, 0))

        economie_eur  = gain_kwh_ef * chauffage["cout_kwh"]
        co2_evite     = gain_kwh_ef * chauffage["co2_kwh"]

        cout_min = params["cout_min_m2"] * logement.surface
        cout_max = params["cout_max_m2"] * logement.surface
        cout_centre = (cout_min + cout_max) / 2
        roi_ans = cout_centre / economie_eur if economie_eur > 0 else float("inf")

        scenarios.append(ScenarioRenovation(
            niveau                       = niveau,
            label                        = params["label"],
            travaux                      = params["travaux"],
            gain_pct                     = gain_pct,
            gain_kwh_ef                  = round(gain_kwh_ef, 0),
            gain_kwh_ep                  = round(gain_kwh_ep, 0),
            conso_ep_apres               = round(max(conso_ep_apres_m2, 0), 1),
            classe_dpe_apres             = classe_apres,
            economie_annuelle_eur        = round(economie_eur, 0),
            cout_min_eur                 = round(cout_min, 0),
            cout_max_eur                 = round(cout_max, 0),
            retour_sur_investissement_ans= round(roi_ans, 1),
            co2_evite_kg                 = round(co2_evite, 0),
        ))

    return scenarios


# ─────────────────────────────────────────────────────────────
# Hypothèses explicites
# ─────────────────────────────────────────────────────────────

def _construire_hypotheses(logement: Logement, conso: ResultatConsommation) -> list[str]:
    """Génère la liste des hypothèses de calcul pour traçabilité."""
    chauffage = ENERGIE_CHAUFFAGE[logement.type_chauffage]
    periode   = _periode_construction(logement.annee_construction)
    ratio_ref = RATIO_CONSOMMATION_BASE[logement.type_logement][periode]

    return [
        f"Ratio de référence ({logement.type_logement}, {periode}) : {ratio_ref} kWh EP/m²/an",
        f"Facteur climatique ({logement.ville}) : {conso.facteur_climatique:.2f}",
        f"Facteur isolation ({logement.niveau_isolation}) : {conso.facteur_isolation:.2f}",
        f"Système de chauffage : {chauffage['label']} "
          f"(rendement {chauffage['efficacite']:.2f}, "
          f"coeff. EP {chauffage['coeff_ep']:.1f})",
        f"Coût énergie appliqué : {chauffage['cout_kwh']:.4f} €/kWh EF",
        f"Facteur d'émission CO₂ : {chauffage['co2_kwh']:.3f} kg CO₂/kWh EF",
        "Gains rénovation appliqués sur l'énergie finale avant reconversion en EP.",
        "Coûts travaux en €/m² de surface habitable (hors aides fiscales).",
        "ROI calculé sur la valeur centrale de la fourchette de coûts.",
        "Déperditions : répartition ADEME adaptée au type et niveau d'isolation.",
    ]


# ─────────────────────────────────────────────────────────────
# Point d'entrée principal
# ─────────────────────────────────────────────────────────────

def analyser_logement(logement: Logement) -> RapportEnergetique:
    """
    Lance l'analyse complète d'un logement et retourne le rapport énergétique.

    Paramètres
    ----------
    logement : Logement
        Description complète du logement.

    Retourne
    --------
    RapportEnergetique
        Rapport structuré contenant consommation, déperditions, scénarios et hypothèses.
    """
    conso       = calculer_consommation(logement)
    deperditions= calculer_deperditions(logement, conso.conso_ef_totale)
    scenarios   = calculer_scenarios(logement, conso)
    hypotheses  = _construire_hypotheses(logement, conso)

    return RapportEnergetique(
        logement    = logement,
        consommation= conso,
        deperditions= deperditions,
        scenarios   = scenarios,
        hypotheses  = hypotheses,
    )
