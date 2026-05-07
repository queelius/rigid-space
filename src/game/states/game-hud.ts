import type { ScreenState } from '../screen-stack'

/** Read-only data the HUD needs. Decouples HUD from full GameContext for testability. */
export interface GameHUDViewModel {
  bodyCount(): number
  shipSpeed(): number
  shipMaxSpeed(): number
  shipPosition(): { x: number; y: number }
}

export interface GameHUDCallbacks {
  onPause: () => void
}

export class GameHUD implements ScreenState {
  name = 'game-hud'
  pausesPhysics = false

  private vm: GameHUDViewModel
  private callbacks: GameHUDCallbacks

  constructor(viewModel: GameHUDViewModel, callbacks: GameHUDCallbacks) {
    this.vm = viewModel
    this.callbacks = callbacks
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
    if (key === 'escape') {
      this.callbacks.onPause()
      return true
    }
    return false
  }

  render(c2d: CanvasRenderingContext2D, _w: number, _h: number): void {
    c2d.fillStyle = '#aaaaaa'
    c2d.font = '14px monospace'
    c2d.textAlign = 'left'
    c2d.fillText('Rigid Space  |  WASD: fly  |  Esc: pause', 10, 20)
    c2d.fillText(`Speed: ${this.vm.shipSpeed().toFixed(0)} / ${this.vm.shipMaxSpeed().toFixed(0)}`, 10, 40)
    const p = this.vm.shipPosition()
    c2d.fillText(`Pos: ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`, 10, 60)
    c2d.fillText(`Bodies: ${this.vm.bodyCount()}`, 10, 80)
  }
}
