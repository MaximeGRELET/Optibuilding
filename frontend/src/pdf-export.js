/**
 * PDF export — Rapport de simulation thermique Jean Rénov.
 * Deux modes : bâtiment actif ou patrimoine complet (tous les bâtiments).
 */

// ── Public API ────────────────────────────────────────────────────────────────

export function exportStudyPDF(projectName, analysisResult, renovationResult, savedScenarios = [], comboResults = []) {
  const html = _buildBuildingReport(projectName, analysisResult, renovationResult, savedScenarios, comboResults)
  _openPrintWindow(html)
}

export function exportPatrimoinePDF(projectName, buildings = []) {
  const html = _buildPatrimoineReport(projectName, buildings)
  _openPrintWindow(html)
}

function _openPrintWindow(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (!win) { alert('Autorisez les popups pour exporter en PDF.'); URL.revokeObjectURL(url); return }
  win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 400) }
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

function _css() {
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10pt; color: #1A1A2E; background: #fff; }

  /* ── Cover ── */
  .cover {
    min-height: 100vh; display: flex; flex-direction: column;
    background: linear-gradient(160deg, #0d2340 0%, #0158A5 55%, #0076C0 100%);
    color: #fff; page-break-after: always;
  }
  .cover-top-bar { height: 5px; background: linear-gradient(90deg, #00C2A8, #008ECF, #0158A5); }
  .cover-header { padding: 28px 52px 0; display: flex; align-items: center; gap: 16px; }
  .cover-logo-wrap { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; }
  .cover-logo-wrap img { width: 44px; height: 44px; object-fit: cover; }
  .cover-brand-name { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
  .cover-brand-tagline { font-size: 9px; color: rgba(255,255,255,0.5); margin-top: 1px; letter-spacing: 0.5px; }
  .cover-header-right { margin-left: auto; text-align: right; }
  .cover-header-right .cover-report-type { font-size: 8px; letter-spacing: 3px; color: rgba(255,255,255,0.4); text-transform: uppercase; }
  .cover-header-right .cover-date { font-size: 9px; color: rgba(255,255,255,0.55); margin-top: 3px; }
  .cover-body { flex: 1; padding: 40px 52px 36px; display: flex; flex-direction: column; justify-content: flex-end; }
  /* Hero: DPE badge left + project title right */
  .cover-hero { display: flex; gap: 36px; align-items: flex-end; margin-bottom: 36px; }
  .cover-hero-dpe { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
  .cover-hero-dpe-label { font-size: 7px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.45); }
  .cover-hero-dpe-badge { width: 100px; height: 100px; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 900; color: #fff; box-shadow: 0 6px 28px rgba(0,0,0,0.35); }
  .cover-hero-dpe-ep { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.7); text-align: center; }
  .cover-hero-dpe-ep span { font-size: 8px; font-weight: 400; color: rgba(255,255,255,0.4); }
  .cover-hero-text { flex: 1; }
  .cover-report-type { font-size: 9px; letter-spacing: 3px; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-bottom: 10px; }
  .cover-title { font-size: 32px; font-weight: 900; line-height: 1.15; margin-bottom: 8px; }
  .cover-subtitle { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 0; }
  .cover-hero-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; }
  .cover-hero-meta span { font-size: 9px; color: rgba(255,255,255,0.5); }
  .cover-hero-meta span.sep { color: rgba(255,255,255,0.2); }
  /* KPI strip */
  .cover-kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .cover-kpi {
    background: rgba(255,255,255,0.08); backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.13);
    border-radius: 10px; padding: 14px 18px; min-width: 110px; flex: 1;
  }
  .cover-kpi-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.45); margin-bottom: 6px; }
  .cover-kpi-value { font-size: 22px; font-weight: 900; line-height: 1; }
  .cover-kpi-unit { font-size: 7.5px; color: rgba(255,255,255,0.45); margin-top: 2px; }
  /* Table of contents */
  .cover-toc { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 20px; }
  .cover-toc-title { font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.35); margin-bottom: 10px; }
  .cover-toc-items { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .cover-toc-item { font-size: 8.5px; color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.07); border-radius: 6px; padding: 5px 10px; border: 1px solid rgba(255,255,255,0.1); }
  .cover-footer {
    padding: 16px 52px; border-top: 1px solid rgba(255,255,255,0.1);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7.5px; color: rgba(255,255,255,0.35);
  }

  /* ── Pages ── */
  .page-break { page-break-before: always; }
  .section { padding: 28px 40px; page-break-inside: avoid; }
  .section + .section { border-top: 1.5px solid #EDF2F7; }

  /* ── Section header ── */
  .section-head { margin: -28px -40px 22px; padding: 18px 40px; background: #F7FAFC; border-bottom: 2px solid #E2E8F0; display: flex; align-items: center; gap: 12px; }
  .section-head-icon { width: 32px; height: 32px; border-radius: 8px; background: #0158A5; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .section-head-text h2 { font-size: 13px; font-weight: 800; color: #0158A5; text-transform: uppercase; letter-spacing: 0.8px; }
  .section-head-text p { font-size: 8.5px; color: #718096; margin-top: 2px; }
  .section-head--teal .section-head-icon { background: #00A896; }
  .section-head--teal h2 { color: #00A896; }
  .section-head--patrimoine .section-head-icon { background: #5A3EA0; }
  .section-head--patrimoine h2 { color: #5A3EA0; }

  /* ── Building divider (patrimoine) ── */
  .building-divider { background: linear-gradient(135deg, #0d2340 0%, #0158A5 100%); color: #fff; padding: 20px 40px; margin: 0; page-break-before: always; display: flex; align-items: center; gap: 14px; }
  .building-divider-num { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; flex-shrink: 0; }
  .building-divider-name { font-size: 18px; font-weight: 800; }
  .building-divider-meta { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 2px; }

  /* ── Sub-headings ── */
  h3 { font-size: 9.5px; font-weight: 700; color: #2D3748; text-transform: uppercase; letter-spacing: 0.8px; margin: 18px 0 8px; display: flex; align-items: center; gap: 6px; }
  h3::after { content: ''; flex: 1; height: 1px; background: #E2E8F0; }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0; }
  .kpi-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .kpi-grid-5 { grid-template-columns: repeat(5, 1fr); }
  .kpi-grid-2 { grid-template-columns: repeat(2, 1fr); }
  .kpi {
    background: #F7FAFC; border-radius: 10px; padding: 12px 14px;
    border-left: 3px solid #CBD5E1; position: relative; overflow: hidden;
  }
  .kpi::before { content: ''; position: absolute; top: 0; right: 0; width: 40px; height: 40px; background: rgba(0,0,0,0.03); border-radius: 0 10px 0 40px; }
  .kpi-label { font-size: 7px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .kpi-value { font-size: 19px; font-weight: 800; color: #1A1A2E; line-height: 1; }
  .kpi-unit { font-size: 7px; color: #A0AEC0; margin-top: 2px; }
  .kpi--blue   { border-left-color: #0158A5; }
  .kpi--cyan   { border-left-color: #008ECF; }
  .kpi--green  { border-left-color: #27AE60; }
  .kpi--red    { border-left-color: #C53030; }
  .kpi--yellow { border-left-color: #D69E2E; }
  .kpi--teal   { border-left-color: #00A896; }

  /* ── DPE ── */
  .dpe-badge { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; border-radius: 6px; }
  .dpe-badge--lg { width: 52px; height: 52px; font-size: 22px; }
  .dpe-badge--md { width: 36px; height: 36px; font-size: 16px; }
  .dpe-badge--sm { width: 24px; height: 24px; font-size: 11px; }
  .dpe-bar { margin: 8px 0 14px; }
  .dpe-bar-row { display: flex; align-items: center; margin-bottom: 2px; }
  .dpe-bar-seg { height: 20px; display: flex; align-items: center; justify-content: flex-end; padding-right: 7px; border-radius: 0 4px 4px 0; min-width: 28px; }
  .dpe-bar-seg-label { color: #fff; font-weight: 700; font-size: 10px; }
  .dpe-bar-active-label { margin-left: 7px; font-size: 8.5px; font-weight: 700; color: #0158A5; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 10px 0; }
  th { background: #0158A5; color: #fff; padding: 7px 10px; text-align: left; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 6px 10px; border-bottom: 1px solid #EDF2F7; vertical-align: middle; }
  tr:nth-child(even) td { background: #F7FAFC; }
  tr:last-child td { border-bottom: none; }

  /* ── Bar chart ── */
  .bar-chart-wrap { margin: 8px 0; }
  .chart-label { font-size: 6.5px; fill: #718096; text-anchor: middle; }
  .chart-value { font-size: 6px; fill: #2D3748; text-anchor: middle; font-weight: 700; }
  .chart-axis  { stroke: #E2E8F0; stroke-width: 0.5; }

  /* ── Scenario card ── */
  .scenario-card { border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 22px; margin: 14px 0; page-break-inside: avoid; }
  .scenario-card-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
  .scenario-title { font-size: 13px; font-weight: 700; color: #0158A5; }
  .scenario-desc { font-size: 8px; color: #A0AEC0; margin-top: 2px; }
  .dpe-arrow { display: flex; align-items: center; gap: 8px; }
  .action-pill { display: inline-block; background: #EBF5FF; color: #0158A5; border-radius: 4px; padding: 2px 7px; font-size: 7px; font-weight: 600; margin: 2px 3px 2px 0; border: 1px solid #BEE3F8; }

  /* ── Comparison table ── */
  .compare-table .badge-good { color: #27AE60; font-weight: 700; }
  .compare-table .badge-warn { color: #D69E2E; font-weight: 700; }
  .compare-table .badge-bad  { color: #C53030; font-weight: 700; }

  /* ── Info blocks ── */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 12px 0; }
  .info-block { background: #F7FAFC; border-radius: 10px; padding: 14px 16px; border-top: 3px solid #008ECF; }
  .info-block-title { font-size: 9px; font-weight: 700; color: #0158A5; margin-bottom: 8px; }
  .info-block ul { list-style: none; padding: 0; }
  .info-block li { font-size: 8px; color: #4A5568; margin-bottom: 4px; padding-left: 12px; position: relative; }
  .info-block li::before { content: '▸'; position: absolute; left: 0; color: #008ECF; }

  /* ── Combo table ── */
  .combo-table th { background: #00A896; }
  .combo-rank { font-size: 15px; text-align: center; width: 28px; }
  .combo-pills { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 3px; }
  .combo-pill { background: #E6FFFA; color: #00766A; border-radius: 3px; padding: 2px 6px; font-size: 7px; font-weight: 600; border: 1px solid #B2F5EA; }
  .combo-dpe-arrow { font-size: 7.5px; color: #A0AEC0; }
  .combo-dpe-badge { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; font-size: 9px; font-weight: 800; }
  .combo-gain-pos { color: #27AE60; font-weight: 700; }
  .combo-gain-neg { color: #C53030; font-weight: 700; }
  .combo-eff { color: #0158A5; font-weight: 700; }
  .combo-info-row { background: #F0FFF4; border-left: 3px solid #00A896; padding: 10px 14px; margin: 12px 0; border-radius: 6px; font-size: 8.5px; color: #276749; }

  /* ── Patrimoine summary ── */
  .patri-building-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; background: #F7FAFC; margin-bottom: 6px; }
  .patri-building-name { font-size: 9px; font-weight: 700; flex: 1; }
  .patri-building-meta { font-size: 8px; color: #718096; }
  .placeholder-box { background: #F7FAFC; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 40px; text-align: center; color: #A0AEC0; }
  .placeholder-box-title { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #718096; }
  .placeholder-box-sub { font-size: 9px; }

  /* ── Footer ── */
  .report-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 7.5px; color: #CBD5E1; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    .page-break { page-break-before: always; }
  }`
}

// ── Single building report ────────────────────────────────────────────────────

function _buildBuildingReport(projectName, a, reno, savedScenarios, comboResults) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const allScenarios = _collectScenarios(reno, savedScenarios)

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<title>Rapport Jean Rénov — ${_esc(projectName)}</title>
<style>${_css()}</style>
</head>
<body>

${_coverPage(projectName, a, today, 'Rapport de simulation thermique', 'Analyse énergétique du bâtiment', { scenarioCount: allScenarios.length, comboCount: comboResults?.length ?? 0 })}

<div class="page-break"></div>
${_physicsSection()}

<div class="page-break"></div>
${_baselineSection(a)}

<div class="page-break"></div>
${_monthlySection(a)}

${allScenarios.length ? `<div class="page-break"></div>${_scenariosSection(allScenarios)}` : ''}
${allScenarios.length > 1 ? `<div class="page-break"></div>${_comparisonSection(allScenarios)}` : ''}
${comboResults?.length ? `<div class="page-break"></div>${_comboSection(comboResults)}` : ''}

</body></html>`
}

// ── Patrimoine report ─────────────────────────────────────────────────────────

function _buildPatrimoineReport(projectName, buildings) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const analyzed = buildings.filter(b => b.analysis)

  // Aggregate stats
  const totalSurf  = analyzed.reduce((s, b) => s + (b.analysis?.total_floor_area_m2 || 0), 0)
  const totalHeat  = analyzed.reduce((s, b) => s + (b.analysis?.heating_need_kwh || 0), 0)
  const totalCost  = analyzed.reduce((s, b) => s + (b.analysis?.cost_eur || 0), 0)
  const totalCo2   = analyzed.reduce((s, b) => s + ((b.analysis?.co2_kg_m2 || 0) * (b.analysis?.total_floor_area_m2 || 0) / 1000), 0)

  const coverKpis = { totalSurf, totalHeat, totalCost, totalCo2, count: analyzed.length }

  // Per-building sections
  const buildingSections = analyzed.map((b, idx) => {
    const allScenarios = _collectScenarios(b.renovation, b.savedScenarios || [])
    const comboResults = b.comboState?.results || []
    return `
<div class="building-divider">
  <div class="building-divider-num">${idx + 1}</div>
  <div>
    <div class="building-divider-name">${_esc(b.name || `Bâtiment ${idx + 1}`)}</div>
    <div class="building-divider-meta">${(b.analysis?.total_floor_area_m2 || 0).toFixed(0)} m² · DPE ${b.analysis?.dpe_class || '?'} · ${(b.analysis?.heating_need_kwh || 0).toFixed(0)} kWh/an chauffage</div>
  </div>
</div>

${_baselineSection(b.analysis)}

${_monthlySection(b.analysis)}

${allScenarios.length ? `<div class="page-break"></div>${_scenariosSection(allScenarios)}` : ''}
${allScenarios.length > 1 ? `<div class="page-break"></div>${_comparisonSection(allScenarios)}` : ''}
${comboResults.length ? `<div class="page-break"></div>${_comboSection(comboResults)}` : ''}`
  }).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<title>Rapport Patrimoine Jean Rénov — ${_esc(projectName)}</title>
<style>${_css()}</style>
</head>
<body>

${_patrimoineCoverPage(projectName, coverKpis, today)}

<div class="page-break"></div>
${_patrimoineSummarySection(analyzed, today)}

<div class="page-break"></div>
${_patrimoineAnalysisSection()}

${buildingSections}

</body></html>`
}

// ── Cover page ────────────────────────────────────────────────────────────────

function _coverPage(projectName, a, today, reportType, subtitle, opts = {}) {
  const dpe  = a?.dpe_class || '?'
  const ep   = a?.primary_energy_kwh_m2?.toFixed(0) ?? '—'
  const co2  = a?.co2_kg_m2?.toFixed(1) ?? '—'
  const surf = a?.total_floor_area_m2?.toFixed(0) ?? '—'
  const heat = _fmtNum(a?.heating_need_kwh?.toFixed(0))
  const cool = _fmtNum(a?.cooling_need_kwh?.toFixed(0))
  const cost = _fmtNum(a?.cost_eur?.toFixed(0))
  const hasCooling = (a?.cooling_need_kwh ?? 0) > 0
  const { scenarioCount = 0, comboCount = 0 } = opts

  const tocItems = [
    '⚙️ Modèle thermique & hypothèses',
    '📈 Performance énergétique — état initial',
    '📅 Consommation mensuelle',
    scenarioCount > 0 ? `🔧 ${scenarioCount} scénario${scenarioCount > 1 ? 's' : ''} de rénovation` : null,
    comboCount > 0 ? `🔬 Analyse combinatoire (${comboCount} combinaisons)` : null,
  ].filter(Boolean)

  return `<div class="cover">
  <div class="cover-top-bar"></div>
  <div class="cover-header">
    <div class="cover-logo-wrap">
      <img src="/jean-renov-logo.png" onerror="this.style.display='none'" alt="JR" />
    </div>
    <div>
      <div class="cover-brand-name">Jean Rénov</div>
      <div class="cover-brand-tagline">Simulation thermique ISO 13790</div>
    </div>
    <div class="cover-header-right">
      <div class="cover-report-type">${reportType}</div>
      <div class="cover-date">${today}</div>
    </div>
  </div>

  <div class="cover-body">
    <div class="cover-hero">
      <div class="cover-hero-dpe">
        <div class="cover-hero-dpe-label">Classe DPE</div>
        <div class="cover-hero-dpe-badge" style="background:${_dpeColor(dpe)}">${dpe}</div>
        <div class="cover-hero-dpe-ep">${ep} <span>kWh EP/m²/an</span></div>
      </div>
      <div class="cover-hero-text">
        <div class="cover-report-type" style="margin-bottom:8px">Rapport de simulation thermique</div>
        <div class="cover-title">${_esc(projectName)}</div>
        <div class="cover-subtitle">${subtitle}</div>
        <div class="cover-hero-meta">
          <span>${surf} m² analysés</span>
          <span class="sep">·</span>
          <span>Méthode ISO 13790</span>
          ${hasCooling ? '<span class="sep">·</span><span>Chauffage & refroidissement</span>' : ''}
        </div>
      </div>
    </div>

    <div class="cover-kpi-row">
      <div class="cover-kpi">
        <div class="cover-kpi-label">Énergie primaire</div>
        <div class="cover-kpi-value">${ep}</div>
        <div class="cover-kpi-unit">kWh EP / m² / an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Émissions CO₂</div>
        <div class="cover-kpi-value">${co2}</div>
        <div class="cover-kpi-unit">kg CO₂ / m² / an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Besoin chauffage</div>
        <div class="cover-kpi-value" style="font-size:17px">${heat}</div>
        <div class="cover-kpi-unit">kWh / an</div>
      </div>
      ${hasCooling ? `<div class="cover-kpi">
        <div class="cover-kpi-label">Besoin froid</div>
        <div class="cover-kpi-value" style="font-size:17px">${cool}</div>
        <div class="cover-kpi-unit">kWh / an</div>
      </div>` : ''}
      <div class="cover-kpi">
        <div class="cover-kpi-label">Coût énergétique</div>
        <div class="cover-kpi-value" style="font-size:17px">${cost}</div>
        <div class="cover-kpi-unit">€ / an</div>
      </div>
    </div>

    <div class="cover-toc">
      <div class="cover-toc-title">Contenu du rapport</div>
      <div class="cover-toc-items">
        ${tocItems.map(s => `<div class="cover-toc-item">${s}</div>`).join('')}
      </div>
    </div>
  </div>

  <div class="cover-footer">
    <span>Jean Rénov — Simulation physique ISO 13790</span>
    <span>Rapport généré le ${today}</span>
    <span>Document confidentiel</span>
  </div>
</div>`
}

function _patrimoineCoverPage(projectName, kpis, today) {
  return `<div class="cover">
  <div class="cover-top-bar"></div>
  <div class="cover-header">
    <div class="cover-logo-wrap">
      <img src="/jean-renov-logo.png" onerror="this.style.display='none'" alt="JR" />
    </div>
    <div>
      <div class="cover-brand-name">Jean Rénov</div>
      <div class="cover-brand-tagline">Simulation thermique ISO 13790</div>
    </div>
  </div>
  <div class="cover-body">
    <div class="cover-report-type">Rapport de simulation — Patrimoine immobilier</div>
    <div class="cover-title">${_esc(projectName)}</div>
    <div class="cover-subtitle" style="margin-bottom:40px">Analyse énergétique multi-bâtiments — ${today}</div>
    <div class="cover-kpi-row">
      <div class="cover-kpi">
        <div class="cover-kpi-label">Bâtiments analysés</div>
        <div class="cover-kpi-value">${kpis.count}</div>
        <div class="cover-kpi-unit">bâtiment${kpis.count > 1 ? 's' : ''}</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Surface totale</div>
        <div class="cover-kpi-value">${_fmtNum(kpis.totalSurf.toFixed(0))}</div>
        <div class="cover-kpi-unit">m²</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Besoin chauffage</div>
        <div class="cover-kpi-value" style="font-size:17px">${_fmtNum(kpis.totalHeat.toFixed(0))}</div>
        <div class="cover-kpi-unit">kWh / an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Coût énergétique</div>
        <div class="cover-kpi-value" style="font-size:17px">${_fmtNum(kpis.totalCost.toFixed(0))}</div>
        <div class="cover-kpi-unit">€ / an</div>
      </div>
      <div class="cover-kpi">
        <div class="cover-kpi-label">Émissions CO₂</div>
        <div class="cover-kpi-value" style="font-size:17px">${kpis.totalCo2.toFixed(1)}</div>
        <div class="cover-kpi-unit">t CO₂ / an</div>
      </div>
    </div>
  </div>
  <div class="cover-footer">
    <span>Jean Rénov — Simulation physique ISO 13790</span>
    <span>Rapport généré le ${today}</span>
    <span>Document confidentiel</span>
  </div>
</div>`
}

// ── Patrimoine summary ────────────────────────────────────────────────────────

function _patrimoineSummarySection(buildings, today) {
  const rows = buildings.map((b, i) => {
    const a = b.analysis
    const dpe = a?.dpe_class || '?'
    return `<div class="patri-building-row">
      <div class="dpe-badge dpe-badge--md" style="background:${_dpeColor(dpe)}">${dpe}</div>
      <div class="patri-building-name">${_esc(b.name || `Bâtiment ${i + 1}`)}</div>
      <div class="patri-building-meta">${_fmtNum((a?.total_floor_area_m2||0).toFixed(0))} m²</div>
      <div class="patri-building-meta" style="margin-left:12px">${_fmtNum((a?.heating_need_kwh||0).toFixed(0))} kWh chauf.</div>
      <div class="patri-building-meta" style="margin-left:12px">${(a?.primary_energy_kwh_m2||0).toFixed(0)} kWh EP/m²/an</div>
      <div class="patri-building-meta" style="margin-left:12px">${_fmtNum((a?.cost_eur||0).toFixed(0))} €/an</div>
    </div>`
  }).join('')

  const totalSurf = buildings.reduce((s, b) => s + (b.analysis?.total_floor_area_m2 || 0), 0)
  const totalHeat = buildings.reduce((s, b) => s + (b.analysis?.heating_need_kwh || 0), 0)
  const totalCost = buildings.reduce((s, b) => s + (b.analysis?.cost_eur || 0), 0)

  return `<div class="section">
  <div class="section-head">
    <div class="section-head-icon">📋</div>
    <div class="section-head-text">
      <h2>Synthèse du patrimoine</h2>
      <p>${buildings.length} bâtiment${buildings.length > 1 ? 's' : ''} — vue d'ensemble des performances énergétiques</p>
    </div>
  </div>

  <div class="kpi-grid kpi-grid-3" style="margin-bottom:20px">
    <div class="kpi kpi--blue">
      <div class="kpi-label">Surface totale</div>
      <div class="kpi-value">${_fmtNum(totalSurf.toFixed(0))}</div>
      <div class="kpi-unit">m²</div>
    </div>
    <div class="kpi kpi--red">
      <div class="kpi-label">Chauffage total</div>
      <div class="kpi-value" style="font-size:15px">${_fmtNum(totalHeat.toFixed(0))}</div>
      <div class="kpi-unit">kWh / an</div>
    </div>
    <div class="kpi kpi--yellow">
      <div class="kpi-label">Coût total</div>
      <div class="kpi-value" style="font-size:15px">${_fmtNum(totalCost.toFixed(0))}</div>
      <div class="kpi-unit">€ / an</div>
    </div>
  </div>

  <h3>Détail par bâtiment</h3>
  ${rows}

  <div class="report-footer">
    <span>Jean Rénov — Rapport patrimoine</span>
    <span>Généré le ${today}</span>
  </div>
</div>`
}

// ── Analyse échelle patrimoine (placeholder) ──────────────────────────────────

function _patrimoineAnalysisSection() {
  return `<div class="section">
  <div class="section-head section-head--patrimoine">
    <div class="section-head-icon">🏙️</div>
    <div class="section-head-text">
      <h2>Analyse à l'échelle du patrimoine</h2>
      <p>Fonctionnalités en cours de développement</p>
    </div>
  </div>

  <div class="placeholder-box">
    <div class="placeholder-box-title">🚧 Section à venir</div>
    <div class="placeholder-box-sub" style="max-width:400px;margin:0 auto;line-height:1.6">
      Cette section accueillera prochainement les analyses transversales du patrimoine :<br>
      priorisation des bâtiments à rénover, plan pluriannuel de travaux,
      simulations de scénarios d'investissement à l'échelle du parc,
      et suivi de l'objectif de décarbonation.
    </div>
  </div>
</div>`
}

// ── Physics section ───────────────────────────────────────────────────────────

function _physicsSection() {
  return `<div class="section">
  <div class="section-head">
    <div class="section-head-icon">⚙️</div>
    <div class="section-head-text">
      <h2>Modèle thermique</h2>
      <p>Méthodologie et hypothèses physiques de la simulation</p>
    </div>
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
        <li>Zones dessinées en GeoJSON</li>
        <li>Hauteur, usage et ère de construction par zone</li>
        <li>Surfaces de parois calculées automatiquement</li>
        <li>Orientations et adjacences gérées</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">🔥 Systèmes énergétiques</div>
      <ul>
        <li>Chauffage : PAC, chaudière gaz, réseau de chaleur</li>
        <li>Refroidissement : split AC, multisplit, PAC réversible</li>
        <li>VMC avec récupération de chaleur</li>
        <li>Conversion énergie primaire EN 15603</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">📊 Indicateurs calculés</div>
      <ul>
        <li>DPE classe A→G (énergie primaire + CO₂)</li>
        <li>Besoins mensuels chauffage & refroidissement</li>
        <li>Énergie finale, primaire, coût annuel, CO₂</li>
        <li>Déperditions par composant</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-block-title">🎯 Calibration</div>
      <ul>
        <li>Ajustement sur consommation réelle mesurée</li>
        <li>Correction des conductivités U et infiltrations</li>
        <li>Validation graphique mensuelle</li>
        <li>Correction globale ou par zone</li>
      </ul>
    </div>
  </div>
</div>`
}

// ── Baseline section ──────────────────────────────────────────────────────────

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
    <div class="section-head-icon">📈</div>
    <div class="section-head-text">
      <h2>Performance énergétique — État initial</h2>
      <p>Résultats de la simulation thermique du bâtiment en l'état actuel</p>
    </div>
  </div>

  <div style="display:flex;gap:24px;align-items:flex-start">
    <div style="min-width:150px">
      <h3>Classe DPE</h3>
      ${_dpeBarHTML(dpe)}
    </div>
    <div style="flex:1">
      <h3>Indicateurs globaux</h3>
      <div class="kpi-grid">
        <div class="kpi kpi--blue">
          <div class="kpi-label">Énergie primaire</div>
          <div class="kpi-value">${ep}</div>
          <div class="kpi-unit">kWh EP / m² / an</div>
        </div>
        <div class="kpi" style="border-left-color:${_dpeColor(co2c)}">
          <div class="kpi-label">Classe CO₂</div>
          <div class="kpi-value" style="color:${_dpeColor(co2c)}">${co2c}</div>
          <div class="kpi-unit">${co2} kg / m² / an</div>
        </div>
        <div class="kpi kpi--red">
          <div class="kpi-label">Besoin chauffage</div>
          <div class="kpi-value" style="font-size:14px">${heat}</div>
          <div class="kpi-unit">kWh / an</div>
        </div>
        <div class="kpi kpi--cyan">
          <div class="kpi-label">Besoin froid</div>
          <div class="kpi-value" style="font-size:14px">${cool}</div>
          <div class="kpi-unit">kWh / an</div>
        </div>
        <div class="kpi kpi--yellow">
          <div class="kpi-label">Coût annuel estimé</div>
          <div class="kpi-value" style="font-size:14px">${cost}</div>
          <div class="kpi-unit">€ / an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Surface totale</div>
          <div class="kpi-value" style="font-size:14px">${surf}</div>
          <div class="kpi-unit">m²</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Énergie finale</div>
          <div class="kpi-value" style="font-size:14px">${final}</div>
          <div class="kpi-unit">kWh / an</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Énergie primaire tot.</div>
          <div class="kpi-value" style="font-size:14px">${prim}</div>
          <div class="kpi-unit">kWh / an</div>
        </div>
      </div>
    </div>
  </div>

  ${zones.length ? `
  <h3>Détail par zone thermique</h3>
  <table>
    <thead><tr>
      <th>Zone</th><th>Surface (m²)</th><th>Chauffage (kWh)</th><th>Refroid. (kWh)</th>
      <th>Ht (W/m²K)</th><th>Hv (W/m²K)</th><th>Gains sol. (kWh)</th><th>Pertes (kWh)</th>
    </tr></thead>
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

// ── Monthly section ───────────────────────────────────────────────────────────

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
    <div class="section-head-icon">📅</div>
    <div class="section-head-text">
      <h2>Consommation mensuelle</h2>
      <p>Besoins thermiques mois par mois — chauffage et refroidissement</p>
    </div>
  </div>
  <h3>Besoins de chauffage (kWh / mois)</h3>
  ${_svgBarChart(heating, '#C53030', 660, 140)}
  ${_monthlyTable(heating, 'Chauffage (kWh)')}
  ${hasCooling ? `
  <h3 style="margin-top:20px">Besoins de refroidissement (kWh / mois)</h3>
  ${_svgBarChart(cooling, '#0158A5', 660, 120)}
  ${_monthlyTable(cooling, 'Refroidissement (kWh)')}
  ` : ''}
</div>`
}

// ── Scenarios section ─────────────────────────────────────────────────────────

function _scenariosSection(scenarios) {
  return `<div class="section">
  <div class="section-head">
    <div class="section-head-icon">🔧</div>
    <div class="section-head-text">
      <h2>Scénarios de rénovation</h2>
      <p>${scenarios.length} scénario${scenarios.length > 1 ? 's' : ''} étudié${scenarios.length > 1 ? 's' : ''}</p>
    </div>
  </div>
  ${scenarios.map((s, i) => _scenarioCard(s, i)).join('')}
</div>`
}

function _scenarioCard(s, idx) {
  const bDpe    = s.baseline_dpe || s.dpe_before || '?'
  const aDpe    = s.after_dpe    || s.dpe_after  || '?'
  const invest  = s.investment_center_eur ?? s.investment_max_eur ?? 0
  const savings = s.cost_savings_eur_per_year ?? 0
  const roi     = s.simple_payback_years
  const reduc   = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
  const ep      = s.primary_energy_after_kwh_m2 ?? s.after_full?.primary_energy_kwh_m2
  const actions = s.actions || []
  const beforeMonthly = _extractMonthly(s, 'baseline')
  const afterMonthly  = _extractMonthly(s, 'after')

  return `<div class="scenario-card">
  <div class="scenario-card-head">
    <div style="flex:1">
      <div class="scenario-title">${_esc(s.scenario_label || s.name || `Scénario ${idx + 1}`)}</div>
      <div class="scenario-desc">${_esc(s.scenario_description || s.description || '')}</div>
    </div>
    <div style="font-size:9px;color:#A0AEC0;margin-right:8px">DPE</div>
    <div class="dpe-arrow">
      <div class="dpe-badge dpe-badge--lg" style="background:${_dpeColor(bDpe)}">${bDpe}</div>
      <span style="font-size:18px;color:#CBD5E1;margin:0 6px">→</span>
      <div class="dpe-badge dpe-badge--lg" style="background:${_dpeColor(aDpe)}">${aDpe}</div>
    </div>
  </div>

  <div class="kpi-grid kpi-grid-5" style="margin-bottom:12px">
    <div class="kpi kpi--green">
      <div class="kpi-label">Réduction chauffage</div>
      <div class="kpi-value" style="font-size:17px">−${Math.round(reduc)} %</div>
    </div>
    <div class="kpi kpi--green">
      <div class="kpi-label">Économie annuelle</div>
      <div class="kpi-value" style="font-size:14px">${_fmtNum(Math.round(savings))}</div>
      <div class="kpi-unit">€ / an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Investissement</div>
      <div class="kpi-value" style="font-size:14px">${_fmtNum(Math.round(invest))}</div>
      <div class="kpi-unit">€</div>
    </div>
    <div class="kpi ${roi != null && roi < 15 ? 'kpi--green' : roi < 30 ? '' : 'kpi--red'}">
      <div class="kpi-label">Retour sur invest.</div>
      <div class="kpi-value" style="font-size:17px">${roi != null && roi < 99 ? Math.round(roi) : '>99'}</div>
      <div class="kpi-unit">ans</div>
    </div>
    <div class="kpi kpi--blue">
      <div class="kpi-label">EP après travaux</div>
      <div class="kpi-value" style="font-size:14px">${ep?.toFixed(0) ?? '—'}</div>
      <div class="kpi-unit">kWh EP / m² / an</div>
    </div>
  </div>

  ${actions.length ? `<div style="margin:8px 0 10px">
    <span style="font-size:7.5px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.8px">Actions incluses</span><br style="margin-bottom:4px"/>
    ${actions.map(ac => `<span class="action-pill">${_esc(ac.label || ac.action_id || '—')}</span>`).join('')}
  </div>` : ''}

  ${beforeMonthly && afterMonthly ? `
  <div style="font-size:7.5px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.8px;margin-top:10px;margin-bottom:4px">Chauffage — avant vs après (kWh / mois)</div>
  ${_svgDualBarChart(beforeMonthly, afterMonthly, 660, 90)}
  ` : ''}
</div>`
}

// ── Comparison section ────────────────────────────────────────────────────────

function _comparisonSection(scenarios) {
  return `<div class="section">
  <div class="section-head">
    <div class="section-head-icon">⚖️</div>
    <div class="section-head-text">
      <h2>Comparaison des scénarios</h2>
      <p>Vue synthétique de toutes les options étudiées</p>
    </div>
  </div>
  <table class="compare-table">
    <thead>
      <tr>
        <th>Scénario</th>
        <th>DPE avant</th><th>DPE après</th>
        <th>Réduc. chauf.</th><th>Économie /an</th>
        <th>Investissement</th><th>Retour (ans)</th><th>kWh / k€</th>
      </tr>
    </thead>
    <tbody>
      ${scenarios.map(s => {
        const bDpe   = s.baseline_dpe || s.dpe_before || '?'
        const aDpe   = s.after_dpe    || s.dpe_after  || '?'
        const invest = s.investment_center_eur ?? s.investment_max_eur ?? 0
        const savings= s.cost_savings_eur_per_year ?? 0
        const roi    = s.simple_payback_years
        const reduc  = s.heating_need_reduction_pct ?? s.heating_reduction_pct ?? 0
        const heatBef= s.baseline_full?.heating_need_kwh ?? 0
        const heatAft= s.after_full?.heating_need_kwh ?? 0
        const effic  = invest > 0 ? Math.round(((heatBef - heatAft) / invest) * 1000) : 0
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
    <span>Jean Rénov — Simulation physique ISO 13790</span>
    <span>Rapport généré le ${new Date().toLocaleDateString('fr-FR')}</span>
  </div>
</div>`
}

// ── Combo section ─────────────────────────────────────────────────────────────

function _comboSection(results) {
  if (!results?.length) return ''
  const total = results.length
  const best  = results[0]
  const medals = ['🥇','🥈','🥉']

  const rows = results.map((s, i) => {
    const dpeAfter  = s.result?.dpe_after  ?? s.result?.after_dpe  ?? '?'
    const dpeBefore = s.result?.dpe_before ?? s.result?.baseline_dpe ?? '?'
    const dpeColor  = { A:'#00b050',B:'#92d050',C:'#c8e84d',D:'#ffbf00',E:'#ff9f00',F:'#ff6200',G:'#e02020' }[dpeAfter] ?? '#888'
    const dpeText   = ['A','B','C'].includes(dpeAfter) ? '#333' : '#fff'

    const heatBefore = s.result?.heating_need_before_kwh      ?? 0
    const heatAfter  = s.result?.heating_need_after_kwh       ?? 0
    const coolBefore = s.result?.cooling_need_before_kwh      ?? 0
    const coolAfter  = s.result?.cooling_need_after_kwh       ?? 0
    const epBefore   = s.result?.primary_energy_before_kwh_m2 ?? 0
    const epAfter    = s.result?.primary_energy_after_kwh_m2  ?? 0
    const heatPct = s.deltaHeatPct ?? (heatBefore > 0 ? (heatBefore - heatAfter) / heatBefore * 100 : 0)
    const coolPct = s.deltaCoolPct ?? (coolBefore > 0 ? (coolBefore - coolAfter) / coolBefore * 100 : 0)
    const epPct   = s.deltaEpPct   ?? (epBefore   > 0 ? (epBefore   - epAfter)   / epBefore   * 100 : 0)

    const _pct = (v, has) => {
      if (!has) return '<span style="color:#A0AEC0">—</span>'
      const cls  = v >= 15 ? 'combo-gain-pos' : v < 0 ? 'combo-gain-neg' : ''
      const sign = v > 0 ? '−' : v < 0 ? '+' : ''
      return `<span class="${cls}">${sign}${Math.round(Math.abs(v))} %</span>`
    }

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
      <td style="text-align:right">${_pct(heatPct, heatBefore > 0)}</td>
      <td style="text-align:right">${_pct(coolPct, coolBefore > 0)}</td>
      <td style="text-align:right">${_pct(epPct,   epBefore   > 0)}</td>
      <td style="text-align:right">${s.investKeur > 0 ? s.investKeur.toFixed(0) + ' k€' : '—'}</td>
      <td style="text-align:center"><span class="combo-dpe-badge" style="background:${dpeColor};color:${dpeText}">${dpeAfter}</span></td>
    </tr>`
  }).join('')

  const bestHeatPct = (() => {
    const hb = best.result?.heating_need_before_kwh ?? 0
    const ha = best.result?.heating_need_after_kwh  ?? 0
    return hb > 0 ? Math.round((hb - ha) / hb * 100) : null
  })()

  return `<div class="section">
  <div class="section-head section-head--teal">
    <div class="section-head-icon">🔬</div>
    <div class="section-head-text">
      <h2>Analyse combinatoire</h2>
      <p>${total} combinaisons d'actions simulées — gain relatif en besoins de chauffage, de froid et d'énergie primaire</p>
    </div>
  </div>

  <div class="combo-info-row">
    <strong>${total} scénarios</strong> générés et simulés automatiquement à partir du pool d'actions sélectionné.
    Meilleur résultat : <strong>${_esc(best.name)}</strong>
    ${bestHeatPct !== null ? `— réduction chauffage : <strong>−${bestHeatPct} %</strong>` : ''}
    pour <strong>${best.investKeur > 0 ? best.investKeur.toFixed(0) + ' k€' : 'coût non défini'}</strong>.
  </div>

  <table class="combo-table">
    <thead><tr>
      <th style="width:28px"></th>
      <th>Actions incluses</th>
      <th style="text-align:right">▼ Chauf.</th>
      <th style="text-align:right">▼ Froid</th>
      <th style="text-align:right">▼ Énergie prim.</th>
      <th style="text-align:right">Investissement</th>
      <th style="text-align:center">DPE</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${total > 5 ? `<p style="font-size:7.5px;color:#A0AEC0;margin-top:6px;font-style:italic">Affichage des ${total} scénarios simulés. Les 3 premiers sont mis en évidence.</p>` : ''}

  <div class="report-footer">
    <span>Jean Rénov — Analyse combinatoire</span>
    <span>▼ = réduction relative vs état initial</span>
  </div>
</div>`
}

// ── SVG charts ────────────────────────────────────────────────────────────────

const _MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function _svgBarChart(values, color, width, height) {
  const maxV = Math.max(...values, 1)
  const n    = values.length
  const padL = 8, padR = 8, padT = 20, padB = 24
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const bw    = plotW / n * 0.68
  const gap   = plotW / n

  let bars = ''
  values.forEach((v, i) => {
    const bh  = (v / maxV) * plotH
    const bx  = padL + i * gap + (gap - bw) / 2
    const by  = padT + plotH - bh
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" fill="${color}" rx="2" opacity="0.85"/>`
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
    const va  = after[i] || 0
    const bhB = (vb / maxV) * plotH
    const bhA = (va / maxV) * plotH
    const gx  = padL + i * grpW
    bars += `<rect x="${(gx + grpW*0.06).toFixed(1)}" y="${(padT + plotH - bhB).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bhB).toFixed(1)}" fill="#AABBD4" rx="1"/>`
    bars += `<rect x="${(gx + grpW*0.06 + bw + 1).toFixed(1)}" y="${(padT + plotH - bhA).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,bhA).toFixed(1)}" fill="#008ECF" rx="1"/>`
    bars += `<text x="${(gx + grpW/2).toFixed(1)}" y="${(padT + plotH + 12).toFixed(1)}" class="chart-label">${_MONTHS[i]}</text>`
  })

  return `<div class="bar-chart-wrap">
    <svg width="${width}" height="${height}" style="max-width:100%">
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="chart-axis"/>
      ${bars}
      <rect x="${width-92}" y="2" width="9" height="7" fill="#AABBD4" rx="1"/>
      <text x="${width-79}" y="9" style="font-size:7px;fill:#718096">Avant</text>
      <rect x="${width-46}" y="2" width="9" height="7" fill="#008ECF" rx="1"/>
      <text x="${width-33}" y="9" style="font-size:7px;fill:#718096">Après</text>
    </svg>
  </div>`
}

function _monthlyTable(values, rowLabel) {
  return `<table style="font-size:8pt;margin-top:6px">
    <thead><tr><th style="text-align:left">${rowLabel}</th>${_MONTHS.map(m => `<th>${m}</th>`).join('')}</tr></thead>
    <tbody><tr>
      <td style="font-weight:600;text-align:left">kWh</td>
      ${values.map(v => `<td>${v > 0 ? Math.round(v).toLocaleString('fr-FR') : '—'}</td>`).join('')}
    </tr></tbody>
  </table>`
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _collectScenarios(reno, saved) {
  const out = []
  if (reno?.scenarios?.length) reno.scenarios.forEach(s => out.push({ ...s, _source: 'standard' }))
  saved.forEach(s => {
    if (!out.find(x => x.scenario_label === s.name)) {
      out.push({
        scenario_label: s.name, scenario_description: '',
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

function _dpeBarHTML(current) {
  const classes = ['A','B','C','D','E','F','G']
  const widths  = [52, 62, 72, 82, 92, 102, 112]
  return `<div class="dpe-bar">${classes.map((cls, i) => `
    <div class="dpe-bar-row">
      <div class="dpe-bar-seg" style="width:${widths[i]}px;background:${_dpeColor(cls)};${cls===current?'box-shadow:0 0 0 2px #1A1A2E;':''}">
        <span class="dpe-bar-seg-label" style="font-size:${cls===current?12:9}px">${cls}</span>
      </div>
      ${cls === current ? `<span class="dpe-bar-active-label">◄ ACTUEL</span>` : ''}
    </div>`).join('')}
  </div>`
}

function _envelopeBreakdownHTML(eb) {
  if (!eb || !Object.keys(eb).length) return ''
  const items = Object.entries(eb).sort((a, b) => b[1] - a[1])
  const total = items.reduce((s, [, v]) => s + v, 0)
  const COLORS = ['#0158A5','#008ECF','#27AE60','#D69E2E','#C53030','#8B5CF6']
  return `<h3>Déperditions par composant</h3>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0">
    ${items.map(([k, v], i) => {
      const pct = total > 0 ? (v / total * 100).toFixed(0) : 0
      return `<div style="display:flex;align-items:center;gap:4px">
        <div style="width:10px;height:10px;background:${COLORS[i%COLORS.length]};border-radius:2px"></div>
        <span style="font-size:7.5px;color:#4A5568">${_labelComp(k)} <strong>${pct}%</strong></span>
      </div>`
    }).join('')}
  </div>
  <div style="display:flex;height:16px;border-radius:4px;overflow:hidden;margin-bottom:8px">
    ${items.map(([, v], i) => {
      const pct = total > 0 ? v / total * 100 : 0
      return `<div style="width:${pct}%;background:${COLORS[i%COLORS.length]};display:flex;align-items:center;justify-content:center">
        ${pct > 8 ? `<span style="font-size:6.5px;color:#fff;font-weight:700">${Math.round(pct)}%</span>` : ''}
      </div>`
    }).join('')}
  </div>`
}

const _DPE_COLORS = { A:'#27AE60',B:'#6EBE44',C:'#B5D334',D:'#F1C40F',E:'#F39C12',F:'#E67E22',G:'#E74C3C' }
function _dpeColor(cls) { return _DPE_COLORS[cls] || '#888' }
function _labelComp(k) {
  return { walls:'Murs', roof:'Toiture', floor:'Plancher', windows:'Vitrage', thermal_bridges:'Ponts th.', ventilation:'Ventilation' }[k] || k
}
function _fmtNum(v) { const n = Number(v); return isNaN(n) ? String(v ?? '—') : n.toLocaleString('fr-FR') }
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
