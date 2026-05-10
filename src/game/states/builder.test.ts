import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Builder reads window.location.search; node env (no jsdom) needs a stub.
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

import { BuilderState } from './builder'
import { Builder } from '../builder'
import { GridComposite } from '../../engine/grid-composite'
import { Type } from '../../engine/types'
import { PALETTE_TYPES } from '../../render/builder-renderer'

function makeBuilder(width = 9, height = 13): Builder {
  const b = new Builder()
  // Replace whatever the constructor produced with a known-size grid for tests.
  b.grid = new GridComposite(width, height)
  return b
}

describe('BuilderState', () => {
  let onSave: ReturnType<typeof vi.fn<(g: GridComposite) => void>>
  let onCancel: ReturnType<typeof vi.fn<() => void>>
  let builder: Builder
  let state: BuilderState

  beforeEach(() => {
    onSave = vi.fn()
    onCancel = vi.fn()
    builder = makeBuilder(9, 13)
    state = new BuilderState(builder, { onSave, onCancel })
  })

  it('cursor moves with arrow keys', () => {
    const x0 = state.cursorX
    const y0 = state.cursorY
    state.handleKey('arrowright')
    expect(state.cursorX).toBe(x0 + 1)
    state.handleKey('arrowleft')
    expect(state.cursorX).toBe(x0)
    state.handleKey('arrowup')
    expect(state.cursorY).toBe(y0 + 1)
    state.handleKey('arrowdown')
    expect(state.cursorY).toBe(y0)
  })

  it('cursor clamps to grid bounds', () => {
    // Walk far beyond the right edge; cursor should saturate at width-1.
    for (let i = 0; i < 100; i++) state.handleKey('arrowright')
    expect(state.cursorX).toBe(builder.grid.width - 1)
    // Walk far beyond the left edge; cursor should saturate at 0.
    for (let i = 0; i < 100; i++) state.handleKey('arrowleft')
    expect(state.cursorX).toBe(0)
    // Walk far up; cursor should saturate at height-1.
    for (let i = 0; i < 100; i++) state.handleKey('arrowup')
    expect(state.cursorY).toBe(builder.grid.height - 1)
    // Walk far down; cursor should saturate at 0.
    for (let i = 0; i < 100; i++) state.handleKey('arrowdown')
    expect(state.cursorY).toBe(0)
  })

  it('cursor follows Y-flip convention: arrowup increases cursorY', () => {
    state.cursorY = 0
    state.handleKey('arrowup')
    expect(state.cursorY).toBe(1)
    state.handleKey('arrowdown')
    expect(state.cursorY).toBe(0)
  })

  it('[ and ] cycle paletteIndex (wrapping)', () => {
    const n = PALETTE_TYPES.length
    state.paletteIndex = 0
    state.handleKey('[')
    // Wraps to last.
    expect(state.paletteIndex).toBe(n - 1)
    state.handleKey(']')
    expect(state.paletteIndex).toBe(0)
    state.handleKey(']')
    expect(state.paletteIndex).toBe(1)
  })

  it('palette change updates builder.selectedType', () => {
    state.paletteIndex = 0
    state.handleKey(']')
    expect(builder.selectedType).toBe(PALETTE_TYPES[1])
    state.handleKey('[')
    expect(builder.selectedType).toBe(PALETTE_TYPES[0])
  })

  it('space calls builder.placeCell at cursor', () => {
    state.cursorX = 4
    state.cursorY = 6
    // Choose a known palette index so we know what was placed.
    state.paletteIndex = 0
    builder.selectType(PALETTE_TYPES[0])
    expect(builder.grid.get(4, 6)).toBeNull()
    state.handleKey(' ')
    const cell = builder.grid.get(4, 6)
    expect(cell).not.toBeNull()
    expect(cell!.type).toBe(PALETTE_TYPES[0])
  })

  it('x calls builder.removeCell at cursor', () => {
    state.cursorX = 4
    state.cursorY = 6
    builder.grid.set(4, 6, Type.IRON)
    expect(builder.grid.get(4, 6)).not.toBeNull()
    state.handleKey('x')
    expect(builder.grid.get(4, 6)).toBeNull()
  })

  it('+ and - call builder.adjustGridSize and clamp cursor after shrink', () => {
    const w0 = builder.grid.width
    const h0 = builder.grid.height
    state.handleKey('+')
    expect(builder.grid.width).toBe(w0 + 1)
    expect(builder.grid.height).toBe(h0 + 1)

    // Move cursor to far corner, then shrink: cursor must clamp to new bounds.
    state.cursorX = builder.grid.width - 1
    state.cursorY = builder.grid.height - 1
    state.handleKey('-')
    expect(builder.grid.width).toBe(w0)
    expect(builder.grid.height).toBe(h0)
    expect(state.cursorX).toBeLessThanOrEqual(builder.grid.width - 1)
    expect(state.cursorY).toBeLessThanOrEqual(builder.grid.height - 1)
  })

  it('enter calls onSave with builder.getGrid()', () => {
    state.handleKey('enter')
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith(builder.getGrid())
  })

  it('escape calls onCancel', () => {
    state.handleKey('escape')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('unknown keys return false', () => {
    expect(state.handleKey('q')).toBe(false)
    expect(state.handleKey('z')).toBe(false)
    expect(state.handleKey('f1')).toBe(false)
  })
})
