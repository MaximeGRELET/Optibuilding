/**
 * Scenario comparison — table + efficiency chart.
 *
 * Stores saved scenarios in memory (session only).
 * Chart: kWh heating reduction per 1 000 € invested (efficiency metric).
 */

import {
  Chart, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {{ id: number, name: string, result: object, actions: object[] }[]} */
const _scenarios = []
let _nextId = 1
let _chartInstance = null

// ── Public API ────────────────────────────────────────────────────────────────

export function mountComparePanel(container) {
  _render(container)
}

/**
 * Add a saved scenario and re-render.
 * @param {string} name
 * @param {object} result  API result from /renovation/simulate
 * @param {object[]} actions
 * @param {HTMLElement} container
 */
export function addSavedScenario(name, result, actions, container) {
  _scenarios.push({ id: _nextId++, name, result, actions })
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
      <span class="compare-count">${_scenarios.length} scénario${_scenarios.length > 1 ? 's' : ''} comparé${_scenarios.length > 1 ? 's' : ''}</span>
      <button id="btn-clear-scenarios" class="compare-clear-btn">Tout effacer</button>
    </div>

    <div class="compare-table-wrap">
      ${_buildTable()}
    </div>

    <div class="compare-chart-wrap">
      <div class="section-title" style="margin-bottom:6px">
        Efficacité économique
        <span class="section-hint">Réduction de chauffage (kWh/an) par tranche de 1 000 € investis</span>
      </div>
      <canvas id="canvas-compare" style="max-height:200px"></canvas>
    </div>
  `

  container.querySelector('#btn-clear-scenarios')?.addEventListener('click', () => {
    _scenarios.length = 0
    _nextId = 1
    if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null }
    _render(container)
  })

  // Delete buttons
  container.querySelectorAll('.compare-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id)
      const idx = _scenarios.findIndex(s => s.id === id)
      if (idx !== -1) _scenarios.splice(idx, 1)
      if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null }
      _render(container)
    })
  })

  _renderChart()
}

// ── Table ─────────────────────────────────────────────────────────────────────

const DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}

function _buildTable() {
  const rows = _scenarios.map(s => {
    const r = s.result
    const before  = r.baseline_dpe || '?'
    const after   = r.after_dpe    || '?'
    const ep      = _fmt(r.after_full?.primary_energy_kwh_m2, 0)
    const reduc   = r.heating_need_reduction_pct != null ? `−${_fmt(r.heating_need_reduction_pct, 0)} %` : '—'
    const savings = _fmt(r.cost_savings_eur_per_year, 0)
    const invest  = _fmt(r.investment_center_eur ?? r.investment_max_eur, 0)
    const roi     = r.simple_payback_years > 99 ? '>99' : _fmt(r.simple_payback_years, 0)
    const effic   = _efficiency(r)

    return `
      <tr>
        <td class="compare-name-cell">
          <span class="compare-scenario-name">${_escHtml(s.name)}</span>
          <span class="compare-actions-pills">${s.actions.map(a => `<span class="compare-pill">${a.action_id.replace('_', '\u00A0')}</span>`).join('')}</span>
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

// ── Chart ─────────────────────────────────────────────────────────────────────

function _renderChart() {
  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null }
  const ctx = document.getElementById('canvas-compare')
  if (!ctx) return

  const labels  = _scenarios.map(s => s.name)
  const values  = _scenarios.map(s => _efficiencyRaw(s.result))
  const colors  = values.map(v => v > 0 ? 'rgba(79,128,255,0.75)' : 'rgba(120,120,120,0.4)')

  _chartInstance = new Chart(ctx.getContext('2d'), {
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
          callbacks: {
            label: ctx => ` ${ctx.parsed.x.toFixed(0)} kWh / k€`,
          },
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

  // Dynamic height: 40px per bar + margins
  ctx.parentElement.style.height = `${Math.max(120, _scenarios.length * 44 + 40)}px`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _efficiencyRaw(r) {
  const invest = r.investment_center_eur ?? r.investment_max_eur
  const savedKwh = (r.baseline_full?.heating_need_kwh ?? 0) - (r.after_full?.heating_need_kwh ?? 0)
  if (!invest || invest <= 0) return 0
  return Math.round((savedKwh / invest) * 1000)
}

function _efficiency(r) {
  const v = _efficiencyRaw(r)
  return v > 0 ? `${v.toLocaleString('fr-FR')} kWh/k€` : '—'
}

function _fmt(val, dec) {
  if (val == null || isNaN(val)) return '—'
  return val.toLocaleString('fr-FR', { maximumFractionDigits: dec })
}

function _escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
