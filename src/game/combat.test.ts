import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import type { Container } from 'pixi.js'
import { Combat } from './combat'
import { Ship } from './ship'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'
import { BodyRegistry } from '../engine/body-registry'
import { EventBus, type GameEvent } from '../engine/events'
import type { GameContext } from './game-context'
import type { GameConfig } from '../config/loader'
import type { RegistryEntry } from '../engine/body-registry'

/** Stub Container that records addChild calls without requiring PixiJS's runtime. */
function makeMockContainer(): Container {
  return {
    addChild: vi.fn(),
  } as unknown as Container
}

function makeMockRenderer(): GameContext['renderer'] {
  return {
    onBodyAdded: vi.fn(),
    onBodyRemoved: vi.fn(),
    renderBodies: vi.fn(),
    resize: vi.fn(),
  } as unknown as GameContext['renderer']
}

function makeShipConfig() {
  return {
    thrust_strength: 1500, rotation_rate: 3, max_speed: 250,
    linear_damping: 0, angular_damping: 5, reverse_thrust_factor: 0.5,
    cannon: { mass: 1, speed: 400, cooldown: 0.3, lifetime: 3.0, energy: 1.0 },
  }
}

function makeConfig(): GameConfig {
  return {
    gameplay: {
      ship: makeShipConfig(),
      physics: { substeps: 4, timestep: 0.016, gravity_constant: 1000000 },
      collision: { restitution: 0.5, heat_fraction: 0.1, break_threshold: 500, event_threshold: 100 },
    },
  } as unknown as GameConfig
}

