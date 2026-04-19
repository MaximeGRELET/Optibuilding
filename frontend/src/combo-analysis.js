/**
 * Analyse combinatoire des actions de rénovation.
 * Génère toutes les combinaisons valides d'un pool d'actions (max 1 par élément)
 * et les simule via POST /renovation/simulate.
 */

import { simulateActions } from './api.js'

// ── Catalogue des actions ─────────────────────────────────────────────────────
// element : groupe d'exclusivité — une seule action par groupe dans chaque combo

export const COMBO_CATALOG = [
  {
    id: 'insulate_walls',
    element: 'envelope_walls',
    label: 'Isolation murs',
    icon: '🧱',
    desc: 'ITE ou ITI — laine minérale',
    actionId: 'insulate_walls',
    defaultParams: { material_id: 'mineral_wool', thickness_m: 0.14, cost_min_eur: 10000, cost_max_eur: 20000 },
    paramsUI: [
      { key: 'thickness_m', label: 'Épaisseur', min: 0.06, max: 0.30, step: 0.02, fmt: v => parseFloat(v).toFixed(2) + ' m' },
    ],
  },
  {
    id: 'insulate_roof',
    element: 'envelope_roof',
    label: 'Isolation toiture',
    icon: '🏠',
    desc: 'Combles ou toiture-terrasse',
    actionId: 'insulate_roof',
    defaultParams: { material_id: 'mineral_wool', thickness_m: 0.25, cost_min_eur: 5000, cost_max_eur: 8000 },
    paramsUI: [
      { key: 'thickness_m', label: 'Épaisseur', min: 0.10, max: 0.40, step: 0.05, fmt: v => parseFloat(v).toFixed(2) + ' m' },
    ],
  },
  {
    id: 'insulate_floor',
    element: 'envelope_floor',
    label: 'Isolation plancher bas',
    icon: '🔲',
    desc: 'Sous dalle — EPS',
    actionId: 'insulate_floor',
    defaultParams: { material_id: 'eps_insulation', thickness_m: 0.10, cost_min_eur: 4000, cost_max_eur: 7000 },
    paramsUI: [
      { key: 'thickness_m', label: 'Épaisseur', min: 0.06, max: 0.20, step: 0.02, fmt: v => parseFloat(v).toFixed(2) + ' m' },
    ],
  },
  {
    id: 'replace_windows',
    element: 'envelope_windows',
    label: 'Remplacement vitrages',
    icon: '🪟',
    desc: 'Double ou triple vitrage',
    actionId: 'replace_windows',
    defaultParams: { new_uw_w_m2k: 1.3, g_value: 0.6, cost_min_eur: 8000, cost_max_eur: 15000 },
    paramsUI: [
      { key: 'new_uw_w_m2k', label: 'Uw cible', min: 0.6, max: 2.8, step: 0.1, fmt: v => parseFloat(v).toFixed(1) + ' W/m²K' },
    ],
  },
  {
    id: 'replace_heating_heatpump',
    element: 'heating_system',
    label: 'PAC air-eau',
    icon: '♻️',
    desc: 'Pompe à chaleur — COP 3.2',
    actionId: 'replace_heating',
    defaultParams: { system_type: 'heat_pump', efficiency: 3.2, cost_min_eur: 8000, cost_max_eur: 14000 },
    paramsUI: [
      { key: 'efficiency', label: 'COP nominal', min: 2.5, max: 4.5, step: 0.1, fmt: v => parseFloat(v).toFixed(1) },
    ],
  },
  {
    id: 'replace_heating_district',
    element: 'heating_system',
    label: 'Réseau de chaleur',
    icon: '🌡️',
    desc: 'Branchement réseau urbain — η 95%',
    actionId: 'replace_heating',
    defaultParams: { system_type: 'district_heating', efficiency: 0.95, cost_min_eur: 5000, cost_max_eur: 12000 },
    paramsUI: [],
  },
  {
    id: 'replace_heating_gas_cond',
    element: 'heating_system',
    label: 'Chaudière gaz condensation',
    icon: '🔥',
    desc: 'Remplacement chaudière — η 105%',
    actionId: 'replace_heating',
    defaultParams: { system_type: 'gas_boiler', efficiency: 1.05, cost_min_eur: 4000, cost_max_eur: 8000 },
    paramsUI: [],
  },
  {
    id: 'install_mvhr',
    element: 'ventilation',
    label: 'VMC double flux',
    icon: '💨',
    desc: 'Récupération de chaleur sur air extrait',
    actionId: 'install_mvhr',
    defaultParams: { heat_recovery_efficiency: 0.85, cost_min_eur: 3000, cost_max_eur: 5000 },
    paramsUI: [
      { key: 'heat_recovery_efficiency', label: 'Efficacité récup.', min: 0.70, max: 0.95, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
    ],
  },
]

// ── État local ────────────────────────────────────────────────────────────────

let _pool    = []   // [{ uid, cat, params }]
let _results = []   // scénarios triés après simulation
let _showAll = false

// ── Montage ───────────────────────────────────────────────────────────────────

export function mountComboAnalysis(container, ctx) {
  _pool    = []
  _results = []
  _showAll = false
  container.innerHTML = _renderShell()
  _bindEvents(container, ctx)
  _renderPool(container)
  _updateInfo(container)
}

function _renderShell() {
  return `
    <div class="combo-add-row">
      <select id="combo-action-select" class="combo-select">
        <option value="">+ Ajouter une action au pool…</option>
        ${COMBO_CATALOG.map(c =>
          `<option value="${c.id}">${c.icon} ${c.label}</option>`
        ).join('')}
      </select>
    </div>
    <div id="combo-pool" class="combo-pool"></div>
    <div id="combo-info" class="combo-info hidden"></div>
    <button id="combo-simulate-btn" class="primary-btn full-width hidden">⚡ Simuler toutes les combinaisons</button>
    <div id="combo-progress" class="combo-progress hidden">
      <div class="combo-progress-bar-wrap">
        <div id="combo-progress-bar" class="combo-progress-bar" style="width:0%"></div>
      </div>
      <div id="combo-progress-label" class="combo-progress-label">Simulation en cours…</div>
    </div>
    <div id="combo-results" class="combo-results hidden"></div>
  `
}

function _bindEvents(container, ctx) {
  container.querySelector('#combo-action-select').addEventListener('change', e => {
    const id = e.target.value
    if (!id) return
    e.target.value = ''
    const cat = COMBO_CATALOG.find(c => c.id === id)
    if (!cat) return
    _pool.push({ uid: crypto.randomUUID(), cat, params: { ...cat.defaultParams } })
    _renderPool(container)
    _updateInfo(container)
  })

  container.addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-combo-remove]')
    if (removeBtn) {
      _pool = _pool.filter(p => p.uid !== removeBtn.dataset.comboRemove)
      _renderPool(container)
      _updateInfo(container)
      return
    }
    if (e.target.closest('#combo-simulate-btn')) {
      _runSimulation(container, ctx)
      return
    }
    if (e.target.closest('#combo-show-all')) {
      _showAll = true
      _renderResults(container)
    }
  })

  container.addEventListener('input', e => {
    const slider = e.target.closest('[data-combo-slider]')
    if (!slider) return
    const { uid, key } = JSON.parse(slider.dataset.comboSlider)
    const item = _pool.find(p => p.uid === uid)
    if (!item) return
    item.params[key] = parseFloat(slider.value)
    const valEl = container.querySelector(`[data-combo-val="${uid}:${key}"]`)
    if (valEl) {
      const pDef = item.cat.paramsUI.find(p => p.key === key)
      valEl.textContent = pDef?.fmt ? pDef.fmt(slider.value) : slider.value
    }
  })
}

