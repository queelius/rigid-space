import RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from '../engine/body-registry'
import type { EventBus } from '../engine/events'

/**
 * Drain Rapier's collision event queue and emit COLLISION events
 * on the EventBus when impact energy meets the threshold.
 *
 * Energy = 0.5 * (m1 + m2) * |v1 - v2|^2 (kinetic-energy-shaped scalar).
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
    const energy = 0.5 * (b1.mass() + b2.mass()) * relSpeed * relSpeed
    if (energy < energyThreshold) return

    const t1 = b1.translation()
    const t2 = b2.translation()
    const tag1 = registry.findByBody(b1)?.tag
    const tag2 = registry.findByBody(b2)?.tag

    events.emit({
      type: 'COLLISION',
      x: (t1.x + t2.x) * 0.5,
      y: (t1.y + t2.y) * 0.5,
      energy,
      tags: [tag1, tag2],
    })
  })
}
