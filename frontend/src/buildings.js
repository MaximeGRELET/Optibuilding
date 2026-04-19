/**
 * Multi-building state management.
 * Owns zones, analysis results, calibration, renovation and saved scenarios per building.
 */

const BUILDING_PALETTE = [
  '#4f80ff', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#06b6d4',
]
// Each building gets its own zone sub-palette (shades of the building color)
const ZONE_PALETTES = [
  ['#4f80ff', '#2196f3', '#00bcd4', '#0097a7'],
  ['#f59e0b', '#ff8c00', '#ff6b35', '#e64a19'],
  ['#10b981', '#4caf50', '#8bc34a', '#cddc39'],
  ['#f43f5e', '#e91e63', '#f06292', '#ff80ab'],
  ['#8b5cf6', '#9c27b0', '#ba68c8', '#ce93d8'],
  ['#06b6d4', '#00bcd4', '#4dd0e1', '#80deea'],
]

/** @type {Map<string, object>} */
const _buildings = new Map()
let _activeBuildingId = null
let _nextId = 1

// ── Building CRUD ─────────────────────────────────────────────────────────────

export function createBuilding(name) {
  const id = `building_${_nextId++}`
  const idx = (_buildings.size) % BUILDING_PALETTE.length
  const building = {
    id,
    name: name || `Bâtiment ${_nextId - 1}`,
    color: BUILDING_PALETTE[idx],
    zonePalette: ZONE_PALETTES[idx],
    zones: new Map(),
    colorIndex: 0,
    // Results
    stationId: null,
    analysis: null,
    calibration: {},
    renovation: null,
    savedScenarios: [],
    maxReachedStep: 1,
  }
  _buildings.set(id, building)
  if (!_activeBuildingId) _activeBuildingId = id
  return building
}

export function deleteBuilding(id) {
  _buildings.delete(id)
  if (_activeBuildingId === id) {
    _activeBuildingId = _buildings.size > 0 ? _buildings.keys().next().value : null
  }
}

export function setActiveBuilding(id) {
  if (_buildings.has(id)) _activeBuildingId = id
}

export function getActiveBuilding() {
  return _activeBuildingId ? (_buildings.get(_activeBuildingId) ?? null) : null
}

export function getAllBuildings() {
  return Array.from(_buildings.values())
}

export function hasBuildings() {
  return _buildings.size > 0
}

// ── Zone ops (operate on active building) ─────────────────────────────────────

export function addZone(feature) {
  const b = getActiveBuilding()
  if (!b) return null
  const color = b.zonePalette[b.colorIndex++ % b.zonePalette.length]
  const n = b.zones.size + 1
  const zone = {
    id: feature.id,
    geometry: feature.geometry,   // stored so we can restore draw on switch
    color,
    buildingId: b.id,
    label: `Zone ${n}`,
    properties: {
      zone_id: `zone_${n}`,
      zone_type: 'residential',
      height_m: 3.0,
      floors: 1,
      construction_year: 1975,
      is_ground_floor: true,
      has_roof: true,
      energy_system_type: 'gas_boiler',
      cooling_system_type: 'split_ac',
      infiltration_level: 'standard',
      has_cooling: false,
      heating_setpoint_c: 19.0,
      cooling_setpoint_c: 26.0,
    },
  }
  b.zones.set(feature.id, zone)
  return zone
}

export function getZone(id) {
  return getActiveBuilding()?.zones.get(id) ?? null
}

export function removeZone(id) {
  getActiveBuilding()?.zones.delete(id)
}

export function getAllZones() {
  return Array.from(getActiveBuilding()?.zones.values() ?? [])
}

export function hasZones() {
  return (getActiveBuilding()?.zones.size ?? 0) > 0
}

