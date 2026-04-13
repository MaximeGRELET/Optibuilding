/**
 * Scenario comparison — table + efficiency chart + monthly comparison chart.
 */

import {
  Chart, BarController, BarElement, LineController, LineElement,
  CategoryScale, LinearScale, PointElement, Tooltip, Legend,
} from 'chart.js'

Chart.register(BarController, BarElement, LineController, LineElement,
  CategoryScale, LinearScale, PointElement, Tooltip, Legend)

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const SCENARIO_PALETTE = [
  '#4f80ff', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4',
]

const DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {{ id: number, name: string, result: object, actions: object[], baselineMonthly: number[]|null }[]} */
const _scenarios = []
let _nextId = 1
let _efficiencyChart = null
let _monthlyChart    = null
let _coolingChart    = null

// ── Public API ────────────────────────────────────────────────────────────────

export function mountComparePanel(container) {
  _render(container)
}

/**
 * @param {string}   name
 * @param {object}   result
 * @param {object[]} actions
 * @param {HTMLElement} container
 * @param {number[]|null} baselineMonthly  12-value reference heating array
 */
export function addSavedScenario(name, result, actions, container, baselineMonthly = null) {
  _scenarios.push({ id: _nextId++, name, result, actions, baselineMonthly })
  _render(container)
  container.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function hasSavedScenarios() {
  return _scenarios.length > 0
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render(container) {
  if (!container) return

  if (!_scenarios.length) {
    container.innerHTML = `<p class="hint" style="padding:8px 0">Aucun scénario sauvegardé. Configurez des actions et cliquez sur "Sauvegarder".</p>`
    return
  }

  container.innerHTML = `
    <div class="compare-toolbar">
      <span class="compare-count">${_scenarios.length} scénario${_scenarios.length > 1 ? 's' : ''}</span>
      <button id="btn-clear-scenarios" class="compare-clear-btn">Tout effacer</button>
    </div>

    <div class="compare-table-wrap">
      ${_buildTable()}
    </div>

    <div class="compare-chart-section">
      <div class="section-title" style="margin-bottom:8px">
        Consommation mensuelle comparée
        <span class="section-hint">Chauffage (kWh) mois par mois — référence vs chaque scénario</span>
      </div>
      <div class="compare-monthly-wrap">
        <canvas id="canvas-compare-monthly"></canvas>
      </div>
    </div>

    <div id="compare-cooling-section" class="compare-chart-section">
      <div class="section-title" style="margin-bottom:8px">
        Besoins de refroidissement comparés
        <span class="section-hint">Froid (kWh) mois par mois — référence vs chaque scénario</span>
      </div>
      <div class="compare-cooling-wrap">
        <canvas id="canvas-compare-cooling"></canvas>
      </div>
    </div>

    <div class="compare-chart-section">
      <div class="section-title" style="margin-bottom:8px">
        Efficacité économique
        <span class="section-hint">Réduction d'énergie totale (kWh/an, chaud + froid) par tranche de 1 000 € investis</span>
      </div>
      <div class="compare-efficiency-wrap">
        <canvas id="canvas-compare"></canvas>
      </div>
    </div>
  `

  container.querySelector('#btn-clear-scenarios')?.addEventListener('click', () => {
    _scenarios.length = 0
    _nextId = 1
    _destroyCharts()
    _render(container)
  })

  container.querySelectorAll('.compare-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id)
      const idx = _scenarios.findIndex(s => s.id === id)
      if (idx !== -1) _scenarios.splice(idx, 1)
      _destroyCharts()
      _render(container)
    })
  })

  _renderMonthlyChart()
  _renderCoolingChart()
  _renderEfficiencyChart()
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _buildTable() {
  const rows = _scenarios.map((s, idx) => {
    const r      = s.result
    const color  = SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length]
    const before = r.baseline_dpe || '?'
    const after  = r.after_dpe    || '?'
    const ep     = _fmt(r.after_full?.primary_energy_kwh_m2, 0)
    const reduc  = r.heating_need_reduction_pct != null ? `−${_fmt(r.heating_need_reduction_pct, 0)} %` : '—'
    const savings= _fmt(r.cost_savings_eur_per_year, 0)
    const invest = _fmt(r.investment_center_eur ?? r.investment_max_eur, 0)
    const roi    = r.simple_payback_years > 99 ? '>99' : _fmt(r.simple_payback_years, 0)
    const effic  = _efficiency(r)

    return `
      <tr>
        <td class="compare-name-cell">
          <span class="compare-color-dot" style="background:${color}"></span>
          <div>
            <span class="compare-scenario-name">${_escHtml(s.name)}</span>
            <span class="compare-actions-pills">${s.actions.map(a => `<span class="compare-pill">${a.action_id.replace('_', '\u00A0')}</span>`).join('')}</span>
          </div>
        </td>
        <td>
          <span class="dpe-chip" style="background:${DPE_COLORS[before]||'#888'}">${before}</span>
          →
          <span class="dpe-chip" style="background:${DPE_COLORS[after]||'#888'}">${after}</span>
        </td>
        <td>${ep}</td>
        <td class="compare-highlight">${reduc}</td>
        <td>${savings} €</td>
        <td>${invest} €</td>
        <td>${roi} ans</td>
        <td class="compare-highlight">${effic}</td>
        <td><button class="compare-delete" data-id="${s.id}" title="Supprimer">✕</button></td>
      </tr>`
  }).join('')

  return `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Scénario</th>
          <th>DPE</th>
          <th>EP<br><span class="th-unit">kWh/m²/an</span></th>
          <th>Réduction<br><span class="th-unit">chauffage</span></th>
          <th>Économie<br><span class="th-unit">/an</span></th>
          <th>Invest.</th>
          <th>Retour</th>
          <th>kWh/k€<br><span class="th-unit">efficacité</span></th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

// ── Monthly comparison chart ──────────────────────────────────────────────────

function _renderMonthlyChart() {
  if (_monthlyChart) { _monthlyChart.destroy(); _monthlyChart = null }
  const ctx = document.getElementById('canvas-compare-monthly')
  if (!ctx) return

  const datasets = []

  // Baseline from first scenario that has one
  const baselineMonthly = _scenarios.find(s => s.baselineMonthly)?.baselineMonthly
  if (baselineMonthly) {
    datasets.push({
      label: 'Référence',
      data: baselineMonthly,
      borderColor: '#7a7f9a',
      backgroundColor: 'rgba(122,127,154,0.06)',
      borderWidth: 2.5,
      borderDash: [6, 3],
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: 99,
    })
  }

  _scenarios.forEach((s, i) => {
    const monthly = _extractAfterMonthly(s.result)
    if (!monthly) return
    const color = SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]
    datasets.push({
      label: s.name,
      data: monthly,
      borderColor: color,
      backgroundColor: color + '18',
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: i,
    })
  })

  if (datasets.length < 1) {
    document.querySelector('.compare-monthly-wrap')?.classList.add('hidden')
    return
  }

  _monthlyChart = new Chart(ctx.getContext('2d'), {
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
          labels: { color: '#e8eaf2', font: { size: 10 }, boxWidth: 20, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh`,
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
          beginAtZero: true,
        },
      },
    },
  })

  const wrap = document.querySelector('.compare-monthly-wrap')
  if (wrap) wrap.style.height = '220px'
}

