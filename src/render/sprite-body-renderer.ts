// Sprite-based body renderer. Each body bakes its grid composite (or star
// gradient) to a PixiJS texture at onBodyAdded time; per-frame work drops to
// position + rotation updates per sprite. Camera transformation runs on the
// shared worldContainer (pivot/position/scale), letting the GPU handle it.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { BodyRenderer } from './body-renderer'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'
import {
  computeGridBakeDimensions,
  renderGridToCanvas,
  renderProjectileToCanvas,
  renderStarToCanvas,
} from './texture-bake'

const PROJECTILE_RADIUS = 8

export class SpriteBodyRenderer implements BodyRenderer {
  private app: Application
  private worldContainer: Container
  private glowGfx: Graphics
  private sprites = new Map<number, Sprite>()
  // Star textures keyed by radius so each unique radius gets its own bake.
  private starTextures = new Map<number, Texture>()
  // Single shared projectile texture, lazily baked on first use.
  private projectileTexture: Texture | null = null

  constructor(app: Application) {
    this.app = app
    this.worldContainer = new Container()
    app.stage.addChild(this.worldContainer)
    this.glowGfx = new Graphics()
    this.worldContainer.addChild(this.glowGfx)
  }

  /** Expose the world container so combat/effects layers can render in scene space. */
  getWorldContainer(): Container {
    return this.worldContainer
  }

  onBodyAdded(entry: RegistryEntry): void {
    if (this.sprites.has(entry.id)) return  // guard against double-add
    const sprite = this.bakeSprite(entry)
    this.sprites.set(entry.id, sprite)
    this.worldContainer.addChild(sprite)
  }

  onBodyRemoved(id: number): void {
    const sprite = this.sprites.get(id)
    if (!sprite) return
    this.worldContainer.removeChild(sprite)
    // Grid textures (asteroids, ship) are unique per body and must be freed.
    // Star and projectile textures are shared/cached and stay alive.
    const ownsTexture = !this.isCachedTexture(sprite.texture)
    sprite.destroy({ texture: ownsTexture })
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
    // Glow drawn behind ship (forward direction is (sin(angle), cos(angle))).
    // Pre-Phase-3 GraphicsBodyRenderer drew it in front; that was a pre-existing bug.
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
    if (entry.tag === 'projectile') return this.bakeProjectileSprite()
    return this.bakeGridSprite(entry)
  }

  /** Returns true when the texture is shared/cached and must NOT be destroyed
   *  with its sprite. Currently covers the star (per-radius) and projectile
   *  (single shared) caches. */
  private isCachedTexture(t: Texture): boolean {
    for (const cached of this.starTextures.values()) {
      if (cached === t) return true
    }
    if (this.projectileTexture && this.projectileTexture === t) return true
    return false
  }

  private bakeStarSprite(entry: RegistryEntry): Sprite {
    const radius = entry.metadata?.radius ?? 50
    let texture = this.starTextures.get(radius)
    if (!texture) {
      const canvas = new OffscreenCanvas(2 * radius, 2 * radius)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('SpriteBodyRenderer: 2d context unavailable')
      renderStarToCanvas(ctx, radius)
      texture = Texture.from(canvas)
      this.starTextures.set(radius, texture)
    }
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5, 0.5)
    return sprite
  }

  private bakeProjectileSprite(): Sprite {
    if (!this.projectileTexture) {
      const canvas = new OffscreenCanvas(2 * PROJECTILE_RADIUS, 2 * PROJECTILE_RADIUS)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('SpriteBodyRenderer: 2d context unavailable')
      renderProjectileToCanvas(ctx, PROJECTILE_RADIUS)
      this.projectileTexture = Texture.from(canvas)
    }
    const sprite = new Sprite(this.projectileTexture)
    sprite.anchor.set(0.5, 0.5)
    return sprite
  }

  private bakeGridSprite(entry: RegistryEntry): Sprite {
    const grid = entry.spawned.grid
    const cellScale = entry.spawned.cellScale
    // Use COM from SpawnedBody; spawnComposite already computed it.
    const com = entry.spawned.com

    const dims = computeGridBakeDimensions(grid, cellScale, com)
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
