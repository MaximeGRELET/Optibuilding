/**
 * Calibration panel — fine-tunes simulation parameters against real consumption.
 *
 * Renders sliders for the 11 CalibrationParams fields.
 * Auto-runs POST /calibration/simulate with 600 ms debounce.
 * Comparison chart: simulated (blue) vs real (orange) monthly bars.
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
  { key: 'u_walls',              label: 'U murs',           unit: 'W/m²K', min: 0.1,  max: 5.0, step: 0.05, section: 'Enveloppe' },
  { key: 'u_roof',               label: 'U toiture',        unit: 'W/m²K', min: 0.1,  max: 4.0, step: 0.05, section: 'Enveloppe' },
  { key: 'u_floor',              label: 'U plancher bas',   unit: 'W/m²K', min: 0.1,  max: 4.0, step: 0.05, section: 'Enveloppe' },
  { key: 'u_windows',            label: 'U fenêtres',       unit: 'W/m²K', min: 0.5,  max: 7.0, step: 0.1,  section: 'Enveloppe' },
  { key: 'wwr_override',         label: 'Taux vitrage',     unit: '%',     min: 5,    max: 80,  step: 1,    section: 'Enveloppe', scale: 0.01 },
  { key: 'infiltration_ach',     label: 'Infiltration',     unit: 'vol/h', min: 0.05, max: 3.0, step: 0.05, section: 'Ventilation' },
  { key: 'ventilation_ach',      label: 'VMC',              unit: 'vol/h', min: 0.0,  max: 2.0, step: 0.05, section: 'Ventilation' },
  { key: 't_heating',            label: 'T° chauffage',     unit: '°C',    min: 15,   max: 23,  step: 0.5,  section: 'Thermique' },
  { key: 't_cooling',            label: 'T° refroidissement', unit: '°C',  min: 22,   max: 30,  step: 0.5,  section: 'Thermique' },
  { key: 'internal_gains_w_m2', label: 'Apports internes', unit: 'W/m²',  min: 0,    max: 20,  step: 0.5,  section: 'Thermique' },
  { key: 'altitude_m',           label: 'Altitude',         unit: 'm',     min: 0,    max: 3000, step: 10,  section: 'Localisation' },
]

// ── Module state ──────────────────────────────────────────────────────────────

let _geojson = null
let _values = {}          // key → displayed value (possibly scaled)
let _enabled = {}         // key → bool (active override)
let _realMode = 'none'    // 'none' | 'annual' | 'monthly'
let _annualKwh = ''
let _monthlyKwh = new Array(12).fill('')
let _chartInstance = null
let _debounceTimer = null
let _onResultCallback = null  // (result) → void — notify parent of DPE update

// ── Public API ────────────────────────────────────────────────────────────────

export function mountCalibrationPanel(container, geojson, onResult) {
  _geojson = geojson
  _onResultCallback = onResult

  // Init defaults to "no override" (all disabled)
  PARAMS.forEach(p => {
    _enabled[p.key] = false
    _values[p.key] = _defaultValue(p)
  })

  container.innerHTML = _buildHTML()
  _bindEvents(container)
}

export function updateCalibrationGeojson(geojson) {
  _geojson = geojson
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function _buildHTML() {
  const sections = [...new Set(PARAMS.map(p => p.section))]

  const sectionHTML = sections.map(sec => {
    const rows = PARAMS.filter(p => p.section === sec).map(p => {
      const displayVal = p.scale ? Math.round(_values[p.key] / p.scale) : _values[p.key]
      return `
        <div class="cal-row" data-key="${p.key}">
          <label class="cal-label">
            <input type="checkbox" class="cal-check" data-key="${p.key}" ${_enabled[p.key] ? 'checked' : ''}>
            ${p.label}
          </label>
          <div class="cal-slider-wrap ${_enabled[p.key] ? '' : 'disabled'}">
            <input type="range" class="cal-slider" data-key="${p.key}"
              min="${p.scale ? p.min / p.scale : p.min}"
              max="${p.scale ? p.max / p.scale : p.max}"
              step="${p.scale ? p.step / p.scale : p.step}"
              value="${displayVal}"
              ${_enabled[p.key] ? '' : 'disabled'}>
            <span class="cal-val" data-key="${p.key}">${displayVal} ${p.unit}</span>
          </div>
        </div>
      `
    }).join('')
    return `<div class="cal-section"><div class="cal-section-title">${sec}</div>${rows}</div>`
  }).join('')

  const monthInputs = Array.from({ length: 12 }, (_, i) => {
    const names = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    return `<div class="month-cell">
      <div class="month-label">${names[i]}</div>
      <input type="number" class="month-input" data-idx="${i}" value="${_monthlyKwh[i]}" placeholder="—" min="0" step="10">
    </div>`
  }).join('')

  return `
    <div class="cal-panel">
      <div class="cal-real-header">
        <span class="cal-section-title">Consommation réelle (optionnel)</span>
        <div class="cal-real-toggle">
          <button class="cal-real-btn ${_realMode === 'none' ? 'active' : ''}" data-mode="none">Aucune</button>
          <button class="cal-real-btn ${_realMode === 'annual' ? 'active' : ''}" data-mode="annual">Annuelle</button>
          <button class="cal-real-btn ${_realMode === 'monthly' ? 'active' : ''}" data-mode="monthly">Mensuelle</button>
        </div>
      </div>

      <div id="cal-real-annual" class="${_realMode === 'annual' ? '' : 'hidden'}">
        <div class="cal-row">
          <label class="cal-label">Total annuel (kWh)</label>
          <input type="number" id="cal-annual-input" class="cal-number-input"
            value="${_annualKwh}" placeholder="ex: 12000" min="0" step="100">
        </div>
      </div>

      <div id="cal-real-monthly" class="${_realMode === 'monthly' ? '' : 'hidden'}">
        <div class="month-grid">${monthInputs}</div>
      </div>

      ${sectionHTML}

      <div id="cal-chart-wrap" class="cal-chart-wrap hidden">
        <div class="chart-label">Besoins simulés vs réels (kWh/mois)</div>
        <canvas id="canvas-calibration"></canvas>
        <div id="cal-rmse"></div>
      </div>
    </div>
  `
}

// ── Events ────────────────────────────────────────────────────────────────────

function _bindEvents(container) {
  // Checkbox toggles
  container.querySelectorAll('.cal-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key
      _enabled[key] = cb.checked
      const row = container.querySelector(`.cal-slider-wrap[data-key="${key}"]`) ||
                  container.querySelector(`.cal-row[data-key="${key}"] .cal-slider-wrap`)
      if (row) row.classList.toggle('disabled', !cb.checked)
      const slider = container.querySelector(`.cal-slider[data-key="${key}"]`)
      if (slider) slider.disabled = !cb.checked
      _scheduleSimulate()
    })
  })

  // Sliders
  container.querySelectorAll('.cal-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const key = sl.dataset.key
      const param = PARAMS.find(p => p.key === key)
      const rawVal = parseFloat(sl.value)
      _values[key] = param.scale ? rawVal * param.scale : rawVal
      const label = container.querySelector(`.cal-val[data-key="${key}"]`)
      if (label) label.textContent = `${rawVal} ${param.unit}`
      _scheduleSimulate()
    })
  })

  // Real consumption mode toggle
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
  if (annualInput) {
    annualInput.addEventListener('input', () => {
      _annualKwh = annualInput.value
      _scheduleSimulate()
    })
  }

  // Monthly inputs
  container.querySelectorAll('.month-input').forEach(inp => {
    inp.addEventListener('input', () => {
      _monthlyKwh[parseInt(inp.dataset.idx)] = inp.value
      _scheduleSimulate()
    })
  })
}

// ── Simulation scheduling ─────────────────────────────────────────────────────

function _scheduleSimulate() {
  clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(_runSimulate, 600)
}

async function _runSimulate() {
  if (!_geojson) return

  const calibration = {}
  const overrides = {}
  PARAMS.forEach(p => {
    if (_enabled[p.key]) overrides[p.key] = _values[p.key]
  })
  if (Object.keys(overrides).length > 0) calibration['*'] = overrides

  const realConsumption = _buildRealConsumption()

  try {
    const result = await simulateCalibration(_geojson, calibration, realConsumption)
    _renderChart(result)
    if (_onResultCallback) _onResultCallback(result)
  } catch (err) {
    console.error('Calibration simulate error:', err)
  }
}

function _buildRealConsumption() {
  if (_realMode === 'annual' && _annualKwh) {
    return { annual_kwh: parseFloat(_annualKwh) }
  }
  if (_realMode === 'monthly') {
    const vals = _monthlyKwh.map(v => parseFloat(v) || 0)
    if (vals.some(v => v > 0)) return { monthly_kwh: vals }
  }
  return null
}

// ── Chart rendering ───────────────────────────────────────────────────────────

function _renderChart(result) {
  const wrap = document.getElementById('cal-chart-wrap')
  if (!wrap) return
  wrap.classList.remove('hidden')

  const simulated = result.simulated_monthly_kwh || []
  const real = result.real_monthly_kwh || null
  const months = result.months || ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null }

  const datasets = [
    {
      label: 'Simulé (kWh)',
      data: simulated,
      backgroundColor: 'rgba(79,128,255,0.7)',
      borderRadius: 3,
    },
  ]
  if (real) {
    datasets.push({
      label: 'Réel (kWh)',
      data: real,
      backgroundColor: 'rgba(245,158,11,0.6)',
      borderRadius: 3,
    })
  }

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
        x: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', maxRotation: 0 } },
        y: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a' },
             title: { display: true, text: 'kWh', color: '#7a7f9a', font: { size: 9 } } },
      },
    },
  })

  const rmseEl = document.getElementById('cal-rmse')
  if (rmseEl) {
    rmseEl.textContent = result.rmse_kwh != null
      ? `RMSE : ${result.rmse_kwh} kWh/mois`
      : ''
    rmseEl.style.color = '#7a7f9a'
    rmseEl.style.fontSize = '11px'
    rmseEl.style.textAlign = 'right'
    rmseEl.style.marginTop = '4px'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _defaultValue(p) {
  // Default slider display value (center of range, weighted toward realistic)
  const defaults = {
    u_walls:             1.5,
    u_roof:              0.5,
    u_floor:             1.0,
    u_windows:           2.5,
    wwr_override:        0.20,
    infiltration_ach:    0.5,
    ventilation_ach:     0.5,
    t_heating:           19.0,
    t_cooling:           26.0,
    internal_gains_w_m2: 5.0,
    altitude_m:          100,
  }
  return defaults[p.key] ?? (p.min + p.max) / 2
}
