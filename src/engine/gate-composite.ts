import { GridComposite } from './grid-composite'
import { Type } from './types'

const GATE_COLOR = 0x00CCFF  // cyan glow

/**
 * Create a ring-shaped GridComposite for a stargate.
 * Cells where innerRadius <= distance_from_center <= outerRadius are filled with EXOTIC.
 */
export function createGateRing(outerRadius = 11, innerRadius = 7): GridComposite {
  const size = outerRadius * 2 + 1
  const grid = new GridComposite(size, size)
  grid.colors = new Uint32Array(size * size)

  const cx = outerRadius
  const cy = outerRadius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= innerRadius && dist <= outerRadius) {
        grid.set(x, y, Type.EXOTIC)
        grid.colors[y * size + x] = GATE_COLOR
      }
    }
  }

  return grid
}
