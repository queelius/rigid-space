import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { BodyRegistry } from './body-registry'
import { applyGravity } from './gravity'
import { GridComposite } from './grid-composite'
import { Type } from './types'
import { spawnComposite } from './rigid-spawn'

describe('applyGravity', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function makeGrid1x1(type: Type): GridComposite {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, type)
    return grid
  }

  it('attracts dynamic body toward attractor-tagged body', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    const starSpawned = spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true)
    registry.add('star', starSpawned)

    const rockGrid = makeGrid1x1(Type.ROCK)
    const rockSpawned = spawnComposite(world, rockGrid, 100, 0, 0, 0, 10)
    registry.add('asteroid', rockSpawned)

    applyGravity(registry, 50000, 'star')
    world.step()

    const vel = rockSpawned.body.linvel()
    expect(vel.x).toBeLessThan(0)
  })

  it('does not move kinematic bodies', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    const starSpawned = spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true)
    registry.add('star', starSpawned)

    const rockGrid = makeGrid1x1(Type.ROCK)
    registry.add('asteroid', spawnComposite(world, rockGrid, 100, 0, 0, 0, 10))

    applyGravity(registry, 50000, 'star')
    world.step()

    const starPos = starSpawned.body.translation()
    expect(starPos.x).toBe(0)
    expect(starPos.y).toBe(0)
  })

  it('applies stronger force at closer distance', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    registry.add('star', spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true))

    const nearGrid = makeGrid1x1(Type.ROCK)
    const nearSpawned = spawnComposite(world, nearGrid, 50, 0, 0, 0, 10)
    registry.add('asteroid', nearSpawned)

    const farGrid = makeGrid1x1(Type.ROCK)
    const farSpawned = spawnComposite(world, farGrid, 200, 0, 0, 0, 10)
    registry.add('asteroid', farSpawned)

    applyGravity(registry, 50000, 'star')
    world.step()

    const nearVel = Math.abs(nearSpawned.body.linvel().x)
    const farVel = Math.abs(farSpawned.body.linvel().x)
    expect(nearVel).toBeGreaterThan(farVel)
  })

  it('skips bodies closer than minimum distance', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    registry.add('star', spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true))

    const rockGrid = makeGrid1x1(Type.ROCK)
    const rockSpawned = spawnComposite(world, rockGrid, 1, 0, 0, 0, 10)
    registry.add('asteroid', rockSpawned)

    applyGravity(registry, 50000, 'star')
    world.step()

    const vel = rockSpawned.body.linvel()
    expect(Number.isFinite(vel.x)).toBe(true)
  })
})
