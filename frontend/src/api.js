/** API client — wraps calls to the OptiBuilding backend */

const BASE = 'http://127.0.0.1:8000'

/**
 * Run energy analysis on a building GeoJSON FeatureCollection.
 * @param {object} geojson  GeoJSON FeatureCollection
 * @param {'monthly'|'hourly'} method
 * @returns {Promise<object>} analysis result
 */
export async function analyzeBuilding(geojson, method = 'monthly') {
  const res = await fetch(`${BASE}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building: geojson, method }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Run renovation scenario analysis.
 * @param {object} geojson
 * @param {'monthly'|'hourly'} method
 * @returns {Promise<object>} renovation result with baseline + scenarios[]
 */
export async function analyzeRenovation(geojson, method = 'monthly') {
  const res = await fetch(`${BASE}/renovation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building: geojson, use_standard_scenarios: true, method }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
