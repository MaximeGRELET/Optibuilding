import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'

import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'

import {
  createBuilding, setActiveBuilding, getActiveBuilding,
  getAllBuildings,
  addZone, getZone, removeZone, getAllZones, hasZones, updateZoneProps,
  buildGeoJSON, getInactiveBuildingsGeoJSON, setMaxStep, getMaxStep,
  setAnalysis, setRenovation,
} from './buildings.js'
import { analyzeBuilding, analyzeRenovation } from './api.js'
import { showResults } from './results.js'
import { mountWeatherPicker, getSelectedStationId } from './weather-picker.js'

// ── Map ────────────────────────────────────────────────────────────────────────

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [4.854, 45.756],
  zoom: 16,
})
map.addControl(new maplibregl.NavigationControl(), 'top-left')

// ── Weather picker ─────────────────────────────────────────────────────────────

const weatherMount = document.getElementById('weather-picker-mount')
if (weatherMount) mountWeatherPicker(weatherMount)

// ── Draw ───────────────────────────────────────────────────────────────────────

const draw = new MapboxDraw({
  displayControlsDefault: false,
  defaultMode: 'draw_polygon',
  styles: _drawStyles(),
})
map.addControl(draw)

// ── State ──────────────────────────────────────────────────────────────────────

let selectedId = null
let simMethod = 'monthly'

// Initialize with one default building
createBuilding('Bâtiment 1')
renderBuildingSelector()

// ── Step navigation ────────────────────────────────────────────────────────────

export function goToStep(n) {
  const max = getMaxStep()
  if (n > max) return

  ;[1, 2, 3].forEach(i => {
    const panel = document.getElementById(`panel-step${i}`)
    const btn   = document.getElementById(`step-btn-${i}`)
    if (panel) panel.classList.toggle('hidden', i !== n)
    if (btn) {
      btn.classList.toggle('active', i === n)
      btn.classList.toggle('done', i < n && i <= max)
    }
  })

  // Widen right panel for steps 2 and 3
  const rightPanel = document.getElementById('right-panel')
  rightPanel?.classList.toggle('wide', n > 1)
}

export function unlockStep(n) {
  setMaxStep(n)
  const max = getMaxStep()
  ;[1, 2, 3].forEach(i => {
    const btn = document.getElementById(`step-btn-${i}`)
    if (btn) btn.disabled = i > max
  })
  goToStep(n)
}

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.step)
    if (n <= getMaxStep()) goToStep(n)
  })
})

document.addEventListener('calibration:validated', () => unlockStep(3))

// ── Method toggle ──────────────────────────────────────────────────────────────

document.querySelectorAll('.method-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    simMethod = btn.dataset.method
    document.querySelectorAll('.method-btn').forEach(b => b.classList.toggle('active', b === btn))
  })
})

// ── Toolbar ────────────────────────────────────────────────────────────────────

document.getElementById('btn-draw').addEventListener('click', () => _setMode('draw'))
document.getElementById('btn-select').addEventListener('click', () => _setMode('select'))

document.getElementById('btn-delete').addEventListener('click', () => {
  if (!selectedId) return
  draw.delete(selectedId)
  removeZone(selectedId)
  selectedId = null
  document.getElementById('zone-form').classList.add('hidden')
  renderZoneList()
  _updateAnalyseBtn()
})

document.getElementById('btn-finish').addEventListener('click', () => {
  draw.changeMode('simple_select')
  _setDrawingState(false)
})

function _setMode(m) {
  document.getElementById('btn-draw').classList.toggle('active', m === 'draw')
  document.getElementById('btn-select').classList.toggle('active', m === 'select')
  if (m === 'draw') { draw.changeMode('draw_polygon'); _setDrawingState(true) }
  else { draw.changeMode('simple_select'); _setDrawingState(false) }
}

function _setDrawingState(drawing) {
  document.getElementById('toolbar-finish').classList.toggle('hidden', !drawing)
}

// ── Building selector ──────────────────────────────────────────────────────────

export function renderBuildingSelector() {
  const container = document.getElementById('building-chips-list')
  if (!container) return
  const active = getActiveBuilding()
  container.innerHTML = getAllBuildings().map(b => `
    <button class="building-chip ${b.id === active?.id ? 'active' : ''}" data-bid="${b.id}"
      style="--bcolor:${b.color}">
      <span class="bchip-dot" style="background:${b.color}"></span>
      <span class="bchip-name">${_escHtml(b.name)}</span>
    </button>
  `).join('')

  container.querySelectorAll('.building-chip').forEach(el => {
    el.addEventListener('click', () => _switchToBuilding(el.dataset.bid))
  })
}

