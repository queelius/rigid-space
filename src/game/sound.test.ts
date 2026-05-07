import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SoundEngine } from './sound'
import { EventBus } from '../engine/events'
import type { SoundsConfig } from '../config/loader'

describe('SoundEngine.subscribeTo', () => {
  let engine: SoundEngine
  let bus: EventBus
  const minimalConfig: SoundsConfig = {
    proximity: {},
    events: {
      COLLISION: { type: 'synthetic', volume: 1, range: 1000 },
      CANNON_FIRE: { type: 'synthetic', volume: 1, range: 1000 },
    },
    continuous: {},
  }

  beforeEach(() => {
    engine = new SoundEngine()
    bus = new EventBus()
  })

  it('throws if called before init', () => {
    expect(() => engine.subscribeTo(bus)).toThrow(/init/i)
  })

  it('registers handler per event type when config is set', () => {
    // Set config without calling init (avoids AudioContext, which is unavailable in node)
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    bus.emit({ type: 'COLLISION', x: 10, y: 20, energy: 500 })
    bus.emit({ type: 'CANNON_FIRE', x: 0, y: 0 })

    expect(playEventSpy).toHaveBeenCalledTimes(2)
    expect(playEventSpy).toHaveBeenNthCalledWith(1, 'COLLISION', 10, 20, 500)
    expect(playEventSpy).toHaveBeenNthCalledWith(2, 'CANNON_FIRE', 0, 0, undefined)
  })

  it('does not subscribe to events not in config', () => {
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    bus.emit({ type: 'UNKNOWN_EVENT', x: 0, y: 0 })

    expect(playEventSpy).not.toHaveBeenCalled()
  })

  it('is idempotent: calling twice does not double-register handlers', () => {
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    engine.subscribeTo(bus)
    bus.emit({ type: 'COLLISION', x: 0, y: 0, energy: 100 })

    expect(playEventSpy).toHaveBeenCalledTimes(1)
  })

  it('coerces non-numeric energy to undefined', () => {
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    bus.emit({ type: 'COLLISION', x: 0, y: 0, energy: 'loud' })

    expect(playEventSpy).toHaveBeenCalledWith('COLLISION', 0, 0, undefined)
  })
})
