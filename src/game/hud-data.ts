import type { Particles } from '../engine/particles'
import type { Composites } from '../engine/composite'
import { Type } from '../engine/types'

export interface HUDData {
  speed: number
  maxTemp: number
  totalHeat: number
  fuelCount: number
}

/**
 * Compute HUD telemetry data from the ship's composite.
 * Returns speed, max temperature, total heat, and fuel count
 * for the ship hull's composite.
 */
export function computeHUDData(
  shipHull: number,
  p: Particles,
  comp: Composites,
  cid: number,
): HUDData {
  const ci = comp.get(cid)

  let bulkVx = 0, bulkVy = 0
  for (let i = 0; i < p.count; i++) {
    if (comp.compositeOf(i) === cid) {
      bulkVx += p.vx[i] * p.mass[i]
      bulkVy += p.vy[i] * p.mass[i]
    }
  }
  if (ci.totalMass > 0) {
    bulkVx /= ci.totalMass
    bulkVy /= ci.totalMass
  }
  const speed = Math.sqrt(bulkVx * bulkVx + bulkVy * bulkVy)

  let maxTemp = 0, totalHeat = 0, fuelCount = 0
  for (let i = 0; i < p.count; i++) {
    if (comp.compositeOf(i) === cid) {
      totalHeat += p.heat[i]
      const temp = p.temperature(i)
      if (temp > maxTemp) maxTemp = temp
      if (p.type[i] === Type.FUEL && p.mass[i] > 0.1) fuelCount++
    }
  }

  void shipHull  // reserved for future use (e.g., hull-specific telemetry)

  return { speed, maxTemp, totalHeat, fuelCount }
}
