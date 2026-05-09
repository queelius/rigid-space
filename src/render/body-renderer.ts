// BodyRenderer interface. Concrete implementations live alongside (e.g.,
// SpriteBodyRenderer in src/render/sprite-body-renderer.ts).

import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'

export interface BodyRenderer {
  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}
