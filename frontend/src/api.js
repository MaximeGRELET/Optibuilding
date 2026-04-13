/** API client — wraps calls to the OptiBuilding backend */

const BASE = 'http://127.0.0.1:8000'

// ── Auth token ────────────────────────────────────────────────────────────────

export function getToken() { return localStorage.getItem('ob_token') }
export function setToken(t) { localStorage.setItem('ob_token', t) }
export function clearToken() { localStorage.removeItem('ob_token') }

function _authHeaders() {
  const t = getToken()
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }
           : { 'Content-Type': 'application/json' }
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function authRegister(email, password) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`) }
  return res.json()
}

export async function authLogin(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`) }
  return res.json()
}

// ── Projects API ───────────────────────────────────────────────────────────────

export async function listProjects() {
  const res = await fetch(`${BASE}/projects`, { headers: _authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createProject(name, description = '') {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST', headers: _authHeaders(),
    body: JSON.stringify({ name, description }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`) }
  return res.json()
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`, { headers: _authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function saveProject(id, data) {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: 'PUT', headers: _authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE', headers: _authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/**
 * Run energy analysis on a building GeoJSON FeatureCollection.
 * @param {object} geojson  GeoJSON FeatureCollection
 * @param {'monthly'|'hourly'} method
 * @returns {Promise<object>} analysis result
 */
export async function fetchWeatherLibrary() {
  const res = await fetch(`${BASE}/weather/library`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function previewWeatherStation(stationId) {
  const res = await fetch(`${BASE}/weather/epw/${stationId}/preview`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function analyzeBuilding(geojson, method = 'monthly', stationId = null) {
  const body = { building: geojson, method }
  if (stationId) body.station_id = stationId
  const res = await fetch(`${BASE}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Simulate a custom set of enabled actions.
 * @param {object} geojson
 * @param {{ action_id: string, params: object }[]} actions  enabled actions only
 * @param {'monthly'|'hourly'} method
 * @returns {Promise<object>} RenovationResult.to_dict()
 */
export async function simulateActions(geojson, actions, method = 'monthly', stationId = null, calibration = {}) {
  const body = { building: geojson, actions, method }
  if (stationId) body.station_id = stationId
  if (calibration && Object.keys(calibration).length) body.calibration = calibration
  const res = await fetch(`${BASE}/renovation/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Run calibration simulation with parameter overrides + optional real consumption.
 * @param {object} geojson
 * @param {object} calibration  e.g. { "*": { u_walls: 1.5, ... } }
 * @param {object|null} realConsumption  e.g. { annual_kwh: 12000 } or { monthly_kwh: [...] }
 * @returns {Promise<object>} calibration result with monthly comparison
 */
export async function simulateCalibration(geojson, calibration = {}, realConsumption = null, stationId = null, realCoolingConsumption = null) {
  const body = { building: geojson, calibration }
  if (realConsumption) body.real_consumption = realConsumption
  if (realCoolingConsumption) body.real_cooling_consumption = realCoolingConsumption
  if (stationId) body.station_id = stationId
  const res = await fetch(`${BASE}/calibration/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
export async function analyzeRenovation(geojson, method = 'monthly', stationId = null, calibration = {}) {
  const body = { building: geojson, use_standard_scenarios: true, method }
  if (stationId) body.station_id = stationId
  if (calibration && Object.keys(calibration).length) body.calibration = calibration
  const res = await fetch(`${BASE}/renovation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
