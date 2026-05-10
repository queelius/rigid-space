import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from '../engine/rigid-spawn'
import type { InputManager } from './input'
import type { GameplayShipConfig } from '../config/loader'

export class Ship {
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number
  rotationRate: number       // angular velocity in rad/s (instant fixed-rate rotation)
  maxSpeed: number
  reverseThrustFactor: number

  /** Seconds remaining until the cannon can fire again. 0 = ready. */
  cannonCooldown = 0
  /** Cooldown duration set by markFired(); read from config.cannon.cooldown. */
  cannonCooldownDuration: number

  private _thrusting = false

  constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig) {
    this.registryId = registryId
    this.spawned = spawned
    this.thrustStrength = config.thrust_strength
    this.rotationRate = config.rotation_rate
    this.maxSpeed = config.max_speed
    this.reverseThrustFactor = config.reverse_thrust_factor
    this.cannonCooldownDuration = config.cannon.cooldown
  }

  /** Decrement cooldown by dt (clamped at 0). Call once per fixedUpdate. */
  tickCooldown(dt: number): void {
    if (this.cannonCooldown > 0) {
      this.cannonCooldown = Math.max(0, this.cannonCooldown - dt)
    }
  }

  /** True when the cannon is ready to fire. */
  canFire(): boolean {
    return this.cannonCooldown <= 0
  }

  /** Reset cooldown to its full duration (called immediately after firing). */
  markFired(): void {
    this.cannonCooldown = this.cannonCooldownDuration
  }

  applyControls(input: InputManager): void {
    const fwd = input.isAction('thrust_forward')
    const back = input.isAction('thrust_backward')
    this._thrusting = fwd || back

    const body = this.spawned.body
    const angle = body.rotation()
    // Forward direction must match the renderer's visual orientation.
    // Renderer rotates body coords by -rot (combined with screen Y-flip), so
    // body local +Y at rotation r appears in world at (sin(r), cos(r)). Forward
    // thrust uses that vector so the ship accelerates in the direction the
    // visible nose is pointing.
    const fx = Math.sin(angle)
    const fy = Math.cos(angle)

    if (fwd) {
      body.addForce(new RAPIER.Vector2(fx * this.thrustStrength, fy * this.thrustStrength), true)
    }
    if (back) {
      const rev = this.thrustStrength * this.reverseThrustFactor
      body.addForce(new RAPIER.Vector2(-fx * rev, -fy * rev), true)
    }
    // Instant fixed-rate rotation (not torque). Sign matches the previous
    // torque convention so visual direction is unchanged: rotate_left turns
    // counterclockwise on screen, rotate_right turns clockwise.
    if (input.isAction('rotate_left')) {
      body.setAngvel(-this.rotationRate, true)
    } else if (input.isAction('rotate_right')) {
      body.setAngvel(this.rotationRate, true)
    } else {
      // No rotate key held: snap angular velocity to zero so rotation stops
      // immediately on key release. This overrides angular damping and any
      // residual angvel from collisions, by design (arcade feel).
      body.setAngvel(0, true)
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