// ── Cooling monthly chart ─────────────────────────────────────────────────────

function _renderCoolingChart() {
  if (_coolingChart) { _coolingChart.destroy(); _coolingChart = null }
  const ctx = document.getElementById('canvas-compare-cooling')
  const section = document.getElementById('compare-cooling-section')
  if (!ctx) return

  const datasets = []

  // Baseline cooling from first scenario
  const baselineCooling = _extractCoolingMonthly(_scenarios[0]?.result, 'baseline')
  if (baselineCooling) {
    datasets.push({
      label: 'Référence',
      data: baselineCooling,
      borderColor: '#7a7f9a',
      backgroundColor: 'rgba(122,127,154,0.06)',
      borderWidth: 2.5,
      borderDash: [6, 3],
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: 99,
    })
  }

  _scenarios.forEach((s, i) => {
    const monthly = _extractCoolingMonthly(s.result, 'after')
    if (!monthly) return
    const color = SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]
    datasets.push({
      label: s.name,
      data: monthly,
      borderColor: color,
      backgroundColor: color + '18',
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: false,
      order: i,
    })
  })

  // Hide section if no cooling data at all
  const hasCooling = datasets.some(d => d.data?.some(v => v > 0))
  if (section) section.style.display = hasCooling ? '' : 'none'
  if (!hasCooling) return

  _coolingChart = new Chart(ctx.getContext('2d'), {
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
          labels: { color: '#e8eaf2', font: { size: 10 }, boxWidth: 20, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} kWh`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#2d3147' }, ticks: { color: '#7a7f9a', font: { size: 10 } } },
        y: {
          grid: { color: '#2d3147' },
          ticks: { color: '#7a7f9a', font: { size: 10 }, callback: v => `${v.toLocaleString('fr-FR')} kWh` },
          beginAtZero: true,
        },
      },
    },
  })

  const wrap = document.querySelector('.compare-cooling-wrap')
  if (wrap) wrap.style.height = '200px'
}

// ── Efficiency chart ──────────────────────────────────────────────────────────

function _renderEfficiencyChart() {
  if (_efficiencyChart) { _efficiencyChart.destroy(); _efficiencyChart = null }
  const ctx = document.getElementById('canvas-compare')
  if (!ctx) return

  const labels = _scenarios.map(s => s.name)
  const values = _scenarios.map(s => _efficiencyRaw(s.result))
  const colors = _scenarios.map((_, i) => SCENARIO_PALETTE[i % SCENARIO_PALETTE.length] + 'BB')

  _efficiencyChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'kWh économisés / 1 000 € investis',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(0)} kWh / k€` },
        },
      },
      scales: {
        x: {
          grid: { color: '#2d3147' },
          ticks: { color: '#7a7f9a', font: { size: 9 } },
          title: { display: true, text: 'kWh économisés / 1 000 € investis', color: '#7a7f9a', font: { size: 9 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e8eaf2', font: { size: 10 } },
        },
      },
    },
  })

  const wrap = document.querySelector('.compare-efficiency-wrap')
  if (wrap) wrap.style.height = `${Math.max(100, _scenarios.length * 44 + 40)}px`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extractAfterMonthly(r) {
  const full = r.after_full || r.after
  if (!full) return null
  const zones = full.zones || full.zone_results
  if (zones?.length) {
    const arr = new Array(12).fill(0)
    zones.forEach(z => {
      if (z.heating_need_monthly?.length === 12)
        z.heating_need_monthly.forEach((v, i) => { arr[i] += v || 0 })
    })
    if (arr.some(v => v > 0)) return arr
  }
  if (full.heating_need_monthly?.length === 12) return full.heating_need_monthly
  return null
}

