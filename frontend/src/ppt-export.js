/**
 * PPT export — Professional PowerPoint report (PptxGenJS)
 * Color palette inspired by Efficacity corporate identity:
 *   Primary blue  #0158A5
 *   Accent blue   #008ECF
 *   Dark red      #B30000
 *   Light gray    #F1F1F1
 *   Dark text     #1A1A2E
 */

import PptxGenJS from 'pptxgenjs'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  primary:   '0158A5',
  accent:    '008ECF',
  red:       'B30000',
  dark:      '1A1A2E',
  mid:       '4A5568',
  light:     'F1F5F9',
  white:     'FFFFFF',
  border:    'CBD5E1',
  dpe: {
    A: '27AE60', B: '6EBE44', C: 'B5D334',
    D: 'F1C40F', E: 'F39C12', F: 'E67E22', G: 'E74C3C',
  },
}

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {string}   projectName
 * @param {object}   analysisResult   — BuildingNeedsResult.to_dict()
 * @param {object}   renovationResult — { baseline, scenarios[] }
 * @param {object[]} savedScenarios   — from scenario-compare state
 */
export async function exportStudyPPT(projectName, analysisResult, renovationResult, savedScenarios = []) {
  const prs  = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'   // 13.33 × 7.5 in
  prs.author = 'Jean Rénov — Efficacity'
  prs.company = 'Efficacity'
  prs.subject = `Étude énergétique — ${projectName}`
  prs.title   = projectName

  // ── Slide 1 : Couverture ──────────────────────────────────────────────────
  _slideCover(prs, projectName, analysisResult)

  // ── Slide 2 : Modèle thermique ────────────────────────────────────────────
  _slideModel(prs, analysisResult)

  // ── Slide 3 : Bâtiment — zones & enveloppe ───────────────────────────────
  _slideEnvelope(prs, analysisResult)

  // ── Slide 4 : Résultats baseline ─────────────────────────────────────────
  _slideBaseline(prs, analysisResult)

  // ── Slide 5 : Consommation mensuelle ─────────────────────────────────────
  _slideMonthly(prs, analysisResult)

  // ── Slides scénarios enregistrés ─────────────────────────────────────────
  const allScenarios = _collectScenarios(renovationResult, savedScenarios)
  allScenarios.forEach((s, i) => _slideScenario(prs, s, i, allScenarios.length))

  // ── Slide finale : Comparaison ────────────────────────────────────────────
  if (allScenarios.length > 1) _slideComparison(prs, allScenarios)

  // ── Slide de conclusion ───────────────────────────────────────────────────
  _slideEnd(prs, projectName)

  await prs.writeFile({ fileName: `JeanRenov_${_slug(projectName)}_${_dateStr()}.pptx` })
}

// ── Slide helpers ─────────────────────────────────────────────────────────────

