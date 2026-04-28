/**
 * Calibration panel — fine-tunes simulation parameters against real consumption.
 *
 * Layout per param: [☑ Label — value] on first line, slider full-width below.
 * Auto-runs POST /calibration/simulate (600 ms debounce after changes, immediate on mount).
 * Comparison chart: simulated (blue) vs real (orange) monthly bars.
 * "Valider" button triggers onValidate callback → parent reveals renovation section.
 */

import { simulateCalibration } from './api.js'
import {
  Chart, BarController,
  BarElement, CategoryScale, LinearScale,
  Tooltip, Legend,
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ── Param definitions ─────────────────────────────────────────────────────────

const PARAMS = [
  { key: 'u_walls',             label: 'Murs',             unit: 'W/m²K', min: 0.1,  max: 5.0,  step: 0.05, section: 'Enveloppe' },
  { key: 'u_roof',              label: 'Toiture',          unit: 'W/m²K', min: 0.1,  max: 4.0,  step: 0.05, section: 'Enveloppe' },
  { key: 'u_floor',             label: 'Plancher bas',     unit: 'W/m²K', min: 0.1,  max: 4.0,  step: 0.05, section: 'Enveloppe' },
  { key: 'u_windows',           label: 'Fenêtres',         unit: 'W/m²K', min: 0.5,  max: 7.0,  step: 0.1,  section: 'Enveloppe' },
  { key: 'wwr_override',        label: 'Taux vitrage',     unit: '%',     min: 5,    max: 80,   step: 1,    section: 'Enveloppe', scale: 0.01 },
  { key: 'infiltration_ach',    label: 'Infiltration',     unit: 'vol/h', min: 0.05, max: 3.0,  step: 0.05, section: 'Ventilation' },
  { key: 'ventilation_ach',     label: 'VMC',              unit: 'vol/h', min: 0.0,  max: 2.0,  step: 0.05, section: 'Ventilation' },
  { key: 't_heating',           label: 'Consigne chauffe', unit: '°C',    min: 15,   max: 23,   step: 0.5,  section: 'Thermique' },
  { key: 't_cooling',           label: 'Consigne froid',   unit: '°C',    min: 22,   max: 30,   step: 0.5,  section: 'Thermique' },
  { key: 'internal_gains_w_m2', label: 'Apports internes', unit: 'W/m²', min: 0,    max: 20,   step: 0.5,  section: 'Thermique' },
  { key: 'altitude_m',          label: 'Altitude',         unit: 'm',     min: 0,    max: 3000, step: 10,   section: 'Localisation' },
]

const DEFAULTS = {
  u_walls: 1.5, u_roof: 0.5, u_floor: 1.0, u_windows: 2.5,
  wwr_override: 0.20, infiltration_ach: 0.5, ventilation_ach: 0.5,
  t_heating: 19.0, t_cooling: 26.0, internal_gains_w_m2: 5.0, altitude_m: 100,
}

// ── Module state ──────────────────────────────────────────────────────────────

let _geojson = null
let _stationId = null
let _hasCooling = false
let _values = {}
let _enabled = {}
let _realMode = 'none'
let _annualKwh = ''
let _monthlyKwh = new Array(12).fill('')
let _realCoolMode = 'none'
let _annualCoolKwh = ''
let _monthlyCoolKwh = new Array(12).fill('')
let _chartInstance = null
let _chartCoolInstance = null
let _debounceTimer = null
let _onResultCallback = null
let _onValidateCallback = null
let _lastResult = null   // dernier résultat simulé — référence exacte pour la rénovation
let _paramsInitialized = false  // sliders initialized from effective_params once

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount calibration panel.
 * @param {HTMLElement} container
 * @param {object} geojson
 * @param {(result: object) => void} onResult  — called after each simulation
 * @param {() => void} onValidate              — called when user clicks "Valider"
 */
export function mountCalibrationPanel(container, geojson, stationId, onResult, onValidate, savedCalibration = null) {
  _geojson = geojson
  _stationId = stationId
  _onResultCallback = onResult
  _onValidateCallback = onValidate
  _lastResult = null

  // Check if any zone has cooling enabled
  _hasCooling = (geojson?.features || []).some(f => f.properties?.has_cooling === true)

  // Seed initial slider values from zone properties (step 1 form)
  const seedDefaults = _seedFromGeojson(geojson)
  PARAMS.forEach(p => {
    _enabled[p.key] = false
    _values[p.key] = seedDefaults[p.key] ?? DEFAULTS[p.key] ?? (p.min + p.max) / 2
  })
  _realMode = 'none'
  _annualKwh = ''
  _monthlyKwh = new Array(12).fill('')
  _realCoolMode = 'none'
  _annualCoolKwh = ''
  _monthlyCoolKwh = new Array(12).fill('')

  // Pre-fill from saved calibration overrides if available
  const savedOverrides = savedCalibration?.['*'] || {}
  const hasSaved = Object.keys(savedOverrides).length > 0
  if (hasSaved) {
    for (const [key, val] of Object.entries(savedOverrides)) {
      if (key in _values) {
        _values[key] = val
        _enabled[key] = true
      }
    }
    _paramsInitialized = true   // skip auto-init so saved values are not overwritten
  } else {
    _paramsInitialized = false
  }

  container.innerHTML = _buildHTML()
  _bindEvents(container)

  // Run simulation immediately to show initial chart
  _runSimulate()
}

// ── Seed defaults from zone GeoJSON ──────────────────────────────────────────

function _seedFromGeojson(geojson) {
  const f = geojson?.features?.[0]
  if (!f) return {}
  const p = f.properties || {}
  const env = p.envelope || {}

  // Compute effective U-value from layers or override
  const uVal = (part) => {
    if (!part) return null
    if (part.u_override != null) return part.u_override
    // Simple sum of R-values → U (very rough, calibration will refine)
    const layers = part.layers || []
    if (!layers.length) return null
    const R = layers.reduce((acc, l) => {
      const conductivity = { brick_hollow: 0.6, concrete_dense: 1.8, mineral_wool: 0.04, eps_insulation: 0.036 }[l.material_id] || 0.5
      return acc + (l.thickness_m || 0) / conductivity
    }, 0.17) // surface resistance
    return R > 0 ? Math.round((1 / R) * 100) / 100 : null
  }

  return {
    t_heating:           p.heating_setpoint_c    ?? 19.0,
    t_cooling:           p.cooling_setpoint_c    ?? 26.0,
    infiltration_ach:    p.infiltration_ach       ?? 0.5,
    ventilation_ach:     p.ventilation_ach        ?? 0.5,
    internal_gains_w_m2: p.internal_gains_w_m2   ?? 5.0,
    u_walls:   uVal(env.walls)       ?? DEFAULTS.u_walls,
    u_roof:    uVal(env.roof)        ?? DEFAULTS.u_roof,
    u_floor:   uVal(env.ground_floor) ?? DEFAULTS.u_floor,
    u_windows: env.windows?.u_value_w_m2k ?? DEFAULTS.u_windows,
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function _buildHTML() {
  const sections = [...new Set(PARAMS.map(p => p.section))]

  const sectionHTML = sections.map(sec => {
    const rows = PARAMS.filter(p => p.section === sec).map(p => {
      const displayVal = _displayVal(p)
      const isDisabled = !_enabled[p.key]
      return `
        <div class="cal-row${isDisabled ? ' cal-row--off' : ''}" data-key="${p.key}">
          <div class="cal-row-top">
            <label class="cal-label">
              <input type="checkbox" class="cal-check" data-key="${p.key}"${isDisabled ? '' : ' checked'}>
              ${p.label}
            </label>
            <span class="cal-val" data-key="${p.key}">${displayVal} ${p.unit}</span>
          </div>
          <input type="range" class="cal-slider" data-key="${p.key}"
            min="${p.min}"
            max="${p.max}"
            step="${p.step}"
            value="${_displayVal(p)}"
            ${isDisabled ? 'disabled' : ''}>
        </div>`
    }).join('')
    return `<div class="cal-section"><div class="cal-section-title">${sec}</div>${rows}</div>`
  }).join('')

  const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const monthInputs = MONTH_NAMES.map((name, i) => `
    <div class="month-cell">
      <div class="month-label">${name}</div>
      <input type="number" class="month-input" data-idx="${i}" value="${_monthlyKwh[i]}" placeholder="—" min="0" step="10">
    </div>`).join('')
  const coolMonthInputs = MONTH_NAMES.map((name, i) => `
    <div class="month-cell">
      <div class="month-label">${name}</div>
      <input type="number" class="month-cool-input" data-idx="${i}" value="${_monthlyCoolKwh[i]}" placeholder="—" min="0" step="10">
    </div>`).join('')

  const coolingSectionHTML = _hasCooling ? `
      <div class="cal-real-block" id="cal-cool-real-block">
        <div class="cal-real-header">
          <span class="cal-section-title">❄️ Conso. réelle refroidissement (optionnel)</span>
          <div class="cal-real-toggle">
            <button class="cal-real-btn cal-cool-btn${_realCoolMode === 'none'    ? ' active' : ''}" data-mode="none">Aucune</button>
            <button class="cal-real-btn cal-cool-btn${_realCoolMode === 'annual'  ? ' active' : ''}" data-mode="annual">Annuelle</button>
            <button class="cal-real-btn cal-cool-btn${_realCoolMode === 'monthly' ? ' active' : ''}" data-mode="monthly">Mensuelle</button>
          </div>
        </div>
        <div id="cal-cool-real-annual" class="${_realCoolMode === 'annual' ? '' : 'hidden'}">
          <div class="cal-real-input-row">
            <label>Total annuel froid</label>
            <div class="cal-real-input-wrap">
              <input type="number" id="cal-cool-annual-input" class="cal-number-input"
                value="${_annualCoolKwh}" placeholder="ex : 3 000" min="0" step="100">
              <span class="cal-unit-label">kWh/an</span>
            </div>
          </div>
        </div>
        <div id="cal-cool-real-monthly" class="${_realCoolMode === 'monthly' ? '' : 'hidden'}">
          <div class="month-grid">${coolMonthInputs}</div>
        </div>
      </div>` : ''

  return `
    <div class="cal-panel">

      <div class="cal-real-block">
        <div class="cal-real-header">
          <span class="cal-section-title">🔥 Conso. réelle chauffage (optionnel)</span>
          <div class="cal-real-toggle">
            <button class="cal-real-btn${_realMode === 'none'    ? ' active' : ''}" data-mode="none">Aucune</button>
            <button class="cal-real-btn${_realMode === 'annual'  ? ' active' : ''}" data-mode="annual">Annuelle</button>
            <button class="cal-real-btn${_realMode === 'monthly' ? ' active' : ''}" data-mode="monthly">Mensuelle</button>
          </div>
        </div>
        <div id="cal-real-annual" class="${_realMode === 'annual' ? '' : 'hidden'}">
          <div class="cal-real-input-row">
            <label>Total annuel</label>
            <div class="cal-real-input-wrap">
              <input type="number" id="cal-annual-input" class="cal-number-input"
                value="${_annualKwh}" placeholder="ex : 12 000" min="0" step="100">
              <span class="cal-unit-label">kWh/an</span>
            </div>
          </div>
        </div>
        <div id="cal-real-monthly" class="${_realMode === 'monthly' ? '' : 'hidden'}">
          <div class="month-grid">${monthInputs}</div>
        </div>
      </div>

      ${coolingSectionHTML}

      ${sectionHTML}

      <div id="cal-status"></div>

      <div id="cal-chart-wrap" class="cal-chart-wrap hidden">
        <div class="chart-label">Besoins chauffage simulés vs réels (kWh/mois)</div>
        <canvas id="canvas-calibration"></canvas>
        <div id="cal-rmse"></div>
      </div>

      ${_hasCooling ? `
      <div id="cal-cool-chart-wrap" class="cal-chart-wrap hidden">
        <div class="chart-label">Besoins refroidissement simulés vs réels (kWh/mois)</div>
        <canvas id="canvas-calibration-cooling"></canvas>
      </div>` : ''}

      <button id="btn-validate-cal" class="primary-btn full-width" style="margin-top:8px">
        Valider la calibration →
      </button>

    </div>`
}

// ── Events ────────────────────────────────────────────────────────────────────

function _bindEvents(container) {
  // Checkboxes
  container.querySelectorAll('.cal-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key
      _enabled[key] = cb.checked
      const row = container.querySelector(`.cal-row[data-key="${key}"]`)
      if (row) row.classList.toggle('cal-row--off', !cb.checked)
      const slider = container.querySelector(`.cal-slider[data-key="${key}"]`)
      if (slider) slider.disabled = !cb.checked
      _scheduleSimulate()
    })
  })

  // Sliders
  container.querySelectorAll('.cal-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const key = sl.dataset.key
      const p = PARAMS.find(q => q.key === key)
      const raw = parseFloat(sl.value)
      _values[key] = p.scale ? raw * p.scale : raw
      const valEl = container.querySelector(`.cal-val[data-key="${key}"]`)
      if (valEl) valEl.textContent = `${raw} ${p.unit}`
      _scheduleSimulate()
    })
  })

  // Real mode toggle
  container.querySelectorAll('.cal-real-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _realMode = btn.dataset.mode
      container.querySelectorAll('.cal-real-btn').forEach(b => b.classList.toggle('active', b === btn))
      container.querySelector('#cal-real-annual').classList.toggle('hidden', _realMode !== 'annual')
      container.querySelector('#cal-real-monthly').classList.toggle('hidden', _realMode !== 'monthly')
      _scheduleSimulate()
    })
  })

  // Annual input
  const annualInput = container.querySelector('#cal-annual-input')
  if (annualInput) annualInput.addEventListener('input', () => { _annualKwh = annualInput.value; _scheduleSimulate() })

  // Monthly inputs
  container.querySelectorAll('.month-input').forEach(inp => {
    inp.addEventListener('input', () => { _monthlyKwh[parseInt(inp.dataset.idx)] = inp.value; _scheduleSimulate() })
  })

  // Cooling real mode toggle
  container.querySelectorAll('.cal-cool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _realCoolMode = btn.dataset.mode
      container.querySelectorAll('.cal-cool-btn').forEach(b => b.classList.toggle('active', b === btn))
      container.querySelector('#cal-cool-real-annual')?.classList.toggle('hidden', _realCoolMode !== 'annual')
      container.querySelector('#cal-cool-real-monthly')?.classList.toggle('hidden', _realCoolMode !== 'monthly')
      _scheduleSimulate()
    })
  })

  // Cooling annual input
  const coolAnnualInput = container.querySelector('#cal-cool-annual-input')
  if (coolAnnualInput) coolAnnualInput.addEventListener('input', () => { _annualCoolKwh = coolAnnualInput.value; _scheduleSimulate() })

  // Cooling monthly inputs
  container.querySelectorAll('.month-cool-input').forEach(inp => {
    inp.addEventListener('input', () => { _monthlyCoolKwh[parseInt(inp.dataset.idx)] = inp.value; _scheduleSimulate() })
  })

  // Validate button
  const btnValidate = container.querySelector('#btn-validate-cal')
  if (btnValidate) btnValidate.addEventListener('click', () => {
    if (_onValidateCallback) {
      const overrides = {}
      PARAMS.forEach(p => { if (_enabled[p.key]) overrides[p.key] = _values[p.key] })
      const calibration = Object.keys(overrides).length ? { '*': overrides } : {}
      _onValidateCallback(_lastResult, calibration)
    }
  })
}

