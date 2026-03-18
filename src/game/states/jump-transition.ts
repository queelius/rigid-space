import type { ScreenState } from '../screen-stack'
import type { Galaxy } from '../galaxy'

const TUNNEL_DURATION = 0.5
const MAP_DURATION = 1.0
const FADE_DURATION = 0.5
const TOTAL_DURATION = TUNNEL_DURATION + MAP_DURATION + FADE_DURATION

export class JumpTransitionState implements ScreenState {
  name = 'jump'
  pausesPhysics = true

  private galaxy: Galaxy
  private sourceId: number
  private destinationId: number
  private doEnterSystem: (destId: number, fromId: number) => Promise<void>
  private onComplete: () => void
  private elapsed = 0
  private systemSwapped = false
  private systemReady = false

  constructor(
    galaxy: Galaxy,
    sourceId: number,
    destinationId: number,
    doEnterSystem: (destId: number, fromId: number) => Promise<void>,
    onComplete: () => void,
  ) {
    this.galaxy = galaxy
    this.sourceId = sourceId
    this.destinationId = destinationId
    this.doEnterSystem = doEnterSystem
    this.onComplete = onComplete
  }

  update(dt: number): void {
    this.elapsed += dt

    // Swap system during map phase (fire once, track completion)
    if (!this.systemSwapped && this.elapsed >= TUNNEL_DURATION + 0.1) {
      this.systemSwapped = true
      this.doEnterSystem(this.destinationId, this.sourceId)
        .then(() => { this.systemReady = true })
        .catch(err => { console.warn('System swap failed:', err); this.systemReady = true })
    }

    // Only complete AFTER both the animation AND system swap are done
    if (this.elapsed >= TOTAL_DURATION && this.systemReady) {
      this.onComplete()
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Opaque background
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    if (this.elapsed < TUNNEL_DURATION) {
      this.renderTunnel(ctx, w, h)
    } else if (this.elapsed < TUNNEL_DURATION + MAP_DURATION) {
      this.renderGalaxyMap(ctx, w, h)
    } else {
      this.renderFade(ctx, w, h)
    }
  }

  handleInput(_action: string): boolean {
    return true  // consume all input during jump
  }

  private renderTunnel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const t = this.elapsed / TUNNEL_DURATION  // 0..1
    const cx = w / 2, cy = h / 2
    const numStreaks = 60

    for (let i = 0; i < numStreaks; i++) {
      const angle = (i / numStreaks) * Math.PI * 2
      const baseLen = 20 + t * 200
      const r = 50 + t * Math.max(w, h) * 0.6
      const x1 = cx + Math.cos(angle) * r * 0.3
      const y1 = cy + Math.sin(angle) * r * 0.3
      const x2 = cx + Math.cos(angle) * (r * 0.3 + baseLen)
      const y2 = cy + Math.sin(angle) * (r * 0.3 + baseLen)

      ctx.strokeStyle = `rgba(100, 180, 255, ${0.3 + t * 0.5})`
      ctx.lineWidth = 1 + t * 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  private renderGalaxyMap(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const systems = this.galaxy.systems
    if (systems.length === 0) return

    const mapT = (this.elapsed - TUNNEL_DURATION) / MAP_DURATION  // 0..1

    // Compute bounding box of galaxy coordinates
    let minGx = Infinity, minGy = Infinity, maxGx = -Infinity, maxGy = -Infinity
    for (const sys of systems) {
      if (sys.gx < minGx) minGx = sys.gx
      if (sys.gy < minGy) minGy = sys.gy
      if (sys.gx > maxGx) maxGx = sys.gx
      if (sys.gy > maxGy) maxGy = sys.gy
    }

    const rangeX = maxGx - minGx || 1
    const rangeY = maxGy - minGy || 1
    const pad = 80
    const scaleX = (w - pad * 2) / rangeX
    const scaleY = (h - pad * 2) / rangeY
    const scale = Math.min(scaleX, scaleY)

    const offsetX = (w - rangeX * scale) / 2
    const offsetY = (h - rangeY * scale) / 2

    const toScreen = (gx: number, gy: number): [number, number] => [
      offsetX + (gx - minGx) * scale,
      offsetY + (gy - minGy) * scale,
    ]

    // Draw connection lines
    ctx.strokeStyle = 'rgba(60, 80, 120, 0.5)'
    ctx.lineWidth = 1
    const drawn = new Set<string>()
    for (const sys of systems) {
      for (const connId of sys.connections) {
        const key = `${Math.min(sys.id, connId)}-${Math.max(sys.id, connId)}`
        if (drawn.has(key)) continue
        drawn.add(key)
        const [x1, y1] = toScreen(sys.gx, sys.gy)
        const [x2, y2] = toScreen(systems[connId].gx, systems[connId].gy)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }

    // Draw systems
    for (const sys of systems) {
      const [sx, sy] = toScreen(sys.gx, sys.gy)
      const isSource = sys.id === this.sourceId
      const isDest = sys.id === this.destinationId

      ctx.beginPath()
      ctx.arc(sx, sy, isSource || isDest ? 8 : 5, 0, Math.PI * 2)
      if (isSource) {
        ctx.fillStyle = '#FFD700'
      } else if (isDest) {
        ctx.fillStyle = '#00FF88'
      } else if (sys.visited) {
        ctx.fillStyle = 'rgba(150, 180, 220, 0.8)'
      } else {
        ctx.fillStyle = 'rgba(80, 80, 100, 0.5)'
      }
      ctx.fill()

      // Labels for visited systems
      if (sys.visited || isSource || isDest) {
        ctx.fillStyle = isSource || isDest ? '#fff' : 'rgba(200, 200, 220, 0.7)'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(sys.name, sx, sy - 14)
      }
    }

    // Animated route line
    const [sx, sy] = toScreen(systems[this.sourceId].gx, systems[this.sourceId].gy)
    const [dx, dy] = toScreen(systems[this.destinationId].gx, systems[this.destinationId].gy)
    const lineEndX = sx + (dx - sx) * mapT
    const lineEndY = sy + (dy - sy) * mapT

    ctx.strokeStyle = '#00CCFF'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(lineEndX, lineEndY)
    ctx.stroke()

    // Pulsing dot at line end
    const pulseR = 4 + Math.sin(this.elapsed * 8) * 2
    ctx.fillStyle = '#00CCFF'
    ctx.beginPath()
    ctx.arc(lineEndX, lineEndY, pulseR, 0, Math.PI * 2)
    ctx.fill()

    // Title
    ctx.fillStyle = '#fff'
    ctx.font = '16px monospace'
    ctx.textAlign = 'center'
    const srcName = systems[this.sourceId]?.name ?? '???'
    const dstName = systems[this.destinationId]?.name ?? '???'
    ctx.fillText(`${srcName}  >  ${dstName}`, w / 2, 30)
  }

  private renderFade(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const fadeT = (this.elapsed - TUNNEL_DURATION - MAP_DURATION) / FADE_DURATION
    const alpha = 1 - Math.min(1, fadeT)
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
    ctx.fillRect(0, 0, w, h)
  }
}
