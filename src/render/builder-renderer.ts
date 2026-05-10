// Pure rendering helpers for BuilderState. All functions operate on a
// CanvasRenderingContext2D and a precomputed BuilderLayout, so they are
// trivially testable with a Proxy-based mock context.

import type { Builder } from '../game/builder'
import { Type, TYPE_NAMES } from '../engine/types'
import { computeShipStats } from '../game/builder'
import { TYPE_COLORS } from './texture-bake'

/**
 * Cell types shown in the palette, in display order. BLACKHOLE is omitted
 * because it is structural / cosmological, not a normal building block.
 */
export const PALETTE_TYPES: number[] = [
  Type.ROCK, Type.IRON, Type.CARBON, Type.FUEL, Type.THRUSTER,
  Type.CRYSTAL, Type.EXPLOSIVE, Type.WATER, Type.EXOTIC, Type.EMITTER,
  Type.COCKPIT, Type.CARGO, Type.REACTOR, Type.SOIL, Type.PLANT,
  Type.ICE, Type.SAND, Type.LAVA, Type.DRIVECORE,
]

export interface BuilderLayout {
  /** Top-left X of the editor grid in screen pixels. */
  gridX: number
  /** Top-left Y of the editor grid in screen pixels. */
  gridY: number
  /** Width of the editor grid in screen pixels (cols * cellPx). */
  gridW: number
  /** Height of the editor grid in screen pixels (rows * cellPx). */
  gridH: number
  /** Pixel size of one editor cell. */
  cellPx: number
  /** Top-left X of the palette strip. */
  paletteX: number
  /** Top-left Y of the palette strip. */
  paletteY: number
  /** Pixel size of one palette cell. */
  paletteCellPx: number
  /** Top-left X of the stats panel. */
  statsX: number
  /** Top-left Y of the stats panel (matches gridY). */
  statsY: number
}

const SCREEN_PADDING = 30
const STATS_PANEL_WIDTH = 200
const PALETTE_CELL_PX = 30
const TOP_AREA_FRAC = 0.6

/** Compute layout for a screen of (w, h) and a grid of (cols, rows). */
export function computeBuilderLayout(w: number, h: number, cols: number, rows: number): BuilderLayout {
  // Upper TOP_AREA_FRAC of screen, with padding on all sides, hosts the grid + stats row.
  const topAreaH = Math.max(0, Math.floor(h * TOP_AREA_FRAC) - 2 * SCREEN_PADDING)
  const topAreaW = Math.max(0, w - 2 * SCREEN_PADDING)

  // Largest centered square that fits, leaving room for the stats panel on the right.
  const maxGridSide = Math.max(0, Math.min(topAreaH, topAreaW - STATS_PANEL_WIDTH - SCREEN_PADDING))

  const cellPx = Math.max(1, Math.floor(Math.min(maxGridSide / cols, maxGridSide / rows)))
  const gridW = cellPx * cols
  const gridH = cellPx * rows

  // Center grid horizontally (within the area to the left of the stats column).
  const gridContentW = gridW + STATS_PANEL_WIDTH + SCREEN_PADDING
  const gridX = Math.floor((w - gridContentW) / 2)
  const gridY = SCREEN_PADDING + Math.floor((topAreaH - gridH) / 2) + Math.floor(SCREEN_PADDING / 2)

  // Stats panel sits to the right of the grid, top-aligned with it.
  const statsX = gridX + gridW + SCREEN_PADDING
  const statsY = gridY

  // Palette strip below the grid area, centered horizontally.
  const paletteCellPx = PALETTE_CELL_PX
  const paletteW = paletteCellPx * PALETTE_TYPES.length
  const paletteX = Math.floor((w - paletteW) / 2)
  const paletteY = SCREEN_PADDING + topAreaH + SCREEN_PADDING

  return { gridX, gridY, gridW, gridH, cellPx, paletteX, paletteY, paletteCellPx, statsX, statsY }
}

/** Convert a 0xRRGGBB integer to '#RRGGBB' CSS string. */
function hexCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0')
}