// ── Simulation ────────────────────────────────────────────────────────────────

function _scheduleSimulate() {
  clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(_runSimulate, 600)
}

async function _runSimulate() {
  if (!_geojson) return

  const overrides = {}
  PARAMS.forEach(p => { if (_enabled[p.key]) overrides[p.key] = _values[p.key] })
  const calibration = Object.keys(overrides).length ? { '*': overrides } : {}

  const realConsumption = _buildRealConsumption()

  _setStatus('loading', 'Calcul en cours…')

  const realCoolingConsumption = _buildRealCoolingConsumption()

  try {
    const result = await simulateCalibration(_geojson, calibration, realConsumption, _stationId, realCoolingConsumption)
    _lastResult = result
    _setStatus('ok', '')

    // On first result, initialize slider values from actual simulation params
    // then re-run immediately so overrides match the shown values exactly
    if (!_paramsInitialized && result.effective_params) {
      _initSlidersFromEffectiveParams(result.effective_params)
      _paramsInitialized = true
      // Re-run with the now-enabled overrides (values are identical → same result visually,
      // but ensures subsequent slider changes take effect from a consistent baseline)
      _runSimulate()
      return
    }

    _renderChart(result)
    if (_hasCooling) _renderCoolingChart(result)
    if (_onResultCallback) _onResultCallback(result)
  } catch (err) {
    console.error('Calibration error:', err)
    _setStatus('error', `Erreur : ${err.message}`)
  }
}

