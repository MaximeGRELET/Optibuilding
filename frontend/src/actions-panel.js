/**
 * Actions panel — interactive renovation action selector.
 *
 * Renders a list of toggle-able action cards with expandable param controls.
 * Calls onSimulate(enabledActions) with debounce whenever state changes.
 */

import { ACTIONS_CATALOG, defaultParams } from './actions-catalog.js'

const DEBOUNCE_MS = 600

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {Map<string, { enabled: boolean, params: object, open: boolean }>} */
const state = new Map(
  ACTIONS_CATALOG.map(a => [a.id, { enabled: false, params: defaultParams(a), open: false }])
)

let _onSimulate = null
let _debounceTimer = null

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount the actions panel into `container`.
 * @param {HTMLElement} container
 * @param {(actions: object[]) => void} onSimulate  called with enabled actions list
 */
export function mountActionsPanel(container, onSimulate) {
  _onSimulate = onSimulate
  container.innerHTML = renderPanel()
  _bindEvents(container)
}

/** Returns the current list of enabled actions ready to send to the API. */
export function getEnabledActions() {
  return ACTIONS_CATALOG
    .filter(a => state.get(a.id).enabled)
    .map(a => ({ action_id: a.id, params: { ...state.get(a.id).params } }))
}

export function hasEnabledActions() {
  return ACTIONS_CATALOG.some(a => state.get(a.id).enabled)
}

/** Show/hide the custom result in the panel. */
export function showCustomResult(result) {
  const el = document.getElementById('custom-result')
  if (!el) return
  el.classList.remove('hidden')

  const DPE_COLORS = {
    A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
    D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
  }

  const before   = result.baseline_dpe || '?'
  const after    = result.after_dpe    || '?'
  const savings  = _fmt(result.cost_savings_eur_per_year, 0)
  const invest   = _fmt(result.investment_center_eur ?? result.investment_max_eur, 0)
  const roi      = result.simple_payback_years > 99 ? '>99' : _fmt(result.simple_payback_years, 0)
  const epBefore = _fmt(result.baseline_full?.primary_energy_kwh_m2, 0)
  const epAfter  = _fmt(result.after_full?.primary_energy_kwh_m2, 0)
  const reduction = result.heating_need_reduction_pct != null
    ? `−${_fmt(result.heating_need_reduction_pct, 0)} %` : '—'

  el.innerHTML = `
    <div class="custom-result-header">
      <span class="custom-result-title">Résultat de votre sélection</span>
      <div class="reno-dpe">
        <span class="dpe-chip" style="background:${DPE_COLORS[before]||'#888'}">${before}</span>
        →
        <span class="dpe-chip" style="background:${DPE_COLORS[after]||'#888'}">${after}</span>
      </div>
    </div>
    <div class="custom-result-stats">
      <div class="crs-item">
        <div class="crs-val">${epBefore} → ${epAfter}</div>
        <div class="crs-lbl">kWh EP/m²/an</div>
      </div>
      <div class="crs-item">
        <div class="crs-val">${reduction}</div>
        <div class="crs-lbl">besoins chauffage</div>
      </div>
      <div class="crs-item">
        <div class="crs-val">${savings} €</div>
        <div class="crs-lbl">économie/an</div>
      </div>
      <div class="crs-item">
        <div class="crs-val">${invest} €</div>
        <div class="crs-lbl">investissement</div>
      </div>
      <div class="crs-item">
        <div class="crs-val">${roi} ans</div>
        <div class="crs-lbl">retour</div>
      </div>
    </div>
  `
}

export function showCustomResultLoading() {
  const el = document.getElementById('custom-result')
  if (el) {
    el.classList.remove('hidden')
    el.innerHTML = `<div class="custom-result-loading"><span class="loader"></span> Simulation en cours…</div>`
  }
}

