import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { spawnInitialWorld, despawnAll, updateAudio, respawnShip } from './lifecycle'
import { BodyRegistry } from '../engine/body-registry'
import { Camera } from './camera'
import { EventBus } from '../engine/events'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import type { GameContext } from './game-context'
import type { GameConfig } from '../config/loader'
import type { RegistryEntry } from '../engine/body-registry'

function makeMockRenderer(): GameContext['renderer'] & {
  onBodyAdded: ReturnType<typeof vi.fn<(entry: RegistryEntry) => void>>
  onBodyRemoved: ReturnType<typeof vi.fn<(id: number) => void>>
} {
  const mock = {
    onBodyAdded: vi.fn<(entry: RegistryEntry) => void>(),
    onBodyRemoved: vi.fn<(id: number) => void>(),
    renderBodies: vi.fn(),
    resize: vi.fn(),
  }
  return mock as unknown as GameContext['renderer'] & typeof mock
}

describe('lifecycle', () => {
  let world: RAPIER.World
  let registry: BodyRegistry
  let camera: Camera
  let ctx: GameContext

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    registry = new BodyRegistry()
    camera = new Camera()
    // Minimal stub config; lifecycle reads only ship.* and collision.event_threshold
    const config = {
      gameplay: {
        ship: {
          thrust_strength: 2000, rotation_rate: 40, max_speed: 250,
          linear_damping: 0, angular_damping: 5, reverse_thrust_factor: 0.5,
          cannon: { mass: 1, speed: 400, cooldown: 0.3, lifetime: 3.0, energy: 1.0 },
        },
        physics: { substeps: 4, timestep: 0.016, gravity_constant: 2000000 },
        collision: { restitution: 0.5, heat_fraction: 0.1, break_threshold: 500, event_threshold: 100 },
      },
    } as unknown as GameConfig
    ctx = {
      app: null as never, hudCanvas: null as never,
      rapierWorld: world, eventQueue: new RAPIER.EventQueue(true),
      registry, ship: undefined,
      input: null as never, screenStack: null as never,
      events: new EventBus(),
      config, renderer: makeMockRenderer(), camera,
      soundEngine: null as never,
    }
  })

  it('spawnInitialWorld populates registry with star + ship + asteroids', () => {
    spawnInitialWorld(ctx)
    const all = ctx.registry.all()
    expect(all.length).toBeGreaterThan(20)  // 1 star + 1 ship + 20 asteroids
    expect(ctx.registry.firstByTag('star')).toBeDefined()
    expect(ctx.registry.firstByTag('ship')).toBeDefined()
    expect(ctx.registry.getByTag('asteroid').length).toBe(20)
    expect(ctx.ship).toBeDefined()
  })

  it('star has proximityKey metadata', () => {
    spawnInitialWorld(ctx)
    const star = ctx.registry.firstByTag('star')!
    expect(star.metadata?.proximityKey).toBe('star')
    expect(star.metadata?.radius).toBe(50)
  })

  it('all asteroids have non-zero mass (no empty-grid ghosts)', () => {
    spawnInitialWorld(ctx)
    for (const asteroid of ctx.registry.getByTag('asteroid')) {
      expect(asteroid.spawned.totalMass).toBeGreaterThan(0)
    }
  })

  it('despawnAll clears registry and ship', () => {
    spawnInitialWorld(ctx)
    despawnAll(ctx)
    expect(ctx.registry.all()).toHaveLength(0)
    expect(ctx.ship).toBeUndefined()
  })

  it('despawnAll is idempotent on empty world', () => {
    despawnAll(ctx)
    expect(ctx.registry.all()).toHaveLength(0)
  })

  it('despawnAll resets camera to origin', () => {
    spawnInitialWorld(ctx)
    ctx.camera.x = 100
    ctx.camera.y = 200
    despawnAll(ctx)
    expect(ctx.camera.x).toBe(0)
    expect(ctx.camera.y).toBe(0)
  })

  it('updateAudio updates soundEngine spatial position and thrust state', () => {
    const setContinuousCalls: Array<[string, boolean]> = []
    const updateProximityCalls: Array<{ key: string; dist: number; mass: number; radius?: number }> = []
    const fakeSound = {
      shipX: 0,
      shipY: 0,
      setContinuous: (name: string, active: boolean) => { setContinuousCalls.push([name, active]) },
      updateProximity: (key: string, dist: number, mass: number, radius?: number) => {
        updateProximityCalls.push({ key, dist, mass, radius })
      },
    }
    ctx.soundEngine = fakeSound as unknown as GameContext['soundEngine']
    spawnInitialWorld(ctx)

    // Ship is at (500, 0). Update audio.
    updateAudio(ctx)

    expect(fakeSound.shipX).toBe(500)
    expect(fakeSound.shipY).toBe(0)
    expect(setContinuousCalls).toContainEqual(['thrust', false])
    // Star is at origin, so distance from ship at (500, 0) is 500
    const starCall = updateProximityCalls.find(c => c.key === 'star')
    expect(starCall).toBeDefined()
    expect(starCall!.dist).toBeCloseTo(500, 0)
    expect(starCall!.radius).toBe(50)
  })

  it('updateAudio is no-op when ship is undefined', () => {
    const setContinuousCalls: string[] = []
    ctx.soundEngine = {
      shipX: 0, shipY: 0,
      setContinuous: (name: string) => { setContinuousCalls.push(name) },
      updateProximity: () => {},
    } as unknown as GameContext['soundEngine']
    // ship stays undefined
    updateAudio(ctx)
    expect(setContinuousCalls).toEqual([])
  })

  it('spawnInitialWorld calls onBodyAdded for each spawned body', () => {
    spawnInitialWorld(ctx)
    const onBodyAdded = (ctx.renderer.onBodyAdded as unknown) as ReturnType<typeof vi.fn>
    // 1 star + 1 ship + 20 asteroids = 22
    expect(onBodyAdded).toHaveBeenCalledTimes(22)
    // First entry should be the star
    const firstCall = onBodyAdded.mock.calls[0]
    expect((firstCall[0] as RegistryEntry).tag).toBe('star')
  })

  it('despawnAll calls onBodyRemoved for each body', () => {
    spawnInitialWorld(ctx)
    const onBodyRemoved = (ctx.renderer.onBodyRemoved as unknown) as ReturnType<typeof vi.fn>
    // Sanity: nothing removed yet
    expect(onBodyRemoved).toHaveBeenCalledTimes(0)
    despawnAll(ctx)
    expect(onBodyRemoved).toHaveBeenCalledTimes(22)
  })

  it('respawnShip clears old ship and spawns new with edited grid', () => {
    spawnInitialWorld(ctx)
    const oldShip = ctx.ship!
    const oldRegistryId = oldShip.registryId
    const oldShipCount = ctx.registry.getByTag('ship').length
    expect(oldShipCount).toBe(1)

    // Build a clearly-different grid (single COCKPIT cell).
    const newGrid = new GridComposite(1, 1)
    newGrid.set(0, 0, Type.COCKPIT)

    respawnShip(ctx, newGrid, { x: 100, y: 200 }, 0)

    // ctx.ship is a NEW Ship instance bound to the new grid.
    expect(ctx.ship).toBeDefined()
    expect(ctx.ship!).not.toBe(oldShip)
    expect(ctx.ship!.spawned.grid).toBe(newGrid)
    // Exactly one ship in registry; old id is gone.
    const ships = ctx.registry.getByTag('ship')
    expect(ships).toHaveLength(1)
    expect(ctx.registry.get(oldRegistryId)).toBeUndefined()
  })

  it('respawnShip preserves position and rotation', () => {
    spawnInitialWorld(ctx)
    const newGrid = new GridComposite(1, 1)
    newGrid.set(0, 0, Type.IRON)

    const targetPos = { x: 333, y: -777 }
    const targetRot = 1.234

    respawnShip(ctx, newGrid, targetPos, targetRot)

    const t = ctx.ship!.spawned.body.translation()
    expect(t.x).toBeCloseTo(targetPos.x, 5)
    expect(t.y).toBeCloseTo(targetPos.y, 5)
    expect(ctx.ship!.spawned.body.rotation()).toBeCloseTo(targetRot, 5)

    // Velocity should be zero after respawn.
    const v = ctx.ship!.spawned.body.linvel()
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(ctx.ship!.spawned.body.angvel()).toBeCloseTo(0, 5)
  })

  it('respawnShip notifies renderer (onBodyRemoved + onBodyAdded)', () => {
    spawnInitialWorld(ctx)
    const onBodyAdded = (ctx.renderer.onBodyAdded as unknown) as ReturnType<typeof vi.fn>
    const onBodyRemoved = (ctx.renderer.onBodyRemoved as unknown) as ReturnType<typeof vi.fn>
    // After spawnInitialWorld: 22 added, 0 removed.
    expect(onBodyAdded).toHaveBeenCalledTimes(22)
    expect(onBodyRemoved).toHaveBeenCalledTimes(0)

    const oldId = ctx.ship!.registryId
    const newGrid = new GridComposite(1, 1)
    newGrid.set(0, 0, Type.IRON)

    respawnShip(ctx, newGrid, { x: 0, y: 0 }, 0)

    // One removed (old ship by id), one added (new ship entry).
    expect(onBodyRemoved).toHaveBeenCalledTimes(1)
    expect(onBodyRemoved).toHaveBeenLastCalledWith(oldId)
    expect(onBodyAdded).toHaveBeenCalledTimes(23)
    const lastAdd = onBodyAdded.mock.calls[onBodyAdded.mock.calls.length - 1]
    expect((lastAdd[0] as RegistryEntry).tag).toBe('ship')
  })
})
