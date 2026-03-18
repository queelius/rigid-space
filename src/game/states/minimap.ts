import type { ScreenState } from '../screen-stack'

export class MinimapState implements ScreenState {
  name = 'minimap'
  pausesPhysics = false  // minimap doesn't pause gameplay

  private onClose: () => void

  constructor(onClose: () => void) {
    this.onClose = onClose
  }

  update(_dt: number): void {}

  render(_ctx: CanvasRenderingContext2D, _w: number, _h: number): void {
    // Minimap is already drawn by the renderer's normal render pass
    // This state just makes it pushable/poppable via the stack
  }

  handleInput(action: string): boolean {
    if (action === 'escape') {
      this.onClose()
      return true
    }
    return false  // let other input through (transparent overlay)
  }
}
