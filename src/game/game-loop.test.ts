import { describe, it, expect, vi } from 'vitest'
import { createGameLoop } from './game-loop'

describe('createGameLoop', () => {
  it('calls fixedUpdate the correct number of times for elapsed time', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })
    loop.tick(timestep * 3)

    expect(fixedUpdate).toHaveBeenCalledTimes(3)
    expect(fixedUpdate).toHaveBeenCalledWith(timestep)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('accumulates fractional time across ticks', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })

    loop.tick(timestep * 0.5)
    expect(fixedUpdate).toHaveBeenCalledTimes(0)

    loop.tick(timestep * 0.5)
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
  })

  it('caps accumulator to prevent spiral of death', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })
    loop.tick(10.0)
    expect(fixedUpdate).toHaveBeenCalledTimes(5)
  })

  it('render receives interpolation between 0 and 1', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })
    loop.tick(timestep * 1.5)

    expect(render).toHaveBeenCalledTimes(1)
    const interpolation = render.mock.calls[0][0]
    expect(interpolation).toBeGreaterThan(0)
    expect(interpolation).toBeLessThan(1)
  })

  it('always calls render even with zero physics steps', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })
    loop.tick(timestep * 0.1)

    expect(fixedUpdate).toHaveBeenCalledTimes(0)
    expect(render).toHaveBeenCalledTimes(1)
  })
})