function _initSlidersFromEffectiveParams(ep) {
  // Map API effective_params keys to PARAMS keys, update _values + enable sliders
  const mapping = {
    u_walls: 'u_walls', u_roof: 'u_roof', u_floor: 'u_floor',
    u_windows: 'u_windows', wwr_override: 'wwr_override',
    infiltration_ach: 'infiltration_ach', ventilation_ach: 'ventilation_ach',
    t_heating: 't_heating', t_cooling: 't_cooling',
    internal_gains_w_m2: 'internal_gains_w_m2',
  }
  for (const [epKey, pKey] of Object.entries(mapping)) {
    if (ep[epKey] == null) continue
    // Skip t_cooling sentinel (99 = no cooling) — keep slider default
    if (pKey === 't_cooling' && ep[epKey] > 35) continue
    const p = PARAMS.find(q => q.key === pKey)
    if (!p) continue

    _values[pKey] = ep[epKey]
    _enabled[pKey] = true   // enable so sliders respond to user changes

    const rawVal = p.scale ? Math.round(ep[epKey] / p.scale) : ep[epKey]
    const clamped = Math.min(p.max, Math.max(p.min, rawVal))

    // Update slider value and enable it
    const slider = document.querySelector(`.cal-slider[data-key="${pKey}"]`)
    if (slider) { slider.value = clamped; slider.disabled = false }

    // Update displayed value
    const valEl = document.querySelector(`.cal-val[data-key="${pKey}"]`)
    if (valEl) valEl.textContent = `${clamped} ${p.unit}`

    // Check the checkbox and remove the dimmed class
    const cb = document.querySelector(`.cal-check[data-key="${pKey}"]`)
    if (cb) cb.checked = true
    const row = document.querySelector(`.cal-row[data-key="${pKey}"]`)
    if (row) row.classList.remove('cal-row--off')
  }
}

