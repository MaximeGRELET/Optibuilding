/**
 * Analyse combinatoire des actions de rénovation.
 * Réutilise ACTIONS_CATALOG (avec tous ses params : range, select, number).
 * Règle d'exclusivité : max 1 action par `element` dans chaque combinaison.
 */

import { simulateActions } from './api.js'
import { ACTIONS_CATALOG, defaultParams } from './actions-catalog.js'

// ── État local ────────────────────────────────────────────────────────────────

let _pool    = []   // [{ uid, action (catalog entry), params }]
let _results = []   // scénarios triés après simulation
let _showAll = false

// ── Montage ───────────────────────────────────────────────────────────────────

export function mountComboAnalysis(container, ctx, savedState = null) {
  if (savedState) {
    _pool = (savedState.pool || [])
      .map(p => ({ uid: p.uid, action: ACTIONS_CATALOG.find(a => a.id === p.action_id), params: p.params }))
      .filter(p => p.action)
    _results = (savedState.results || []).map(s => ({
      ...s,
      combo: (s.combo || [])
        .map(c => ({ uid: c.uid, action: ACTIONS_CATALOG.find(a => a.id === c.action_id), params: c.params }))
        .filter(c => c.action),
    }))
    _showAll = false
  } else {
    _pool    = []
    _results = []
    _showAll = false
  }
  container.innerHTML = _renderShell()
  _bindEvents(container, ctx)
  _renderPool(container)
  _updateInfo(container)
  if (_results.length) _renderResults(container)
}

export function getComboState() {
  return {
    pool: _pool.map(p => ({ uid: p.uid, action_id: p.action.id, params: { ...p.params } })),
    results: _results.map(s => ({
      name:         s.name,
      deltaKwh:     s.deltaKwh,
      deltaHeatPct: s.deltaHeatPct,
      deltaCoolPct: s.deltaCoolPct,
      deltaEpPct:   s.deltaEpPct,
      investKeur:   s.investKeur,
      efficiency:   s.efficiency,
      result:       s.result,
      combo: s.combo.map(item => ({
        uid:       item.uid,
        action_id: item.action.id,
        params:    { ...item.params },
      })),
    })),
  }
}

