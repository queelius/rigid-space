import type { SoundsConfig, EventSoundConfig } from '../config/loader'
import type { EventBus } from '../engine/events'

export class SoundEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private config: SoundsConfig | null = null

  // Ship position for spatial audio
  shipX = 0
  shipY = 0

  private _subscribed = false

  // Continuous sounds — keyed by config name (e.g. "thrust")
  private continuousOscs: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map()
  private continuousActive: Map<string, boolean> = new Map()

  // Proximity ambient oscillators — one per config layer
  private ambientGain: GainNode | null = null
  private ambientOscs: OscillatorNode[] = []

  // Audio file cache
  private audioBuffers: Map<string, AudioBuffer> = new Map()

  init(config: SoundsConfig): void {
    if (this.ctx) return
    this.config = config
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.6
    this.masterGain.connect(this.ctx.destination)

    this._initAmbient()
  }

  /** Subscribe to all event types declared in sounds.yaml. Must be called after init. Idempotent. */
  subscribeTo(bus: EventBus): void {
    if (!this.config) {
      throw new Error('SoundEngine.subscribeTo: init() must be called before subscribeTo()')
    }
    if (this._subscribed) return
    this._subscribed = true
    for (const eventType of Object.keys(this.config.events)) {
      bus.on(eventType, e => {
        const energy = typeof e.energy === 'number' ? e.energy : undefined
        this.playEvent(eventType, e.x, e.y, energy)
      })
    }
  }

  // ── Spatial volume ──

  private _volume(wx: number, wy: number, maxDist: number): number {
    const dx = wx - this.shipX
    const dy = wy - this.shipY
    const dist = Math.sqrt(dx * dx + dy * dy)
    return Math.max(0, 1 - dist / maxDist)
  }

  // ── One-shot event sounds (data-driven) ──

  playEvent(type: string, x: number, y: number, energy?: number): void {
    if (!this.ctx || !this.masterGain || !this.config) return
    const profile = this.config.events[type]
    if (!profile) return

    const vol = this._volume(x, y, profile.range) * profile.volume * Math.min(1, (energy ?? 1000) / 1000)
    if (vol < 0.01) return

    if (profile.type === 'file' && profile.src) {
      this._playFile(profile.src, vol)
    } else {
      this._playSynthetic(profile, vol)
    }
  }

  private _playSynthetic(profile: EventSoundConfig, vol: number): void {
    if (!this.ctx || !this.masterGain) return

    const duration = profile.duration ?? 0.1
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = profile.waveform ?? 'sine'
    osc.frequency.setValueAtTime(profile.freq_start ?? 440, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, profile.freq_end ?? 100),
      this.ctx.currentTime + duration,
    )

    gain.gain.setValueAtTime(vol, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }

  private async _playFile(src: string, vol: number): Promise<void> {
    if (!this.ctx || !this.masterGain) return

    let buffer = this.audioBuffers.get(src)
    if (!buffer) {
      try {
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()
        buffer = await this.ctx.decodeAudioData(arrayBuffer)
        this.audioBuffers.set(src, buffer)
      } catch {
        return // silently fail — missing audio file
      }
    }

    const source = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    source.buffer = buffer
    gain.gain.value = vol
    source.connect(gain)
    gain.connect(this.masterGain)
    source.start()
  }

  // ── Continuous sounds (data-driven) ──

  setContinuous(name: string, active: boolean): void {
    if (!this.ctx || !this.masterGain || !this.config) return
    const profile = this.config.continuous[name]
    if (!profile) return

    const wasActive = this.continuousActive.get(name) ?? false

    if (active && !wasActive) {
      this.continuousActive.set(name, true)
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = profile.waveform
      osc.frequency.value = profile.freq
      gain.gain.value = 0
      gain.gain.linearRampToValueAtTime(profile.volume, this.ctx.currentTime + profile.attack)
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start()
      this.continuousOscs.set(name, { osc, gain })
    } else if (!active && wasActive) {
      this.continuousActive.set(name, false)
      const entry = this.continuousOscs.get(name)
      if (entry) {
        entry.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + profile.release)
        entry.osc.stop(this.ctx.currentTime + profile.release + 0.1)
        this.continuousOscs.delete(name)
      }
    }
  }

  // Backward-compatible convenience
  setThrust(active: boolean): void {
    this.setContinuous('thrust', active)
  }

  // ── Proximity ambient sounds (data-driven) ──

  updateProximity(kind: string, distance: number, mass?: number, radius?: number): void {
    if (!this.ctx || !this.ambientGain || !this.config) return

    const profile = this.config.proximity[kind]
    if (!profile) {
      this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5)
      return
    }

    // Compute actual range from radius factors, falling back to absolute
    const objRadius = radius ?? 100
    const maxRange = profile.max_range_factor
      ? objRadius * profile.max_range_factor
      : (profile.range_fallback ?? 2000)
    const minRange = profile.min_range_factor
      ? objRadius * profile.min_range_factor
      : maxRange * 0.2

    if (distance >= maxRange) {
      this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5)
      return
    }

    // Are we in the danger zone (inside min range)?
    const inDanger = distance < minRange
    const activeLayers = (inDanger && profile.danger) ? profile.danger.layers : profile.layers
    const activeMaxVol = (inDanger && profile.danger) ? profile.danger.max_volume : profile.max_volume

    // Normalized distance: 1 at min_range, 0 at max_range
    const t = inDanger
      ? 1.0  // full intensity in danger zone
      : Math.max(0, 1 - (distance - minRange) / (maxRange - minRange))

    const falloffT = Math.pow(t, profile.falloff)
    let vol = falloffT * activeMaxVol

    if (profile.mass_scale && mass !== undefined) {
      vol *= Math.max(0.1, 1 + mass * profile.mass_scale.vol_mult)
    }

    this.ambientGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.1)

    // Update oscillators from active layers
    const layerCount = Math.min(activeLayers.length, this.ambientOscs.length)
    for (let i = 0; i < layerCount; i++) {
      const layer = activeLayers[i]
      const osc = this.ambientOscs[i]
      osc.type = layer.waveform

      let freq = layer.base_freq + t * layer.freq_range
      if (profile.mass_scale && mass !== undefined) {
        freq *= Math.max(0.5, 1 + mass * profile.mass_scale.freq_mult)
      }
      if (layer.pulse_hz) {
        const pulse = Math.sin(Date.now() * layer.pulse_hz * 0.00628) * 0.5 + 0.5
        freq *= 0.7 + pulse * 0.6
      }
      osc.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.05)
    }
    // Silence unused oscillators
    for (let i = layerCount; i < this.ambientOscs.length; i++) {
      this.ambientOscs[i].frequency.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.05)
    }
  }

  // ── Internals ──

  private _initAmbient(): void {
    if (!this.ctx || !this.masterGain || !this.config) return

    this.ambientGain = this.ctx.createGain()
    this.ambientGain.gain.value = 0
    this.ambientGain.connect(this.masterGain)

    // Find maximum number of layers across all proximity profiles
    let maxLayers = 0
    for (const profile of Object.values(this.config.proximity)) {
      if (profile.layers.length > maxLayers) maxLayers = profile.layers.length
    }

    // Pre-create oscillators for the max layer count
    for (let i = 0; i < maxLayers; i++) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 20
      osc.connect(this.ambientGain)
      osc.start()
      this.ambientOscs.push(osc)
    }
  }
}
