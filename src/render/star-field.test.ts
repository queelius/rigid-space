import { describe, it, expect } from 'vitest'
import { StarField, modCentered } from './star-field'
import { Camera } from '../game/camera'
import type { Graphics } from 'pixi.js'

// Mock Graphics object that records calls without requiring PixiJS.
function makeMockGraphics() {
  const calls: { method: string; args: unknown[] }[] = []
  const obj = {
    clear: () => { calls.push({ method: 'clear', args: [] }); return obj },
    circle: (x: number, y: number, r: number) => { calls.push({ method: 'circle', args: [x, y, r] }); return obj },
    fill: (style: unknown) => { calls.push({ method: 'fill', args: [style] }); return obj },
  }
  return { obj, calls }
}

describe('StarField', () => {
  it('1. determinism: two StarFields with same seed produce identical first far star', () => {
    const a = new StarField({ seed: 42 })
    const b = new StarField({ seed: 42 })
    expect(a.far[0]).toEqual(b.far[0])
  })

  it('2. count defaults: farCount === 80, nearCount === 30', () => {
    const sf = new StarField()
    expect(sf.far.length).toBe(80)
    expect(sf.near.length).toBe(30)
  })

  it('3. custom counts: passing farCount: 100 produces 100 far stars', () => {
    const sf = new StarField({ farCount: 100, nearCount: 5 })
    expect(sf.far.length).toBe(100)
    expect(sf.near.length).toBe(5)
  })

  it('4. stars in tile bounds: every star has 0 <= x < 2000 and 0 <= y < 2000', () => {
    const sf = new StarField()
    for (const star of [...sf.far, ...sf.near]) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThan(2000)
      expect(star.y).toBeGreaterThanOrEqual(0)
      expect(star.y).toBeLessThan(2000)
    }
  })

  it('5. color distribution: with 1000 stars each color appears within +/- 10% of expected ratio', () => {
    const sf = new StarField({ farCount: 1000, nearCount: 0, seed: 0xDEAD })
    const counts: Record<number, number> = {}
    for (const star of sf.far) {
      counts[star.color] = (counts[star.color] ?? 0) + 1
    }
    const total = sf.far.length
    // 70% white, 10% blue, 10% yellow, 10% red
    const white = (counts[0xFFFFFF] ?? 0) / total
    const blue  = (counts[0xCCCCFF] ?? 0) / total
    const yellow = (counts[0xFFFFCC] ?? 0) / total
    const red   = (counts[0xFFCCCC] ?? 0) / total

    expect(white).toBeGreaterThan(0.6)
    expect(white).toBeLessThan(0.8)
    expect(blue).toBeGreaterThan(0.0)
    expect(blue).toBeLessThan(0.2)
    expect(yellow).toBeGreaterThan(0.0)
    expect(yellow).toBeLessThan(0.2)
    expect(red).toBeGreaterThan(0.0)
    expect(red).toBeLessThan(0.2)
  })

  it('6. modCentered correctness', () => {
    const TILE = 2000
    expect(modCentered(0, TILE)).toBeCloseTo(0)
    expect(modCentered(1500, TILE)).toBeCloseTo(-500)
    expect(modCentered(-500, TILE)).toBeCloseTo(-500)
    expect(modCentered(999, TILE)).toBeCloseTo(999)
    expect(modCentered(1001, TILE)).toBeCloseTo(-999)
  })

  it('7. render clears first: first call is clear', () => {
    const sf = new StarField()
    const { obj, calls } = makeMockGraphics()
    const camera = new Camera()
    sf.render(obj as unknown as Graphics, camera, 800, 600)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0].method).toBe('clear')
  })

  it('8. render culls off-screen: at camera (10000, 10000) most stars skip the 800x600 screen', () => {
    const sf = new StarField({ seed: 1 })
    const { obj, calls } = makeMockGraphics()
    const camera = new Camera()
    camera.setTarget(10000, 10000)
    // Force camera to target immediately without smooth lerp
    camera.x = 10000
    camera.y = 10000
    sf.render(obj as unknown as Graphics, camera, 800, 600)
    const circles = calls.filter(c => c.method === 'circle').length
    const total = sf.far.length + sf.near.length
    expect(circles).toBeLessThan(total)
  })

  it('9. render at origin with oversized screen draws all stars', () => {
    const sf = new StarField({ seed: 2 })
    const { obj, calls } = makeMockGraphics()
    const camera = new Camera()
    // Camera at origin, screen 4000x4000 covers the entire tile
    sf.render(obj as unknown as Graphics, camera, 4000, 4000)
    const circles = calls.filter(c => c.method === 'circle').length
    const total = sf.far.length + sf.near.length
    expect(circles).toBe(total)
  })

  it('10. each circle is followed by a fill: alternating circle/fill after clear', () => {
    const sf = new StarField()
    const { obj, calls } = makeMockGraphics()
    const camera = new Camera()
    sf.render(obj as unknown as Graphics, camera, 4000, 4000)

    // Skip the initial clear
    const drawCalls = calls.slice(1)
    // Every even index (0, 2, 4...) should be circle, odd index should be fill
    for (let i = 0; i < drawCalls.length; i++) {
      if (i % 2 === 0) {
        expect(drawCalls[i].method).toBe('circle')
      } else {
        expect(drawCalls[i].method).toBe('fill')
      }
    }
  })
})
