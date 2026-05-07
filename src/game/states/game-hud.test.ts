import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameHUD, type GameHUDViewModel } from './game-hud'

describe('GameHUD', () => {
  let onPause: ReturnType<typeof vi.fn<() => void>>
  let viewModel: GameHUDViewModel
  let hud: GameHUD

  beforeEach(() => {
    onPause = vi.fn()
    viewModel = {
      bodyCount: () => 22,
      shipSpeed: () => 100,
      shipMaxSpeed: () => 250,
      shipPosition: () => ({ x: 500, y: 0 }),
    }
    hud = new GameHUD(viewModel, { onPause })
  })

  it('has pausesPhysics false', () => {
    expect(hud.pausesPhysics).toBe(false)
  })

  it('Esc invokes onPause and returns true', () => {
    expect(hud.handleKey('escape')).toBe(true)
    expect(onPause).toHaveBeenCalledOnce()
  })

  it('non-Esc keys return false and do not invoke onPause', () => {
    expect(hud.handleKey('w')).toBe(false)
    expect(hud.handleKey('a')).toBe(false)
    expect(hud.handleKey('enter')).toBe(false)
    expect(onPause).not.toHaveBeenCalled()
  })

  it('render reads ship state from the view model', () => {
    const fillTextCalls: Array<[string, number, number]> = []
    const fakeCtx = {
      fillStyle: '',
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      fillText: (text: string, x: number, y: number) => {
        fillTextCalls.push([text, x, y])
      },
    } as unknown as CanvasRenderingContext2D

    hud.render(fakeCtx, 800, 600)

    const allText = fillTextCalls.map(c => c[0]).join('\n')
    expect(allText).toContain('Speed: 100 / 250')
    expect(allText).toContain('Pos: 500, 0')
    expect(allText).toContain('Bodies: 22')
  })
})