// ── Pool rendering ────────────────────────────────────────────────────────────

function _renderPool(container) {
  const el = container.querySelector('#combo-pool')
  if (!_pool.length) {
    el.innerHTML = '<p class="combo-empty">Aucune action dans le pool. Ajoutez-en via le menu ci-dessus.</p>'
    return
  }

  // Show element groups with their counts
  const groups = {}
  _pool.forEach(item => {
    if (!groups[item.cat.element]) groups[item.cat.element] = []
    groups[item.cat.element].push(item)
  })

  el.innerHTML = _pool.map(item => {
    const groupCount = groups[item.cat.element].length
    const multiLabel = groupCount > 1 ? `<span class="combo-pool-exclusive-badge" title="Actions alternatives sur le même élément">⚡ ${groupCount} alternatives</span>` : ''
    const sliders = item.cat.paramsUI.map(p => {
      const val = item.params[p.key] ?? p.min
      return `
        <div class="combo-param-row">
          <span class="combo-param-label">${p.label}</span>
          <input type="range" class="combo-param-slider"
            data-combo-slider='${JSON.stringify({ uid: item.uid, key: p.key })}'
            min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" />
          <span class="combo-param-val" data-combo-val="${item.uid}:${p.key}">${p.fmt ? p.fmt(val) : val}</span>
        </div>`
    }).join('')

    return `
      <div class="combo-pool-item">
        <div class="combo-pool-item-head">
          <span class="combo-pool-icon">${item.cat.icon}</span>
          <div class="combo-pool-info">
            <span class="combo-pool-label">${item.cat.label} ${multiLabel}</span>
            <span class="combo-pool-desc">${item.cat.desc}</span>
          </div>
          <button class="combo-pool-remove" data-combo-remove="${item.uid}" title="Retirer du pool">✕</button>
        </div>
        ${sliders ? `<div class="combo-pool-params">${sliders}</div>` : ''}
      </div>`
  }).join('')
}

