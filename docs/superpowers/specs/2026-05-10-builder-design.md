# Builder Integration: Design Spec

**Date:** 2026-05-10
**Scope:** Phase 4 of the post-foundation roadmap. Wire the existing `Builder` data class to a `BuilderState` ScreenState that owns rendering and input. Press `B` in-game to edit the ship's grid; `Enter` saves and respawns; `Esc` cancels.

## Summary

Replace the 30-line stub at `src/game/states/builder.ts` with a real `BuilderState` ScreenState. On entry, clone the ship's `GridComposite`, hand it to the existing `Builder` data class via `startShipEdit`, and present a keyboard-driven editor: arrow keys move a cursor on the grid, `[`/`]` cycle the selected cell type, `Space` places, `X` removes, `+`/`-` resize the grid, `Enter` saves (despawns the current ship and spawns a new one with the edited grid at the same position/rotation), `Esc` discards. The `B` key in `GameHUD` pushes `BuilderState`. A new `lifecycle.respawnShip` helper handles the despawn+respawn atomically.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edit mode | Edit current ship in place | Most natural "modify my ship" loop (user pick: a) |
| Inventory | Free placement (no consumption) | Sandbox feel; defer mining/scavenging gameplay (user pick: a) |
| Grid resizing | `+` / `-` keys via `Builder.adjustGridSize(1, 1)` and `(-1, -1)` | Symmetric resize keeps UI simple (user pick: b) |
| Input model | Keyboard-only with on-grid cursor | No mouse infra needed; `ScreenStack.handleKey` is sufficient (user pick: a) |
| Edit isolation | Clone grid on entry; replace on save | Cancel is trivial (drop the clone). Original grid only changes on save. |
| Cursor start | Grid center | Predictable; user can immediately place at the middle |
| Default selected type | `Type.IRON` (Builder's existing default) | Matches existing Builder constructor |
| Palette UI | Horizontal strip at bottom of screen, all 20 types | At-a-glance browse; `[`/`]` highlights move through it |
| Stats panel | Right of grid | Uses existing `computeShipStats(grid)` |
| Pauses physics | yes (`pausesPhysics = true`) | Editing should freeze the world |
| Save behavior | Despawn + respawn at original position/rotation, velocity zero | Clean atomic swap; preserves where the ship was |
| Builder features deferred | `startCreate`, `startPlacement`, blueprint I/O, image import, mirror, clearGrid | Out of scope for v1; data class supports them but UI does not expose |

## Module Map

### Files to create

| File | Purpose | LOC |
|------|---------|-----|
| `src/render/builder-renderer.ts` | Pure helpers: layout geometry, palette draw, grid draw, stats draw | ~150 |
| `src/render/builder-renderer.test.ts` | Tests for layout math and per-section call counts | ~120 |

### Files to modify

| File | Change |
|------|--------|
| `src/game/states/builder.ts` | Replace stub with full `BuilderState` class. Owns cursor position, selected type index, builder reference, callbacks. `render()` calls into `builder-renderer.ts`. `handleKey` dispatches arrows/[`/`]/Space/X/+/-/Enter/Esc. |
| `src/game/states/builder.test.ts` | New test file. Tests cursor movement, type cycling, place/remove/resize delegation, save/cancel callbacks. |
| `src/game/states/game-hud.ts` | Add `'b'` to `handleKey`. Calls a new `onBuild` callback (DI). |
| `src/game/states/game-hud.test.ts` | Add 1 test verifying `onBuild` fires on `B`. |
| `src/game/lifecycle.ts` | Add `respawnShip(ctx, grid, position, rotation)` helper. |
| `src/game/lifecycle.test.ts` | Add 2 tests verifying respawnShip clears old ship and spawns new with edited grid. |
| `src/main.ts` | Wire `onBuild` callback in `makeGameHUD` to push `BuilderState`. BuilderState's `onSave` calls `respawnShip`. |
| `src/engine/grid-composite.ts` | Add `clone(): GridComposite` method (single-line `return GridComposite.fromJSON(this.toJSON())`). |
| `src/engine/grid-composite.test.ts` | Add 2 tests for clone (independence + structural equality). |

### Files unchanged

`src/game/builder.ts` (existing data class), `src/render/sprite-body-renderer.ts` (`onBodyAdded` re-bakes texture from the new grid automatically).

## API

```typescript
// src/game/states/builder.ts (NEW)

import type { ScreenState } from '../screen-stack'
import type { Builder } from '../builder'
import type { GridComposite } from '../../engine/grid-composite'

export interface BuilderStateCallbacks {
  /** Called with the edited grid when user presses Enter. */
  onSave: (newGrid: GridComposite) => void
  /** Called with no args when user presses Esc. */
  onCancel: () => void
}

export class BuilderState implements ScreenState {
  name = 'builder'
  pausesPhysics = true

  cursorX = 0
  cursorY = 0
  paletteIndex = 0  // index into TYPE_PALETTE (which is just Type 0..N-1)

  private builder: Builder
  private callbacks: BuilderStateCallbacks

  constructor(builder: Builder, callbacks: BuilderStateCallbacks)

  update(_dt: number): void
  handleInput(_action: string): boolean
  handleKey(key: string): boolean
  render(c2d: CanvasRenderingContext2D, w: number, h: number): void
}
```

```typescript
// src/render/builder-renderer.ts (NEW)

import type { Builder } from '../game/builder'
import { Type } from '../engine/types'

/** All cell types that appear in the palette, in display order. */
export const PALETTE_TYPES: number[] = [
  Type.ROCK, Type.IRON, Type.CARBON, Type.FUEL, Type.THRUSTER,
  Type.CRYSTAL, Type.EXPLOSIVE, Type.WATER, Type.EXOTIC, Type.EMITTER,
  Type.COCKPIT, Type.CARGO, Type.REACTOR, Type.SOIL, Type.PLANT,
  Type.ICE, Type.SAND, Type.LAVA, Type.DRIVECORE,
]

export interface BuilderLayout {
  gridX: number; gridY: number; gridW: number; gridH: number
  cellPx: number  // pixel size of one grid cell in the editor view
  paletteX: number; paletteY: number
  paletteCellPx: number
  statsX: number; statsY: number
}

/** Compute layout for a screen of (w, h) and a grid of (cols, rows). */
export function computeBuilderLayout(w: number, h: number, cols: number, rows: number): BuilderLayout

/** Draw the editor grid with cursor highlight. */
export function drawBuilderGrid(
  c2d: CanvasRenderingContext2D, layout: BuilderLayout, builder: Builder,
  cursorX: number, cursorY: number,
): void

/** Draw the palette strip with selection indicator. */
export function drawBuilderPalette(
  c2d: CanvasRenderingContext2D, layout: BuilderLayout, paletteIndex: number,
): void

/** Draw the stats panel. */
export function drawBuilderStats(
  c2d: CanvasRenderingContext2D, layout: BuilderLayout, builder: Builder,
): void

/** Draw control hints + title. */
export function drawBuilderChrome(
  c2d: CanvasRenderingContext2D, w: number, h: number,
): void
```

```typescript
// src/game/lifecycle.ts (additions)

/**
 * Despawn the current ship and spawn a new one with the given grid at the
 * given position/rotation, with velocity zero. ctx.ship is updated. The
 * renderer is notified via onBodyRemoved (old ship) then onBodyAdded (new ship).
 */
export function respawnShip(
  ctx: GameContext,
  newGrid: GridComposite,
  position: { x: number; y: number },
  rotation: number,
): void
```

```typescript
// src/engine/grid-composite.ts (addition)

class GridComposite {
  // ... existing
  clone(): GridComposite {
    return GridComposite.fromJSON(this.toJSON())
  }
}
```

## Layout

For an HUD canvas of `w x h`, the editor lays out as:

```
+----------------------------------------------------------+
|                       BUILDER                            |  <- title (top)
|                                                          |
|   +--------------------+   +-----------------------+     |
|   |                    |   | Stats:                |     |
|   |   GRID (cells)     |   | mass: 25              |     |
|   |   cursor: blue     |   | cells: 6              |     |
|   |   outline          |   | cockpit: yes          |     |
|   |                    |   | thrust/wt: 0.40       |     |
|   +--------------------+   +-----------------------+     |
|                                                          |
|   +--------------------------------------+               |
|   | [palette: 20 colored squares]        |               |  <- palette strip
|   |    selected: highlighted box         |               |
|   +--------------------------------------+               |
|                                                          |
|  Arrows: move cursor   [/]: type   Space: place   X: remove
|  +/-: resize grid   Enter: save   Esc: cancel              <- hints
+----------------------------------------------------------+
```

`computeBuilderLayout(w, h, cols, rows)` returns concrete pixel coordinates. Grid takes the largest centered square that fits in the upper 60% of screen height; `cellPx` is `min(maxGridSide / cols, maxGridSide / rows)`.

## Cursor + selection state

`BuilderState` owns:
- `cursorX, cursorY: number` (grid coords). Clamped to `[0, builder.grid.width-1]` and `[0, builder.grid.height-1]` after every move and after every resize.
- `paletteIndex: number` (index into `PALETTE_TYPES`). Wraps at boundaries.

Builder owns selectedType (via `Builder.selectType(type)`). BuilderState calls `builder.selectType(PALETTE_TYPES[paletteIndex])` whenever paletteIndex changes.

## Key bindings

| Key | Action |
|-----|--------|
| `arrowleft` / `a` | cursor left |
| `arrowright` / `d` | cursor right |
| `arrowup` / `w` | cursor up |
| `arrowdown` / `s` | cursor down |
| `[` | paletteIndex - 1 (wraps to last) |
| `]` | paletteIndex + 1 (wraps to first) |
| `space` | `builder.placeCell(cursorX, cursorY)` |
| `x` | `builder.removeCell(cursorX, cursorY)` |
| `+` or `=` | `builder.adjustGridSize(+1, +1)` then clamp cursor |
| `-` | `builder.adjustGridSize(-1, -1)` then clamp cursor (min 3x3 enforced by adjustGridSize) |
| `enter` | `callbacks.onSave(builder.getGrid())` |
| `escape` | `callbacks.onCancel()` |

Returns `true` for any handled key, `false` otherwise.

Note: `arrowup`/`w` should map to "decrease cursorY" because `gy=0` is the BOTTOM of the body grid (per the established convention from Phase 1+). So `arrowup` decreases `cursorY` (moves toward grid top, which is `gy=height-1`)? Wait, that's backward.

Actually, in the body grid: `gy=0` is the bottom (per `localY = (gy - height/2 + 0.5) * cellScale`, smaller gy = smaller localY = lower in body Y-up). So in the editor, we display `gy=0` at the BOTTOM of the editor grid view to match how the ship looks in-world (cockpit at top of grid is gy=height-1).

So `arrowup` (move toward visual top of editor) means **increase cursorY** (toward gy=height-1 which is at editor top).

Let me re-derive for clarity:
- Editor displays `gy=0` at bottom row of the visible grid.
- Editor displays `gy=height-1` at top row of the visible grid.
- `arrowup` should move cursor toward the top of the editor visually, i.e., **increase cursorY** (toward height-1).
- `arrowdown` should **decrease cursorY** (toward 0).
- `arrowleft` decreases `cursorX`; `arrowright` increases `cursorX`.

In the render code, the cursor's pixel position is `cellY = layout.gridY + (rows - 1 - cursorY) * cellPx` (Y-flip: gy=0 at bottom of the visible grid → high pixel Y).

## Save/respawn flow

In `main.ts`'s `makeGameHUD`, the new `onBuild` callback:

```typescript
function onBuild(): void {
  if (!ctx.ship) return
  const originalShip = ctx.ship
  const originalPosition = originalShip.position()
  const originalRotation = originalShip.rotation()
  const editableGrid = originalShip.spawned.grid.clone()

  // Configure builder for ship edit on the cloned grid.
  builder.startShipEdit(editableGrid)

  ctx.screenStack.push(new BuilderState(builder, {
    onSave: (newGrid) => {
      respawnShip(ctx, newGrid, originalPosition, originalRotation)
      ctx.screenStack.pop()
    },
    onCancel: () => {
      ctx.screenStack.pop()
    },
  }))
}
```

`builder` is a single shared instance constructed once at boot (so `paletteIndex` and selectedType persist across edit sessions).

## main.ts integration

```typescript
import { Builder } from './game/builder'
import { BuilderState } from './game/states/builder'

// Inside main():
const builder = new Builder()

function onBuild(): void {
  if (!ctx.ship) return
  const originalPosition = ctx.ship.position()
  const originalRotation = ctx.ship.rotation()
  const editableGrid = ctx.ship.spawned.grid.clone()
  builder.startShipEdit(editableGrid)
  ctx.screenStack.push(new BuilderState(builder, {
    onSave: (newGrid) => {
      respawnShip(ctx, newGrid, originalPosition, originalRotation)
      ctx.screenStack.pop()
    },
    onCancel: () => ctx.screenStack.pop(),
  }))
}

function makeGameHUD(): GameHUD {
  // Existing setup, plus the new onBuild callback:
  return new GameHUD(viewModel, { onPause: pushPauseMenu, onBuild }, minimap)
}
```

GameHUD callbacks shape becomes:
```typescript
export interface GameHUDCallbacks {
  onPause: () => void
  onBuild: () => void  // NEW
}
```

GameHUD.handleKey adds:
```typescript
if (key === 'b') {
  this.callbacks.onBuild()
  return true
}
```

## Tests

### `grid-composite.test.ts` (additions)

1. `clone produces a structurally equal grid`
2. `clone is independent of the original` (modify clone, original unchanged)

### `builder-renderer.test.ts` (new)

Use mock CanvasRenderingContext2D similar to `minimap.test.ts`.

3. `computeBuilderLayout: grid is square in upper-60% of screen`
4. `computeBuilderLayout: cellPx fits both dimensions`
5. `drawBuilderGrid: writes one fillRect per cell + cursor highlight`
6. `drawBuilderPalette: writes 19 cells (PALETTE_TYPES.length) + selection box`
7. `drawBuilderStats: writes fillText calls including 'mass:' and 'cells:'`
8. `drawBuilderChrome: writes title 'BUILDER' and at least one hint line`

### `builder.test.ts` (state class, new file at `src/game/states/builder.test.ts`)

9. `cursor moves with arrow keys` (verify cursorX/cursorY change)
10. `cursor clamps to grid bounds`
11. `cursor follows Y-flip convention: arrowup increases cursorY`
12. `[ and ] cycle paletteIndex (wrapping)`
13. `palette change updates builder.selectedType`
14. `space calls builder.placeCell at cursor`
15. `x calls builder.removeCell at cursor`
16. `+ and - call builder.adjustGridSize`
17. `enter calls onSave with builder.getGrid()`
18. `escape calls onCancel`
19. `unknown keys return false`

### `lifecycle.test.ts` (additions)

20. `respawnShip clears old ship and spawns new with edited grid`
21. `respawnShip preserves position and rotation`
22. `respawnShip notifies renderer (onBodyRemoved + onBodyAdded)`

### `game-hud.test.ts` (addition)

23. `B key invokes onBuild callback`

## Risks / open questions

1. **Cursor convention drift**: I'm using "arrowup increases cursorY (Y-up convention matching the body grid)". This conflicts with image-Y-down conventions which most graphics code uses. The test `cursor follows Y-flip convention: arrowup increases cursorY` pins this. If a future contributor changes to Y-down for the editor, the test fails loudly.

2. **`builder` is shared across edits**: same instance reused across builder sessions. `paletteIndex` and the selected type persist between sessions, which is good UX (no need to re-select your favorite type each time). But the `grid` reference needs to be replaced via `startShipEdit(clone)` on every entry, otherwise the second session starts with last session's grid.

3. **Builder.devMode**: the existing constructor checks `?dev=1` and enables dev features. We're using infinite-inventory mode by default (`_enableDevInventory()` is called unconditionally in the constructor). Dev mode adds nothing else relevant to v1.

4. **Re-baking sprite preserves Phase 3 wiring**: respawnShip calls `ctx.renderer.onBodyAdded(entry)` after registering the new body. SpriteBodyRenderer bakes a fresh texture from the new grid; old sprite was destroyed in `onBodyRemoved`. No memory leak (Critical issue from Phase 3 review was already fixed).

5. **Cursor outline visibility on bright cells**: cursor highlight is drawn as a thicker rectangle outline. On a green cockpit cell, a green outline would be invisible. Use a contrasting bright color (e.g. white) and draw both an outer and inner stroke for visibility on any background.

6. **No undo within edit session**: cancel discards everything; save commits everything. No per-action undo. Acceptable for v1; an undo stack is out of scope.

7. **Resize edge effect**: `Builder.adjustGridSize(dw, dh)` only grows from the right and bottom (it copies cells fitting in the new dimensions). When you grow with `+`, the new column appears on the right; new row on the bottom. When you shrink with `-`, cells in the rightmost column / bottommost row are LOST. Not undoable; document in the hint text or accept silently.

8. **Save on ship with no cockpit**: the existing `Builder.computeShipStats(grid)` reports `hasCockpit: false`. The save proceeds anyway; the resulting ship spawns and physics works, but the player loses controls (no cockpit means no thrust/rotation? Actually no, cockpit doesn't affect controls in current code; the Ship class works regardless of grid contents. Just renders weirdly without a cockpit.). Could add a "validate before save" check; for v1 skip and accept ships with any composition.

## Out of scope (deferred)

- Mouse input (click to place, drag to paint).
- Builder's create-mode / placement-mode (build new composites and place them in the world).
- Blueprint save/load (UI affordance for `Builder.saveBlueprint` / `loadBlueprint`).
- Image import (UI affordance for `Builder.importImage`).
- Cell facing rotation (Builder supports facing per cell; not exposed in v1 UI).
- Mirror tool (Builder.mirrorHorizontal exists; defer).
- Clear grid shortcut (Builder.clearGrid exists; defer).
- Per-action undo / redo.
- Inventory consumption (collect cells from mining; place consumes from inventory).
- Cell validation on save (require cockpit, etc.).