function _slideCover(prs, projectName, a) {
  const slide = prs.addSlide()

  // Full background blue gradient band (left third)
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 4.2, h: 7.5,
    fill: { color: C.primary },
  })
  // Accent bar
  slide.addShape(prs.ShapeType.rect, {
    x: 4.2, y: 0, w: 0.08, h: 7.5,
    fill: { color: C.accent },
  })

  // Logo / monogram
  slide.addText('OB', {
    x: 0.4, y: 0.4, w: 1.0, h: 1.0,
    fontSize: 28, bold: true, color: C.white,
    align: 'center', valign: 'middle',
    fill: { color: C.accent },
    shape: prs.ShapeType.roundRect,
    rectRadius: 0.12,
  })
  slide.addText('Jean Rénov', {
    x: 1.55, y: 0.52, w: 2.4, h: 0.4,
    fontSize: 13, bold: true, color: C.white,
  })
  slide.addText('by Efficacity', {
    x: 1.55, y: 0.88, w: 2.4, h: 0.28,
    fontSize: 9, color: 'A8C8E8',
  })

  // Project title
  slide.addText(projectName, {
    x: 0.35, y: 2.2, w: 3.6, h: 1.6,
    fontSize: 22, bold: true, color: C.white,
    wrap: true, valign: 'top',
  })

  // Subtitle
  slide.addText('ÉTUDE ÉNERGÉTIQUE', {
    x: 0.35, y: 3.9, w: 3.6, h: 0.4,
    fontSize: 10, color: 'A8C8E8', bold: true,
    charSpacing: 2,
  })

  // Date
  slide.addText(_dateLabel(), {
    x: 0.35, y: 6.8, w: 3.6, h: 0.35,
    fontSize: 9, color: '7AABCF',
  })

  // Right panel — KPI summary
  const dpe = a?.dpe_class || '?'
  const ep  = a?.primary_energy_kwh_m2?.toFixed(0) ?? '—'
  const co2 = a?.co2_kg_m2?.toFixed(1) ?? '—'
  const surf = a?.total_floor_area_m2?.toFixed(0) ?? '—'

  _addSectionTitle(slide, 'INDICATEURS CLÉS', 4.6, 0.55, 8.5)

  const kpis = [
    { label: 'Classe DPE', value: dpe, unit: '', color: C.dpe[dpe] || C.mid, big: true },
    { label: 'Énergie primaire', value: ep, unit: 'kWh EP/m²/an' },
    { label: 'Émissions CO₂', value: co2, unit: 'kg/m²/an' },
    { label: 'Surface totale', value: surf, unit: 'm²' },
  ]
  kpis.forEach((k, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 4.6 + col * 4.5
    const y = 1.15 + row * 2.1
    _addKpiCard(slide, k.label, k.value, k.unit, x, y, 4.0, 1.7, k.color, k.big)
  })

  // Heating / cooling row
  const heat = a?.heating_need_kwh?.toFixed(0) ?? '—'
  const cool = a?.cooling_need_kwh?.toFixed(0) ?? '—'
  const cost = a?.cost_eur?.toFixed(0) ?? '—'
  _addSectionTitle(slide, 'BESOINS THERMIQUES', 4.6, 5.4, 8.5)
  const row2 = [
    { label: 'Chauffage', value: _fmtNum(heat), unit: 'kWh/an' },
    { label: 'Refroidissement', value: _fmtNum(cool), unit: 'kWh/an' },
    { label: 'Coût énergie', value: _fmtNum(cost), unit: '€/an' },
  ]
  row2.forEach((k, i) => {
    _addKpiCard(slide, k.label, k.value, k.unit, 4.6 + i * 2.95, 5.75, 2.6, 1.3)
  })
}

function _slideModel(prs, a) {
  const slide = prs.addSlide()
  _addSlideHeader(slide, 'MODÈLE THERMIQUE', 'Méthodologie et hypothèses physiques')

  const zones = a?.zones || []
  const method = a?.method === 'hourly' ? 'Horaire (RC nodal)' : 'Mensuel (ISO 13790)'

  const blocks = [
    {
      icon: '📐', title: 'Méthode de calcul',
      lines: [
        method,
        'Norme EN ISO 13790 — besoins de chauffage et refroidissement',
        'Bilan thermique stationnaire mensuel par zone',
      ],
    },
    {
      icon: '🏗️', title: 'Modélisation des zones',
      lines: [
        `${zones.length} zone${zones.length > 1 ? 's' : ''} thermique${zones.length > 1 ? 's' : ''} modélisée${zones.length > 1 ? 's' : ''}`,
        'Géométrie importée via GeoJSON (Leaflet Draw)',
        'Hauteur, usage, ère de construction par zone',
      ],
    },
    {
      icon: '🌡️', title: 'Données météo',
      lines: [
        'Fichier EPW (EnergyPlus Weather)',
        'Températures horaires, rayonnement solaire',
        'Station sélectionnée par proximité géographique',
      ],
    },
    {
      icon: '🔥', title: 'Systèmes énergétiques',
      lines: [
        'Chauffage : PAC, chaudière gaz, réseau de chaleur',
        'Refroidissement : split AC, multisplit, PAC réversible',
        'VMC double flux avec récupération de chaleur',
      ],
    },
    {
      icon: '📊', title: 'Indicateurs calculés',
      lines: [
        'DPE (classe A→G) énergie primaire + CO₂',
        'Besoins mensuels chauffage & refroidissement',
        'Énergie finale, primaire, coût, CO₂',
      ],
    },
    {
      icon: '⚙️', title: 'Calibration',
      lines: [
        'Ajustement sur consommation réelle mesurée',
        'Correction des facteurs U et infiltrations',
        'Validation graphique mensuelle',
      ],
    },
  ]

  blocks.forEach((b, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 0.4 + col * 4.3
    const y = 1.35 + row * 2.65
    _addInfoCard(slide, b.icon, b.title, b.lines, x, y, 3.9, 2.3)
  })
}

