import type { ScreenState } from '../screen-stack'
import { renderTradeMenu, getTradeItems, buyItem, sellItem, type TradeState } from '../trade'
import type { Builder } from '../builder'

export class TradeMenuState implements ScreenState {
  name = 'trade'
  pausesPhysics = true

  private tradeState: TradeState
  private builder: Builder
  private selectedIndex = 0
  private onClose: () => void

  constructor(tradeState: TradeState, builder: Builder, onClose: () => void) {
    this.tradeState = tradeState
    this.builder = builder
    this.onClose = onClose
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    renderTradeMenu(ctx, w, h, this.tradeState, this.selectedIndex)
  }

  handleInput(action: string): boolean {
    if (action === 'escape' || action === 'interact') {
      this.onClose()
      return true
    }
    return true  // consume all input while trade is open
  }

  handleKey(key: string): boolean {
    const num = parseInt(key)
    if (num >= 1 && num <= getTradeItems().length) {
      this.selectedIndex = num - 1
      return true
    }
    if (key === 'b') {
      const items = getTradeItems()
      if (this.selectedIndex < items.length) {
        buyItem(this.tradeState, items[this.selectedIndex], this.builder)
      }
      return true
    }
    if (key === 's') {
      const items = getTradeItems()
      if (this.selectedIndex < items.length) {
        sellItem(this.tradeState, items[this.selectedIndex], this.builder)
      }
      return true
    }
    return false
  }
}
