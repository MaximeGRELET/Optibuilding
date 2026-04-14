/** Render analysis + renovation results into the right panel. */

import { mountActionsPanel, showCustomResult, showCustomResultLoading, hideCustomResult } from './actions-panel.js'
import { simulateActions, analyzeRenovation } from './api.js'
import { renderHourlyCharts, renderMonthlyChart, hideCharts } from './charts.js'
import { mountCalibrationPanel } from './calibration.js'
import { mountComparePanel, addSavedScenario } from './scenario-compare.js'
import {
  Chart, LineController, LineElement, BarController, BarElement,
  CategoryScale, LinearScale, PointElement, Tooltip, Legend,
} from 'chart.js'

Chart.register(LineController, LineElement, BarController, BarElement,
  CategoryScale, LinearScale, PointElement, Tooltip, Legend)

const DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const SCENARIO_PALETTE = [
  '#4f80ff', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4',
]

const SCENARIO_SUBTITLES = {
  light:        'Amélioration rapide, faible investissement',
  intermediate: 'Bon rapport coût / performance',
  bbc_retrofit: 'Niveau BBC — réduction maximale',
}

// ── Module state ──────────────────────────────────────────────────────────────

let _currentGeojson   = null
let _currentStationId = null
let _currentCalibration = {}
let _pendingRenovation = null
let _baselineMonthly  = null   // 12-value array from calibrated result
let _renoMonthlyChart  = null
let _renoCoolingChart  = null

// ── Public ────────────────────────────────────────────────────────────────────

export function showResults(analysis, renovation, geojson, stationId = null, calibration = {}) {
  _currentGeojson   = geojson
  _currentStationId = stationId
  _currentCalibration = calibration
  _pendingRenovation = renovation

  _renderDPE(analysis)
  _renderKPIs(analysis)

  hideCharts()
  renderMonthlyChart(analysis)
  if (analysis.t_ext_hourly) renderHourlyCharts(analysis)

  document.getElementById('actions-section')?.classList.add('hidden')
  document.getElementById('renovation-section')?.classList.add('hidden')
  document.getElementById('compare-section')?.classList.add('hidden')

  _renderCalibrationPanel(geojson)
}

export function clearResults() {
  _currentGeojson = null
  _baselineMonthly = null
  if (_renoMonthlyChart) { _renoMonthlyChart.destroy(); _renoMonthlyChart = null }
  if (_renoCoolingChart) { _renoCoolingChart.destroy(); _renoCoolingChart = null }
}

// ── Calibration panel ─────────────────────────────────────────────────────────

function _renderCalibrationPanel(geojson) {
  const mount = document.getElementById('calibration-panel-mount')
  if (!mount) return
  mountCalibrationPanel(
    mount, geojson, _currentStationId,
    (result) => {
      _renderDPE(result)
      _renderKPIs(result)
      // Keep top monthly chart in sync with current calibration simulation
      if (result.zones?.length) renderMonthlyChart(result)
    },
    async (calibratedResult, calibration) => {
      if (calibratedResult) { _renderDPE(calibratedResult); _renderKPIs(calibratedResult) }
      _currentCalibration = calibration || {}

      // Store baseline monthly heating for comparison graph
      _baselineMonthly = _extractMonthly(calibratedResult)

      document.getElementById('actions-section')?.classList.remove('hidden')
      document.getElementById('renovation-section')?.classList.remove('hidden')
      document.getElementById('compare-section')?.classList.remove('hidden')
      _renderActionsPanel()
      _renderComparePanel()
      document.dispatchEvent(new CustomEvent('calibration:validated'))

      try {
        const reno = await analyzeRenovation(_currentGeojson, 'monthly', _currentStationId, _currentCalibration)
        _pendingRenovation = reno
        _renderRenovation(reno)
        document.dispatchEvent(new CustomEvent('renovation:updated', { detail: reno }))
      } catch (err) {
        console.error('Renovation (calibrated) error:', err)
        _renderRenovation(_pendingRenovation)
      }

      document.getElementById('renovation-section')?.scrollIntoView({ behavior: 'smooth' })
    },
  )
}