function _slideEnvelope(prs, a) {
  const slide = prs.addSlide()
  _addSlideHeader(slide, 'ENVELOPPE & ZONES', 'Caractéristiques thermiques du bâtiment')

  const zones = a?.zones || []
  if (!zones.length) {
    slide.addText('Aucune donnée de zone disponible.', {
      x: 0.4, y: 2, w: 12.5, h: 1,
      fontSize: 12, color: C.mid, align: 'center',
    })
    return
  }

  // Table header
  const colW = [2.8, 1.3, 1.3, 1.5, 1.5, 1.5, 1.5, 1.4]
  const headers = ['Zone', 'Surface\n(m²)', 'Chauffage\n(kWh)', 'Refroid.\n(kWh)', 'Ht (W/m²K)', 'Hv (W/m²K)', 'Gains sol.\n(kWh)', 'Pertes tot.\n(kWh)']

  const rows = [headers]
  zones.forEach(z => {
    rows.push([
      z.zone_label || z.zone_id || '—',
      _fmtNum(z.floor_area_m2?.toFixed(0)),
      _fmtNum(z.heating_need_kwh?.toFixed(0)),
      _fmtNum(z.cooling_need_kwh?.toFixed(0)),
      z.h_t_w_k?.toFixed(1) ?? '—',
      z.h_v_w_k?.toFixed(1) ?? '—',
      _fmtNum(z.solar_gains_kwh?.toFixed(0)),
      _fmtNum(z.total_losses_kwh?.toFixed(0)),
    ])
  })

  slide.addTable(rows, {
    x: 0.4, y: 1.35, w: 12.5, h: Math.min(3.5, 0.45 + rows.length * 0.42),
    colW,
    border: { type: 'solid', pt: 0.5, color: C.border },
    fill: { color: C.white },
    fontFace: 'Calibri',
    fontSize: 9,
    align: 'center',
    valign: 'middle',
    rowH: 0.42,
    firstRowFill: { color: C.primary },
    firstRowColor: C.white,
    firstRowFontSize: 9,
    firstRowBold: true,
  })

  // Envelope breakdown if available (first zone)
  const eb = zones[0]?.envelope_breakdown
  if (eb && Object.keys(eb).length) {
    _addSectionTitle(slide, 'DÉPERDITIONS PAR COMPOSANT (zone principale)', 0.4, 5.1, 12.5)
    const ebItems = Object.entries(eb).map(([k, v]) => ({ label: _labelComp(k), value: v }))
      .sort((a, b) => b.value - a.value)
    const total = ebItems.reduce((s, x) => s + x.value, 0)
    const barW  = 12.0
    let cx = 0.65
    ebItems.forEach((item, i) => {
      const pct  = total > 0 ? item.value / total : 0
      const w    = Math.max(0.1, pct * barW)
      const color = _barColor(i)
      slide.addShape(prs.ShapeType.rect, { x: cx, y: 5.55, w, h: 0.5, fill: { color }, line: { color: C.white, pt: 1 } })
      if (w > 0.6) {
        slide.addText(`${Math.round(pct * 100)}%`, {
          x: cx, y: 5.55, w, h: 0.5,
          fontSize: 7, bold: true, color: C.white, align: 'center', valign: 'middle',
        })
      }
      // Legend
      slide.addShape(prs.ShapeType.rect, { x: 0.65 + i * 2.1, y: 6.25, w: 0.18, h: 0.18, fill: { color } })
      slide.addText(`${item.label} (${Math.round(pct * 100)}%)`, {
        x: 0.88 + i * 2.1, y: 6.22, w: 1.85, h: 0.24,
        fontSize: 7.5, color: C.dark,
      })
      cx += w
    })
  }
}

function _slideBaseline(prs, a) {
  const slide = prs.addSlide()
  _addSlideHeader(slide, 'PERFORMANCE ÉNERGÉTIQUE', 'Résultats de la simulation baseline')

  const dpe  = a?.dpe_class || '?'
  const co2c = a?.dpe_co2_class || '?'
  const ep   = a?.primary_energy_kwh_m2?.toFixed(1) ?? '—'
  const co2  = a?.co2_kg_m2?.toFixed(2) ?? '—'
  const heat = _fmtNum(a?.heating_need_kwh?.toFixed(0))
  const cool = _fmtNum(a?.cooling_need_kwh?.toFixed(0))
  const cost = _fmtNum(a?.cost_eur?.toFixed(0))
  const surf = a?.total_floor_area_m2?.toFixed(0) ?? '—'

  // DPE gauge bar (left)
  _addDPEBar(slide, dpe, 0.4, 1.35, 2.0, 5.7)

  // KPI grid (right)
  const kpis = [
    { label: 'Énergie primaire', value: ep, unit: 'kWh EP/m²/an', color: C.primary },
    { label: 'Classe CO₂',       value: co2c, unit: '',            color: C.dpe[co2c] || C.mid },
    { label: 'Émissions CO₂',    value: co2, unit: 'kg CO₂/m²/an' },
    { label: 'Besoin chauffage',  value: heat, unit: 'kWh/an' },
    { label: 'Besoin froid',      value: cool, unit: 'kWh/an' },
    { label: 'Coût total',        value: cost, unit: '€/an', color: C.red },
    { label: 'Surface',           value: surf, unit: 'm²' },
  ]
  kpis.forEach((k, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    _addKpiCard(slide, k.label, k.value, k.unit,
      2.8 + col * 3.55, 1.35 + row * 2.0, 3.2, 1.7, k.color)
  })
}

