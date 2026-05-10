// Grid-based composite: 2D cell array for building composites.
// Physics-agnostic: the grid is just data. Spawning into a physics world
// is handled by rigid-spawn.ts (Rapier) or the original particles+bonds system.

import { Type, typeProps } from './types'

export enum Direction { UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3 }

// Direction vectors: UP points +Y (forward in grid space)
const DIR_DX = [0, 1, 0, -1] as const  // UP, RIGHT, DOWN, LEFT
const DIR_DY = [1, 0, -1, 0] as const

export interface Cell {
  type: Type
  facing: Direction
}

// 4-connected neighbor offsets (dx, dy)
// 8-connected: cardinal + diagonal neighbors for shear rigidity
const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [0, 1], [1, 0], [0, -1], [-1, 0],   // cardinal
  [1, 1], [1, -1], [-1, 1], [-1, -1],  // diagonal
]

interface CellJSON {
  type: number
  facing: number
}

interface GridJSON {
  width: number
  height: number
  cells: (CellJSON | null)[][]
}

export class GridComposite {
  width: number
  height: number
  cells: (Cell | null)[][]

  /** Optional per-cell color override (0xRRGGBB). null = use type's canonical color. */
  colors: Uint32Array | null = null

  // After spawning into a world:
  particleMap: Map<string, number> = new Map()  // "x,y" -> particle index
  cockpitIdx = -1

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = Array.from({ length: height }, () => Array<Cell | null>(width).fill(null))
  }

  /** Set a cell at grid position */
  set(x: number, y: number, type: Type, facing = Direction.UP): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    this.cells[y][x] = { type, facing }
  }

  /** Clear a cell at grid position */
  clear(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    this.cells[y][x] = null
  }

  /** Get a cell at grid position */
  get(x: number, y: number): Cell | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null
    return this.cells[y][x]
  }

  /** Initialize colors array lazily */
  initColors(): Uint32Array {
    if (!this.colors) {
      this.colors = new Uint32Array(this.width * this.height)
    }
    return this.colors
  }

  /** Get per-cell color, or null if not set */
  getCellColor(x: number, y: number): number | null {
    if (!this.colors) return null
    const idx = y * this.width + x
    return this.colors[idx] || null
  }

  /** Compute edge mask for a cell (which sides are exposed to empty space).
   *  bit0 = top(+Y), bit1 = right(+X), bit2 = bottom(-Y), bit3 = left(-X) */
  edgeMask(gx: number, gy: number): number {
    if (!this.get(gx, gy)) return 0
    let mask = 0
    if (!this.get(gx, gy + 1)) mask |= 1
    if (!this.get(gx + 1, gy)) mask |= 2
    if (!this.get(gx, gy - 1)) mask |= 4
    if (!this.get(gx - 1, gy)) mask |= 8
    return mask
  }

  /** Detect all emitters and their grid-space direction info */
  findEmitters(): { gridX: number; gridY: number; type: Type; facing: Direction }[] {
    const result: { gridX: number; gridY: number; type: Type; facing: Direction }[] = []
    for (let gy = 0; gy < this.height; gy++) {
      for (let gx = 0; gx < this.width; gx++) {
        const cell = this.cells[gy][gx]
        if (cell && cell.type === Type.EMITTER) {
          result.push({ gridX: gx, gridY: gy, type: cell.type, facing: cell.facing })
        }
      }
    }
    return result
  }

  /** Count cells of a given type */
  countType(type: Type): number {
    let count = 0
    for (let gy = 0; gy < this.height; gy++) {
      for (let gx = 0; gx < this.width; gx++) {
        const cell = this.cells[gy][gx]
        if (cell && cell.type === type) count++
      }
    }
    return count
  }

  /** Check if a cell has a fuel neighbor (8-connected) */
  hasFuelNeighbor(x: number, y: number): boolean {
    for (const [ndx, ndy] of NEIGHBOR_OFFSETS) {
      const cell = this.get(x + ndx, y + ndy)
      if (cell && cell.type === Type.FUEL) return true
    }
    return false
  }

  /** Serialize to JSON blueprint */
  toJSON(): GridJSON {
    const cells: (CellJSON | null)[][] = this.cells.map(row =>
      row.map(cell => cell ? { type: cell.type as number, facing: cell.facing as number } : null)
    )
    return { width: this.width, height: this.height, cells }
  }

  /** Clone this grid via toJSON/fromJSON round-trip. Independent copy. */
  clone(): GridComposite {
    return GridComposite.fromJSON(this.toJSON())
  }

  /** Deserialize from JSON */
  static fromJSON(data: unknown): GridComposite {
    const d = data as GridJSON
    const grid = new GridComposite(d.width, d.height)
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const c = d.cells[y]?.[x]
        if (c) {
          grid.set(x, y, c.type as Type, c.facing as Direction)
        }
      }
    }
    return grid
  }

  /** Get direction vector for a Direction enum value */
  static directionDx(d: Direction): number { return DIR_DX[d] }
  static directionDy(d: Direction): number { return DIR_DY[d] }
}