describe('Combat', () => {
  let world: RAPIER.World
  let registry: BodyRegistry
  let bus: EventBus
  let ctx: GameContext
  let combat: Combat

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    registry = new BodyRegistry()
    bus = new EventBus()
    combat = new Combat(makeMockContainer())
    ctx = {
      app: null as never, hudCanvas: null as never,
      rapierWorld: world, eventQueue: new RAPIER.EventQueue(true),
      registry, ship: undefined,
      input: null as never, screenStack: null as never,
      events: bus, config: makeConfig(),
      renderer: makeMockRenderer(),
      camera: null as never, soundEngine: null as never,
      combat,
    }
  })

  function spawnShip(): Ship {
    const grid = new GridComposite(3, 5)
    grid.set(1, 4, Type.COCKPIT)
    grid.set(0, 2, Type.THRUSTER)
    grid.set(2, 2, Type.THRUSTER)
    grid.set(1, 2, Type.REACTOR)
    grid.set(1, 1, Type.FUEL)
    grid.set(1, 0, Type.FUEL)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, { enableCollisionEvents: true })
    const id = registry.add('ship', spawned)
    const ship = new Ship(id, spawned, makeShipConfig())
    ctx.ship = ship
    return ship
  }

  function spawnAsteroidAt(x: number, y: number, size = 2): RegistryEntry {
    const grid = new GridComposite(size, size)
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        grid.set(gx, gy, Type.ROCK)
      }
    }
    const spawned = spawnComposite(world, grid, x, y, 0, 0, 8, { enableCollisionEvents: true })
    const id = registry.add('asteroid', spawned)
    return registry.get(id)!
  }

  it('1. tryFireFromShip returns false when ship is not present', () => {
    expect(ctx.ship).toBeUndefined()
    expect(combat.tryFireFromShip(ctx)).toBe(false)
  })

  it('2. tryFireFromShip returns false when cooldown is active', () => {
    const ship = spawnShip()
    ship.markFired()  // cooldown = 0.3
    expect(combat.tryFireFromShip(ctx)).toBe(false)
  })

  it('3. tryFireFromShip spawns a projectile, marks fired, emits CANNON_FIRE', () => {
    spawnShip()
    const events: GameEvent[] = []
    bus.on('CANNON_FIRE', e => events.push(e))

    expect(combat.tryFireFromShip(ctx)).toBe(true)

    // Projectile is now in the registry as 'projectile'.
    const projectiles = registry.getByTag('projectile')
    expect(projectiles).toHaveLength(1)
    // Renderer was notified of the new body.
    expect(ctx.renderer.onBodyAdded).toHaveBeenCalledTimes(1)
    // Ship cooldown reset to its full duration.
    expect(ctx.ship!.canFire()).toBe(false)
    expect(ctx.ship!.cannonCooldown).toBeCloseTo(0.3, 6)
    // Event emitted with x/y at the spawn point and energy field from config.
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('CANNON_FIRE')
    expect(events[0].energy).toBe(1.0)
  })

  it('4. update despawns projectiles after their lifetime', () => {
    spawnShip()
    expect(combat.tryFireFromShip(ctx)).toBe(true)
    const beforeIds = registry.getByTag('projectile').map(e => e.id)
    expect(beforeIds).toHaveLength(1)
    const projId = beforeIds[0]

    // Tick just under the lifetime: projectile still alive.
    combat.update(ctx, 2.5)
    expect(registry.get(projId)).toBeDefined()

    // Tick past the lifetime: projectile despawns.
    combat.update(ctx, 1.0)
    expect(registry.get(projId)).toBeUndefined()
    expect(ctx.renderer.onBodyRemoved).toHaveBeenCalledWith(projId)
  })

  it('5. handleCollision removes closest cell on projectile-asteroid hit', () => {
    spawnShip()
    // Drop a 2x2 asteroid at origin, projectile id will be added next.
    const asteroid = spawnAsteroidAt(0, 0, 2)
    // Reach in: directly add a projectile for the test (avoid relying on physics step).
    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 0, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)

    // Pre-condition: asteroid has 4 cells.
    expect(asteroid.spawned.colliderMap.size).toBe(4)

    // Synthesize a COLLISION event at the asteroid's (+x, +y) corner: closest
    // cell should be (1, 1) given the body is at origin with rotation 0.
    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 8, y: 8,
      energy: 100,
      tags: ['projectile', 'asteroid'],
      ids: [projId, asteroid.id],
    })

    // One cell removed from the asteroid.
    expect(asteroid.spawned.colliderMap.size).toBe(3)
    // The (1, 1) cell at +x, +y in body frame is the closest one.
    expect(asteroid.spawned.grid.get(1, 1)).toBeNull()
    // Other three cells remain.
    expect(asteroid.spawned.grid.get(0, 0)).not.toBeNull()
    expect(asteroid.spawned.grid.get(0, 1)).not.toBeNull()
    expect(asteroid.spawned.grid.get(1, 0)).not.toBeNull()
  })

  it('6. handleCollision emits BOND_BREAK on damage', () => {
    spawnShip()
    const asteroid = spawnAsteroidAt(0, 0, 2)
    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 0, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)

    const breaks: GameEvent[] = []
    bus.on('BOND_BREAK', e => breaks.push(e))

    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 0, y: 0,
      energy: 250,
      tags: ['projectile', 'asteroid'],
      ids: [projId, asteroid.id],
    })

    expect(breaks).toHaveLength(1)
    expect(breaks[0].energy).toBe(250)
  })

  it('7. handleCollision skips damage when other body is the ship', () => {
    const ship = spawnShip()
    const beforeColliderCount = ship.spawned.colliderMap.size
    expect(beforeColliderCount).toBeGreaterThan(0)

    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 0, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)

    const breaks: GameEvent[] = []
    bus.on('BOND_BREAK', e => breaks.push(e))

    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 0, y: 0,
      energy: 100,
      tags: ['projectile', 'ship'],
      ids: [projId, ship.registryId],
    })

    // Ship is unchanged: same collider count, no BOND_BREAK.
    expect(ship.spawned.colliderMap.size).toBe(beforeColliderCount)
    expect(breaks).toHaveLength(0)
    // But the projectile is still despawned.
    expect(registry.get(projId)).toBeUndefined()
  })

  it('8. handleCollision despawns body when last cell removed', () => {
    spawnShip()
    // 1x1 asteroid: a single hit clears it.
    const asteroid = spawnAsteroidAt(50, 0, 1)
    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 50, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)

    expect(asteroid.spawned.colliderMap.size).toBe(1)

    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 50, y: 0,
      energy: 100,
      tags: ['projectile', 'asteroid'],
      ids: [projId, asteroid.id],
    })

    // Asteroid body fully removed from the registry.
    expect(registry.get(asteroid.id)).toBeUndefined()
    expect(ctx.renderer.onBodyRemoved).toHaveBeenCalledWith(asteroid.id)
  })

  it('9. handleCollision despawns projectile after collision', () => {
    spawnShip()
    const asteroid = spawnAsteroidAt(0, 0, 2)
    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 0, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)

    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 0, y: 0,
      energy: 100,
      tags: ['projectile', 'asteroid'],
      ids: [projId, asteroid.id],
    })

    expect(registry.get(projId)).toBeUndefined()
    expect(ctx.renderer.onBodyRemoved).toHaveBeenCalledWith(projId)
  })

  it('10. reset clears projectile state and flashes', () => {
    spawnShip()
    expect(combat.tryFireFromShip(ctx)).toBe(true)
    // Trigger a flash via a synthetic projectile collision.
    const asteroid = spawnAsteroidAt(50, 0, 1)
    const projGrid = new GridComposite(1, 1)
    projGrid.set(0, 0, Type.EXOTIC)
    const projSpawned = spawnComposite(world, projGrid, 50, 0, 0, 0, 4, { enableCollisionEvents: true })
    const projId = registry.add('projectile', projSpawned)
    combat.handleCollision(ctx, {
      type: 'COLLISION',
      x: 50, y: 0,
      energy: 100,
      tags: ['projectile', 'asteroid'],
      ids: [projId, asteroid.id],
    })
    // After reset, time-advance update should not despawn anything that no
    // longer exists in the projectile map.
    combat.reset()
    // Spawn another projectile after reset.
    ctx.ship!.cannonCooldown = 0
    expect(combat.tryFireFromShip(ctx)).toBe(true)
    // Sanity: the new projectile is alive at currentTime=0 and won't be reaped
    // by an immediate update.
    const newProjId = registry.getByTag('projectile').slice(-1)[0].id
    combat.update(ctx, 0.1)
    expect(registry.get(newProjId)).toBeDefined()
  })
})