function _slideMonthly(prs, a) {
  const slide = prs.addSlide()
  _addSlideHeader(slide, 'CONSOMMATION MENSUELLE', 'Besoins thermiques mois par mois')

  const zones = a?.zones || []
  const heating = new Array(12).fill(0)
  const cooling = new Array(12).fill(0)
  zones.forEach(z => {
    z.heating_need_monthly?.forEach((v, i) => { heating[i] += v || 0 })
    z.cooling_need_monthly?.forEach((v, i) => { cooling[i] += v || 0 })
  })

  const hasCooling = cooling.some(v => v > 0)
  const chartH     = hasCooling ? 2.6 : 4.8
  const maxHeat    = Math.max(...heating, 1)
  const maxCool    = Math.max(...cooling, 1)

  // Heating bar chart (red)
  _addSectionTitle(slide, 'CHAUFFAGE (kWh/mois)', 0.4, 1.2, 12.5)
  _addBarChart(slide, heating, maxHeat, MONTHS, 0.4, 1.45, 12.5, chartH, C.red)

  if (hasCooling) {
    // Cooling bar chart (blue)
    _addSectionTitle(slide, 'REFROIDISSEMENT (kWh/mois)', 0.4, 4.35, 12.5)
    _addBarChart(slide, cooling, maxCool, MONTHS, 0.4, 4.6, 12.5, 2.4, C.primary)
  }

  // Summary stats
  const totalHeat = heating.reduce((s, v) => s + v, 0)
  const totalCool = cooling.reduce((s, v) => s + v, 0)
  const peakHeat  = Math.max(...heating)
  const peakCool  = Math.max(...cooling)
  const peakHeatM = MONTHS[heating.indexOf(peakHeat)]
  const peakCoolM = MONTHS[cooling.indexOf(peakCool)]

  const stats = [
    { label: 'Total chauffage', value: _fmtNum(Math.round(totalHeat)), unit: 'kWh/an' },
    { label: 'Pic chauffage', value: `${_fmtNum(Math.round(peakHeat))} kWh`, unit: peakHeatM },
    ...(hasCooling ? [
      { label: 'Total froid', value: _fmtNum(Math.round(totalCool)), unit: 'kWh/an' },
      { label: 'Pic froid', value: `${_fmtNum(Math.round(peakCool))} kWh`, unit: peakCoolM },
    ] : []),
  ]
  stats.forEach((s, i) => {
    _addKpiCard(slide, s.label, s.value, s.unit, 0.4 + i * 3.3, 6.85, 3.0, 0.52)
  })
}

