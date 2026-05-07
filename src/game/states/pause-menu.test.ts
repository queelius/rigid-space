import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PauseMenu } from './pause-menu'

describe('PauseMenu', () => {
  let onResume: ReturnType<typeof vi.fn<() => void>>
  let onQuitToMain: ReturnType<typeof vi.fn<() => void>>
  let menu: PauseMenu

  beforeEach(() => {
    onResume = vi.fn<() => void>()
    onQuitToMain = vi.fn<() => void>()
    menu = new PauseMenu({ onResume, onQuitToMain })
  })

  it('has pausesPhysics true', () => {
    expect(menu.pausesPhysics).toBe(true)
  })

  it('starts with Resume selected', () => {
    expect(menu.selectedIndex).toBe(0)
  })

  it('Esc invokes onResume', () => {
    expect(menu.handleKey('escape')).toBe(true)
    expect(onResume).toHaveBeenCalled()
  })

  it('Enter on Resume invokes onResume', () => {
    menu.handleKey('enter')
    expect(onResume).toHaveBeenCalled()
    expect(onQuitToMain).not.toHaveBeenCalled()
  })

  it('Enter on Quit to Main invokes onQuitToMain', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('enter')
    expect(onQuitToMain).toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
  })

  it('arrow nav wraps', () => {
    menu.handleKey('arrowup')
    expect(menu.selectedIndex).toBe(1)
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(0)
  })

  it('Space on Resume also invokes onResume', () => {
    expect(menu.handleKey(' ')).toBe(true)
    expect(onResume).toHaveBeenCalled()
  })
})
