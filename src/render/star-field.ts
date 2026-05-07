import type { Graphics } from 'pixi.js'
import type { Camera } from '../game/camera'

/** World units per tile. Stars are generated in [0, TILE_SIZE). */
const TILE_SIZE = 2000
const FAR_PARALLAX = 0.05
const NEAR_PARALLAX = 0.2

/**
 * A single background star. Coordinates are tile-space: [0, TILE_SIZE).
 */
export interface Star {
  x: number     // tile-space
  y: number     // tile-space
  size: number  // pixel radius
  color: number // hex 0xRRGGBB
  alpha: number // 0..1
}

export interface StarFieldOptions {
  farCount?: number   // default 80
  nearCount?: number  // default 30
  seed?: number       // default 0xC0FFEE
}

/**
 * Mulberry32: a compact, deterministic 32-bit PRNG.
 * Returns floats in [0, 1).
 */
function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Map a uniform random float in [0, 1) to a star color. */
function pickStarColor(r: number): number {
  if (r < 0.7) return 0xFFFFFF  // white
  if (r < 0.8) return 0xCCCCFF  // blue tint (hot stars)
  if (r < 0.9) return 0xFFFFCC  // yellow tint (sun-like)
  return 0xFFCCCC               // red tint (cool stars)
}

/**
 * Wraps x into [-m/2, +m/2) using modulo arithmetic.
 * This produces seamless tile wrap with a single pass per star.
 */
export function modCentered(x: number, m: number): number {
  return (((x + m / 2) % m) + m) % m - m / 2
}

/** Generate an array of stars using the provided RNG. */
function generateStars(
  rng: () => number,
  count: number,
  minSize: number,
  maxSize: number,
  minAlpha: number,
  maxAlpha: number,
): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const x = rng() * TILE_SIZE
    const y = rng() * TILE_SIZE
    const size = minSize + rng() * (maxSize - minSize)
    const color = pickStarColor(rng())
    const alpha = minAlpha + rng() * (maxAlpha - minAlpha)
    stars.push({ x, y, size, color, alpha })
  }
  return stars
}

/**
 * Two-layer parallax star field. Far layer is dim and slow; near layer is
 * brighter and faster. Both layers tile seamlessly via modulo wrap.
 *
 * The caller owns the Graphics object and passes it into render() each frame.
 * This keeps StarField free of PixiJS construction and trivially testable.
 */
export class StarField {
  readonly far: readonly Star[]
  readonly near: readonly Star[]

  constructor(opts?: StarFieldOptions) {
    const farCount = opts?.farCount ?? 80
    const nearCount = opts?.nearCount ?? 30
    const seed = opts?.seed ?? 0xC0FFEE
    const rng = makeRng(seed)

    this.far = generateStars(rng, farCount, 0.5, 1.5, 0.3, 0.7)
    this.near = generateStars(rng, nearCount, 1.0, 2.5, 0.5, 1.0)
  }

  /**
   * Render all visible stars to gfx for this frame.
   *
   * Each star is projected from tile-space to screen-space using:
   *   offset = modCentered(starPos - cameraPos * parallax, TILE_SIZE)
   *   screenX = offset + screenWidth / 2
   *   screenY = -offset_y + screenHeight / 2   (Y-flip: world Y is up)
   *
   * Stars outside the screen plus 2px margin are skipped (culled).
   */
  render(
    gfx: Graphics,
    camera: Camera,
    screenWidth: number,
    screenHeight: number,
  ): void {
    gfx.clear()

    this.renderLayer(gfx, this.far, FAR_PARALLAX, camera, screenWidth, screenHeight)
    this.renderLayer(gfx, this.near, NEAR_PARALLAX, camera, screenWidth, screenHeight)
  }

  private renderLayer(
    gfx: Graphics,
    stars: readonly Star[],
    parallax: number,
    camera: Camera,
    screenWidth: number,
    screenHeight: number,
  ): void {
    const camX = camera.effectiveX * parallax
    const camY = camera.effectiveY * parallax

    for (const star of stars) {
      const dx = modCentered(star.x - camX, TILE_SIZE)
      const dy = modCentered(star.y - camY, TILE_SIZE)
      const screenX = dx + screenWidth / 2
      const screenY = -dy + screenHeight / 2  // Y-flip for screen Y-down

      if (screenX < -2 || screenX > screenWidth + 2) continue
      if (screenY < -2 || screenY > screenHeight + 2) continue

      gfx.circle(screenX, screenY, star.size).fill({ color: star.color, alpha: star.alpha })
    }
  }
}