function _renderShell() {
  return `
    <div class="combo-add-row">
      <select id="combo-action-select" class="combo-select">
        <option value="">+ Ajouter une action au pool…</option>
        ${ACTIONS_CATALOG.map(a =>
          `<option value="${a.id}">${a.icon} ${a.label}</option>`
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
    const action = ACTIONS_CATALOG.find(a => a.id === id)
    if (!action) return
    _pool.push({ uid: crypto.randomUUID(), action, params: defaultParams(action) })
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

  // Sliders (range)
  container.addEventListener('input', e => {
    const ctrl = e.target.closest('[data-combo-ctrl]')
    if (!ctrl) return
    const { uid, key } = JSON.parse(ctrl.dataset.comboCtrl)
    const item = _pool.find(p => p.uid === uid)
    if (!item) return
    const val = ctrl.type === 'range' ? parseFloat(ctrl.value) : ctrl.value
    item.params[key] = ctrl.type === 'number' ? parseFloat(ctrl.value) : val
    // Update display label for range inputs
    if (ctrl.type === 'range') {
      const paramDef = item.action.params.find(p => p.key === key)
      const valEl = container.querySelector(`[data-combo-val="${uid}:${key}"]`)
      if (valEl && paramDef?.display) valEl.textContent = paramDef.display(parseFloat(ctrl.value))
    }
  })

  // Selects (change)
  container.addEventListener('change', e => {
    const ctrl = e.target.closest('[data-combo-ctrl]')
    if (!ctrl || ctrl.tagName !== 'SELECT') return
    const { uid, key } = JSON.parse(ctrl.dataset.comboCtrl)
    const item = _pool.find(p => p.uid === uid)
    if (item) item.params[key] = ctrl.value
  })
}

// ── Pool rendering ────────────────────────────────────────────────────────────

function _renderPool(container) {
  const el = container.querySelector('#combo-pool')
  if (!_pool.length) {
    el.innerHTML = '<p class="combo-empty">Aucune action dans le pool. Ajoutez-en via le menu ci-dessus.</p>'
    return
  }

  const groupCounts = {}
  _pool.forEach(item => {
    groupCounts[item.action.element] = (groupCounts[item.action.element] ?? 0) + 1
  })

  el.innerHTML = _pool.map(item => _renderPoolItem(item, groupCounts[item.action.element])).join('')
}

function _renderPoolItem({ uid, action, params }, groupCount) {
  const altBadge = groupCount > 1
    ? `<span class="combo-pool-exclusive-badge" title="Actions alternatives — une seule sera choisie par combo">⚡ ${groupCount} alternatives</span>`
    : ''

  const controls = action.params.map(p => {
    const val = params[p.key] ?? p.default
    const ctrl = _renderControl(uid, p, val)
    return `<div class="combo-param-row">${ctrl}</div>`
  }).join('')

  return `
    <div class="combo-pool-item">
      <div class="combo-pool-item-head">
        <span class="combo-pool-icon">${action.icon}</span>
        <div class="combo-pool-info">
          <span class="combo-pool-label">${action.label} ${altBadge}</span>
          <span class="combo-pool-desc">${action.description}</span>
        </div>
        <button class="combo-pool-remove" data-combo-remove="${uid}" title="Retirer du pool">✕</button>
      </div>
      <div class="combo-pool-params">${controls}</div>
    </div>`
}

function _renderControl(uid, p, val) {
  const attr = `data-combo-ctrl='${JSON.stringify({ uid, key: p.key })}'`

  if (p.type === 'range') {
    const display = p.display ? p.display(val) : val
    return `
      <span class="combo-param-label">${p.label}</span>
      <input type="range" class="combo-param-slider" ${attr}
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" />
      <span class="combo-param-val" data-combo-val="${uid}:${p.key}">${display}</span>`
  }

  if (p.type === 'select') {
    const opts = p.options.map(o =>
      `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`
    ).join('')
    return `
      <span class="combo-param-label">${p.label}</span>
      <select class="combo-param-select" ${attr}>${opts}</select>`
  }

  if (p.type === 'number') {
    return `
      <span class="combo-param-label">${p.label}</span>
      <input type="number" class="combo-param-number" ${attr}
        min="${p.min ?? 0}" step="${p.step ?? 1}" value="${val}" />`
  }

  return ''
}

// ── Combinaisons ──────────────────────────────────────────────────────────────

function _generateCombinations() {
  const groups = {}
  for (const item of _pool) {
    const key = item.action.element ?? item.action.id
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  const groupOptions = Object.values(groups).map(g => [null, ...g])

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

  const n    = _generateCombinations().length
  const warn = n > 100

  infoEl.classList.remove('hidden')
  infoEl.className = `combo-info${warn ? ' combo-info--warn' : ''}`
  infoEl.innerHTML = warn
    ? `⚠️ <strong>${n} combinaisons</strong> générées — simulation longue. Réduisez le pool ou procédez quand même.`
    : `<strong>${n} combinaison${n > 1 ? 's' : ''}</strong> valide${n > 1 ? 's' : ''} à simuler.`

  btnEl.classList.remove('hidden')
}

// ── Simulation ────────────────────────────────────────────────────────────────

async function _runSimulation(container, { getGeoJSON, getStationId, getCalibration, getMethod }) {
  const combos = _generateCombinations()
  if (!combos.length) return

  const btn         = container.querySelector('#combo-simulate-btn')
  const progressEl  = container.querySelector('#combo-progress')
  const progressBar = container.querySelector('#combo-progress-bar')
  const progressLbl = container.querySelector('#combo-progress-label')
  const resultsEl   = container.querySelector('#combo-results')

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
        action_id: item.action.id,
        params:    { ...item.params },
      }))
      const result = await simulateActions(geojson, actions, method, stationId, calibration)

      const heatBefore   = result.heating_need_before_kwh        ?? 0
      const heatAfter    = result.heating_need_after_kwh         ?? 0
      const coolBefore   = result.cooling_need_before_kwh        ?? 0
      const coolAfter    = result.cooling_need_after_kwh         ?? 0
      const epBefore     = result.primary_energy_before_kwh_m2   ?? 0
      const epAfter      = result.primary_energy_after_kwh_m2    ?? 0
      const deltaKwh     = heatBefore - heatAfter
      const investKeur   = (result.investment_center_eur ?? 0) / 1000
      const efficiency   = investKeur > 0 ? deltaKwh / investKeur : 0
      const deltaHeatPct = heatBefore > 0 ? (heatBefore - heatAfter) / heatBefore * 100 : 0
      const deltaCoolPct = coolBefore > 0 ? (coolBefore - coolAfter) / coolBefore * 100 : 0
      const deltaEpPct   = epBefore   > 0 ? (epBefore   - epAfter)   / epBefore   * 100 : 0

      scenarioResults.push({ name: _comboName(combo), combo, result, deltaKwh, investKeur, efficiency, deltaHeatPct, deltaCoolPct, deltaEpPct })
    } catch (err) {
      console.warn(`Combo ${i + 1} échoué :`, err)
    }
  }

  progressBar.style.width = '100%'
  progressLbl.textContent = `✓ ${scenarioResults.length} scénarios simulés sur ${combos.length}`

  scenarioResults.sort((a, b) => b.efficiency - a.efficiency)
  _results = scenarioResults
  _showAll = false

  document.dispatchEvent(new CustomEvent('combo:updated'))

  setTimeout(() => {
    progressEl.classList.add('hidden')
    btn.disabled = false
    _renderResults(container)
  }, 700)
}

function _comboName(combo) {
  return combo.map(item => {
    const sysParam = item.action.params.find(p => p.key === 'system_type')
    if (sysParam) {
      const opt = sysParam.options?.find(o => o.value === item.params.system_type)
      return opt ? opt.label : item.action.label
    }
    return item.action.label
  }).join(' + ')
}

// ── Résultats ─────────────────────────────────────────────────────────────────

function _renderResults(container) {
  const el = container.querySelector('#combo-results')
  if (!_results.length) { el.classList.add('hidden'); return }

  const shown   = _showAll ? _results : _results.slice(0, 5)
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
            <th>Scénario & actions détaillées</th>
            <th class="crt-r">▼ Chauf.</th>
            <th class="crt-r">▼ Froid</th>
            <th class="crt-r">▼ Énergie prim.</th>
            <th class="crt-r">Investissement</th>
            <th class="crt-r">DPE</th>
          </tr>
        </thead>
        <tbody>${shown.map((s, i) => _renderRow(s, i)).join('')}</tbody>
      </table>
    </div>
    ${hasMore
      ? `<button id="combo-show-all" class="combo-show-all-btn">Afficher les ${_results.length - 5} autres scénarios ↓</button>`
      : ''}
  `
}

