import type { ScreenState } from '../screen-stack'

export interface PauseMenuCallbacks {
  onResume: () => void
  onQuitToMain: () => void
}

interface MenuItem {
  label: string
  action: () => void
}

export class PauseMenu implements ScreenState {
  name = 'pause-menu'
  pausesPhysics = true
  selectedIndex = 0

  private readonly resumeAction: () => void
  private readonly items: MenuItem[]

  constructor(callbacks: PauseMenuCallbacks) {
    this.resumeAction = callbacks.onResume
    this.items = [
      { label: 'Resume', action: callbacks.onResume },
      { label: 'Quit to Main', action: callbacks.onQuitToMain },
    ]
  }

  /** Public read-only view of labels for any external observer or test. */
  get options(): readonly string[] {
    return this.items.map(i => i.label)
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
    if (key === 'escape') {
      // Direct Resume on Esc, regardless of which item is selected.
      // (Esc is the canonical "back out" gesture in pause menus.)
      this.resumeAction()
      return true
    }
    if (key === 'arrowup' || key === 'w') {
      this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length
      return true
    }
    if (key === 'arrowdown' || key === 's') {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length
      return true
    }
    if (key === 'enter' || key === ' ') {
      this.items[this.selectedIndex].action()
      return true
    }
    return false
  }

  render(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    // Semi-transparent dim overlay over the live HUD/world
    c2d.fillStyle = 'rgba(0, 0, 0, 0.6)'
    c2d.fillRect(0, 0, w, h)

    c2d.fillStyle = '#ffffff'
    c2d.font = 'bold 36px monospace'
    c2d.textAlign = 'center'
    c2d.fillText('PAUSED', w / 2, h / 2 - 60)

    c2d.font = '20px monospace'
    this.items.forEach((item, i) => {
      c2d.fillStyle = i === this.selectedIndex ? '#ffdd44' : '#aaaaaa'
      const prefix = i === this.selectedIndex ? '> ' : '  '
      c2d.fillText(prefix + item.label, w / 2, h / 2 + i * 40)
    })

    c2d.font = '14px monospace'
    c2d.fillStyle = '#666'
    c2d.fillText('Esc to resume', w / 2, h / 2 + 120)
  }
}
