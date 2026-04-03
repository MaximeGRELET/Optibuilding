"""
Formatage du rapport énergétique en texte structuré.
"""

from .models import RapportEnergetique

# Caractères de couleur DPE
_COULEUR_DPE: dict[str, str] = {
    "A": "🟩", "B": "🟩", "C": "🟨",
    "D": "🟧", "E": "🟧", "F": "🟥", "G": "🟥",
}

_FLECHE_TREND: dict[str, str] = {
    "A": "↑↑", "B": "↑", "C": "→",
    "D": "↓", "E": "↓↓", "F": "↓↓↓", "G": "↓↓↓",
}


def _ligne(char: str = "─", largeur: int = 68) -> str:
    return char * largeur


def _titre(texte: str, niveau: int = 1) -> str:
    if niveau == 1:
        return f"\n{'═' * 68}\n  {texte.upper()}\n{'═' * 68}"
    elif niveau == 2:
        return f"\n{_ligne()}\n  {texte}\n{_ligne()}"
    return f"\n  ▸ {texte}"


def formater_rapport(rapport: RapportEnergetique) -> str:
    """Retourne le rapport complet sous forme de texte formaté."""
    log = rapport.logement
    co  = rapport.consommation
    lignes: list[str] = []

    # ─── EN-TÊTE ────────────────────────────────────────────────────────────
    lignes.append(_titre("Rapport d'analyse énergétique — OptiBuilding", 1))
    lignes.append(f"""
  Logement   : {log.type_logement.capitalize()} de {log.surface} m²
  Construit  : {log.annee_construction}
  Chauffage  : {log.type_chauffage.replace('_', ' ').capitalize()}
  Isolation  : {log.niveau_isolation.capitalize()}
  Localisation : {log.ville.capitalize()}
""")

    # ─── RÉSUMÉ GLOBAL ──────────────────────────────────────────────────────
    lignes.append(_titre("1. Résumé global", 2))
    icone = _COULEUR_DPE.get(co.classe_dpe, "⬜")
    lignes.append(f"""
  Classe DPE actuelle    : {icone} {co.classe_dpe}  ({co.label_dpe})
  Consommation EP        : {co.conso_ep_kwh_m2:>7.1f} kWh EP/m²/an
  Consommation EF        : {co.conso_ef_kwh_m2:>7.1f} kWh EF/m²/an
  Consommation EP totale : {co.conso_ep_totale:>9,.0f} kWh EP/an
  Consommation EF totale : {co.conso_ef_totale:>9,.0f} kWh EF/an
  Facture énergétique    : {co.cout_annuel_eur:>9,.0f} €/an
  Émissions CO₂          : {co.emissions_co2_kg:>9,.0f} kg CO₂/an
""")

    # ─── DÉPERDITIONS ───────────────────────────────────────────────────────
    lignes.append(_titre("2. Répartition des déperditions thermiques", 2))
    lignes.append("")
    lignes.append(
        f"  {'Poste':<28} {'Part (%)':<12} {'kWh EF/an':<12} {'Barre'}"
    )
    lignes.append(f"  {_ligne('-', 64)}")
    for dep in rapport.deperditions:
        barre = "█" * int(dep.pourcentage / 3)
        lignes.append(
            f"  {dep.nom:<28} {dep.pourcentage:>7.1f} %   "
            f"{dep.kwh_perdus:>8,.0f}     {barre}"
        )
    lignes.append("")

    # ─── SCÉNARIOS ──────────────────────────────────────────────────────────
    lignes.append(_titre("3. Scénarios de rénovation", 2))

    for sc in rapport.scenarios:
        icone_apres = _COULEUR_DPE.get(sc.classe_dpe_apres, "⬜")
        lignes.append(f"""
  ┌─ {sc.label.upper()} {'─' * (54 - len(sc.label))}┐""")

        lignes.append("  │  Travaux proposés :")
        for t in sc.travaux:
            lignes.append(f"  │    • {t}")

        lignes.append(f"""  │
  │  Résultats estimés :
  │    Gain énergétique       : {sc.gain_pct * 100:.0f} %
  │    Économie EF            : {sc.gain_kwh_ef:>8,.0f} kWh EF/an
  │    Économie EP            : {sc.gain_kwh_ep:>8,.0f} kWh EP/an
  │    Consommation EP après  : {sc.conso_ep_apres:>8.1f} kWh EP/m²/an
  │    Classe DPE après       : {icone_apres} {sc.classe_dpe_apres}
  │    Économie facture       : {sc.economie_annuelle_eur:>8,.0f} €/an
  │    CO₂ évité              : {sc.co2_evite_kg:>8,.0f} kg CO₂/an
  │
  │  Investissement :
  │    Coût travaux           : {sc.cout_min_eur:>8,.0f} – {sc.cout_max_eur:,.0f} €
  │    Retour sur invest.     : {sc.retour_sur_investissement_ans:>8.1f} ans
  └{'─' * 58}┘""")

    # ─── TABLEAU DE COMPARAISON ─────────────────────────────────────────────
    lignes.append(_titre("4. Tableau comparatif des scénarios", 2))
    lignes.append("")
    entete = (
        f"  {'Scénario':<20} {'DPE':<5} {'Gain %':<9} "
        f"{'Économie €/an':<16} {'Coût min €':<13} {'Coût max €':<12} {'ROI (ans)'}"
    )
    lignes.append(entete)
    lignes.append(f"  {_ligne('-', 90)}")

    # Situation actuelle
    icone_actuel = _COULEUR_DPE.get(co.classe_dpe, "⬜")
    lignes.append(
        f"  {'Situation actuelle':<20} {icone_actuel + ' ' + co.classe_dpe:<5}  {'—':<9} "
        f"{'—':<16} {'—':<13} {'—':<12} {'—'}"
    )
    for sc in rapport.scenarios:
        icone_apres = _COULEUR_DPE.get(sc.classe_dpe_apres, "⬜")
        lignes.append(
            f"  {sc.label:<20} {icone_apres + ' ' + sc.classe_dpe_apres:<5}  "
            f"{sc.gain_pct * 100:>5.0f} %   "
            f"{sc.economie_annuelle_eur:>10,.0f} €     "
            f"{sc.cout_min_eur:>9,.0f} €   "
            f"{sc.cout_max_eur:>9,.0f} €   "
            f"{sc.retour_sur_investissement_ans:>6.1f}"
        )
    lignes.append("")

    # ─── HYPOTHÈSES ─────────────────────────────────────────────────────────
    lignes.append(_titre("5. Hypothèses de calcul", 2))
    lignes.append("")
    for h in rapport.hypotheses:
        lignes.append(f"  • {h}")
    lignes.append("")
    lignes.append(
        "  ⚠  Ces estimations sont basées sur des ratios statistiques nationaux\n"
        "     (ADEME / ANAH / FFB). Pour un DPE opposable, un diagnostiqueur\n"
        "     certifié doit réaliser une étude sur site.\n"
    )
    lignes.append(_ligne("═"))

    return "\n".join(lignes)
