import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { Ship } from './ship'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'
import { InputManager } from './input'

describe('Ship', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function makeShipGrid(): GridComposite {
    const grid = new GridComposite(3, 5)
    grid.set(1, 4, Type.COCKPIT)
    grid.set(0, 2, Type.THRUSTER)
    grid.set(2, 2, Type.THRUSTER)
    grid.set(1, 2, Type.REACTOR)
    grid.set(1, 1, Type.FUEL)
    grid.set(1, 0, Type.FUEL)
    return grid
  }

  function makeShip(): Ship {
    const grid = makeShipGrid()
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    return new Ship(0, spawned, { thrust_strength: 500, rotation_rate: 12, cannon: { mass: 1, speed: 400 } })
  }

  it('reads position from Rapier body', () => {
    const ship = makeShip()
    const pos = ship.position()
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  it('speed is zero when stationary', () => {
    const ship = makeShip()
    expect(ship.speed()).toBe(0)
  })

  it('applyControls applies forward thrust when thrust_forward is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    // Manually set up the action mapping and simulate key held
    input['actionToKey'].set('thrust_forward', 'w')
    input['keyHeld']['w'] = true

    ship.applyControls(input)
    world.step()

    const vel = ship.velocity()
    expect(vel.y).toBeGreaterThan(0)
  })

  it('applyControls applies torque when rotate_left is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKey'].set('rotate_left', 'a')
    input['keyHeld']['a'] = true

    ship.applyControls(input)
    world.step()

    const angvel = ship.spawned.body.angvel()
    expect(angvel).not.toBe(0)
  })

  it('rotation returns body angle', () => {
    const ship = makeShip()
    expect(ship.rotation()).toBe(0)
  })
})
