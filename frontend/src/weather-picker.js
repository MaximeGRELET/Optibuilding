/**
 * Weather station picker.
 *
 * Loads the EPW library from the API once, renders a <select> grouped by region.
 * Exposes the selected station_id to the rest of the app.
 * Shows a mini preview (T° moy, ensoleillement) when a station is selected.
 */

import { fetchWeatherLibrary, previewWeatherStation } from './api.js'

let _stations = []
let _selectedId = null   // null = synthetic weather

export function getSelectedStationId() { return _selectedId }

/**
 * Mount the weather picker into `container`.
 * @param {HTMLElement} container
 */
export async function mountWeatherPicker(container) {
  container.innerHTML = `<div class="weather-loading"><span class="loader"></span> Chargement des stations…</div>`

  try {
    const data = await fetchWeatherLibrary()
    _stations = data.stations || []
  } catch {
    container.innerHTML = `<p class="hint">Impossible de charger les stations météo.</p>`
    return
  }

  container.innerHTML = _buildHTML()
  _bindEvents(container)
}

function _buildHTML() {
  // Group by region
  const byRegion = {}
  for (const s of _stations) {
    if (!byRegion[s.region]) byRegion[s.region] = []
    byRegion[s.region].push(s)
  }

  const optgroups = Object.entries(byRegion).map(([region, stations]) => {
    const opts = stations.map(s =>
      `<option value="${s.station_id}" ${s.station_id === _selectedId ? 'selected' : ''}>
        ${s.city}
      </option>`
    ).join('')
    return `<optgroup label="${region}">${opts}</optgroup>`
  }).join('')

  return `
    <div class="weather-picker">
      <div class="weather-picker-row">
        <label class="weather-picker-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
          </svg>
          Météo
        </label>
        <select id="station-select" class="weather-station-select">
          <option value="">— Synthétique (estimation) —</option>
          ${optgroups}
        </select>
      </div>
      <div id="weather-preview" class="weather-preview hidden"></div>
    </div>
  `
}

function _bindEvents(container) {
  const select = container.querySelector('#station-select')
  if (!select) return

  select.addEventListener('change', async () => {
    _selectedId = select.value || null
    const preview = container.querySelector('#weather-preview')
    if (!preview) return

    if (!_selectedId) {
      preview.classList.add('hidden')
      preview.innerHTML = ''
      return
    }

    preview.classList.remove('hidden')
    preview.innerHTML = `<span class="weather-preview-loading"><span class="loader"></span> Téléchargement EPW…</span>`

    try {
      const data = await previewWeatherStation(_selectedId)
      preview.innerHTML = _buildPreview(data)
    } catch (err) {
      preview.innerHTML = `<span class="weather-preview-error">⚠ ${err.message}</span>`
    }
  })
}

function _buildPreview(d) {
  const tMean = d.t_annual_mean_c
  const tMin  = d.t_annual_min_c
  const tMax  = d.t_annual_max_c
  const ghi   = d.ghi_annual_kwh_m2

  // Sparkline temps mensuel (mini bars ASCII-style via inline SVG)
  const tData = d.monthly_t_mean_c || []
  const spark  = _sparkline(tData, 180, 28, '#4f80ff')
  const ghiData = d.monthly_ghi_kwh || []
  const sparkGhi = _sparkline(ghiData, 180, 28, '#f59e0b')

  return `
    <div class="weather-preview-stats">
      <div class="wp-stat">
        <span class="wp-val">${tMean} °C</span>
        <span class="wp-lbl">T° moy. annuelle</span>
      </div>
      <div class="wp-stat">
        <span class="wp-val">${tMin} / ${tMax} °C</span>
        <span class="wp-lbl">min / max</span>
      </div>
      <div class="wp-stat">
        <span class="wp-val">${ghi.toLocaleString('fr-FR')} kWh/m²</span>
        <span class="wp-lbl">ensoleillement/an</span>
      </div>
    </div>
    <div class="weather-preview-charts">
      <div class="wp-chart-label">T° mensuelle (°C)</div>
      ${spark}
      <div class="wp-chart-label" style="margin-top:4px">Rayonnement mensuel (kWh/m²)</div>
      ${sparkGhi}
    </div>
    <div class="weather-preview-note">
      Source TMYx 2004-2018 · climate.onebuilding.org · WMO ${d.wmo}
    </div>
  `
}

function _sparkline(values, w, h, color) {
  if (!values.length) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const barW = (w - pad * (values.length - 1)) / values.length

  const bars = values.map((v, i) => {
    const barH = Math.max(2, ((v - min) / range) * (h - 4))
    const x = i * (barW + pad)
    const y = h - barH
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1" fill="${color}" opacity="0.75"/>`
  }).join('')

  const labelFirst = values[0]?.toFixed(0) ?? ''
  const labelLast  = values[values.length - 1]?.toFixed(0) ?? ''

  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      ${bars}
    </svg>
  `
}