function _extractCoolingMonthly(r, key) {
  const full = key === 'baseline' ? (r.baseline_full || r.baseline) : (r.after_full || r.after)
  if (!full) return null
  const zones = full.zones || full.zone_results
  if (zones?.length) {
    const arr = new Array(12).fill(0)
    zones.forEach(z => {
      if (z.cooling_need_monthly?.length === 12)
        z.cooling_need_monthly.forEach((v, i) => { arr[i] += v || 0 })
    })
    if (arr.some(v => v > 0)) return arr
  }
  if (full.cooling_need_monthly?.length === 12) return full.cooling_need_monthly
  return null
}

function _efficiencyRaw(r) {
  const invest       = r.investment_center_eur ?? r.investment_max_eur
  const heatBaseline = r.baseline_full?.heating_need_kwh ?? 0
  const heatAfter    = r.after_full?.heating_need_kwh    ?? 0
  const coolBaseline = r.baseline_full?.cooling_need_kwh ?? 0
  const coolAfter    = r.after_full?.cooling_need_kwh    ?? 0
  const saved        = (heatBaseline - heatAfter) + (coolBaseline - coolAfter)
  if (!invest || invest <= 0) return 0
  return Math.round((saved / invest) * 1000)
}

function _efficiency(r) {
  const v = _efficiencyRaw(r)
  return v > 0 ? `${v.toLocaleString('fr-FR')} kWh/k€` : '—'
}

function _destroyCharts() {
  if (_efficiencyChart) { _efficiencyChart.destroy(); _efficiencyChart = null }
  if (_monthlyChart)    { _monthlyChart.destroy();    _monthlyChart    = null }
  if (_coolingChart)    { _coolingChart.destroy();    _coolingChart    = null }
}

function _fmt(val, dec) {
  if (val == null || isNaN(val)) return '—'
  return val.toLocaleString('fr-FR', { maximumFractionDigits: dec })
}

function _escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