/** Draw the editor grid with cursor highlight. */
export function drawBuilderGrid(
  c2d: CanvasRenderingContext2D,
  layout: BuilderLayout,
  builder: Builder,
  cursorX: number,
  cursorY: number,
): void {
  const grid = builder.grid
  const cols = grid.width
  const rows = grid.height
  const { gridX, gridY, gridW, gridH, cellPx } = layout

  // Background block.
  c2d.fillStyle = '#1a1a1a'
  c2d.fillRect(gridX, gridY, gridW, gridH)

  // Filled cells.
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cell = grid.get(gx, gy)
      if (!cell) continue
      const color = grid.getCellColor(gx, gy) ?? TYPE_COLORS[cell.type] ?? 0xffffff
      const px = gridX + gx * cellPx
      // Y-flip: gy=0 is at the bottom of the editor (matches body grid convention).
      const py = gridY + (rows - 1 - gy) * cellPx
      c2d.fillStyle = hexCss(color)
      c2d.fillRect(px + 1, py + 1, cellPx - 2, cellPx - 2)
    }
  }

  // Cursor outline (drawn last so it sits on top of cells).
  const cx = gridX + cursorX * cellPx
  const cy = gridY + (rows - 1 - cursorY) * cellPx
  c2d.strokeStyle = '#ffffff'
  c2d.lineWidth = 2
  c2d.strokeRect(cx + 1, cy + 1, cellPx - 2, cellPx - 2)
}

/** Draw the palette strip with selection indicator. */
export function drawBuilderPalette(
  c2d: CanvasRenderingContext2D,
  layout: BuilderLayout,
  paletteIndex: number,
): void {
  const { paletteX, paletteY, paletteCellPx } = layout
  const cellPx = paletteCellPx

  for (let i = 0; i < PALETTE_TYPES.length; i++) {
    const type = PALETTE_TYPES[i]
    const px = paletteX + i * cellPx
    const py = paletteY

    // Background swatch.
    c2d.fillStyle = hexCss(TYPE_COLORS[type] ?? 0xffffff)
    c2d.fillRect(px + 1, py + 1, cellPx - 2, cellPx - 2)

    // Abbreviated type label below the swatch (first 4 chars).
    const name = TYPE_NAMES[type] ?? '?'
    c2d.fillStyle = '#cccccc'
    c2d.font = '10px monospace'
    c2d.textAlign = 'center'
    c2d.fillText(name.slice(0, 4), px + cellPx / 2, py + cellPx + 11)
  }

  // Selection outline (yellow) on top.
  const sx = paletteX + paletteIndex * cellPx
  c2d.strokeStyle = '#ffdd44'
  c2d.lineWidth = 2
  c2d.strokeRect(sx + 1, paletteY + 1, cellPx - 2, cellPx - 2)
}

/** Draw the stats panel. */
export function drawBuilderStats(
  c2d: CanvasRenderingContext2D,
  layout: BuilderLayout,
  builder: Builder,
): void {
  const stats = computeShipStats(builder.grid)
  const { statsX, statsY } = layout

  c2d.fillStyle = '#ffffff'
  c2d.font = '14px monospace'
  c2d.textAlign = 'left'

  let y = statsY + 16
  c2d.fillText('Stats', statsX, y); y += 22
  c2d.fillText(`mass: ${stats.totalMass.toFixed(0)}`, statsX, y); y += 18
  c2d.fillText(`cells: ${stats.cellCount}`, statsX, y); y += 18
  c2d.fillText(`cockpit: ${stats.hasCockpit ? 'yes' : 'no'}`, statsX, y); y += 18
  c2d.fillText(`thrust/wt: ${stats.thrustToWeight.toFixed(2)}`, statsX, y)
}

/** Draw control hints + title. */
export function drawBuilderChrome(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  // Background dim so the world behind isn't distracting.
  c2d.fillStyle = 'rgba(0, 0, 0, 0.85)'
  c2d.fillRect(0, 0, w, h)

  // Title at the top.
  c2d.fillStyle = '#ffffff'
  c2d.font = 'bold 32px monospace'
  c2d.textAlign = 'center'
  c2d.fillText('BUILDER', w / 2, 36)

  // Hints at the bottom.
  c2d.fillStyle = '#888888'
  c2d.font = '14px monospace'
  c2d.textAlign = 'center'
  c2d.fillText('Arrows: move cursor    [/]: select type    Space: place    X: remove', w / 2, h - 38)
  c2d.fillText('+: grow / -: shrink (drops edges)    Enter: save    Esc: cancel', w / 2, h - 18)
}
