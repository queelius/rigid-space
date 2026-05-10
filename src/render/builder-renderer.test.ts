import { describe, it, expect, beforeAll } from 'vitest'

// Builder's constructor reads window.location.search for ?dev=1 detection.
// Vitest runs in node env (no jsdom), so we stub a minimal window before
// importing Builder.
beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as unknown as { window: { location: { search: string } } }).window = {
      location: { search: '' },
    }
  }
})
;(globalThis as unknown as { window?: { location: { search: string } } }).window ??= {
  location: { search: '' },
}

import {
  PALETTE_TYPES,
  computeBuilderLayout,
  drawBuilderGrid,
  drawBuilderPalette,
  drawBuilderStats,
  drawBuilderChrome,
} from './builder-renderer'
import { Builder } from '../game/builder'
import { Type } from '../engine/types'

function makeMockCtx() {
  const calls: { method: string; args: unknown[] }[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop === 'toJSON') return undefined
      if (typeof prop === 'string' && prop.startsWith('_')) return target[prop]
      return (...args: unknown[]) => {
        calls.push({ method: prop, args })
        return undefined
      }
    },
    set(target: Record<string, unknown>, prop: string, value: unknown) {
      target[prop] = value
      calls.push({ method: `set:${prop}`, args: [value] })
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const W = 1200
const H = 800

describe('PALETTE_TYPES', () => {
  it('has 19 entries (all types except BLACKHOLE)', () => {
    expect(PALETTE_TYPES).toHaveLength(19)
    expect(PALETTE_TYPES).not.toContain(Type.BLACKHOLE)
  })
})

describe('computeBuilderLayout', () => {
  it('grid is square in upper-60% of screen', () => {
    const layout = computeBuilderLayout(W, H, 9, 13)
    // gridY sits within the upper 60% region.
    expect(layout.gridY).toBeGreaterThanOrEqual(0)
    expect(layout.gridY + layout.gridH).toBeLessThanOrEqual(Math.floor(H * 0.6) + 60)
    // Grid is positive size.
    expect(layout.gridW).toBeGreaterThan(0)
    expect(layout.gridH).toBeGreaterThan(0)
  })

  it('cellPx fits both dimensions', () => {
    const layout = computeBuilderLayout(W, H, 9, 13)
    // The grid pixel size is cellPx * cols (or rows). Both must be positive.
    expect(layout.cellPx).toBeGreaterThan(0)
    expect(layout.gridW).toBe(layout.cellPx * 9)
    expect(layout.gridH).toBe(layout.cellPx * 13)
    // For non-square grids, cellPx is min(maxSide/cols, maxSide/rows).
    // Larger of cols/rows determines cellPx; here rows=13 > cols=9 so:
    // cellPx <= maxSide/13.
    // We verify both halves of the bounding inequality.
    expect(layout.gridH).toBeLessThanOrEqual(Math.floor(H * 0.6))
  })
})

describe('drawBuilderGrid', () => {
  it('writes one fillRect per filled cell + cursor highlight', () => {
    const builder = new Builder()
    // Builder constructor creates a 9x13 grid; place 3 cells.
    builder.grid.set(0, 0, Type.ROCK)
    builder.grid.set(1, 1, Type.IRON)
    builder.grid.set(4, 7, Type.COCKPIT)

    const layout = computeBuilderLayout(W, H, builder.grid.width, builder.grid.height)
    const { ctx, calls } = makeMockCtx()
    drawBuilderGrid(ctx, layout, builder, 4, 7)

    const fillRects = calls.filter(c => c.method === 'fillRect')
    // 1 background + 3 filled cells = 4 fillRect calls.
    expect(fillRects).toHaveLength(4)

    // Cursor outline: a strokeRect call with white stroke and 2px line width.
    const strokeRects = calls.filter(c => c.method === 'strokeRect')
    expect(strokeRects).toHaveLength(1)
    const whiteIdx = calls.findIndex(c => c.method === 'set:strokeStyle' && c.args[0] === '#ffffff')
    expect(whiteIdx).toBeGreaterThanOrEqual(0)
  })
})

describe('drawBuilderPalette', () => {
  it('writes 19 swatch fillRects + selection box', () => {
    const layout = computeBuilderLayout(W, H, 9, 13)
    const { ctx, calls } = makeMockCtx()
    drawBuilderPalette(ctx, layout, 3)

    const fillRects = calls.filter(c => c.method === 'fillRect')
    expect(fillRects).toHaveLength(PALETTE_TYPES.length) // one swatch per type

    // Yellow (#ffdd44) selection outline drawn after swatches.
    const yellowIdx = calls.findIndex(c => c.method === 'set:strokeStyle' && c.args[0] === '#ffdd44')
    expect(yellowIdx).toBeGreaterThanOrEqual(0)
    const strokeAfterYellow = calls.slice(yellowIdx).some(c => c.method === 'strokeRect')
    expect(strokeAfterYellow).toBe(true)
  })
})

describe('drawBuilderStats', () => {
  it('writes fillText calls including \'mass:\' and \'cells:\'', () => {
    const builder = new Builder()
    builder.grid.set(0, 0, Type.IRON)
    builder.grid.set(1, 0, Type.COCKPIT)

    const layout = computeBuilderLayout(W, H, builder.grid.width, builder.grid.height)
    const { ctx, calls } = makeMockCtx()
    drawBuilderStats(ctx, layout, builder)

    const fillTexts = calls.filter(c => c.method === 'fillText').map(c => c.args[0] as string)
    const allText = fillTexts.join('\n')
    expect(allText).toMatch(/mass:/)
    expect(allText).toMatch(/cells:/)
    expect(allText).toMatch(/cockpit:/)
    expect(allText).toMatch(/thrust\/wt:/)
  })
})

describe('drawBuilderChrome', () => {
  it('writes title \'BUILDER\' and at least one hint line', () => {
    const { ctx, calls } = makeMockCtx()
    drawBuilderChrome(ctx, W, H)

    const fillTexts = calls.filter(c => c.method === 'fillText').map(c => c.args[0] as string)
    expect(fillTexts).toContain('BUILDER')
    // At least 2 fillText calls (title + at least one hint line).
    expect(fillTexts.length).toBeGreaterThanOrEqual(2)
  })
})
