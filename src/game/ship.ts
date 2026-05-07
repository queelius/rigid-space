import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from '../engine/rigid-spawn'
import type { InputManager } from './input'
import type { GameplayShipConfig } from '../config/loader'

export class Ship {
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number
  rotationRate: number
  maxSpeed: number
  reverseThrustFactor: number

  private _thrusting = false

  constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig) {
    this.registryId = registryId
    this.spawned = spawned
    this.thrustStrength = config.thrust_strength
    this.rotationRate = config.rotation_rate
    this.maxSpeed = config.max_speed
    this.reverseThrustFactor = config.reverse_thrust_factor
  }

  applyControls(input: InputManager): void {
    const fwd = input.isAction('thrust_forward')
    const back = input.isAction('thrust_backward')
    this._thrusting = fwd || back

    const body = this.spawned.body
    const angle = body.rotation()
    const fx = -Math.sin(angle)
    const fy = Math.cos(angle)

    if (fwd) {
      body.addForce(new RAPIER.Vector2(fx * this.thrustStrength, fy * this.thrustStrength), true)
    }
    if (back) {
      const rev = this.thrustStrength * this.reverseThrustFactor
      body.addForce(new RAPIER.Vector2(-fx * rev, -fy * rev), true)
    }
    if (input.isAction('rotate_left')) {
      body.addTorque(-this.rotationRate, true)
    }
    if (input.isAction('rotate_right')) {
      body.addTorque(this.rotationRate, true)
    }
  }

  /** Clamp linear velocity magnitude to maxSpeed. Call after world.step(). */
  clampSpeed(): void {
    const v = this.spawned.body.linvel()
    const mag = Math.sqrt(v.x * v.x + v.y * v.y)
    if (mag > this.maxSpeed) {
      const k = this.maxSpeed / mag
      this.spawned.body.setLinvel(new RAPIER.Vector2(v.x * k, v.y * k), true)
    }
  }

  isThrusting(): boolean {
    return this._thrusting
  }

  position(): { x: number; y: number } {
    const t = this.spawned.body.translation()
    return { x: t.x, y: t.y }
  }

  velocity(): { x: number; y: number } {
    const v = this.spawned.body.linvel()
    return { x: v.x, y: v.y }
  }

  speed(): number {
    const v = this.spawned.body.linvel()
    return Math.sqrt(v.x * v.x + v.y * v.y)
  }

  rotation(): number {
    return this.spawned.body.rotation()
  }
}