function _setStatus(type, msg) {
  const el = document.getElementById('cal-status')
  if (!el) return
  if (type === 'loading') {
    el.innerHTML = '<span class="cal-status-loading"><span class="loader"></span> Calcul en cours…</span>'
  } else if (type === 'error') {
    el.innerHTML = `<span class="cal-status-error">⚠ ${msg}</span>`
  } else {
    el.innerHTML = ''
  }
}

function _buildRealConsumption() {
  if (_realMode === 'annual' && _annualKwh) return { annual_kwh: parseFloat(_annualKwh) }
  if (_realMode === 'monthly') {
    const vals = _monthlyKwh.map(v => parseFloat(v) || 0)
    if (vals.some(v => v > 0)) return { monthly_kwh: vals }
  }
  return null
}

function _buildRealCoolingConsumption() {
  if (_realCoolMode === 'annual' && _annualCoolKwh) return { annual_kwh: parseFloat(_annualCoolKwh) }
  if (_realCoolMode === 'monthly') {
    const vals = _monthlyCoolKwh.map(v => parseFloat(v) || 0)
    if (vals.some(v => v > 0)) return { monthly_kwh: vals }
  }
  return null
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _renderChart(result) {
  const wrap = document.getElementById('cal-chart-wrap')
  if (!wrap) return
  wrap.classList.remove('hidden')

  const simulated = result.simulated_monthly_kwh || []
  const real = result.real_monthly_kwh || null
  const months = result.months || ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null }

  const datasets = [{
    label: 'Simulé (kWh)',
    data: simulated,
    backgroundColor: 'rgba(79,128,255,0.75)',
    borderRadius: 3,
  }]
  if (real) datasets.push({
    label: 'Réel (kWh)',
    data: real,
    backgroundColor: 'rgba(245,158,11,0.65)',
    borderRadius: 3,
  })

  const ctx = document.getElementById('canvas-calibration')
  if (!ctx) return

  _chartInstance = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: false,
      plugins: {
        legend: { display: true, labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', maxRotation: 0, font: { size: 9 } } },
        y: {
          grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', font: { size: 9 } },
          title: { display: true, text: 'kWh', color: '#7a7f9a', font: { size: 9 } },
        },
      },
    },
  })

  const rmseEl = document.getElementById('cal-rmse')
  if (rmseEl) {
    rmseEl.textContent = result.rmse_kwh != null ? `RMSE : ${result.rmse_kwh} kWh/mois` : ''
  }
}

