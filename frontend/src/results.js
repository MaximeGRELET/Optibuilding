/** Render analysis + renovation results into the right panel. */

import { mountActionsPanel, showCustomResult, showCustomResultLoading, hideCustomResult } from './actions-panel.js'
import { simulateActions } from './api.js'
import { renderHourlyCharts, hideCharts } from './charts.js'
import { mountCalibrationPanel } from './calibration.js'
import { mountComparePanel, addSavedScenario } from './scenario-compare.js'

const DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}

// Icons matched on action_id prefix
function _actionIcon(actionId = '') {
  if (actionId.includes('roof'))    return '🏠'
  if (actionId.includes('wall') || actionId.includes('ite')) return '🧱'
  if (actionId.includes('floor'))   return '⬇️'
  if (actionId.includes('window') || actionId.includes('vitrage')) return '🪟'
  if (actionId.includes('mvhr') || actionId.includes('vmc'))       return '💨'
  if (actionId.includes('pac') || actionId.includes('heating') || actionId.includes('chauffe')) return '🔥'
  if (actionId.includes('bridge') || actionId.includes('pont'))    return '🔗'
  if (actionId.includes('solar'))   return '☀️'
  if (actionId.includes('air') || actionId.includes('etanch'))     return '🔒'
  return '⚙️'
}

// Scenario subtitles
const SCENARIO_SUBTITLES = {
  light:       'Amélioration rapide, faible investissement',
  intermediate:'Bon rapport coût / performance',
  bbc_retrofit:'Niveau BBC — réduction maximale',
}

let _currentGeojson = null
let _pendingRenovation = null

export function showResults(analysis, renovation, geojson) {
  _currentGeojson = geojson
  _pendingRenovation = renovation

  _renderDPE(analysis)
  _renderKPIs(analysis)

  hideCharts()
  if (analysis.t_ext_hourly) renderHourlyCharts(analysis)

  // Hide actions + renovation + compare until calibration validated
  document.getElementById('actions-section')?.classList.add('hidden')
  document.getElementById('renovation-section')?.classList.add('hidden')
  document.getElementById('compare-section')?.classList.add('hidden')

  _renderCalibrationPanel(geojson)
}

function _renderCalibrationPanel(geojson) {
  const mount = document.getElementById('calibration-panel-mount')
  if (!mount) return
  mountCalibrationPanel(
    mount, geojson,
    (result) => { _renderDPE(result); _renderKPIs(result) },
    () => {
      document.getElementById('actions-section')?.classList.remove('hidden')
      document.getElementById('renovation-section')?.classList.remove('hidden')
      document.getElementById('compare-section')?.classList.remove('hidden')
      _renderActionsPanel()
      _renderRenovation(_pendingRenovation)
      _renderComparePanel()
      document.getElementById('renovation-section')?.scrollIntoView({ behavior: 'smooth' })
      document.dispatchEvent(new CustomEvent('calibration:validated'))
    },
  )
}

function _renderActionsPanel() {
  const mount = document.getElementById('actions-panel-mount')
  if (!mount) return

  const compareMount = document.getElementById('compare-panel-mount')

  mountActionsPanel(
    mount,
    // onSimulate
    async (enabledActions) => {
      if (!_currentGeojson || !enabledActions.length) { hideCustomResult(); return }
      try {
        showCustomResultLoading()
        const result = await simulateActions(_currentGeojson, enabledActions)
        showCustomResult(result)
      } catch (err) {
        hideCustomResult()
        console.error('Action simulation error:', err)
      }
    },
    // onSave
    (name, result, actions) => {
      addSavedScenario(name, result, actions, compareMount)
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
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export function _renderKPIs(a) {
  const container = document.getElementById('key-figures')
  if (!container) return
  const kpis = [
    { label: 'Chauffage',    value: _fmt(a.heating_need_kwh / 1000, 1), unit: 'MWh/an' },
    { label: 'Facture est.', value: _fmt(a.cost_eur, 0),                unit: '€/an' },
    { label: 'Surface',      value: _fmt(a.total_floor_area_m2, 0),     unit: 'm²' },
    { label: 'CO₂ total',    value: _fmt(a.co2_kg / 1000, 1),           unit: 't CO₂/an' },
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

  container.innerHTML = reno.scenarios.map(s => {
    const before   = s.baseline_dpe || '?'
    const after    = s.after_dpe || '?'
    const savings  = _fmt(s.cost_savings_eur_per_year, 0)
    const invest   = _fmt(s.investment_center_eur || s.investment_max_eur, 0)
    const roi      = s.simple_payback_years > 99 ? '>99' : _fmt(s.simple_payback_years, 0)
    const subtitle = SCENARIO_SUBTITLES[s.scenario_id] || ''

    const actionsHTML = _renderScenarioActions(s.scenario?.actions || s.actions || [])

    return `
      <div class="reno-card">
        <div class="reno-card-header">
          <div class="reno-card-title">
            <span class="reno-label">${s.scenario?.label || s.scenario_id}</span>
            <span class="reno-subtitle">${subtitle}</span>
          </div>
          <div class="reno-dpe">
            <span class="dpe-chip" style="background:${DPE_COLORS[before] || '#888'}">${before}</span>
            →
            <span class="dpe-chip" style="background:${DPE_COLORS[after] || '#888'}">${after}</span>
          </div>
        </div>
        <div class="reno-stats">
          <div class="reno-stat"><div class="reno-stat-val">${savings} €</div><div class="reno-stat-lbl">économie/an</div></div>
          <div class="reno-stat"><div class="reno-stat-val">${invest} €</div><div class="reno-stat-lbl">investissement</div></div>
          <div class="reno-stat"><div class="reno-stat-val">${roi} ans</div><div class="reno-stat-lbl">retour</div></div>
        </div>
        ${actionsHTML}
      </div>`
  }).join('')
}

function _renderScenarioActions(actions) {
  if (!actions?.length) return ''
  const items = actions.map(a => {
    const icon  = _actionIcon(a.action_id || '')
    const label = a.label || a.action_id || type
    const desc  = _actionParamSummary(a)
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

function _actionParamSummary(a) {
  // description already contains the key params (e.g. "R≥7 m²K/W", "Uw ≤ 1.3 W/m²K")
  return a.description || ''
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmt(val, decimals) {
  if (val == null || isNaN(val)) return '—'
  return val.toLocaleString('fr-FR', { maximumFractionDigits: decimals })
}