document.getElementById('btn-add-building')?.addEventListener('click', () => {
  const n = getAllBuildings().length + 1
  const name = prompt(`Nom du bâtiment :`, `Bâtiment ${n}`) || `Bâtiment ${n}`
  const b = createBuilding(name)
  _switchToBuilding(b.id)
})

function _switchToBuilding(id) {
  setActiveBuilding(id)

  // Restore draw to active building's zones
  draw.deleteAll()
  const b = getActiveBuilding()
  if (b) {
    Array.from(b.zones.values()).forEach(zone => {
      if (zone.geometry) {
        draw.add({ type: 'Feature', id: zone.id, geometry: zone.geometry, properties: {} })
      }
    })
  }

  // Update inactive building overlays
  _updateInactiveOverlay()

  // Reset form selection
  selectedId = null
  document.getElementById('zone-form')?.classList.add('hidden')

  // Re-sync step UI for this building
  const max = getMaxStep()
  ;[1, 2, 3].forEach(i => {
    const btn = document.getElementById(`step-btn-${i}`)
    if (btn) btn.disabled = i > max
  })
  goToStep(Math.min(max, 1))  // go to step 1 when switching (results shown separately)

  renderBuildingSelector()
  renderZoneList()
  _updateAnalyseBtn()

  // Show stored results if building has been analyzed
  const stored = getActiveBuilding()
  if (stored?.analysis) {
    unlockStep(stored.maxReachedStep)
    showResults(stored.analysis, stored.renovation, buildGeoJSON(), stored.stationId, stored.calibration)
    goToStep(stored.maxReachedStep)
  }
}

function _updateInactiveOverlay() {
  // Remove old inactive sources/layers
  getAllBuildings().forEach(b => {
    if (map.getLayer(`ib-fill-${b.id}`)) map.removeLayer(`ib-fill-${b.id}`)
    if (map.getLayer(`ib-line-${b.id}`)) map.removeLayer(`ib-line-${b.id}`)
    if (map.getSource(`ib-${b.id}`)) map.removeSource(`ib-${b.id}`)
  })

  getInactiveBuildingsGeoJSON().forEach(({ id, color, geojson }) => {
    map.addSource(`ib-${id}`, { type: 'geojson', data: geojson })
    map.addLayer({ id: `ib-fill-${id}`, type: 'fill', source: `ib-${id}`,
      paint: { 'fill-color': color, 'fill-opacity': 0.08 } })
    map.addLayer({ id: `ib-line-${id}`, type: 'line', source: `ib-${id}`,
      paint: { 'line-color': color, 'line-width': 1.5, 'line-dasharray': [3, 3] } })
  })
}

// ── Draw events ────────────────────────────────────────────────────────────────

map.on('draw.create', ({ features }) => {
  features.forEach(feat => addZone(feat))
  renderZoneList()
  _updateAnalyseBtn()
  selectZone(features[features.length - 1].id)
  setTimeout(() => {
    draw.changeMode('simple_select', { featureIds: [] })
    _setDrawingState(false)
    document.getElementById('btn-draw').classList.remove('active')
    document.getElementById('btn-select').classList.add('active')
  }, 0)
})

map.on('draw.delete', ({ features }) => {
  features.forEach(f => removeZone(f.id))
  if (features.some(f => f.id === selectedId)) {
    selectedId = null
    document.getElementById('zone-form').classList.add('hidden')
  }
  renderZoneList()
  _updateAnalyseBtn()
})

map.on('draw.selectionchange', ({ features }) => {
  if (features.length > 0) selectZone(features[0].id)
})

map.on('draw.modechange', ({ mode }) => {
  if (mode === 'direct_select') setTimeout(() => draw.changeMode('simple_select', { featureIds: [] }), 0)
})

// ── Zone list ──────────────────────────────────────────────────────────────────

export function renderZoneList() {
  const list  = document.getElementById('zone-list')
  const empty = document.getElementById('zones-empty')
  const count = document.getElementById('zone-count')
  const zones = getAllZones()

  if (count) count.textContent = zones.length
  if (empty) empty.classList.toggle('hidden', zones.length > 0)

  if (!list) return
  list.innerHTML = zones.map(z => `
    <li class="zone-item ${z.id === selectedId ? 'selected' : ''}" data-id="${z.id}">
      <span class="zone-dot" style="background:${z.color}"></span>
      <span class="zone-name">${_escHtml(z.label)}</span>
      <span class="zone-meta">${z.properties.construction_year}</span>
    </li>
  `).join('')

  list.querySelectorAll('.zone-item').forEach(el => {
    el.addEventListener('click', () => {
      draw.changeMode('simple_select', { featureIds: [el.dataset.id] })
      selectZone(el.dataset.id)
    })
  })
}

