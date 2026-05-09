import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { spawnComposite, removeCell } from './rigid-spawn'
import { GridComposite } from './grid-composite'
import { Type } from './types'

describe('spawnComposite', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  it('creates one collider per filled cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.ROCK)
    grid.set(1, 1, Type.IRON)
    grid.set(2, 2, Type.FUEL)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.colliderMap.size).toBe(3)
  })

  it('positions body at specified coordinates', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 100, 200, 0, 0, 10)
    const pos = spawned.body.translation()
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(200)
  })

  it('applies initial velocity', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 5, 10, 10)
    const vel = spawned.body.linvel()
    expect(vel.x).toBe(5)
    expect(vel.y).toBe(10)
  })

  it('kinematic body is kinematic', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.EXOTIC)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, { kinematic: true })
    expect(spawned.body.isKinematic()).toBe(true)
  })

  it('stores grid reference and cellScale', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 15)
    expect(spawned.grid).toBe(grid)
    expect(spawned.cellScale).toBe(15)
  })

  it('exposes com matching the computed center of mass', () => {
    // Symmetric 2x2 all-ROCK grid: COM must be at origin (0, 0).
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    grid.set(1, 0, Type.ROCK)
    grid.set(0, 1, Type.ROCK)
    grid.set(1, 1, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.com.x).toBeCloseTo(0, 5)
    expect(spawned.com.y).toBeCloseTo(0, 5)
  })

  it('com is offset when mass is asymmetric', () => {
    // Single cell at (1, 0) in a 2x1 grid with cellScale 10:
    // Only (1,0) is filled. Cell center in body-local coords:
    // gx=1, width=2: (1 - 2/2 + 0.5) * 10 = (0.5) * 10 = 5
    // gy=0, height=1: (0 - 1/2 + 0.5) * 10 = 0
    // With a single cell, COM == that cell's center.
    const grid = new GridComposite(2, 1)
    grid.set(1, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.com.x).toBeCloseTo(5, 5)
    expect(spawned.com.y).toBeCloseTo(0, 5)
  })

  it('computes totalMass from cell types', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK) // defaultMass = 6.0
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.totalMass).toBe(6.0)
  })
})

describe('removeCell', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  it('removes a collider and clears the grid cell', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    grid.set(1, 0, Type.IRON)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)

    const removed = removeCell(world, spawned, 0, 0)
    expect(removed).toBe(true)
    expect(spawned.colliderMap.has('0,0')).toBe(false)
    expect(grid.get(0, 0)).toBeNull()
    expect(spawned.colliderMap.size).toBe(1)
  })

  it('returns false for empty cell', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(removeCell(world, spawned, 1, 1)).toBe(false)
  })
})

describe('spawnComposite options', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function unitGrid(): GridComposite {
    const g = new GridComposite(1, 1)
    g.set(0, 0, Type.ROCK)
    return g
  }

  it('linearDamping option propagates to body', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10, { linearDamping: 1.5 })
    expect(spawned.body.linearDamping()).toBeCloseTo(1.5, 5)
  })

  it('angularDamping option propagates to body', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10, { angularDamping: 5 })
    expect(spawned.body.angularDamping()).toBeCloseTo(5, 5)
  })

  it('enableCollisionEvents sets ActiveEvents on each collider', () => {
    const grid = new GridComposite(2, 1)
    grid.set(0, 0, Type.ROCK); grid.set(1, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, { enableCollisionEvents: true })
    for (const c of spawned.colliderMap.values()) {
      expect(c.activeEvents()).toBe(RAPIER.ActiveEvents.COLLISION_EVENTS)
    }
  })

  it('omitting opts produces dynamic body with zero damping (default)', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10)
    expect(spawned.body.isKinematic()).toBe(false)
    expect(spawned.body.linearDamping()).toBeCloseTo(0, 5)
    expect(spawned.body.angularDamping()).toBeCloseTo(0, 5)
  })
})
