import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { BodyRegistry } from './body-registry'
import { GridComposite } from './grid-composite'
import { Type } from './types'
import { spawnComposite } from './rigid-spawn'

describe('BodyRegistry', () => {
  let registry: BodyRegistry
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    registry = new BodyRegistry()
  })

  function spawn(type = Type.ROCK): ReturnType<typeof spawnComposite> {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, type)
    return spawnComposite(world, grid, 0, 0, 0, 0, 10)
  }

  it('add returns auto-incrementing IDs', () => {
    const id1 = registry.add('star', spawn())
    const id2 = registry.add('asteroid', spawn())
    expect(id2).toBe(id1 + 1)
  })

  it('get retrieves by ID', () => {
    const spawned = spawn()
    const id = registry.add('ship', spawned)
    const entry = registry.get(id)
    expect(entry).toBeDefined()
    expect(entry!.tag).toBe('ship')
    expect(entry!.spawned).toBe(spawned)
  })

  it('get returns undefined for missing ID', () => {
    expect(registry.get(999)).toBeUndefined()
  })

  it('getByTag returns all entries with that tag', () => {
    registry.add('asteroid', spawn())
    registry.add('ship', spawn())
    registry.add('asteroid', spawn())
    const asteroids = registry.getByTag('asteroid')
    expect(asteroids).toHaveLength(2)
    expect(asteroids.every(e => e.tag === 'asteroid')).toBe(true)
  })

  it('getByTag returns empty array for unknown tag', () => {
    expect(registry.getByTag('nothing')).toEqual([])
  })

  it('firstByTag returns first match', () => {
    registry.add('star', spawn())
    const entry = registry.firstByTag('star')
    expect(entry).toBeDefined()
    expect(entry!.tag).toBe('star')
  })

  it('firstByTag returns undefined when no match', () => {
    expect(registry.firstByTag('star')).toBeUndefined()
  })

  it('all returns every entry', () => {
    registry.add('star', spawn())
    registry.add('ship', spawn())
    registry.add('asteroid', spawn())
    expect(registry.all()).toHaveLength(3)
  })

  it('remove cleans up Rapier body and deletes entry', () => {
    const id = registry.add('asteroid', spawn())
    const removed = registry.remove(world, id)
    expect(removed).toBe(true)
    expect(registry.get(id)).toBeUndefined()
    expect(registry.all()).toHaveLength(0)
  })

  it('remove returns false for missing ID', () => {
    expect(registry.remove(world, 999)).toBe(false)
  })

  it('is iterable', () => {
    registry.add('a', spawn())
    registry.add('b', spawn())
    const tags = [...registry].map(e => e.tag)
    expect(tags).toEqual(['a', 'b'])
  })
})
