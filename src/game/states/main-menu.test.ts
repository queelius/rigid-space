import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MainMenu } from './main-menu'

describe('MainMenu', () => {
  let onStart: ReturnType<typeof vi.fn<() => void>>
  let onQuit: ReturnType<typeof vi.fn<() => void>>
  let menu: MainMenu

  beforeEach(() => {
    onStart = vi.fn()
    onQuit = vi.fn()
    menu = new MainMenu({ onStart, onQuit })
  })

  it('has pausesPhysics true', () => {
    expect(menu.pausesPhysics).toBe(true)
  })

  it('starts with selectedIndex 0 (Start)', () => {
    expect(menu.selectedIndex).toBe(0)
  })

  it('arrowdown moves selection forward', () => {
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(1)
  })

  it('arrowup wraps from first to last', () => {
    menu.handleKey('arrowup')
    expect(menu.selectedIndex).toBe(1)  // last option (Quit)
  })

  it('arrowdown wraps from last to first', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(0)
  })

  it('w/s also navigate', () => {
    menu.handleKey('s')
    expect(menu.selectedIndex).toBe(1)
    menu.handleKey('w')
    expect(menu.selectedIndex).toBe(0)
  })

  it('Enter on Start calls onStart', () => {
    menu.handleKey('enter')
    expect(onStart).toHaveBeenCalled()
    expect(onQuit).not.toHaveBeenCalled()
  })

  it('Space on Start calls onStart', () => {
    menu.handleKey(' ')
    expect(onStart).toHaveBeenCalled()
  })

  it('Enter on Quit calls onQuit', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('enter')
    expect(onQuit).toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('returns true for handled keys, false for others', () => {
    expect(menu.handleKey('arrowdown')).toBe(true)
    expect(menu.handleKey('q')).toBe(false)
  })
})
