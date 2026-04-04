/**
 * Catalog of available renovation actions.
 * Each action defines its id, label, icon, params with defaults + UI controls.
 */

export const ACTIONS_CATALOG = [
  {
    id: 'insulate_walls',
    label: 'Isolation des murs',
    icon: '🧱',
    description: 'ITE (par l\'extérieur) ou ITI (par l\'intérieur)',
    params: [
      {
        key: 'thickness_m', label: 'Épaisseur (cm)', type: 'range',
        min: 0.06, max: 0.40, step: 0.02, default: 0.14,
        display: v => `${Math.round(v * 100)} cm`,
      },
      {
        key: 'material_id', label: 'Matériau', type: 'select',
        default: 'mineral_wool',
        options: [
          { value: 'mineral_wool',  label: 'Laine minérale' },
          { value: 'glass_wool',    label: 'Laine de verre' },
          { value: 'eps_insulation',label: 'Polystyrène (EPS)' },
          { value: 'xps_insulation',label: 'Polystyrène (XPS)' },
          { value: 'wood_fiber',    label: 'Fibre de bois' },
        ],
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 10000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 20000, min: 0, step: 500,
      },
    ],
  },
  {
    id: 'insulate_roof',
    label: 'Isolation toiture',
    icon: '🏠',
    description: 'Isolation des combles ou toiture-terrasse',
    params: [
      {
        key: 'thickness_m', label: 'Épaisseur (cm)', type: 'range',
        min: 0.10, max: 0.40, step: 0.02, default: 0.25,
        display: v => `${Math.round(v * 100)} cm`,
      },
      {
        key: 'material_id', label: 'Matériau', type: 'select',
        default: 'mineral_wool',
        options: [
          { value: 'mineral_wool',   label: 'Laine minérale' },
          { value: 'glass_wool',     label: 'Laine de verre' },
          { value: 'cellulose',      label: 'Ouate de cellulose' },
          { value: 'wood_fiber',     label: 'Fibre de bois' },
          { value: 'eps_insulation', label: 'Polystyrène (EPS)' },
        ],
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 5000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 8000, min: 0, step: 500,
      },
    ],
  },
  {
    id: 'insulate_floor',
    label: 'Isolation plancher bas',
    icon: '⬛',
    description: 'Isolation sous dalle ou vide sanitaire',
    params: [
      {
        key: 'thickness_m', label: 'Épaisseur (cm)', type: 'range',
        min: 0.04, max: 0.20, step: 0.02, default: 0.10,
        display: v => `${Math.round(v * 100)} cm`,
      },
      {
        key: 'material_id', label: 'Matériau', type: 'select',
        default: 'eps_insulation',
        options: [
          { value: 'eps_insulation', label: 'Polystyrène (EPS)' },
          { value: 'xps_insulation', label: 'Polystyrène (XPS)' },
          { value: 'mineral_wool',   label: 'Laine minérale' },
        ],
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 4000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 7000, min: 0, step: 500,
      },
    ],
  },
  {
    id: 'replace_windows',
    label: 'Remplacement vitrages',
    icon: '🪟',
    description: 'Double ou triple vitrage argon, menuiseries PVC/alu',
    params: [
      {
        key: 'new_uw_w_m2k', label: 'U vitrage (W/m²K)', type: 'range',
        min: 0.6, max: 3.0, step: 0.1, default: 1.3,
        display: v => `${v.toFixed(1)} W/m²K`,
      },
      {
        key: 'g_value', label: 'Facteur solaire g', type: 'range',
        min: 0.3, max: 0.7, step: 0.05, default: 0.6,
        display: v => v.toFixed(2),
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 8000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 15000, min: 0, step: 500,
      },
    ],
  },
  {
    id: 'replace_heating',
    label: 'Système de chauffage',
    icon: '🔥',
    description: 'Remplacement de la chaudière ou de l\'émetteur',
    params: [
      {
        key: 'system_type', label: 'Nouveau système', type: 'select',
        default: 'heat_pump',
        options: [
          { value: 'heat_pump',       label: 'Pompe à chaleur' },
          { value: 'gas_boiler',      label: 'Chaudière gaz condensation' },
          { value: 'district_heating',label: 'Réseau de chaleur' },
        ],
      },
      {
        key: 'efficiency', label: 'COP / rendement', type: 'range',
        min: 0.9, max: 4.5, step: 0.1, default: 3.2,
        display: v => v.toFixed(1),
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 8000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 14000, min: 0, step: 500,
      },
    ],
  },
  {
    id: 'install_mvhr',
    label: 'VMC double flux',
    icon: '💨',
    description: 'Ventilation mécanique avec récupération de chaleur',
    params: [
      {
        key: 'heat_recovery_efficiency', label: 'Efficacité (%)', type: 'range',
        min: 0.60, max: 0.95, step: 0.05, default: 0.85,
        display: v => `${Math.round(v * 100)} %`,
      },
      {
        key: 'cost_min_eur', label: 'Coût min (€)', type: 'number',
        default: 3000, min: 0, step: 500,
      },
      {
        key: 'cost_max_eur', label: 'Coût max (€)', type: 'number',
        default: 5000, min: 0, step: 500,
      },
    ],
  },
]

/** Returns a fresh copy of default param values for an action. */
export function defaultParams(action) {
  return Object.fromEntries(action.params.map(p => [p.key, p.default]))
}
