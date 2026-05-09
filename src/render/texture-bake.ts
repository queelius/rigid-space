// Pure rendering helpers for the SpriteBodyRenderer.
// These run on either CanvasRenderingContext2D (in tests) or
// OffscreenCanvasRenderingContext2D (in the real renderer).

import type { GridComposite } from '../engine/grid-composite'

export interface BakeDimensions {
  /** Canvas width in pixels. */
  canvasWidth: number
  /** Canvas height in pixels. */
  canvasHeight: number
  /** Sprite anchor X in [0..1] so sprite.position = body COM. */
  anchorX: number
  /** Sprite anchor Y in [0..1] so sprite.position = body COM. */
  anchorY: number
}

// FIXME: TYPE_COLORS duplicates the type-to-color mapping that should live
// alongside defaultMass/bondStrength in TypeProps. Once Type config gains a
// 'color' field loaded from types.yaml via applyTypeConfig, replace this
// array with typeProps(cell.type).defaultColor.
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

/** Convert a 0xRRGGBB integer color to a CSS '#RRGGBB' string. */
function hexToCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0')
}

/**
 * Compute canvas size and sprite anchor for a grid composite.
 *
 * Anchor places sprite.position at the body's COM: the body-local COM (units
 * matching cellScale) is offset from canvas center, then normalized to [0..1].
 * Y is flipped because canvas Y points down while body-local Y points up.
 */
export function computeGridBakeDimensions(
  grid: GridComposite,
  cellScale: number,
  com: { x: number; y: number },
): BakeDimensions {
  const canvasWidth = grid.width * cellScale
  const canvasHeight = grid.height * cellScale
  const canvasXofCOM = canvasWidth / 2 + com.x
  const canvasYofCOM = canvasHeight / 2 - com.y
  return {
    canvasWidth,
    canvasHeight,
    anchorX: canvasXofCOM / canvasWidth,
    anchorY: canvasYofCOM / canvasHeight,
  }
}

/**
 * Render filled cells to a 2D canvas context. Each cell becomes a flat-filled
 * rectangle. gy=0 lands at canvas BOTTOM so the texture preview displays
 * right-side-up (image conventions: Y points down, body conventions: Y points up).
 */
export function renderGridToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grid: GridComposite,
  cellScale: number,
): void {
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const cell = grid.get(gx, gy)
      if (!cell) continue
      const color = grid.getCellColor(gx, gy) ?? TYPE_COLORS[cell.type] ?? 0xFFFFFF
      ctx.fillStyle = hexToCss(color)
      const x = gx * cellScale
      const y = (grid.height - 1 - gy) * cellScale
      ctx.fillRect(x, y, cellScale, cellScale)
    }
  }
}

/**
 * Render a procedural star (radial gradient yellow disc) to a 2D canvas context.
 * Canvas should be 2*radius square. Center is at (radius, radius). Edge is
 * fully transparent; center is bright pale yellow.
 */
export function renderStarToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  radius: number,
): void {
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  grad.addColorStop(0.0, 'rgba(255, 245, 180, 1.0)')
  grad.addColorStop(0.3, 'rgba(255, 220, 100, 0.95)')
  grad.addColorStop(0.7, 'rgba(255, 180, 40, 0.5)')
  grad.addColorStop(1.0, 'rgba(255, 140, 20, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2 * radius, 2 * radius)
}