// ── Cooling Chart ─────────────────────────────────────────────────────────────

function _renderCoolingChart(result) {
  const wrap = document.getElementById('cal-cool-chart-wrap')
  if (!wrap) return

  const simulated = result.simulated_cooling_monthly_kwh || []
  if (!simulated.some(v => v > 0)) { wrap.classList.add('hidden'); return }
  wrap.classList.remove('hidden')

  const real = result.real_cooling_monthly_kwh || null
  const months = result.months || ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  if (_chartCoolInstance) { _chartCoolInstance.destroy(); _chartCoolInstance = null }

  const datasets = [{
    label: 'Simulé froid (kWh)',
    data: simulated,
    backgroundColor: 'rgba(16,185,129,0.7)',
    borderRadius: 3,
  }]
  if (real) datasets.push({
    label: 'Réel froid (kWh)',
    data: real,
    backgroundColor: 'rgba(245,158,11,0.65)',
    borderRadius: 3,
  })

  const ctx = document.getElementById('canvas-calibration-cooling')
  if (!ctx) return

  _chartCoolInstance = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: false,
      plugins: {
        legend: { display: true, labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', maxRotation: 0, font: { size: 9 } } },
        y: {
          grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', font: { size: 9 } },
          title: { display: true, text: 'kWh', color: '#7a7f9a', font: { size: 9 } },
        },
      },
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _displayVal(p) {
  const v = _values[p.key]
  return p.scale ? Math.round(v / p.scale) : v
}