const _DPE_COLORS = {
  A: '#00b050', B: '#92d050', C: '#c8e84d',
  D: '#ffbf00', E: '#ff9f00', F: '#ff6200', G: '#e02020',
}

function _pctCell(pct, hasBefore) {
  if (!hasBefore) return '<span style="color:#A0AEC0;font-size:0.85em">n/a</span>'
  const cls  = pct >= 15 ? 'crt-gain--pos' : pct < 0 ? 'crt-gain--neg' : ''
  const sign = pct > 0 ? '−' : pct < 0 ? '+' : ''
  return `<span class="${cls}" style="font-weight:700">${sign}${Math.round(Math.abs(pct))} %</span>`
}

function _renderRow(s, rank) {
  const medal     = ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}.`
  const dpeAfter  = s.result.dpe_after  ?? '?'
  const dpeBefore = s.result.dpe_before ?? '?'
  const dpeColor  = _DPE_COLORS[dpeAfter] ?? '#888'
  const dpeText   = ['A','B','C'].includes(dpeAfter) ? '#333' : '#fff'

  const heatBefore = s.result?.heating_need_before_kwh      ?? 0
  const heatAfter  = s.result?.heating_need_after_kwh       ?? 0
  const coolBefore = s.result?.cooling_need_before_kwh      ?? 0
  const coolAfter  = s.result?.cooling_need_after_kwh       ?? 0
  const epBefore   = s.result?.primary_energy_before_kwh_m2 ?? 0
  const epAfter    = s.result?.primary_energy_after_kwh_m2  ?? 0
  const heatPct = s.deltaHeatPct ?? (heatBefore > 0 ? (heatBefore - heatAfter) / heatBefore * 100 : 0)
  const coolPct = s.deltaCoolPct ?? (coolBefore > 0 ? (coolBefore - coolAfter) / coolBefore * 100 : 0)
  const epPct   = s.deltaEpPct   ?? (epBefore   > 0 ? (epBefore   - epAfter)   / epBefore   * 100 : 0)

  const pills = s.combo.map(item => {
    const keyParams = item.action.params
      .filter(p => ['range', 'select'].includes(p.type))
      .map(p => {
        const v = item.params[p.key]
        if (p.type === 'select') {
          return p.options?.find(o => o.value === v)?.label ?? v
        }
        return p.display ? p.display(v) : v
      }).join(', ')
    return `<span class="crt-action-pill">${item.action.icon} ${item.action.label}${keyParams ? ` — ${keyParams}` : ''}</span>`
  }).join('')

  return `
    <tr class="crt-row${rank < 3 ? ' crt-row--podium' : ''}">
      <td class="crt-rank">${medal}</td>
      <td class="crt-name">
        <div class="crt-actions-detail">${pills}</div>
        <div class="crt-dpe-arrow">${dpeBefore} → ${dpeAfter}</div>
      </td>
      <td class="crt-r">${_pctCell(heatPct, heatBefore > 0)}</td>
      <td class="crt-r">${_pctCell(coolPct, coolBefore > 0)}</td>
      <td class="crt-r">${_pctCell(epPct,   epBefore   > 0)}</td>
      <td class="crt-r">${s.investKeur > 0 ? s.investKeur.toFixed(0) + ' k€' : '—'}</td>
      <td class="crt-r"><span class="crt-dpe-badge" style="background:${dpeColor};color:${dpeText}">${dpeAfter}</span></td>
    </tr>`
}

// ── Export pour PDF ───────────────────────────────────────────────────────────

export function getComboResults() { return _results }