export function hideCustomResult() {
  const el = document.getElementById('custom-result')
  if (el) el.classList.add('hidden')
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPanel() {
  return `
    <div id="custom-result" class="hidden"></div>
    <div id="action-cards">
      ${ACTIONS_CATALOG.map(renderActionCard).join('')}
    </div>
  `
}

function renderActionCard(action) {
  const s = state.get(action.id)
  return `
    <div class="action-card ${s.enabled ? 'enabled' : ''}" data-action="${action.id}">
      <div class="action-card-header">
        <label class="action-toggle">
          <input type="checkbox" class="action-check" data-action="${action.id}" ${s.enabled ? 'checked' : ''} />
          <span class="action-toggle-track"></span>
        </label>
        <span class="action-icon">${action.icon}</span>
        <div class="action-info">
          <span class="action-label">${action.label}</span>
          <span class="action-desc">${action.description}</span>
        </div>
        <button class="action-expand ${s.open ? 'open' : ''}" data-action="${action.id}" title="Paramètres">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>
      </div>
      <div class="action-params ${s.open ? '' : 'hidden'}">
        ${action.params.map(p => renderParam(action.id, p, s.params[p.key])).join('')}
      </div>
    </div>
  `
}

function renderParam(actionId, param, value) {
  const id = `param-${actionId}-${param.key}`
  if (param.type === 'range') {
    const displayVal = param.display ? param.display(value) : value
    return `
      <div class="param-row">
        <label for="${id}">${param.label}</label>
        <div class="param-range-wrap">
          <input type="range" id="${id}" class="action-param"
            data-action="${actionId}" data-key="${param.key}"
            min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" />
          <span class="param-range-val" id="${id}-val">${displayVal}</span>
        </div>
      </div>
    `
  }
  if (param.type === 'select') {
    return `
      <div class="param-row">
        <label for="${id}">${param.label}</label>
        <select id="${id}" class="action-param"
          data-action="${actionId}" data-key="${param.key}">
          ${param.options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
    `
  }
  if (param.type === 'number') {
    return `
      <div class="param-row">
        <label for="${id}">${param.label}</label>
        <input type="number" id="${id}" class="action-param"
          data-action="${actionId}" data-key="${param.key}"
          min="${param.min ?? 0}" step="${param.step ?? 1}" value="${value}" />
      </div>
    `
  }
  return ''
}

// ── Events ────────────────────────────────────────────────────────────────────

function _bindEvents(container) {
  // Toggle checkbox
  container.addEventListener('change', e => {
    const el = e.target
    if (el.classList.contains('action-check')) {
      state.get(el.dataset.action).enabled = el.checked
      _refreshCard(container, el.dataset.action)
      _scheduleSimulate()
    }
    if (el.classList.contains('action-param')) {
      const s = state.get(el.dataset.action)
      const catalog = ACTIONS_CATALOG.find(a => a.id === el.dataset.action)
      const paramDef = catalog.params.find(p => p.key === el.dataset.key)
      const raw = el.type === 'range' || el.type === 'number' ? parseFloat(el.value) : el.value
      s.params[el.dataset.key] = raw
      // Update range display
      if (el.type === 'range' && paramDef?.display) {
        const valEl = document.getElementById(`param-${el.dataset.action}-${el.dataset.key}-val`)
        if (valEl) valEl.textContent = paramDef.display(raw)
      }
      if (s.enabled) _scheduleSimulate()
    }
  })

  // Input (range live update without triggering simulate)
  container.addEventListener('input', e => {
    const el = e.target
    if (el.classList.contains('action-param') && el.type === 'range') {
      const catalog = ACTIONS_CATALOG.find(a => a.id === el.dataset.action)
      const paramDef = catalog?.params.find(p => p.key === el.dataset.key)
      const raw = parseFloat(el.value)
      state.get(el.dataset.action).params[el.dataset.key] = raw
      if (paramDef?.display) {
        const valEl = document.getElementById(`param-${el.dataset.action}-${el.dataset.key}-val`)
        if (valEl) valEl.textContent = paramDef.display(raw)
      }
    }
  })

  // Expand/collapse params
  container.addEventListener('click', e => {
    const btn = e.target.closest('.action-expand')
    if (!btn) return
    const s = state.get(btn.dataset.action)
    s.open = !s.open
    btn.classList.toggle('open', s.open)
    const card = container.querySelector(`.action-card[data-action="${btn.dataset.action}"]`)
    card?.querySelector('.action-params')?.classList.toggle('hidden', !s.open)
  })
}

function _refreshCard(container, actionId) {
  const s = state.get(actionId)
  const card = container.querySelector(`.action-card[data-action="${actionId}"]`)
  if (card) card.classList.toggle('enabled', s.enabled)
}

function _scheduleSimulate() {
  clearTimeout(_debounceTimer)
  if (!hasEnabledActions()) { hideCustomResult(); return }
  showCustomResultLoading()
  _debounceTimer = setTimeout(() => {
    _onSimulate?.(getEnabledActions())
  }, DEBOUNCE_MS)
}

function _fmt(val, decimals) {
  if (val == null || isNaN(val)) return '—'
  return val.toLocaleString('fr-FR', { maximumFractionDigits: decimals })
}
