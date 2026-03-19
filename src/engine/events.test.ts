import { describe, it, expect, vi } from 'vitest'
import { EventBus } from './events'

describe('EventBus', () => {
  it('emits to registered handler', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.emit({ type: 'collision', x: 10, y: 20 })
    expect(handler).toHaveBeenCalledWith({ type: 'collision', x: 10, y: 20 })
  })

  it('does not call handlers for different event types', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.emit({ type: 'explosion', x: 0, y: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports multiple handlers for same event', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('collision', h1)
    bus.on('collision', h2)
    bus.emit({ type: 'collision', x: 0, y: 0 })
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('off removes a handler', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.off('collision', handler)
    bus.emit({ type: 'collision', x: 0, y: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('clear removes all handlers', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('collision', h1)
    bus.on('explosion', h2)
    bus.clear()
    bus.emit({ type: 'collision', x: 0, y: 0 })
    bus.emit({ type: 'explosion', x: 0, y: 0 })
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })
})
