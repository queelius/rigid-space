import { describe, it, expect } from 'vitest'
import { ScreenStack, type ScreenState } from './screen-stack'

function makeState(name: string, pausesPhysics: boolean): ScreenState {
  return {
    name,
    pausesPhysics,
    update: () => {},
    render: () => {},
    handleInput: () => false,
  }
}

describe('ScreenStack.paused', () => {
  it('returns false on empty stack', () => {
    expect(new ScreenStack().paused).toBe(false)
  })

  it('returns false when only non-pausing states are stacked', () => {
    const stack = new ScreenStack()
    stack.push(makeState('hud', false))
    expect(stack.paused).toBe(false)
  })

  it('returns true when any state in stack pauses physics', () => {
    const stack = new ScreenStack()
    stack.push(makeState('hud', false))
    stack.push(makeState('pause', true))
    expect(stack.paused).toBe(true)
  })

  it('reverts to false after popping the pausing state', () => {
    const stack = new ScreenStack()
    stack.push(makeState('hud', false))
    stack.push(makeState('pause', true))
    stack.pop()
    expect(stack.paused).toBe(false)
  })

  it('is true with multiple pausing states stacked', () => {
    const stack = new ScreenStack()
    stack.push(makeState('main-menu', true))
    stack.push(makeState('settings', true))
    expect(stack.paused).toBe(true)
  })
})
