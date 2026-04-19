/**
 * PDF export — Detailed printable report.
 * Uses browser's native print dialog with a dedicated print stylesheet.
 * Color palette: Efficacity corporate identity.
 */

export function exportStudyPDF(projectName, analysisResult, renovationResult, savedScenarios = [], comboResults = []) {
  const html = _buildReportHTML(projectName, analysisResult, renovationResult, savedScenarios, comboResults)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (!win) { alert('Autorisez les popups pour exporter en PDF.'); URL.revokeObjectURL(url); return }
  win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 400) }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function _buildReportHTML(projectName, a, reno, savedScenarios, comboResults) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const allScenarios = _collectScenarios(reno, savedScenarios)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Étude OptiBuilding — ${_esc(projectName)}</title>
<style>
  /* ── Reset ── */
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10.5pt; color: #1A1A2E; background: #fff; }

  /* ── Cover page ── */
  .cover {
    min-height: 100vh; display: flex; flex-direction: column;
    background: linear-gradient(135deg, #0158A5 0%, #023a70 60%, #012855 100%);
    color: #fff; padding: 0; page-break-after: always;
  }
  .cover-header { padding: 32px 48px 0; display: flex; align-items: center; gap: 14px; }
  .cover-logo { width: 54px; height: 54px; background: #008ECF; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #fff; }
  .cover-brand { font-size: 16px; font-weight: 700; }
  .cover-brand-sub { font-size: 10px; color: #A8C8E8; }
  .cover-body { flex: 1; padding: 60px 48px; display: flex; flex-direction: column; justify-content: center; }
  .cover-tag { font-size: 10px; letter-spacing: 3px; color: #A8C8E8; text-transform: uppercase; margin-bottom: 16px; }
  .cover-title { font-size: 34px; font-weight: 900; line-height: 1.2; margin-bottom: 12px; }
  .cover-subtitle { font-size: 14px; color: #A8C8E8; margin-bottom: 48px; }
  .cover-kpi-row { display: flex; gap: 20px; flex-wrap: wrap; }
  .cover-kpi { background: rgba(255,255,255,0.1); border-radius: 10px; padding: 16px 20px; min-width: 140px; }
  .cover-kpi-label { font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; color: #A8C8E8; margin-bottom: 4px; }
  .cover-kpi-value { font-size: 22px; font-weight: 900; }
  .cover-kpi-unit { font-size: 8px; color: #A8C8E8; }
  .cover-dpe { width: 48px; height: 48px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #fff; }
  .cover-footer { padding: 20px 48px; border-top: 1px solid rgba(255,255,255,0.15); display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #7AABCF; }
  .accent-bar { height: 4px; background: #008ECF; }

  /* ── Section pages ── */
  .section { padding: 28px 36px; page-break-inside: avoid; }
  .section + .section { border-top: 2px solid #F1F5F9; }
  .page-break { page-break-before: always; }

  /* ── Section header ── */
  .section-head { background: #0158A5; color: #fff; margin: -28px -36px 24px; padding: 16px 36px; }
  .section-head h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .section-head p { font-size: 9px; color: #A8C8E8; margin-top: 3px; }
  .section-accent { height: 3px; background: #008ECF; margin: -24px -36px 24px; }

  /* ── Sub-headings ── */
  h3 { font-size: 10px; font-weight: 700; color: #0158A5; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; border-bottom: 1.5px solid #008ECF; padding-bottom: 3px; }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .kpi-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .kpi-grid-5 { grid-template-columns: repeat(5, 1fr); }
  .kpi { background: #F1F5F9; border-radius: 8px; padding: 12px 14px; border-left: 3px solid #008ECF; }
  .kpi-label { font-size: 7.5px; color: #4A5568; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
  .kpi-value { font-size: 18px; font-weight: 800; color: #1A1A2E; line-height: 1.1; }
  .kpi-unit { font-size: 7px; color: #7A8499; }
  .kpi--primary { border-left-color: #0158A5; }
  .kpi--green   { border-left-color: #27AE60; }
  .kpi--red     { border-left-color: #B30000; }

  /* ── DPE badge ── */
  .dpe-badge { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; border-radius: 6px; }
  .dpe-badge--lg { width: 52px; height: 52px; font-size: 22px; }
  .dpe-badge--sm { width: 26px; height: 26px; font-size: 11px; }

  /* ── DPE bar ── */
  .dpe-bar { margin: 8px 0 16px; }
  .dpe-bar-row { display: flex; align-items: center; margin-bottom: 2px; }
  .dpe-bar-seg { height: 22px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; border-radius: 0 4px 4px 0; min-width: 30px; }
  .dpe-bar-seg-label { color: #fff; font-weight: 700; font-size: 11px; }
  .dpe-bar-active-label { margin-left: 8px; font-size: 9px; font-weight: 700; color: #0158A5; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 10px 0; }
  th { background: #0158A5; color: #fff; padding: 7px 10px; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 6px 10px; border-bottom: 1px solid #E8EDF5; }
  tr:nth-child(even) td { background: #F8FAFE; }
  tr:last-child td { border-bottom: none; }

  /* ── Bar chart (SVG-based) ── */
  .bar-chart-wrap { margin: 8px 0; }

  /* ── Scenario card ── */
  .scenario-card { border: 1px solid #CBD5E1; border-radius: 10px; padding: 18px 22px; margin: 14px 0; page-break-inside: avoid; }
  .scenario-card-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .scenario-title { font-size: 13px; font-weight: 700; color: #0158A5; }
  .scenario-desc { font-size: 8.5px; color: #7A8499; }
  .dpe-arrow { display: flex; align-items: center; gap: 8px; }
  .dpe-arrow span { font-size: 16px; color: #CBD5E1; }
  .action-pill { display: inline-block; background: #EBF5FF; color: #0158A5; border-radius: 4px; padding: 2px 8px; font-size: 7.5px; font-weight: 600; margin: 2px 3px 2px 0; }

  /* ── Comparison table ── */
  .compare-table th:first-child, .compare-table td:first-child { text-align: left; }
  .compare-table { font-size: 8pt; }
  .badge-good { color: #27AE60; font-weight: 700; }
  .badge-warn { color: #F39C12; font-weight: 700; }
  .badge-bad  { color: #B30000; font-weight: 700; }

  /* ── Bar chart SVG ── */
  .chart-label { font-size: 6.5px; fill: #4A5568; text-anchor: middle; }
  .chart-value { font-size: 6px; fill: #1A1A2E; text-anchor: middle; font-weight: 700; }
  .chart-axis  { stroke: #CBD5E1; stroke-width: 0.5; }

  /* ── Info blocks ── */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 12px 0; }
  .info-block { background: #F8FAFE; border-radius: 8px; padding: 12px 14px; border-top: 3px solid #008ECF; }
  .info-block-title { font-size: 9px; font-weight: 700; color: #0158A5; margin-bottom: 6px; }
  .info-block li { font-size: 8px; color: #4A5568; margin-bottom: 3px; list-style: none; padding-left: 10px; }
  .info-block li::before { content: '→'; margin-right: 5px; color: #008ECF; margin-left: -10px; }

  /* ── Combo table ── */
  .combo-table th { background: #00A896; }
  .combo-rank { font-size: 14px; text-align: center; width: 28px; }
  .combo-pills { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 3px; }
  .combo-pill { background: #EBF9F7; color: #007A6E; border-radius: 3px; padding: 2px 6px; font-size: 7px; font-weight: 600; }
  .combo-dpe-arrow { font-size: 7.5px; color: #7A8499; }
  .combo-dpe-badge { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; font-size: 9px; font-weight: 800; }
  .combo-gain-pos { color: #27AE60; font-weight: 700; }
  .combo-gain-neg { color: #B30000; font-weight: 700; }
  .combo-eff { color: #0158A5; font-weight: 700; }
  .combo-info-row { background: #F0F9F8; border-left: 3px solid #00A896; padding: 8px 12px; margin: 12px 0; border-radius: 4px; font-size: 8.5px; color: #005A52; }

  /* ── Footer ── */
  .report-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #E8EDF5; display: flex; justify-content: space-between; font-size: 7.5px; color: #A0AEC0; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

${_coverPage(projectName, a, today)}

<div class="page-break"></div>

${_physicsSection()}

<div class="page-break"></div>

${_baselineSection(a)}

<div class="page-break"></div>

${_monthlySection(a)}

${allScenarios.length ? `<div class="page-break"></div>${_scenariosSection(allScenarios)}` : ''}

${allScenarios.length > 1 ? `<div class="page-break"></div>${_comparisonSection(allScenarios)}` : ''}

${comboResults?.length ? `<div class="page-break"></div>${_comboSection(comboResults)}` : ''}

</body>
</html>`
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function _coverPage(projectName, a, today) {
  const dpe  = a?.dpe_class || '?'
  const ep   = a?.primary_energy_kwh_m2?.toFixed(0) ?? '—'
  const co2  = a?.co2_kg_m2?.toFixed(1) ?? '—'
  const surf = a?.total_floor_area_m2?.toFixed(0) ?? '—'
  const heat = _fmtNum(a?.heating_need_kwh?.toFixed(0))
  const cool = _fmtNum(a?.cooling_need_kwh?.toFixed(0))

  return `<div class="cover">
  <div class="accent-bar"></div>
  <div class="cover-header">
    <div class="cover-logo">OB</div>
    <div>
      <div class="cover-brand">OptiBuilding</div>
      <div class="cover-brand-sub">by Efficacity</div>
    </div>
  </div>
  <div class="cover-body">
    <div class="cover-tag">Étude énergétique du bâtiment</div>
    <div class="cover-title">${_esc(projectName)}</div>
    <div class="cover-subtitle">Rapport de simulation thermique — ${today}</div>
    <div class="cover-kpi-row">
      <div class="cover-kpi">
        <div class="cover-kpi-label">Classe DPE</div>
        <div class="cover-dpe" style="background:${_dpeColor(dpe)};font-size:22px;font-weight:900;width:48px;height:48px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">${dpe}</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Énergie primaire</div>
        <div class="cover-kpi-value">${ep}</div>
        <div class="cover-kpi-unit">kWh EP/m²/an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Émissions CO₂</div>
        <div class="cover-kpi-value">${co2}</div>
        <div class="cover-kpi-unit">kg/m²/an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Surface</div>
        <div class="cover-kpi-value">${surf}</div>
        <div class="cover-kpi-unit">m²</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Chauffage</div>
        <div class="cover-kpi-value" style="font-size:16px">${heat}</div>
        <div class="cover-kpi-unit">kWh/an</div>
      </div>
      ${(a?.cooling_need_kwh ?? 0) > 0 ? `<div class="cover-kpi">
        <div class="cover-kpi-label">Refroidissement</div>
        <div class="cover-kpi-value" style="font-size:16px">${cool}</div>
        <div class="cover-kpi-unit">kWh/an</div>
      </div>` : ''}
    </div>
  </div>
  <div class="cover-footer">
    <span>OptiBuilding — Simulation physique ISO 13790</span>
    <span>Rapport généré le ${today}</span>
    <span>Efficacity © ${new Date().getFullYear()}</span>
  </div>
</div>`
}

function _physicsSection() {
  return `<div class="section">
  <div class="section-head">
    <h2>Modèle thermique</h2>
    <p>Méthodologie et hypothèses physiques de la simulation</p>
  </div>
  <div class="info-grid">
    <div class="info-block">
      <div class="info-block-title">📐 Méthode de calcul</div>
      <ul>
        <li>Norme EN ISO 13790 — bilan mensuel stationnaire</li>
        <li>Simulation horaire RC nodal disponible</li>
        <li>Bilan thermique zone par zone</li>
        <li>Prise en compte des masques solaires</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">🌡️ Données météo</div>
      <ul>
        <li>Fichiers EPW (EnergyPlus Weather Format)</li>
        <li>Températures horaires sur 8 760 h</li>
        <li>Rayonnement solaire direct et diffus</li>
        <li>Station sélectionnée par proximité géographique</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">🏗️ Modélisation géométrique</div>
      <ul>
        <li>Zones dessinées en GeoJSON (Leaflet Draw)</li>
        <li>Hauteur, usage et ère de construction par zone</li>
        <li>Surfaces de parois calculées automatiquement</li>
        <li>Orientation et masques pris en compte</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">🔥 Systèmes énergétiques</div>
      <ul>
        <li>Chauffage : PAC, chaudière gaz, réseau de chaleur</li>
        <li>Refroidissement : split AC, multisplit, PAC réversible</li>
        <li>VMC double flux avec récupération de chaleur</li>
        <li>Facteurs de conversion énergie primaire EN 15603</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">📊 Indicateurs calculés</div>
      <ul>
        <li>DPE classe A→G (énergie primaire + CO₂)</li>
        <li>Besoins mensuels chauffage & refroidissement</li>
        <li>Énergie finale, primaire, coût annuel, CO₂</li>
        <li>Déperditions par composant (murs, toiture, vitrages…)</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">⚙️ Calibration</div>
      <ul>
        <li>Ajustement sur consommation réelle mesurée</li>
        <li>Correction des conductivités U et infiltrations</li>
        <li>Validation graphique par comparaison mensuelle</li>
        <li>Facteur de calibration global ou par zone</li>
      </ul>
    </div>
  </div>
</div>`
}

function _baselineSection(a) {
  if (!a) return ''
  const dpe   = a.dpe_class || '?'
  const co2c  = a.dpe_co2_class || '?'
  const ep    = a.primary_energy_kwh_m2?.toFixed(1) ?? '—'
  const co2   = a.co2_kg_m2?.toFixed(2) ?? '—'
  const heat  = _fmtNum(a.heating_need_kwh?.toFixed(0))
  const cool  = _fmtNum(a.cooling_need_kwh?.toFixed(0))
  const cost  = _fmtNum(a.cost_eur?.toFixed(0))
  const surf  = a.total_floor_area_m2?.toFixed(0) ?? '—'
  const final = _fmtNum(a.final_energy_kwh?.toFixed(0))
  const prim  = _fmtNum(a.primary_energy_kwh?.toFixed(0))

  const zones = a.zones || []

  return `<div class="section">
  <div class="section-head">
    <h2>Performance énergétique — Baseline</h2>
    <p>Résultats de la simulation thermique initiale du bâtiment</p>
  </div>

  <div style="display:flex;gap:24px;align-items:flex-start">
    <div style="min-width:160px">
      <h3>Classe DPE</h3>
      ${_dpeBarHTML(dpe)}
    </div>
    <div style="flex:1">
      <h3>Indicateurs globaux</h3>
      <div class="kpi-grid">
        <div class="kpi kpi--primary">
          <div class="kpi-label">Énergie primaire</div>
          <div class="kpi-value">${ep}</div>
          <div class="kpi-unit">kWh EP/m²/an</div>
        </div>
        <div class="kpi" style="border-left-color:${_dpeColor(co2c)}">
          <div class="kpi-label">Classe CO₂</div>
          <div class="kpi-value" style="color:${_dpeColor(co2c)}">${co2c}</div>
          <div class="kpi-unit">${co2} kg/m²/an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Besoin chauffage</div>
          <div class="kpi-value" style="font-size:14px">${heat}</div>
          <div class="kpi-unit">kWh/an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Besoin froid</div>
          <div class="kpi-value" style="font-size:14px">${cool}</div>
          <div class="kpi-unit">kWh/an</div>
        </div>
        <div class="kpi kpi--red">
          <div class="kpi-label">Coût annuel</div>
          <div class="kpi-value" style="font-size:14px">${cost}</div>
          <div class="kpi-unit">€/an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Surface totale</div>
          <div class="kpi-value" style="font-size:14px">${surf}</div>
          <div class="kpi-unit">m²</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Énergie finale</div>
          <div class="kpi-value" style="font-size:14px">${final}</div>
          <div class="kpi-unit">kWh/an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Énergie primaire tot.</div>
          <div class="kpi-value" style="font-size:14px">${prim}</div>
          <div class="kpi-unit">kWh/an</div>
        </div>
      </div>
    </div>
  </div>

  ${zones.length ? `
  <h3>Détail par zone thermique</h3>
  <table>
    <thead>
      <tr>
        <th>Zone</th><th>Surface (m²)</th><th>Chauffage (kWh)</th><th>Refroid. (kWh)</th>
        <th>Ht (W/m²K)</th><th>Hv (W/m²K)</th><th>Gains sol. (kWh)</th><th>Pertes (kWh)</th>
      </tr>
    </thead>
    <tbody>
      ${zones.map(z => `<tr>
        <td><strong>${_esc(z.zone_label || z.zone_id || '—')}</strong></td>
        <td>${_fmtNum(z.floor_area_m2?.toFixed(0))}</td>
        <td>${_fmtNum(z.heating_need_kwh?.toFixed(0))}</td>
        <td>${_fmtNum(z.cooling_need_kwh?.toFixed(0))}</td>
        <td>${z.h_t_w_k?.toFixed(2) ?? '—'}</td>
        <td>${z.h_v_w_k?.toFixed(2) ?? '—'}</td>
        <td>${_fmtNum(z.solar_gains_kwh?.toFixed(0))}</td>
        <td>${_fmtNum(z.total_losses_kwh?.toFixed(0))}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${_envelopeBreakdownHTML(zones[0]?.envelope_breakdown)}
  ` : ''}
</div>`
}

function _monthlySection(a) {
  if (!a) return ''
  const zones   = a.zones || []
  const heating = new Array(12).fill(0)
  const cooling = new Array(12).fill(0)
  zones.forEach(z => {
    z.heating_need_monthly?.forEach((v, i) => { heating[i] += v || 0 })
    z.cooling_need_monthly?.forEach((v, i) => { cooling[i] += v || 0 })
  })
  const hasCooling = cooling.some(v => v > 0)

  return `<div class="section">
  <div class="section-head">
    <h2>Consommation mensuelle</h2>
    <p>Besoins thermiques mois par mois — chauffage et refroidissement</p>
  </div>
  <h3>Besoins de chauffage (kWh/mois)</h3>
  ${_svgBarChart(heating, 'MONTHS', '#B30000', 660, 140)}
  ${_monthlyTable(heating, 'Chauffage (kWh)')}
  ${hasCooling ? `
  <h3 style="margin-top:20px">Besoins de refroidissement (kWh/mois)</h3>
  ${_svgBarChart(cooling, 'MONTHS', '#0158A5', 660, 120)}
  ${_monthlyTable(cooling, 'Refroidissement (kWh)')}
  ` : ''}
</div>`
}

function _scenariosSection(scenarios) {
  return `<div class="section">
  <div class="section-head">
    <h2>Scénarios de rénovation</h2>
    <p>${scenarios.length} scénario${scenarios.length > 1 ? 's' : ''} étudié${scenarios.length > 1 ? 's' : ''}</p>
  </div>
  ${scenarios.map((s, i) => _scenarioCard(s, i)).join('')}
</div>`
}

function _scenarioCard(s, idx) {
  const bDpe  = s.baseline_dpe || s.dpe_before || '?'
  const aDpe  = s.after_dpe    || s.dpe_after  || '?'
  const invest = s.investment_center_eur ?? s.investment_max_eur ?? 0
  const savings = s.cost_savings_eur_per_year ?? 0
  const roi   = s.simple_payback_years
  const reduc = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
  const ep    = s.primary_energy_after_kwh_m2 ?? s.after_full?.primary_energy_kwh_m2
  const actions = s.actions || []

  const beforeMonthly = _extractMonthly(s, 'baseline')
  const afterMonthly  = _extractMonthly(s, 'after')

  return `<div class="scenario-card">
  <div class="scenario-card-head">
    <div style="flex:1">
      <div class="scenario-title">${_esc(s.scenario_label || s.name || `Scénario ${idx + 1}`)}</div>
      <div class="scenario-desc">${_esc(s.scenario_description || s.description || '')}</div>
    </div>
    <div class="dpe-arrow" style="font-size:11px;color:#7A8499;margin-right:8px">DPE</div>
    <div class="dpe-arrow">
      <div class="dpe-badge dpe-badge--lg" style="background:${_dpeColor(bDpe)}">${bDpe}</div>
      <span style="font-size:20px;color:#CBD5E1;margin:0 6px">→</span>
      <div class="dpe-badge dpe-badge--lg" style="background:${_dpeColor(aDpe)}">${aDpe}</div>
    </div>
  </div>

  <div class="kpi-grid kpi-grid-5" style="margin-bottom:12px">
    <div class="kpi kpi--green">
      <div class="kpi-label">Réduction chauffage</div>
      <div class="kpi-value" style="font-size:16px">−${Math.round(reduc)} %</div>
    </div>
    <div class="kpi kpi--green">
      <div class="kpi-label">Économie annuelle</div>
      <div class="kpi-value" style="font-size:14px">${_fmtNum(Math.round(savings))}</div>
      <div class="kpi-unit">€/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Investissement</div>
      <div class="kpi-value" style="font-size:14px">${_fmtNum(Math.round(invest))}</div>
      <div class="kpi-unit">€</div>
    </div>
    <div class="kpi ${roi != null && roi < 15 ? 'kpi--green' : roi < 30 ? '' : 'kpi--red'}">
      <div class="kpi-label">Retour sur invest.</div>
      <div class="kpi-value" style="font-size:16px">${roi != null && roi < 99 ? Math.round(roi) : '>99'}</div>
      <div class="kpi-unit">ans</div>
    </div>
    <div class="kpi kpi--primary">
      <div class="kpi-label">EP après</div>
      <div class="kpi-value" style="font-size:14px">${ep?.toFixed(0) ?? '—'}</div>
      <div class="kpi-unit">kWh EP/m²/an</div>
    </div>
  </div>

  ${actions.length ? `<div style="margin:8px 0 10px">
    <span style="font-size:8px;font-weight:700;color:#4A5568;text-transform:uppercase;letter-spacing:1px">Actions incluses</span><br/>
    ${actions.map(ac => `<span class="action-pill">${_esc(ac.label || ac.action_id || '—')}</span>`).join('')}
  </div>` : ''}

  ${beforeMonthly && afterMonthly ? `
  <div style="font-size:8px;font-weight:700;color:#0158A5;text-transform:uppercase;letter-spacing:1px;margin-top:10px;margin-bottom:4px">CHAUFFAGE — AVANT vs APRÈS (kWh/mois)</div>
  ${_svgDualBarChart(beforeMonthly, afterMonthly, 660, 90)}
  ` : ''}
</div>`
}

function _comparisonSection(scenarios) {
  return `<div class="section">
  <div class="section-head">
    <h2>Comparaison des scénarios</h2>
    <p>Vue synthétique de toutes les options étudiées</p>
  </div>
  <table class="compare-table">
    <thead>
      <tr>
        <th>Scénario</th>
        <th>DPE avant</th>
        <th>DPE après</th>
        <th>Réduc. chauf.</th>
        <th>Économie /an</th>
        <th>Investissement</th>
        <th>Retour (ans)</th>
        <th>kWh/k€ invest.</th>
      </tr>
    </thead>
    <tbody>
      ${scenarios.map(s => {
        const bDpe  = s.baseline_dpe || s.dpe_before || '?'
        const aDpe  = s.after_dpe    || s.dpe_after  || '?'
        const invest = s.investment_center_eur ?? s.investment_max_eur ?? 0
        const savings = s.cost_savings_eur_per_year ?? 0
        const roi   = s.simple_payback_years
        const reduc = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
        const heatBef = s.baseline_full?.heating_need_kwh ?? 0
        const heatAft = s.after_full?.heating_need_kwh ?? 0
        const effic = invest > 0 ? Math.round(((heatBef - heatAft) / invest) * 1000) : 0
        return `<tr>
          <td><strong>${_esc(s.scenario_label || s.name || '—')}</strong></td>
          <td><span class="dpe-badge dpe-badge--sm" style="background:${_dpeColor(bDpe)}">${bDpe}</span></td>
          <td><span class="dpe-badge dpe-badge--sm" style="background:${_dpeColor(aDpe)}">${aDpe}</span></td>
          <td class="${reduc > 40 ? 'badge-good' : reduc > 20 ? 'badge-warn' : ''}">−${Math.round(reduc)} %</td>
          <td>${_fmtNum(Math.round(savings))} €</td>
          <td>${_fmtNum(Math.round(invest))} €</td>
          <td class="${roi < 15 ? 'badge-good' : roi < 30 ? 'badge-warn' : 'badge-bad'}">${roi != null && roi < 99 ? Math.round(roi) : '>99'}</td>
          <td>${effic > 0 ? _fmtNum(effic) : '—'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>
  <div class="report-footer">
    <span>OptiBuilding — Outil de simulation énergétique — Efficacity</span>
    <span>Rapport généré le ${new Date().toLocaleDateString('fr-FR')}</span>
  </div>
</div>`
}

// ── SVG charts ─────────────────────────────────────────────────────────────────

const _MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function _svgBarChart(values, _label, color, width, height) {
  const maxV = Math.max(...values, 1)
  const n    = values.length
  const padL = 8, padR = 8, padT = 20, padB = 24
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const bw    = plotW / n * 0.7
  const gap   = plotW / n

  let bars = ''
  values.forEach((v, i) => {
    const bh  = (v / maxV) * plotH
    const bx  = padL + i * gap + (gap - bw) / 2
    const by  = padT + plotH - bh
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" fill="${color}" rx="2"/>`
    if (v > 0) bars += `<text x="${(bx + bw/2).toFixed(1)}" y="${(by - 3).toFixed(1)}" class="chart-value">${Math.round(v).toLocaleString('fr-FR')}</text>`
    bars += `<text x="${(bx + bw/2).toFixed(1)}" y="${(padT + plotH + 14).toFixed(1)}" class="chart-label">${_MONTHS[i]}</text>`
  })

  return `<div class="bar-chart-wrap">
    <svg width="${width}" height="${height}" style="max-width:100%">
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="chart-axis"/>
      ${bars}
    </svg>
  </div>`
}

function _svgDualBarChart(before, after, width, height) {
  const maxV = Math.max(...before, ...after, 1)
  const n    = before.length
  const padL = 8, padR = 8, padT = 14, padB = 20
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const grpW  = plotW / n
  const bw    = grpW * 0.38

  let bars = ''
  before.forEach((vb, i) => {
    const va   = after[i] || 0
    const bhB  = (vb / maxV) * plotH
    const bhA  = (va / maxV) * plotH
    const gx   = padL + i * grpW
    bars += `<rect x="${(gx + grpW*0.06).toFixed(1)}" y="${(padT + plotH - bhB).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bhB).toFixed(1)}" fill="#AABBD4" rx="1"/>`
    bars += `<rect x="${(gx + grpW*0.06 + bw + 1).toFixed(1)}" y="${(padT + plotH - bhA).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bhA).toFixed(1)}" fill="#008ECF" rx="1"/>`
    bars += `<text x="${(gx + grpW/2).toFixed(1)}" y="${(padT + plotH + 12).toFixed(1)}" class="chart-label">${_MONTHS[i]}</text>`
  })

  return `<div class="bar-chart-wrap">
    <svg width="${width}" height="${height}" style="max-width:100%">
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="chart-axis"/>
      ${bars}
      <rect x="${width-90}" y="3" width="10" height="8" fill="#AABBD4"/>
      <text x="${width-76}" y="11" style="font-size:7px;fill:#4A5568">Avant</text>
      <rect x="${width-44}" y="3" width="10" height="8" fill="#008ECF"/>
      <text x="${width-30}" y="11" style="font-size:7px;fill:#4A5568">Après</text>
    </svg>
  </div>`
}

function _monthlyTable(values, rowLabel) {
  const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  return `<table style="font-size:8pt;margin-top:6px">
    <thead><tr><th style="text-align:left">${rowLabel}</th>${MONTHS_SHORT.map(m => `<th>${m}</th>`).join('')}</tr></thead>
    <tbody><tr>
      <td style="font-weight:600;text-align:left">kWh</td>
      ${values.map(v => `<td>${v > 0 ? Math.round(v).toLocaleString('fr-FR') : '—'}</td>`).join('')}
    </tr></tbody>
  </table>`
}

function _comboSection(results) {
  if (!results?.length) return ''
  const top5   = results.slice(0, 5)
  const total  = results.length
  const best   = results[0]
  const medals = ['🥇','🥈','🥉']

  const rows = results.map((s, i) => {
    const dpeAfter  = s.result?.after_dpe  ?? s.result?.after?.dpe_class  ?? '?'
    const dpeBefore = s.result?.baseline_dpe ?? s.result?.baseline?.dpe_class ?? '?'
    const dpeColor  = { A:'#00b050',B:'#92d050',C:'#c8e84d',D:'#ffbf00',E:'#ff9f00',F:'#ff6200',G:'#e02020' }[dpeAfter] ?? '#888'
    const dpeText   = ['A','B','C'].includes(dpeAfter) ? '#333' : '#fff'
    const deltaStr  = s.deltaKwh >= 0 ? `−${Math.round(s.deltaKwh).toLocaleString('fr-FR')} kWh` : `+${Math.abs(Math.round(s.deltaKwh)).toLocaleString('fr-FR')} kWh`
    const pills = s.combo.map(item => {
      const keyParams = item.action.params
        .filter(p => ['range','select'].includes(p.type))
        .map(p => {
          const v = item.params[p.key]
          if (p.type === 'select') return p.options?.find(o => o.value === v)?.label ?? v
          return p.display ? p.display(v) : v
        }).join(', ')
      return `<span class="combo-pill">${item.action.icon} ${item.action.label}${keyParams ? ` — ${keyParams}` : ''}</span>`
    }).join('')

    return `<tr>
      <td class="combo-rank">${medals[i] ?? (i + 1) + '.'}</td>
      <td>
        <div class="combo-pills">${pills}</div>
        <div class="combo-dpe-arrow">${dpeBefore} → ${dpeAfter}</div>
      </td>
      <td style="text-align:right"><span class="${s.deltaKwh >= 0 ? 'combo-gain-pos' : 'combo-gain-neg'}">${deltaStr}</span></td>
      <td style="text-align:right">${s.investKeur > 0 ? s.investKeur.toFixed(0) + ' k€' : '—'}</td>
      <td style="text-align:right" class="combo-eff">${s.efficiency > 0 ? Math.round(s.efficiency).toLocaleString('fr-FR') : '—'} kWh/k€</td>
      <td style="text-align:center"><span class="combo-dpe-badge" style="background:${dpeColor};color:${dpeText}">${dpeAfter}</span></td>
    </tr>`
  }).join('')

  return `
  <div class="section">
    <div class="section-head" style="background:#00A896">
      <h2>🔬 Analyse combinatoire</h2>
      <p>${total} combinaisons d'actions simulées — classées par kWh économisé / k€ investi</p>
    </div>

    <div class="combo-info-row">
      <strong>${total} scénarios</strong> générés et simulés automatiquement à partir du pool d'actions sélectionné.
      Meilleur résultat : <strong>${best.name}</strong>
      — gain de <strong>${Math.round(best.deltaKwh).toLocaleString('fr-FR')} kWh/an</strong>
      pour <strong>${best.investKeur > 0 ? best.investKeur.toFixed(0) + ' k€' : 'coût non défini'}</strong>
      (efficacité : <strong>${best.efficiency > 0 ? Math.round(best.efficiency).toLocaleString('fr-FR') : '—'} kWh/k€</strong>).
    </div>

    <table class="combo-table">
      <thead>
        <tr>
          <th style="width:28px"></th>
          <th>Actions incluses dans le scénario</th>
          <th style="text-align:right">Gain chauffage</th>
          <th style="text-align:right">Investissement</th>
          <th style="text-align:right">Efficacité</th>
          <th style="text-align:center">DPE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${total > 5 ? `<p style="font-size:8px;color:#7A8499;margin-top:6px;font-style:italic">Affichage des ${total} scénarios simulés. Les 3 premiers sont mis en évidence.</p>` : ''}

    <div class="report-footer">
      <span>OptiBuilding — Analyse combinatoire</span>
      <span>Efficacité = kWh de chauffage économisés / k€ investis (coût médian)</span>
    </div>
  </div>`
}

function _dpeBarHTML(current) {
  const classes = ['A','B','C','D','E','F','G']
  const widths  = [55, 65, 75, 85, 95, 105, 115]
  return `<div class="dpe-bar">${classes.map((cls, i) => `
    <div class="dpe-bar-row">
      <div class="dpe-bar-seg" style="width:${widths[i]}px;background:${_dpeColor(cls)};border:${cls===current?'2px solid #1A1A2E':'none'}">
        <span class="dpe-bar-seg-label" style="font-size:${cls===current?13:10}px">${cls}</span>
      </div>
      ${cls === current ? `<span class="dpe-bar-active-label">◄ ACTUEL</span>` : ''}
    </div>`).join('')}
  </div>`
}

function _envelopeBreakdownHTML(eb) {
  if (!eb || !Object.keys(eb).length) return ''
  const items = Object.entries(eb).sort((a, b) => b[1] - a[1])
  const total = items.reduce((s, [, v]) => s + v, 0)
  const COLORS = ['#0158A5','#008ECF','#27AE60','#F39C12','#B30000','#8B5CF6']
  return `<h3>Déperditions par composant</h3>
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0">
    ${items.map(([k, v], i) => {
      const pct = total > 0 ? (v / total * 100).toFixed(0) : 0
      return `<div style="display:flex;align-items:center;gap:5px">
        <div style="width:12px;height:12px;background:${COLORS[i%COLORS.length]};border-radius:2px"></div>
        <span style="font-size:8px;color:#4A5568">${_labelComp(k)} <strong>${pct}%</strong></span>
      </div>`
    }).join('')}
  </div>
  <div style="display:flex;height:18px;border-radius:4px;overflow:hidden;margin-bottom:8px">
    ${items.map(([, v], i) => {
      const pct = total > 0 ? v / total * 100 : 0
      return `<div style="width:${pct}%;background:${COLORS[i%COLORS.length]};display:flex;align-items:center;justify-content:center">
        ${pct > 8 ? `<span style="font-size:7px;color:#fff;font-weight:700">${Math.round(pct)}%</span>` : ''}
      </div>`
    }).join('')}
  </div>`
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _collectScenarios(reno, saved) {
  const out = []
  if (reno?.scenarios?.length) reno.scenarios.forEach(s => out.push({ ...s, _source: 'standard' }))
  saved.forEach(s => {
    if (!out.find(x => x.scenario_label === s.name)) {
      out.push({
        scenario_label: s.name,
        scenario_description: '',
        actions: s.actions,
        baseline_dpe:  s.result?.baseline_dpe,
        after_dpe:     s.result?.after_dpe,
        investment_center_eur:       s.result?.investment_center_eur,
        investment_max_eur:          s.result?.investment_max_eur,
        cost_savings_eur_per_year:   s.result?.cost_savings_eur_per_year,
        simple_payback_years:        s.result?.simple_payback_years,
        heating_need_reduction_pct:  s.result?.heating_need_reduction_pct,
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
  return full.heating_need_monthly?.length === 12 ? full.heating_need_monthly : null
}

const _DPE_COLORS = { A:'#27AE60',B:'#6EBE44',C:'#B5D334',D:'#F1C40F',E:'#F39C12',F:'#E67E22',G:'#E74C3C' }
function _dpeColor(cls) { return _DPE_COLORS[cls] || '#888' }
function _labelComp(k) {
  return { walls:'Murs', roof:'Toiture', floor:'Plancher', windows:'Vitrage', thermal_bridges:'Ponts th.', ventilation:'Ventilation' }[k] || k
}
function _fmtNum(v) { const n = Number(v); return isNaN(n) ? String(v ?? '—') : n.toLocaleString('fr-FR') }
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
