import { Type } from '../engine/types'

export type CellPatternRenderer = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rng: () => number,
) => void

/** Mulberry32 deterministic RNG. Seeded per-cell so each cell of the same type
 *  in the same grid position looks identical across spawns, but distinct from
 *  its neighbors. */
export function makeCellRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Compose a stable seed from grid coordinates and cell type. */
export function cellSeed(gx: number, gy: number, type: number): number {
  return (gx * 31 + gy * 7919 + type * 65537) | 0
}

function drawRockPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rng: () => number,
): void {
  // 4 random dark specks + 1 lighter chip
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  for (let i = 0; i < 4; i++) {
    const dx = Math.floor(rng() * (size - 2)) + 1
    const dy = Math.floor(rng() * (size - 2)) + 1
    ctx.fillRect(x + dx, y + dy, 1, 1)
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  const cdx = Math.floor(rng() * (size - 2)) + 1
  const cdy = Math.floor(rng() * (size - 2)) + 1
  ctx.fillRect(x + cdx, y + cdy, 1, 1)
}

function drawIronPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _rng: () => number,
): void {
  // Horizontal brushed-metal lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
  for (let yy = 2; yy < size - 1; yy += 3) {
    ctx.fillRect(x + 1, y + yy, size - 2, 1)
  }
}

function drawFuelPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _rng: () => number,
): void {
  // Vertical glowing yellow line down the center
  const cx = x + Math.floor(size / 2)
  ctx.fillStyle = 'rgba(255, 240, 120, 0.7)'
  ctx.fillRect(cx, y + 2, 1, size - 4)
}

function drawThrusterPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _rng: () => number,
): void {
  // Dark exhaust slot in the bottom center
  const slotW = Math.max(2, Math.floor(size / 3))
  const slotH = Math.max(3, Math.floor(size / 2))
  const slotX = x + Math.floor((size - slotW) / 2)
  const slotY = y + size - slotH - 1
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(slotX, slotY, slotW, slotH)
}

function drawReactorPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _rng: () => number,
): void {
  // Glowing white-blue core (radial gradient)
  const cx = x + size / 2
  const cy = y + size / 2
  const radius = size / 2.5
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  grad.addColorStop(0, 'rgba(230, 230, 255, 0.85)')
  grad.addColorStop(1, 'rgba(230, 230, 255, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, size, size)
}

function drawCockpitPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _rng: () => number,
): void {
  // Lighter rectangular window in the upper portion
  ctx.fillStyle = 'rgba(230, 255, 230, 0.45)'
  ctx.fillRect(x + 2, y + 2, size - 4, Math.floor(size / 2) - 1)
}

export const CELL_PATTERNS: Partial<Record<number, CellPatternRenderer>> = {
  [Type.ROCK]: drawRockPattern,
  [Type.IRON]: drawIronPattern,
  [Type.FUEL]: drawFuelPattern,
  [Type.THRUSTER]: drawThrusterPattern,
  [Type.REACTOR]: drawReactorPattern,
  [Type.COCKPIT]: drawCockpitPattern,
}
