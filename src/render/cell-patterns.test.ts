import { describe, it, expect } from 'vitest'
import { CELL_PATTERNS, makeCellRng, cellSeed } from './cell-patterns'
import { Type } from '../engine/types'

interface MockCall { method: string; args: unknown[] }

function makeMockCtx() {
  const calls: MockCall[] = []
  type AnyFn = (...args: unknown[]) => unknown
  const obj: Record<string, unknown> = {
    fillRect: (...args: unknown[]) => calls.push({ method: 'fillRect', args }),
    createRadialGradient: (...args: unknown[]) => {
      calls.push({ method: 'createRadialGradient', args })
      return {
        addColorStop: (offset: number, color: string) => {
          calls.push({ method: 'addColorStop', args: [offset, color] })
        },
      }
    },
  }
  const ctx = new Proxy(obj, {
    get: (target, prop) => {
      if (typeof prop === 'string' && prop in target) return (target as Record<string, AnyFn>)[prop]
      return undefined
    },
    set: (target, prop, value) => {
      calls.push({ method: `set:${String(prop)}`, args: [value] })
      ;(target as Record<string, unknown>)[String(prop)] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('cell-patterns', () => {
  it('makeCellRng is deterministic for same seed', () => {
    const a = makeCellRng(42)
    const b = makeCellRng(42)
    for (let i = 0; i < 5; i++) expect(a()).toBe(b())
  })

  it('cellSeed differs for different (gx, gy, type) combinations', () => {
    const s1 = cellSeed(0, 0, Type.ROCK)
    const s2 = cellSeed(0, 1, Type.ROCK)
    const s3 = cellSeed(0, 0, Type.IRON)
    expect(s1).not.toBe(s2)
    expect(s1).not.toBe(s3)
  })

  it('ROCK pattern draws 5 specks (4 dark + 1 light)', () => {
    const { ctx, calls } = makeMockCtx()
    const rng = makeCellRng(123)
    CELL_PATTERNS[Type.ROCK]!(ctx, 0, 0, 10, rng)
    const fillRects = calls.filter(c => c.method === 'fillRect')
    expect(fillRects.length).toBe(5)
  })

  it('ROCK pattern is deterministic for same seed', () => {
    const { ctx: c1, calls: calls1 } = makeMockCtx()
    const { ctx: c2, calls: calls2 } = makeMockCtx()
    CELL_PATTERNS[Type.ROCK]!(c1, 0, 0, 10, makeCellRng(7))
    CELL_PATTERNS[Type.ROCK]!(c2, 0, 0, 10, makeCellRng(7))
    expect(calls1).toEqual(calls2)
  })

  it('ROCK pattern with different seeds produces different specks', () => {
    const { ctx: c1, calls: calls1 } = makeMockCtx()
    const { ctx: c2, calls: calls2 } = makeMockCtx()
    CELL_PATTERNS[Type.ROCK]!(c1, 0, 0, 10, makeCellRng(1))
    CELL_PATTERNS[Type.ROCK]!(c2, 0, 0, 10, makeCellRng(99))
    // At least one fillRect should differ in coordinates
    expect(calls1).not.toEqual(calls2)
  })

  it('IRON pattern draws at least one horizontal line', () => {
    const { ctx, calls } = makeMockCtx()
    const rng = makeCellRng(0)
    CELL_PATTERNS[Type.IRON]!(ctx, 0, 0, 10, rng)
    const fillRects = calls.filter(c => c.method === 'fillRect')
    // For size=10, lines at yy=2,5,8 -> 3 lines
    expect(fillRects.length).toBeGreaterThan(0)
  })

  it('FUEL pattern draws a single vertical line', () => {
    const { ctx, calls } = makeMockCtx()
    CELL_PATTERNS[Type.FUEL]!(ctx, 0, 0, 10, makeCellRng(0))
    const fillRects = calls.filter(c => c.method === 'fillRect')
    expect(fillRects.length).toBe(1)
  })

  it('THRUSTER pattern draws a single dark slot', () => {
    const { ctx, calls } = makeMockCtx()
    CELL_PATTERNS[Type.THRUSTER]!(ctx, 0, 0, 10, makeCellRng(0))
    const fillRects = calls.filter(c => c.method === 'fillRect')
    expect(fillRects.length).toBe(1)
  })

  it('REACTOR pattern uses radial gradient', () => {
    const { ctx, calls } = makeMockCtx()
    CELL_PATTERNS[Type.REACTOR]!(ctx, 0, 0, 10, makeCellRng(0))
    expect(calls.some(c => c.method === 'createRadialGradient')).toBe(true)
    expect(calls.some(c => c.method === 'fillRect')).toBe(true)
  })

  it('COCKPIT pattern draws a window highlight', () => {
    const { ctx, calls } = makeMockCtx()
    CELL_PATTERNS[Type.COCKPIT]!(ctx, 0, 0, 10, makeCellRng(0))
    const fillRects = calls.filter(c => c.method === 'fillRect')
    expect(fillRects.length).toBe(1)
  })

  it('unmapped types fall through (no pattern entry)', () => {
    expect(CELL_PATTERNS[Type.WATER]).toBeUndefined()
    expect(CELL_PATTERNS[Type.PLANT]).toBeUndefined()
  })
})