// ── Zone form (rich UI) ────────────────────────────────────────────────────────


function _eraFromYear(y) {
  if (y <= 1947) return 0
  if (y <= 1974) return 1
  if (y <= 1990) return 2
  if (y <= 2005) return 3
  return 4
}

export function selectZone(id) {
  selectedId = id
  const zone = getZone(id)
  if (!zone) return

  document.querySelectorAll('.zone-item').forEach(el =>
    el.classList.toggle('selected', el.dataset.id === id)
  )

  const form = document.getElementById('zone-form')
  form?.classList.remove('hidden')

  const dot = document.getElementById('form-zone-dot')
  if (dot) { dot.style.background = zone.color }

  const titleEl = document.getElementById('form-zone-label')
  if (titleEl) titleEl.textContent = zone.label

  const p = zone.properties

  // Label
  const fLabel = document.getElementById('f-label')
  if (fLabel) fLabel.value = zone.label

  // Year + era chips
  const fYear = document.getElementById('f-year')
  if (fYear) fYear.value = p.construction_year
  _syncEraChips(p.construction_year)

  // Usage cards
  _setActive('.usage-card', 'usage', p.zone_type)
  const fType = document.getElementById('f-type')
  if (fType) fType.value = p.zone_type

  // Height stepper
  const fHeight = document.getElementById('f-height')
  if (fHeight) fHeight.value = p.height_m

  // Floors stepper
  const fFloors = document.getElementById('f-floors')
  if (fFloors) fFloors.value = p.floors ?? Math.max(1, Math.round(p.height_m / 3))

  // Setpoints
  const heatSp = p.heating_setpoint_c ?? 19.0
  const coolSp = p.cooling_setpoint_c ?? 26.0
  const fHeatSp = document.getElementById('f-heat-sp')
  if (fHeatSp) { fHeatSp.value = heatSp; document.getElementById('f-heat-sp-val').textContent = `${heatSp} °C` }
  const fCoolSp = document.getElementById('f-cool-sp')
  if (fCoolSp) { fCoolSp.value = coolSp; document.getElementById('f-cool-sp-val').textContent = `${coolSp} °C` }

  // Struct checkboxes
  const fGround = document.getElementById('f-ground')
  if (fGround) fGround.checked = p.is_ground_floor
  const fRoof = document.getElementById('f-roof')
  if (fRoof) fRoof.checked = p.has_roof

  // Infiltration chips
  _setActive('.infil-chip', 'infil', p.infiltration_level || 'standard')
  const fInfil = document.getElementById('f-infiltration')
  if (fInfil) fInfil.value = p.infiltration_level || 'standard'

  // Heating cards
  _setActive('.heating-card', 'heating', p.energy_system_type)
  const fHeating = document.getElementById('f-heating')
  if (fHeating) fHeating.value = p.energy_system_type
}

function _setActive(cardSel, attr, value) {
  document.querySelectorAll(cardSel).forEach(el => {
    el.classList.toggle('active', el.dataset[attr] === value)
  })
}

function _syncEraChips(year) {
  const idx = _eraFromYear(year)
  document.querySelectorAll('.era-chip').forEach((el, i) =>
    el.classList.toggle('active', i === idx)
  )
}

