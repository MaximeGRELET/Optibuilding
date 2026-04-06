import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'

import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'

import { addZone, getZone, removeZone, getAllZones, hasZones, updateZoneProps, buildGeoJSON } from './zones.js'
import { analyzeBuilding, analyzeRenovation } from './api.js'
import { showResults } from './results.js'
import { mountWeatherPicker, getSelectedStationId } from './weather-picker.js'

// ── Map ────────────────────────────────────────────────────────────────────

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [4.854, 45.756],
  zoom: 16,
})
map.addControl(new maplibregl.NavigationControl(), 'top-left')

// ── Weather picker ─────────────────────────────────────────────────────────

const weatherMount = document.getElementById('weather-picker-mount')
if (weatherMount) mountWeatherPicker(weatherMount)

// ── Draw ───────────────────────────────────────────────────────────────────

const draw = new MapboxDraw({
  displayControlsDefault: false,
  defaultMode: 'draw_polygon',
  styles: drawStyles(),
})
map.addControl(draw)

// ── State ──────────────────────────────────────────────────────────────────

let selectedId = null
let simMethod = 'monthly'
let maxReachedStep = 1  // highest step unlocked

// ── Step navigation ────────────────────────────────────────────────────────

function goToStep(n) {
  if (n > maxReachedStep) return  // not yet unlocked

  ;[1, 2, 3].forEach(i => {
    const panel = document.getElementById(`panel-step${i}`)
    const btn   = document.getElementById(`step-btn-${i}`)
    if (panel) panel.classList.toggle('hidden', i !== n)
    if (btn) {
      btn.classList.toggle('active', i === n)
      btn.classList.toggle('done', i < n && i <= maxReachedStep)
    }
  })
}

function unlockStep(n) {
  maxReachedStep = Math.max(maxReachedStep, n)
  // Enable step buttons up to maxReachedStep
  ;[1, 2, 3].forEach(i => {
    const btn = document.getElementById(`step-btn-${i}`)
    if (btn) btn.disabled = i > maxReachedStep
  })
  goToStep(n)
}

// Step button click → navigate back (or forward if already unlocked)
document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.step)
    if (n <= maxReachedStep) goToStep(n)
  })
})

// Event from calibration panel → go to step 3
document.addEventListener('calibration:validated', () => unlockStep(3))

// ── Method toggle ──────────────────────────────────────────────────────────

document.querySelectorAll('.method-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    simMethod = btn.dataset.method
    document.querySelectorAll('.method-btn').forEach(b => b.classList.toggle('active', b === btn))
  })
})

// ── Toolbar ────────────────────────────────────────────────────────────────

document.getElementById('btn-draw').addEventListener('click', () => setMode('draw'))
document.getElementById('btn-select').addEventListener('click', () => setMode('select'))

document.getElementById('btn-delete').addEventListener('click', () => {
  if (!selectedId) return
  draw.delete(selectedId)
  removeZone(selectedId)
  selectedId = null
  document.getElementById('zone-form').classList.add('hidden')
  renderZoneList()
  updateAnalyseBtn()
})

document.getElementById('btn-finish').addEventListener('click', () => {
  draw.changeMode('simple_select')
  setDrawingState(false)
})

function setMode(m) {
  document.getElementById('btn-draw').classList.toggle('active', m === 'draw')
  document.getElementById('btn-select').classList.toggle('active', m === 'select')
  if (m === 'draw') { draw.changeMode('draw_polygon'); setDrawingState(true) }
  else { draw.changeMode('simple_select'); setDrawingState(false) }
}

function setDrawingState(drawing) {
  document.getElementById('toolbar-finish').classList.toggle('hidden', !drawing)
}

// ── Draw events ────────────────────────────────────────────────────────────

map.on('draw.create', ({ features }) => {
  features.forEach(feat => addZone(feat))
  renderZoneList()
  updateAnalyseBtn()
  selectZone(features[features.length - 1].id)
  setTimeout(() => {
    draw.changeMode('simple_select', { featureIds: [] })
    setDrawingState(false)
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
  updateAnalyseBtn()
})

map.on('draw.selectionchange', ({ features }) => {
  if (features.length > 0) selectZone(features[0].id)
})

map.on('draw.modechange', ({ mode }) => {
  if (mode === 'direct_select') setTimeout(() => draw.changeMode('simple_select', { featureIds: [] }), 0)
})

// ── Zone list ──────────────────────────────────────────────────────────────

function renderZoneList() {
  const list  = document.getElementById('zone-list')
  const empty = document.getElementById('zones-empty')
  const count = document.getElementById('zone-count')
  const zones = getAllZones()

  count.textContent = zones.length
  empty.classList.toggle('hidden', zones.length > 0)

  list.innerHTML = zones.map(z => `
    <li class="zone-item ${z.id === selectedId ? 'selected' : ''}" data-id="${z.id}">
      <span class="zone-dot" style="background:${z.color}"></span>
      <span class="zone-name">${z.label}</span>
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

// ── Zone form ──────────────────────────────────────────────────────────────

function selectZone(id) {
  selectedId = id
  const zone = getZone(id)
  if (!zone) return

  document.querySelectorAll('.zone-item').forEach(el =>
    el.classList.toggle('selected', el.dataset.id === id)
  )

  const form = document.getElementById('zone-form')
  form.classList.remove('hidden')
  document.getElementById('form-zone-label').textContent = zone.label

  const p = zone.properties
  document.getElementById('f-label').value   = zone.label
  document.getElementById('f-height').value  = p.height_m
  document.getElementById('f-year').value    = p.construction_year
  document.getElementById('f-type').value    = p.zone_type
  document.getElementById('f-ground').value  = String(p.is_ground_floor)
  document.getElementById('f-roof').value    = String(p.has_roof)
  document.getElementById('f-heating').value = p.energy_system_type
}

document.getElementById('btn-save-zone').addEventListener('click', () => {
  if (!selectedId) return
  updateZoneProps(selectedId, {
    label:   document.getElementById('f-label').value,
    height:  document.getElementById('f-height').value,
    year:    document.getElementById('f-year').value,
    type:    document.getElementById('f-type').value,
    ground:  document.getElementById('f-ground').value,
    roof:    document.getElementById('f-roof').value,
    heating: document.getElementById('f-heating').value,
  })
  renderZoneList()
  document.getElementById('form-zone-label').textContent = getZone(selectedId)?.label || ''
})

// ── Analyse ────────────────────────────────────────────────────────────────

function updateAnalyseBtn() {
  document.getElementById('btn-analyse').disabled = !hasZones()
}

document.getElementById('btn-analyse').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analyse')
  btn.disabled = true
  btn.innerHTML = '<span class="loader"></span> Calcul en cours…'

  try {
    const drawnFeatures = draw.getAll().features
    const geojson = buildGeoJSON(drawnFeatures)

    const stationId = getSelectedStationId()
    const [analysis, renovation] = await Promise.all([
      analyzeBuilding(geojson, simMethod, stationId),
      analyzeRenovation(geojson, simMethod, stationId),
    ])

    unlockStep(2)
    showResults(analysis, renovation, geojson, stationId)
  } catch (err) {
    alert(`Erreur : ${err.message}`)
    console.error(err)
  } finally {
    btn.disabled = false
    btn.innerHTML = 'Analyser le bâtiment →'
    updateAnalyseBtn()
  }
})

// ── Draw styles ────────────────────────────────────────────────────────────

function drawStyles() {
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