export function updateZoneProps(id, formValues) {
  const zone = getActiveBuilding()?.zones.get(id)
  if (!zone) return
  zone.label = formValues.label || zone.label
  const props = {
    zone_type:          formValues.type,
    height_m:           parseFloat(formValues.height),
    floors:             Math.max(1, parseInt(formValues.floors) || 1),
    construction_year:  parseInt(formValues.year),
    is_ground_floor:    formValues.ground === 'true' || formValues.ground === true,
    has_roof:           formValues.roof === 'true' || formValues.roof === true,
    energy_system_type:  formValues.heating,
    cooling_system_type: formValues.cooling_system || 'split_ac',
    infiltration_level:  formValues.infiltration || 'standard',
    has_cooling:         formValues.has_cooling === true || formValues.has_cooling === 'true',
    heating_setpoint_c:  parseFloat(formValues.heating_setpoint_c) || 19.0,
    cooling_setpoint_c:  parseFloat(formValues.cooling_setpoint_c) || 26.0,
    ventilation_ach:     parseFloat(formValues.ventilation_ach) || 0.5,
    internal_gains_w_m2: parseFloat(formValues.internal_gains_w_m2) || 5.0,
  }
  // U-values overrides (only if user filled them)
  const uWalls   = parseFloat(formValues.u_walls)
  const uRoof    = parseFloat(formValues.u_roof)
  const uFloor   = parseFloat(formValues.u_floor)
  const uWindows = parseFloat(formValues.u_windows)
  if (!isNaN(uWalls))   props.u_walls_override   = uWalls
  if (!isNaN(uRoof))    props.u_roof_override    = uRoof
  if (!isNaN(uFloor))   props.u_floor_override   = uFloor
  if (!isNaN(uWindows)) props.u_windows_override = uWindows
  Object.assign(zone.properties, props)
}

// Also update stored geometry when draw modifies a polygon
export function updateZoneGeometry(id, geometry) {
  const zone = getActiveBuilding()?.zones.get(id)
  if (zone) zone.geometry = geometry
}

// ── Results storage ───────────────────────────────────────────────────────────

export function setAnalysis(analysis, stationId) {
  const b = getActiveBuilding()
  if (!b) return
  b.analysis = analysis
  b.stationId = stationId ?? b.stationId
}

export function setCalibration(calibration) {
  const b = getActiveBuilding()
  if (b) b.calibration = calibration
}

export function setRenovation(renovation) {
  const b = getActiveBuilding()
  if (b) b.renovation = renovation
}

export function addSavedScenario(entry) {
  getActiveBuilding()?.savedScenarios.push(entry)
}

export function clearSavedScenarios() {
  const b = getActiveBuilding()
  if (b) b.savedScenarios = []
}

export function setMaxStep(n) {
  const b = getActiveBuilding()
  if (b) b.maxReachedStep = Math.max(b.maxReachedStep, n)
}

export function getMaxStep() {
  return getActiveBuilding()?.maxReachedStep ?? 1
}

// ── Snapshot save / restore ───────────────────────────────────────────────────

/** Full serialisable snapshot of all buildings (zones + results). */
export function snapshotBuildings() {
  const buildings = []
  for (const b of _buildings.values()) {
    buildings.push({
      id:           b.id,
      name:         b.name,
      color:        b.color,
      zonePalette:  b.zonePalette,
      colorIndex:   b.colorIndex,
      stationId:    b.stationId,
      maxReachedStep: b.maxReachedStep,
      calibration:  b.calibration,
      zones: Array.from(b.zones.values()).map(z => ({ ...z })),
    })
  }
  return {
    _type: 'optibuilding_snapshot_v1',
    activeBuildingId: _activeBuildingId,
    nextId: _nextId,
    buildings,
  }
}

/** Reset all state then restore from a snapshot. Returns list of restored zones (for draw). */
export function restoreSnapshot(snapshot) {
  _buildings.clear()
  _activeBuildingId = null

  if (!snapshot?.buildings?.length) return []

  for (const data of snapshot.buildings) {
    const b = {
      id:            data.id,
      name:          data.name,
      color:         data.color,
      zonePalette:   data.zonePalette || ZONE_PALETTES[0],
      colorIndex:    data.colorIndex  || 0,
      stationId:     data.stationId   || null,
      maxReachedStep: data.maxReachedStep || 1,
      calibration:   data.calibration || {},
      renovation:    null,
      savedScenarios: [],
      zones: new Map(),
    }
    for (const z of (data.zones || [])) {
      b.zones.set(z.id, z)
    }
    _buildings.set(b.id, b)
  }

  _activeBuildingId = snapshot.activeBuildingId || _buildings.keys().next().value
  _nextId = snapshot.nextId || (_buildings.size + 1)

  // Return all zone features of active building (for re-adding to draw)
  const active = _buildings.get(_activeBuildingId)
  return active ? Array.from(active.zones.values()) : []
}