// Bind form events (called once on DOMContentLoaded-equivalent)
function _bindZoneFormEvents() {
  const form = document.getElementById('zone-form')
  if (!form) return

  // Era chips
  form.querySelectorAll('.era-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = parseInt(btn.dataset.year)
      const fYear = document.getElementById('f-year')
      if (fYear) fYear.value = year
      _syncEraChips(year)
    })
  })

  // Year input → sync chips
  document.getElementById('f-year')?.addEventListener('input', e => {
    _syncEraChips(parseInt(e.target.value) || 1975)
  })

  // Usage cards
  form.querySelectorAll('.usage-card').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.usage-card').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const fType = document.getElementById('f-type')
      if (fType) fType.value = btn.dataset.usage
    })
  })

  // Height stepper
  document.getElementById('btn-height-minus')?.addEventListener('click', () => {
    const el = document.getElementById('f-height')
    if (el) el.value = Math.max(1, parseFloat(el.value) - 0.5).toFixed(1)
  })
  document.getElementById('btn-height-plus')?.addEventListener('click', () => {
    const el = document.getElementById('f-height')
    if (el) el.value = Math.min(50, parseFloat(el.value) + 0.5).toFixed(1)
  })

  // Floors stepper
  document.getElementById('btn-floors-minus')?.addEventListener('click', () => {
    const el = document.getElementById('f-floors')
    if (el) el.value = Math.max(1, parseInt(el.value) - 1)
  })
  document.getElementById('btn-floors-plus')?.addEventListener('click', () => {
    const el = document.getElementById('f-floors')
    if (el) el.value = Math.min(20, parseInt(el.value) + 1)
  })

  // Setpoint sliders
  document.getElementById('f-heat-sp')?.addEventListener('input', e => {
    document.getElementById('f-heat-sp-val').textContent = `${e.target.value} °C`
  })
  document.getElementById('f-cool-sp')?.addEventListener('input', e => {
    document.getElementById('f-cool-sp-val').textContent = `${e.target.value} °C`
  })

  // Infiltration chips
  form.querySelectorAll('.infil-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.infil-chip').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const fInfil = document.getElementById('f-infiltration')
      if (fInfil) fInfil.value = btn.dataset.infil
    })
  })

  // Heating cards
  form.querySelectorAll('.heating-card').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.heating-card').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const fHeating = document.getElementById('f-heating')
      if (fHeating) fHeating.value = btn.dataset.heating
    })
  })

  // Save zone
  document.getElementById('btn-save-zone')?.addEventListener('click', () => {
    if (!selectedId) return
    updateZoneProps(selectedId, {
      label:              document.getElementById('f-label')?.value,
      height:             document.getElementById('f-height')?.value,
      floors:             document.getElementById('f-floors')?.value,
      year:               document.getElementById('f-year')?.value,
      type:               document.getElementById('f-type')?.value,
      ground:             document.getElementById('f-ground')?.checked,
      roof:               document.getElementById('f-roof')?.checked,
      heating:            document.getElementById('f-heating')?.value,
      infiltration:       document.getElementById('f-infiltration')?.value,
      heating_setpoint_c: document.getElementById('f-heat-sp')?.value,
      cooling_setpoint_c: document.getElementById('f-cool-sp')?.value,
    })
    renderZoneList()
    const zone = getZone(selectedId)
    if (zone) {
      const dot = document.getElementById('form-zone-dot')
      if (dot) dot.style.background = zone.color
      const titleEl = document.getElementById('form-zone-label')
      if (titleEl) titleEl.textContent = zone.label
    }
  })
}

_bindZoneFormEvents()

// ── Analyse ────────────────────────────────────────────────────────────────────

function _updateAnalyseBtn() {
  document.getElementById('btn-analyse').disabled = !hasZones()
}

document.getElementById('btn-analyse').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analyse')
  btn.disabled = true
  btn.innerHTML = '<span class="loader"></span> Calcul en cours…'

  try {
    const geojson = buildGeoJSON()
    const stationId = getSelectedStationId()

    const [analysis, renovation] = await Promise.all([
      analyzeBuilding(geojson, simMethod, stationId),
      analyzeRenovation(geojson, simMethod, stationId),
    ])

    setAnalysis(analysis, stationId)
    setRenovation(renovation)

    unlockStep(2)
    showResults(analysis, renovation, geojson, stationId, {}, [])
  } catch (err) {
    alert(`Erreur : ${err.message}`)
    console.error(err)
  } finally {
    btn.disabled = false
    btn.innerHTML = 'Analyser le bâtiment →'
    _updateAnalyseBtn()
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Draw styles ────────────────────────────────────────────────────────────────

function _drawStyles() {
  return [
    { id: 'gl-draw-polygon-fill', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': '#4f80ff', 'fill-opacity': 0.15 } },
    { id: 'gl-draw-polygon-stroke-active', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'line-color': '#4f80ff', 'line-width': 2, 'line-dasharray': [2, 2] } },
    { id: 'gl-draw-polygon-fill-static', type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
      paint: { 'fill-color': '#4f80ff', 'fill-opacity': 0.20 } },
    { id: 'gl-draw-polygon-stroke-static', type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
      paint: { 'line-color': '#4f80ff', 'line-width': 2 } },
    { id: 'gl-draw-line', type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      paint: { 'line-color': '#4f80ff', 'line-width': 2 } },
    { id: 'gl-draw-vertex-point', type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#4f80ff' } },
    { id: 'gl-draw-midpoint', type: 'circle',
      filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 3, 'circle-color': '#4f80ff' } },
  ]
}
