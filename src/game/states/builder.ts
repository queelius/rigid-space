import type { ScreenState } from '../screen-stack'
import type { Builder } from '../builder'

/**
 * Wraps the Builder's active state. The builder has its own complex internal
 * state machine; this state just manages the stack integration (pausing physics,
 * blocking gameplay input).
 */
export class BuilderState implements ScreenState {
  name = 'builder'
  pausesPhysics = true

  private builder: Builder
  private onClose: () => void

  constructor(builder: Builder, onClose: () => void) {
    this.builder = builder
    this.onClose = onClose
  }

  update(_dt: number): void {}
  render(_ctx: CanvasRenderingContext2D, _w: number, _h: number): void {}

  handleInput(action: string): boolean {
    if (action === 'escape') {
      this.onClose()
      return true
    }
    return true  // consume all actions so gameplay doesn't fire
  }
}
