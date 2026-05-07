import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { drainCollisionEvents } from './collision-events'
import { BodyRegistry } from '../engine/body-registry'
import { EventBus, type GameEvent } from '../engine/events'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'

describe('drainCollisionEvents', () => {
  let world: RAPIER.World
  let queue: RAPIER.EventQueue
  let registry: BodyRegistry
  let bus: EventBus
  let received: GameEvent[]

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    queue = new RAPIER.EventQueue(true)
    registry = new BodyRegistry()
    bus = new EventBus()
    received = []
    bus.on('COLLISION', e => received.push(e))
  })

  function spawnAt(tag: string, x: number, vx: number) {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, x, 0, vx, 0, 10, {
      enableCollisionEvents: true,
    })
    registry.add(tag, spawned)
    return spawned
  }

  it('emits COLLISION event when two bodies collide above threshold', () => {
    spawnAt('ship', -20, 100)        // moves right
    spawnAt('asteroid', 20, -100)    // moves left
    // Step world until they collide
    for (let i = 0; i < 100; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 0)
      if (received.length > 0) break
    }
    expect(received.length).toBeGreaterThan(0)
    const event = received[0]
    expect(event.type).toBe('COLLISION')
    expect(event.energy).toBeGreaterThan(0)
    const tags = event.tags as string[]
    expect(tags).toContain('ship')
    expect(tags).toContain('asteroid')
  })

  it('does not emit when energy is below threshold', () => {
    spawnAt('ship', -20, 1)          // very slow
    spawnAt('asteroid', 20, -1)
    for (let i = 0; i < 100; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 10000)  // huge threshold
    }
    expect(received).toEqual([])
  })

  it('event position is midpoint of contacting bodies', () => {
    spawnAt('a', -20, 100)
    spawnAt('b', 20, -100)
    for (let i = 0; i < 100; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 0)
      if (received.length > 0) break
    }
    const event = received[0]
    // Midpoint of two 1x1 bodies of cellScale 10 colliding around the origin
    // should land within a few units of (0, 0) given symmetric speeds.
    expect(Math.abs(event.x)).toBeLessThan(5)
    expect(Math.abs(event.y)).toBeLessThan(5)
  })
})