// ── Combinaisons ──────────────────────────────────────────────────────────────

function _generateCombinations() {
  const groups = {}
  for (const item of _pool) {
    if (!groups[item.cat.element]) groups[item.cat.element] = []
    groups[item.cat.element].push(item)
  }

  // Pour chaque groupe : [null = ne pas appliquer, item1, item2, ...]
  const groupOptions = Object.values(groups).map(g => [null, ...g])

  // Produit cartésien
  const combos = groupOptions.reduce(
    (acc, opts) => acc.flatMap(combo => opts.map(opt => [...combo, opt])),
    [[]]
  )

  return combos
    .map(combo => combo.filter(x => x !== null))
    .filter(combo => combo.length > 0)
}

function _updateInfo(container) {
  const infoEl = container.querySelector('#combo-info')
  const btnEl  = container.querySelector('#combo-simulate-btn')

  if (!_pool.length) {
    infoEl.classList.add('hidden')
    btnEl.classList.add('hidden')
    return
  }

  const n = _generateCombinations().length
  const warn = n > 100

  infoEl.classList.remove('hidden')
  infoEl.className = `combo-info${warn ? ' combo-info--warn' : ''}`
  infoEl.innerHTML = warn
    ? `⚠️ <strong>${n} combinaisons</strong> générées — simulation longue. Réduisez le pool ou procédez.`
    : `<strong>${n} combinaison${n > 1 ? 's' : ''}</strong> valide${n > 1 ? 's' : ''} à simuler.`

  btnEl.classList.remove('hidden')
}

// ── Simulation ────────────────────────────────────────────────────────────────

async function _runSimulation(container, { getGeoJSON, getStationId, getCalibration, getMethod }) {
  const combos = _generateCombinations()
  if (!combos.length) return

  const btn          = container.querySelector('#combo-simulate-btn')
  const progressEl   = container.querySelector('#combo-progress')
  const progressBar  = container.querySelector('#combo-progress-bar')
  const progressLbl  = container.querySelector('#combo-progress-label')
  const resultsEl    = container.querySelector('#combo-results')

  btn.disabled = true
  progressEl.classList.remove('hidden')
  resultsEl.classList.add('hidden')

  const geojson     = getGeoJSON()
  const stationId   = getStationId()
  const calibration = getCalibration()
  const method      = getMethod()

  const scenarioResults = []

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    progressBar.style.width = Math.round((i / combos.length) * 100) + '%'
    progressLbl.textContent = `Scénario ${i + 1} / ${combos.length} — ${_comboName(combo)}`

    try {
      const actions = combo.map(item => ({
        action_id: item.cat.actionId,
        params:    item.params,
      }))
      const result = await simulateActions(geojson, actions, method, stationId, calibration)

      const deltaKwh  = (result.baseline?.heating_need_kwh ?? 0) - (result.after?.heating_need_kwh ?? 0)
      const investKeur = (result.investment_center_eur ?? ((result.after?.cost_min_eur ?? 0) + (result.after?.cost_max_eur ?? 0)) / 2) / 1000
      const efficiency = investKeur > 0 ? deltaKwh / investKeur : 0

      scenarioResults.push({ name: _comboName(combo), combo, result, deltaKwh, investKeur, efficiency })
    } catch (err) {
      console.warn(`Combo ${i + 1} échoué :`, err)
    }
  }

  progressBar.style.width = '100%'
  progressLbl.textContent = `✓ ${scenarioResults.length} scénarios simulés sur ${combos.length}`

  scenarioResults.sort((a, b) => b.efficiency - a.efficiency)
  _results = scenarioResults
  _showAll = false

  setTimeout(() => {
    progressEl.classList.add('hidden')
    btn.disabled = false
    _renderResults(container)
  }, 700)
}

