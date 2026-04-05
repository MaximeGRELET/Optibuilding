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
let _values = {}
let _enabled = {}
let _realMode = 'none'
let _annualKwh = ''
let _monthlyKwh = new Array(12).fill('')
let _chartInstance = null
let _debounceTimer = null
let _onResultCallback = null
let _onValidateCallback = null
let _container = null

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount calibration panel.
 * @param {HTMLElement} container
 * @param {object} geojson
 * @param {(result: object) => void} onResult  — called after each simulation
 * @param {() => void} onValidate              — called when user clicks "Valider"
 */
export function mountCalibrationPanel(container, geojson, onResult, onValidate) {
  _container = container
  _geojson = geojson
  _onResultCallback = onResult
  _onValidateCallback = onValidate

  PARAMS.forEach(p => {
    _enabled[p.key] = false
    _values[p.key] = DEFAULTS[p.key] ?? (p.min + p.max) / 2
  })
  _realMode = 'none'
  _annualKwh = ''
  _monthlyKwh = new Array(12).fill('')

  container.innerHTML = _buildHTML()
  _bindEvents(container)

  // Run baseline simulation immediately (no overrides) to show initial chart
  _runSimulate()
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
            min="${p.scale ? p.min / p.scale : p.min}"
            max="${p.scale ? p.max / p.scale : p.max}"
            step="${p.scale ? p.step / p.scale : p.step}"
            value="${p.scale ? Math.round(_values[p.key] / p.scale) : _values[p.key]}"
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

  return `
    <div class="cal-panel">

      <div class="cal-real-block">
        <div class="cal-real-header">
          <span class="cal-section-title">Conso. réelle (optionnel)</span>
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

      ${sectionHTML}

      <div id="cal-chart-wrap" class="cal-chart-wrap hidden">
        <div class="chart-label">Besoins chauffage simulés vs réels (kWh/mois)</div>
        <canvas id="canvas-calibration"></canvas>
        <div id="cal-rmse"></div>
      </div>

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

  // Validate button
  const btnValidate = container.querySelector('#btn-validate-cal')
  if (btnValidate) btnValidate.addEventListener('click', () => {
    if (_onValidateCallback) _onValidateCallback()
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

  // Show spinner inside button
  const btn = _container?.querySelector('#btn-validate-cal')
  if (btn) btn.innerHTML = '<span class="loader"></span> Calcul…'

  try {
    const result = await simulateCalibration(_geojson, calibration, realConsumption)
    _renderChart(result)
    if (_onResultCallback) _onResultCallback(result)
  } catch (err) {
    console.error('Calibration error:', err)
  } finally {
    if (btn) btn.textContent = 'Valider la calibration →'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _displayVal(p) {
  const v = _values[p.key]
  return p.scale ? Math.round(v / p.scale) : v
}
