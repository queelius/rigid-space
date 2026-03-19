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
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, true)
    expect(spawned.body.isKinematic()).toBe(true)
  })

  it('stores grid reference and cellScale', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 15)
    expect(spawned.grid).toBe(grid)
    expect(spawned.cellScale).toBe(15)
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
