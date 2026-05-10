import { describe, it, expect } from 'vitest'
import {
  computeGridBakeDimensions,
  renderGridToCanvas,
  renderProjectileToCanvas,
  renderStarToCanvas,
} from './texture-bake'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'

interface MockCall {
  method: string
  args: unknown[]
}

interface GradientStop {
  offset: number
  color: string
}

/**
 * Build a Proxy-based mock 2D context that records every call and property
 * assignment. Mirrors the pattern used in minimap.test.ts.
 *
 * createRadialGradient returns a fake gradient object with addColorStop that
 * pushes onto gradStops. Setting fillStyle = grad records the assignment too.
 */
function makeMockCtx(): {
  ctx: CanvasRenderingContext2D
  calls: MockCall[]
  gradStops: GradientStop[]
} {
  const calls: MockCall[] = []
  const gradStops: GradientStop[] = []
  const fakeGrad = {
    addColorStop: (offset: number, color: string) => {
      gradStops.push({ offset, color })
    },
  }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop === 'toJSON') return undefined
      if (typeof prop === 'string' && prop.startsWith('_')) return target[prop]
      if (prop === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args })
          return fakeGrad
        }
      }
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, gradStops }
}

describe('texture-bake', () => {
  describe('computeGridBakeDimensions', () => {
    it('canvas size matches grid extent', () => {
      const grid = new GridComposite(3, 5)
      const dims = computeGridBakeDimensions(grid, 10, { x: 0, y: 0 })
      expect(dims.canvasWidth).toBe(30)
      expect(dims.canvasHeight).toBe(50)
    })

    it('anchor at center for COM at origin', () => {
      const grid = new GridComposite(3, 5)
      const dims = computeGridBakeDimensions(grid, 10, { x: 0, y: 0 })
      expect(dims.anchorX).toBeCloseTo(0.5, 6)
      expect(dims.anchorY).toBeCloseTo(0.5, 6)
    })

    it('anchor shifts with COM', () => {
      const grid = new GridComposite(3, 5)
      const dims = computeGridBakeDimensions(grid, 10, { x: 5, y: -3 })
      // canvas 30x50, canvasXofCOM = 15 + 5 = 20, anchorX = 20/30 = 0.6667
      // canvasYofCOM = 25 - (-3) = 28, anchorY = 28/50 = 0.56
      expect(dims.anchorX).toBeCloseTo(0.5 + 5 / 30, 6)
      expect(dims.anchorY).toBeCloseTo(0.5 + 3 / 50, 6)
    })
  })

  describe('renderGridToCanvas', () => {
    it('renderGridToCanvas writes at least 5 fillRects per filled cell (base + 4 bevels, plus optional pattern)', () => {
      const grid = new GridComposite(3, 3)
      // Five cells filled, each cell drawn as 1 base + 4 bevel rects, plus optional pattern
      grid.set(0, 0, Type.ROCK)
      grid.set(1, 0, Type.ROCK)
      grid.set(2, 1, Type.IRON)
      grid.set(0, 2, Type.ROCK)
      grid.set(2, 2, Type.IRON)
      const { ctx, calls } = makeMockCtx()
      renderGridToCanvas(ctx, grid, 10)
      const fillRects = calls.filter(c => c.method === 'fillRect')
      expect(fillRects.length).toBeGreaterThanOrEqual(25) // 5 cells * (1 base + 4 bevels)
    })

    it('cell at gy=0 lands at canvas bottom', () => {
      const grid = new GridComposite(1, 3)
      grid.set(0, 0, Type.ROCK)
      const { ctx, calls } = makeMockCtx()
      renderGridToCanvas(ctx, grid, 10)
      const fillRects = calls.filter(c => c.method === 'fillRect')
      // At least 5 rects per cell: base + 4 bevel edges, plus optional pattern overlay
      expect(fillRects.length).toBeGreaterThanOrEqual(5)
      // canvasHeight = 30, gy=0 lands at y = (3-1-0)*10 = 20; first rect is the base fill
      expect(fillRects[0].args).toEqual([0, 20, 10, 10])
    })

    it('cell at gy=2 in 3-tall lands at canvas top', () => {
      const grid = new GridComposite(1, 3)
      grid.set(0, 2, Type.ROCK)
      const { ctx, calls } = makeMockCtx()
      renderGridToCanvas(ctx, grid, 10)
      const fillRects = calls.filter(c => c.method === 'fillRect')
      // At least 5 rects per cell: base + 4 bevel edges, plus optional pattern overlay
      expect(fillRects.length).toBeGreaterThanOrEqual(5)
      // gy=2 -> y = (3-1-2)*10 = 0; first rect is the base fill
      expect(fillRects[0].args).toEqual([0, 0, 10, 10])
    })

    it('uses cell color from typeProps', () => {
      const grid = new GridComposite(1, 1)
      grid.set(0, 0, Type.ROCK)
      const { ctx, calls } = makeMockCtx()
      renderGridToCanvas(ctx, grid, 10)
      // ROCK color = 0x888888 -> '#888888'
      // The fillStyle assignment must precede the fillRect for this cell.
      const styleIdx = calls.findIndex(
        c => c.method === 'set:fillStyle' && c.args[0] === '#888888',
      )
      expect(styleIdx).toBeGreaterThanOrEqual(0)
      const fillRectIdx = calls.findIndex(c => c.method === 'fillRect')
      expect(fillRectIdx).toBeGreaterThan(styleIdx)
    })
  })

  describe('renderStarToCanvas', () => {
    it('creates radial gradient with correct args', () => {
      const { ctx, calls } = makeMockCtx()
      renderStarToCanvas(ctx, 50)
      const gradCall = calls.find(c => c.method === 'createRadialGradient')
      expect(gradCall).toBeDefined()
      expect(gradCall!.args).toEqual([50, 50, 0, 50, 50, 50])
    })

    it('applies four color stops', () => {
      const { ctx, gradStops } = makeMockCtx()
      renderStarToCanvas(ctx, 50)
      expect(gradStops).toHaveLength(4)
      // Spot-check the offsets
      expect(gradStops[0].offset).toBe(0.0)
      expect(gradStops[1].offset).toBe(0.3)
      expect(gradStops[2].offset).toBe(0.7)
      expect(gradStops[3].offset).toBe(1.0)
    })

    it('fills full square', () => {
      const { ctx, calls } = makeMockCtx()
      renderStarToCanvas(ctx, 50)
      const fillRect = calls.find(c => c.method === 'fillRect')
      expect(fillRect).toBeDefined()
      expect(fillRect!.args).toEqual([0, 0, 100, 100])
    })
  })

  describe('renderProjectileToCanvas', () => {
    it('uses radial gradient and fills the canvas', () => {
      const { ctx, calls } = makeMockCtx()
      renderProjectileToCanvas(ctx, 8)
      const gradCall = calls.find(c => c.method === 'createRadialGradient')
      expect(gradCall).toBeDefined()
      // Inner radius 0, outer radius = radius; centered at (radius, radius).
      expect(gradCall!.args).toEqual([8, 8, 0, 8, 8, 8])
      const fillRect = calls.find(c => c.method === 'fillRect')
      expect(fillRect).toBeDefined()
      expect(fillRect!.args).toEqual([0, 0, 16, 16])
    })

    it('uses three color stops (white core, pale blue mid, transparent edge)', () => {
      const { ctx, gradStops } = makeMockCtx()
      renderProjectileToCanvas(ctx, 8)
      expect(gradStops).toHaveLength(3)
      expect(gradStops[0].offset).toBe(0.0)
      expect(gradStops[0].color).toBe('rgba(255, 255, 255, 1.0)')
      expect(gradStops[1].offset).toBe(0.4)
      expect(gradStops[1].color).toBe('rgba(180, 230, 255, 0.9)')
      expect(gradStops[2].offset).toBe(1.0)
      expect(gradStops[2].color).toBe('rgba(80, 160, 255, 0.0)')
    })
  })
})
