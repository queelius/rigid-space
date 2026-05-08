import { describe, it, expect } from 'vitest'
import { Minimap } from './minimap'

function makeMockCtx() {
  const calls: { method: string; args: unknown[] }[] = []
  type AnyFn = (...args: unknown[]) => unknown
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

const SHIP_ZERO = { x: 0, y: 0 }
const W = 800
const H = 600

describe('Minimap', () => {
  it('toggle flips visible', () => {
    const m = new Minimap()
    expect(m.visible).toBe(true)
    m.toggle()
    expect(m.visible).toBe(false)
    m.toggle()
    expect(m.visible).toBe(true)
  })

  it('render no-ops when visible is false', () => {
    const m = new Minimap()
    m.toggle()
    const { ctx, calls } = makeMockCtx()
    m.render(ctx, W, H, SHIP_ZERO, 0, [])
    expect(calls).toHaveLength(0)
  })

  it('render draws background and border', () => {
    const m = new Minimap()
    const { ctx, calls } = makeMockCtx()
    m.render(ctx, W, H, SHIP_ZERO, 0, [])
    const methods = calls.map(c => c.method)
    expect(methods).toContain('fillRect')
    expect(methods).toContain('strokeRect')
  })

  it('render draws ship triangle', () => {
    const m = new Minimap()
    const { ctx, calls } = makeMockCtx()
    m.render(ctx, W, H, SHIP_ZERO, 0, [])
    const methods = calls.map(c => c.method)
    // Triangle sequence: beginPath, moveTo, lineTo, lineTo, closePath, fill
    expect(methods).toContain('moveTo')
    expect(methods).toContain('closePath')
    // Green ship color set before the last fill
    let greenIdx = -1
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].method === 'set:fillStyle' && calls[i].args[0] === '#22ff88') {
        greenIdx = i
        break
      }
    }
    expect(greenIdx).toBeGreaterThanOrEqual(0)
    const fillAfterGreen = calls.slice(greenIdx).some(c => c.method === 'fill')
    expect(fillAfterGreen).toBe(true)
  })

  it('render draws star as yellow circle', () => {
    const m = new Minimap()
    const { ctx, calls } = makeMockCtx()
    const bodies = [{ x: 0, y: 0, tag: 'star' }]
    m.render(ctx, W, H, SHIP_ZERO, 0, bodies)

    // Find '#ffdd44' fillStyle set
    const yellowIdx = calls.findIndex(c => c.method === 'set:fillStyle' && c.args[0] === '#ffdd44')
    expect(yellowIdx).toBeGreaterThanOrEqual(0)
    // arc call after yellow fillStyle
    const arcAfterYellow = calls.slice(yellowIdx).some(c => c.method === 'arc')
    expect(arcAfterYellow).toBe(true)
  })

  it('render skips bodies outside range', () => {
    const m = new Minimap({ range: 1500 })
    const { ctx, calls } = makeMockCtx()
    // Body 5000 units away: well outside range
    const bodies = [{ x: 5000, y: 0, tag: 'asteroid' }]
    m.render(ctx, W, H, SHIP_ZERO, 0, bodies)
    // No arc call for body; only the ship triangle sequence appears
    const grayIdx = calls.findIndex(c => c.method === 'set:fillStyle' && c.args[0] === '#888888')
    expect(grayIdx).toBe(-1)
  })

  it('render skips ship body tag (triangle covers it)', () => {
    const m = new Minimap()
    const { ctx, calls } = makeMockCtx()
    const bodies = [{ x: 0, y: 0, tag: 'ship' }]
    m.render(ctx, W, H, SHIP_ZERO, 0, bodies)
    // No arc call with a body-neutral color for ship tag
    // The only fills should come from bg + ship triangle
    const arcs = calls.filter(c => c.method === 'arc')
    // Should be zero arc calls (star would add one, but no star here)
    expect(arcs).toHaveLength(0)
  })

  it('range option scales drawing: larger range shows more bodies in view', () => {
    // With range=600 (small): a body at x=350 units out (scale=150/600=0.25)
    // dx = 350 * 0.25 = 87.5, sx = cx + 87.5
    // x0 = 800 - 150 - 10 = 640, cx = 715, sx = 802.5 > x0 + size (790): clipped out.
    const mSmall = new Minimap({ range: 600, size: 150, padding: 10 })
    const { ctx: ctx1, calls: calls1 } = makeMockCtx()
    const bodies = [{ x: 350, y: 0, tag: 'asteroid' }]
    mSmall.render(ctx1, W, H, SHIP_ZERO, 0, bodies)
    const arcs1 = calls1.filter(c => c.method === 'arc')
    expect(arcs1).toHaveLength(0)

    // With range=3000 (large): same body at x=350 (scale=150/3000=0.05)
    // dx = 350 * 0.05 = 17.5, sx = 715 + 17.5 = 732.5 (within 640 to 790): drawn.
    const mLarge = new Minimap({ range: 3000, size: 150, padding: 10 })
    const { ctx: ctx2, calls: calls2 } = makeMockCtx()
    mLarge.render(ctx2, W, H, SHIP_ZERO, 0, bodies)
    const arcs2 = calls2.filter(c => c.method === 'arc')
    expect(arcs2).toHaveLength(1)
  })

  it('size option changes square dimensions', () => {
    const m = new Minimap({ size: 200, padding: 10 })
    const { ctx, calls } = makeMockCtx()
    m.render(ctx, W, H, SHIP_ZERO, 0, [])

    const fillRectCall = calls.find(c => c.method === 'fillRect')
    expect(fillRectCall).toBeDefined()
    // args: [x0, y0, size, size]
    expect(fillRectCall!.args[2]).toBe(200)
    expect(fillRectCall!.args[3]).toBe(200)
  })
})