// ── Actions panel ─────────────────────────────────────────────────────────────

function _renderActionsPanel() {
  const mount = document.getElementById('actions-panel-mount')
  if (!mount) return
  const compareMount = document.getElementById('compare-panel-mount')

  mountActionsPanel(
    mount,
    async (enabledActions) => {
      if (!_currentGeojson || !enabledActions.length) { hideCustomResult(); return }
      try {
        showCustomResultLoading()
        const result = await simulateActions(_currentGeojson, enabledActions, 'monthly', _currentStationId, _currentCalibration)
        showCustomResult(result)
      } catch (err) {
        hideCustomResult()
        console.error('Action simulation error:', err)
      }
    },
    (name, result, actions) => {
      addSavedScenario(name, result, actions, compareMount, _baselineMonthly)
    },
  )
}

function _renderComparePanel() {
  const mount = document.getElementById('compare-panel-mount')
  if (!mount) return
  mountComparePanel(mount)
}

// ── DPE ───────────────────────────────────────────────────────────────────────

export function _renderDPE(a) {
  const badge = document.getElementById('dpe-badge')
  if (!badge) return
  const cls = a.dpe_class || '?'
  badge.textContent = cls
  badge.style.background = DPE_COLORS[cls] || '#888'

  const ep = a.primary_energy_kwh_m2?.toFixed(0) ?? '—'
  document.getElementById('dpe-ep').innerHTML = `${ep} <span>kWh EP/m²/an</span>`
  document.getElementById('dpe-co2').textContent = `CO₂ : ${(a.co2_kg_m2?.toFixed(1) ?? '—')} kg/m²/an`

  // Cooling label
  const coolWrap  = document.getElementById('dpe-cooling-wrap')
  const coolBadge = document.getElementById('dpe-cooling-badge')
  const coolKpi   = document.getElementById('dpe-cooling-kpi')
  const cc = a.dpe_cooling_class || '—'
  const hasCooling = cc !== '—' && (a.cooling_need_kwh_m2 ?? 0) > 0
  if (coolWrap) coolWrap.style.display = hasCooling ? 'flex' : 'none'
  if (coolBadge) {
    coolBadge.textContent = cc
    coolBadge.style.background = hasCooling ? (DPE_COLORS[cc] || '#888') : '#444'
  }
  if (coolKpi) {
    coolKpi.textContent = `Froid : ${(a.cooling_need_kwh_m2 ?? 0).toFixed(1)} kWh/m²/an`
  }
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export function _renderKPIs(a) {
  const container = document.getElementById('key-figures')
  if (!container) return
  const kpis = [
    { label: 'Chauffage',       value: _fmt(a.heating_need_kwh / 1000, 1), unit: 'MWh/an' },
    { label: 'Refroidissement', value: _fmt((a.cooling_need_kwh || 0) / 1000, 1), unit: 'MWh/an' },
    { label: 'Facture est.',    value: _fmt(a.cost_eur, 0),                unit: '€/an' },
    { label: 'Surface',         value: _fmt(a.total_floor_area_m2, 0),     unit: 'm²' },
    { label: 'CO₂ total',       value: _fmt((a.co2_kg_m2 || 0) * (a.total_floor_area_m2 || 1) / 1000, 1), unit: 't CO₂/an' },
  ]
  container.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value} <span class="kpi-unit">${k.unit}</span></div>
    </div>`).join('')
}

// ── Renovation ────────────────────────────────────────────────────────────────

function _renderRenovation(reno) {
  const container = document.getElementById('renovation-cards')
  if (!container) return
  if (!reno?.scenarios?.length) {
    container.innerHTML = '<p class="hint">Aucun scénario disponible.</p>'
    return
  }

  // Draw monthly comparison charts
  _renderRenoMonthlyChart(reno.scenarios)
  _renderRenoCoolingChart(reno.scenarios)

  container.innerHTML = reno.scenarios.map((s, idx) => {
    const before   = s.baseline_dpe || s.dpe_before || '?'
    const after    = s.after_dpe    || s.dpe_after  || '?'
    const savings  = _fmt(s.cost_savings_eur_per_year, 0)
    const invest   = _fmt(s.investment_center_eur || s.investment_max_eur, 0)
    const roi      = s.simple_payback_years > 99 ? '>99' : _fmt(s.simple_payback_years, 0)
    const subtitle = SCENARIO_SUBTITLES[s.scenario_id] || ''
    const color    = SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length]
    const actionsHTML = _renderScenarioActions(s.scenario?.actions || s.actions || [])

    const heatPct   = s.heating_need_reduction_pct ?? s.heating_reduction_pct
    const epBefore  = s.primary_energy_before_kwh_m2
    const epAfter   = s.primary_energy_after_kwh_m2
    const heatBefore = s.heating_need_before_kwh
    const heatAfter  = s.heating_need_after_kwh
    const heatReductionHTML = heatPct != null ? `
      <div class="reno-heat-reduction">
        <span class="reno-heat-bar-wrap">
          <span class="reno-heat-bar" style="width:${Math.max(0, 100 - heatPct)}%"></span>
        </span>
        <span class="reno-heat-pct">−${_fmt(heatPct, 1)} % chauffage</span>
        <span class="reno-heat-kwh">${_fmt(heatBefore / 1000, 1)} → ${_fmt(heatAfter / 1000, 1)} MWh/an</span>
      </div>` : ''
    const epHTML = (epBefore != null && epAfter != null) ? `
      <div class="reno-ep-line">
        EP : <strong>${_fmt(epBefore, 0)}</strong> → <strong>${_fmt(epAfter, 0)}</strong> kWh EP/m²/an
        <span class="reno-ep-note">(chauffage + ECS + froid)</span>
      </div>` : ''

    return `
      <div class="reno-card" style="--scolor:${color}">
        <div class="reno-color-bar" style="background:${color}"></div>
        <div class="reno-card-body">
          <div class="reno-card-header">
            <div class="reno-card-title">
              <span class="reno-label">${s.scenario?.label || s.scenario_label || s.scenario_id}</span>
              <span class="reno-subtitle">${subtitle || s.scenario?.description || s.scenario_description || ''}</span>
            </div>
            <div class="reno-dpe">
              <span class="dpe-chip" style="background:${DPE_COLORS[before] || '#888'}">${before}</span>
              →
              <span class="dpe-chip" style="background:${DPE_COLORS[after] || '#888'}">${after}</span>
            </div>
          </div>
          ${epHTML}
          ${heatReductionHTML}
          <div class="reno-stats">
            <div class="reno-stat"><div class="reno-stat-val">${savings} €</div><div class="reno-stat-lbl">économie/an</div></div>
            <div class="reno-stat"><div class="reno-stat-val">${invest} €</div><div class="reno-stat-lbl">investissement</div></div>
            <div class="reno-stat"><div class="reno-stat-val">${roi} ans</div><div class="reno-stat-lbl">retour</div></div>
          </div>
          ${_renderCoolingDelta(s)}
          ${actionsHTML}
        </div>
      </div>`
  }).join('')
}

function _renderRenoMonthlyChart(scenarios) {
  const wrap = document.getElementById('renovation-monthly-chart-wrap')
  const ctx  = document.getElementById('canvas-reno-monthly')
  if (!wrap || !ctx) return

  if (_renoMonthlyChart) { _renoMonthlyChart.destroy(); _renoMonthlyChart = null }

  const datasets = []

  // Baseline (reference calibrée ou baseline du premier scénario)
  const baseline = _baselineMonthly || _extractMonthlyFromScenario(scenarios[0], 'baseline')
  if (baseline) {
    datasets.push({
      label: 'Référence',
      data: baseline,
      borderColor: '#7a7f9a',
      backgroundColor: 'rgba(122,127,154,0.08)',
      borderWidth: 2.5,
      borderDash: [5, 3],
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: 10,
    })
  }

  // One line per scenario
  scenarios.forEach((s, i) => {
    const monthly = _extractMonthlyFromScenario(s, 'after')
    if (!monthly) return
    const color = SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]
    datasets.push({
      label: s.scenario?.label || s.scenario_id,
      data: monthly,
      borderColor: color,
      backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: i,
    })
  })

  if (!datasets.length) return

  _renoMonthlyChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: MONTHS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#e8eaf2', font: { size: 10 }, boxWidth: 24, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#2d3147' },
          ticks: { color: '#7a7f9a', font: { size: 10 } },
        },
        y: {
          grid: { color: '#2d3147' },
          ticks: {
            color: '#7a7f9a', font: { size: 10 },
            callback: v => `${v.toLocaleString('fr-FR')} kWh`,
          },
          title: { display: true, text: 'Besoins chauffage (kWh)', color: '#7a7f9a', font: { size: 10 } },
        },
      },
    },
  })

  wrap.classList.remove('hidden')
}

function _extractCoolingMonthlyFromScenario(s, key) {
  const full = key === 'baseline'
    ? (s.baseline_full || s.before || s.baseline)
    : (s.after_full   || s.after)
  if (!full?.zones?.length) return null
  const totals = Array(12).fill(0)
  for (const z of full.zones) {
    const m = z.cooling_need_monthly
    if (m?.length === 12) m.forEach((v, i) => { totals[i] += v })
  }
  return totals.some(v => v > 0) ? totals : null
}

function _renderRenoCoolingChart(scenarios) {
  const wrap = document.getElementById('renovation-cooling-chart-wrap')
  const ctx  = document.getElementById('canvas-reno-cooling')
  if (!wrap || !ctx) return

  if (_renoCoolingChart) { _renoCoolingChart.destroy(); _renoCoolingChart = null }

  const datasets = []

  const baseline = _extractCoolingMonthlyFromScenario(scenarios[0], 'baseline')
  if (baseline) {
    datasets.push({
      label: 'Référence',
      data: baseline,
      borderColor: '#7a7f9a',
      backgroundColor: 'rgba(122,127,154,0.08)',
      borderWidth: 2.5,
      borderDash: [5, 3],
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: 10,
    })
  }

  scenarios.forEach((s, i) => {
    const monthly = _extractCoolingMonthlyFromScenario(s, 'after')
    if (!monthly) return
    const color = SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]
    datasets.push({
      label: s.scenario?.label || s.scenario_id,
      data: monthly,
      borderColor: color,
      backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: i,
    })
  })

  if (!datasets.length || !datasets.some(d => d.label !== 'Référence')) {
    wrap.classList.add('hidden')
    return
  }

  _renoCoolingChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: MONTHS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#e8eaf2', font: { size: 10 }, boxWidth: 24, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', font: { size: 10 } } },
        y: {
          grid: { color: '#2d3147' },
          ticks: { color: '#7a7f9a', font: { size: 10 }, callback: v => `${v.toLocaleString('fr-FR')} kWh` },
          title: { display: true, text: 'Besoins refroidissement (kWh)', color: '#7a7f9a', font: { size: 10 } },
        },
      },
    },
  })

  wrap.classList.remove('hidden')
}

// ── Scenario actions list ─────────────────────────────────────────────────────

function _renderCoolingDelta(s) {
  // Use direct fields if available (new API), fallback to nested dicts
  const coolBefore = s.cooling_need_before_kwh ?? (s.baseline_full || s.before || s.baseline)?.cooling_need_kwh ?? 0
  const coolAfter  = s.cooling_need_after_kwh  ?? (s.after_full   || s.after)?.cooling_need_kwh ?? 0
  if (coolBefore <= 0 && coolAfter <= 0) return ''

  const delta      = coolAfter - coolBefore
  const sign       = delta > 0 ? '+' : ''
  const deltaColor = delta <= 0 ? '#10b981' : '#f59e0b'

  const dpeBefore = s.dpe_cooling_before || '—'
  const dpeAfter  = s.dpe_cooling_after  || '—'
  const sysBefore = s.cooling_system_before ? `<span style="color:var(--text-muted);font-size:0.8rem">${_coolSysLabel(s.cooling_system_before)}</span>` : ''
  const sysAfter  = s.cooling_system_after  ? `<span style="color:var(--text-muted);font-size:0.8rem"> → ${_coolSysLabel(s.cooling_system_after)}</span>` : ''
  const costSav   = s.cooling_cost_savings_eur > 0 ? `<span style="color:#10b981;font-size:0.8rem">−${_fmt(s.cooling_cost_savings_eur, 0)} €/an</span>` : ''

  const dpeChipBefore = dpeBefore !== '—' ? `<span class="dpe-chip" style="background:${DPE_COLORS[dpeBefore]||'#888'};font-size:0.75rem;padding:1px 5px">${dpeBefore}</span>` : ''
  const dpeChipAfter  = dpeAfter  !== '—' ? `<span class="dpe-chip" style="background:${DPE_COLORS[dpeAfter] ||'#888'};font-size:0.75rem;padding:1px 5px">${dpeAfter}</span>`  : ''

  return `
    <div class="reno-cooling-delta">
      <span class="reno-cooling-icon">❄️</span>
      <span style="display:flex;flex-direction:column;gap:2px;flex:1">
        <span>Froid : ${_fmt(coolBefore / 1000, 1)} → ${_fmt(coolAfter / 1000, 1)} MWh/an
          <span style="color:${deltaColor};font-weight:600">(${sign}${_fmt(delta / 1000, 1)} MWh)</span>
        </span>
        <span style="display:flex;gap:6px;align-items:center">
          ${dpeChipBefore}${dpeChipBefore && dpeChipAfter ? '→' : ''}${dpeChipAfter}
          ${sysBefore}${sysAfter}
          ${costSav}
        </span>
      </span>
    </div>`
}

function _coolSysLabel(type) {
  return { split_ac: 'Split AC', multisplit: 'Multisplit', reversible_hp: 'PAC réversible', district_cooling: 'Réseau froid' }[type] || type
}

function _renderScenarioActions(actions) {
  if (!actions?.length) return ''
  const items = actions.map(a => {
    const icon  = _actionIcon(a.action_id || '')
    const label = a.label || a.action_id || ''
    const desc  = a.description || ''
    return `
      <div class="reno-action-item">
        <span class="reno-action-icon">${icon}</span>
        <div class="reno-action-text">
          <div class="reno-action-label">${label}</div>
          ${desc ? `<div class="reno-action-desc">${desc}</div>` : ''}
        </div>
      </div>`
  }).join('')
  return `<div class="reno-actions"><div class="reno-actions-title">Actions incluses</div>${items}</div>`
}

function _actionIcon(id = '') {
  if (id.includes('roof'))    return '🏠'
  if (id.includes('wall') || id.includes('ite')) return '🧱'
  if (id.includes('floor'))   return '⬇️'
  if (id.includes('window') || id.includes('vitrage')) return '🪟'
  if (id.includes('mvhr') || id.includes('vmc'))       return '💨'
  if (id.includes('pac') || id.includes('heating'))    return '♻️'
  if (id.includes('bridge') || id.includes('pont'))    return '🔗'
  if (id.includes('solar'))   return '☀️'
  if (id.includes('air') || id.includes('etanch'))     return '🔒'
  return '⚙️'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extractMonthly(result) {
  if (!result) return null
  // API returns "zones" (not "zone_results")
  const zones = result.zones || result.zone_results || []
  if (zones.length) {
    const monthly = new Array(12).fill(0)
    zones.forEach(z => {
      if (z.heating_need_monthly?.length === 12)
        z.heating_need_monthly.forEach((v, i) => { monthly[i] += (v || 0) })
    })
    if (monthly.some(v => v > 0)) return monthly
  }
  // Fallback: flat heating_need_monthly
  if (result.heating_need_monthly?.length === 12) return result.heating_need_monthly
  return null
}

function _extractMonthlyFromScenario(s, key) {
  // Support both alias names (baseline_full/before, after_full/after)
  const full = s[`${key}_full`]
    || (key === 'baseline' ? (s.baseline || s.before) : (s.after_full || s.after))
  return _extractMonthly(full)
}

function _fmt(val, decimals) {
  if (val == null || isNaN(val)) return '—'
  return val.toLocaleString('fr-FR', { maximumFractionDigits: decimals })
}
