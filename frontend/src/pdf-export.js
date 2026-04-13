/**
 * PDF export — generates a printable report for an OptiBuilding study.
 * Uses browser's native print dialog with a dedicated print stylesheet.
 * No external library required.
 */

export function exportStudyPDF(projectName, analysisResult, renovationResult) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { alert('Autorisez les popups pour exporter en PDF.'); return }

  const html = _buildReportHTML(projectName, analysisResult, renovationResult)
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    setTimeout(() => win.print(), 300)
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function _buildReportHTML(projectName, a, reno) {
  const today  = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const dpeClass = a?.dpe_class || '—'
  const dpeColor = _dpeColor(dpeClass)
  const ep       = a?.primary_energy_kwh_m2?.toFixed(0) ?? '—'
  const co2      = a?.co2_kg_m2?.toFixed(1) ?? '—'
  const surface  = a?.total_floor_area_m2?.toFixed(0) ?? '—'
  const heating  = a?.heating_need_kwh?.toFixed(0) ?? '—'
  const cooling  = a?.cooling_need_kwh?.toFixed(0) ?? '—'

  const scenariosHTML = reno?.scenarios?.length
    ? `<h2>Scénarios de rénovation</h2>
       <table class="reno-table">
         <thead>
           <tr>
             <th>Scénario</th>
             <th>DPE avant → après</th>
             <th>EP (kWh/m²/an)</th>
             <th>Réduction chauffage</th>
             <th>Économie /an</th>
             <th>Investissement</th>
             <th>Retour</th>
           </tr>
         </thead>
         <tbody>
           ${reno.scenarios.map(s => _scenarioRow(s, reno.baseline)).join('')}
         </tbody>
       </table>`
    : ''

  const monthlyRows = _monthlyTableRows(a)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Étude OptiBuilding — ${_esc(projectName)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size:11pt; color:#1a1a2e; background:#fff; padding:20mm 18mm; }
    h1  { font-size:20pt; color:#1a1a2e; margin-bottom:4px; }
    h2  { font-size:13pt; color:#2c3e50; margin:24px 0 10px; border-bottom:2px solid #e0e4f0; padding-bottom:4px; }
    .subtitle { color:#666; font-size:9pt; margin-bottom:24px; }
    .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    .kpi { border:1px solid #e0e4f0; border-radius:8px; padding:12px 14px; }
    .kpi-label { font-size:8pt; color:#888; text-transform:uppercase; letter-spacing:.5px; }
    .kpi-value { font-size:18pt; font-weight:700; margin-top:2px; }
    .kpi-unit  { font-size:8pt; color:#888; }
    .dpe-badge { display:inline-block; color:#fff; font-weight:800; font-size:22pt; width:52px; height:52px; border-radius:10px; text-align:center; line-height:52px; }
    table { width:100%; border-collapse:collapse; font-size:9pt; margin-bottom:16px; }
    th { background:#f0f2fa; padding:7px 8px; text-align:left; border:1px solid #dde; font-size:8pt; color:#444; }
    td { padding:6px 8px; border:1px solid #dde; }
    tr:nth-child(even) { background:#f8f9fc; }
    .dpe-chip { display:inline-block; color:#fff; font-weight:700; padding:1px 7px; border-radius:4px; font-size:9pt; }
    .footer { margin-top:40px; padding-top:10px; border-top:1px solid #e0e4f0; font-size:8pt; color:#aaa; display:flex; justify-content:space-between; }
    @media print {
      body { padding:0; }
      @page { margin:20mm 18mm; }
    }
  </style>
</head>
<body>

  <h1>${_esc(projectName)}</h1>
  <p class="subtitle">Étude énergétique OptiBuilding — générée le ${today}</p>

  <h2>Performance énergétique actuelle</h2>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Classe DPE</div>
      <div style="margin-top:6px"><span class="dpe-badge" style="background:${dpeColor}">${dpeClass}</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Énergie primaire</div>
      <div class="kpi-value">${ep}</div>
      <div class="kpi-unit">kWh EP/m²/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Émissions CO₂</div>
      <div class="kpi-value">${co2}</div>
      <div class="kpi-unit">kg/m²/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Surface</div>
      <div class="kpi-value">${surface}</div>
      <div class="kpi-unit">m²</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Besoins chauffage</div>
      <div class="kpi-value">${_fmt(heating)}</div>
      <div class="kpi-unit">kWh/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Besoins refroidissement</div>
      <div class="kpi-value">${_fmt(cooling)}</div>
      <div class="kpi-unit">kWh/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Coût énergie</div>
      <div class="kpi-value">${_fmt(a?.cost_eur?.toFixed(0))}</div>
      <div class="kpi-unit">€/an</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Classe CO₂</div>
      <div style="margin-top:6px"><span class="dpe-badge" style="background:${_dpeColor(a?.dpe_co2_class)};font-size:16pt;width:40px;height:40px;line-height:40px">${a?.dpe_co2_class || '—'}</span></div>
    </div>
  </div>

  ${monthlyRows ? `<h2>Détail mensuel</h2>${monthlyRows}` : ''}

  ${scenariosHTML}

  <div class="footer">
    <span>OptiBuilding — Outil de simulation énergétique</span>
    <span>Rapport généré le ${today}</span>
  </div>

</body>
</html>`
}

function _scenarioRow(s, baseline) {
  const invest = (s.investment_center_eur ?? s.investment_max_eur ?? 0).toLocaleString('fr-FR')
  const savings = (s.cost_savings_eur_per_year ?? 0).toLocaleString('fr-FR')
  const roi    = s.simple_payback_years > 99 ? '>99 ans' : s.simple_payback_years != null ? `${s.simple_payback_years?.toFixed(0)} ans` : '—'
  const reduc  = s.heating_need_reduction_pct != null ? `−${s.heating_need_reduction_pct?.toFixed(0)} %` : '—'
  const ep     = s.primary_energy_after_kwh_m2?.toFixed(0) ?? '—'
  const beforeDpe = s.baseline_dpe || s.dpe_before || '?'
  const afterDpe  = s.after_dpe   || s.dpe_after  || '?'
  return `<tr>
    <td><strong>${_esc(s.scenario_label || s.scenario?.label || '')}</strong></td>
    <td>
      <span class="dpe-chip" style="background:${_dpeColor(beforeDpe)}">${beforeDpe}</span>
      →
      <span class="dpe-chip" style="background:${_dpeColor(afterDpe)}">${afterDpe}</span>
    </td>
    <td>${ep} kWh/m²/an</td>
    <td>${reduc}</td>
    <td>${savings} €</td>
    <td>${invest} €</td>
    <td>${roi}</td>
  </tr>`
}

function _monthlyTableRows(a) {
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  // Aggregate from zones
  const zones = a?.zones || a?.zone_results || []
  const heating = new Array(12).fill(0)
  const cooling = new Array(12).fill(0)
  zones.forEach(z => {
    z.heating_need_monthly?.forEach((v, i) => { heating[i] += v || 0 })
    z.cooling_need_monthly?.forEach((v, i) => { cooling[i] += v || 0 })
  })
  if (!heating.some(v => v > 0) && !cooling.some(v => v > 0)) return ''
  return `<table>
    <thead>
      <tr><th>Mois</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}</tr>
    </thead>
    <tbody>
      <tr>
        <td>Chauffage (kWh)</td>
        ${heating.map(v => `<td>${v > 0 ? Math.round(v).toLocaleString('fr-FR') : '—'}</td>`).join('')}
      </tr>
      ${cooling.some(v => v > 0) ? `<tr>
        <td>Refroidissement (kWh)</td>
        ${cooling.map(v => `<td>${v > 0 ? Math.round(v).toLocaleString('fr-FR') : '—'}</td>`).join('')}
      </tr>` : ''}
    </tbody>
  </table>`
}

const _DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}
function _dpeColor(cls) { return _DPE_COLORS[cls] || '#888' }
function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function _fmt(v) { return v != null && !isNaN(v) ? Number(v).toLocaleString('fr-FR') : '—' }
