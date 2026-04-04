/**
 * Zone state management.
 * Each zone = a drawn polygon + user-defined properties.
 */

// Zone colors palette
const COLORS = [
  '#4f80ff', '#f59e0b', '#10b981', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#84cc16', '#fb923c',
]

/** @type {Map<string, {id, color, label, properties}>} */
const zones = new Map()
let colorIndex = 0

/**
 * Add a zone from a drawn feature.
 * @param {GeoJSON.Feature} feature  from MapLibre Draw
 * @returns {{id, color, label, properties}}
 */
export function addZone(feature) {
  const id = feature.id
  const color = COLORS[colorIndex++ % COLORS.length]
  const n = zones.size + 1
  const zone = {
    id,
    color,
    label: `Zone ${n}`,
    properties: {
      zone_id: `zone_${n}`,
      zone_type: 'residential',
      height_m: 3.0,
      construction_year: 1975,
      is_ground_floor: true,
      has_roof: true,
      energy_system_type: 'gas_boiler',
    },
  }
  zones.set(id, zone)
  return zone
}

export function getZone(id) { return zones.get(id) }
export function removeZone(id) { zones.delete(id) }
export function getAllZones() { return Array.from(zones.values()) }
export function hasZones() { return zones.size > 0 }

/** Update user-facing properties from form values. */
export function updateZoneProps(id, formValues) {
  const zone = zones.get(id)
  if (!zone) return
  zone.label = formValues.label || zone.label
  zone.properties = {
    ...zone.properties,
    zone_type: formValues.type,
    height_m: parseFloat(formValues.height),
    construction_year: parseInt(formValues.year),
    is_ground_floor: formValues.ground === 'true',
    has_roof: formValues.roof === 'true',
    energy_system_type: formValues.heating,
  }
}

/**
 * Build a GeoJSON FeatureCollection from drawn features + stored props.
 * @param {GeoJSON.Feature[]} drawnFeatures  raw features from MapLibre Draw
 * @returns {GeoJSON.FeatureCollection}
 */
export function buildGeoJSON(drawnFeatures) {
  const features = drawnFeatures.map((feat) => {
    const zone = zones.get(feat.id)
    if (!zone) return null

    const p = zone.properties
    const n = zone.label

    return {
      type: 'Feature',
      geometry: feat.geometry,
      properties: {
        zone_id: p.zone_id || `zone_${feat.id}`,
        building_id: 'building_001',
        zone_type: p.zone_type,
        zone_label: n,
        height_m: p.height_m,
        construction_year: p.construction_year,
        floors: Math.max(1, Math.round(p.height_m / 3)),
        is_ground_floor: p.is_ground_floor,
        has_roof: p.has_roof,
        heating_setpoint_c: p.zone_type === 'residential' ? 19.0 : 18.0,
        cooling_setpoint_c: 26.0,
        thermal_mass_class: _massFromYear(p.construction_year),
        infiltration_ach: _infiltrationFromYear(p.construction_year),
        energy_system: _systemFromType(p.energy_system_type),
        envelope: _envelopeFromYear(p.construction_year),
      },
    }
  }).filter(Boolean)

  return {
    type: 'FeatureCollection',
    features,
    properties: { building_id: 'building_001' },
  }
}

// ── Defaults by construction year ─────────────────────────────────────────

function _massFromYear(year) {
  if (year < 1950) return 'heavy'
  if (year < 1975) return 'medium'
  if (year < 2000) return 'light'
  return 'medium'
}

function _infiltrationFromYear(year) {
  if (year < 1975) return 1.0
  if (year < 2000) return 0.7
  if (year < 2012) return 0.5
  return 0.3
}

function _systemFromType(type) {
  const systems = {
    gas_boiler:      { system_id: 'boiler', type: 'gas_boiler',       covers: 'heating', efficiency_nominal: 0.87, fuel: 'natural_gas' },
    heat_pump:       { system_id: 'pac',    type: 'heat_pump',        covers: 'heating', efficiency_nominal: 3.2,  fuel: 'electricity' },
    electric_direct: { system_id: 'elec',   type: 'electric_direct',  covers: 'heating', efficiency_nominal: 1.0,  fuel: 'electricity' },
    district_heating:{ system_id: 'rcu',    type: 'district_heating', covers: 'heating', efficiency_nominal: 0.95, fuel: 'district_heat' },
  }
  return systems[type] || systems.gas_boiler
}

function _envelopeFromYear(year) {
  // Wall, roof, floor U-values improve with era
  if (year < 1975) {
    return {
      walls:       { layers: [{ material_id: 'brick_hollow', thickness_m: 0.22 }] },
      roof:        { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }] },
      ground_floor:{ layers: [{ material_id: 'concrete_dense', thickness_m: 0.25 }] },
      windows:     { u_value_w_m2k: 4.5, g_value: 0.75, wwr_by_orientation: { S: 0.20, N: 0.10, E: 0.15, O: 0.15 } },
    }
  }
  if (year < 1990) {
    return {
      walls:       { layers: [{ material_id: 'brick_hollow', thickness_m: 0.22 }, { material_id: 'mineral_wool', thickness_m: 0.04 }] },
      roof:        { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.06 }] },
      ground_floor:{ layers: [{ material_id: 'concrete_dense', thickness_m: 0.25 }] },
      windows:     { u_value_w_m2k: 2.8, g_value: 0.65, wwr_by_orientation: { S: 0.25, N: 0.10, E: 0.15, O: 0.15 } },
    }
  }
  if (year < 2012) {
    return {
      walls:       { layers: [{ material_id: 'brick_hollow', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.10 }] },
      roof:        { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.14 }] },
      ground_floor:{ layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'eps_insulation', thickness_m: 0.06 }] },
      windows:     { u_value_w_m2k: 1.8, g_value: 0.60, wwr_by_orientation: { S: 0.28, N: 0.12, E: 0.18, O: 0.18 } },
    }
  }
  // RT 2012 / RE 2020
  return {
    walls:       { layers: [{ material_id: 'brick_hollow', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.18 }] },
    roof:        { layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'mineral_wool', thickness_m: 0.25 }] },
    ground_floor:{ layers: [{ material_id: 'concrete_dense', thickness_m: 0.20 }, { material_id: 'eps_insulation', thickness_m: 0.12 }] },
    windows:     { u_value_w_m2k: 1.1, g_value: 0.55, wwr_by_orientation: { S: 0.30, N: 0.12, E: 0.20, O: 0.20 } },
  }
}