/** Reset everything (used before opening a project). */
export function resetAllBuildings() {
  _buildings.clear()
  _activeBuildingId = null
  _nextId = 1
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

export function buildGeoJSON() {
  const b = getActiveBuilding()
  if (!b) return { type: 'FeatureCollection', features: [], properties: {} }

  const features = Array.from(b.zones.values()).map(zone => {
    const p = zone.properties
    return {
      type: 'Feature',
      geometry: zone.geometry,
      properties: {
        zone_id:            p.zone_id || zone.id,
        building_id:        b.id,
        zone_type:          p.zone_type,
        zone_label:         zone.label,
        height_m:           p.height_m,
        construction_year:  p.construction_year,
        floors:             p.floors || Math.max(1, Math.round(p.height_m / 3)),
        is_ground_floor:    p.is_ground_floor,
        has_roof:           p.has_roof,
        has_cooling:         p.has_cooling ?? false,
        heating_setpoint_c:  p.heating_setpoint_c ?? (p.zone_type === 'residential' ? 19.0 : 18.0),
        cooling_setpoint_c:  p.cooling_setpoint_c ?? 26.0,
        cooling_system_type: p.cooling_system_type || 'split_ac',
        thermal_mass_class:  _massFromYear(p.construction_year),
        infiltration_ach:    _infiltrationFromLevel(p.infiltration_level, p.construction_year),
        ventilation_ach:     p.ventilation_ach ?? 0.5,
        internal_gains_w_m2: p.internal_gains_w_m2 ?? 5.0,
        energy_systems:      _buildEnergySystems(p),
        envelope:           _envelopeWithOverrides(p),
      },
    }
  })

  return { type: 'FeatureCollection', features, properties: { building_id: b.id } }
}

// ── Map helpers ───────────────────────────────────────────────────────────────

/** Returns color of a zone given its feature ID (searches all buildings). */
export function getZoneColor(featureId) {
  for (const b of _buildings.values()) {
    const z = b.zones.get(featureId)
    if (z) return z.color
  }
  return '#4f80ff'
}

/** GeoJSON for all inactive buildings (for static map overlay). */
export function getInactiveBuildingsGeoJSON() {
  return getAllBuildings()
    .filter(b => b.id !== _activeBuildingId && b.zones.size > 0)
    .map(b => ({
      id: b.id,
      color: b.color,
      geojson: {
        type: 'FeatureCollection',
        features: Array.from(b.zones.values()).map(z => ({
          type: 'Feature',
          geometry: z.geometry,
          properties: { color: b.color, name: b.name },
        })),
      },
    }))
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _massFromYear(y) {
  if (y < 1950) return 'heavy'
  if (y < 1975) return 'medium'
  if (y < 2000) return 'light'
  return 'medium'
}

function _infiltrationFromLevel(level, year) {
  const base = _baseInfil(year)
  if (level === 'tight')  return Math.max(0.15, base * 0.5)
  if (level === 'leaky')  return Math.min(2.0, base * 1.6)
  return base
}

function _baseInfil(year) {
  if (year < 1975) return 1.0
  if (year < 2000) return 0.7
  if (year < 2012) return 0.5
  return 0.3
}

function _systemFromType(type) {
  const s = {
    gas_boiler:       { system_id: 'boiler', type: 'gas_boiler',       covers: ['heating'], efficiency_nominal: 0.87,  fuel: 'natural_gas' },
    heat_pump:        { system_id: 'pac',    type: 'heat_pump',        covers: ['heating'], efficiency_nominal: 3.2,   fuel: 'electricity' },
    electric_direct:  { system_id: 'elec',   type: 'electric_direct',  covers: ['heating'], efficiency_nominal: 1.0,   fuel: 'electricity' },
    district_heating: { system_id: 'rcu',    type: 'district_heating', covers: ['heating'], efficiency_nominal: 0.95,  fuel: 'district_heat' },
  }
  return s[type] || s.gas_boiler
}

const _COOLING_SYSTEM_CONFIGS = {
  split_ac:         { type: 'split_ac',         covers: ['cooling'], efficiency_nominal: 2.8, fuel: 'electricity' },
  multisplit:       { type: 'multisplit',        covers: ['cooling'], efficiency_nominal: 3.0, fuel: 'electricity' },
  reversible_hp:    { type: 'reversible_hp',     covers: ['heating', 'cooling'], efficiency_nominal: 3.5, fuel: 'electricity' },
  district_cooling: { type: 'district_cooling',  covers: ['cooling'], efficiency_nominal: 1.0, fuel: 'district_cold' },
}

function _buildEnergySystems(p) {
  const heatType = p.energy_system_type || 'gas_boiler'
  const coolType = p.cooling_system_type || 'split_ac'
  const hasCooling = p.has_cooling ?? false

  // PAC réversible : un seul système pour chauffage + froid
  if (hasCooling && coolType === 'reversible_hp') {
    return [{ system_id: 'reversible_hp', type: 'reversible_hp', covers: ['heating', 'cooling'], efficiency_nominal: 3.5, fuel: 'electricity' }]
  }

  const systems = [{ system_id: heatType, ...(_systemFromType(heatType)) }]
  if (hasCooling) {
    const cool = _COOLING_SYSTEM_CONFIGS[coolType] || _COOLING_SYSTEM_CONFIGS.split_ac
    systems.push({ system_id: coolType, ...cool })
  }
  return systems
}

function _envelopeWithOverrides(p) {
  const base = _envelopeFromYear(p.construction_year)
  if (p.u_walls_override != null)   base.walls.u_override   = p.u_walls_override
  if (p.u_roof_override != null)    base.roof.u_override    = p.u_roof_override
  if (p.u_floor_override != null)   base.ground_floor.u_override = p.u_floor_override
  if (p.u_windows_override != null) base.windows.u_value_w_m2k  = p.u_windows_override
  return base
}

function _envelopeFromYear(year) {
  if (year < 1975) return {
    walls:        { layers: [{ material_id: 'brick_hollow',   thickness_m: 0.22 }] },
    roof:         { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }] },
    ground_floor: { layers: [{ material_id: 'concrete_dense', thickness_m: 0.25 }] },
    windows:      { u_value_w_m2k: 4.5, g_value: 0.75, wwr_by_orientation: { S: 0.20, N: 0.10, E: 0.15, O: 0.15 } },
  }
  if (year < 1990) return {
    walls:        { layers: [{ material_id: 'brick_hollow', thickness_m: 0.22 }, { material_id: 'mineral_wool', thickness_m: 0.04 }] },
    roof:         { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.06 }] },
    ground_floor: { layers: [{ material_id: 'concrete_dense', thickness_m: 0.25 }] },
    windows:      { u_value_w_m2k: 2.8, g_value: 0.65, wwr_by_orientation: { S: 0.25, N: 0.10, E: 0.15, O: 0.15 } },
  }
  if (year < 2012) return {
    walls:        { layers: [{ material_id: 'brick_hollow', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.10 }] },
    roof:         { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.14 }] },
    ground_floor: { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'eps_insulation', thickness_m: 0.06 }] },
    windows:      { u_value_w_m2k: 1.8, g_value: 0.60, wwr_by_orientation: { S: 0.28, N: 0.12, E: 0.18, O: 0.18 } },
  }
  return {
    walls:        { layers: [{ material_id: 'brick_hollow', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.18 }] },
    roof:         { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.25 }] },
    ground_floor: { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'eps_insulation', thickness_m: 0.12 }] },
    windows:      { u_value_w_m2k: 1.1, g_value: 0.55, wwr_by_orientation: { S: 0.30, N: 0.12, E: 0.20, O: 0.20 } },
  }
}