function _slideScenario(prs, s, idx, total) {
  const slide = prs.addSlide()
  const label = s.scenario_label || s.name || `Scénario ${idx + 1}`
  _addSlideHeader(slide, `SCÉNARIO ${idx + 1}/${total}`, label)

  const beforeDpe = s.baseline_dpe || s.dpe_before || '?'
  const afterDpe  = s.after_dpe    || s.dpe_after  || '?'
  const invest    = s.investment_center_eur ?? s.investment_max_eur ?? 0
  const savings   = s.cost_savings_eur_per_year ?? 0
  const roi       = s.simple_payback_years
  const reduc     = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
  const ep        = s.primary_energy_after_kwh_m2 ?? s.after_full?.primary_energy_kwh_m2

  // DPE before → after
  _addSectionTitle(slide, 'CLASSE DPE', 0.4, 1.25, 3.5)
  _addDPEArrow(slide, beforeDpe, afterDpe, 0.4, 1.55, 3.5)

  // KPIs
  const kpis = [
    { label: 'Réduction chauffage', value: `−${Math.round(reduc)} %`, unit: '', color: reduc > 30 ? '27AE60' : C.accent },
    { label: 'Économie annuelle',   value: _fmtNum(Math.round(savings)), unit: '€/an', color: '27AE60' },
    { label: 'Investissement',      value: _fmtNum(Math.round(invest)), unit: '€' },
    { label: 'Retour sur invest.',  value: roi != null && roi < 99 ? `${Math.round(roi)} ans` : '> 99', unit: '', color: roi < 15 ? '27AE60' : roi < 30 ? C.accent : C.red },
    { label: 'Énergie primaire',    value: ep?.toFixed(0) ?? '—', unit: 'kWh EP/m²/an' },
  ]
  kpis.forEach((k, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    _addKpiCard(slide, k.label, k.value, k.unit, 4.2 + col * 3.1, 1.25 + row * 2.0, 2.8, 1.7, k.color)
  })

  // Actions list
  const actions = s.actions || []
  if (actions.length) {
    _addSectionTitle(slide, 'ACTIONS INCLUSES', 0.4, 4.55, 12.5)
    actions.forEach((a, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      slide.addShape(prs.ShapeType.rect, {
        x: 0.4 + col * 6.35, y: 4.9 + row * 0.72, w: 6.1, h: 0.62,
        fill: { color: C.light }, line: { color: C.border, pt: 0.5 },
        rectRadius: 0.08,
      })
      slide.addText([
        { text: '✔ ', options: { color: C.primary, bold: true, fontSize: 9 } },
        { text: a.label || a.action_id || '—', options: { color: C.dark, bold: true, fontSize: 9 } },
        { text: a.description ? `  —  ${a.description}` : '', options: { color: C.mid, fontSize: 8 } },
      ], { x: 0.55 + col * 6.35, y: 4.9 + row * 0.72, w: 5.8, h: 0.62, valign: 'middle', wrap: true })
    })
  }

  // Monthly comparison if available
  const beforeMonthly = _extractMonthly(s, 'baseline')
  const afterMonthly  = _extractMonthly(s, 'after')
  if (beforeMonthly && afterMonthly) {
    const maxV = Math.max(...beforeMonthly, ...afterMonthly, 1)
    const y0   = actions.length > 4 ? 6.55 : 5.8
    _addSectionTitle(slide, 'BESOINS CHAUFFAGE — AVANT vs APRÈS', 0.4, y0 - 0.2, 12.5)
    _addDualBarChart(slide, beforeMonthly, afterMonthly, maxV, MONTHS, 0.4, y0, 12.5, 0.82)
  }
}

function _slideComparison(prs, scenarios) {
  const slide = prs.addSlide()
  _addSlideHeader(slide, 'COMPARAISON DES SCÉNARIOS', 'Vue synthétique de toutes les options étudiées')

  // Summary table
  const headers = ['Scénario', 'DPE avant', 'DPE après', 'Réduc. chauf.', 'Économie /an', 'Investissement', 'Retour (ans)', 'kWh/k€']
  const colW = [3.0, 1.1, 1.1, 1.3, 1.4, 1.5, 1.3, 1.3]

  const rows = [headers]
  scenarios.forEach(s => {
    const beforeDpe = s.baseline_dpe || s.dpe_before || '?'
    const afterDpe  = s.after_dpe    || s.dpe_after  || '?'
    const invest    = s.investment_center_eur ?? s.investment_max_eur ?? 0
    const savings   = s.cost_savings_eur_per_year ?? 0
    const roi       = s.simple_payback_years
    const reduc     = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
    const heatBef   = s.baseline_full?.heating_need_kwh ?? 0
    const heatAft   = s.after_full?.heating_need_kwh ?? 0
    const effic     = invest > 0 ? Math.round(((heatBef - heatAft) / invest) * 1000) : 0

    rows.push([
      s.scenario_label || s.name || '—',
      beforeDpe, afterDpe,
      `−${Math.round(reduc)} %`,
      `${_fmtNum(Math.round(savings))} €`,
      `${_fmtNum(Math.round(invest))} €`,
      roi != null && roi < 99 ? `${Math.round(roi)}` : '>99',
      effic > 0 ? `${_fmtNum(effic)}` : '—',
    ])
  })

  slide.addTable(rows, {
    x: 0.4, y: 1.35, w: 12.5, h: Math.min(4.0, 0.5 + rows.length * 0.52),
    colW,
    border: { type: 'solid', pt: 0.5, color: C.border },
    fontFace: 'Calibri',
    fontSize: 9.5,
    align: 'center',
    valign: 'middle',
    rowH: 0.52,
    firstRowFill: { color: C.primary },
    firstRowColor: C.white,
    firstRowFontSize: 9.5,
    firstRowBold: true,
    fill: { color: C.white },
    colLines: true,
  })

  // Efficiency bar chart
  const y0 = 1.35 + Math.min(4.0, 0.5 + rows.length * 0.52) + 0.35
  _addSectionTitle(slide, 'EFFICACITÉ ÉCONOMIQUE — kWh ÉCONOMISÉS PAR 1 000 € INVESTIS', 0.4, y0, 12.5)
  const efValues = scenarios.map(s => {
    const invest  = s.investment_center_eur ?? s.investment_max_eur ?? 0
    const heatBef = s.baseline_full?.heating_need_kwh ?? 0
    const heatAft = s.after_full?.heating_need_kwh ?? 0
    return invest > 0 ? Math.round(((heatBef - heatAft) / invest) * 1000) : 0
  })
  const efLabels = scenarios.map(s => _truncate(s.scenario_label || s.name || '—', 18))
  const maxEf = Math.max(...efValues, 1)
  const chartH = Math.min(2.2, 7.4 - y0 - 0.4)
  _addHBarChart(slide, efValues, efLabels, maxEf, 0.4, y0 + 0.3, 12.5, chartH)
}