function _comboName(combo) {
  return combo.map(item => item.cat.label).join(' + ')
}

// ── Résultats ─────────────────────────────────────────────────────────────────

function _renderResults(container) {
  const el = container.querySelector('#combo-results')
  if (!_results.length) { el.classList.add('hidden'); return }

  const shown  = _showAll ? _results : _results.slice(0, 5)
  const hasMore = !_showAll && _results.length > 5

  el.classList.remove('hidden')
  el.innerHTML = `
    <div class="combo-results-header">
      <span class="combo-results-title">📊 ${_results.length} scénario${_results.length > 1 ? 's' : ''} simulés</span>
      <span class="combo-results-hint">Classés par kWh gagné / k€ investi</span>
    </div>
    <div class="combo-results-table-wrap">
      <table class="combo-results-table">
        <thead>
          <tr>
            <th></th>
            <th>Scénario & actions</th>
            <th class="crt-r">Gain chauffage</th>
            <th class="crt-r">Investissement</th>
            <th class="crt-r">Efficacité</th>
            <th class="crt-r">DPE</th>
          </tr>
        </thead>
        <tbody>
          ${shown.map((s, i) => _renderRow(s, i)).join('')}
        </tbody>
      </table>
    </div>
    ${hasMore
      ? `<button id="combo-show-all" class="combo-show-all-btn">Afficher les ${_results.length - 5} autres scénarios ↓</button>`
      : ''}
  `
}

const _DPE_COLORS = {
  A: '#00b050', B: '#92d050', C: '#ffff00',
  D: '#ffbf00', E: '#ff9f00', F: '#ff6200', G: '#e02020',
}

function _renderRow(s, rank) {
  const medal   = ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}.`
  const dpeAfter = s.result.after_dpe ?? s.result.after?.dpe_class ?? '?'
  const dpeBefore = s.result.baseline_dpe ?? s.result.baseline?.dpe_class ?? '?'
  const dpeColor = _DPE_COLORS[dpeAfter] ?? '#888'

  const actionsDetail = s.combo.map(item => {
    const paramStr = item.cat.paramsUI.map(p => {
      const v = item.params[p.key]
      return p.fmt ? p.fmt(v) : v
    }).join(', ')
    return `<span class="crt-action-pill">${item.cat.icon} ${item.cat.label}${paramStr ? ` — ${paramStr}` : ''}</span>`
  }).join('')

  const costStr    = s.investKeur > 0 ? `${s.investKeur.toFixed(0)} k€` : '—'
  const effStr     = s.efficiency > 0 ? `${Math.round(s.efficiency).toLocaleString('fr')} kWh/k€` : '—'
  const deltaStr   = s.deltaKwh > 0
    ? `−${Math.round(s.deltaKwh).toLocaleString('fr')} kWh`
    : `+${Math.abs(Math.round(s.deltaKwh)).toLocaleString('fr')} kWh`
  const deltaCls   = s.deltaKwh > 0 ? 'crt-gain--pos' : 'crt-gain--neg'

  return `
    <tr class="crt-row${rank < 3 ? ' crt-row--podium' : ''}">
      <td class="crt-rank">${medal}</td>
      <td class="crt-name">
        <div class="crt-actions-detail">${actionsDetail}</div>
        <div class="crt-dpe-arrow">${dpeBefore} → ${dpeAfter}</div>
      </td>
      <td class="crt-r"><span class="${deltaCls}">${deltaStr}</span></td>
      <td class="crt-r">${costStr}</td>
      <td class="crt-r crt-efficiency">${effStr}</td>
      <td class="crt-r"><span class="crt-dpe-badge" style="background:${dpeColor};color:${dpeAfter === 'C' ? '#333' : '#fff'}">${dpeAfter}</span></td>
    </tr>`
}

// ── Export pour PDF ───────────────────────────────────────────────────────────

export function getComboResults() { return _results }
