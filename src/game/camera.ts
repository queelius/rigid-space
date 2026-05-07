/**
 * 2D camera with target-following and shake.
 * update() runs once per render frame (not per physics tick).
 */
export class Camera {
  x = 0
  y = 0
  /** Direct write for now; smooth zoom not yet implemented. */
  zoom = 1

  private tx = 0
  private ty = 0
  /** Higher = snappier follow. Tunable. */
  smoothing = 8

  private shakeMag = 0
  /** 1 / seconds; controls how fast shake decays */
  shakeDecay = 5
  private shakeOX = 0
  private shakeOY = 0

  setTarget(x: number, y: number): void {
    this.tx = x
    this.ty = y
  }

  update(dt: number): void {
    // Frame-rate-independent exponential lerp toward target
    const k = 1 - Math.exp(-this.smoothing * dt)
    this.x += (this.tx - this.x) * k
    this.y += (this.ty - this.y) * k

    // Shake decay
    this.shakeMag *= Math.exp(-this.shakeDecay * dt)
    if (this.shakeMag < 0.01) {
      this.shakeMag = 0
      this.shakeOX = 0
      this.shakeOY = 0
    } else {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * this.shakeMag * 10
      this.shakeOX = Math.cos(angle) * dist
      this.shakeOY = Math.sin(angle) * dist
    }
  }

  /** Add shake of the given magnitude. Existing shake is preserved if larger. */
  shake(magnitude: number): void {
    this.shakeMag = Math.max(this.shakeMag, magnitude)
  }

  get effectiveX(): number {
    return this.x + this.shakeOX
  }

  get effectiveY(): number {
    return this.y + this.shakeOY
  }
}
