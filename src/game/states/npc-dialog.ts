import type { ScreenState } from '../screen-stack'
import type { Renderer } from '../../render/renderer'

export class NPCDialogState implements ScreenState {
  name = 'dialog'
  pausesPhysics = true

  private renderer: Renderer
  private onCleanup: () => void

  constructor(renderer: Renderer, onCleanup: () => void) {
    this.renderer = renderer
    this.onCleanup = onCleanup
  }

  update(_dt: number): void {}
  render(_ctx: CanvasRenderingContext2D, _w: number, _h: number): void {}

  handleInput(_action: string): boolean {
    return true  // consume all named actions during dialog
  }

  onExit(): void {
    this.renderer.hideDialog()
    this.onCleanup()
  }
}
