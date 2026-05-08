import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Camera, MIN_ZOOM, MAX_ZOOM } from './camera'

describe('Camera', () => {
  let camera: Camera

  beforeEach(() => {
    camera = new Camera()
  })

  it('starts at origin with zoom 1', () => {
    expect(camera.x).toBe(0)
    expect(camera.y).toBe(0)
    expect(camera.zoom).toBe(1)
  })

  it('setTarget moves toward target on update', () => {
    camera.setTarget(100, 50)
    camera.update(0.1)
    expect(camera.x).toBeGreaterThan(0)
    expect(camera.x).toBeLessThan(100)
    expect(camera.y).toBeGreaterThan(0)
    expect(camera.y).toBeLessThan(50)
  })

  it('approaches target asymptotically over many ticks', () => {
    camera.setTarget(100, 100)
    for (let i = 0; i < 200; i++) camera.update(1 / 60)
    expect(camera.x).toBeCloseTo(100, 1)
    expect(camera.y).toBeCloseTo(100, 1)
  })

  it('frame-rate independence: 30fps and 144fps converge to similar positions over 1s', () => {
    const slow = new Camera(); slow.setTarget(100, 0)
    const fast = new Camera(); fast.setTarget(100, 0)
    for (let i = 0; i < 30; i++) slow.update(1 / 30)
    for (let i = 0; i < 144; i++) fast.update(1 / 144)
    // Both should be within 5 units of each other after 1 simulated second
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(5)
  })

  it('shake decays toward zero (depends on default shakeDecay=5)', () => {
    // exp(-5) ~= 0.0067, which falls below the 0.01 zero-clamp threshold
    // within a 1-second window. If shakeDecay default changes, update this test.
    camera.shake(1.0)
    for (let i = 0; i < 60; i++) camera.update(1 / 60)
    expect(camera.effectiveX).toBe(camera.x)
    expect(camera.effectiveY).toBe(camera.y)
  })

  it('shake takes max of current and new magnitude (smaller value does not reduce shake)', () => {
    // Two cameras driven identically except one receives an extra small shake
    // mid-flight; if shake() takes the max, both cameras end at the same offset.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const a = new Camera()
    const b = new Camera()

    a.shake(0.5)
    b.shake(0.5)
    a.update(1 / 60)
    b.update(1 / 60)

    // Add a smaller shake to b. If shake() takes max correctly, this is a no-op.
    b.shake(0.2)

    a.update(1 / 60)
    b.update(1 / 60)

    expect(b.effectiveX - b.x).toBeCloseTo(a.effectiveX - a.x, 10)
    expect(b.effectiveY - b.y).toBeCloseTo(a.effectiveY - a.y, 10)
    vi.restoreAllMocks()
  })

  it('effectiveX/Y equal x/y when no shake active', () => {
    camera.setTarget(50, 50)
    camera.update(1)
    expect(camera.effectiveX).toBe(camera.x)
    expect(camera.effectiveY).toBe(camera.y)
  })

  describe('zoom', () => {
    it('setTargetZoom clamps below MIN_ZOOM', () => {
      camera.setTargetZoom(0.1)
      expect(camera.targetZoom).toBe(MIN_ZOOM)
    })

    it('setTargetZoom clamps above MAX_ZOOM', () => {
      camera.setTargetZoom(10)
      expect(camera.targetZoom).toBe(MAX_ZOOM)
    })

    it('zoomBy multiplies targetZoom and clamps back down', () => {
      camera.setTargetZoom(1)
      camera.zoomBy(2)
      expect(camera.targetZoom).toBe(2)
      camera.zoomBy(0.5)
      expect(camera.targetZoom).toBe(1)
    })

    it('zoomBy respects clamp at MAX_ZOOM', () => {
      camera.setTargetZoom(MAX_ZOOM)
      camera.zoomBy(2)
      expect(camera.targetZoom).toBe(MAX_ZOOM)
    })

    it('update lerps zoom toward targetZoom', () => {
      camera.zoom = 1
      camera.setTargetZoom(2)
      for (let i = 0; i < 300; i++) camera.update(1 / 60)
      expect(camera.zoom).toBeCloseTo(2, 1)
    })
  })
})