function _slideEnd(prs, projectName) {
  const slide = prs.addSlide()

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 7.5,
    fill: { color: C.primary },
  })
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 6.8, w: 13.33, h: 0.12,
    fill: { color: C.accent },
  })

  slide.addText('OB', {
    x: 5.67, y: 1.4, w: 2.0, h: 2.0,
    fontSize: 52, bold: true, color: C.white,
    align: 'center', valign: 'middle',
    fill: { color: C.accent },
    shape: prs.ShapeType.roundRect,
    rectRadius: 0.24,
  })

  slide.addText('Jean Rénov — by Efficacity', {
    x: 2, y: 3.65, w: 9.33, h: 0.55,
    fontSize: 16, bold: true, color: C.white, align: 'center',
  })
  slide.addText(`Rapport généré le ${_dateLabel()}`, {
    x: 2, y: 4.3, w: 9.33, h: 0.4,
    fontSize: 10, color: 'A8C8E8', align: 'center',
  })
  slide.addText(projectName, {
    x: 2, y: 5.0, w: 9.33, h: 0.4,
    fontSize: 10, color: 'A8C8E8', align: 'center',
    italic: true,
  })
}

// ── Reusable drawing primitives ───────────────────────────────────────────────

function _addSlideHeader(slide, title, subtitle) {
  // Blue top bar
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.33, h: 1.05,
    fill: { color: C.primary },
  })
  slide.addShape('rect', {
    x: 0, y: 1.05, w: 13.33, h: 0.06,
    fill: { color: C.accent },
  })
  // Logo monogram
  slide.addText('OB', {
    x: 0.25, y: 0.18, w: 0.65, h: 0.65,
    fontSize: 11, bold: true, color: C.white,
    align: 'center', valign: 'middle',
    fill: { color: C.accent },
    shape: 'roundRect',
    rectRadius: 0.08,
  })
  slide.addText(title, {
    x: 1.05, y: 0.1, w: 9, h: 0.5,
    fontSize: 14, bold: true, color: C.white,
  })
  if (subtitle) {
    slide.addText(subtitle, {
      x: 1.05, y: 0.58, w: 10, h: 0.35,
      fontSize: 9, color: 'A8C8E8',
    })
  }
  // Page number placeholder
  slide.addText(_dateLabel(), {
    x: 10.8, y: 0.68, w: 2.3, h: 0.28,
    fontSize: 7.5, color: '7AABCF', align: 'right',
  })
}

function _addSectionTitle(slide, text, x, y, w) {
  slide.addText(text, {
    x, y, w, h: 0.28,
    fontSize: 8, bold: true, color: C.primary,
    charSpacing: 1.2,
  })
  slide.addShape('line', {
    x, y: y + 0.28, w, h: 0,
    line: { color: C.accent, pt: 0.75 },
  })
}

function _addKpiCard(slide, label, value, unit, x, y, w, h, color, big) {
  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: C.light },
    line: { color: C.border, pt: 0.5 },
    rectRadius: 0.1,
  })
  slide.addText(label, {
    x: x + 0.12, y: y + 0.1, w: w - 0.24, h: 0.26,
    fontSize: 7.5, color: C.mid, bold: false,
  })
  slide.addText(String(value), {
    x: x + 0.1, y: y + 0.3, w: w - 0.2, h: h - 0.55,
    fontSize: big ? 28 : 18, bold: true,
    color: color || C.dark,
    align: 'left', valign: 'middle',
  })
  if (unit) {
    slide.addText(unit, {
      x: x + 0.1, y: y + h - 0.28, w: w - 0.2, h: 0.24,
      fontSize: 7, color: C.mid,
    })
  }
}

