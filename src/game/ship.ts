import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from '../engine/rigid-spawn'
import type { InputManager } from './input'
import type { GameplayShipConfig } from '../config/loader'

export class Ship {
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number
  rotationRate: number

  constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig) {
    this.registryId = registryId
    this.spawned = spawned
    this.thrustStrength = config.thrust_strength
    this.rotationRate = config.rotation_rate
  }

  applyControls(input: InputManager): void {
    const body = this.spawned.body
    const angle = body.rotation()
    const fx = -Math.sin(angle)
    const fy = Math.cos(angle)

    if (input.isAction('thrust_forward')) {
      body.addForce(
        new RAPIER.Vector2(fx * this.thrustStrength, fy * this.thrustStrength),
        true,
      )
    }
    if (input.isAction('thrust_backward')) {
      body.addForce(
        new RAPIER.Vector2(-fx * this.thrustStrength * 0.5, -fy * this.thrustStrength * 0.5),
        true,
      )
    }
    if (input.isAction('rotate_left')) {
      body.addTorque(-this.rotationRate, true)
    }
    if (input.isAction('rotate_right')) {
      body.addTorque(this.rotationRate, true)
    }
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
