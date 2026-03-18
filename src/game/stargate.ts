import type { RigidComposite } from '../engine/rigid-composite'
import type { Particles } from '../engine/particles'

export class Stargate {
  rigidComposite: RigidComposite
  particles: Particles
  destinationSystemId: number
  destinationName: string
  activationRadius: number

  constructor(
    rigidComposite: RigidComposite,
    particles: Particles,
    destinationSystemId: number,
    destinationName: string,
    activationRadius = 300,
  ) {
    this.rigidComposite = rigidComposite
    this.particles = particles
    this.destinationSystemId = destinationSystemId
    this.destinationName = destinationName
    this.activationRadius = activationRadius
  }

  /** Check if position (x, y) is within activation range of this gate. */
  isInRange(x: number, y: number): boolean {
    const repIdx = this.rigidComposite.repIdx
    const gx = this.particles.x[repIdx]
    const gy = this.particles.y[repIdx]
    const dx = x - gx
    const dy = y - gy
    return dx * dx + dy * dy <= this.activationRadius * this.activationRadius
  }
}

/** Find the nearest in-range stargate to position (x, y). Returns null if none. */
export function findNearestGate(
  stargates: Stargate[], x: number, y: number,
): Stargate | null {
  let best: Stargate | null = null
  let bestDist = Infinity
  for (const gate of stargates) {
    if (!gate.isInRange(x, y)) continue
    const repIdx = gate.rigidComposite.repIdx
    const dx = x - gate.particles.x[repIdx]
    const dy = y - gate.particles.y[repIdx]
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = gate
    }
  }
  return best
}
