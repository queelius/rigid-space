import RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from '../engine/body-registry'
import type { EventBus } from '../engine/events'

/**
 * Drain Rapier's collision event queue and emit COLLISION events
 * on the EventBus when impact energy meets the threshold.
 *
 * Energy = 0.5 * m_reduced * |v1 - v2|^2 where m_reduced = m1*m2/(m1+m2).
 * Reduced-mass form ensures kinematic bodies (e.g. the star) do not dominate
 * the energy; their effectively-infinite mass collapses m_reduced to just the
 * dynamic body's mass.
 * Position = midpoint of body translations.
 *
 * Known limitation: linvel() is read post-step, so the relative speed reflects the
 * post-impulse (bounced-apart) velocities, which are attenuated by restitution. The
 * value is still useful as a relative ranking for game-feel gating but is not a
 * physically accurate impact energy. Future work may switch to drainContactForceEvents
 * for direct impulse measurement.
 *
 * Tags are resolved via registry.findByBody. Should be called once per fixedUpdate
 * immediately after world.step(eventQueue).
 */
export function drainCollisionEvents(
  world: RAPIER.World,
  queue: RAPIER.EventQueue,
  registry: BodyRegistry,
  events: EventBus,
  energyThreshold: number,
): void {
  queue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return
    const c1 = world.getCollider(h1)
    const c2 = world.getCollider(h2)
    if (!c1 || !c2) return
    const b1 = c1.parent()
    const b2 = c2.parent()
    if (!b1 || !b2) return

    const v1 = b1.linvel()
    const v2 = b2.linvel()
    const dvx = v1.x - v2.x
    const dvy = v1.y - v2.y
    const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy)
    const m1 = b1.mass()
    const m2 = b2.mass()
    // Reduced-mass form of kinetic energy, m_reduced = m1*m2/(m1+m2).
    // For kinematic bodies (effectively infinite mass), m_reduced -> the dynamic body's mass.
    const sumMass = m1 + m2
    const reducedMass = sumMass > 0 ? (m1 * m2) / sumMass : 0
    const energy = 0.5 * reducedMass * relSpeed * relSpeed
    if (energy < energyThreshold) return

    const t1 = b1.translation()
    const t2 = b2.translation()
    const entry1 = registry.findByBody(b1)
    const entry2 = registry.findByBody(b2)

    events.emit({
      type: 'COLLISION',
      x: (t1.x + t2.x) * 0.5,
      y: (t1.y + t2.y) * 0.5,
      energy,
      tags: [entry1?.tag, entry2?.tag],
      ids: [entry1?.id, entry2?.id],
    })
  })
}
