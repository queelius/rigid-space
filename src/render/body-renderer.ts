import { Graphics, Application } from 'pixi.js'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import { typeProps } from '../engine/types'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'

export interface BodyRenderer {
  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}

// Hardcoded type colors for immediate-mode rendering.
// These match the YAML config defaults. Config-driven colors come with Priority 2.
const TYPE_COLORS: number[] = [
  0x888888, // ROCK
  0xAAAAAA, // IRON
  0x333333, // CARBON
  0xFFAA00, // FUEL
  0xDD4444, // THRUSTER
  0x44DDFF, // CRYSTAL
  0xFF4444, // EXPLOSIVE
  0x4488FF, // WATER
  0xFFDD44, // EXOTIC
  0xFF8800, // EMITTER
  0x44FF44, // COCKPIT
  0x886644, // CARGO
  0x8888FF, // REACTOR
  0x220022, // BLACKHOLE
  0x664422, // SOIL
  0x22AA22, // PLANT
  0xCCEEFF, // ICE
  0xDDCC88, // SAND
  0xFF4400, // LAVA
  0xAA44FF, // DRIVECORE
]

export class GraphicsBodyRenderer implements BodyRenderer {
  private gfx: Graphics
  private app: Application

  constructor(app: Application) {
    this.app = app
    this.gfx = new Graphics()
    app.stage.addChild(this.gfx)
  }

  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void {
    const w = this.app.screen.width
    const h = this.app.screen.height
    const camX = camera.effectiveX
    const camY = camera.effectiveY
    const zoom = camera.zoom

    this.gfx.clear()

    // Thruster glow: drawn before bodies so the ship hull paints over its center.
    // Offset is placed in the opposite direction of facing (behind the ship).
    if (ship?.isThrusting()) {
      const sp = ship.position()
      const sx = w / 2 + (sp.x - camX) * zoom
      const sy = h / 2 - (sp.y - camY) * zoom
      const angle = ship.rotation()
      const offset = 25 * zoom
      this.gfx.ellipse(
        sx + Math.sin(angle) * offset,
        sy - Math.cos(angle) * offset,
        12 * zoom,
        20 * zoom,
      ).fill({ color: 0xff8833, alpha: 0.6 })
    }

    for (const entry of registry) {
      const body = entry.spawned.body
      const pos = body.translation()
      const rot = body.rotation()
      const cos = Math.cos(-rot)
      const sin = Math.sin(-rot)
      const grid = entry.spawned.grid
      const cellScale = entry.spawned.cellScale

      // Star: render as circle.
      // Uses cellScale as visual radius (star is spawned with cellScale=50 matching ball(50) collider).
      // This coupling is intentional for the PoC; Priority 2 renderer will use proper radius metadata.
      if (entry.tag === 'star') {
        const sx = w / 2 + (pos.x - camX) * zoom
        const sy = h / 2 - (pos.y - camY) * zoom
        const radius = cellScale * zoom
        this.gfx.circle(sx, sy, radius).fill(0xFFDD44)
        continue
      }

      // All other bodies: render each grid cell as a colored rectangle
      const halfCell = (cellScale / 2) * zoom

      // Compute COM offset (same formula as rigid-spawn.ts)
      let totalMass = 0, comX = 0, comY = 0
      for (let gy = 0; gy < grid.height; gy++) {
        for (let gx = 0; gx < grid.width; gx++) {
          const cell = grid.get(gx, gy)
          if (!cell) continue
          const mass = typeProps(cell.type).defaultMass
          comX += (gx - grid.width / 2 + 0.5) * cellScale * mass
          comY += (gy - grid.height / 2 + 0.5) * cellScale * mass
          totalMass += mass
        }
      }
      if (totalMass > 0) { comX /= totalMass; comY /= totalMass }

      for (let gy = 0; gy < grid.height; gy++) {
        for (let gx = 0; gx < grid.width; gx++) {
          const cell = grid.get(gx, gy)
          if (!cell) continue

          const color = grid.getCellColor(gx, gy) ?? TYPE_COLORS[cell.type] ?? 0xFFFFFF

          // Cell local position relative to body center (same as rigid-spawn.ts)
          const localX = ((gx - grid.width / 2 + 0.5) * cellScale - comX) * zoom
          const localY = ((gy - grid.height / 2 + 0.5) * cellScale - comY) * zoom

          // Rotate local position by body rotation
          const worldX = localX * cos - localY * sin
          const worldY = localX * sin + localY * cos

          // Screen position
          const sx = w / 2 + (pos.x - camX) * zoom + worldX
          const sy = h / 2 - (pos.y - camY) * zoom - worldY

          // Draw cell as rectangle at rotated position
          this.gfx.rect(sx - halfCell, sy - halfCell, halfCell * 2, halfCell * 2)
            .fill(color)
        }
      }
    }
  }

  onBodyAdded(_entry: RegistryEntry): void {
    // No-op for immediate-mode. Priority 2's SpriteBodyRenderer uses this.
  }

  onBodyRemoved(_id: number): void {
    // No-op for immediate-mode. Priority 2's SpriteBodyRenderer uses this.
  }

  resize(_width: number, _height: number): void {
    // PixiJS handles canvas resize via app.resizeTo
  }
}