function _addInfoCard(slide, icon, title, lines, x, y, w, h) {
  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: C.white },
    line: { color: C.border, pt: 0.5 },
    rectRadius: 0.1,
    shadow: { type: 'outer', blur: 3, offset: 1, angle: 45, color: 'D0D8E8', opacity: 0.4 },
  })
  // Accent top bar
  slide.addShape('rect', {
    x, y, w, h: 0.08,
    fill: { color: C.accent },
    rectRadius: 0.1,
  })
  slide.addText(`${icon}  ${title}`, {
    x: x + 0.15, y: y + 0.14, w: w - 0.3, h: 0.38,
    fontSize: 10, bold: true, color: C.primary,
  })
  lines.forEach((line, i) => {
    slide.addText(`• ${line}`, {
      x: x + 0.2, y: y + 0.55 + i * 0.52, w: w - 0.35, h: 0.5,
      fontSize: 8.5, color: C.dark, wrap: true,
    })
  })
}

function _addDPEBar(slide, currentClass, x, y, w, h) {
  const classes = ['A','B','C','D','E','F','G']
  const rowH = h / 7.4
  classes.forEach((cls, i) => {
    const isActive = cls === currentClass
    const barW = w * (0.4 + i * 0.1)
    slide.addShape('rect', {
      x, y: y + i * rowH * 1.02, w: barW, h: rowH * 0.9,
      fill: { color: C.dpe[cls] },
      line: { color: C.white, pt: isActive ? 2 : 0 },
    })
    slide.addText(cls, {
      x, y: y + i * rowH * 1.02, w: barW, h: rowH * 0.9,
      fontSize: isActive ? 13 : 10, bold: isActive, color: C.white,
      align: 'right', valign: 'middle',
    })
    if (isActive) {
      // Arrow pointer
      slide.addText('◄ ACTUEL', {
        x: x + barW + 0.05, y: y + i * rowH * 1.02, w: 1.2, h: rowH * 0.9,
        fontSize: 7.5, bold: true, color: C.dpe[cls], valign: 'middle',
      })
    }
  })
}

function _addDPEArrow(slide, before, after, x, y, w) {
  const bColor = C.dpe[before] || C.mid
  const aColor = C.dpe[after]  || C.mid
  const bw = (w - 0.8) / 2
  slide.addShape('rect', { x, y, w: bw, h: 1.2, fill: { color: bColor }, rectRadius: 0.1 })
  slide.addText(before, { x, y, w: bw, h: 1.2, fontSize: 36, bold: true, color: C.white, align: 'center', valign: 'middle' })
  slide.addText('→', { x: x + bw, y, w: 0.8, h: 1.2, fontSize: 22, color: C.mid, align: 'center', valign: 'middle' })
  slide.addShape('rect', { x: x + bw + 0.8, y, w: bw, h: 1.2, fill: { color: aColor }, rectRadius: 0.1 })
  slide.addText(after, { x: x + bw + 0.8, y, w: bw, h: 1.2, fontSize: 36, bold: true, color: C.white, align: 'center', valign: 'middle' })
}

function _addBarChart(slide, values, maxV, labels, x, y, w, h, colorTop) {
  const n   = values.length
  const gap = 0.04
  const bw  = (w - gap * (n + 1)) / n

  values.forEach((v, i) => {
    const pct   = maxV > 0 ? v / maxV : 0
    const bh    = Math.max(0.02, pct * (h - 0.35))
    const bx    = x + gap + i * (bw + gap)
    const by    = y + (h - 0.35) - bh

    // Gradient simulation (two rects)
    slide.addShape('rect', { x: bx, y: by, w: bw, h: bh, fill: { color: colorTop }, line: { color: C.white, pt: 0.3 } })

    // Value label above bar
    if (v > 0) {
      slide.addText(_fmtNum(Math.round(v)), {
        x: bx, y: Math.max(y, by - 0.22), w: bw, h: 0.22,
        fontSize: 6.5, color: C.dark, align: 'center', bold: true,
      })
    }

    // Month label below
    slide.addText(labels[i], {
      x: bx, y: y + h - 0.32, w: bw, h: 0.3,
      fontSize: 7, color: C.mid, align: 'center',
    })
  })
}

