export interface MinimapBody {
  x: number
  y: number
  tag: string
}

export interface MinimapOptions {
  /** Square side length in pixels. Default 150. */
  size?: number
  /** Distance from screen edges in pixels. Default 10. */
  padding?: number
  /** World units shown across the full minimap width. Default 1500. */
  range?: number
  /** Background opacity. Default 0.4. */
  bgAlpha?: number
}

function bodyMarkerStyle(tag: string): { color: string; radius: number } {
  if (tag === 'star') return { color: '#ffdd44', radius: 4 }
  if (tag === 'asteroid') return { color: '#888888', radius: 1.5 }
  return { color: '#ccccff', radius: 1.5 }
}

export class Minimap {
  visible: boolean
  readonly size: number
  readonly padding: number
  readonly range: number
  private readonly bgAlpha: number

  constructor(opts?: MinimapOptions) {
    this.visible = true
    this.size = opts?.size ?? 150
    this.padding = opts?.padding ?? 10
    this.range = opts?.range ?? 1500
    this.bgAlpha = opts?.bgAlpha ?? 0.4
  }

  toggle(): void {
    this.visible = !this.visible
  }

  render(
    c2d: CanvasRenderingContext2D,
    screenWidth: number,
    screenHeight: number,
    shipPos: { x: number; y: number },
    shipRot: number,
    bodies: MinimapBody[],
  ): void {
    if (!this.visible) return

    const x0 = screenWidth - this.size - this.padding
    const y0 = this.padding
    const cx = x0 + this.size / 2
    const cy = y0 + this.size / 2
    const scale = this.size / this.range

    // Background
    c2d.fillStyle = `rgba(0, 0, 0, ${this.bgAlpha})`
    c2d.fillRect(x0, y0, this.size, this.size)

    // Border
    c2d.strokeStyle = '#666'
    c2d.lineWidth = 1
    c2d.strokeRect(x0 + 0.5, y0 + 0.5, this.size - 1, this.size - 1)

    // Bodies (skip ship tag, drawn last as triangle)
    for (const body of bodies) {
      if (body.tag === 'ship') continue
      const dx = (body.x - shipPos.x) * scale
      const dy = -(body.y - shipPos.y) * scale
      const sx = cx + dx
      const sy = cy + dy
      if (sx < x0 || sx > x0 + this.size || sy < y0 || sy > y0 + this.size) continue

      const { color, radius } = bodyMarkerStyle(body.tag)
      c2d.fillStyle = color
      c2d.beginPath()
      c2d.arc(sx, sy, radius, 0, Math.PI * 2)
      c2d.fill()
    }

    // Ship triangle: points in shipRot direction (screen coords)
    const nx = Math.sin(shipRot)
    const ny = -Math.cos(shipRot)
    const tipLen = 7
    const baseLen = 4
    const px = -ny
    const py = nx
    const tipX = cx + nx * tipLen
    const tipY = cy + ny * tipLen
    const baseLX = cx - nx * 2 + px * baseLen
    const baseLY = cy - ny * 2 + py * baseLen
    const baseRX = cx - nx * 2 - px * baseLen
    const baseRY = cy - ny * 2 - py * baseLen

    c2d.fillStyle = '#22ff88'
    c2d.beginPath()
    c2d.moveTo(tipX, tipY)
    c2d.lineTo(baseLX, baseLY)
    c2d.lineTo(baseRX, baseRY)
    c2d.closePath()
    c2d.fill()
  }
}
