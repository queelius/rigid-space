import yaml from 'js-yaml'
import { Type, typeFromName } from '../engine/types'
import type { Builder } from './builder'

export interface TradeItem {
  name: string
  type: Type
  buyPrice: number
  sellPrice: number
}

export interface TradeState {
  credits: number
  inventory: Map<number, number>  // references builder.inventory
}

interface TradeYamlItem {
  name: string
  type: string
  buy_price: number
  sell_price: number
}

interface TradeYaml {
  items: TradeYamlItem[]
  starting_credits: number
}

let _tradeItems: TradeItem[] | null = null
let _startingCredits = 500

/** Load trade config from YAML */
export async function loadTradeConfig(): Promise<void> {
  try {
    const text = await fetch('/assets/config/trade.yaml').then(r => r.text())
    const cfg = yaml.load(text) as TradeYaml
    _startingCredits = cfg.starting_credits ?? 500
    _tradeItems = cfg.items.map(item => ({
      name: item.name,
      type: typeFromName(item.type) ?? Type.ROCK,
      buyPrice: item.buy_price,
      sellPrice: item.sell_price,
    }))
  } catch {
    // Fallback trade items
    _tradeItems = [
      { name: 'Iron Plating', type: Type.IRON, buyPrice: 10, sellPrice: 5 },
      { name: 'Carbon Fiber', type: Type.CARBON, buyPrice: 8, sellPrice: 4 },
      { name: 'Fuel Cell', type: Type.FUEL, buyPrice: 5, sellPrice: 2 },
      { name: 'Crystal Shard', type: Type.CRYSTAL, buyPrice: 20, sellPrice: 12 },
      { name: 'Reactor Core', type: Type.REACTOR, buyPrice: 50, sellPrice: 30 },
      { name: 'Exotic Matter', type: Type.EXOTIC, buyPrice: 100, sellPrice: 60 },
      { name: 'Hyperdrive Core', type: Type.DRIVECORE, buyPrice: 2000, sellPrice: 800 },
    ]
  }
}

export function getTradeItems(): TradeItem[] {
  return _tradeItems ?? []
}

export function getStartingCredits(): number {
  return _startingCredits
}

export function buyItem(state: TradeState, item: TradeItem, _builder: Builder): boolean {
  if (state.credits < item.buyPrice) return false
  state.credits -= item.buyPrice
  state.inventory.set(item.type, (state.inventory.get(item.type) ?? 0) + 1)
  return true
}

export function sellItem(state: TradeState, item: TradeItem, _builder: Builder): boolean {
  const count = state.inventory.get(item.type) ?? 0
  if (count <= 0) return false
  state.credits += item.sellPrice
  state.inventory.set(item.type, count - 1)
  return true
}

/** Render trade menu on HUD canvas */
export function renderTradeMenu(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  state: TradeState,
  selectedIndex: number,
): void {
  const items = getTradeItems()
  if (items.length === 0) return

  const boxW = Math.min(450, w - 40)
  const lineH = 22
  const boxH = 60 + items.length * lineH + 40
  const boxX = (w - boxW) / 2
  const boxY = (h - boxH) / 2

  // Background
  ctx.fillStyle = 'rgba(10,15,30,0.92)'
  ctx.fillRect(boxX, boxY, boxW, boxH)
  ctx.strokeStyle = 'rgba(100,200,100,0.6)'
  ctx.lineWidth = 1
  ctx.strokeRect(boxX, boxY, boxW, boxH)

  // Title
  ctx.fillStyle = '#6f6'
  ctx.font = 'bold 16px monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText('TRADE TERMINAL', boxX + boxW / 2, boxY + 8)

  // Credits
  ctx.fillStyle = '#ff0'
  ctx.font = '13px monospace'
  ctx.fillText(`Credits: ${state.credits}`, boxX + boxW / 2, boxY + 28)
  ctx.textAlign = 'left'

  // Item list
  const listY = boxY + 50
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const y = listY + i * lineH
    const count = state.inventory.get(item.type) ?? 0
    const isSelected = i === selectedIndex

    // Selection highlight
    if (isSelected) {
      ctx.fillStyle = 'rgba(100,200,100,0.15)'
      ctx.fillRect(boxX + 4, y - 2, boxW - 8, lineH)
    }

    // Item number
    ctx.fillStyle = isSelected ? '#fff' : '#888'
    ctx.font = '12px monospace'
    ctx.fillText(`${i + 1}.`, boxX + 10, y)

    // Item name
    ctx.fillStyle = isSelected ? '#fff' : '#ccc'
    ctx.fillText(item.name, boxX + 30, y)

    // Inventory count
    ctx.fillStyle = count > 0 ? '#6f6' : '#555'
    ctx.fillText(`x${count}`, boxX + 180, y)

    // Buy price
    ctx.fillStyle = state.credits >= item.buyPrice ? '#ff0' : '#a55'
    ctx.fillText(`Buy:${item.buyPrice}`, boxX + 230, y)

    // Sell price
    ctx.fillStyle = count > 0 ? '#0f0' : '#555'
    ctx.fillText(`Sell:${item.sellPrice}`, boxX + 330, y)
  }

  // Controls hint
  ctx.fillStyle = '#666'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('1-6:select  B:buy  S:sell  T:close', boxX + boxW / 2, boxY + boxH - 18)
  ctx.textAlign = 'left'
}
