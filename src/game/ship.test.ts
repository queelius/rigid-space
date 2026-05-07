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
    return new Ship(0, spawned, {
      thrust_strength: 500,
      rotation_rate: 12,
      max_speed: 250,
      linear_damping: 0,
      angular_damping: 5,
      reverse_thrust_factor: 0.5,
      cannon: { mass: 1, speed: 400 },
    })
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
    input['actionToKeys'].set('thrust_forward', ['w'])
    input['keyHeld']['w'] = true

    ship.applyControls(input)
    world.step()

    const vel = ship.velocity()
    expect(vel.y).toBeGreaterThan(0)
  })

  it('applyControls applies negative angular velocity when rotate_left is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKeys'].set('rotate_left', ['a'])
    input['keyHeld']['a'] = true

    ship.applyControls(input)

    const angvel = ship.spawned.body.angvel()
    expect(angvel).toBe(-12)
  })

  it('rotation returns body angle', () => {
    const ship = makeShip()
    expect(ship.rotation()).toBe(0)
  })

  it('clampSpeed reduces velocity magnitude to maxSpeed', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(500, 0), true)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(Math.sqrt(v.x * v.x + v.y * v.y)).toBeCloseTo(250, 0)
  })

  it('clampSpeed preserves direction', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(300, 400), true)  // mag=500, dir=(0.6, 0.8)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(v.x / 250).toBeCloseTo(0.6, 1)
    expect(v.y / 250).toBeCloseTo(0.8, 1)
  })

  it('clampSpeed is no-op when below maxSpeed', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(100, 0), true)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(v.x).toBe(100)
    expect(v.y).toBe(0)
  })

  it('isThrusting is false initially', () => {
    const ship = makeShip()
    expect(ship.isThrusting()).toBe(false)
  })

  it('isThrusting becomes true when thrust_forward is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKeys'].set('thrust_forward', ['w'])
    input['keyHeld']['w'] = true
    ship.applyControls(input)
    expect(ship.isThrusting()).toBe(true)
  })

  it('isThrusting becomes false when thrust released', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKeys'].set('thrust_forward', ['w'])
    input['keyHeld']['w'] = true
    ship.applyControls(input)
    input['keyHeld']['w'] = false
    ship.applyControls(input)
    expect(ship.isThrusting()).toBe(false)
  })

  it('applyControls zeros angular velocity when no rotate key held', () => {
    const ship = makeShip()
    const input = new InputManager()
    // Pre-condition: ship has nonzero angvel
    ship.spawned.body.setAngvel(5, true)
    expect(ship.spawned.body.angvel()).toBeCloseTo(5, 5)
    // No rotate_left or rotate_right is held
    ship.applyControls(input)
    expect(ship.spawned.body.angvel()).toBeCloseTo(0, 5)
  })
})
