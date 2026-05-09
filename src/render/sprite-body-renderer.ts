// Sprite-based body renderer. Each body bakes its grid composite (or star
// gradient) to a PixiJS texture at onBodyAdded time; per-frame work drops to
// position + rotation updates per sprite. Camera transformation runs on the
// shared worldContainer (pivot/position/scale), letting the GPU handle it.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { BodyRenderer } from './body-renderer'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'
import { typeProps } from '../engine/types'
import {
  computeGridBakeDimensions,
  renderGridToCanvas,
  renderStarToCanvas,
} from './texture-bake'

export class SpriteBodyRenderer implements BodyRenderer {
  private app: Application
  private worldContainer: Container
  private glowGfx: Graphics
  private sprites = new Map<number, Sprite>()
  private starTexture: Texture | null = null
  private starTextureRadius = -1

  constructor(app: Application) {
    this.app = app
    this.worldContainer = new Container()
    app.stage.addChild(this.worldContainer)
    this.glowGfx = new Graphics()
    this.worldContainer.addChild(this.glowGfx)
  }

  onBodyAdded(entry: RegistryEntry): void {
    const sprite = this.bakeSprite(entry)
    this.sprites.set(entry.id, sprite)
    this.worldContainer.addChild(sprite)
  }

  onBodyRemoved(id: number): void {
    const sprite = this.sprites.get(id)
    if (!sprite) return
    this.worldContainer.removeChild(sprite)
    // Star textures are shared across stars; never destroy via the sprite.
    sprite.destroy({ texture: false })
    this.sprites.delete(id)
  }

  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void {
    // Camera transform: PixiJS GPU does the math.
    this.worldContainer.position.set(this.app.screen.width / 2, this.app.screen.height / 2)
    this.worldContainer.pivot.set(camera.effectiveX, -camera.effectiveY)
    this.worldContainer.scale.set(camera.zoom, camera.zoom)

    // Per-sprite position/rotation update.
    for (const entry of registry) {
      const sprite = this.sprites.get(entry.id)
      if (!sprite) continue
      const t = entry.spawned.body.translation()
      sprite.position.set(t.x, -t.y)
      sprite.rotation = entry.spawned.body.rotation()
    }

    // Thruster glow: drawn each frame in world container so it scales with zoom.
    // Axis-aligned ellipse at fixed offset behind the ship; rotation polish deferred.
    this.glowGfx.clear()
    if (ship?.isThrusting()) {
      const sp = ship.position()
      const angle = ship.rotation()
      const offset = 25
      const gx = sp.x - Math.sin(angle) * offset
      const gy = -sp.y + Math.cos(angle) * offset
      this.glowGfx.ellipse(gx, gy, 12, 20).fill({ color: 0xff8833, alpha: 0.6 })
    }
  }

  resize(_width: number, _height: number): void {
    // Per-frame transform handles screen size; nothing to do here.
  }

  // ── Internal: sprite baking ─────────────────────────────────────────

  private bakeSprite(entry: RegistryEntry): Sprite {
    if (entry.tag === 'star') return this.bakeStarSprite(entry)
    return this.bakeGridSprite(entry)
  }

  private bakeStarSprite(entry: RegistryEntry): Sprite {
    const radius = entry.metadata?.radius ?? 50
    if (!this.starTexture || this.starTextureRadius !== radius) {
      const canvas = new OffscreenCanvas(2 * radius, 2 * radius)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('SpriteBodyRenderer: 2d context unavailable')
      renderStarToCanvas(ctx, radius)
      this.starTexture = Texture.from(canvas)
      this.starTextureRadius = radius
    }
    const sprite = new Sprite(this.starTexture)
    sprite.anchor.set(0.5, 0.5)
    return sprite
  }

  private bakeGridSprite(entry: RegistryEntry): Sprite {
    const grid = entry.spawned.grid
    const cellScale = entry.spawned.cellScale

    // Recompute COM the same way rigid-spawn.ts does so the sprite anchor lines
    // up with the body's translation reported by Rapier.
    let totalMass = 0
    let comX = 0
    let comY = 0
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
    if (totalMass > 0) {
      comX /= totalMass
      comY /= totalMass
    }

    const dims = computeGridBakeDimensions(grid, cellScale, { x: comX, y: comY })
    const canvas = new OffscreenCanvas(dims.canvasWidth, dims.canvasHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('SpriteBodyRenderer: 2d context unavailable')
    renderGridToCanvas(ctx, grid, cellScale)

    const texture = Texture.from(canvas)
    const sprite = new Sprite(texture)
    sprite.anchor.set(dims.anchorX, dims.anchorY)
    return sprite
  }
}
