import { describe, it, expect } from 'vitest'
import { GridComposite, Direction } from './grid-composite'
import { Type } from './types'

describe('GridComposite', () => {
  it('set and get a cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    const cell = grid.get(1, 1)
    expect(cell).not.toBeNull()
    expect(cell!.type).toBe(Type.ROCK)
    expect(cell!.facing).toBe(Direction.UP)
  })

  it('set with facing', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.EMITTER, Direction.RIGHT)
    expect(grid.get(0, 0)!.facing).toBe(Direction.RIGHT)
  })

  it('get returns null for empty cell', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.get(0, 0)).toBeNull()
  })

  it('get returns null for out-of-bounds', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.get(-1, 0)).toBeNull()
    expect(grid.get(3, 0)).toBeNull()
    expect(grid.get(0, -1)).toBeNull()
    expect(grid.get(0, 3)).toBeNull()
  })

  it('clear removes a cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    grid.clear(1, 1)
    expect(grid.get(1, 1)).toBeNull()
  })

  it('countType counts matching cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.FUEL)
    grid.set(1, 0, Type.FUEL)
    grid.set(2, 0, Type.ROCK)
    expect(grid.countType(Type.FUEL)).toBe(2)
    expect(grid.countType(Type.ROCK)).toBe(1)
    expect(grid.countType(Type.IRON)).toBe(0)
  })

  it('edgeMask returns correct bits for exposed edges', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    const mask = grid.edgeMask(1, 1)
    expect(mask).toBe(0b1111)
  })

  it('edgeMask returns 0 for empty cell', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.edgeMask(1, 1)).toBe(0)
  })

  it('edgeMask hides edges adjacent to filled cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    grid.set(2, 1, Type.ROCK)
    const mask = grid.edgeMask(1, 1)
    expect(mask & 2).toBe(0)
    expect(mask & 1).toBe(1)
    expect(mask & 4).toBe(4)
    expect(mask & 8).toBe(8)
  })

  it('serialization round-trip preserves data', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.COCKPIT, Direction.DOWN)
    grid.set(2, 2, Type.FUEL)
    const json = grid.toJSON()
    const restored = GridComposite.fromJSON(json)
    expect(restored.width).toBe(3)
    expect(restored.height).toBe(3)
    expect(restored.get(0, 0)!.type).toBe(Type.COCKPIT)
    expect(restored.get(0, 0)!.facing).toBe(Direction.DOWN)
    expect(restored.get(2, 2)!.type).toBe(Type.FUEL)
    expect(restored.get(1, 1)).toBeNull()
  })

  it('hasFuelNeighbor detects 8-connected fuel cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.FUEL)
    grid.set(1, 1, Type.THRUSTER)
    expect(grid.hasFuelNeighbor(1, 1)).toBe(true)
    expect(grid.hasFuelNeighbor(2, 2)).toBe(false)
  })

  it('clone produces a structurally equal grid', () => {
    const original = new GridComposite(4, 5)
    original.set(0, 0, Type.COCKPIT, Direction.DOWN)
    original.set(1, 2, Type.FUEL, Direction.UP)
    original.set(3, 4, Type.THRUSTER, Direction.RIGHT)

    const copy = original.clone()
    expect(copy.width).toBe(original.width)
    expect(copy.height).toBe(original.height)
    for (let y = 0; y < original.height; y++) {
      for (let x = 0; x < original.width; x++) {
        const a = original.get(x, y)
        const b = copy.get(x, y)
        if (a === null) {
          expect(b).toBeNull()
        } else {
          expect(b).not.toBeNull()
          expect(b!.type).toBe(a.type)
          expect(b!.facing).toBe(a.facing)
        }
      }
    }
  })

  it('clone preserves per-cell color overrides', () => {
    const g = new GridComposite(3, 3)
    g.set(1, 1, Type.ROCK)
    // Set a per-cell color override via initColors and direct write.
    g.initColors()
    g.colors![1 * 3 + 1] = 0xff00ff
    const cloned = g.clone()
    expect(cloned.getCellColor(1, 1)).toBe(0xff00ff)
    // Mutating the clone's colors does not affect the original.
    cloned.colors![1 * 3 + 1] = 0x00ff00
    expect(g.getCellColor(1, 1)).toBe(0xff00ff)
  })

  it('clone is independent of the original (mutating clone leaves original unchanged)', () => {
    const original = new GridComposite(3, 3)
    original.set(1, 1, Type.IRON)

    const copy = original.clone()
    copy.set(0, 0, Type.ROCK)
    copy.clear(1, 1)

    // Original retains its IRON cell and has no ROCK at (0,0)
    expect(original.get(1, 1)!.type).toBe(Type.IRON)
    expect(original.get(0, 0)).toBeNull()

    // Mutating the original after cloning does not affect the clone either.
    original.set(2, 2, Type.FUEL)
    expect(copy.get(2, 2)).toBeNull()
  })
})
