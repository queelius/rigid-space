import type { ScreenState } from '../screen-stack'

export interface MainMenuCallbacks {
  onStart: () => void
  onQuit: () => void
}

interface MenuItem {
  label: string
  action: () => void
}

export class MainMenu implements ScreenState {
  name = 'main-menu'
  pausesPhysics = true
  selectedIndex = 0

  private readonly items: MenuItem[]

  constructor(callbacks: MainMenuCallbacks) {
    this.items = [
      { label: 'Start', action: callbacks.onStart },
      { label: 'Quit', action: callbacks.onQuit },
    ]
  }

  /** Public read-only view of the labels (kept for any external observer or test). */
  get options(): readonly string[] {
    return this.items.map(i => i.label)
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
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
    c2d.fillStyle = '#050510'
    c2d.fillRect(0, 0, w, h)

    c2d.fillStyle = '#fff'
    c2d.font = 'bold 48px monospace'
    c2d.textAlign = 'center'
    c2d.fillText('RIGID SPACE', w / 2, h / 2 - 80)

    c2d.font = '20px monospace'
    this.items.forEach((item, i) => {
      c2d.fillStyle = i === this.selectedIndex ? '#ffdd44' : '#aaaaaa'
      const prefix = i === this.selectedIndex ? '> ' : '  '
      c2d.fillText(prefix + item.label, w / 2, h / 2 + i * 40)
    })

    c2d.font = '14px monospace'
    c2d.fillStyle = '#666'
    c2d.fillText('arrows or W/S to navigate, Enter to select', w / 2, h - 40)
  }
}
