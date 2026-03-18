export interface ScreenState {
  name: string
  pausesPhysics: boolean
  update(dt: number): void
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void
  /** Return true if named action was consumed (from input.bind callbacks) */
  handleInput(action: string): boolean
  /** Return true if raw key was consumed (from keydown events). Optional. */
  handleKey?(key: string): boolean
  onEnter?(): void
  onExit?(): void
}

export class ScreenStack {
  private stack: ScreenState[] = []

  get isEmpty(): boolean { return this.stack.length === 0 }

  top(): ScreenState | undefined {
    return this.stack[this.stack.length - 1]
  }

  push(state: ScreenState): void {
    this.stack.push(state)
    state.onEnter?.()
  }

  pop(): void {
    const state = this.stack.pop()
    state?.onExit?.()
  }

  get paused(): boolean {
    for (const s of this.stack) {
      if (s.pausesPhysics) return true
    }
    return false
  }

  /** Route named action top-down. First consumer wins. */
  handleInput(action: string): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].handleInput(action)) return true
    }
    return false
  }

  /** Route raw key event top-down. First consumer wins. */
  handleKey(key: string): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].handleKey?.(key)) return true
    }
    return false
  }

  update(dt: number): void {
    const top = this.top()
    if (top) top.update(dt)
  }

  /** Render all states bottom-up (so top state draws last / on top). */
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    for (const s of this.stack) {
      s.render(ctx, w, h)
    }
  }
}