function _addDualBarChart(slide, before, after, maxV, labels, x, y, w, h) {
  const n   = before.length
  const gap = 0.025
  const grpW = (w - gap * (n + 1)) / n
  const bw   = grpW / 2 - 0.01

  before.forEach((vb, i) => {
    const va  = after[i] || 0
    const pctB = maxV > 0 ? vb / maxV : 0
    const pctA = maxV > 0 ? va / maxV : 0
    const bhB  = Math.max(0.02, pctB * (h - 0.22))
    const bhA  = Math.max(0.02, pctA * (h - 0.22))
    const gx   = x + gap + i * (grpW + gap)

    slide.addShape('rect', { x: gx,       y: y + (h - 0.22) - bhB, w: bw, h: bhB, fill: { color: 'AABBD4' } })
    slide.addShape('rect', { x: gx + bw,  y: y + (h - 0.22) - bhA, w: bw, h: bhA, fill: { color: C.accent } })
    slide.addText(labels[i], { x: gx, y: y + h - 0.2, w: grpW, h: 0.2, fontSize: 6, color: C.mid, align: 'center' })
  })

  // Legend
  slide.addShape('rect', { x: x + w - 2.1, y: y + 0.05, w: 0.18, h: 0.14, fill: { color: 'AABBD4' } })
  slide.addText('Avant', { x: x + w - 1.88, y: y + 0.04, w: 0.8, h: 0.16, fontSize: 7, color: C.dark })
  slide.addShape('rect', { x: x + w - 1.1, y: y + 0.05, w: 0.18, h: 0.14, fill: { color: C.accent } })
  slide.addText('Après', { x: x + w - 0.88, y: y + 0.04, w: 0.8, h: 0.16, fontSize: 7, color: C.dark })
}

function _addHBarChart(slide, values, labels, maxV, x, y, w, h) {
  const n    = values.length
  const rowH = h / n
  const labelW = 2.5
  const barAreaW = w - labelW - 0.8

  values.forEach((v, i) => {
    const pct = maxV > 0 ? v / maxV : 0
    const bw  = Math.max(0.05, pct * barAreaW)
    const by  = y + i * rowH + rowH * 0.15
    const bh  = rowH * 0.68
    const color = _barColor(i)

    slide.addText(_truncate(labels[i], 22), {
      x, y: by, w: labelW - 0.1, h: bh,
      fontSize: 8.5, color: C.dark, valign: 'middle', align: 'right',
    })
    slide.addShape('rect', { x: x + labelW, y: by, w: bw, h: bh, fill: { color }, rectRadius: 0.06 })
    slide.addText(`${_fmtNum(v)} kWh/k€`, {
      x: x + labelW + bw + 0.08, y: by, w: barAreaW - bw + 0.7, h: bh,
      fontSize: 8, color: C.mid, valign: 'middle',
    })
  })
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _collectScenarios(reno, saved) {
  const out = []
  // Standard scenarios from renovation result
  if (reno?.scenarios?.length) {
    reno.scenarios.forEach(s => out.push({ ...s, _source: 'standard' }))
  }
  // Manually saved scenarios from compare panel
  saved.forEach(s => {
    if (!out.find(x => x.scenario_label === s.name)) {
      out.push({
        scenario_label: s.name,
        actions: s.actions,
        baseline_dpe:  s.result?.baseline_dpe,
        after_dpe:     s.result?.after_dpe,
        investment_center_eur:      s.result?.investment_center_eur,
        investment_max_eur:         s.result?.investment_max_eur,
        cost_savings_eur_per_year:  s.result?.cost_savings_eur_per_year,
        simple_payback_years:       s.result?.simple_payback_years,
        heating_need_reduction_pct: s.result?.heating_need_reduction_pct,
        primary_energy_after_kwh_m2: s.result?.after_full?.primary_energy_kwh_m2,
        baseline_full: s.result?.baseline_full,
        after_full:    s.result?.after_full,
        _source: 'saved',
      })
    }
  })
  return out
}

function _extractMonthly(s, key) {
  const full = key === 'baseline' ? (s.baseline_full || s.before) : (s.after_full || s.after)
  if (!full) return null
  const zones = full.zones || full.zone_results || []
  if (zones.length) {
    const arr = new Array(12).fill(0)
    zones.forEach(z => { z.heating_need_monthly?.forEach((v, i) => { arr[i] += v || 0 }) })
    if (arr.some(v => v > 0)) return arr
  }
  if (full.heating_need_monthly?.length === 12) return full.heating_need_monthly
  return null
}

const _BAR_COLORS = ['0158A5','008ECF','27AE60','F39C12','B30000','8B5CF6','06B6D4','E67E22']
function _barColor(i) { return _BAR_COLORS[i % _BAR_COLORS.length] }

function _labelComp(k) {
  const map = { walls: 'Murs', roof: 'Toiture', floor: 'Plancher', windows: 'Vitrage', thermal_bridges: 'Ponts th.', ventilation: 'Ventilation' }
  return map[k] || k
}

function _fmtNum(v) {
  const n = Number(v)
  if (isNaN(n)) return String(v ?? '—')
  return n.toLocaleString('fr-FR')
}
function _truncate(s, n) { return String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s) }
function _slug(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,40) }
function _dateStr() { return new Date().toISOString().slice(0,10) }
function _dateLabel() { return new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) }
