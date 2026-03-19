import RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from './body-registry'

const MIN_DIST = 5

export function applyGravity(
  registry: BodyRegistry,
  G: number,
  attractorTag?: string,
): void {
  if (attractorTag) {
    applyTaggedGravity(registry, G, attractorTag)
  } else {
    applyPairwiseGravity(registry, G)
  }
}

function applyTaggedGravity(
  registry: BodyRegistry,
  G: number,
  attractorTag: string,
): void {
  const attractors = registry.getByTag(attractorTag)
  if (attractors.length === 0) return

  for (const entry of registry) {
    if (entry.tag === attractorTag) continue
    if (entry.spawned.body.isKinematic()) continue

    const body = entry.spawned.body
    const pos = body.translation()

    for (const attractor of attractors) {
      const aPos = attractor.spawned.body.translation()
      const dx = aPos.x - pos.x
      const dy = aPos.y - pos.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)
      if (dist < MIN_DIST) continue

      // Attractor mass omitted intentionally: G constant is tuned to include it.
      // Matches the PoC formula. Full pairwise mode uses both masses.
      const force = G * body.mass() / distSq
      body.addForce(
        new RAPIER.Vector2(force * dx / dist, force * dy / dist),
        true,
      )
    }
  }
}

function applyPairwiseGravity(
  registry: BodyRegistry,
  G: number,
): void {
  const entries = registry.all()
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i].spawned.body
    const aPos = a.translation()
    const aKinematic = a.isKinematic()

    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j].spawned.body
      const bPos = b.translation()
      const bKinematic = b.isKinematic()

      if (aKinematic && bKinematic) continue

      const dx = bPos.x - aPos.x
      const dy = bPos.y - aPos.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)
      if (dist < MIN_DIST) continue

      const massA = a.mass()
      const massB = b.mass()
      const forceMag = G * massA * massB / distSq
      const fx = forceMag * dx / dist
      const fy = forceMag * dy / dist

      if (!aKinematic) {
        a.addForce(new RAPIER.Vector2(fx, fy), true)
      }
      if (!bKinematic) {
        b.addForce(new RAPIER.Vector2(-fx, -fy), true)
      }
    }
  }
}
