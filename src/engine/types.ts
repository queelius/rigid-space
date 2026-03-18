// Particle type enum + properties table
// Ported from include/space/types.h

import type { TypesConfig } from '../config/loader'

export const enum Type {
  ROCK = 0,
  IRON = 1,
  CARBON = 2,
  FUEL = 3,
  THRUSTER = 4,
  CRYSTAL = 5,
  EXPLOSIVE = 6,
  WATER = 7,
  EXOTIC = 8,
  // Ship-specific
  EMITTER = 9,    // directional: fires/thrusts based on facing
  COCKPIT = 10,   // control point (lose = lose control)
  CARGO = 11,     // holds mined materials
  REACTOR = 12,   // converts fuel to energy
  BLACKHOLE = 13,
  // Terrain types
  SOIL = 14,
  PLANT = 15,
  ICE = 16,
  SAND = 17,
  LAVA = 18,
  DRIVECORE = 19,
  COUNT = 20,
}

/** Canonical type name list. Order MUST match the Type enum. */
export const TYPE_NAMES = [
  'ROCK', 'IRON', 'CARBON', 'FUEL', 'THRUSTER', 'CRYSTAL',
  'EXPLOSIVE', 'WATER', 'EXOTIC', 'EMITTER', 'COCKPIT', 'CARGO',
  'REACTOR', 'BLACKHOLE', 'SOIL', 'PLANT', 'ICE', 'SAND', 'LAVA',
  'DRIVECORE',
] as const

export interface TypeProps {
  defaultMass: number
  bondStrength: number
}

// Derive name-to-enum mapping from the canonical TYPE_NAMES array
const TYPE_NAME_TO_ENUM: Record<string, Type> = {}
for (let i = 0; i < TYPE_NAMES.length; i++) {
  TYPE_NAME_TO_ENUM[TYPE_NAMES[i]] = i as Type
}

/** Look up a Type enum value by its string name. */
export function typeFromName(name: string): Type | undefined {
  return TYPE_NAME_TO_ENUM[name]
}

// Mutable properties table indexed by Type enum value.
// Default values match the YAML; applyTypeConfig() overwrites from config at startup.
const TYPE_PROPS_TABLE: TypeProps[] = [
  { defaultMass: 6.0, bondStrength: 700.0 },   // ROCK
  { defaultMass: 8.0, bondStrength: 1000.0 },   // IRON
  { defaultMass: 2.0, bondStrength: 400.0 },    // CARBON
  { defaultMass: 1.0, bondStrength: 100.0 },     // FUEL
  { defaultMass: 5.0, bondStrength: 600.0 },     // THRUSTER
  { defaultMass: 4.0, bondStrength: 200.0 },     // CRYSTAL
  { defaultMass: 3.0, bondStrength: 150.0 },     // EXPLOSIVE
  { defaultMass: 1.0, bondStrength: 50.0 },      // WATER
  { defaultMass: 4.0, bondStrength: 500.0 },     // EXOTIC
  { defaultMass: 4.0, bondStrength: 500.0 },     // EMITTER
  { defaultMass: 6.0, bondStrength: 800.0 },     // COCKPIT
  { defaultMass: 3.0, bondStrength: 300.0 },     // CARGO
  { defaultMass: 7.0, bondStrength: 600.0 },     // REACTOR
  { defaultMass: 1.0, bondStrength: 0.0 },       // BLACKHOLE
  { defaultMass: 3.0, bondStrength: 200.0 },     // SOIL
  { defaultMass: 1.0, bondStrength: 150.0 },     // PLANT
  { defaultMass: 1.5, bondStrength: 300.0 },     // ICE
  { defaultMass: 2.0, bondStrength: 80.0 },      // SAND
  { defaultMass: 6.0, bondStrength: 100.0 },     // LAVA
  { defaultMass: 50.0, bondStrength: 800.0 },   // DRIVECORE
]

export function typeProps(t: Type): TypeProps {
  return TYPE_PROPS_TABLE[t]
}

export function bondStiffness(a: Type, b: Type): number {
  return Math.min(TYPE_PROPS_TABLE[a].bondStrength, TYPE_PROPS_TABLE[b].bondStrength)
}

/** Overwrite runtime type properties from YAML config */
export function applyTypeConfig(config: TypesConfig): void {
  for (const [name, tc] of Object.entries(config.types)) {
    const enumVal = TYPE_NAME_TO_ENUM[name]
    if (enumVal === undefined) continue
    TYPE_PROPS_TABLE[enumVal] = {
      defaultMass: tc.mass,
      bondStrength: tc.bond_strength,
    }
  }
}
