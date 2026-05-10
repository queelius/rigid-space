import type { ScreenState } from '../screen-stack'
import type { Builder } from '../builder'
import type { GridComposite } from '../../engine/grid-composite'
import {
  PALETTE_TYPES,
  computeBuilderLayout,
  drawBuilderGrid,
  drawBuilderPalette,
  drawBuilderStats,
  drawBuilderChrome,
} from '../../render/builder-renderer'

export interface BuilderStateCallbacks {
  /** Called with the edited grid when user presses Enter. */
  onSave: (newGrid: GridComposite) => void
  /** Called with no args when user presses Esc. */
  onCancel: () => void
}

/**
 * ScreenState wrapping the keyboard-driven grid editor. Owns cursor position
 * and palette index; delegates persistent state (the grid being edited and
 * the selected type) to the shared Builder data class.
 *
 * Cursor convention is Y-up (matches the body grid): arrowup increases
 * cursorY toward gy=height-1, which renders at the visual TOP of the editor.
 */
export class BuilderState implements ScreenState {
  name = 'builder'
  pausesPhysics = true

  cursorX = 0
  cursorY = 0

  private builder: Builder
  private callbacks: BuilderStateCallbacks

  constructor(builder: Builder, callbacks: BuilderStateCallbacks) {
    this.builder = builder
    this.callbacks = callbacks
    // Start cursor at grid center.
    this.cursorX = Math.floor(builder.grid.width / 2)
    this.cursorY = Math.floor(builder.grid.height / 2)
    // Sync builder.selectedType to whatever paletteIndex is (in case selectedType drifted).
    builder.selectType(PALETTE_TYPES[builder.paletteIndex])
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  /** Clamp cursor to current grid bounds. Call after move and after resize. */
  private clampCursor(): void {
    const w = this.builder.grid.width
    const h = this.builder.grid.height
    if (this.cursorX < 0) this.cursorX = 0
    if (this.cursorX > w - 1) this.cursorX = w - 1
    if (this.cursorY < 0) this.cursorY = 0
    if (this.cursorY > h - 1) this.cursorY = h - 1
  }

  handleKey(key: string): boolean {
    switch (key) {
      case 'arrowleft':
      case 'a':
        this.cursorX -= 1
        this.clampCursor()
        return true
      case 'arrowright':
      case 'd':
        this.cursorX += 1
        this.clampCursor()
        return true
      case 'arrowup':
      case 'w':
        // Y-up: visual up = increase cursorY (toward gy=height-1 at editor top).
        this.cursorY += 1
        this.clampCursor()
        return true
      case 'arrowdown':
      case 's':
        this.cursorY -= 1
        this.clampCursor()
        return true
      case '[': {
        const n = PALETTE_TYPES.length
        this.builder.paletteIndex = (this.builder.paletteIndex + n - 1) % n
        this.builder.selectType(PALETTE_TYPES[this.builder.paletteIndex])
        return true
      }
      case ']': {
        const n = PALETTE_TYPES.length
        this.builder.paletteIndex = (this.builder.paletteIndex + 1) % n
        this.builder.selectType(PALETTE_TYPES[this.builder.paletteIndex])
        return true
      }
      case ' ':
      case 'space':
        this.builder.placeCell(this.cursorX, this.cursorY)
        return true
      case 'x':
        this.builder.removeCell(this.cursorX, this.cursorY)
        return true
      case '+':
      case '=':
        this.builder.adjustGridSize(1, 1)
        this.clampCursor()
        return true
      case '-':
        this.builder.adjustGridSize(-1, -1)
        this.clampCursor()
        return true
      case 'enter':
        if (!this.builder.hasAnyCells()) {
          // Refuse: a zero-cell ship would be a massless ghost. No-op silently.
          return true
        }
        this.callbacks.onSave(this.builder.getGrid())
        return true
      case 'escape':
        this.callbacks.onCancel()
        return true
      default:
        return false
    }
  }

  render(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    drawBuilderChrome(c2d, w, h)
    const layout = computeBuilderLayout(w, h, this.builder.grid.width, this.builder.grid.height)
    drawBuilderGrid(c2d, layout, this.builder, this.cursorX, this.cursorY)
    drawBuilderPalette(c2d, layout, this.builder.paletteIndex)
    drawBuilderStats(c2d, layout, this.builder)
  }
}
