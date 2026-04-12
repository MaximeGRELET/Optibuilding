/**
 * Chart rendering for hourly simulation results.
 * Uses Chart.js with a dark theme matching the sidebar palette.
 */

import {
  Chart,
  LineController, BarController,
  LineElement, BarElement,
  PointElement, CategoryScale, LinearScale,
  Filler, Tooltip, Legend,
} from 'chart.js'

Chart.register(
  LineController, BarController,
  LineElement, BarElement,
  PointElement, CategoryScale, LinearScale,
  Filler, Tooltip, Legend,
)

// Shared dark theme defaults
Chart.defaults.color = '#7a7f9a'
Chart.defaults.borderColor = '#2d3147'
Chart.defaults.font.family = 'Inter, system-ui, sans-serif'
Chart.defaults.font.size = 10

const instances = {}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render all hourly charts from analysis result.
 * @param {object} analysis  full response from POST /analysis (method=hourly)
 */
export function renderMonthlyChart(analysis) {
  _renderMonthlyBar(analysis)
  document.getElementById('monthly-chart-section')?.classList.remove('hidden')
}

export function renderHourlyCharts(analysis) {
  const firstZone = analysis.zones?.[0]
  if (!firstZone?.hourly) return

  const section = document.getElementById('charts-section')
  section.classList.remove('hidden')

  const tExt = analysis.t_ext_hourly || []

  _renderColdWeek(firstZone.hourly, tExt)
  _renderAnnualLoad(analysis)
}

export function hideCharts() {
  document.getElementById('charts-section')?.classList.add('hidden')
  document.getElementById('monthly-chart-section')?.classList.add('hidden')
  Object.values(instances).forEach(c => c.destroy())
  Object.keys(instances).forEach(k => delete instances[k])
}

// ── Cold week chart ───────────────────────────────────────────────────────────

function _renderColdWeek(hourly, tExt) {
  const start = hourly.coldest_week_start_h ?? 0
  const slice = (arr) => arr.slice(start, start + 168)

  const tInt  = slice(hourly.t_int)
  const tExtW = slice(tExt)
  const labels = Array.from({ length: 168 }, (_, i) => {
    return i % 24 === 0 ? `J${Math.floor(i / 24) + 1}` : ''
  })

  _destroyIfExists('coldweek')
  const ctx = document.getElementById('canvas-coldweek').getContext('2d')
  instances.coldweek = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'T int (°C)',
          data: tInt,
          borderColor: '#4f80ff',
          backgroundColor: 'rgba(79,128,255,0.08)',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: 'T ext (°C)',
          data: tExtW,
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: _lineOptions('°C'),
  })
}

// ── Annual load chart (daily aggregation) ────────────────────────────────────

function _renderAnnualLoad(analysis) {
  // Sum all zones' q_heat_kw per hour, then aggregate to daily kWh
  const totalHourlyKw = new Array(8760).fill(0)
  for (const zone of (analysis.zones || [])) {
    if (!zone.hourly?.q_heat_kw) continue
    zone.hourly.q_heat_kw.forEach((v, i) => { totalHourlyKw[i] += v })
  }

  // Daily kWh (sum 24h × kW = kWh)
  const dailyKwh = []
  for (let d = 0; d < 365; d++) {
    let sum = 0
    for (let h = 0; h < 24; h++) sum += totalHourlyKw[d * 24 + h]
    dailyKwh.push(Math.round(sum * 10) / 10)
  }

  // Month labels at day 15 of each month
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const labels = Array.from({ length: 365 }, (_, i) => {
    const idx = monthDays.findLastIndex(d => d <= i)
    return i === monthDays[idx] ? monthNames[idx] : ''
  })

  _destroyIfExists('load')
  const ctx = document.getElementById('canvas-load').getContext('2d')
  instances.load = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Chauffe (kWh/j)',
        data: dailyKwh,
        backgroundColor: 'rgba(79,128,255,0.6)',
        borderColor: '#4f80ff',
        borderWidth: 0,
        borderRadius: 1,
      }],
    },
    options: {
      ..._baseOptions(),
      scales: {
        x: { ..._xScale(), ticks: { maxRotation: 0, autoSkip: false } },
        y: { ..._yScale('kWh/j') },
      },
    },
  })
}

// ── Monthly bar chart ─────────────────────────────────────────────────────────

function _renderMonthlyBar(analysis) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  // Sum monthly values across zones
  const heating = new Array(12).fill(0)
  const cooling = new Array(12).fill(0)
  const solar   = new Array(12).fill(0)
  for (const zone of (analysis.zones || [])) {
    ;(zone.heating_need_monthly || []).forEach((v, i) => { heating[i] += v })
    ;(zone.cooling_need_monthly || []).forEach((v, i) => { cooling[i] += v })
    ;(zone.solar_gains_monthly  || []).forEach((v, i) => { solar[i]   += v })
  }

  const hasCooling = cooling.some(v => v > 0)
  const datasets = [
    {
      label: 'Chauffage (kWh)',
      data: heating,
      backgroundColor: 'rgba(79,128,255,0.7)',
      borderRadius: 3,
      order: 3,
    },
    {
      label: 'Apports solaires (kWh)',
      data: solar,
      backgroundColor: 'rgba(245,158,11,0.5)',
      borderRadius: 3,
      order: 1,
    },
  ]
  if (hasCooling) {
    datasets.splice(1, 0, {
      label: 'Refroidissement (kWh)',
      data: cooling,
      backgroundColor: 'rgba(16,185,129,0.65)',
      borderRadius: 3,
      order: 2,
    })
  }

  _destroyIfExists('monthly')
  const ctx = document.getElementById('canvas-monthly').getContext('2d')
  instances.monthly = new Chart(ctx, {
    type: 'bar',
    data: { labels: MONTHS, datasets },
    options: {
      ..._baseOptions(),
      scales: {
        x: _xScale(),
        y: _yScale('kWh'),
      },
    },
  })
}

// ── Chart option helpers ──────────────────────────────────────────────────────

function _baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: true,
    animation: false,
    plugins: {
      legend: { display: true, labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
      tooltip: { mode: 'index', intersect: false },
    },
  }
}

function _lineOptions(unit) {
  return {
    ..._baseOptions(),
    scales: {
      x: _xScale(),
      y: _yScale(unit),
    },
  }
}

function _xScale() {
  return {
    grid: { color: '#2d3147' },
    ticks: { color: '#7a7f9a', maxTicksLimit: 8 },
  }
}

function _yScale(label) {
  return {
    grid: { color: '#2d3147' },
    ticks: { color: '#7a7f9a' },
    title: { display: true, text: label, color: '#7a7f9a', font: { size: 9 } },
  }
}

function _destroyIfExists(key) {
  if (instances[key]) { instances[key].destroy(); delete instances[key] }
}
